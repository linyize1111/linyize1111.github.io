/**
 * cms-public.js — V3 AI-first (data / controller)
 *
 * Loads articles from CmsData (static) or Supabase and mounts via SBArticleRenderer.
 * Rendering lives in article-renderer.js (shared with admin preview).
 * NEVER infers fragment/longform/photo-note from character or image counts.
 */
(function () {
  "use strict";

  function useStatic() {
    return window.CmsData && window.CmsData.source && window.CmsData.source() === "static";
  }

  var CONFIGURED =
    (window.CmsData && window.CmsData.isReady && window.CmsData.isReady()) ||
    (window.SB && window.SB.isConfigured && window.SB.isConfigured());
  if (CONFIGURED) window.__CMS_DYNAMIC__ = true;

  var ARTICLE_FIELDS =
    "id,section,slug,title,summary,body,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index,content_type,presentation,visibility,series,show_title,show_summary,ai_editorial,needs_ai_analysis,cover_display";
  var ARTICLE_FIELDS_LEGACY =
    "id,section,slug,title,summary,body,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index";

  function R() {
    return window.SBArticleRenderer || null;
  }

  function effectiveVisibility(a) {
    if (window.SBPresentation) return window.SBPresentation.effectiveVisibility(a);
    return "public";
  }

  function displayCategory(cat) {
    if (window.SBSections && window.SBSections.displayCategory) {
      return window.SBSections.displayCategory(cat);
    }
    return String(cat || "").trim();
  }

  function esc(s) {
    return window.SB && window.SB.escapeText ? window.SB.escapeText(s) : String(s || "");
  }

  function buildCard(a, listIndex) {
    var r = R();
    if (!r || typeof r.buildCard !== "function") {
      console.warn("[cms] SBArticleRenderer.buildCard missing");
      return document.createElement("article");
    }
    return r.buildCard(a, listIndex);
  }

  function initListWidgets() {
    if (typeof window.enhanceNoCoverCards === "function") window.enhanceNoCoverCards();
    if (typeof window.initSortingAndFiltering === "function") window.initSortingAndFiltering();
    if (typeof window.initCarousel === "function") window.initCarousel();
  }

  async function selectArticles(client, section) {
    var q = client
      .from("articles")
      .select(ARTICLE_FIELDS)
      .eq("section", section)
      .eq("status", "published")
      .order("sort_index", { ascending: false })
      .order("published_at", { ascending: false });
    var res = await q;
    if (res.error && /column|does not exist|42703/i.test(res.error.message || "")) {
      res = await client
        .from("articles")
        .select(ARTICLE_FIELDS_LEGACY)
        .eq("section", section)
        .eq("status", "published")
        .order("sort_index", { ascending: false })
        .order("published_at", { ascending: false });
    }
    return res;
  }

  async function renderList(container) {
    var section = container.getAttribute("data-section");
    var listMode = container.getAttribute("data-list-mode") || "";

    if (listMode === "academic") {
      var isAdmin = false;
      try {
        if (window.SBAuth && window.SBAuth.isAdmin) isAdmin = !!(await window.SBAuth.isAdmin());
      } catch (e) {
        isAdmin = false;
      }
      if (!isAdmin) {
        window.location.replace("index.html");
        return;
      }
      document.body.classList.add("admin-gate-ok");
    }

    container.innerHTML =
      '<div class="cms-loading" style="text-align:center;padding:40px 0;opacity:.7;">載入文章中…</div>';

    var res;
    try {
      if (useStatic()) {
        res = await window.CmsData.listPublishedArticles(section);
      } else {
        res = await selectArticles(window.SB.client(), section);
      }
    } catch (e) {
      res = { error: e };
    }

    if (res.error) {
      console.warn("[cms] 讀取文章失敗：", res.error.message || res.error);
      container.innerHTML =
        '<div style="text-align:center;padding:40px 0;opacity:.75;">文章載入失敗，請稍後再試。</div>';
      return;
    }

    var rows = res.data || [];
    if (listMode !== "academic") {
      rows = rows.filter(function (a) {
        return effectiveVisibility(a) === "public";
      });
    } else {
      rows = rows.filter(function (a) {
        var v = effectiveVisibility(a);
        return v === "private" || (window.SBSections && window.SBSections.isAcademicCategory(a.category));
      });
    }
    if (window.SBSections && window.SBSections.filterByListMode) {
      rows = window.SBSections.filterByListMode(rows, listMode);
    }

    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px 0;opacity:.7;">尚無已發佈的文章。</div>';
    } else {
      rows.forEach(function (a, index) {
        container.appendChild(buildCard(a, index));
      });
    }
    initListWidgets();
  }

  async function renderArticle() {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("id");
    var section = params.get("section");
    if (!slug) return false;

    var titleEl = document.getElementById("note-title");
    var statusEl = document.getElementById("note-status");
    var contentEl = document.getElementById("markdown-container");
    var postSection = document.querySelector("#main > section.post");
    if (!contentEl) return false;

    var res;
    if (useStatic()) {
      res = await window.CmsData.getPublishedArticle(slug, section);
    } else {
      var client = window.SB.client();
      var fields = ARTICLE_FIELDS;
      var q = client.from("articles").select(fields).eq("slug", slug).eq("status", "published").limit(1);
      if (section) q = q.eq("section", section);
      res = await q;
      if (res.error && /column|does not exist|42703/i.test(res.error.message || "")) {
        q = client
          .from("articles")
          .select(ARTICLE_FIELDS_LEGACY)
          .eq("slug", slug)
          .eq("status", "published")
          .limit(1);
        if (section) q = q.eq("section", section);
        res = await q;
      }
    }

    function notFound() {
      if (titleEl) titleEl.innerText = "404 文章未找到";
      if (statusEl) statusEl.innerText = "Not Found";
      contentEl.innerHTML = "<p>找不到這篇文章，可能已被移除或尚未發佈。</p>";
      return true;
    }

    if (res.error || !res.data || !res.data.length) return notFound();

    var a = res.data[0];
    var vis = effectiveVisibility(a);
    if (vis === "private") {
      var isAdmin = false;
      try {
        if (window.SBAuth && window.SBAuth.isAdmin) isAdmin = !!(await window.SBAuth.isAdmin());
      } catch (e) {
        isAdmin = false;
      }
      if (!isAdmin) return notFound();
    }

    var r = R();
    if (!r || typeof r.mountArticleReading !== "function") {
      console.warn("[cms] SBArticleRenderer.mountArticleReading missing");
      contentEl.innerHTML = window.SB.renderMarkdown(a.body || "");
      return true;
    }

    return r.mountArticleReading(a, {
      titleEl: titleEl,
      statusEl: statusEl,
      contentEl: contentEl,
      postSection: postSection,
      applyReadingFocus: true,
    });
  }

  function normalizeSiteCopyMarkdown(value) {
    var text = String(value == null ? "" : value).replace(/\r\n/g, "\n");
    text = text.replace(/^\n+/, "").replace(/\n+$/, "");
    var lines = text.split("\n");
    var nonEmpty = lines.filter(function (l) { return l.trim().length; });
    if (nonEmpty.length) {
      var indents = nonEmpty.map(function (l) {
        var m = l.match(/^[ \t]+/);
        return m ? m[0].length : 0;
      });
      var min = Math.min.apply(null, indents);
      if (min > 0) {
        lines = lines.map(function (l) {
          if (!l.trim()) return "";
          return l.slice(min);
        });
        text = lines.join("\n");
      }
    }
    return text;
  }

  async function applySections() {
    var nodes = document.querySelectorAll("[data-section-key]");
    if (!nodes.length) return;
    var schema = window.LYZSiteCopySchema;
    var map = {};
    if (schema && Array.isArray(schema.ENTRIES)) {
      schema.ENTRIES.forEach(function (e) {
        if (e && e.key != null) map[e.key] = e.fallback;
      });
    }
    try {
      if (useStatic()) {
        var staticRes = await window.CmsData.getSiteSections();
        if (!staticRes.error && staticRes.data) {
          staticRes.data.forEach(function (row) {
            if (row && row.key != null && row.value != null) map[row.key] = row.value;
          });
        }
      } else {
        var client = window.SB.client();
        if (client) {
          var res = await client.from("site_sections").select("key,value");
          if (!res.error && res.data) {
            res.data.forEach(function (row) {
              if (row && row.key != null && row.value != null) map[row.key] = row.value;
            });
          }
        }
      }
    } catch (e) {}
    nodes.forEach(function (el) {
      var key = el.getAttribute("data-section-key");
      if (map[key] == null || map[key] === "") return;
      var mode = el.getAttribute("data-section-mode") || "text";
      var entry = schema && schema.byKey ? schema.byKey(key) : null;
      if (entry && entry.mode) mode = el.getAttribute("data-section-mode") || entry.mode;
      var raw = map[key];
      if (mode === "markdown" && window.SB && typeof window.SB.renderMarkdown === "function") {
        var normalized = normalizeSiteCopyMarkdown(raw);
        el.innerHTML = window.SB.renderMarkdown(normalized);
        var onlyPre =
          el.children.length === 1 &&
          el.firstElementChild &&
          el.firstElementChild.tagName === "PRE";
        var accidentalCode =
          String(raw).indexOf("```") < 0 &&
          (onlyPre ||
            (el.querySelector("pre > code") &&
              el.querySelectorAll("p,h1,h2,h3,ul,ol,blockquote").length === 0));
        if (accidentalCode) {
          el.innerHTML = esc(normalized).replace(/\n/g, "<br />");
        }
        if (el.classList.contains("about-profile__body") || el.getAttribute("data-about-folds") === "1") {
          if (typeof window.LYZEnhanceAboutMarkdownFolds === "function") {
            window.LYZEnhanceAboutMarkdownFolds(el);
          }
        }
      } else if (mode === "multiline") {
        el.innerHTML = esc(normalizeSiteCopyMarkdown(raw)).replace(/\n/g, "<br />");
      } else {
        if (el.tagName === "A" || el.tagName === "OPTION" || el.tagName === "LABEL" || el.children.length === 0) {
          el.textContent = raw;
        } else {
          el.innerHTML = esc(raw).replace(/\n/g, "<br />");
        }
      }
    });
  }

  window.LYZNormalizeSiteCopyMarkdown = normalizeSiteCopyMarkdown;

  document.addEventListener("DOMContentLoaded", function () {
    var container = document.getElementById("posts-container");
    var listMode = container && container.getAttribute("data-list-mode");

    if (CONFIGURED && container && container.getAttribute("data-section")) {
      container.innerHTML =
        '<div class="cms-loading" data-section-key="ui.loading.articles" style="text-align:center;padding:40px 0;opacity:.7;">載入文章中…</div>';
    }

    async function gateAcademicIfNeeded() {
      if (listMode !== "academic") return true;
      var isAdmin = false;
      try {
        if (window.SBAuth && window.SBAuth.isAdmin) isAdmin = !!(await window.SBAuth.isAdmin());
      } catch (e) {
        isAdmin = false;
      }
      if (!isAdmin) {
        window.location.replace("index.html");
        return false;
      }
      document.body.classList.add("admin-gate-ok");
      return true;
    }

    gateAcademicIfNeeded().then(function (ok) {
      if (!ok) return;
      applySections();
      if (!CONFIGURED) return;
      if (container && container.getAttribute("data-section")) renderList(container);
      if (document.getElementById("markdown-container")) renderArticle();
    });
  });
})();
