/**
 * auth.js
 *
 * Google OAuth 登入 / 登出 / session / 管理員判定。
 *   - window.SBAuth.signInWithGoogle(redirectTo)
 *   - window.SBAuth.signOut()
 *   - window.SBAuth.getSession()
 *   - window.SBAuth.getUser()
 *   - window.SBAuth.isAdmin()      → Promise<boolean>（呼叫後端 is_admin RPC）
 *   - window.SBAuth.onChange(cb)
 *
 * 管理員權限「只由後端 RLS + is_admin() 決定」，前端無法偽造：
 * 即使有人改前端讓後台介面出現，沒有白名單身分，任何寫入都會被 RLS 擋下。
 */
(function () {
  "use strict";

  var callbackHandled = false;
  var MAIN_STORAGE_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.storageKey) || "lyz-main-auth";
  // 可能殘留、會干擾 PKCE / session 讀取的舊 key（同 origin 含 ACG 預設 sb-*）
  var CONFLICT_KEY_RE = /^(sb-.*-auth-token|sb-.*-auth-token-code-verifier|lyz-main-auth.*)$/;

  function c() {
    return window.SB && window.SB.client ? window.SB.client() : null;
  }

  function listLocalKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k) keys.push(k);
      }
    } catch (e) { /* ignore */ }
    return keys;
  }

  /** 清除衝突的舊 auth storage（保留指定 keepKey 可選） */
  function clearConflictingAuthStorage(opts) {
    opts = opts || {};
    var keepMain = opts.keepMain === true;
    var removed = [];
    listLocalKeys().forEach(function (key) {
      var isMain = key === MAIN_STORAGE_KEY || key.indexOf(MAIN_STORAGE_KEY + ".") === 0;
      var isConflict =
        CONFLICT_KEY_RE.test(key) ||
        key.indexOf("code-verifier") !== -1 ||
        (key.indexOf("sb-") === 0 && key.indexOf("auth") !== -1);
      if (!isConflict && !isMain) return;
      if (keepMain && isMain) return;
      // 不要清掉同 origin 其他子專案的 auth key（ACG / 字耕）
      if (
        key === "acg-portal-auth" ||
        key.indexOf("acg-portal-auth") === 0 ||
        key.indexOf("acg_") === 0 ||
        key === "zi-geng-auth" ||
        key.indexOf("zi-geng-auth") === 0
      ) {
        return;
      }
      try {
        localStorage.removeItem(key);
        removed.push(key);
      } catch (e) { /* ignore */ }
    });
    return removed;
  }

  /** 登入前：清掉舊 sb-* token / code_verifier 與殘留 main session，讓 PKCE 從乾淨狀態開始 */
  function prepareForSignIn() {
    return clearConflictingAuthStorage({ keepMain: false });
  }

  /** 使用者自救：清光主站 auth 並 signOut */
  async function clearLocalAuthAndReload() {
    clearConflictingAuthStorage({ keepMain: false });
    try {
      var client = c();
      if (client) await client.auth.signOut({ scope: "local" });
    } catch (e) { /* ignore */ }
    try {
      localStorage.removeItem(MAIN_STORAGE_KEY);
    } catch (e2) { /* ignore */ }
    var url = new URL(window.location.href);
    ["code", "error", "error_description", "state"].forEach(function (key) {
      url.searchParams.delete(key);
    });
    window.location.replace(url.pathname + (url.search || "") || "/admin.html");
  }

  /** 僅允許同 origin 回跳，防 open redirect（RFC 9700 / OWASP） */
  function safeRedirectTo(url) {
    var fallback = window.location.origin + "/admin.html";
    try {
      var u = new URL(String(url || window.location.href), window.location.origin);
      if (u.origin !== window.location.origin) return fallback;
      if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
      return u.origin + u.pathname + u.search;
    } catch (e) {
      return fallback;
    }
  }

  async function signInWithGoogle(redirectTo) {
    var client = c();
    if (!client) throw new Error("Supabase 尚未設定");
    // 登入前清掉衝突的舊 session / code_verifier，無痕之所以 OK 就是沒有這些殘渣
    prepareForSignIn();
    return client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: safeRedirectTo(redirectTo),
        queryParams: { access_type: "online", prompt: "select_account" },
      },
    });
  }

  async function signOut() {
    var client = c();
    if (!client) return;
    await client.auth.signOut();
  }

  function authCallbackParams() {
    var url = new URL(window.location.href);
    var hashBody = window.location.hash.replace(/^#/, "");
    var hashParams = new URLSearchParams(hashBody.indexOf("=") >= 0 ? hashBody : "");
    return {
      code: url.searchParams.get("code"),
      error:
        url.searchParams.get("error_description") ||
        url.searchParams.get("error") ||
        hashParams.get("error_description") ||
        hashParams.get("error"),
      hasHashToken:
        hashParams.has("access_token") || hashParams.has("refresh_token"),
    };
  }

  function clearAuthCallbackUrl() {
    var url = new URL(window.location.href);
    ["code", "error", "error_description", "state"].forEach(function (key) {
      url.searchParams.delete(key);
    });
    var hashBody = window.location.hash.replace(/^#/, "");
    var hashParams = new URLSearchParams(hashBody.indexOf("=") >= 0 ? hashBody : "");
    var hasAuthHash =
      hashParams.has("access_token") ||
      hashParams.has("refresh_token") ||
      hashParams.has("error");
    var next = url.pathname + (url.search || "");
    if (!hasAuthHash && hashBody && hashBody.indexOf("=") === -1) next += "#" + hashBody;
    window.history.replaceState({}, document.title, next.replace(/\?$/, ""));
  }

  async function ensureSessionFromUrl() {
    var client = c();
    if (!client || callbackHandled) return null;
    var params = authCallbackParams();
    if (!params.code && !params.error && !params.hasHashToken) return null;
    callbackHandled = true;
    if (params.error) {
      console.warn("[auth] OAuth callback error:", params.error);
      clearAuthCallbackUrl();
      return null;
    }
    if (params.code) {
      try {
        var exchanged = await client.auth.exchangeCodeForSession(params.code);
        if (exchanged && exchanged.error) {
          console.warn("[auth] exchangeCodeForSession failed:", exchanged.error.message);
          // 常見於 code 已交換過 / code_verifier 遺失：清衝突 storage 後改讀既有 session
          clearConflictingAuthStorage({ keepMain: true });
        } else if (exchanged && exchanged.data && exchanged.data.session) {
          clearAuthCallbackUrl();
          return exchanged.data.session;
        }
      } catch (e) {
        console.warn("[auth] OAuth exchange exception:", e);
        clearConflictingAuthStorage({ keepMain: true });
      }
    }
    clearAuthCallbackUrl();
    var res = await client.auth.getSession();
    return res && res.data ? res.data.session : null;
  }

  async function getSession() {
    var client = c();
    if (!client) return null;
    var fromUrl = await ensureSessionFromUrl();
    if (fromUrl) return fromUrl;
    var res = await client.auth.getSession();
    return res && res.data ? res.data.session : null;
  }

  async function getUser() {
    var s = await getSession();
    return s ? s.user : null;
  }

  // 呼叫後端 SECURITY DEFINER 函式 is_admin()，權威來源是 DB 白名單
  async function isAdmin() {
    var client = c();
    if (!client) return false;
    var session = await getSession();
    if (!session) return false;
    try {
      var res = await client.rpc("is_admin");
      if (res.error) {
        console.warn("[auth] is_admin RPC 失敗：", res.error.message);
        return false;
      }
      return res.data === true;
    } catch (e) {
      console.warn("[auth] is_admin 例外：", e);
      return false;
    }
  }

  function onChange(cb) {
    var client = c();
    if (!client) return { unsubscribe: function () {} };
    var sub = client.auth.onAuthStateChange(function (_event, session) {
      cb(session);
    });
    return sub && sub.data ? sub.data.subscription : { unsubscribe: function () {} };
  }

  window.SBAuth = {
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getSession: getSession,
    getUser: getUser,
    isAdmin: isAdmin,
    onChange: onChange,
    ensureSessionFromUrl: ensureSessionFromUrl,
    prepareForSignIn: prepareForSignIn,
    clearConflictingAuthStorage: clearConflictingAuthStorage,
    clearLocalAuthAndReload: clearLocalAuthAndReload,
    storageKey: MAIN_STORAGE_KEY,
  };
})();
