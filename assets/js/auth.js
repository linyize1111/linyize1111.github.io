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

  function c() {
    return window.SB && window.SB.client ? window.SB.client() : null;
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

  async function getSession() {
    var client = c();
    if (!client) return null;
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
  };
})();
