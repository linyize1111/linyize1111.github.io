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
    var c = String(cat || "").trim();
    if (c === "短思" || c === "碎念" || c === "短文") return "隨想";
    if (c === "生活札記" || c === "札記" || c === "日常") return "日記";
    if (c === "短感想" || c === "隨感") return "感想";
    if (c === "閱讀心得" || c === "讀後感") return "心得";
    return c;
  }

  function isThoughtCategory(cat) {
    var n = normalizeCategory(cat);
    return n === "隨想" || n === "日記" || n === "感想";
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
    var thought = isThoughtCategory(cat);
    var slides = thought ? [] : collectSlides(a);
    var imgStyle = coverDisplayStyle(a);
    var hasCover = slides.length > 0;
    var indexLabel = padIndex((listIndex || 0) + 1);

    var summary = String(a.summary || "").trim();
    if (CAROUSEL_HINT.test(summary) && slides.length > 1) {
      summary = "系列閱讀筆記，共 " + slides.length + " 張預覽圖。";
    }
    if (!summary) summary = cardVisualText(a, "");
    if (thought) summary = shortSummary(summary, 96);
    else if (!hasCover) summary = shortSummary(summary, 160);

    var art = document.createElement("article");
    art.className =
      "note-item" +
      (thought ? " is-thought" : "") +
      (hasCover ? " note-item--has-cover" : " note-item--no-cover note-item--text-only");
    art.setAttribute("data-category", cat);
    art.setAttribute("data-upload", upload);
    art.setAttribute("data-edit", edit);
    art.setAttribute("data-title", a.title || "");
    art.setAttribute("data-has-cover", hasCover ? "1" : "0");

    var metaHtml =
      '<header class="note-card__meta">' +
      '<span class="meta-cat">' +
      esc(cat || (thought ? "隨想" : "")) +
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
    var safePdf = safeHttpsUrl(a.pdf_url);
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
        '<div class="note-card__rule" aria-hidden="true"></div>' +
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
        editorialCta(url, thought ? "閱讀" : "閱讀文章") +
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

  function safeHttpsUrl(url) {
    if (!url) return "";
    try {
      var u = new URL(String(url), window.location.origin);
      if (u.protocol !== "https:") return "";
      return u.href;
    } catch (e) {
      return "";
    }
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
    var client = window.SB.client();

    var res;
    try {
      res = await client
        .from("articles")
        .select(
          "id,section,slug,title,summary,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index"
        )
        .eq("section", section)
        .eq("status", "published")
        .order("sort_index", { ascending: false })
        .order("published_at", { ascending: false });
    } catch (e) {
      res = { error: e };
    }

    if (res.error) {
      console.warn("[cms] 讀取文章失敗，改用靜態內容：", res.error.message || res.error);
      initListWidgets();
      return;
    }

    var rows = res.data || [];
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
    if (titleEl) titleEl.innerText = a.title || "";
    if (statusEl)
      statusEl.innerText =
        (a.category ? normalizeCategory(a.category) + " · " : "") +
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

    var firstH1 = contentEl.querySelector("h1");
    if (firstH1 && titleEl && !a.title) {
      titleEl.innerText = firstH1.textContent;
      firstH1.remove();
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
    if (!CONFIGURED) return;
    var container = document.getElementById("posts-container");
    if (container && container.getAttribute("data-section")) {
      renderList(container);
    }
    if (document.getElementById("markdown-container")) {
      renderArticle();
    }
    applySections();
  });
})();
