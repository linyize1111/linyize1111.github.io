/**
 * supabase-client.js
 *
 * 建立並共用一個 Supabase client，並提供小工具：
 *   - window.SB.isConfigured()   ：設定是否已填（非 placeholder）
 *   - window.SB.client()         ：取得 client（未設定時回傳 null）
 *   - window.SB.sanitizeHtml()   ：DOMPurify 清理（防 XSS）
 *   - window.SB.renderMarkdown() ：marked + DOMPurify
 *
 * 依賴（由頁面用 <script> 載入）：
 *   - @supabase/supabase-js v2 (window.supabase)
 *   - marked (window.marked)         ← 內文渲染時需要
 *   - DOMPurify (window.DOMPurify)    ← 內文渲染時需要
 */
(function () {
  "use strict";

  var cfg = window.SUPABASE_CONFIG || {};

  function isConfigured() {
    return (
      typeof cfg.url === "string" &&
      typeof cfg.anonKey === "string" &&
      cfg.url.indexOf("http") === 0 &&
      cfg.url.indexOf("PLACEHOLDER") === -1 &&
      cfg.anonKey.indexOf("PLACEHOLDER") === -1 &&
      cfg.anonKey.length > 20
    );
  }

  var _client = null;
  function client() {
    if (!isConfigured()) return null;
    if (_client) return _client;
    if (!window.supabase || !window.supabase.createClient) {
      console.error("[SB] supabase-js 尚未載入");
      return null;
    }
    // 固定 storageKey，避免與同 origin（acg-portal）或其他舊 sb-* key 互相踩踏。
    // detectSessionInUrl=false：由 auth.js 單一處做 PKCE code 交換，避免與 SDK 雙重交換把 code 用掉。
    var storageKey = cfg.storageKey || "lyz-main-auth";
    // 一次性遷移：舊版預設 key sb-<ref>-auth-token → 新 key，避免硬刷後「其實有 session 卻讀不到」
    try {
      var legacyKey = "sb-ypyiqysgfwgxcmmsylob-auth-token";
      if (!localStorage.getItem(storageKey)) {
        var legacy = localStorage.getItem(legacyKey);
        if (legacy) {
          localStorage.setItem(storageKey, legacy);
          localStorage.removeItem(legacyKey);
        }
      }
    } catch (e) { /* ignore */ }
    _client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        storageKey: storageKey,
      },
    });
    return _client;
  }

  // ---- XSS 防護 ----------------------------------------------------
  function sanitizeHtml(dirty) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(dirty, {
        ADD_ATTR: ["target", "rel"],
        FORBID_TAGS: [
          "style", "form", "input", "button", "script", "iframe", "object",
          "embed", "link", "meta", "base", "svg", "math",
        ],
        FORBID_ATTR: [
          "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur",
          "oninput", "onchange", "style", "formaction", "xlink:href",
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    }
    // 沒有 DOMPurify 時的保守 fallback：純文字轉義
    var div = document.createElement("div");
    div.textContent = String(dirty == null ? "" : dirty);
    return div.innerHTML;
  }

  /**
   * Strip YAML frontmatter only when the block between --- looks like key: value YAML.
   * Do NOT strip literary section dividers (--- ... ---) used in fiction.
   */
  function stripYamlFrontmatter(md) {
    var text = String(md == null ? "" : md);
    var trimmed = text.trim();
    if (trimmed.indexOf("---") !== 0) return text;
    // Match closing --- on its own line (GFM hr / frontmatter end)
    var close = trimmed.search(/\r?\n---\s*(?:\r?\n|$)/);
    if (close === -1) return text;
    var between = trimmed.slice(3, close);
    // Real frontmatter: at least one yaml-ish "key: value" line, and not prose-heavy
    var yamlLines = between.split(/\r?\n/).filter(function (line) {
      return /^\s*[A-Za-z0-9_\u4e00-\u9fff][\w\u4e00-\u9fff.-]*\s*:/.test(line);
    });
    if (!yamlLines.length) return text;
    // Refuse to strip if block looks like literary prose (many CJK sentences, few yaml keys)
    var sentenceMarks = (between.match(/[。！？]/g) || []).length;
    if (sentenceMarks >= 2 && yamlLines.length < 2) return text;
    var rest = trimmed.slice(close).replace(/^\r?\n---\s*/, "");
    return rest.replace(/^\r?\n/, "");
  }

  function renderMarkdown(md) {
    var text = stripYamlFrontmatter(md);
    var html;
    if (window.marked) {
      try {
        window.marked.setOptions({ gfm: true, breaks: true });
        html = window.marked.parse(text);
      } catch (e) {
        html = "<pre></pre>";
      }
    } else {
      var d = document.createElement("div");
      d.textContent = text;
      html = "<pre style='white-space:pre-wrap'>" + d.innerHTML + "</pre>";
    }
    return sanitizeHtml(html);
  }

  // 純文字轉義（給標題 / 摘要等）
  function escapeText(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  window.SB = {
    isConfigured: isConfigured,
    client: client,
    sanitizeHtml: sanitizeHtml,
    renderMarkdown: renderMarkdown,
    stripYamlFrontmatter: stripYamlFrontmatter,
    escapeText: escapeText,
    config: cfg,
  };
})();
