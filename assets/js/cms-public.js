/**
 * cms-public.js
 *
 * 公開端動態渲染（從 Supabase 讀取），涵蓋：
 *   1. 清單頁（literature.html / directory.html）：依 #posts-container[data-section]
 *      讀取 status='published' 文章，渲染 .note-item 卡片，並沿用 page-list.js
 *      的排序 / 篩選 / 分頁 / 輪播。
 *   2. 文章頁（note.html?id=<slug>&section=<section>）：讀取單篇並以
 *      marked + DOMPurify 安全渲染。
 *   3. 主要區塊文字：套用到任何帶有 [data-section-key] 的元素。
 *
 * ★ 若 Supabase 尚未設定（placeholder），本檔完全不動作，
 *   全站維持原本靜態 HTML 行為。★
 */
(function () {
  "use strict";

  var CONFIGURED = window.SB && window.SB.isConfigured && window.SB.isConfigured();
  if (CONFIGURED) window.__CMS_DYNAMIC__ = true;

  var CAROUSEL_HINT = /^點擊圖片即前往/;

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

  function editorialCta(url, label) {
    return (
      '<a href="' +
      url +
      '" class="note-card__cta">' +
      "<span>" +
      esc(label || "閱讀文章") +
      "</span>" +
      '<span class="note-card__cta-line" aria-hidden="true"></span>' +
      '<span class="note-card__cta-arrow" aria-hidden="true">→</span>' +
      "</a>"
    );
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

  function coverDisplayStyle(a) {
    var fit = "contain";
    var position = "center center";
    if (a && a.cover_display && typeof a.cover_display === "object") {
      if (a.cover_display.fit) fit = a.cover_display.fit;
      if (a.cover_display.position) position = a.cover_display.position;
    }
    return (
      "object-fit:" +
      esc(fit) +
      ";object-position:" +
      esc(position) +
      ";"
    );
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
    var imgs = Array.isArray(a.images) ? a.images : [];
    imgs.forEach(function (im) {
      if (im && im.src) push(im.src, im.caption || "");
    });
    return slides;
  }

  function normalizeCategory(cat) {
    if (window.SBSections && window.SBSections.normalizeCategory) {
      return window.SBSections.normalizeCategory(cat);
    }
    var c = String(cat || "").trim();
    if (c === "短思" || c === "碎念" || c === "短文" || c === "感想" || c === "短感想" || c === "隨感") return "隨想";
    if (c === "生活札記" || c === "札記" || c === "日常") return "日記";
    if (c === "閱讀心得" || c === "讀後感" || c === "心得感想") return "心得";
    if (c === "散文" || c === "長隨筆") return "隨筆";
    return c;
  }

  function displayCategory(cat) {
    if (window.SBSections && window.SBSections.displayCategory) {
      return window.SBSections.displayCategory(cat);
    }
    var n = normalizeCategory(cat);
    return n === "隨筆" ? "散文" : n;
  }

  function isThoughtCategory(cat) {
    if (window.SBSections && window.SBSections.isThoughtCategory) {
      return window.SBSections.isThoughtCategory(cat);
    }
    var n = normalizeCategory(cat);
    return n === "隨想" || n === "日記";
  }

  function bodyPlainLen(a) {
    return String((a && a.body) || "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/[#>*_`\[\]()!\-]/g, " ")
      .replace(/\s+/g, "")
      .length;
  }

  function imageCount(a) {
    var n = 0;
    if (a && a.cover) n++;
    if (a && Array.isArray(a.images)) n += a.images.length;
    return n;
  }

  function isCompactCard(a, cat) {
    if (normalizeCategory(cat) !== "隨想") return false;
    var len = bodyPlainLen(a);
    if (len > 500) return false;
    if (/^#{2,3}\s/m.test(String((a && a.body) || ""))) return false;
    return imageCount(a) <= 1;
  }

  function isPhotoNoteCard(a, cat) {
    var len = bodyPlainLen(a);
    return imageCount(a) > 0 && len > 0 && len < 300 && isThoughtCategory(cat);
  }

  function shortSummary(text, maxLen) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }

  function cardVisualText(a, summary) {
    var s = String(summary || "").trim();
    if (s) return s;
    var title = String(a && a.title ? a.title : "").trim();
    if (title) return title;
    var body = String(a && a.body ? a.body : "")
      .replace(/[#>*_`\[\]()!\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return body ? shortSummary(body, 120) : "閱讀文章";
  }

  function buildCard(a, listIndex) {
    var url = articleUrl(a);
    var upload = fmtDate(a.published_at || a.created_at);
    var uploadDot = fmtDotDate(a.published_at || a.created_at);
    var edit = fmtDate(a.updated_at);
    var cat = normalizeCategory(a.category || "");
    var catLabel = displayCategory(cat);
    var thought = isThoughtCategory(cat);
    var compact = isCompactCard(a, cat);
    var photoNote = isPhotoNoteCard(a, cat);
    var slides = thought && !photoNote ? [] : collectSlides(a);
    if (compact && !photoNote) slides = [];
    var imgStyle = coverDisplayStyle(a);
    var hasCover = slides.length > 0;
    var indexLabel = padIndex((listIndex || 0) + 1);

    var summary = String(a.summary || "").trim();
    if (CAROUSEL_HINT.test(summary) && slides.length > 1) {
      summary = "系列閱讀筆記，共 " + slides.length + " 張預覽圖。";
    }
    if (!summary) summary = cardVisualText(a, "");
    if (compact) {
      var bodyPlain = String(a.body || "")
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
        .replace(/[#>*_`\[\]()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      summary = shortSummary(bodyPlain || summary, 220);
    } else if (thought) summary = shortSummary(summary, 96);
    else if (!hasCover) summary = shortSummary(summary, 160);

    var art = document.createElement("article");
    art.className =
      "note-item" +
      (thought ? " is-thought" : "") +
      (compact ? " is-compact" : "") +
      (photoNote ? " is-photo-note" : "") +
      (hasCover ? " note-item--has-cover" : " note-item--no-cover note-item--text-only");
    art.setAttribute("data-category", cat);
    art.setAttribute("data-upload", upload);
    art.setAttribute("data-edit", edit);
    art.setAttribute("data-title", a.title || "");
    art.setAttribute("data-has-cover", hasCover ? "1" : "0");

    var metaHtml =
      '<header class="note-card__meta">' +
      '<span class="meta-cat">' +
      esc(catLabel || (thought ? "隨想" : "")) +
      "</span>" +
      (uploadDot
        ? '<time class="meta-pub" datetime="' +
          esc(upload) +
          '">' +
          esc(uploadDot) +
          "</time>"
        : "") +
      (edit && !thought
        ? '<span class="meta-ed visually-quiet">編輯: ' + esc(edit) + "</span>"
        : "") +
      "</header>";

    var pdfLink = "";
    var safePdf = resolvePdfUrl(a.pdf_url);
    if (safePdf && !thought) {
      pdfLink =
        '<a href="' +
        esc(safePdf) +
        '" target="_blank" rel="noopener noreferrer" class="note-card__pdf">檢視 PDF</a>';
    }

    if (!hasCover) {
      // Editorial typography card — no gray image placeholder
      art.innerHTML =
        metaHtml +
        '<div class="note-card__content">' +
        '<h2 class="note-card__title"><a href="' +
        url +
        '">' +
        esc(a.title) +
        "</a></h2>" +
        (compact ? "" : '<div class="note-card__rule" aria-hidden="true"></div>') +
        (summary
          ? '<p class="note-card__excerpt">' + esc(summary) + "</p>"
          : "") +
        "</div>" +
        (!thought
          ? '<span class="note-card__index" aria-hidden="true">' +
            esc(indexLabel) +
            "</span>"
          : "") +
        '<div class="note-card__footer">' +
        editorialCta(url, compact ? "閱讀" : thought ? "閱讀" : "閱讀文章") +
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
        imgStyle +
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
          imgStyle +
          '" />' +
          (s.caption
            ? '<span class="carousel-caption">' + esc(s.caption) + "</span>"
            : "") +
          "</a></div>";
      });
      mediaHtml += "</div></div>";
    }

    art.innerHTML =
      metaHtml +
      '<h2 class="note-card__title"><a href="' +
      url +
      '">' +
      esc(a.title) +
      "</a></h2>" +
      mediaHtml +
      '<div class="card-body note-card__content">' +
      (summary ? '<p class="note-card__excerpt">' + esc(summary) + "</p>" : "") +
      '<div class="note-card__footer">' +
      editorialCta(url, "閱讀文章") +
      pdfLink +
      "</div></div>";
    return art;
  }

  /** Accept https absolute URLs and same-origin / relative PDF paths (e.g. pdfs/foo.pdf). */
  function resolvePdfUrl(url) {
    if (!url) return "";
    var raw = String(url).trim();
    if (!raw) return "";
    try {
      var u = new URL(raw, window.location.href);
      if (u.protocol === "https:") return u.href;
      if (u.protocol === "http:" && u.hostname === window.location.hostname) return u.href;
      if (u.protocol === "http:" || u.protocol === "https:") return "";
    } catch (e) {
      return "";
    }
    return "";
  }

  function safeHttpsUrl(url) {
    return resolvePdfUrl(url);
  }

  function slugifyHeading(text, used) {
    var base = String(text || "")
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

  function buildArticleToc(root, bodyText) {
    if (!root) return null;
    var heads = root.querySelectorAll("h2, h3");
    var bodyLen = String(bodyText || "").replace(/\s+/g, "").length;
    if (heads.length < 3 && bodyLen < 2500) return null;
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
      '<details class="article-toc__panel" open>' +
      "<summary>大綱</summary><ol class=\"article-toc__list\">";
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
      if (img.naturalWidth && img.naturalWidth >= 1200) {
        figure.classList.add("is-breakout");
      } else {
        img.addEventListener(
          "load",
          function () {
            if (img.naturalWidth >= 1200) figure.classList.add("is-breakout");
          },
          { once: true }
        );
      }
    });
  }

  function initListWidgets() {
    if (typeof window.enhanceNoCoverCards === "function")
      window.enhanceNoCoverCards();
    if (typeof window.initSortingAndFiltering === "function")
      window.initSortingAndFiltering();
    if (typeof window.initCarousel === "function") window.initCarousel();
  }

  async function renderList(container) {
    var section = container.getAttribute("data-section");
    var listMode = container.getAttribute("data-list-mode") || "";
    var client = window.SB.client();

    if (listMode === "academic") {
      var isAdmin = false;
      try {
        if (window.SBAuth && window.SBAuth.isAdmin) {
          isAdmin = !!(await window.SBAuth.isAdmin());
        }
      } catch (e) {
        isAdmin = false;
      }
      if (!isAdmin) {
        // 訪客：不提示「學科筆記」存在，靜默離開
        window.location.replace("index.html");
        return;
      }
      document.body.classList.add("admin-gate-ok");
    }

    container.innerHTML =
      '<div class="cms-loading" style="text-align:center;padding:40px 0;opacity:.7;">載入文章中…</div>';

    var res;
    try {
      res = await client
        .from("articles")
        .select(
          "id,section,slug,title,summary,body,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index"
        )
        .eq("section", section)
        .eq("status", "published")
        .order("sort_index", { ascending: false })
        .order("published_at", { ascending: false });
    } catch (e) {
      res = { error: e };
    }

    if (res.error) {
      console.warn("[cms] 讀取文章失敗：", res.error.message || res.error);
      // CMS 啟用時不回退靜態幽靈內容
      container.innerHTML =
        '<div style="text-align:center;padding:40px 0;opacity:.75;">文章載入失敗，請稍後再試。</div>';
      return;
    }

    var rows = res.data || [];
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
    var q = client
      .from("articles")
      .select("title,body,cover,category,published_at,updated_at,section,status")
      .eq("slug", slug)
      .eq("status", "published")
      .limit(1);
    if (section) q = q.eq("section", section);

    var res = await q;
    if (res.error || !res.data || !res.data.length) {
      if (titleEl) titleEl.innerText = "404 文章未找到";
      if (statusEl) statusEl.innerText = "Not Found";
      contentEl.innerHTML = "<p>找不到這篇文章，可能已被移除或尚未發佈。</p>";
      return true;
    }

    var a = res.data[0];
    if (
      window.SBSections &&
      window.SBSections.isAcademicCategory &&
      window.SBSections.isAcademicCategory(a.category)
    ) {
      var isAdmin = false;
      try {
        if (window.SBAuth && window.SBAuth.isAdmin) {
          isAdmin = !!(await window.SBAuth.isAdmin());
        }
      } catch (e) {
        isAdmin = false;
      }
      if (!isAdmin) {
        if (titleEl) titleEl.innerText = "404 文章未找到";
        if (statusEl) statusEl.innerText = "Not Found";
        contentEl.innerHTML = "<p>找不到這篇文章，可能已被移除或尚未發佈。</p>";
        return true;
      }
    }
    if (titleEl) titleEl.innerText = a.title || "";
    if (statusEl)
      statusEl.innerText =
        (a.category ? displayCategory(a.category) + " · " : "") +
        "更新於 " +
        fmtDate(a.updated_at || a.published_at);

    if (postSection && a.cover) {
      postSection.classList.add("has-article-hero");
      var existingHero = postSection.querySelector(".article-hero");
      if (existingHero) existingHero.remove();
      var hero = document.createElement("div");
      hero.className = "article-hero";
      hero.innerHTML =
        '<img src="' +
        esc(a.cover) +
        '" alt="" style="' +
        coverDisplayStyle(a) +
        '" />';
      var header = postSection.querySelector("header.major");
      if (header && header.nextSibling) {
        postSection.insertBefore(hero, header.nextSibling);
      } else {
        postSection.appendChild(hero);
      }
    }

    var html = window.SB.renderMarkdown(a.body || "");
    contentEl.innerHTML =
      '<div class="markdown-body article-reading">' + html + "</div>";
    if (postSection) postSection.classList.add("is-article-reading");
    document.body.classList.add("reading-page", "reading-focus");

    var firstH1 = contentEl.querySelector("h1");
    if (firstH1 && titleEl && !a.title) {
      titleEl.innerText = firstH1.textContent;
      firstH1.remove();
    }

    var bodyRoot = contentEl.querySelector(".markdown-body");
    enhanceArticleFigures(bodyRoot);
    var toc = buildArticleToc(bodyRoot, a.body || "");
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

    if (typeof window.applyReadingFocus === "function") {
      window.applyReadingFocus(true);
    }

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
      if (mode === "markdown") {
        el.innerHTML = window.SB.renderMarkdown(map[key]);
      } else {
        el.innerHTML = esc(map[key]).replace(/\n/g, "<br />");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var container = document.getElementById("posts-container");
    var listMode = container && container.getAttribute("data-list-mode");

    // CMS 啟用：立刻清掉靜態幽靈卡片，避免閃爍
    if (CONFIGURED && container && container.getAttribute("data-section")) {
      container.innerHTML =
        '<div class="cms-loading" style="text-align:center;padding:40px 0;opacity:.7;">載入文章中…</div>';
    }

    async function gateAcademicIfNeeded() {
      if (listMode !== "academic") return true;
      var isAdmin = false;
      try {
        if (window.SBAuth && window.SBAuth.isAdmin) {
          isAdmin = !!(await window.SBAuth.isAdmin());
        }
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
      if (container && container.getAttribute("data-section")) {
        renderList(container);
      }
      if (document.getElementById("markdown-container")) {
        renderArticle();
      }
      applySections();
    });
  });
})();
