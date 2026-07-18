(() => {
  "use strict";

  const config = window.ACG_CONFIG;
  const MANUAL_SYNC_WORKFLOW_HINT = "actions/workflows/scheduled-sync.yml";
  const AUTH_STORAGE_KEY = "acg-portal-auth";
  const VIEW_STORAGE_KEY = "acg_portal_last_view";
  const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: AUTH_STORAGE_KEY,
      storage: window.localStorage
    }
  });

  const APP_VERSION = "1.5.0";
  const PROFILE_WAIT_MS = 5000;
  const PROFILE_POLL_MS = 120;
  const CANONICAL_AUTH_REDIRECT = "https://linyize1111.github.io/acg-portal/";
  const EDIT_WINDOW_MS = 30 * 60 * 1000;
  const DRAW_HISTORY_KEY = "acg_draw_history_v1";

  const PLATFORM_LABELS = { nhentai: "Nhentai", "18comic": "禁漫", hanime: "Hanime", pixiv: "Pixiv" };
  /** 遊戲評鑑分項：1–10；optional 可 N/A。總分＝非 null 等權平均。見 docs/GAME-REVIEW-SCORING.md */
  const GAME_SCORE_FIELDS = [
    { key: "story", label: "劇情", optional: false },
    { key: "art", label: "美術", optional: false },
    { key: "voice", label: "配音", optional: true },
    { key: "gameplay", label: "系統", optional: false },
    { key: "presentation", label: "表現力", optional: false },
    { key: "animation", label: "演出", optional: true }
  ];
  const GAME_GRADE_LABELS = { S: "神作", A: "佳作", B: "良作", C: "普通", D: "雷" };
  const GAME_CG_TYPE_LABELS = { static: "靜態 CG", animated: "動態演出", mixed: "動靜混合", unknown: "未標示" };
  const emptyRecentByPlatform = () => Object.fromEntries(config.platforms.map(platform => [platform, []]));
  const state = {
    works: [],
    sourceStats: Object.fromEntries(config.platforms.map(platform => [platform, { total: 0, active: 0, inactive: 0, rejected: 0, running: false, lastRun: null }])),
    workById: new Map(),
    leaderboard: [],
    weeklyLeaderboard: [],
    scoreByWork: new Map(),
    shownByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, new Set()])),
    currentByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, null])),
    recentByPlatform: emptyRecentByPlatform(),
    cardSideByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, "front"])),
    session: null,
    profile: null,
    authLoading: false,
    profileReady: false,
    profiles: new Map(),
    favorites: new Set(),
    preferenceTags: new Map(),
    libraryVisible: 60,
    librarySeed: crypto.randomUUID?.() || String(Date.now()),
    bulkWorks: [],
    currentWork: null,
    currentReviews: new Map(),
    currentGameId: null,
    reportTargetReviewId: null,
    editingGameId: null,
    adminWorks: [],
    currentRating: 5,
    adminTab: "users",
    workerStatus: { available: null, lastError: null },
    googleProviderEnabled: null,
    autoApproveOpen: false,
    reviewStatsByWork: new Map(),
    favoriteCounts: new Map()
  };
  let loadAuthRun = 0;
  let loadAuthPromise = null;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  function debounce(fn, wait = 220) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function toast(message, type = "info") {
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    $("#toast-region").append(node);
    setTimeout(() => node.remove(), type === "error" ? 9000 : 4200);
  }

  function formatApiError(error) {
    if (!error) return "未知錯誤";
    const parts = [error.message, error.details, error.hint].map(value => String(value || "").trim()).filter(Boolean);
    const code = error.code ? `（${error.code}）` : "";
    return (parts.join(" · ") || String(error)) + code;
  }

  function showFormError(form, message) {
    if (!form) return;
    let box = form.querySelector(".form-error");
    if (!box) {
      box = document.createElement("div");
      box.className = "form-error";
      box.setAttribute("role", "alert");
      form.insertBefore(box, form.firstChild);
    }
    box.textContent = message;
    box.hidden = false;
  }

  function clearFormError(form) {
    form?.querySelector(".form-error")?.remove();
  }

  function showFormErrorById(id, message, toastType = "error") {
    const box = $(id);
    if (box) {
      box.textContent = message;
      box.hidden = false;
      box.classList.remove("hidden");
    }
    if (message) toast(message, toastType);
  }

  function setFormStatus(id, message) {
    const box = $(id);
    if (!box) return;
    if (!message) {
      box.textContent = "";
      box.hidden = true;
      box.classList.add("hidden");
      return;
    }
    box.textContent = message;
    box.hidden = false;
    box.classList.remove("hidden");
  }

  function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
  }

  function clearFormErrorById(id) {
    const box = $(id);
    if (!box) return;
    box.textContent = "";
    box.hidden = true;
    box.classList.add("hidden");
  }

  async function withBusyButton(button, busyText, task) {
    if (!button) return task();
    if (button.dataset.busy === "1") return null;
    const original = button.dataset.originalText || button.textContent;
    button.dataset.originalText = original;
    button.dataset.busy = "1";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-busy");
    if (busyText) button.textContent = busyText;
    try {
      return await task();
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.classList.remove("is-busy");
      button.dataset.busy = "0";
      button.textContent = original;
    }
  }

  function workerErrorMessage(error) {
    const detail = error?.detail || error?.message || String(error || "");
    if (!config.workerUrl) {
      return detail || "目前請改由 GitHub Actions 執行同步；同步紀錄與作品資料會直接回寫 Supabase。";
    }
    if (error?.status === 404 || /\b404\b/.test(detail)) {
      return "背景同步 API 目前不可用；請改從 GitHub Actions 手動同步，稍後再回來看 Supabase 同步紀錄。";
    }
    return detail ? `背景同步 API 目前不可用：${detail}` : "背景同步 API 目前不可用";
  }

  function workerDownBanner() {
    if (config.workerUrl) {
      if (state.workerStatus.available !== false) return "";
      return '<div class="empty-state warning">背景同步 API 暫時無法連線；作品清單與同步紀錄仍以 Supabase 現況顯示。若要立即同步，請改用 GitHub Actions 手動觸發。</div>';
    }
    return '<div class="empty-state warning">本站目前使用 Discord / GitHub Actions / Supabase。手動新增的車號會先進待同步佇列，再由下一次同步匯入作品庫。</div>';
  }

  async function fetchWorkerJson(path, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.workerUrl}${path}`, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.detail || `HTTP ${response.status}`);
        error.status = response.status;
        error.detail = payload.detail || `HTTP ${response.status}`;
        throw error;
      }
      state.workerStatus = { available: true, lastError: null };
      return payload;
    } catch (error) {
      state.workerStatus = {
        available: false,
        lastError: error.name === "AbortError" ? "連線逾時" : (error.detail || error.message || String(error))
      };
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function flashButton(button) {
    if (!button) return;
    button.classList.remove("is-pressing");
    void button.offsetWidth;
    button.classList.add("is-pressing");
    setTimeout(() => button.classList.remove("is-pressing"), 520);
  }

  function flashDrawArea() {
    const area = $("#platform-cards");
    if (!area) return;
    area.classList.remove("draw-pulse");
    void area.offsetWidth;
    area.classList.add("draw-pulse");
    setTimeout(() => area.classList.remove("draw-pulse"), 620);
  }

  function normalize(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-TW").replace(/\s+/g, " ").trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function similarity(a, b) {
    const longest = Math.max(a.length, b.length);
    return longest ? 1 - levenshtein(a, b) / longest : 1;
  }

  function workMatches(work, query) {
    return workSearchScore(work, query) > Number.NEGATIVE_INFINITY;
  }

  function isRecentWeeklyWork(work) {
    if (!work) return false;
    if (!["discord", "manual"].includes(String(work.source_kind || ""))) return false;
    const seenAt = new Date(work.first_seen_at || work.created_at || 0).getTime();
    return Number.isFinite(seenAt) && Date.now() - seenAt <= 7 * 86400000;
  }

  function stableRandom(value, seed = state.librarySeed) {
    const text = `${seed}:${value}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function searchableFields(work) {
    return [
      { value: work.work_id, weight: 120 },
      { value: work.title, weight: 75 },
      ...((work.title_alt || []).map(value => ({ value, weight: 55 }))),
      { value: work.author, weight: 48 },
      ...((work.tags || []).map(value => ({ value, weight: 34 }))),
    ].map(field => ({ ...field, normalized: normalize(field.value) })).filter(field => field.normalized);
  }

  function scoreTerm(field, term) {
    if (!term) return 0;
    if (field.normalized === term) return field.weight * 2.2;
    if (field.normalized.startsWith(term)) return field.weight * 1.55;
    if (field.normalized.includes(term)) return field.weight;
    if (term.length < 3) return 0;
    const tokens = field.normalized.split(/[\s\-_()[\]【】「」,，/]+/).filter(Boolean);
    let best = 0;
    for (const token of tokens) {
      if (Math.abs(token.length - term.length) > 3) continue;
      const match = similarity(token, term);
      if (match >= .68) best = Math.max(best, field.weight * match * .75);
    }
    return best;
  }

  function workSearchScore(work, query) {
    const q = normalize(query);
    if (!q) return stableRandom(work.id || `${work.platform}:${work.work_id}`);
    const terms = q.split(" ").filter(Boolean);
    const fields = searchableFields(work);
    let total = 0;
    for (const term of terms) {
      const best = Math.max(...fields.map(field => scoreTerm(field, term)), 0);
      if (best <= 0) return Number.NEGATIVE_INFINITY;
      total += best;
    }
    const rating = state.scoreByWork.get(work.id) || 0;
    return total + Math.max(0, rating + 5) + stableRandom(work.id) * .01;
  }

  function imageUrl(url) {
    if (!url) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect fill="#171b2d" width="100%" height="100%"/><text fill="#737b96" x="50%" y="50%" text-anchor="middle" font-size="32">NO COVER</text></svg>'
    );
    if (url.includes("pximg.net")) return url.replace(/https?:\/\/i\.pximg\.net/, "https://i.pixiv.re");
    return url;
  }

  function isApproved() { return state.profile?.status === "active"; }
  function isAdmin() { return isApproved() && state.profile?.role === "admin"; }

  async function fetchProfileOnce() {
    if (!state.session) return null;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", state.session.user.id).maybeSingle();
    if (error) throw new Error(formatApiError(error));
    if (data) {
      state.profile = data;
      state.profileReady = true;
    }
    return data;
  }

  async function waitForProfile(timeoutMs = PROFILE_WAIT_MS) {
    if (!state.session) return null;
    if (state.profile?.id === state.session.user.id) return state.profile;
    if (loadAuthPromise) {
      try {
        await Promise.race([loadAuthPromise, sleep(timeoutMs)]);
      } catch (_) { /* ignore */ }
      if (state.profile?.id === state.session.user.id) return state.profile;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const data = await fetchProfileOnce();
        if (data) return data;
      } catch (error) {
        toast(`讀取會員資料失敗：${error.message}`, "error");
        return null;
      }
      await sleep(PROFILE_POLL_MS);
    }
    try {
      return await fetchProfileOnce();
    } catch (error) {
      toast(`讀取會員資料失敗：${error.message}`, "error");
      return null;
    }
  }

  async function ensureProfile() {
    return waitForProfile(PROFILE_WAIT_MS);
  }

  async function ensureAdmin(actionLabel = "此操作") {
    if (!state.session) {
      const message = "尚未登入，請先登入";
      toast(message, "warning");
      return { ok: false, message };
    }
    if (state.authLoading || !state.profileReady) {
      toast("管理員權限載入中，請稍候再試", "warning");
    }
    const profile = await waitForProfile();
    if (!profile) {
      const message = "無法讀取會員資料（逾時或失敗），請重新整理後再試";
      toast(message, "error");
      return { ok: false, message };
    }
    updateAuthUi();
    if (profile.status === "pending") {
      const message = "帳號審核中，無法使用管理功能";
      toast(message, "warning");
      return { ok: false, message };
    }
    if (profile.status === "suspended") {
      const message = "帳號已停權，無法使用管理功能";
      toast(message, "error");
      return { ok: false, message };
    }
    if (profile.role !== "admin") {
      const message = `你不是管理員（目前角色：${profile.role || "member"}）`;
      toast(message, "warning");
      return { ok: false, message };
    }
    if (profile.status !== "active") {
      const message = `帳號狀態為 ${profile.status}，無法${actionLabel}`;
      toast(message, "warning");
      return { ok: false, message };
    }
    return { ok: true, message: "" };
  }

  function updateAdminStatusBar() {
    const bar = $("#admin-status-bar");
    if (!bar) return;
    if (!state.session) {
      bar.textContent = `尚未登入 · v${APP_VERSION}`;
      return;
    }
    const email = state.session.user.email || "（無信箱）";
    const role = state.profile?.role || (state.authLoading || !state.profileReady ? "載入中…" : "未知");
    const status = state.profile?.status || (state.authLoading || !state.profileReady ? "載入中…" : "未知");
    const adminResult = state.authLoading || !state.profileReady ? "載入中…" : (isAdmin() ? "是" : "否");
    bar.textContent = `已登入：${email} / 角色：${role} / 審核：${status} / 管理員：${adminResult} · v${APP_VERSION}`;
  }

  function normalizeGameId(value) {
    const raw = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
  }

  function reviewEditable(review) {
    if (!review || !state.session) return false;
    if (isAdmin()) return review.user_id === state.session.user.id;
    if (review.user_id !== state.session.user.id) return false;
    return Date.now() - new Date(review.created_at).getTime() <= EDIT_WINDOW_MS;
  }

  function reviewDeletable(review) {
    if (!review || !state.session) return false;
    if (isAdmin()) return true;
    if (review.user_id !== state.session.user.id) return false;
    return Date.now() - new Date(review.created_at).getTime() <= EDIT_WINDOW_MS;
  }

  function feedbackItemDeletable(item) {
    if (!item || !state.session) return false;
    return isAdmin() || item.user_id === state.session.user.id;
  }

  function rememberView(view) {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch (_) { /* ignore */ }
  }

  function parseLocationHash() {
    const raw = location.hash.replace(/^#/, "").trim();
    const workMatch = /^work-([0-9a-f-]{36})(?:-review-([0-9a-f-]{36}))?$/i.exec(raw);
    if (workMatch) {
      return { view: "home", workId: workMatch[1], reviewId: workMatch[2] || null };
    }
    const viewNames = ["home", "library", "leaderboard", "games", "feedback", "admin"];
    if (viewNames.includes(raw)) return { view: raw, workId: null, reviewId: null };
    return { view: null, workId: null, reviewId: null };
  }

  function readRememberedView() {
    const fromHash = parseLocationHash();
    if (fromHash.view) return fromHash.view;
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved) return saved;
    } catch (_) { /* ignore */ }
    return "home";
  }

  function loadDrawHistory() {
    try {
      const raw = localStorage.getItem(DRAW_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const next = emptyRecentByPlatform();
      for (const platform of config.platforms) {
        const ids = Array.isArray(parsed?.[platform]) ? parsed[platform] : [];
        next[platform] = ids.filter(id => typeof id === "string").slice(0, 20);
      }
      state.recentByPlatform = next;
    } catch (error) {
      console.warn("Draw history load failed", error);
    }
  }

  function saveDrawHistory() {
    try {
      localStorage.setItem(DRAW_HISTORY_KEY, JSON.stringify(state.recentByPlatform));
    } catch (error) {
      console.warn("Draw history save failed", error);
    }
  }

  function resetDrawHistory({ confirmPrompt = true } = {}) {
    if (confirmPrompt && !confirm("清除各平台卡片背面與本輪加抽清單的本機抽取紀錄？")) return;
    state.recentByPlatform = emptyRecentByPlatform();
    state.bulkWorks = [];
    config.platforms.forEach(platform => {
      state.shownByPlatform[platform] = new Set();
      state.cardSideByPlatform[platform] = "front";
    });
    saveDrawHistory();
    renderBulkDraw();
    config.platforms.forEach(platform => {
      if (state.currentByPlatform[platform]) renderPlatformCard(platform, state.currentByPlatform[platform]);
    });
    toast("已重置抽取紀錄", "success");
  }

  function adminVoteHint(reviewId, voteStats) {
    const votes = voteStats?.adminVotes;
    if (!votes?.length) return "";
    if (votes.some(v => v.vote === 1)) return '<div class="admin-vote-hint">站長偷偷點讚</div>';
    if (votes.some(v => v.vote === -1)) return '<div class="admin-vote-hint">站長偷偷倒讚</div>';
    return "";
  }

  // Some legacy rows stored a corrupted display name (e.g. "????") when the
  // original CJK name was lost during import. Treat those as empty so we can
  // fall back to auth metadata or a neutral label instead of showing "????".
  function cleanName(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/^[?？]+$/.test(text)) return "";
    return text;
  }

  function memberName(profile, fallback = "會員") {
    return cleanName(profile?.display_name) || fallback;
  }

  function myDisplayName() {
    const meta = state.session?.user?.user_metadata || {};
    return cleanName(state.profile?.display_name)
      || cleanName(meta.full_name)
      || cleanName(meta.name)
      || cleanName(state.session?.user?.email?.split("@")[0])
      || "新會員";
  }

  function authRedirectUrl() {
    if (location.hostname.endsWith("github.io")) return CANONICAL_AUTH_REDIRECT;
    const path = location.pathname.replace(/\/index\.html$/i, "");
    const normalized = path.endsWith("/") ? path : `${path}/`;
    return `${location.origin}${normalized}`;
  }

  function authDebug(step, detail = {}) {
    if (localStorage.getItem("acg_debug_auth") !== "1") return;
    console.info("[acg-auth]", step, { storageKey: AUTH_STORAGE_KEY, ...detail });
  }

  function markOAuthPending(provider = "google") {
    sessionStorage.setItem("acg_oauth_pending", JSON.stringify({
      provider,
      redirectTo: authRedirectUrl(),
      startedAt: Date.now()
    }));
  }

  function clearOAuthPending() {
    sessionStorage.removeItem("acg_oauth_pending");
  }

  function oauthPendingState() {
    try {
      const raw = sessionStorage.getItem("acg_oauth_pending");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function oauthReturnHint() {
    const pending = oauthPendingState();
    if (!pending) return;
    clearOAuthPending();
    const ageSec = Math.round((Date.now() - Number(pending.startedAt || 0)) / 1000);
    if (ageSec > 600) return;
    toast(
      "Google 登入已跳回本站，但網址沒有 OAuth 參數（?code=）。請確認 ACG 專案 Site URL 為 https://linyize1111.github.io/acg-portal/，且 Redirect URLs 含 /acg-portal/ 與 /acg-portal/index.html。",
      "warning"
    );
  }

  function oauthExchangeFailureMessage(rawMessage) {
    const message = decodeURIComponent(String(rawMessage || "").replace(/\+/g, " "));
    if (/unable to exchange external code/i.test(message)) {
      return "Google 登入失敗：Supabase 無法向 Google 換取 token。請到 Supabase ACG 專案（xpztpetskjohuxrpgmcm）→ Authentication → Providers → Google，重新貼上與 Google Cloud 同一組 Client ID 與 Client Secret（勿用主站 ypyi 專案的 secret）。詳見 docs/FIX-UNABLE-TO-EXCHANGE-EXTERNAL-CODE.md";
    }
    return message || "未知錯誤";
  }

  function authCallbackParams() {
    const url = new URL(location.href);
    const hashBody = location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hashBody.includes("=") ? hashBody : "");
    return {
      code: url.searchParams.get("code"),
      error: url.searchParams.get("error_description")
        || url.searchParams.get("error")
        || hashParams.get("error_description")
        || hashParams.get("error"),
      hasHashToken: hashParams.has("access_token") || hashParams.has("refresh_token"),
      hasAuthParams: Boolean(
        url.searchParams.get("code")
        || url.searchParams.get("error")
        || url.searchParams.get("error_description")
        || hashParams.has("access_token")
        || hashParams.has("refresh_token")
        || hashParams.get("error")
      )
    };
  }

  function clearAuthCallbackUrl() {
    const url = new URL(location.href);
    ["code", "error", "error_description", "state"].forEach(key => url.searchParams.delete(key));
    const viewNames = ["home", "library", "leaderboard", "games", "feedback", "admin"];
    const hashBody = location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hashBody.includes("=") ? hashBody : "");
    const hasAuthHash = hashParams.has("access_token") || hashParams.has("refresh_token") || hashParams.has("error");
    let viewHash = "";
    if (!hasAuthHash && viewNames.includes(hashBody)) viewHash = `#${hashBody}`;
    const cleaned = `${url.pathname}${url.search ? url.search : ""}${viewHash}`.replace(/\?$/, "");
    history.replaceState({}, document.title, cleaned);
    authDebug("url cleaned", { path: cleaned });
  }

  async function waitForAuthSession(maxWaitMs = 9000) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (session) return session;
      await sleep(180);
    }
    return null;
  }

  function applyAuthSession(session, source = "callback") {
    if (!session) return null;
    state.session = session;
    closeModal("auth-modal");
    updateAuthUi();
    authDebug("session applied", { source, userId: session.user?.id });
    return session;
  }

  async function handleAuthCallback() {
    const { code, error: oauthError, hasHashToken, hasAuthParams } = authCallbackParams();
    authDebug("callback start", {
      hasCode: Boolean(code),
      hasHashToken,
      hasAuthParams,
      redirect: authRedirectUrl(),
      path: location.pathname
    });
    if (oauthError) {
      toast(oauthExchangeFailureMessage(oauthError), "error");
      clearAuthCallbackUrl();
      return null;
    }
    if (!hasAuthParams) {
      oauthReturnHint();
      return null;
    }

    let session = null;
    if (code) {
      authDebug("exchange code");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        authDebug("exchange failed", {
          message: error.message,
          name: error.name,
          status: error.status,
          code: error.code
        });
        const { data: { session: existing } } = await supabase.auth.getSession();
        session = existing;
        if (!session) {
          const hint = /code verifier|flow state|invalid grant/i.test(error.message || "")
            ? "（常見原因：用了不同分頁/無痕視窗，或中途清除了瀏覽器資料）"
            : "";
          const detail = /unable to exchange external code/i.test(error.message || "")
            ? oauthExchangeFailureMessage(error.message)
            : `${error.message || "未知錯誤"}${hint}`;
          toast(/unable to exchange external code/i.test(error.message || "") ? detail : `OAuth 驗證失敗：${detail}`, "error");
          clearAuthCallbackUrl();
          clearOAuthPending();
          return null;
        }
      } else {
        session = data.session;
      }
    } else if (hasHashToken) {
      authDebug("wait hash session");
      session = await waitForAuthSession();
    }

    clearAuthCallbackUrl();
    if (session) {
      clearOAuthPending();
      applyAuthSession(session, code ? "pkce" : "hash");
      toast("已登入", "success");
      return session;
    }
    clearOAuthPending();
    toast("登入逾時：請在同一瀏覽器視窗重試 Google 登入", "error");
    return null;
  }

  function workReviewStats(workId) {
    return state.reviewStatsByWork.get(workId) || null;
  }

  function formatAverageScore(stats) {
    if (!stats || !stats.review_count) return "尚無評分";
    return Number(stats.raw_average).toFixed(2);
  }

  function scoreBadgeHtml(workId, compact = false) {
    const stats = workReviewStats(workId);
    const label = formatAverageScore(stats);
    const count = stats?.review_count || 0;
    const cls = compact ? "score-badge compact" : "score-badge";
    return `<span class="${cls}" title="${count ? `${count} 則評分 · 平均 ${label}` : "尚無評分"}">${label}${count ? `<small>${count} 則</small>` : ""}</span>`;
  }

  function platformFlipLabel(platform) {
    return platform === "nhentai" ? "車號" : "資訊";
  }

  function platformCopyLabel(platform) {
    return platform === "nhentai" ? "複製車號" : "複製標題/連結";
  }

  function copyLineForWork(work) {
    if (work.platform === "nhentai") return String(work.work_id || "");
    const title = String(work.title || "").trim();
    const url = String(work.source_url || "").trim();
    return title && url ? `${title}\n${url}` : (title || url);
  }

  function passesWorkFilters(work, prefix = "home") {
    const weekFilter = $(`#${prefix}-filter-week`)?.value || "all";
    if (weekFilter === "week" && !isRecentWeeklyWork(work)) return false;
    if (prefix === "home") {
      const scope = $("#home-filter-scope")?.value || "all";
      if (scope === "favorites") {
        if (!state.session) return false;
        if (!state.favorites.has(work.id)) return false;
      }
    }
    return true;
  }

  function dedupeWorks(works) {
    const byKey = new Map();
    for (const work of works) {
      const key = workDedupeKey(work);
      const prev = byKey.get(key);
      if (!prev || String(work.updated_at || "") > String(prev.updated_at || "")) {
        byKey.set(key, work);
      }
    }
    return [...byKey.values()];
  }

  function workDedupeKey(work) {
    if (work.platform) {
      if (work.external_id) return `${work.platform}:${work.external_id}`;
      if (work.work_id && !/^[0-9a-f-]{36}$/i.test(String(work.work_id))) {
        return `${work.platform}:${work.work_id}`;
      }
    }
    return String(work.id || work.work_id || "");
  }

  function dedupeLeaderboard(rows) {
    const byId = new Map();
    for (const row of rows) {
      const key = String(row.work_id || "");
      if (!key || byId.has(key)) continue;
      byId.set(key, row);
    }
    return [...byId.values()];
  }

  async function fetchAll(table, queryBuilder) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from(table).select("*").range(offset, offset + 999);
      query = queryBuilder ? queryBuilder(query) : query;
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function loadWorks() {
    renderPlatformSkeletons();
    state.sourceStats = await loadSourceStatus();
    $("#home-summary").textContent = "同步狀態已更新，正在讀取可抽選作品…";
    renderSourceStatus();

    const activeWorks = await fetchAll("works", query => query.eq("status", "active"));
    state.works = dedupeWorks(activeWorks.filter(work => work.is_ai !== true));
    state.workById = new Map(state.works.map(work => [work.id, work]));
    if (!Object.values(state.sourceStats).some(stats => stats.total > 0 || stats.active > 0)) {
      state.sourceStats = summarizeSourceStats(state.works);
    }
    const readySources = config.platforms.filter(platform => platformStats(platform).active > 0).length;
    const workerNote = config.workerUrl
      ? (state.workerStatus.available === false ? "（背景同步 API 暫時不可用，狀態改用作品庫估算）" : "")
      : "（同步狀態依 Supabase 作品庫與紀錄顯示）";
    $("#home-summary").textContent = `目前可抽選 ${state.works.length.toLocaleString()} 筆通過驗證的作品；${readySources} / ${config.platforms.length} 個來源已有 active 內容${workerNote}`;
    renderSourceStatus();
  }

  async function loadSourceStatus() {
    if (!config.workerUrl) {
      state.workerStatus = { available: null, lastError: null };
      return summarizeSourceStats(state.works);
    }
    try {
      const rows = await fetchWorkerJson("/api/source-status", {}, 8000);
      return sourceStatsFromRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.warn("Source status unavailable; falling back to active works only", error);
      return summarizeSourceStats(state.works);
    }
  }

  function summarizeSourceStats(works) {
    const stats = Object.fromEntries(config.platforms.map(platform => [platform, {
      total: 0, active: 0, inactive: 0, rejected: 0, running: false, lastRun: null
    }]));
    for (const work of works) {
      if (!stats[work.platform]) continue;
      const status = work.status || "active";
      stats[work.platform].total += 1;
      stats[work.platform][status] = (stats[work.platform][status] || 0) + 1;
    }
    return stats;
  }

  function sourceStatsFromRows(rows) {
    const stats = summarizeSourceStats([]);
    for (const row of rows) {
      if (!stats[row.platform]) continue;
      stats[row.platform] = {
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        inactive: Number(row.inactive || 0),
        rejected: Number(row.rejected || 0),
        running: Boolean(row.running),
        lastRun: row.last_run || null
      };
    }
    return stats;
  }

  function platformStats(platform) {
    return state.sourceStats[platform] || { total: 0, active: 0, inactive: 0, rejected: 0, running: false, lastRun: null };
  }

  function sourceState(platform) {
    const stats = platformStats(platform);
    if (stats.running) {
      return {
        className: "running",
        label: "RUNNING",
        count: stats.active > 0 ? `${stats.active.toLocaleString()} active` : `${stats.total.toLocaleString()} pending`,
        description: "背景同步進行中；完成後作品數會自動更新"
      };
    }
    if (stats.active > 0) {
      return {
        className: "ready",
        label: "READY",
        count: `${stats.active.toLocaleString()} active`,
        description: stats.inactive || stats.rejected
          ? `${(stats.inactive + stats.rejected).toLocaleString()} 筆非 active 保留`
          : "可抽卡、搜尋、收藏與評分"
      };
    }
    if (stats.total > 0) {
      return {
        className: "pending",
        label: "SYNCING",
        count: `${stats.total.toLocaleString()} pending`,
        description: "已建立資料槽，等待 GitHub Actions 或手動同步佇列處理"
      };
    }
    return {
      className: "empty",
      label: "EMPTY",
      count: "尚未匯入",
      description: "此來源尚未有可用作品"
    };
  }

  function renderSourceStatus(selector = "#source-status-grid") {
    const target = $(selector);
    if (!target) return;
    target.innerHTML = config.platforms.map(platform => {
      const status = sourceState(platform);
      return `
        <article class="source-status-card ${status.className}">
          <div class="source-status-top">
            <strong>${escapeHtml(PLATFORM_LABELS[platform])}</strong>
            <span class="source-status-pill">${escapeHtml(status.label)}</span>
          </div>
          <div class="source-status-count">${escapeHtml(status.count)}</div>
          <p>${escapeHtml(status.description)}</p>
        </article>`;
    }).join("");
  }

  async function loadLeaderboardData() {
    state.leaderboard = dedupeLeaderboard(await fetchAll("leaderboard"));
    state.scoreByWork = new Map(state.leaderboard.map(item => [item.work_id, Number(item.weighted_score || 0)]));
    state.reviewStatsByWork = new Map(state.leaderboard.map(item => [item.work_id, {
      review_count: Number(item.review_count || 0),
      raw_average: Number(item.raw_average || 0),
      weighted_score: Number(item.weighted_score || 0)
    }]));
  }

  async function refreshLeaderboardAfterReviewChange() {
    await loadLeaderboardData();
    await loadWeeklyLeaderboardData();
    if ($("#view-leaderboard")?.classList.contains("active")) renderLeaderboard();
    if ($("#view-library")?.classList.contains("active")) renderLibrary(true);
    if (state.currentWork) drawAll();
  }

  function scrollToReview(reviewId) {
    if (!reviewId) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-review="${reviewId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("review-highlight");
      setTimeout(() => el.classList.remove("review-highlight"), 3200);
    });
  }

  function taipeiWeekStartIso() {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", weekday: "short" }).format(now);
    const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const dayOffset = weekdayMap[weekday] ?? 0;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(now);
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;
    const start = new Date(`${year}-${month}-${day}T00:00:00+08:00`);
    start.setDate(start.getDate() - dayOffset);
    return start.toISOString();
  }

  async function loadWeeklyLeaderboardData() {
    const since = taipeiWeekStartIso();
    const reviews = await fetchAll("reviews", query => query
      .select("work_id,rating,created_at")
      .is("parent_id", null)
      .eq("status", "visible")
      .gte("created_at", since));
    const grouped = new Map();
    for (const review of reviews) {
      const bucket = grouped.get(review.work_id) || { sum: 0, count: 0 };
      bucket.sum += Number(review.rating || 0);
      bucket.count += 1;
      grouped.set(review.work_id, bucket);
    }
    const rated = state.leaderboard.filter(item => item.review_count > 0);
    const globalAverage = rated.length
      ? rated.reduce((sum, item) => sum + Number(item.raw_average || 0), 0) / rated.length
      : 0;
    state.weeklyLeaderboard = [...grouped.entries()].map(([workId, stats]) => {
      const work = state.workById.get(workId);
      if (!work) return null;
      const rawAverage = stats.count ? stats.sum / stats.count : 0;
      const weighted = (stats.count / (stats.count + 4)) * rawAverage + (4 / (stats.count + 4)) * globalAverage;
      return {
        work_id: workId,
        platform: work.platform,
        title: work.title,
        author: work.author,
        cover_url: work.cover_url,
        review_count: stats.count,
        raw_average: rawAverage,
        weighted_score: weighted
      };
    }).filter(Boolean).sort((a, b) => {
      const scoreDiff = Number(b.weighted_score) - Number(a.weighted_score);
      if (Math.abs(scoreDiff) > .0001) return scoreDiff;
      return Number(b.review_count) - Number(a.review_count);
    });
  }

  async function loadFavoriteCounts() {
    try {
      const rows = await fetchAll("favorites", query => query.select("work_id"));
      const counts = new Map();
      for (const row of rows) counts.set(row.work_id, (counts.get(row.work_id) || 0) + 1);
      state.favoriteCounts = counts;
    } catch (error) {
      console.warn("Favorite counts unavailable", error);
      state.favoriteCounts = new Map();
    }
  }

  function randomUnit() {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  }

  function weightedPick(candidates, source = null) {
    if (!candidates.length) return null;
    const scored = candidates.map(work => {
      let score = 1;
      const tags = work.tags || [];
      if (source) {
        const sourceTags = new Set((source.tags || []).map(normalize));
        const overlap = tags.filter(tag => sourceTags.has(normalize(tag))).length;
        score += overlap * 8;
        if (source.author && source.author !== "Unknown Artist" && normalize(work.author) === normalize(source.author)) score += 4;
      }
      const preference = tags.reduce((sum, tag) => sum + (state.preferenceTags.get(normalize(tag)) || 0), 0);
      const rating = state.scoreByWork.get(work.id) || 0;
      score += Math.max(0, (rating + 5) / 10) * 2;
      score += Math.max(-.75, Math.min(1.5, preference * .15));
      const daysOld = Math.max(0, (Date.now() - new Date(work.last_seen_at || work.created_at).getTime()) / 86400000);
      score += Math.max(0, 1 - daysOld / 365) * .5;
      return { work, score: Math.max(.05, score) };
    });
    const total = scored.reduce((sum, item) => sum + item.score, 0);
    let target = randomUnit() * total;
    for (const item of scored) {
      target -= item.score;
      if (target <= 0) return item.work;
    }
    return scored.at(-1).work;
  }

  function diversifyByAuthor(works, gap = 3) {
    const pending = [...works];
    const output = [];
    const recentAuthors = [];
    while (pending.length) {
      let index = pending.findIndex(work => {
        const author = normalize(work.author || "Unknown Artist");
        return !author || author === "unknown artist" || !recentAuthors.includes(author);
      });
      if (index < 0) index = 0;
      const [work] = pending.splice(index, 1);
      output.push(work);
      const author = normalize(work.author || "Unknown Artist");
      if (author && author !== "unknown artist") {
        recentAuthors.push(author);
        while (recentAuthors.length > gap) recentAuthors.shift();
      }
    }
    return output;
  }

  function rememberDraw(work) {
    if (!work) return;
    const list = state.recentByPlatform[work.platform] || [];
    state.recentByPlatform[work.platform] = [work.id, ...list.filter(id => id !== work.id)].slice(0, 20);
    saveDrawHistory();
  }

  function activeHomeSortMode() {
    return "default";
  }

  function sortWorksByMode(rows, mode, query = "") {
    const hasQuery = Boolean(normalize(query));
    if (mode === "default" && hasQuery) {
      return rows.sort((a, b) => {
        const scoreDiff = workSearchScore(b, query) - workSearchScore(a, query);
        if (Math.abs(scoreDiff) > .0001) return scoreDiff;
        return stableRandom(a.id) - stableRandom(b.id);
      });
    }
    if (mode === "default") {
      return rows.sort((a, b) => stableRandom(a.id) - stableRandom(b.id));
    }
    const stat = workId => workReviewStats(workId);
    return rows.sort((a, b) => {
      const aStats = stat(a.id);
      const bStats = stat(b.id);
      const aFav = state.favoriteCounts.get(a.id) || 0;
      const bFav = state.favoriteCounts.get(b.id) || 0;
      if (mode === "score-desc") return Number(bStats?.raw_average || 0) - Number(aStats?.raw_average || 0);
      if (mode === "score-asc") return Number(aStats?.raw_average || 0) - Number(bStats?.raw_average || 0);
      if (mode === "reviews-desc") return Number(bStats?.review_count || 0) - Number(aStats?.review_count || 0);
      if (mode === "reviews-asc") return Number(aStats?.review_count || 0) - Number(bStats?.review_count || 0);
      if (mode === "favorites-desc") return bFav - aFav;
      if (mode === "favorites-asc") return aFav - bFav;
      return stableRandom(a.id) - stableRandom(b.id);
    });
  }

  function candidatesFor(platform, query = "") {
    const rows = state.works.filter(work =>
      work.platform === platform &&
      workMatches(work, query) &&
      passesWorkFilters(work, "home")
    );
    return sortWorksByMode(rows, activeHomeSortMode(), query);
  }

  function drawPlatform(platform, source = null) {
    const query = $("#home-search").value;
    const mode = activeHomeSortMode();
    let candidates = candidatesFor(platform, query).filter(work => !state.shownByPlatform[platform].has(work.id));
    if (!candidates.length) {
      state.shownByPlatform[platform].clear();
      candidates = candidatesFor(platform, query);
    }
    if (source) candidates = candidates.filter(work => work.id !== source.id);
    const work = mode === "default" ? weightedPick(candidates, source) : candidates[0] || null;
    state.currentByPlatform[platform] = work;
    state.cardSideByPlatform[platform] = "front";
    rememberDraw(work);
    renderPlatformCard(platform, work);
    if (work) state.shownByPlatform[platform].add(work.id);
  }

  function drawAll() {
    config.platforms.forEach(platform => drawPlatform(platform));
    flashDrawArea();
  }

  function drawBatch(count) {
    const query = $("#home-search").value;
    const mode = activeHomeSortMode();
    const pool = sortWorksByMode(
      dedupeWorks(state.works.filter(work => workMatches(work, query) && passesWorkFilters(work, "home"))),
      mode,
      query
    );
    const selected = [];
    const used = new Set();
    for (let index = 0; index < count && used.size < pool.length; index++) {
      const candidates = pool.filter(work => !used.has(work.id));
      const pick = mode === "default" ? weightedPick(candidates) : candidates[0];
      if (!pick) break;
      used.add(pick.id);
      selected.push(pick);
    }
    state.bulkWorks = diversifyByAuthor(selected, 2);
    renderBulkDraw();
    $("#bulk-draw-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPlatformPlaceholders() {
    $("#platform-cards").innerHTML = config.platforms.map(platform => `
      <div class="card-placeholder" data-card="${platform}">
        <div>${emptyPlatformHtml(platform)}</div>
      </div>`).join("");
  }

  function renderPlatformSkeletons() {
    const target = $("#platform-cards");
    if (!target) return;
    target.innerHTML = config.platforms.map(platform => `
      <div class="card-placeholder skeleton" data-card="${platform}" aria-busy="true">
        <div>
          <span class="source-status-pill">載入中</span>
          <strong>${escapeHtml(PLATFORM_LABELS[platform])}</strong>
          <p class="muted">正在讀取作品資料，請稍候…</p>
          <div class="skeleton-bar"></div>
          <div class="skeleton-bar short"></div>
        </div>
      </div>`).join("");
  }

  function renderPlatformError() {
    const target = $("#platform-cards");
    if (!target) return;
    target.innerHTML = `
      <div class="card-placeholder error">
        <div>
          <span class="source-status-pill">載入失敗</span>
          <strong>無法讀取作品資料</strong>
          <p class="muted">可能是網路或 Supabase 連線暫時異常，請重新載入。</p>
          <button class="button button-primary" data-retry-init>重新載入</button>
        </div>
      </div>`;
  }

  async function reloadHome() {
    try {
      renderPlatformSkeletons();
      $("#home-summary").textContent = "正在重新讀取作品資料…";
      await Promise.all([loadWorks(), loadLeaderboardData()]);
      drawAll();
      renderLeaderboard();
    } catch (error) {
      console.error(error);
      $("#home-summary").textContent = "資料載入失敗，請稍後重試。";
      renderPlatformError();
      toast(`重新載入失敗：${error.message}`, "error");
    }
  }

  function emptyPlatformHtml(platform) {
    const status = sourceState(platform);
    const query = $("#home-search")?.value?.trim() || "";
    const scope = $("#home-filter-scope")?.value || "all";
    let title = PLATFORM_LABELS[platform];
    let description = "此來源尚無通過驗證的 active 內容。";
    if (scope === "favorites" && !state.session) {
      title = "需要登入";
      description = "登入後才能只從「我的收藏」抽卡。";
    } else if (scope === "favorites") {
      title = "收藏裡沒有這來源";
      description = "先到圖書館收藏幾本，或把範圍改回「全部作品」。";
    } else if (query && platformStats(platform).active > 0) {
      title = "搜尋沒有結果";
      description = "換個車號、作者、標籤或清空搜尋後再抽。";
    } else if (status.className === "running") {
      description = "正在同步；完成後作品會自動進入抽卡與圖書館。";
    } else if (status.className === "pending") {
      description = "資料來源已建立，爬蟲匯入完成後會自動出現在這裡。";
    } else if (status.className === "empty") {
      description = "尚未建立此來源資料，稍後可從後台或排程同步。";
    }
    return `
      <span class="source-status-pill">${escapeHtml(status.label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
      <button class="button button-secondary" data-refresh-platform="${escapeHtml(platform)}">再試一次</button>`;
  }

  function favoriteIcon(workId) {
    return state.favorites.has(workId) ? "♥" : "♡";
  }

  function favoriteButtonHtml(workId, label = false) {
    const active = state.favorites.has(workId);
    return `<button class="${label ? "button button-secondary" : "quick-favorite"} ${active ? "active" : ""}" data-favorite="${escapeHtml(workId)}" aria-label="${active ? "取消收藏" : "加入收藏"}" title="${active ? "取消收藏" : "加入收藏"}">${label ? `${favoriteIcon(workId)} ${active ? "已收藏" : "收藏"}` : favoriteIcon(workId)}</button>`;
  }

  function adminDeleteButtonHtml(workId) {
    if (!isAdmin()) return "";
    return `<button class="card-admin-delete" data-purge-work="${escapeHtml(workId)}" aria-label="永久刪除此作品" title="永久刪除此作品">🗑</button>`;
  }

  async function purgeWork(workId) {
    if (!isAdmin()) return;
    const work = state.workById.get(workId) || state.adminWorks.find(item => item.id === workId);
    const label = work ? `${PLATFORM_LABELS[work.platform] || work.platform} · ${work.work_id}` : "這筆作品";
    if (!confirm(`確定永久刪除「${label}」？此動作無法復原，且會一併移除相關收藏與評論。`)) return;
    const { error } = await supabase.from("works").delete().eq("id", workId);
    if (error) return toast(`刪除失敗：${error.message}`, "error");
    state.adminWorks = state.adminWorks.filter(item => item.id !== workId);
    state.works = state.works.filter(item => item.id !== workId);
    state.workById.delete(workId);
    config.platforms.forEach(platform => {
      if (state.currentByPlatform[platform]?.id === workId) drawPlatform(platform);
    });
    if ($("#view-admin")?.classList.contains("active")) renderAdminWorks();
    if ($("#view-library")?.classList.contains("active")) renderLibrary();
    toast("作品已永久刪除", "success");
  }

  function workCardHtml(work) {
    if (state.cardSideByPlatform[work.platform] === "back") return workCardBackHtml(work.platform);
    const tags = (work.tags || []).slice(0, 4).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    return `
      <article class="work-card" data-card="${escapeHtml(work.platform)}">
        <span class="platform-badge">${escapeHtml(PLATFORM_LABELS[work.platform])}</span>
        <div class="cover-wrap">
          <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
            <img class="work-card-cover" src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}" loading="lazy">
          </a>
          ${adminDeleteButtonHtml(work.id)}
          ${favoriteButtonHtml(work.id)}
        </div>
        <div class="work-card-shade"></div>
        <div class="work-card-body">
          <h3>${escapeHtml(work.title)}</h3>
          ${scoreBadgeHtml(work.id)}
          <div class="work-card-meta">${escapeHtml(work.author)}<br>ID ${escapeHtml(work.work_id)}</div>
          <div class="tag-row">${tags}</div>
          <div class="card-actions">
            <button class="button button-secondary" data-open-work="${work.id}">查看與評分</button>
            <button class="button button-secondary" data-flip-card="${escapeHtml(work.platform)}">${escapeHtml(platformFlipLabel(work.platform))}</button>
            <button class="button button-primary" data-refresh-platform="${escapeHtml(work.platform)}" aria-label="更新 ${escapeHtml(PLATFORM_LABELS[work.platform])}">↻</button>
          </div>
        </div>
      </article>`;
  }

  function workCardBackHtml(platform) {
    const ids = state.recentByPlatform[platform] || [];
    const works = ids.map(id => state.workById.get(id)).filter(Boolean);
    const isNhentai = platform === "nhentai";
    return `
      <article class="work-card card-back" data-card="${escapeHtml(platform)}">
        <span class="platform-badge">${escapeHtml(PLATFORM_LABELS[platform])}</span>
        <h3>${isNhentai ? "最近抽過的車號" : "最近抽過的作品"}</h3>
        <p class="muted">${isNhentai ? "刷新卡片會自動記錄；點車號可開詳情，一鍵可複製本張卡片背面的全部車號。" : "刷新卡片會自動記錄；點作品可開詳情，一鍵可複製標題與來源連結。"}</p>
        <div class="card-history-list">
          ${works.map(work => `<button class="card-history-item" data-open-work="${work.id}"><strong>${escapeHtml(isNhentai ? work.work_id : work.title)}</strong><small>${escapeHtml(isNhentai ? work.title : work.source_url || work.work_id)}</small></button>`).join("") || '<p class="muted">這張卡片還沒有抽取紀錄。</p>'}
        </div>
        <div class="card-actions">
          <button class="button button-secondary" data-copy-card-ids="${escapeHtml(platform)}">${escapeHtml(platformCopyLabel(platform))}</button>
          <button class="button button-secondary" data-reset-card-history="${escapeHtml(platform)}">清除這張紀錄</button>
          <button class="button button-primary" data-flip-card="${escapeHtml(platform)}">回到封面</button>
        </div>
      </article>`;
  }

  function renderPlatformCard(platform, work) {
    const existing = $(`[data-card="${platform}"]`);
    if (!existing) return;
    if (!work) {
      existing.outerHTML = `<div class="card-placeholder" data-card="${platform}"><div>${emptyPlatformHtml(platform)}</div></div>`;
      return;
    }
    existing.outerHTML = workCardHtml(work);
  }

  function flipCard(platform) {
    state.cardSideByPlatform[platform] = state.cardSideByPlatform[platform] === "back" ? "front" : "back";
    renderPlatformCard(platform, state.currentByPlatform[platform]);
  }

  async function copyCardIds(platform) {
    const works = (state.recentByPlatform[platform] || [])
      .map(id => state.workById.get(id))
      .filter(Boolean);
    if (!works.length) {
      return toast(platform === "nhentai" ? "這張卡片還沒有可複製的車號" : "這張卡片還沒有可複製的作品", "warning");
    }
    const lines = works.map(copyLineForWork).filter(Boolean);
    await navigator.clipboard.writeText(lines.join("\n\n"));
    toast(platform === "nhentai" ? `已複製 ${lines.length} 個車號` : `已複製 ${lines.length} 筆標題/連結`, "success");
  }

  function librarySortMode() {
    return $("#library-sort")?.value || "default";
  }

  function sortLibraryRows(rows, query) {
    return sortWorksByMode(rows, librarySortMode(), query);
  }

  function librarySummaryText(works, query) {
    const mode = librarySortMode();
    const sortLabels = {
      default: normalize(query) ? "搜尋相關性" : "隨機打亂",
      "score-desc": "平均分（高→低）",
      "score-asc": "平均分（低→高）",
      "reviews-desc": "評分數量（多→少）",
      "reviews-asc": "評分數量（少→多）",
      "favorites-desc": "收藏數（多→少）",
      "favorites-asc": "收藏數（少→多）"
    };
    return `${works.length.toLocaleString()} 筆符合條件；排序：${sortLabels[mode] || sortLabels.default}`;
  }

  function filteredLibraryWorks() {
    const platform = $("#library-platform").value;
    const query = $("#library-search").value;
    const scope = $("#library-scope")?.value || "all";
    let rows = state.works.filter(work =>
      (platform === "all" || work.platform === platform) &&
      (scope !== "favorites" || state.favorites.has(work.id)) &&
      workMatches(work, query) &&
      passesWorkFilters(work, "library")
    );
    if (scope === "favorites" && !state.session) {
      rows = [];
    }
    rows = sortLibraryRows(rows, query);
    return diversifyByAuthor(dedupeWorks(rows), query.trim() ? 4 : 3);
  }

  function renderLibrary(reset = false) {
    if (reset) state.libraryVisible = 60;
    const works = filteredLibraryWorks();
    const scope = $("#library-scope")?.value || "all";
    const query = $("#library-search")?.value || "";
    $("#library-summary").textContent = scope === "favorites" && !state.session
      ? "請先登入後查看你的收藏"
      : librarySummaryText(works, query);
    $("#library-grid").innerHTML = works.slice(0, state.libraryVisible).map(work => `
      <article class="library-item">
        <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
          <img src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}" loading="lazy">
        </a>
        ${adminDeleteButtonHtml(work.id)}
        ${favoriteButtonHtml(work.id)}
        <div class="library-item-body">
          <h3>${escapeHtml(work.title)}</h3>
          <p>${escapeHtml(PLATFORM_LABELS[work.platform])} · ${escapeHtml(work.author)}</p>
          ${scoreBadgeHtml(work.id, true)}
          <button class="button button-secondary library-review-button" data-open-work="${work.id}">看評論與分數</button>
        </div>
      </article>`).join("") || '<div class="empty-state">沒有符合條件的作品</div>';
    $("#library-more").classList.toggle("hidden", works.length <= state.libraryVisible);
  }

  function renderBulkDraw() {
    const panel = $("#bulk-draw-panel");
    const list = $("#bulk-draw-list");
    if (!panel || !list) return;
    panel.classList.toggle("hidden", !state.bulkWorks.length);
    list.innerHTML = state.bulkWorks.map(work => `
      <article class="bulk-draw-item">
        <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
          <img src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}" loading="lazy">
        </a>
        ${favoriteButtonHtml(work.id)}
        <div class="bulk-draw-body">
          <h3>${escapeHtml(work.title)}</h3>
          <p>${escapeHtml(PLATFORM_LABELS[work.platform])} · ID ${escapeHtml(work.work_id)}</p>
          ${scoreBadgeHtml(work.id, true)}
          <div class="card-actions compact">
            <button class="button button-secondary" data-open-work="${work.id}">查看與評分</button>
            <button class="button button-secondary" data-copy-single="${work.id}">${escapeHtml(platformCopyLabel(work.platform))}</button>
          </div>
        </div>
      </article>`).join("");
  }

  async function copySingleWork(workId) {
    const work = state.workById.get(workId);
    if (!work) return;
    const text = copyLineForWork(work);
    if (!text) return toast("沒有可複製的內容", "warning");
    await navigator.clipboard.writeText(text);
    toast(work.platform === "nhentai" ? "已複製車號" : "已複製標題/連結", "success");
  }

  function rankingScoreHtml(item) {
    if (!item.review_count) {
      return `<div class="score"><span class="info-badge" data-tooltip="尚無主評論，因此不列入排行榜。" aria-label="分數說明">?</span><strong>--</strong><small>尚無評分</small></div>`;
    }
    const tooltip = `加權 ${Number(item.weighted_score).toFixed(2)}；原始平均 ${Number(item.raw_average).toFixed(2)}（${item.review_count} 則評分）`;
    return `<div class="score"><span class="info-badge" data-tooltip="${escapeHtml(tooltip)}" aria-label="分數說明">?</span><strong>${Number(item.weighted_score).toFixed(2)}</strong><small>原始 ${Number(item.raw_average).toFixed(2)}</small></div>`;
  }

  function renderLeaderboard() {
    const tab = document.querySelector(".ranking-tab.active")?.dataset.rankingTab || "alltime";
    if (tab === "weekly") return renderWeeklyLeaderboard();
    const platform = $("#ranking-platform").value;
    const order = $("#ranking-order").value;
    let rows = state.leaderboard.filter(item => (platform === "all" || item.platform === platform) && Number(item.review_count || 0) > 0);
    rows.sort((a, b) => (order === "top" ? 1 : -1) * (Number(b.weighted_score) - Number(a.weighted_score)));
    rows = rows.slice(0, 30);
    const emptyHint = state.leaderboard.some(item => Number(item.review_count || 0) > 0)
      ? "這個平台目前還沒有足夠的評分資料"
      : "目前全站評分還很少，有人評分後才會出現在排行榜（不會顯示假的 5.0）。";
    $("#ranking-list").innerHTML = rows.map((item, index) => `
      <article class="ranking-row" data-open-work="${item.work_id}">
        <div class="ranking-number">#${index + 1}</div>
        <img src="${escapeHtml(imageUrl(item.cover_url))}" alt="" loading="lazy">
        <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(PLATFORM_LABELS[item.platform])} · ${escapeHtml(item.author)} · ${item.review_count} 則評分</p></div>
        ${rankingScoreHtml(item)}
      </article>`).join("") || `<div class="empty-state">${emptyHint}</div>`;
  }

  function renderWeeklyLeaderboard() {
    const platform = $("#ranking-platform").value;
    let rows = state.weeklyLeaderboard.filter(item => platform === "all" || item.platform === platform);
    rows = rows.slice(0, 30);
    $("#ranking-list").innerHTML = rows.map((item, index) => `
      <article class="ranking-row" data-open-work="${item.work_id}">
        <div class="ranking-number">#${index + 1}</div>
        <img src="${escapeHtml(imageUrl(item.cover_url))}" alt="" loading="lazy">
        <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(PLATFORM_LABELS[item.platform])} · ${escapeHtml(item.author)} · 本週 ${item.review_count} 則主評論</p></div>
        ${rankingScoreHtml(item)}
      </article>`).join("") || '<div class="empty-state">本週還沒有新的主評論；週一 00:00（台北時間）起算的評分活動會出現在這裡。</div>';
  }

  function switchRankingTab(tab) {
    $$(".ranking-tab").forEach(button => button.classList.toggle("active", button.dataset.rankingTab === tab));
    $("#ranking-order-wrap")?.classList.toggle("hidden", tab === "weekly");
    $("#ranking-explainer-alltime")?.classList.toggle("hidden", tab !== "alltime");
    $("#ranking-explainer-weekly")?.classList.toggle("hidden", tab !== "weekly");
    renderLeaderboard();
  }

  async function refreshAutoApproveStatus() {
    try {
      const { data, error } = await supabase.rpc("get_auto_approve_status");
      if (error) throw error;
      state.autoApproveOpen = Boolean(data?.open);
    } catch (error) {
      console.warn("get_auto_approve_status failed", error);
      state.autoApproveOpen = false;
    }
    return state.autoApproveOpen;
  }

  async function claimAutoApprovalIfNeeded(profile) {
    if (!profile || profile.status !== "pending") return profile;
    try {
      const { data, error } = await supabase.rpc("claim_auto_approval");
      if (error) throw error;
      if (data?.approved) {
        const { data: refreshed } = await supabase.from("profiles").select("*").eq("id", profile.id).maybeSingle();
        return refreshed || { ...profile, status: "active" };
      }
    } catch (error) {
      console.warn("claim_auto_approval failed", error);
    }
    return profile;
  }

  async function loadAuth() {
    if (loadAuthPromise) return loadAuthPromise;
    const runId = ++loadAuthRun;
    state.authLoading = true;
    state.profileReady = false;
    updateAuthUi();
    loadAuthPromise = (async () => {
      try {
        await refreshAutoApproveStatus();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (runId !== loadAuthRun) return;
        if (sessionError) {
          toast(`讀取登入狀態失敗：${sessionError.message}`, "error");
          state.session = null;
          state.profile = null;
          return;
        }
        state.session = session;
        if (!session) {
          state.profile = null;
          state.favorites.clear();
          state.preferenceTags.clear();
          return;
        }
        let { data, error: profileError } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        if (runId !== loadAuthRun) return;
        if (profileError) {
          toast(`讀取會員資料失敗：${formatApiError(profileError)}`, "error");
        } else {
          if (data?.status === "pending") data = await claimAutoApprovalIfNeeded(data);
          state.profile = data;
          state.profileReady = Boolean(data);
          if (!data) toast("正在建立會員資料，部分功能可能暫時不可用", "warning");
        }
        const favoritesOk = await loadFavorites();
        if (favoritesOk) await loadPreferences();
      } catch (error) {
        console.error("loadAuth failed", error);
        toast(`登入狀態更新失敗：${error.message || error}`, "error");
      } finally {
        if (runId === loadAuthRun) {
          state.authLoading = false;
          state.profileReady = Boolean(state.session && state.profile);
          updateAuthUi();
          updateAdminStatusBar();
          loadAuthPromise = null;
        }
        renderBulkDraw();
        if ($("#view-library")?.classList.contains("active")) renderLibrary();
      }
    })();
    return loadAuthPromise;
  }

  function login() {
    openModal("auth-modal");
    $("#password-login-email")?.focus();
  }

  function updateGoogleProviderUi() {
    const button = $("#google-login-button");
    const help = $("#auth-help");
    if (!button || !help) return;
    const checking = state.googleProviderEnabled === null;
    button.disabled = checking;
    button.setAttribute("aria-busy", String(checking));
    if (checking) {
      help.textContent = "正在檢查 Google 登入狀態…";
    } else if (state.googleProviderEnabled) {
      help.textContent = state.autoApproveOpen
        ? "目前開放審核中：新註冊／登入會自動通過。Google 可用；若失敗請改用信箱登入。"
        : "Google 登入已可使用；第一次登入後需等待管理員審核，才可留言、評分與收藏。若 Google 失敗，請改用下方信箱登入，或確認 Supabase Site URL 為 /acg-portal/（Console 可設 localStorage.setItem('acg_debug_auth','1') 看詳情）。";
    } else {
      help.textContent = state.autoApproveOpen
        ? "目前開放審核中：新註冊／登入會自動通過。Google OAuth 尚未啟用，請先用信箱＋站內密碼。"
        : "Google OAuth 尚未在 Supabase 啟用；目前請先使用信箱＋站內密碼或信箱魔法連結。";
    }
  }

  async function detectGoogleProvider() {
    state.googleProviderEnabled = null;
    updateGoogleProviderUi();
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: config.supabaseAnonKey }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const settings = await response.json();
      state.googleProviderEnabled = Boolean(settings?.external?.google);
    } catch (error) {
      console.warn("Unable to detect Google auth provider status", error);
      state.googleProviderEnabled = config.googleProviderEnabled === true || config.googleProviderEnabled === "auto";
    }
    updateGoogleProviderUi();
    return state.googleProviderEnabled;
  }

  async function loginWithGoogle() {
    const button = $("#google-login-button");
    if (state.googleProviderEnabled === null) await detectGoogleProvider();
    if (!state.googleProviderEnabled) {
      $("#auth-help").textContent = "Google provider 尚未在 Supabase 啟用，所以我先不跳轉，避免再次出現 400 JSON 錯誤。請先用 Gmail 信箱＋站內密碼登入。";
      return toast("Google OAuth 尚未啟用；請先用 Gmail 信箱帳密登入", "warning");
    }
    const redirectTo = authRedirectUrl();
    markOAuthPending("google");
    authDebug("oauth start", { redirectTo });
    await withBusyButton(button, "跳轉中…", async () => {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) {
        clearOAuthPending();
        const message = error.message || "";
        if (message.includes("Unsupported provider") || message.includes("provider is not enabled")) {
          $("#auth-help").textContent = "Google provider 尚未在 Supabase 啟用。請先用 Gmail 信箱帳密登入；之後可到 Supabase Dashboard → Authentication → Providers → Google 啟用 OAuth。";
        }
        toast(`Google OAuth 尚未啟用或設定錯誤：${message}`, "error");
      }
    });
  }

  async function loginWithEmail() {
    const field = $("#email-login-input") || $("#password-login-email");
    const email = field?.value.trim() || "";
    if (!email || !email.includes("@")) return toast("請輸入有效信箱", "warning");
    const redirectTo = authRedirectUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) return toast(`信箱登入失敗：${error.message}`, "error");
    $("#auth-help").textContent = "登入連結已寄出，請到信箱點擊連結後回到本站。";
    toast("登入連結已寄出", "success");
  }

  async function loginWithPassword() {
    const email = $("#password-login-email").value.trim();
    const password = $("#password-login-password").value;
    if (!email || !email.includes("@") || !password) return toast("請輸入信箱與密碼", "warning");
    if (password.length < 6) return toast("密碼至少 6 碼", "warning");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const help = $("#auth-help");
      const msg = error.message || "";
      if (/invalid login credentials|invalid.*email.*password/i.test(msg)) {
        if (help) help.textContent = "帳密不對。若第一次來，請先按「建立帳號」並到信箱點確認連結後再登入。";
        return toast("帳密錯誤：沒帳號請先「建立帳號」", "error");
      }
      if (/email not confirmed/i.test(msg)) {
        if (help) help.textContent = "信箱尚未確認。請打開註冊信裡的連結後，再回來用同一組帳密登入。";
        return toast("請先點擊確認信，再登入", "error");
      }
      return toast(`帳密登入失敗：${msg}`, "error");
    }
    closeModal("auth-modal");
    toast("已登入", "success");
    await loadAuth();
  }

  async function signupWithPassword() {
    const email = $("#password-login-email").value.trim();
    const password = $("#password-login-password").value;
    if (!email || !email.includes("@") || !password) return toast("請輸入信箱與密碼後再建立帳號", "warning");
    if (password.length < 6) return toast("密碼至少 6 碼", "warning");
    const redirectTo = authRedirectUrl();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) {
      const msg = error.message || "";
      if (/already registered|user already/i.test(msg)) {
        $("#auth-help").textContent = "這個信箱已註冊過，請直接按「登入」。若忘記密碼，請到 Supabase 由站長協助重設。";
        return toast("帳號已存在，請直接登入", "warning");
      }
      return toast(`建立帳號失敗：${msg}`, "error");
    }
    if (data?.session) {
      closeModal("auth-modal");
      toast(
        state.autoApproveOpen
          ? "帳號已建立並自動通過審核"
          : "帳號已建立並登入；請等站長審核後才能評分收藏",
        "success"
      );
      await loadAuth();
      return;
    }
    $("#auth-help").textContent = state.autoApproveOpen
      ? "確認信已寄出。點連結後回來登入即可使用（目前開放審核中）。"
      : "確認信已寄出。請到信箱點連結完成驗證後，再用同一組密碼回來登入；登入後仍需等站長審核。";
    toast("請先到信箱確認，再回來登入", "success");
  }

  async function logout() {
    await supabase.auth.signOut();
    state.session = null;
    state.profile = null;
    state.profileReady = false;
    state.authLoading = false;
    state.favorites.clear();
    state.preferenceTags.clear();
    updateAuthUi();
    toast("已登出");
  }

  function openProfileEditor() {
    if (!state.session) { login(); return; }
    const current = cleanName(state.profile?.display_name) || myDisplayName();
    $("#editor-content").innerHTML = `
      <h2 id="editor-title">修改暱稱</h2>
      <form id="profile-editor-form" class="editor-form">
        <label>顯示名稱（1～40 字）
          <input id="profile-display-name" type="text" maxlength="40" required value="${escapeHtml(current)}" autocomplete="nickname">
        </label>
        <p class="muted small-note">非管理員每月僅能改名一次；改名後全站留言會同步顯示新名稱。</p>
        <button class="button button-primary" type="submit">儲存暱稱</button>
      </form>`;
    openModal("editor-modal");
    setTimeout(() => $("#profile-display-name")?.focus(), 40);
  }

  async function saveProfileName(event) {
    event.preventDefault();
    if (!state.session) return;
    const name = $("#profile-display-name").value.trim();
    if (name.length < 1 || name.length > 40) return toast("暱稱需為 1～40 字", "warning");
    const { data, error } = await supabase.rpc("update_my_profile", { new_display_name: name });
    if (error) return toast(`暱稱更新失敗：${error.message}`, "error");
    if (data) state.profile = data;
    else if (state.profile) state.profile.display_name = name;
    updateAuthUi();
    state.profiles.set(state.session.user.id, { ...(state.profiles.get(state.session.user.id) || {}), display_name: name });
    closeModal("editor-modal");
    toast("暱稱已更新", "success");
  }

  function updateAuthUi() {
    const loggedIn = Boolean(state.session);
    $("#login-button").classList.toggle("hidden", loggedIn);
    $("#profile-menu").classList.toggle("hidden", !loggedIn);
    $("#clear-auth-button")?.classList.toggle("hidden", !loggedIn);
    if (loggedIn) {
      $("#profile-name").textContent = myDisplayName();
      let statusLabel;
      if (state.authLoading || !state.profileReady) {
        statusLabel = "載入中…";
      } else {
        const labels = { pending: "等待管理員審核", active: isAdmin() ? "管理員" : "已通過審核", suspended: "帳號已停權" };
        statusLabel = labels[state.profile?.status] || "建立資料中";
      }
      $("#profile-status").textContent = statusLabel;
      $("#profile-avatar").src = state.profile?.avatar_url || state.session.user.user_metadata?.avatar_url || imageUrl("");
    }
    const gameBtn = $("#new-game-button");
    const adminNav = $('a[data-view="admin"]');
    if (loggedIn && (state.authLoading || !state.profileReady)) {
      gameBtn?.classList.remove("hidden");
      if (gameBtn) {
        gameBtn.disabled = true;
        gameBtn.textContent = "載入中…";
      }
      adminNav?.classList.remove("hidden");
      if (adminNav) adminNav.textContent = "⚙ 載入中…";
    } else {
      if (gameBtn) {
        gameBtn.disabled = false;
        gameBtn.textContent = "＋ 新增評鑑";
      }
      if (adminNav) adminNav.textContent = "⚙ 管理後台";
      $$(".admin-only").forEach(node => node.classList.toggle("hidden", !isAdmin()));
    }
    if (!isAdmin() && state.profileReady && !state.authLoading && location.hash === "#admin") {
      location.hash = "#home";
    }
    updateGoogleProviderUi();
    updateAdminStatusBar();
  }

  async function requireMember(actionLabel = "此功能") {
    if (!state.session) {
      toast("尚未登入", "warning");
      return false;
    }
    if (!state.profileReady) {
      toast("會員資料載入中，請稍候…", "warning");
      const profile = await waitForProfile();
      if (!profile) {
        toast("無法讀取會員資料，請重新整理後再試", "error");
        return false;
      }
    }
    if (state.profile?.status === "pending") {
      toast(state.autoApproveOpen ? "帳號資料尚未就緒，請稍候再試或重新整理" : "帳號仍在等待管理員審核", "warning");
      return false;
    }
    if (state.profile?.status === "suspended") {
      toast("帳號已停權", "error");
      return false;
    }
    if (!isApproved()) {
      toast(`帳號狀態為 ${state.profile?.status || "未知"}，無法使用${actionLabel}`, "warning");
      return false;
    }
    return true;
  }

  async function loadFavorites() {
    if (!state.session) return false;
    const { data, error } = await supabase.from("favorites").select("work_id").eq("user_id", state.session.user.id);
    if (error) {
      toast(`讀取收藏失敗：${error.message}`, "error");
      return false;
    }
    state.favorites = new Set((data || []).map(item => item.work_id));
    return true;
  }

  async function loadPreferences() {
    if (!state.session || !isApproved()) return;
    const [{ data: history }, { data: reviews }] = await Promise.all([
      supabase.from("viewing_history").select("work_id,interaction").eq("user_id", state.session.user.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("reviews").select("work_id,rating").eq("user_id", state.session.user.id).is("parent_id", null)
    ]);
    const weights = new Map();
    const add = (workId, weight) => {
      const work = state.workById.get(workId);
      for (const tag of work?.tags || []) {
        const key = normalize(tag);
        weights.set(key, (weights.get(key) || 0) + weight);
      }
    };
    state.favorites.forEach(workId => add(workId, 3));
    (history || []).forEach(item => add(item.work_id, item.interaction === "hide" ? -2 : .25));
    (reviews || []).forEach(item => add(item.work_id, Number(item.rating || 0) / 2));
    state.preferenceTags = weights;
  }

  async function toggleFavorite(workId) {
    if (!await requireMember()) return;
    if (state.favorites.has(workId)) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", state.session.user.id).eq("work_id", workId);
      if (error) return toast(error.message, "error");
      state.favorites.delete(workId);
      toast("已取消收藏");
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: state.session.user.id, work_id: workId });
      if (error) return toast(error.message, "error");
      state.favorites.add(workId);
      toast("已加入收藏", "success");
    }
    updateFavoriteButtons(workId);
    await loadPreferences();
    if ($("#view-library").classList.contains("active")) renderLibrary();
    renderBulkDraw();
  }

  function updateFavoriteButtons(workId) {
    $$(`[data-favorite="${workId}"]`).forEach(button => {
      const active = state.favorites.has(workId);
      button.classList.toggle("active", active);
      button.setAttribute("aria-label", active ? "取消收藏" : "加入收藏");
      button.setAttribute("title", active ? "取消收藏" : "加入收藏");
      button.textContent = button.classList.contains("quick-favorite")
        ? favoriteIcon(workId)
        : `${favoriteIcon(workId)} ${active ? "已收藏" : "收藏"}`;
    });
  }

  async function recordView(workId, interaction = "open") {
    if (!state.session || !isApproved()) return;
    await supabase.from("viewing_history").insert({ user_id: state.session.user.id, work_id: workId, interaction });
  }

  async function openWork(workId, { reviewId = null } = {}) {
    const work = state.workById.get(workId);
    if (!work) return;
    state.currentWork = work;
    const tags = (work.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    $("#detail-content").innerHTML = `
      <div class="detail-hero">
        <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
          <img class="detail-cover" src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}">
        </a>
        <div class="detail-info">
          <p class="eyebrow">${escapeHtml(PLATFORM_LABELS[work.platform])} · ID ${escapeHtml(work.work_id)}</p>
          <h2 id="detail-title">${escapeHtml(work.title)}</h2>
          <p>${escapeHtml(work.author)}${work.publisher ? ` · ${escapeHtml(work.publisher)}` : ""}</p>
          <div class="tag-row">${tags || '<span class="muted">尚無標籤</span>'}</div>
          <div class="detail-actions">
            <a class="button button-primary" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer">前往來源 ↗</a>
            ${favoriteButtonHtml(work.id, true)}
            <button class="button button-secondary" data-similar="${work.id}">推薦相似</button>
          </div>
        </div>
      </div>
      <div class="review-area">
        <h3>評分與評論</h3>
        <div id="review-form-container"></div>
        <div id="reviews-list"><p class="muted">載入評論中…</p></div>
      </div>`;
    openModal("detail-modal");
    recordView(work.id);
    await renderReviews(work.id);
    scrollToReview(reviewId);
  }

  async function navigateToReportedContent(workId, reviewId) {
    let resolvedWorkId = workId || null;
    if (!resolvedWorkId && reviewId) {
      const cached = state.currentReviews.get(reviewId);
      if (cached?.work_id) resolvedWorkId = cached.work_id;
      else {
        const { data, error } = await supabase.from("reviews").select("work_id").eq("id", reviewId).maybeSingle();
        if (error || !data?.work_id) return toast("找不到對應作品", "warning");
        resolvedWorkId = data.work_id;
      }
    }
    if (!resolvedWorkId) return toast("此檢舉沒有關聯作品", "warning");
    if (!state.workById.has(resolvedWorkId)) await loadWorks();
    if (!state.workById.has(resolvedWorkId)) return toast("作品已下架或不存在", "warning");
    const hash = reviewId ? `#work-${resolvedWorkId}-review-${reviewId}` : `#work-${resolvedWorkId}`;
    history.replaceState(null, "", hash);
    switchView("home");
    await openWork(resolvedWorkId, { reviewId: reviewId || null });
  }

  async function clearAuthStorage() {
    if (!confirm("清除本站登入 cookie／localStorage？將登出且需重新登入。")) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("acg-portal") || key.startsWith("acg_"))) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem("acg_oauth_pending");
    await supabase.auth.signOut();
    state.session = null;
    state.profile = null;
    state.favorites.clear();
    updateAuthUi();
    toast("已清除登入資料", "success");
  }

  function renderReviewForm(existing = null) {
    const container = $("#review-form-container");
    if (!container) return;
    if (!state.session) {
      container.innerHTML = '<div class="review-form"><p class="muted">登入並通過審核後即可評分。</p><button class="button button-primary" data-login>登入</button></div>';
      return;
    }
    if (!isApproved()) {
      container.innerHTML = state.autoApproveOpen
        ? '<div class="review-form"><p class="muted">目前開放審核中；若剛登入請重新整理後再評分。</p></div>'
        : '<div class="review-form"><p class="muted">帳號正在等待管理員審核；公開內容仍可正常瀏覽。</p></div>';
      return;
    }
    state.currentRating = Number(existing?.rating ?? 5);
    container.innerHTML = `
      <form id="review-form" class="review-form">
        <div><strong>${existing ? "編輯你的評分" : "留下你的評分"}</strong><p class="muted">每件作品限一則主評論；評分 -5 ~ +5 必填，評論文字選填（最多 500 字）。</p></div>
        <div class="rating-picker">${Array.from({ length: 11 }, (_, i) => i - 5).map(value => `<button type="button" data-rating="${value}" class="${value === state.currentRating ? "selected" : ""}">${value > 0 ? "+" : ""}${value}</button>`).join("")}</div>
        <textarea id="review-body" maxlength="500" placeholder="選填：分享你的心得…">${escapeHtml(existing?.body || "")}</textarea>
        <button class="button button-primary" type="submit">${existing ? "儲存修改" : "送出評分"}</button>
      </form>`;
  }

  async function loadProfilesForReviews(reviews) {
    const ids = [...new Set(reviews.map(review => review.user_id))].filter(id => !state.profiles.has(id));
    if (!ids.length) return;
    const { data } = await supabase.from("profiles").select("id,display_name,avatar_url,role,status").in("id", ids);
    (data || []).forEach(profile => state.profiles.set(profile.id, profile));
  }

  async function renderReviews(workId) {
    const { data: reviews, error } = await supabase.from("reviews").select("*").eq("work_id", workId).order("created_at", { ascending: true });
    if (error) { $("#reviews-list").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; return; }
    state.currentReviews = new Map((reviews || []).map(review => [review.id, review]));
    const reviewIds = [...state.currentReviews.keys()];
    const { data: votes } = reviewIds.length
      ? await supabase.from("review_votes").select("review_id,user_id,vote").in("review_id", reviewIds)
      : { data: [] };
    await loadProfilesForReviews([...(reviews || []), ...(votes || []).map(vote => ({ user_id: vote.user_id }))]);
    const voteStats = new Map();
    const adminIds = new Set([...state.profiles.values()].filter(p => p.role === "admin").map(p => p.id));
    for (const vote of votes || []) {
      const stats = voteStats.get(vote.review_id) || { up: 0, down: 0, mine: 0, adminVotes: [] };
      if (vote.vote === 1) stats.up++; else stats.down++;
      if (vote.user_id === state.session?.user?.id) stats.mine = vote.vote;
      if (adminIds.has(vote.user_id)) stats.adminVotes.push(vote);
      voteStats.set(vote.review_id, stats);
    }
    const roots = (reviews || []).filter(review => !review.parent_id && review.status === "visible");
    const replies = new Map();
    (reviews || []).filter(review => review.parent_id && review.status === "visible").forEach(review => {
      if (!replies.has(review.parent_id)) replies.set(review.parent_id, []);
      replies.get(review.parent_id).push(review);
    });
    const mine = roots.find(review => review.user_id === state.session?.user?.id);
    renderReviewForm(mine);
    const reviewHtml = review => {
      const profile = state.profiles.get(review.user_id) || null;
      const stats = voteStats.get(review.id) || { up: 0, down: 0, mine: 0 };
      const canDelete = reviewDeletable(review);
      const canEdit = reviewEditable(review);
      const bodyHtml = review.body ? `<p>${escapeHtml(review.body)}</p>` : '<p class="muted">（僅評分，無文字評論）</p>';
      return `<article class="review" data-review="${review.id}">
        ${adminVoteHint(review.id, stats)}
        <div class="review-header"><strong>${escapeHtml(memberName(profile))}${profile?.role === "admin" ? " · ADMIN" : ""}</strong>${review.rating === null ? "" : `<span>${review.rating > 0 ? "+" : ""}${review.rating}</span>`}</div>
        ${bodyHtml}
        <div class="review-footer">
          <button data-vote="1" data-review-id="${review.id}">${stats.mine === 1 ? "●" : "▲"} ${stats.up}</button>
          <button data-vote="-1" data-review-id="${review.id}">${stats.mine === -1 ? "●" : "▼"} ${stats.down}</button>
          ${!review.parent_id ? `<button data-reply="${review.id}">回覆</button>` : ""}
          ${canEdit ? `<button data-edit-review="${review.id}">編輯</button>` : ""}
          <button data-report="${review.id}">檢舉</button>
          ${canDelete ? `<button data-delete-review="${review.id}">刪除</button>` : ""}
        </div>
      </article>`;
    };
    $("#reviews-list").innerHTML = roots.map(root => `${reviewHtml(root)}<div class="replies">${(replies.get(root.id) || []).map(reviewHtml).join("")}</div><div class="reply-form" id="reply-${root.id}"></div>`).join("") || '<p class="muted">目前還沒有評論，成為第一位評分者吧。</p>';
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!await requireMember() || !state.currentWork) return;
    const body = ($("#review-body")?.value || "").trim();
    if (body.length > 500) return toast("評論最多 500 字", "warning");
    const { data: existing } = await supabase.from("reviews").select("id").eq("work_id", state.currentWork.id).eq("user_id", state.session.user.id).is("parent_id", null).maybeSingle();
    const request = existing
      ? supabase.from("reviews").update({ body, rating: state.currentRating }).eq("id", existing.id)
      : supabase.from("reviews").insert({ work_id: state.currentWork.id, user_id: state.session.user.id, body, rating: state.currentRating });
    const { error } = await request;
    if (error) {
      const dup = /duplicate key|unique|one_root_per_user/i.test(error.message);
      return toast(dup ? "你已經評分過這件作品了" : error.message, "error");
    }
    toast(existing ? "評分已更新" : "評分已送出", "success");
    await renderReviews(state.currentWork.id);
    await loadLeaderboardData();
    await loadPreferences();
  }

  async function submitReply(parentId) {
    if (!await requireMember() || !state.currentWork) return;
    const body = $(`#reply-body-${parentId}`)?.value.trim();
    if (!body || body.length > 300) return toast("回覆需為 1～300 字", "warning");
    const { error } = await supabase.from("reviews").insert({ work_id: state.currentWork.id, user_id: state.session.user.id, parent_id: parentId, body, rating: null });
    if (error) return toast(error.message, "error");
    await renderReviews(state.currentWork.id);
  }

  async function voteReview(reviewId, vote) {
    if (!await requireMember()) return;
    const { error } = await supabase.rpc("cast_review_vote", { target_review: reviewId, desired_vote: vote });
    if (error) {
      const missing = /function .*cast_review_vote|could not find/i.test(error.message);
      if (missing) {
        const fallback = await supabase.from("review_votes").upsert(
          { review_id: reviewId, user_id: state.session.user.id, vote },
          { onConflict: "review_id,user_id" }
        );
        if (fallback.error) {
          const rls = /permission denied|row-level security|policy/i.test(fallback.error.message);
          return toast(rls ? "無法按讚：通常是帳號尚未通過審核，或尚未套用 0007 migration。" : fallback.error.message, "error");
        }
      } else {
        const rls = /permission denied|row-level security|policy|approval required/i.test(error.message);
        return toast(rls ? "無法按讚：請確認帳號已通過審核。" : error.message, "error");
      }
    }
    await renderReviews(state.currentWork.id);
  }

  async function deleteReview(reviewId) {
    if (!state.session || !confirm("確定刪除這則內容？刪除後作品的評分也會從排行榜移除。")) return;
    const review = state.currentReviews.get(reviewId);
    if (review && !reviewDeletable(review)) return toast("超過 30 分鐘，無法再刪除", "warning");
    const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
    if (error) {
      const expired = /delete window expired|Edit window expired|30 minutes/i.test(error.message);
      return toast(expired ? "超過 30 分鐘，無法再刪除" : error.message, "error");
    }
    toast("已刪除", "success");
    await renderReviews(state.currentWork.id);
    await refreshLeaderboardAfterReviewChange();
  }

  async function editReview(reviewId) {
    if (!await requireMember()) return;
    const review = state.currentReviews.get(reviewId);
    if (!review || review.user_id !== state.session.user.id) return;
    if (!reviewEditable(review)) return toast("超過 30 分鐘，無法再編輯", "warning");
    if (!review.parent_id) {
      renderReviewForm(review);
      $("#review-body")?.focus();
      return;
    }
    const body = prompt("編輯回覆（1～300 字）：", review.body)?.trim();
    if (!body || body.length > 300) return;
    const { error } = await supabase.from("reviews").update({ body }).eq("id", reviewId);
    if (error) return toast(error.message, "error");
    await renderReviews(state.currentWork.id);
    toast("回覆已更新", "success");
  }

  async function reportReview(reviewId) {
    state.reportTargetReviewId = reviewId;
    toast("正在開啟檢舉表單…", "info");
    $("#editor-content").innerHTML = `
      <h2 id="editor-title">檢舉內容</h2>
      <div id="report-error" class="form-error hidden" role="alert"></div>
      <form id="report-form" class="editor-form" novalidate data-review-id="${escapeHtml(reviewId)}">
        <label>檢舉原因（3～500 字）
          <textarea id="report-reason" maxlength="500" placeholder="請描述問題，例如：違規內容、錯誤資訊、廣告或洗版…"></textarea>
        </label>
        <button id="btn-submit-report" class="button button-primary" type="button">送出檢舉</button>
      </form>`;
    openModal("editor-modal");
    wireEditorFormHandlers();
    if (!await requireMember("檢舉")) {
      showFormErrorById("#report-error", "無法檢舉：請先登入並通過審核", "warning");
      return;
    }
    setTimeout(() => $("#report-reason")?.focus(), 40);
  }

  async function submitReport(event) {
    event?.preventDefault?.();
    clearFormErrorById("#report-error");
    const form = event?.currentTarget || $("#report-form");
    if (!form) return;
    toast("正在送出檢舉…", "info");
    if (!await requireMember("檢舉")) {
      showFormErrorById("#report-error", "無法檢舉：請先登入並通過審核", "warning");
      return;
    }
    const reviewId = form.dataset.reviewId || state.reportTargetReviewId;
    if (!isValidUuid(reviewId)) {
      const message = "找不到要檢舉的內容，請關閉視窗後再試一次";
      showFormErrorById("#report-error", message, "warning");
      return;
    }
    const reason = $("#report-reason")?.value.trim() || "";
    if (reason.length < 3 || reason.length > 500) {
      const message = "檢舉原因需為 3～500 字";
      showFormErrorById("#report-error", message, "warning");
      return;
    }
    const submitButton = $("#btn-submit-report") || form.querySelector("button");
    await withBusyButton(submitButton, "送出中…", async () => {
      let error = null;
      const { error: rpcError } = await supabase.rpc("submit_content_report", {
        target_review: reviewId,
        report_reason: reason
      });
      if (rpcError) {
        const rpcMissing = /function .*submit_content_report|could not find/i.test(rpcError.message || "");
        if (!rpcMissing) {
          error = rpcError;
        } else {
          const fallback = await supabase.from("content_reports").insert({
            reporter_id: state.session.user.id,
            review_id: reviewId,
            reason
          });
          error = fallback.error;
        }
      }
      if (error) {
        const dup = /duplicate key|unique/i.test(error.message);
        const message = dup ? "你已經檢舉過這則內容了" : `檢舉失敗：${formatApiError(error)}`;
        showFormErrorById("#report-error", message);
        toast(message, "error");
        return;
      }
      closeModal("editor-modal");
      state.reportTargetReviewId = null;
      toast("已送出檢舉", "success");
    });
  }

  function recommendSimilar(workId) {
    const source = state.workById.get(workId);
    if (!source) return;
    const candidates = candidatesFor(source.platform).filter(work => work.id !== source.id);
    const pick = weightedPick(candidates, source);
    if (pick) openWork(pick.id); else toast("目前沒有可推薦的相似作品", "warning");
  }

  function legacyRatingToTen(rating) {
    const n = Number(rating);
    if (!Number.isFinite(n)) return 7;
    if (n >= 1 && n <= 10) return Math.round(n);
    if (n >= -5 && n <= 5) return Math.max(1, Math.min(10, n + 5));
    return 7;
  }

  function normalizeGameScores(raw, fallbackRating) {
    const src = raw && typeof raw === "object" ? raw : {};
    const fallback = legacyRatingToTen(fallbackRating);
    const out = {};
    for (const field of GAME_SCORE_FIELDS) {
      const v = src[field.key];
      if (v === null || v === undefined || v === "") {
        out[field.key] = field.optional ? null : fallback;
      } else {
        const n = Number(v);
        out[field.key] = Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : (field.optional ? null : fallback);
      }
    }
    return out;
  }

  function computeGameScoreTotal(scores) {
    const vals = GAME_SCORE_FIELDS.map(f => scores[f.key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  function gameScoreGrade(total) {
    if (total == null) return null;
    if (total >= 9) return "S";
    if (total >= 8) return "A";
    if (total >= 6.5) return "B";
    if (total >= 5) return "C";
    return "D";
  }

  function gameGradeLabel(grade) {
    return GAME_GRADE_LABELS[grade] || "";
  }

  function formatGameTotal(game) {
    if (game?.score_total != null && Number.isFinite(Number(game.score_total))) {
      return Number(game.score_total).toFixed(1);
    }
    const scores = normalizeGameScores(game?.scores, game?.rating);
    const total = computeGameScoreTotal(scores);
    if (total != null) return total.toFixed(1);
    if (game?.rating != null) return Number(legacyRatingToTen(game.rating)).toFixed(1);
    return "—";
  }

  function formatGameGrade(game) {
    if (game?.grade && GAME_GRADE_LABELS[game.grade]) return game.grade;
    const total = game?.score_total != null ? Number(game.score_total) : computeGameScoreTotal(normalizeGameScores(game?.scores, game?.rating));
    return gameScoreGrade(total) || "";
  }

  function gameScoreSummaryHtml(game, { compact = false } = {}) {
    const total = formatGameTotal(game);
    const grade = formatGameGrade(game);
    const label = gameGradeLabel(grade);
    if (compact) {
      return `<span class="game-rating" title="${grade ? `${grade} · ${label}` : "總分"}">${escapeHtml(total)}<small>/10${grade ? ` · ${grade}` : ""}</small></span>`;
    }
    return `<div class="game-score-hero">
      <div class="game-score-total"><strong>${escapeHtml(total)}</strong><span>/10</span></div>
      ${grade ? `<div class="game-grade grade-${grade}"><b>${escapeHtml(grade)}</b><small>${escapeHtml(label)}</small></div>` : ""}
    </div>`;
  }

  function gameScoreBreakdownHtml(game) {
    const scores = normalizeGameScores(game?.scores, game?.rating);
    const rows = GAME_SCORE_FIELDS.map(field => {
      const v = scores[field.key];
      const display = v == null ? "N/A" : `${v}`;
      const bar = v == null ? 0 : v * 10;
      return `<div class="game-score-row">
        <span class="game-score-label">${escapeHtml(field.label)}</span>
        <div class="game-score-bar" aria-hidden="true"><i style="width:${bar}%"></i></div>
        <span class="game-score-value">${escapeHtml(display)}${v == null ? "" : "<small>/10</small>"}</span>
      </div>`;
    }).join("");
    return `<div class="game-score-breakdown">${rows}</div>`;
  }

  function gameScoreEditorHtml(game) {
    const scores = normalizeGameScores(game?.scores, game?.rating ?? 7);
    const total = computeGameScoreTotal(scores);
    const grade = gameScoreGrade(total);
    const fields = GAME_SCORE_FIELDS.map(field => {
      const current = scores[field.key];
      const naSelected = field.optional && current == null;
      const buttons = Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
        `<button type="button" class="score-chip${current === n ? " selected" : ""}" data-score-key="${field.key}" data-score-value="${n}">${n}</button>`
      ).join("");
      const naBtn = field.optional
        ? `<button type="button" class="score-chip score-na${naSelected ? " selected" : ""}" data-score-key="${field.key}" data-score-value="na">N/A</button>`
        : "";
      return `<div class="game-score-field" data-score-field="${field.key}">
        <div class="game-score-field-head"><strong>${escapeHtml(field.label)}</strong>${field.optional ? '<span class="muted">可選</span>' : ""}</div>
        <div class="score-chip-row" role="group" aria-label="${escapeHtml(field.label)}">${buttons}${naBtn}</div>
      </div>`;
    }).join("");
    return `<fieldset class="game-score-editor">
      <legend>分項評分（1–10）</legend>
      <p class="muted game-score-hint">總分＝各有效分項等權平均；配音／演出可標 N/A。</p>
      ${fields}
      <div class="game-score-live" id="game-score-live" aria-live="polite">
        預覽總分 <strong>${total != null ? total.toFixed(1) : "—"}</strong>/10
        ${grade ? `· <span class="game-grade-inline grade-${grade}">${grade} ${gameGradeLabel(grade)}</span>` : ""}
      </div>
    </fieldset>`;
  }

  function readGameScoresFromEditor() {
    const scores = {};
    for (const field of GAME_SCORE_FIELDS) {
      const selected = $(`.score-chip.selected[data-score-key="${field.key}"]`);
      if (!selected) {
        scores[field.key] = field.optional ? null : null;
        continue;
      }
      const raw = selected.dataset.scoreValue;
      scores[field.key] = raw === "na" ? null : Number(raw);
    }
    return scores;
  }

  function refreshGameScoreLivePreview() {
    const live = $("#game-score-live");
    if (!live) return;
    const scores = readGameScoresFromEditor();
    const missing = GAME_SCORE_FIELDS.filter(f => !f.optional && (scores[f.key] == null || !Number.isFinite(scores[f.key])));
    if (missing.length) {
      live.innerHTML = `尚缺：${missing.map(f => f.label).join("、")}`;
      return;
    }
    const total = computeGameScoreTotal(scores);
    const grade = gameScoreGrade(total);
    live.innerHTML = `預覽總分 <strong>${total != null ? total.toFixed(1) : "—"}</strong>/10${grade ? ` · <span class="game-grade-inline grade-${grade}">${grade} ${gameGradeLabel(grade)}</span>` : ""}`;
  }

  function wireGameScoreEditor() {
    const form = $("#game-editor-form");
    if (!form) return;
    form.querySelectorAll(".score-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.scoreKey;
        form.querySelectorAll(`.score-chip[data-score-key="${key}"]`).forEach(el => el.classList.toggle("selected", el === btn));
        refreshGameScoreLivePreview();
      });
    });
    refreshGameScoreLivePreview();
  }

  async function loadGames() {
    const { data, error } = await supabase.from("games").select("*").order("created_at", { ascending: false });
    if (error) return toast(error.message, "error");
    $("#games-grid").innerHTML = (data || []).map(game => `
      <article class="game-card" data-open-game="${game.id}">
        <img src="${escapeHtml(imageUrl(game.cover_url))}" alt="${escapeHtml(game.name)}" loading="lazy">
        <div><h3>${escapeHtml(game.name)}</h3>${gameScoreSummaryHtml(game, { compact: true })}<div class="tag-row">${(game.tags || []).slice(0,3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></div>
      </article>`).join("") || '<div class="empty-state">站長尚未發表遊戲評鑑</div>';
  }

  async function openGame(gameId) {
    const { data: game, error } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (error) return toast(error.message, "error");
    state.currentGameId = gameId;
    const { data: comments } = await supabase.from("game_comments").select("*").eq("game_id", gameId).order("created_at");
    await loadProfilesForReviews(comments || []);
    const metaBits = [];
    if (game.developer) metaBits.push(`<span>開發／社團：${escapeHtml(game.developer)}</span>`);
    if (game.product_code) metaBits.push(`<span>代碼：${escapeHtml(game.product_code)}</span>`);
    if (game.work_type_label) metaBits.push(`<span>形式：${escapeHtml(game.work_type_label)}</span>`);
    if (game.cg_type && game.cg_type !== "unknown") {
      metaBits.push(`<span>演出：${escapeHtml(GAME_CG_TYPE_LABELS[game.cg_type] || game.cg_type)}</span>`);
    }
    if (game.release_date) metaBits.push(`<span>發售：${escapeHtml(String(game.release_date).slice(0, 10))}</span>`);
    const sourceLink = game.source_url
      ? `<p class="game-source-link"><a href="${escapeHtml(game.source_url)}" target="_blank" rel="noopener noreferrer">來源頁面</a></p>`
      : "";
    const genreTags = (game.genres || []).length
      ? `<div class="tag-row game-genre-row">${(game.genres || []).slice(0, 16).map(tag => `<span class="tag tag-genre">${escapeHtml(tag)}</span>`).join("")}</div>`
      : "";
    $("#editor-content").innerHTML = `
      <h2 id="editor-title">${escapeHtml(game.name)}</h2>
      <img class="detail-cover" src="${escapeHtml(imageUrl(game.cover_url))}" alt="">
      ${metaBits.length ? `<div class="game-meta-row">${metaBits.join("")}</div>` : ""}
      ${sourceLink}
      ${gameScoreSummaryHtml(game)}
      ${gameScoreBreakdownHtml(game)}
      <p class="game-review-body">${escapeHtml(game.review_body)}</p>
      ${genreTags}
      <div class="tag-row">${(game.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      ${isAdmin() ? `<button class="button button-secondary" data-edit-game="${game.id}">編輯評鑑</button><button class="button button-danger" data-delete-game="${game.id}">刪除評鑑</button>` : ""}
      <hr><h3>會員留言</h3>
      <div>${(comments || []).map(comment => `<div class="review"><strong>${escapeHtml(memberName(state.profiles.get(comment.user_id)))}</strong><p>${escapeHtml(comment.body)}</p>${isAdmin() || comment.user_id === state.session?.user?.id ? `<button data-delete-game-comment="${comment.id}" data-game-id="${game.id}">刪除</button>` : ""}</div>`).join("") || '<p class="muted">尚無留言</p>'}</div>
      ${isApproved() ? `<form id="game-comment-form" class="review-form" data-game-id="${game.id}"><textarea id="game-comment-body" maxlength="500" required placeholder="留言…"></textarea><button class="button button-primary">送出留言</button></form>` : ""}`;
    openModal("editor-modal");
  }

  function gameCgTypeOptionsHtml(selected = "unknown") {
    return Object.entries(GAME_CG_TYPE_LABELS).map(([value, label]) =>
      `<option value="${value}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");
  }

  function gameAutofillPanelHtml() {
    return `<fieldset class="game-autofill-panel">
      <legend>自動填入（DLsite）</legend>
      <p class="muted game-autofill-hint">貼上 RJ／VJ／BJ 代碼或作品頁 URL 最穩；關鍵字搜尋為輔。不會自動填分數。</p>
      <div class="game-autofill-row">
        <input id="game-autofill-query" type="text" maxlength="500" placeholder="例：RJ436654、VJ01000381、或遊戲名稱關鍵字">
        <button id="btn-game-autofill" class="button button-secondary" type="button">搜尋／自動填入</button>
      </div>
      <div id="game-autofill-error" class="form-error hidden" role="alert"></div>
      <div id="game-autofill-status" class="form-status hidden" aria-live="polite"></div>
      <div id="game-autofill-results" class="game-autofill-results hidden"></div>
    </fieldset>`;
  }

  function genresToInputValue(genres) {
    return (Array.isArray(genres) ? genres : []).map(g => String(g || "").trim()).filter(Boolean).join(", ");
  }

  function applyGameAutofillProduct(product, { mergeTags = true } = {}) {
    if (!product) return;
    const nameEl = $("#game-name");
    const coverEl = $("#game-cover");
    const devEl = $("#game-developer");
    const codeEl = $("#game-product-code");
    const sourceEl = $("#game-source-url");
    const releaseEl = $("#game-release-date");
    const workTypeEl = $("#game-work-type");
    const cgEl = $("#game-cg-type");
    const genresEl = $("#game-genres");
    const tagsEl = $("#game-tags");
    const metaEl = $("#game-metadata-json");

    if (nameEl && product.title) nameEl.value = product.title;
    if (coverEl && product.cover_url) coverEl.value = product.cover_url;
    if (devEl) devEl.value = product.developer || "";
    if (codeEl) codeEl.value = product.product_code || "";
    if (sourceEl) sourceEl.value = product.source_url || "";
    if (releaseEl) releaseEl.value = product.release_date ? String(product.release_date).slice(0, 10) : "";
    if (workTypeEl) workTypeEl.value = product.work_type_label || product.work_type || "";
    if (cgEl && product.cg_type) cgEl.value = product.cg_type;
    const genres = Array.isArray(product.genres) ? product.genres : [];
    if (genresEl) genresEl.value = genresToInputValue(genres);
    if (mergeTags && tagsEl && genres.length) {
      const existing = (tagsEl.value || "").split(/[,，]/).map(v => v.trim()).filter(Boolean);
      const merged = [...existing];
      for (const g of genres) {
        if (g && !merged.includes(g)) merged.push(g);
      }
      tagsEl.value = merged.join(", ");
    }
    if (metaEl) metaEl.value = JSON.stringify(product);
    const preview = $("#game-autofill-cover-preview");
    if (preview && product.cover_url) {
      preview.src = imageUrl(product.cover_url);
      preview.classList.remove("hidden");
    }
  }

  function renderGameAutofillResults(payload) {
    const box = $("#game-autofill-results");
    if (!box) return;
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    if (!candidates.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = candidates.map((item, index) => {
      const genres = Array.isArray(item.genres) ? item.genres.slice(0, 6).join(" · ") : "";
      return `<article class="game-autofill-card">
        <img src="${escapeHtml(imageUrl(item.cover_url || ""))}" alt="" loading="lazy">
        <div>
          <strong>${escapeHtml(item.title || item.product_code || "未命名")}</strong>
          <small>${escapeHtml([item.product_code, item.developer, item.work_type_label, GAME_CG_TYPE_LABELS[item.cg_type] || ""].filter(Boolean).join(" · "))}</small>
          ${genres ? `<small class="muted">${escapeHtml(genres)}</small>` : ""}
          <div class="game-autofill-card-actions">
            <button type="button" class="button button-primary button-compact" data-autofill-apply="${index}">套用此筆</button>
            ${item.source_url ? `<a class="button button-secondary button-compact" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">開來源</a>` : ""}
          </div>
        </div>
      </article>`;
    }).join("");
    box.querySelectorAll("[data-autofill-apply]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-autofill-apply"));
        const product = candidates[idx];
        if (!product) return;
        applyGameAutofillProduct(product);
        setFormStatus("#game-autofill-status", `已套用：${product.title || product.product_code || ""}（分數未改動，請手動評分）`);
        toast("已填入作品資料，請繼續填寫分項評分與心得", "success");
      });
    });
  }

  async function runGameAutofill() {
    clearFormErrorById("#game-autofill-error");
    const query = $("#game-autofill-query")?.value.trim() || "";
    if (!query) {
      showFormErrorById("#game-autofill-error", "請輸入 RJ／VJ 代碼、DLsite URL 或關鍵字", "warning");
      return;
    }
    const gate = await ensureAdmin("自動填入遊戲資料");
    if (!gate.ok) {
      showFormErrorById("#game-autofill-error", gate.message);
      return;
    }
    const button = $("#btn-game-autofill");
    await withBusyButton(button, "抓取中…", async () => {
      setFormStatus("#game-autofill-status", "正在向 DLsite 抓取資料…");
      const { data, error } = await supabase.rpc("admin_fetch_game_metadata", { query });
      if (error) {
        setFormStatus("#game-autofill-status", "");
        const message = `自動填入失敗：${formatApiError(error)}`;
        showFormErrorById("#game-autofill-error", message);
        toast(message, "error");
        return;
      }
      const payload = data || {};
      if (!payload.ok) {
        setFormStatus("#game-autofill-status", "");
        const message = "自動填入失敗：來源未回傳有效資料";
        showFormErrorById("#game-autofill-error", message);
        toast(message, "error");
        return;
      }
      renderGameAutofillResults(payload);
      if (payload.mode === "detail" && payload.product) {
        applyGameAutofillProduct(payload.product);
        setFormStatus("#game-autofill-status", `已自動填入 ${payload.product.product_code || ""}（分數未改動）`);
        toast("已自動填入作品資料", "success");
      } else {
        setFormStatus("#game-autofill-status", `找到 ${(payload.candidates || []).length} 筆結果，請選擇要套用的作品`);
        toast(`找到 ${(payload.candidates || []).length} 筆候選`, "info");
      }
    });
  }

  function wireGameAutofill() {
    $("#btn-game-autofill")?.addEventListener("click", () => void runGameAutofill());
    $("#game-autofill-query")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        void runGameAutofill();
      }
    });
  }

  async function gameEditor(game = null) {
    toast("正在開啟遊戲評鑑編輯器…", "info");
    $("#editor-content").innerHTML = `<h2 id="editor-title">${game ? "編輯" : "新增"}遊戲評鑑</h2><div class="empty-state">正在確認管理員權限…</div><div id="game-save-error" class="form-error hidden" role="alert"></div>`;
    openModal("editor-modal");
    if (!state.session) {
      const message = "尚未登入，請先登入";
      showFormErrorById("#game-save-error", message);
      login();
      return;
    }
    const gate = await ensureAdmin("新增／編輯遊戲評鑑");
    if (!gate.ok) {
      showFormErrorById("#game-save-error", gate.message);
      return;
    }
    state.editingGameId = game?.id || null;
    const releaseValue = game?.release_date ? String(game.release_date).slice(0, 10) : "";
    $("#editor-content").innerHTML = `<h2 id="editor-title">${game ? "編輯" : "新增"}遊戲評鑑</h2>
      <div id="game-save-error" class="form-error hidden" role="alert"></div>
      <div id="game-save-status" class="form-status hidden" aria-live="polite"></div>
      <form id="game-editor-form" class="editor-form" novalidate data-game-id="${game?.id || ""}">
        ${gameAutofillPanelHtml()}
        <label>名稱<input id="game-name" type="text" maxlength="300" value="${escapeHtml(game?.name || "")}"></label>
        <label>開發商／社團<input id="game-developer" type="text" maxlength="200" value="${escapeHtml(game?.developer || "")}"></label>
        <label>產品代碼（RJ／VJ／BJ）<input id="game-product-code" type="text" maxlength="32" value="${escapeHtml(game?.product_code || "")}"></label>
        <label>來源連結<input id="game-source-url" type="url" inputmode="url" placeholder="https://www.dlsite.com/…" value="${escapeHtml(game?.source_url || "")}"></label>
        <label>發售日<input id="game-release-date" type="date" value="${escapeHtml(releaseValue)}"></label>
        <label>作品形式<input id="game-work-type" type="text" maxlength="120" value="${escapeHtml(game?.work_type_label || "")}"></label>
        <label>演出類型<select id="game-cg-type">${gameCgTypeOptionsHtml(game?.cg_type || "unknown")}</select></label>
        <label>上傳封面圖片（可選，≤ 5MB）<input id="game-cover-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <label>或直接填封面網址<input id="game-cover" type="text" inputmode="url" placeholder="https://…" value="${escapeHtml(game?.cover_url || "")}"></label>
        ${game?.cover_url ? `<img class="editor-cover-preview" id="game-autofill-cover-preview" src="${escapeHtml(imageUrl(game.cover_url))}" alt="目前封面">` : `<img class="editor-cover-preview hidden" id="game-autofill-cover-preview" alt="封面預覽">`}
        ${gameScoreEditorHtml(game)}
        <label>類型標籤／genres（逗號分隔，自動填入參考）<input id="game-genres" type="text" value="${escapeHtml(genresToInputValue(game?.genres || []))}"></label>
        <label>標籤（逗號分隔）<input id="game-tags" type="text" value="${escapeHtml((game?.tags || []).join(", "))}"></label>
        <label>心得<textarea id="game-review" maxlength="5000">${escapeHtml(game?.review_body || "")}</textarea></label>
        <input id="game-metadata-json" type="hidden" value="${escapeHtml(game?.metadata ? JSON.stringify(game.metadata) : "")}">
        <button id="btn-save-game" class="button button-primary" type="button">儲存評鑑</button>
      </form>`;
    openModal("editor-modal");
    wireEditorFormHandlers();
    wireGameScoreEditor();
    wireGameAutofill();
    setTimeout(() => ($("#game-autofill-query") || $("#game-name"))?.focus(), 40);
  }

  async function uploadGameCover(file, timeoutMs = 20000) {
    if (file.size > 5 * 1024 * 1024) {
      return { url: null, error: "圖片需小於 5MB" };
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      return { url: null, error: "僅支援 PNG / JPG / WEBP / GIF" };
    }
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${crypto.randomUUID?.() || Date.now()}.${ext}`;
    const uploadTask = supabase.storage.from("game-covers").upload(path, file, { contentType: file.type, upsert: false });
    let result;
    try {
      result = await Promise.race([
        uploadTask,
        sleep(timeoutMs).then(() => { throw new Error("圖片上傳逾時，已略過封面並繼續儲存文字內容"); })
      ]);
    } catch (error) {
      return { url: null, error: error.message || "圖片上傳失敗" };
    }
    const { error } = result;
    if (error) {
      const missingBucket = /bucket.*not found|not found/i.test(error.message);
      return {
        url: null,
        error: missingBucket ? "圖片儲存桶尚未建立（需先套用 0005 migration）" : `圖片上傳失敗：${formatApiError(error)}`
      };
    }
    return { url: supabase.storage.from("game-covers").getPublicUrl(path).data.publicUrl, error: null };
  }

  async function saveGame(event) {
    event?.preventDefault?.();
    clearFormErrorById("#game-save-error");
    setFormStatus("#game-save-status", "正在儲存…");
    const form = event?.currentTarget || $("#game-editor-form");
    if (!form) return;
    const gate = await ensureAdmin("儲存遊戲評鑑");
    if (!gate.ok) {
      setFormStatus("#game-save-status", "");
      showFormErrorById("#game-save-error", gate.message, "warning");
      return;
    }
    const submitButton = $("#btn-save-game") || form.querySelector("button");
    const id = normalizeGameId(form.dataset.gameId || state.editingGameId);
    const name = $("#game-name")?.value.trim() || "";
    const reviewBody = $("#game-review")?.value.trim() || "";
    const scores = readGameScoresFromEditor();
    if (!name) {
      setFormStatus("#game-save-status", "");
      const message = "請輸入遊戲名稱";
      showFormErrorById("#game-save-error", message, "warning");
      return;
    }
    if (!reviewBody) {
      setFormStatus("#game-save-status", "");
      const message = "請輸入心得內容";
      showFormErrorById("#game-save-error", message, "warning");
      return;
    }
    const missing = GAME_SCORE_FIELDS.filter(f => !f.optional && (scores[f.key] == null || !Number.isFinite(scores[f.key])));
    if (missing.length) {
      setFormStatus("#game-save-status", "");
      const message = `請完成分項評分：${missing.map(f => f.label).join("、")}`;
      showFormErrorById("#game-save-error", message, "warning");
      return;
    }
    for (const field of GAME_SCORE_FIELDS) {
      const v = scores[field.key];
      if (v == null) continue;
      if (!Number.isInteger(v) || v < 1 || v > 10) {
        setFormStatus("#game-save-status", "");
        const message = `${field.label} 需為 1–10 整數`;
        showFormErrorById("#game-save-error", message, "warning");
        return;
      }
    }
    const scoreTotal = computeGameScoreTotal(scores);
    const grade = gameScoreGrade(scoreTotal);
    const rating = Math.max(1, Math.min(10, Math.round(scoreTotal)));
    let coverUrl = $("#game-cover")?.value.trim() || "";
    const fileInput = $("#game-cover-file");
    if (fileInput?.files?.length) {
      const uploadResult = await uploadGameCover(fileInput.files[0]);
      if (uploadResult.error) {
        showFormErrorById("#game-save-error", `${uploadResult.error}（已略過封面，繼續儲存文字）`, "warning");
      }
      if (uploadResult.url) coverUrl = uploadResult.url;
    }
    const tags = ($("#game-tags")?.value || "").split(/[,，]/).map(value => value.trim()).filter(Boolean);
    const genres = ($("#game-genres")?.value || "").split(/[,，]/).map(value => value.trim()).filter(Boolean);
    const developer = $("#game-developer")?.value.trim() || "";
    const productCode = ($("#game-product-code")?.value || "").trim().toUpperCase();
    const sourceUrl = $("#game-source-url")?.value.trim() || "";
    const workTypeLabel = $("#game-work-type")?.value.trim() || "";
    const cgType = $("#game-cg-type")?.value || "unknown";
    const releaseRaw = $("#game-release-date")?.value || "";
    const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(releaseRaw) ? releaseRaw : null;
    let metadata = {};
    try {
      const rawMeta = $("#game-metadata-json")?.value?.trim();
      if (rawMeta) metadata = JSON.parse(rawMeta);
    } catch {
      metadata = {};
    }
    await withBusyButton(submitButton, "儲存中…", async () => {
      const { error: rpcError, data: rpcData } = await supabase.rpc("admin_upsert_game_review", {
        target_game: id,
        game_name: name,
        game_cover_url: coverUrl || "",
        game_rating: rating,
        game_tags: tags,
        game_review_body: reviewBody,
        game_scores: scores,
        game_developer: developer,
        game_genres: genres,
        game_cg_type: cgType,
        game_source_url: sourceUrl,
        game_product_code: productCode,
        game_release_date: releaseDate,
        game_work_type_label: workTypeLabel,
        game_metadata: metadata
      });
      authDebug("saveGame rpc", { rpcError, rpcData, id, scores, scoreTotal, grade });
      if (!rpcError) {
        setFormStatus("#game-save-status", "");
        state.editingGameId = null;
        closeModal("editor-modal");
        await loadGames();
        return toast(id ? "遊戲評鑑已儲存" : "遊戲評鑑已新增", "success");
      }
      const rpcMsg = formatApiError(rpcError);
      const rpcMissing = /function .*admin_upsert_game_review|could not find/i.test(rpcMsg);
      if (!rpcMissing) {
        const adminHint = /admin required|authentication required/i.test(rpcMsg)
          ? "（請確認已以管理員身分登入）"
          : "";
        const message = `儲存失敗：${rpcMsg}${adminHint}`;
        showFormErrorById("#game-save-error", message);
        return toast(message, "error");
      }
      const payload = {
        name,
        cover_url: coverUrl || "",
        rating,
        scores,
        score_total: scoreTotal,
        grade,
        review_body: reviewBody,
        tags,
        developer,
        genres,
        cg_type: cgType,
        source_url: sourceUrl,
        product_code: productCode,
        release_date: releaseDate,
        work_type_label: workTypeLabel,
        metadata,
        status: "published",
        created_by: state.session.user.id
      };
      const request = id ? supabase.from("games").update(payload).eq("id", id) : supabase.from("games").insert(payload);
      const fallback = await request.select("id").single();
      if (fallback.error) {
        const hint = /admin required|row-level security|permission/i.test(fallback.error.message)
          ? "（需管理員權限；若剛升級請重新整理後再試）"
          : "";
        const message = `儲存失敗：${formatApiError(fallback.error)}${hint}`;
        showFormErrorById("#game-save-error", message);
        return toast(message, "error");
      }
      closeModal("editor-modal");
      state.editingGameId = null;
      await loadGames();
      toast(id ? "遊戲評鑑已儲存" : "遊戲評鑑已新增", "success");
    });
  }

  async function saveGameComment(event) {
    event.preventDefault(); if (!await requireMember()) return;
    const gameId = event.currentTarget.dataset.gameId;
    const body = $("#game-comment-body").value.trim();
    const { error } = await supabase.from("game_comments").insert({ game_id: gameId, user_id: state.session.user.id, body });
    if (error) return toast(error.message, "error");
    await openGame(gameId);
  }

  async function deleteGame(gameId) {
    if (!isAdmin() || !confirm("確定永久刪除這篇遊戲評鑑與全部留言？")) return;
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    if (error) return toast(error.message, "error");
    closeModal("editor-modal"); await loadGames(); toast("遊戲評鑑已刪除", "success");
  }

  async function deleteGameComment(commentId, gameId) {
    if (!state.session || !confirm("確定刪除這則留言？")) return;
    const { error } = await supabase.from("game_comments").delete().eq("id", commentId);
    if (error) return toast(error.message, "error");
    await openGame(gameId);
  }

  async function sendFeedback(kind = "feedback") {
    if (!await requireMember()) return;
    const isRecommendation = kind === "recommendation";
    const textarea = isRecommendation ? $("#recommendation-body") : $("#feedback-body");
    const counter = isRecommendation ? $("#recommendation-count") : $("#feedback-count");
    const button = isRecommendation ? $("#recommendation-send") : $("#feedback-send");
    const body = textarea.value.trim();
    if (!body || body.length > 2000) return toast("意見內容需為 1～2000 字", "warning");
    await withBusyButton(button, isRecommendation ? "送出中…" : "寄送中…", async () => {
      const { error } = await supabase.from("feedback").insert({
        user_id: state.session.user.id,
        kind: isRecommendation ? "recommendation" : "feedback",
        body
      });
      if (error) {
        const missingTable = /feedback.*does not exist|relation .*feedback/i.test(error.message);
        const rateLimited = /Please wait a moment before sending/i.test(error.message);
        if (missingTable) return toast("意見系統尚未啟用（需先套用 0005 migration）", "error");
        if (rateLimited) {
          return toast(
            isRecommendation
              ? "剛送出過推薦，系統已擋住重複送出；請等約 10 秒再試，不需要連按。"
              : "剛送出過意見，系統已擋住重複送出；請等約 10 秒再試，不需要連按。",
            "warning"
          );
        }
        return toast(`送出失敗：${error.message}`, "error");
      }
      textarea.value = "";
      counter.textContent = "0 / 2000";
      toast(isRecommendation ? "推薦已送出" : "意見已送出", "success");
      await loadFeedbackThreads();
    });
  }

  async function loadFeedbackThreads() {
    const lists = [
      { kind: "feedback", node: $("#feedback-thread-list") },
      { kind: "recommendation", node: $("#recommendation-thread-list") }
    ];
    if (!lists.some(item => item.node)) return;
    if (!state.session || !isApproved()) {
      lists.forEach(({ node }) => { if (node) node.innerHTML = '<p class="muted">登入並通過審核後可查看寄出紀錄。</p>'; });
      return;
    }
    const { data: rows, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(40);
    if (error) {
      const missingTable = /feedback.*does not exist|relation .*feedback/i.test(error.message);
      lists.forEach(({ node }) => {
        if (node) node.innerHTML = missingTable ? '<p class="muted">需套用 0005 migration 後才會顯示。</p>' : `<p class="muted">${escapeHtml(error.message)}</p>`;
      });
      return;
    }
    await loadProfilesForReviews((rows || []).map(row => ({ user_id: row.user_id })));
    lists.forEach(({ kind, node }) => {
      if (!node) return;
      const items = (rows || []).filter(row => row.kind === kind);
      node.innerHTML = items.map(item => {
        const author = memberName(state.profiles.get(item.user_id));
        const statusLabel = item.status === "resolved" ? "已處理" : "處理中";
        const deleteButton = feedbackItemDeletable(item)
          ? `<button class="button button-danger" data-delete-feedback="${item.id}">刪除</button>`
          : "";
        return `<article class="feedback-thread" data-feedback="${item.id}">
          <div class="feedback-thread-header"><h4>${escapeHtml(author)}</h4><span class="feedback-status ${item.status === "resolved" ? "resolved" : "open"}">${escapeHtml(statusLabel)}</span></div>
          <p>${escapeHtml(item.body)}</p>
          <small>${new Date(item.created_at).toLocaleString("zh-TW")}</small>
          <div class="admin-actions">${deleteButton}</div>
        </article>`;
      }).join("") || '<p class="muted">尚無紀錄</p>';
    });
  }

  async function loadAdmin(tab = state.adminTab) {
    updateAdminStatusBar();
    const gate = await ensureAdmin("管理後台");
    if (!gate.ok) {
      $("#admin-content").innerHTML = `<div class="empty-state form-error">載入失敗：${escapeHtml(gate.message)}</div>`;
      return;
    }
    state.adminTab = tab;
    $$("[data-admin-tab]").forEach(button => button.classList.toggle("active", button.dataset.adminTab === tab));
    const content = $("#admin-content");
    content.innerHTML = '<div class="empty-state">載入中…</div>';
    if (tab === "users") {
      let users;
      let degraded = false;
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) {
        degraded = true;
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id,display_name,role,status,approved_at,created_at,updated_at")
          .order("created_at", { ascending: false });
        if (profileError) {
          content.innerHTML = `<div class="empty-state">讀取會員清單失敗：${escapeHtml(error.message)}<br>${escapeHtml(profileError.message)}</div>`;
          return;
        }
        users = profiles || [];
      } else {
        users = data || [];
      }
      users = users.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const degradedNotice = degraded ? '<div class="empty-state warning">尚未套用 0005 migration（admin_list_users），暫時只顯示 profiles；套用後即可看到信箱與最近登入時間。</div>' : "";
      content.innerHTML = degradedNotice + `<div class="job-controls"><button class="button button-primary" data-approve-all-pending>一鍵通過全部待審</button></div>` + (users.map(profile => {
        const email = cleanName(profile.email) || (degraded ? "需套用 migration" : "（無信箱）");
        const lastSignIn = profile.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleString("zh-TW") : (degraded ? "需套用 migration" : "尚未登入");
        return `<div class="admin-row"><div><h4>${escapeHtml(memberName(profile))}</h4><p>${escapeHtml(email)} · ${escapeHtml(profile.role)} · ${escapeHtml(profile.status)}</p><small>最近登入：${escapeHtml(lastSignIn)}</small></div><div class="admin-actions">${profile.role === "admin" ? "" : `${profile.status === "pending" ? `<button class="button button-primary" data-approve-user="${profile.id}">通過</button>` : ""}<button class="button button-secondary" data-suspend-user="${profile.id}" data-suspend="${profile.status === "suspended" ? "false" : "true"}">${profile.status === "suspended" ? "解除停權" : "停權"}</button>`}</div></div>`;
      }).join("") || '<div class="empty-state">目前沒有會員</div>');
    } else if (tab === "works") {
      state.adminWorks = await fetchAll("works", query => query.order("updated_at", { ascending: false }));
      content.innerHTML = `<div class="job-controls"><button class="button button-primary" data-new-work>＋ 手動新增（車號）</button><input id="admin-work-search" type="search" placeholder="搜尋車號、標題、作者或標籤…"></div><p id="admin-work-summary" class="muted"></p><div id="admin-work-list"></div>`;
      renderAdminWorks();
    } else if (tab === "reports") {
      let reports = [];
      let loadNote = "";
      const { data, error } = await supabase.rpc("admin_list_reports");
      if (error) {
        const { data: fallback, error: fallbackError } = await supabase
          .from("content_reports")
          .select("id,reason,status,created_at,review_id,reporter_id,reviews(work_id,body,status)")
          .order("created_at", { ascending: false })
          .limit(200);
        if (fallbackError) {
          content.innerHTML = `<div class="empty-state form-error">載入失敗：${escapeHtml(formatApiError(error))}<br>${escapeHtml(formatApiError(fallbackError))}</div>`;
          return;
        }
        loadNote = '<p class="muted">RPC 不可用，已改用直接查詢 content_reports。</p>';
        reports = (fallback || []).map(report => ({
          id: report.id,
          reason: report.reason,
          status: report.status,
          created_at: report.created_at,
          review_id: report.review_id,
          work_id: report.reviews?.work_id || null,
          review_body: report.reviews?.body || "",
          review_status: report.reviews?.status || (report.review_id ? "未知" : "已刪除"),
          reporter_name: "會員"
        }));
      } else {
        reports = data || [];
      }
      const reportCount = reports.length;
      const countLine = `<p class="muted">共 ${reportCount} 筆檢舉</p>`;
      content.innerHTML = loadNote + countLine + (reports.map(report => {
        const snippet = report.review_body
          ? `<p>${escapeHtml(String(report.review_body).slice(0, 180))}</p>`
          : `<p class="muted">${report.review_id ? "（無留言內容／僅評分）" : "內容已刪除"}</p>`;
        const navButtons = report.work_id
          ? `<button class="button button-secondary" data-goto-work="${report.work_id}">前往作品</button>`
          : "";
        const reviewButton = report.review_id
          ? `<button class="button button-secondary" data-goto-review="${report.review_id}" data-goto-work="${report.work_id || ""}">前往留言</button>`
          : "";
        return `<div class="admin-row"><div><h4>${escapeHtml(report.reason)}</h4>${snippet}<p><small>檢舉人：${escapeHtml(report.reporter_name || "會員")} · 狀態：${escapeHtml(report.status)} · ${new Date(report.created_at).toLocaleString("zh-TW")}</small></p><p><small>內容狀態：${escapeHtml(report.review_status || "—")} · review ${escapeHtml(report.review_id || "無")}</small></p></div><div class="admin-actions">${navButtons}${reviewButton}${report.review_id ? `<button class="button button-secondary" data-hide-review="${report.review_id}">隱藏內容</button><button class="button button-danger" data-admin-delete-review="${report.review_id}">刪除內容</button>` : ""}<button class="button button-primary" data-resolve-report="${report.id}">標記完成</button></div></div>`;
      }).join("") || '<div class="empty-state">目前沒有檢舉</div>');
    } else if (tab === "feedback") {
      const { data, error } = await supabase
        .from("feedback")
        .select("id,kind,body,status,created_at,user_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        const missingTable = /feedback.*does not exist|relation .*feedback/i.test(error.message);
        content.innerHTML = `<div class="empty-state">${missingTable ? "意見系統尚未啟用（需先套用 0005 migration）" : escapeHtml(error.message)}</div>`;
        return;
      }
      const rows = data || [];
      await loadProfilesForReviews(rows.map(row => ({ user_id: row.user_id })));
      content.innerHTML = rows.map(item => {
        const author = memberName(state.profiles.get(item.user_id));
        const kindLabel = item.kind === "recommendation" ? "作品推薦" : "意見反饋";
        const statusText = item.status === "resolved" ? "已完成" : "待處理";
        return `<div class="admin-row"><div><h4>${escapeHtml(kindLabel)} · ${escapeHtml(author)}</h4><p>${escapeHtml(item.body)}</p><small>${new Date(item.created_at).toLocaleString("zh-TW")} · ${escapeHtml(statusText)}</small></div><div class="admin-actions">${item.status === "open" ? `<button class="button button-primary" data-resolve-feedback="${item.id}">標記完成</button>` : ""}</div></div>`;
      }).join("") || '<div class="empty-state">目前沒有意見或推薦</div>';
    } else if (tab === "jobs") {
      state.sourceStats = await loadSourceStatus();
      content.innerHTML = `${workerDownBanner()}<div class="admin-source-status"><div id="admin-source-status-grid" class="source-status-grid"></div></div><p class="muted small-note">自動同步：每日 12:00（台灣時間）於 GitHub Actions 背景執行，不會在本機跳出瀏覽器視窗。</p><div class="job-controls"><button class="button button-primary" data-run-job="all">執行同步 / 開啟 Actions</button><button class="button button-secondary" data-refresh-jobs>更新紀錄</button><a class="button button-secondary" href="${escapeHtml(config.manualSyncUrl)}" target="_blank" rel="noopener noreferrer">GitHub Actions ↗</a></div><div id="job-list"></div>`;
      renderSourceStatus("#admin-source-status-grid");
      await loadJobs();
    }
  }

  function renderAdminWorks() {
    const list = $("#admin-work-list");
    if (!list) return;
    const query = $("#admin-work-search")?.value || "";
    const rows = state.adminWorks.filter(work => workMatches(work, query));
    $("#admin-work-summary").textContent = `${rows.length.toLocaleString()} 筆；畫面顯示前 200 筆`;
    list.innerHTML = rows.slice(0, 200).map(work => `<div class="admin-row with-thumb"><img class="admin-work-thumb" src="${escapeHtml(imageUrl(work.cover_url))}" alt=""><div><h4>${escapeHtml(work.title)}</h4><p>${escapeHtml(work.platform)} · ${escapeHtml(work.work_id)} · ${escapeHtml(work.status)}</p></div><div class="admin-actions"><button class="button button-secondary" data-edit-work="${work.id}">編輯</button><button class="button button-secondary" data-toggle-work="${work.id}" data-status="${work.status === "active" ? "inactive" : "active"}">${work.status === "active" ? "標記失效" : "恢復"}</button></div></div>`).join("") || '<div class="empty-state">沒有符合條件的作品</div>';
  }

  async function loadJobs() {
    const list = $("#job-list"); if (!list) return;
    const { data, error } = await supabase
      .from("scrape_runs")
      .select("job_name,status,started_at,finished_at,discovered_count,accepted_count,rejected_count,error_count,error_message,created_at")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(30);
    if (error) {
      list.innerHTML = `<div class="empty-state">讀取爬蟲紀錄失敗：${escapeHtml(error.message)}</div>`;
      return;
    }
    const rows = data || [];
    list.innerHTML = rows.map(run => {
      const started = run.started_at || run.created_at;
      const finished = run.finished_at ? `完成：${new Date(run.finished_at).toLocaleString("zh-TW")}` : "尚未完成";
      return `<div class="admin-row"><div><h4>${escapeHtml(run.job_name)} <span class="job-badge ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></h4><p>開始：${started ? new Date(started).toLocaleString("zh-TW") : "未知"} · ${finished}</p><p>發現 ${run.discovered_count || 0} · 接受 ${run.accepted_count || 0} · 拒絕 ${run.rejected_count || 0} · 錯誤 ${run.error_count || 0}</p>${run.error_message ? `<p class="error-text">${escapeHtml(run.error_message)}</p>` : ""}</div></div>`;
    }).join("") || `<div class="empty-state">尚無執行紀錄。<br><a href="${escapeHtml(config.manualSyncUrl)}" target="_blank" rel="noopener noreferrer">到 GitHub Actions 手動同步 ↗</a></div>`;
  }

  async function runJob(source) {
    if (!config.workerUrl) {
      window.open(config.manualSyncUrl, "_blank", "noopener");
      toast(source === "all" ? "已開啟 GitHub Actions 手動同步頁面" : `目前請改由 GitHub Actions 手動執行 ${source} 同步`, "success");
      return;
    }
    try {
      await fetchWorkerJson("/api/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}` }, body: JSON.stringify({ source }) });
      toast(`已喚醒 ${source} 工作`, "success");
      setTimeout(() => loadAdmin("jobs"), 1500);
    } catch (error) {
      toast(workerErrorMessage(error), "error");
    }
  }

  async function editWork(workId = null) {
    if (workId) {
      const work = (await supabase.from("works").select("*").eq("id", workId).single()).data;
      $("#editor-content").innerHTML = `<h2 id="editor-title">編輯作品</h2><form id="work-editor-form" class="editor-form" data-work-id="${work?.id || ""}">
        <label>平台<select id="work-platform">${config.platforms.map(platform => `<option value="${platform}" ${work?.platform === platform ? "selected" : ""}>${PLATFORM_LABELS[platform]}</option>`).join("")}</select></label>
        <label>車號<input id="work-external-id" required value="${escapeHtml(work?.work_id || "")}"></label>
        <label>標題<input id="work-title" required value="${escapeHtml(work?.title || "")}"></label>
        <label>作者<input id="work-author" value="${escapeHtml(work?.author || "Unknown Artist")}"></label>
        <label>封面網址<input id="work-cover" type="url" value="${escapeHtml(work?.cover_url || "")}"></label>
        <label>來源網址<input id="work-source" type="url" required value="${escapeHtml(work?.source_url || "")}"></label>
        <label>標籤<input id="work-tags" value="${escapeHtml((work?.tags || []).join(", "))}"></label>
        <label>狀態<select id="work-status"><option value="active">active</option><option value="inactive" ${work?.status === "inactive" ? "selected" : ""}>inactive</option><option value="rejected" ${work?.status === "rejected" ? "selected" : ""}>rejected</option></select></label>
        <button class="button button-primary">儲存作品</button></form>`;
    } else {
      $("#editor-content").innerHTML = `<h2 id="editor-title">手動新增作品</h2><form id="work-ingest-form" class="editor-form">
        <label>平台<select id="ingest-platform">${config.platforms.map(platform => `<option value="${platform}">${PLATFORM_LABELS[platform]}</option>`).join("")}</select></label>
        <label>車號（外部 ID）<input id="ingest-external-id" required placeholder="例：123456"></label>
        <p class="muted small-note">Nhentai / 禁漫 / Pixiv 會直接進入待同步佇列，下一次 GitHub Actions 同步就會抓取標題、封面、作者與標籤。Hanime 目前仍需走既有播放清單同步。</p>
        <button class="button button-primary">加入同步佇列</button></form>`;
    }
    openModal("editor-modal");
  }

  async function queueManualIngestion(platform, externalId) {
    const { error: rpcError } = await supabase.rpc("admin_queue_manual_ingestion", {
      target_platform: platform,
      target_external_id: externalId
    });
    if (!rpcError) return;
    if (!/function .*admin_queue_manual_ingestion|could not find/i.test(rpcError.message || "")) {
      throw rpcError;
    }
    const payload = {
      source: "manual",
      platform,
      external_id: externalId,
      raw_text: externalId,
      source_author: state.profile?.display_name || "admin"
    };
    const { error } = await supabase.from("ingestion_candidates").upsert(payload, {
      onConflict: "source,platform,external_id"
    });
    if (error) throw error;
  }

  async function ingestWork(event) {
    event.preventDefault();
    if (!isAdmin()) return;
    const platform = $("#ingest-platform").value;
    const externalId = $("#ingest-external-id").value.trim();
    if (!externalId) return toast("請輸入車號", "warning");
    if (platform === "hanime") {
      return toast("Hanime 目前不支援單筆車號新增，請改走既有播放清單同步。", "warning");
    }
    try {
      if (!config.workerUrl) {
        await queueManualIngestion(platform, externalId);
        closeModal("editor-modal");
        toast("已加入待同步佇列；請到「爬蟲與紀錄」執行同步或等待下一次 GitHub Actions。", "success");
        await loadAdmin("jobs");
        return;
      }
      await fetchWorkerJson("/api/admin/ingest-work", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}` },
        body: JSON.stringify({ platform, external_id: externalId })
      });
      closeModal("editor-modal");
      await loadWorks();
      await loadAdmin("works");
      toast("作品已抓取並新增", "success");
    } catch (error) {
      toast(workerErrorMessage(error), "error");
    }
  }

  async function saveWork(event) {
    event.preventDefault(); if (!isAdmin()) return;
    const id = event.currentTarget.dataset.workId;
    const payload = { platform: $("#work-platform").value, work_id: $("#work-external-id").value.trim(), title: $("#work-title").value.trim(), author: $("#work-author").value.trim() || "Unknown Artist", cover_url: $("#work-cover").value.trim(), source_url: $("#work-source").value.trim(), tags: $("#work-tags").value.split(/[,，]/).map(value => value.trim()).filter(Boolean), status: $("#work-status").value, source_kind: "manual" };
    const request = id ? supabase.from("works").update(payload).eq("id", id) : supabase.from("works").insert(payload);
    const { error } = await request; if (error) return toast(error.message, "error");
    closeModal("editor-modal"); await loadWorks(); await loadAdmin("works"); toast("作品已儲存", "success");
  }

  function syncBodyScrollLock() {
    document.body.style.overflow = document.querySelector(".modal.open") ? "hidden" : "";
  }

  function openModal(id) {
    $(`#${id}`).classList.add("open");
    syncBodyScrollLock();
  }

  function closeModal(id) {
    $(`#${id}`).classList.remove("open");
    syncBodyScrollLock();
  }

  function toggleMobileMenu(force = null) {
    const nav = $("#main-nav");
    const open = force === null ? !nav.classList.contains("open") : Boolean(force);
    nav.classList.toggle("open", open);
    ["#mobile-menu-button"].forEach(selector => {
      const button = $(selector);
      if (button) button.setAttribute("aria-expanded", String(open));
    });
  }

  function switchView(view) {
    const allowed = new Set(["home", "library", "leaderboard", "games", "feedback", "admin"]);
    if (!allowed.has(view)) view = "home";
    if (view === "admin") {
      if (!state.session) {
        toast("請先登入才能進入管理後台", "warning");
        view = "home";
      } else if (state.authLoading || !state.profileReady) {
        toast("管理員權限載入中，請稍候再試", "warning");
        view = "home";
      } else if (!isAdmin()) {
        toast(`你不是管理員（目前角色：${state.profile?.role || "member"}）`, "warning");
        view = "home";
      }
    }
    if (location.hash.slice(1) !== view) {
      history.replaceState(null, "", `#${view}`);
    }
    rememberView(view);
    $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
    $$("[data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === view));
    $("#main-nav").classList.remove("open");
    if (view === "library") renderLibrary(true);
    if (view === "leaderboard") renderLeaderboard();
    if (view === "games") loadGames();
    if (view === "feedback") loadFeedbackThreads();
    if (view === "admin") loadAdmin(state.adminTab || "users");
  }

  function editorFormEvent(form) {
    return { preventDefault() {}, currentTarget: form, target: form };
  }

  function wireEditorFormHandlers() {
    const root = $("#editor-content");
    if (!root || root.dataset.formWired === "1") return;
    root.dataset.formWired = "1";
    root.addEventListener("click", event => {
      const reportBtn = event.target.closest("#btn-submit-report");
      if (reportBtn) {
        event.preventDefault();
        const form = reportBtn.closest("form");
        if (form) void submitReport(editorFormEvent(form));
        return;
      }
      const saveBtn = event.target.closest("#btn-save-game");
      if (saveBtn) {
        event.preventDefault();
        const form = saveBtn.closest("form");
        if (form) void saveGame(editorFormEvent(form));
      }
    });
    root.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.target?.tagName === "TEXTAREA") return;
      const form = event.target?.closest?.("#report-form, #game-editor-form");
      if (!form || !root.contains(form)) return;
      event.preventDefault();
      if (form.id === "report-form") void submitReport(editorFormEvent(form));
      if (form.id === "game-editor-form") void saveGame(editorFormEvent(form));
    });
  }

  function bindClick(selector, handler) {
    const node = $(selector);
    if (node) node.addEventListener("click", handler);
  }

  function bindEvents() {
    wireEditorFormHandlers();
    document.addEventListener("error", event => {
      if (event.target instanceof HTMLImageElement && !event.target.dataset.fallbackApplied) {
        event.target.dataset.fallbackApplied = "1";
        event.target.src = imageUrl("");
      }
    }, true);
    $("#age-enter")?.addEventListener("click", () => { localStorage.setItem("acg_age_confirmed", "1"); closeModal("age-gate"); });
    $("#age-leave")?.addEventListener("click", () => { location.href = "https://www.google.com/"; });
    if (localStorage.getItem("acg_age_confirmed") === "1") closeModal("age-gate");
    bindClick("#login-button", login);
    bindClick("#logout-button", logout);
    bindClick("#clear-auth-button", clearAuthStorage);
    bindClick("#auth-clear-storage-button", clearAuthStorage);
    bindClick("#profile-edit-button", openProfileEditor);
    bindClick("#google-login-button", loginWithGoogle);
    bindClick("#password-login-button", loginWithPassword);
    bindClick("#password-signup-button", signupWithPassword);
    bindClick("#email-login-button", loginWithEmail);
    $("#password-login-email")?.addEventListener("keydown", event => { if (event.key === "Enter") loginWithPassword(); });
    $("#password-login-password")?.addEventListener("keydown", event => { if (event.key === "Enter") loginWithPassword(); });
    $("#email-login-input")?.addEventListener("keydown", event => { if (event.key === "Enter") loginWithEmail(); });
    bindClick("#mobile-menu-button", event => { event.stopPropagation(); toggleMobileMenu(); });
    $$("[data-view]").forEach(link => link.addEventListener("click", event => {
      event.preventDefault();
      const view = link.dataset.view;
      location.hash = view;
      switchView(view);
      toggleMobileMenu(false);
    }));
    bindClick("#draw-all-button", drawAll);
    bindClick("#draw-five-button", () => drawBatch(5));
    bindClick("#draw-ten-button", () => drawBatch(10));
    bindClick("#reset-draw-history-button", () => resetDrawHistory());
    bindClick("#clear-bulk-button", () => { state.bulkWorks = []; renderBulkDraw(); });
    $("#home-search")?.addEventListener("input", debounce(drawAll));
    $("#home-filter-scope")?.addEventListener("change", () => {
      if ($("#home-filter-scope").value === "favorites" && !state.session) {
        toast("請先登入後才可抽「我的收藏」", "warning");
        login();
      }
      drawAll();
    });
    $("#home-filter-week")?.addEventListener("change", drawAll);
    $("#library-platform")?.addEventListener("change", () => renderLibrary(true));
    $("#library-scope")?.addEventListener("change", () => renderLibrary(true));
    $("#library-sort")?.addEventListener("change", () => renderLibrary(true));
    $("#library-search")?.addEventListener("input", debounce(() => renderLibrary(true)));
    bindClick("#library-more", () => { state.libraryVisible += 60; renderLibrary(); });
    $("#ranking-platform")?.addEventListener("change", renderLeaderboard);
    $("#ranking-order")?.addEventListener("change", renderLeaderboard);
    $$(".ranking-tab").forEach(button => button.addEventListener("click", () => switchRankingTab(button.dataset.rankingTab)));
    bindClick("#new-game-button", async () => {
      try {
        await gameEditor();
      } catch (error) {
        console.error("gameEditor failed", error);
        toast(`無法開啟遊戲評鑑：${error.message || error}`, "error");
      }
    });
    $("#feedback-body")?.addEventListener("input", event => { if ($("#feedback-count")) $("#feedback-count").textContent = `${event.target.value.length} / 2000`; });
    $("#recommendation-body")?.addEventListener("input", event => { if ($("#recommendation-count")) $("#recommendation-count").textContent = `${event.target.value.length} / 2000`; });
    document.addEventListener("input", event => { if (event.target.id === "admin-work-search") renderAdminWorks(); });
    bindClick("#feedback-send", () => sendFeedback("feedback"));
    bindClick("#recommendation-send", () => sendFeedback("recommendation"));
    window.addEventListener("hashchange", async () => {
      const loc = parseLocationHash();
      if (loc.workId) {
        if (!state.workById.has(loc.workId)) await loadWorks();
        if (state.workById.has(loc.workId)) {
          switchView(loc.view || "home");
          await openWork(loc.workId, { reviewId: loc.reviewId });
          return;
        }
      }
      switchView(loc.view || readRememberedView());
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") $$(".modal.open:not(#age-gate)").forEach(modal => closeModal(modal.id)); });
    document.addEventListener("submit", event => {
      const form = event.target;
      if (!form || form.tagName !== "FORM") return;
      if ($("#editor-content")?.contains(form)) {
        event.preventDefault();
        if (form.id === "report-form") void submitReport(event);
        else if (form.id === "game-editor-form") void saveGame(event);
        else if (form.id === "game-comment-form") void saveGameComment(event);
        else if (form.id === "profile-editor-form") void saveProfileName(event);
        else if (form.id === "work-editor-form") void saveWork(event);
        else if (form.id === "work-ingest-form") void ingestWork(event);
        return;
      }
      if (form.id === "review-form") { event.preventDefault(); void submitReview(event); }
      if (form.matches("[data-reply-form]")) { event.preventDefault(); void submitReply(form.dataset.replyForm); }
    });
    document.addEventListener("click", async event => {
      try {
      if (event.target.classList?.contains("modal") && event.target.id !== "age-gate") {
        closeModal(event.target.id);
        return;
      }
      if (!event.target.closest("#main-nav") && !event.target.closest("#mobile-menu-button")) toggleMobileMenu(false);
      const target = event.target.closest("button,a,article"); if (!target) return;
      if (target.tagName === "BUTTON") flashButton(target);
      if (target.dataset.closeModal) closeModal(target.dataset.closeModal);
      if (target.dataset.login !== undefined) login();
      if (target.dataset.retryInit !== undefined) reloadHome();
      if (target.dataset.refreshPlatform) drawPlatform(target.dataset.refreshPlatform);
      if (target.dataset.flipCard) flipCard(target.dataset.flipCard);
      if (target.dataset.copyCardIds) copyCardIds(target.dataset.copyCardIds);
      if (target.dataset.resetCardHistory) {
        const platform = target.dataset.resetCardHistory;
        state.recentByPlatform[platform] = [];
        saveDrawHistory();
        renderPlatformCard(platform, state.currentByPlatform[platform]);
        toast("已清除這張卡片的抽取紀錄", "success");
      }
      if (target.dataset.copySingle) copySingleWork(target.dataset.copySingle);
      if (target.dataset.sourceOpen) recordView(target.dataset.sourceOpen, "source");
      if (target.dataset.openWork) openWork(target.dataset.openWork);
      if (target.dataset.favorite) toggleFavorite(target.dataset.favorite);
      if (target.dataset.similar) recommendSimilar(target.dataset.similar);
      if (target.dataset.rating !== undefined) { state.currentRating = Number(target.dataset.rating); $$("[data-rating]").forEach(button => button.classList.toggle("selected", Number(button.dataset.rating) === state.currentRating)); }
      if (target.dataset.reply) { if (!await requireMember()) return; $(`#reply-${target.dataset.reply}`).innerHTML = `<form data-reply-form="${target.dataset.reply}" class="review-form"><textarea id="reply-body-${target.dataset.reply}" maxlength="300" required placeholder="回覆（最多 300 字）…"></textarea><button class="button button-primary">送出回覆</button></form>`; }
      if (target.dataset.vote) voteReview(target.dataset.reviewId, Number(target.dataset.vote));
      if (target.dataset.editReview) editReview(target.dataset.editReview);
      if (target.dataset.deleteReview) deleteReview(target.dataset.deleteReview);
      if (target.dataset.report) await reportReview(target.dataset.report);
      if (target.dataset.openGame) openGame(target.dataset.openGame);
      if (target.dataset.editGame) { const { data } = await supabase.from("games").select("*").eq("id", target.dataset.editGame).single(); await gameEditor(data); }
      if (target.dataset.deleteGame) deleteGame(target.dataset.deleteGame);
      if (target.dataset.deleteGameComment) deleteGameComment(target.dataset.deleteGameComment, target.dataset.gameId);
      if (target.dataset.adminTab) loadAdmin(target.dataset.adminTab);
      if (target.dataset.approveAllPending) {
        await withBusyButton(target, "核准中…", async () => {
          const { data, error } = await supabase.rpc("approve_all_pending");
          const count = (data && typeof data === "object" && data.approved != null)
            ? Number(data.approved)
            : Number(data || 0);
          toast(error ? error.message : `已通過 ${Number.isFinite(count) ? count : 0} 位會員`, error ? "error" : "success");
          if (!error) loadAdmin("users");
        });
      }
      if (target.dataset.approveUser) { const { error } = await supabase.rpc("approve_user", { target_user: target.dataset.approveUser, approve: true }); toast(error ? error.message : "會員已通過", error ? "error" : "success"); if (!error) loadAdmin("users"); }
      if (target.dataset.suspendUser) { const { error } = await supabase.rpc("set_user_suspension", { target_user: target.dataset.suspendUser, suspend: target.dataset.suspend === "true" }); toast(error ? error.message : "會員狀態已更新", error ? "error" : "success"); if (!error) loadAdmin("users"); }
      if (target.dataset.runJob) runJob(target.dataset.runJob);
      if (target.dataset.refreshJobs !== undefined) loadJobs();
      if (target.dataset.newWork !== undefined) editWork();
      if (target.dataset.editWork) editWork(target.dataset.editWork);
      if (target.dataset.toggleWork) { const { error } = await supabase.from("works").update({ status: target.dataset.status }).eq("id", target.dataset.toggleWork); toast(error ? error.message : "作品狀態已更新", error ? "error" : "success"); if (!error) { await loadWorks(); loadAdmin("works"); } }
      if (target.dataset.purgeWork) purgeWork(target.dataset.purgeWork);
      if (target.dataset.deleteFeedback && confirm("確定刪除此則意見？")) {
        const { error } = await supabase.from("feedback").delete().eq("id", target.dataset.deleteFeedback);
        toast(error ? error.message : "已刪除", error ? "error" : "success");
        if (!error) { loadFeedbackThreads(); loadAdmin("feedback"); }
      }
      if (target.dataset.resolveFeedback) { const { error } = await supabase.from("feedback").update({ status: "resolved", resolved_by: state.session.user.id, resolved_at: new Date().toISOString() }).eq("id", target.dataset.resolveFeedback); toast(error ? error.message : "已標記完成", error ? "error" : "success"); if (!error) { loadFeedbackThreads(); loadAdmin("feedback"); } }
      if (target.dataset.resolveReport) { const { error } = await supabase.from("content_reports").update({ status: "resolved", resolved_by: state.session.user.id, resolved_at: new Date().toISOString() }).eq("id", target.dataset.resolveReport); toast(error ? error.message : "檢舉已完成", error ? "error" : "success"); if (!error) loadAdmin("reports"); }
      if (target.dataset.gotoWork || target.dataset.gotoReview) {
        await navigateToReportedContent(target.dataset.gotoWork || null, target.dataset.gotoReview || null);
      }
      if (target.dataset.hideReview) {
        const { error } = await supabase.rpc("moderate_review", { target_review: target.dataset.hideReview, new_status: "hidden" });
        toast(error ? error.message : "內容已隱藏", error ? "error" : "success");
        if (!error) {
          await refreshLeaderboardAfterReviewChange();
          loadAdmin("reports");
        }
      }
      if (target.dataset.adminDeleteReview && confirm("確定永久刪除被檢舉的內容？刪除後作品的評分也會從排行榜移除。")) {
        const { error } = await supabase.from("reviews").delete().eq("id", target.dataset.adminDeleteReview);
        toast(error ? error.message : "內容已刪除", error ? "error" : "success");
        if (!error) {
          await refreshLeaderboardAfterReviewChange();
          loadAdmin("reports");
        }
      }
      } catch (error) {
        console.error("click handler failed", error);
        toast(`操作失敗：${error.message || error}`, "error");
      }
    });
  }

  async function init() {
    bindEvents();
    loadDrawHistory();
    detectGoogleProvider();
    supabase.auth.onAuthStateChange((event, session) => {
      authDebug("auth state", { event, hasSession: Boolean(session) });
      state.session = session;
      if (event === "SIGNED_IN") closeModal("auth-modal");
      if (event === "SIGNED_OUT") {
        state.profile = null;
        state.profileReady = false;
        state.authLoading = false;
        state.favorites.clear();
        state.preferenceTags.clear();
        updateAuthUi();
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        setTimeout(() => loadAuth(), 0);
      }
    });
    await handleAuthCallback();
    renderPlatformSkeletons();
    $("#home-summary").textContent = "正在讀取作品資料…";
    try {
      await Promise.all([loadWorks(), loadLeaderboardData(), loadFavoriteCounts()]);
      await loadWeeklyLeaderboardData();
      await loadAuth();
      drawAll();
      renderLibrary(true); renderLeaderboard();
      const loc = parseLocationHash();
      switchView(loc.view || readRememberedView());
      if (loc.workId && state.workById.has(loc.workId)) {
        await openWork(loc.workId, { reviewId: loc.reviewId });
      }
    } catch (error) {
      console.error(error);
      $("#home-summary").textContent = "資料載入失敗，請稍後重試。";
      renderPlatformError();
      toast(`初始化失敗：${error.message}`, "error");
    }
  }

  init();
})();
