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
  // 讓 page-list.js / page-note.js 知道要不要讓路
  if (CONFIGURED) window.__CMS_DYNAMIC__ = true;

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

  // ---- 1. 清單頁 ---------------------------------------------------
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

  function buildCard(a) {
    var url = articleUrl(a);
    var upload = fmtDate(a.published_at || a.created_at);
    var edit = fmtDate(a.updated_at);
    var cat = a.category || "";

    var imgs = Array.isArray(a.images) ? a.images.slice() : [];
    // cover 當作第一張
    var slides = [];
    if (a.cover) slides.push({ src: a.cover, caption: "" });
    imgs.forEach(function (im) {
      if (im && im.src) slides.push({ src: im.src, caption: im.caption || "" });
    });

    var mediaHtml = "";
    if (slides.length === 1) {
      mediaHtml =
        '<a href="' +
        url +
        '" class="image fit"><img loading="lazy" src="' +
        esc(slides[0].src) +
        '" alt="" /></a>';
    } else if (slides.length > 1) {
      mediaHtml = '<div class="card-carousel">';
      slides.forEach(function (s) {
        mediaHtml +=
          '<div class="carousel-slide"><a href="' +
          url +
          '" class="image fit" style="margin-bottom:0;"><img loading="lazy" src="' +
          esc(s.src) +
          '" alt="" />' +
          (s.caption
            ? '<span class="carousel-caption">' + esc(s.caption) + "</span>"
            : "") +
          "</a></div>";
      });
      mediaHtml += "</div>";
    }

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
      "<p>" +
      esc(a.summary) +
      "</p>" +
      '<ul class="actions special"><li><a href="' +
      url +
      '" class="button">閱讀文章</a></li>' +
      pdfBtn +
      "</ul>";
    return art;
  }

  function initListWidgets() {
    // 重新初始化 page-list.js 的排序 / 篩選 / 輪播
    if (typeof window.initSortingAndFiltering === "function")
      window.initSortingAndFiltering();
    if (typeof window.initCarousel === "function") window.initCarousel();
  }

  async function renderList(container) {
    var section = container.getAttribute("data-section");
    var client = window.SB.client();

    // 注意：抓取成功前「不清空」既有靜態 HTML，避免資料庫尚未就緒時把內容清掉。
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
      // 讀取失敗（例如資料表尚未建立）→ 保留現有靜態內容，照常初始化排序/輪播。
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

  // ---- 2. 文章頁 ---------------------------------------------------
  async function renderArticle() {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("id");
    var section = params.get("section");
    if (!slug) return false;

    var titleEl = document.getElementById("note-title");
    var statusEl = document.getElementById("note-status");
    var contentEl = document.getElementById("markdown-container");
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

    var html = "";
    if (a.cover) {
      html +=
        '<img src="' + esc(a.cover) + '" alt="" style="margin:0 auto 2rem;" />';
    }
    html += window.SB.renderMarkdown(a.body || "");
    contentEl.innerHTML =
      '<div class="markdown-body" style="background:transparent;color:inherit;padding:2em;">' +
      html +
      "</div>";

    // 內文的第一個 h1 若與標題重複則移除
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

  // ---- 3. 區塊文字 --------------------------------------------------
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
        // 保留換行
        el.innerHTML = esc(map[key]).replace(/\n/g, "<br />");
      }
    });
  }

  // ---- 入口 --------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    if (!CONFIGURED) return; // 未設定：維持靜態 HTML
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
