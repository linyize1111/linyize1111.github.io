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

  function buildCard(a) {
    var url = articleUrl(a);
    var upload = fmtDate(a.published_at || a.created_at);
    var edit = fmtDate(a.updated_at);
    var cat = a.category || "";
    var slides = collectSlides(a);
    var imgStyle = coverDisplayStyle(a);

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
    } else if (slides.length > 1) {
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

    var summary = String(a.summary || "").trim();
    if (CAROUSEL_HINT.test(summary) && slides.length > 1) {
      summary = "系列閱讀筆記，共 " + slides.length + " 張預覽圖。";
    }
    var summaryHtml = summary
      ? "<p>" + esc(summary) + "</p>"
      : "";

    var pdfBtn = "";
    var safePdf = safeHttpsUrl(a.pdf_url);
    if (safePdf) {
      pdfBtn =
        '<li><a href="' +
        esc(safePdf) +
        '" target="_blank" rel="noopener noreferrer" class="button primary">檢視 PDF</a></li>';
    }

    var art = document.createElement("article");
    art.className = "note-item";
    art.setAttribute("data-category", cat);
    art.setAttribute("data-upload", upload);
    art.setAttribute("data-edit", edit);
    art.setAttribute("data-title", a.title || "");
    art.innerHTML =
      "<header><span class=\"date\">" +
      '<span class="meta-cat">' +
      esc(cat) +
      "</span>" +
      '<span class="meta-up">上傳: ' +
      esc(upload) +
      "</span>" +
      '<span class="meta-ed">編輯: ' +
      esc(edit) +
      "</span></span>" +
      '<h2><a href="' +
      url +
      '">' +
      esc(a.title) +
      "</a></h2></header>" +
      mediaHtml +
      '<div class="card-body">' +
      summaryHtml +
      '<ul class="actions special"><li><a href="' +
      url +
      '" class="button">閱讀文章</a></li>' +
      pdfBtn +
      "</ul></div>";
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
      rows.forEach(function (a) {
        container.appendChild(buildCard(a));
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
        (a.category ? a.category + " · " : "") +
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
      '<div class="markdown-body" style="background:transparent;color:inherit;padding:2em;">' +
      html +
      "</div>";

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
