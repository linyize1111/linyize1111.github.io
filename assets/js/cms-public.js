/**
 * cms-public.js — V3 AI-first
 *
 * Renders from stored presentation / show_title / show_summary.
 * NEVER infers fragment/longform/photo-note from character or image counts.
 * Missing presentation → safe article-lite (+ needs AI review is admin-side).
 */
(function () {
  "use strict";

  var CONFIGURED = window.SB && window.SB.isConfigured && window.SB.isConfigured();
  if (CONFIGURED) window.__CMS_DYNAMIC__ = true;

  var CAROUSEL_HINT = /^點擊圖片即前往/;
  var ARTICLE_FIELDS =
    "id,section,slug,title,summary,body,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index,content_type,presentation,visibility,series,show_title,show_summary,ai_editorial,needs_ai_analysis,cover_display";
  var ARTICLE_FIELDS_LEGACY =
    "id,section,slug,title,summary,body,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index";

  function fmtDate(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toISOString().slice(0, 10);
    } catch (e) {
      return "";
    }
  }

  function fmtDotDate(ts) {
    var d = fmtDate(ts);
    return d ? d.replace(/-/g, ".") : "";
  }

  function padIndex(n) {
    var i = Number(n) || 0;
    return i < 10 ? "0" + i : String(i);
  }

  function esc(s) {
    return window.SB.escapeText(s);
  }

  function articleUrl(a) {
    return (
      "note.html?id=" +
      encodeURIComponent(a.slug) +
      "&section=" +
      encodeURIComponent(a.section)
    );
  }

  function normalizeCategory(cat) {
    if (window.SBSections && window.SBSections.normalizeCategory) {
      return window.SBSections.normalizeCategory(cat);
    }
    return String(cat || "").trim();
  }

  function displayCategory(cat) {
    if (window.SBSections && window.SBSections.displayCategory) {
      return window.SBSections.displayCategory(cat);
    }
    var n = normalizeCategory(cat);
    return n === "隨筆" ? "散文" : n;
  }

  function presentationMeta(a) {
    if (window.SBPresentation) return window.SBPresentation.getPresentationMeta(a);
    return {
      key: "article-lite",
      listClass: "",
      articleClass: "presentation-article-lite",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: false,
      cardCta: "閱讀文章",
    };
  }

  function showTitle(a) {
    if (window.SBPresentation) return window.SBPresentation.showTitle(a);
    return true;
  }

  function showSummary(a) {
    if (window.SBPresentation) return window.SBPresentation.showSummary(a);
    return true;
  }

  function effectiveVisibility(a) {
    if (window.SBPresentation) return window.SBPresentation.effectiveVisibility(a);
    return "public";
  }

  function coverDisplayStyle(a) {
    var fit = "contain";
    var position = "center center";
    if (a && a.cover_display && typeof a.cover_display === "object") {
      if (a.cover_display.fit) fit = a.cover_display.fit;
      if (a.cover_display.position) position = a.cover_display.position;
    }
    return "object-fit:" + esc(fit) + ";object-position:" + esc(position) + ";";
  }

  function collectSlides(a) {
    var seen = new Set();
    var slides = [];
    var broken = /(?:^|\/)rat\.jpg$/i;
    function push(src, caption) {
      if (!src || seen.has(src) || broken.test(src)) return;
      seen.add(src);
      slides.push({ src: src, caption: caption || "" });
    }
    if (a.cover) push(a.cover, "");
    (Array.isArray(a.images) ? a.images : []).forEach(function (im) {
      if (im && im.src) push(im.src, im.caption || "");
    });
    return slides;
  }

  function resolvePdfUrl(url) {
    if (!url) return "";
    var raw = String(url).trim();
    if (!raw) return "";
    try {
      var u = new URL(raw, window.location.href);
      if (u.protocol === "https:") return u.href;
      if (u.protocol === "http:" && u.hostname === window.location.hostname) return u.href;
    } catch (e) {
      return "";
    }
    return "";
  }

  function editorialCta(url, label) {
    return (
      '<a href="' +
      url +
      '" class="note-card__cta"><span>' +
      esc(label || "閱讀文章") +
      '</span><span class="note-card__cta-line" aria-hidden="true"></span>' +
      '<span class="note-card__cta-arrow" aria-hidden="true">→</span></a>'
    );
  }

  function shortSummary(text, maxLen) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }

  /** List/card renderer driven by stored presentation only. */
  function buildCard(a, listIndex) {
    var meta = presentationMeta(a);
    var url = articleUrl(a);
    var upload = fmtDate(a.published_at || a.created_at);
    var uploadDot = fmtDotDate(a.published_at || a.created_at);
    var edit = fmtDate(a.updated_at);
    var cat = normalizeCategory(a.category || "");
    var catLabel = displayCategory(cat);
    var slides =
      meta.key === "fragment" || meta.key === "quote" ? [] : collectSlides(a);
    if (meta.key === "photo-note" && !slides.length) slides = collectSlides(a);
    var hasCover = slides.length > 0;
    var indexLabel = padIndex((listIndex || 0) + 1);
    var summary = String(a.summary || "").trim();
    if (CAROUSEL_HINT.test(summary) && slides.length > 1) {
      summary = "系列閱讀筆記，共 " + slides.length + " 張預覽圖。";
    }
    var renderSummary = showSummary(a) && !!summary;
    var renderTitle = showTitle(a);

    var art = document.createElement("article");
    art.className =
      ("note-item " + (meta.listClass || "")).trim() +
      (hasCover ? " note-item--has-cover" : " note-item--no-cover note-item--text-only");
    art.setAttribute("data-category", cat);
    art.setAttribute("data-presentation", meta.key);
    art.setAttribute("data-upload", upload);
    art.setAttribute("data-edit", edit);
    art.setAttribute("data-title", a.title || "");
    art.setAttribute("data-has-cover", hasCover ? "1" : "0");

    var metaHtml =
      '<header class="note-card__meta">' +
      '<span class="meta-cat">' +
      esc(catLabel || "") +
      "</span>" +
      (uploadDot
        ? '<time class="meta-pub" datetime="' + esc(upload) + '">' + esc(uploadDot) + "</time>"
        : "") +
      "</header>";

    var titleHtml = renderTitle
      ? '<h2 class="note-card__title"><a href="' + url + '">' + esc(a.title || "（無標題）") + "</a></h2>"
      : '<h2 class="note-card__title note-card__title--sr"><a href="' +
        url +
        '"><span class="visually-hidden">' +
        esc(a.title || "閱讀") +
        "</span></a></h2>";

    var pdfLink = "";
    var safePdf = resolvePdfUrl(a.pdf_url);
    if (safePdf && meta.key === "reference") {
      pdfLink =
        '<a href="' +
        esc(safePdf) +
        '" target="_blank" rel="noopener noreferrer" class="note-card__pdf">檢視 PDF</a>';
    }

    var excerptHtml = renderSummary
      ? '<p class="note-card__excerpt">' + esc(shortSummary(summary, 220)) + "</p>"
      : "";

    if (!hasCover) {
      art.innerHTML =
        metaHtml +
        '<div class="note-card__content">' +
        titleHtml +
        (meta.key === "fragment" || meta.key === "quote"
          ? ""
          : '<div class="note-card__rule" aria-hidden="true"></div>') +
        excerptHtml +
        "</div>" +
        (meta.key === "longform" || meta.key === "review" || meta.key === "reference"
          ? '<span class="note-card__index" aria-hidden="true">' + esc(indexLabel) + "</span>"
          : "") +
        '<div class="note-card__footer">' +
        editorialCta(url, meta.cardCta) +
        pdfLink +
        "</div>";
      return art;
    }

    var mediaHtml = "";
    if (slides.length === 1) {
      mediaHtml =
        '<div class="card-media-zone"><a href="' +
        url +
        '" class="image fit"><img loading="lazy" src="' +
        esc(slides[0].src) +
        '" alt="" style="' +
        coverDisplayStyle(a) +
        '" /></a></div>';
    } else {
      mediaHtml = '<div class="card-media-zone"><div class="card-carousel">';
      slides.forEach(function (s) {
        mediaHtml +=
          '<div class="carousel-slide"><a href="' +
          url +
          '" class="image fit"><img loading="lazy" src="' +
          esc(s.src) +
          '" alt="" style="' +
          coverDisplayStyle(a) +
          '" />' +
          (s.caption ? '<span class="carousel-caption">' + esc(s.caption) + "</span>" : "") +
          "</a></div>";
      });
      mediaHtml += "</div></div>";
    }

    art.innerHTML =
      metaHtml +
      titleHtml +
      mediaHtml +
      '<div class="card-body note-card__content">' +
      excerptHtml +
      '<div class="note-card__footer">' +
      editorialCta(url, meta.cardCta) +
      pdfLink +
      "</div></div>";
    return art;
  }

  function slugifyHeading(text, used) {
    var base =
      String(text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w\u4e00-\u9fff-]/g, "")
        .slice(0, 48) || "section";
    var id = base;
    var n = 2;
    while (used[id]) {
      id = base + "-" + n;
      n++;
    }
    used[id] = true;
    return id;
  }

  function buildArticleToc(root, allowToc) {
    if (!root || !allowToc) return null;
    var heads = root.querySelectorAll("h2, h3");
    if (heads.length < 2) return null;
    var used = {};
    var items = [];
    Array.prototype.forEach.call(heads, function (h) {
      var text = (h.textContent || "").trim();
      if (!text) return;
      var id = h.id || slugifyHeading(text, used);
      h.id = id;
      items.push({ id: id, text: text, level: h.tagName.toLowerCase() });
    });
    if (items.length < 2) return null;
    var nav = document.createElement("nav");
    nav.className = "article-toc";
    nav.setAttribute("aria-label", "文章大綱");
    var html =
      '<details class="article-toc__panel" open><summary>大綱</summary><ol class="article-toc__list">';
    items.forEach(function (it) {
      html +=
        '<li class="toc-' +
        it.level +
        '"><a href="#' +
        esc(it.id) +
        '">' +
        esc(it.text) +
        "</a></li>";
    });
    html += "</ol></details>";
    nav.innerHTML = html;
    return nav;
  }

  function enhanceArticleFigures(root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll("img"), function (img) {
      if (img.closest("figure")) return;
      var figure = document.createElement("figure");
      figure.className = "article-figure";
      img.parentNode.insertBefore(figure, img);
      figure.appendChild(img);
      var alt = (img.getAttribute("alt") || "").trim();
      if (alt) {
        var cap = document.createElement("figcaption");
        cap.textContent = alt;
        figure.appendChild(cap);
      }
    });
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
    var client = window.SB.client();

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
      res = await selectArticles(client, section);
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
    // Public list: only visibility=public (unlisted is URL-only; private never)
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

    var client = window.SB.client();
    var fields = ARTICLE_FIELDS;
    var q = client.from("articles").select(fields).eq("slug", slug).eq("status", "published").limit(1);
    if (section) q = q.eq("section", section);
    var res = await q;
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

    var meta = presentationMeta(a);
    document.body.dataset.presentation = meta.key;
    document.body.classList.add("reading-page", "reading-focus", meta.articleClass);
    if (postSection) {
      postSection.classList.add("is-article-reading", meta.articleClass);
      postSection.setAttribute("data-presentation", meta.key);
    }

    if (showTitle(a)) {
      if (titleEl) titleEl.innerText = a.title || "";
    } else if (titleEl) {
      titleEl.innerText = "";
      titleEl.classList.add("visually-hidden");
      titleEl.setAttribute("aria-hidden", "true");
    }

    if (statusEl) {
      var bits = [];
      if (a.category) bits.push(displayCategory(a.category));
      bits.push("更新於 " + fmtDate(a.updated_at || a.published_at));
      statusEl.innerText = bits.join(" · ");
    }

    if (postSection && a.cover && meta.key !== "fragment" && meta.key !== "quote") {
      postSection.classList.add("has-article-hero");
      var existingHero = postSection.querySelector(".article-hero");
      if (existingHero) existingHero.remove();
      var hero = document.createElement("div");
      hero.className = "article-hero";
      hero.innerHTML =
        '<img src="' + esc(a.cover) + '" alt="" style="' + coverDisplayStyle(a) + '" />';
      var header = postSection.querySelector("header.major");
      if (header && header.nextSibling) postSection.insertBefore(hero, header.nextSibling);
      else postSection.appendChild(hero);
    }

    var html = window.SB.renderMarkdown(a.body || "");
    contentEl.innerHTML = '<div class="markdown-body article-reading">' + html + "</div>";

    var bodyRoot = contentEl.querySelector(".markdown-body");
    enhanceArticleFigures(bodyRoot);
    var toc = buildArticleToc(bodyRoot, meta.allowToc);
    if (toc && postSection) {
      var oldToc = postSection.querySelector(".article-toc");
      if (oldToc) oldToc.remove();
      postSection.classList.add("has-toc");
      var md = postSection.querySelector("#markdown-container");
      if (md) postSection.insertBefore(toc, md);
      else postSection.appendChild(toc);
    } else if (postSection) {
      postSection.classList.remove("has-toc");
    }

    if (typeof window.applyReadingFocus === "function") window.applyReadingFocus(true);

    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(contentEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) {}
    }
    return true;
  }

  async function applySections() {
    var nodes = document.querySelectorAll("[data-section-key]");
    if (!nodes.length) return;
    var client = window.SB.client();
    var res = await client.from("site_sections").select("key,value");
    if (res.error || !res.data) return;
    var map = {};
    res.data.forEach(function (r) {
      map[r.key] = r.value;
    });
    nodes.forEach(function (el) {
      var key = el.getAttribute("data-section-key");
      if (map[key] == null) return;
      var mode = el.getAttribute("data-section-mode") || "text";
      if (mode === "markdown") el.innerHTML = window.SB.renderMarkdown(map[key]);
      else el.innerHTML = esc(map[key]).replace(/\n/g, "<br />");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var container = document.getElementById("posts-container");
    var listMode = container && container.getAttribute("data-list-mode");

    if (CONFIGURED && container && container.getAttribute("data-section")) {
      container.innerHTML =
        '<div class="cms-loading" style="text-align:center;padding:40px 0;opacity:.7;">載入文章中…</div>';
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
      if (!CONFIGURED) return;
      if (container && container.getAttribute("data-section")) renderList(container);
      if (document.getElementById("markdown-container")) renderArticle();
      applySections();
    });
  });
})();
