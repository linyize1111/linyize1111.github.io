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
    // detectSessionInUrl=false：由 auth.js 單一處做 PKCE code 交換，避免與 SDK 雙重交換把 code 用掉。
    _client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
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

  function renderMarkdown(md) {
    var text = String(md == null ? "" : md);
    // 移除開頭 frontmatter（--- ... ---）
    if (text.trim().indexOf("---") === 0) {
      var t = text.trim();
      var next = t.indexOf("---", 3);
      if (next !== -1) text = t.slice(next + 3);
    }
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
    escapeText: escapeText,
    config: cfg,
  };
})();
