/**
 * article-renderer.js — Single Rendering Source of Truth (V6.2)
 *
 * Pure UI: Article Object → DOM.
 * Used by public pages (via cms-public) and admin frontend preview iframe.
 * NO Supabase queries, NO auth, NO DB writes.
 */
(function () {
  "use strict";

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

  function coverConfig(a) {
    if (window.SBArticleMedia && window.SBArticleMedia.resolveCoverDisplay) {
      return window.SBArticleMedia.resolveCoverDisplay(a);
    }
    var fit = "contain";
    var position = "center center";
    var style = "inline";
    var ratio = "16/9";
    if (a && a.cover_display && typeof a.cover_display === "object") {
      if (a.cover_display.fit) fit = a.cover_display.fit;
      if (a.cover_display.position) position = a.cover_display.position;
      if (a.cover_display.style) style = a.cover_display.style;
      if (a.cover_display.ratio) ratio = a.cover_display.ratio;
    }
    return { style: style, ratio: ratio, fit: fit, position: position };
  }

  function coverDisplayStyle(a) {
    var c = coverConfig(a);
    return "object-fit:" + esc(c.fit) + ";object-position:" + esc(c.position) + ";";
  }

  function cardMediaStrategy(metaKey) {
    // Presentation-driven card image policy (not body-length heuristics)
    if (metaKey === "fragment" || metaKey === "quote") return "none";
    if (metaKey === "photo-note") return "photo-priority";
    if (metaKey === "review" || metaKey === "longform") return "editorial";
    return "standard";
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

  function firstBodyExcerpt(body, maxLen) {
    var raw = String(body || "")
      .replace(/^---[\s\S]*?---\s*/m, "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[[^\]]*\]\([^)]+\)/g, "$1")
      .replace(/^#+\s+/gm, "")
      .trim();
    var blocks = raw.split(/\n\s*\n/).map(function (b) {
      return b.replace(/\s+/g, " ").trim();
    }).filter(function (b) {
      return b && !/^(Pixiv|來源|Source)\b/i.test(b) && !/^https?:\/\//i.test(b);
    });
    if (!blocks.length) return "";
    return shortSummary(blocks[0], maxLen || 90);
  }

  /** Stored AI display metadata only — never invent at render time. */
  function semanticCardDisplay(a) {
    var ae = (a && a.ai_editorial) || {};
    var d = ae.display && typeof ae.display === "object" ? ae.display : {};
    var topic = String(d.card_topic || ae.card_topic || "").trim();
    var label = String(d.card_label || ae.card_label || "").trim();
    var showLabel =
      typeof d.show_card_label === "boolean"
        ? d.show_card_label
        : typeof ae.show_card_label === "boolean"
          ? ae.show_card_label
          : !!label;
    return { topic: topic, label: label, showLabel: showLabel && !!label };
  }

  function usesSemanticCard(presentationKey) {
    return (
      presentationKey === "fragment" ||
      presentationKey === "quote" ||
      presentationKey === "photo-note" ||
      presentationKey === "journal"
    );
  }

  function semanticKindLabel(presentationKey, catLabel) {
    if (presentationKey === "photo-note") return "照片隨記";
    if (presentationKey === "quote") return "摘錄";
    if (presentationKey === "journal") return "日記";
    return catLabel || "隨想";
  }

  function formatCardDateFallback(ts) {
    if (!ts) return "一則小廢文";
    try {
      var d = new Date(ts);
      return d.getMonth() + 1 + " 月 " + d.getDate() + " 日的小廢文";
    } catch (e) {
      return "一則小廢文";
    }
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
    var mediaStrategy = cardMediaStrategy(meta.key);
    var slides = mediaStrategy === "none" ? [] : collectSlides(a);
    var coverCfg = coverConfig(a);
    if (coverCfg.style === "none") slides = [];
    var hasCover = slides.length > 0;
    var indexLabel = padIndex((listIndex || 0) + 1);
    var ratioStyle =
      coverCfg.ratio && coverCfg.ratio !== "auto"
        ? "aspect-ratio:" + esc(coverCfg.ratio) + ";"
        : mediaStrategy === "editorial"
          ? "aspect-ratio:16/9;"
          : mediaStrategy === "photo-priority"
            ? "aspect-ratio:4/3;"
            : "aspect-ratio:3/2;";
    var summary = String(a.summary || "").trim();
    if (CAROUSEL_HINT.test(summary) && slides.length > 1) {
      summary = "系列閱讀筆記，共 " + slides.length + " 張預覽圖。";
    }
    var renderSummary = showSummary(a) && !!summary;
    var renderTitle = showTitle(a);
    var semantic = usesSemanticCard(meta.key);
    var cardDisplay = semantic ? semanticCardDisplay(a) : null;

    var art = document.createElement("article");
    art.className =
      ("note-item " + (meta.listClass || "")).trim() +
      (hasCover ? " note-item--has-cover" : " note-item--no-cover note-item--text-only") +
      (semantic ? " note-item--semantic" : "");
    art.setAttribute("data-category", cat);
    art.setAttribute("data-presentation", meta.key);
    art.setAttribute("data-upload", upload);
    art.setAttribute("data-edit", edit);
    art.setAttribute("data-title", a.title || "");
    art.setAttribute("data-has-cover", hasCover ? "1" : "0");
    if (cardDisplay && cardDisplay.topic) {
      art.setAttribute("data-card-topic", cardDisplay.topic);
    }

    if (semantic) {
      var kind = semanticKindLabel(meta.key, catLabel);
      var metaLine =
        esc(kind) +
        (cardDisplay.topic ? '<span class="meta-dot" aria-hidden="true">·</span><span class="meta-topic">' + esc(cardDisplay.topic) + "</span>" : "");
      var metaHtml =
        '<header class="note-card__meta">' +
        '<span class="meta-cat">' +
        metaLine +
        "</span>" +
        (uploadDot
          ? '<time class="meta-pub" datetime="' + esc(upload) + '">' + esc(uploadDot) + "</time>"
          : "") +
        "</header>";

      var labelText = "";
      if (cardDisplay.showLabel && cardDisplay.label) labelText = cardDisplay.label;
      else {
        var excerpt = firstBodyExcerpt(a.body, 72);
        if (excerpt) labelText = ""; // show excerpt only below
        else labelText = formatCardDateFallback(a.published_at || a.created_at);
      }
      var labelHtml = labelText
        ? '<p class="note-card__label"><a href="' + url + '">' + esc(labelText) + "</a></p>"
        : "";
      // Accessibility: keep a hidden title for screen readers
      var srTitle =
        '<h2 class="note-card__title note-card__title--sr"><a href="' +
        url +
        '"><span class="visually-hidden">' +
        esc(cardDisplay.label || cardDisplay.topic || a.title || kind) +
        "</span></a></h2>";

      var bodyExcerpt = firstBodyExcerpt(a.body, 110);
      var excerptHtml = bodyExcerpt
        ? '<p class="note-card__excerpt note-card__excerpt--body">' + esc(bodyExcerpt) + "</p>"
        : renderSummary
          ? '<p class="note-card__excerpt">' + esc(shortSummary(summary, 160)) + "</p>"
          : "";

      // Avoid duplicating the same line as both label and excerpt
      if (
        labelText &&
        bodyExcerpt &&
        shortSummary(labelText, 40) === shortSummary(bodyExcerpt, 40)
      ) {
        if (cardDisplay.showLabel && cardDisplay.label) excerptHtml = "";
        else labelHtml = "";
      }

      var mediaHtml = "";
      if (hasCover) {
        if (slides.length === 1) {
          mediaHtml =
            '<div class="card-media-zone card-media-zone--' +
            esc(mediaStrategy) +
            '" style="' +
            ratioStyle +
            '"><a href="' +
            url +
            '" class="image fit"><img loading="lazy" src="' +
            esc(slides[0].src) +
            '" alt="" style="' +
            coverDisplayStyle(a) +
            '" /></a></div>';
        } else {
          mediaHtml =
            '<div class="card-media-zone card-media-zone--' +
            esc(mediaStrategy) +
            '"><div class="card-carousel" style="' +
            ratioStyle +
            '">';
          slides.forEach(function (s, si) {
            mediaHtml +=
              '<div class="carousel-slide' +
              (si === 0 ? " active" : "") +
              '"><a href="' +
              url +
              '" class="image fit"><img loading="lazy" src="' +
              esc(s.src) +
              '" alt="" style="' +
              coverDisplayStyle(a) +
              '" />' +
              (s.caption ? '<span class="carousel-caption">' + esc(s.caption) + "</span>" : "") +
              "</a></div>";
          });
          mediaHtml += '<div class="carousel-dots" aria-hidden="true">';
          slides.forEach(function (_, si) {
            mediaHtml +=
              '<span class="carousel-dot' + (si === 0 ? " is-active" : "") + '"></span>';
          });
          mediaHtml += "</div></div></div>";
        }
      }

      art.innerHTML =
        metaHtml +
        srTitle +
        '<div class="note-card__content">' +
        labelHtml +
        mediaHtml +
        excerptHtml +
        "</div>" +
        '<div class="note-card__footer">' +
        editorialCta(url, meta.cardCta) +
        "</div>";
      return art;
    }

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
        '<div class="note-card__rule" aria-hidden="true"></div>' +
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
        '<div class="card-media-zone card-media-zone--' +
        esc(mediaStrategy) +
        '" style="' +
        ratioStyle +
        '"><a href="' +
        url +
        '" class="image fit"><img loading="lazy" src="' +
        esc(slides[0].src) +
        '" alt="" style="' +
        coverDisplayStyle(a) +
        '" /></a></div>';
    } else {
      mediaHtml =
        '<div class="card-media-zone card-media-zone--' +
        esc(mediaStrategy) +
        '"><div class="card-carousel" style="' +
        ratioStyle +
        '">';
      slides.forEach(function (s, si) {
        mediaHtml +=
          '<div class="carousel-slide' +
          (si === 0 ? " active" : "") +
          '"><a href="' +
          url +
          '" class="image fit"><img loading="lazy" src="' +
          esc(s.src) +
          '" alt="" style="' +
          coverDisplayStyle(a) +
          '" />' +
          (s.caption ? '<span class="carousel-caption">' + esc(s.caption) + "</span>" : "") +
          "</a></div>";
      });
      mediaHtml += '<div class="carousel-dots" aria-hidden="true">';
      slides.forEach(function (_, si) {
        mediaHtml +=
          '<span class="carousel-dot' + (si === 0 ? " is-active" : "") + '"></span>';
      });
      mediaHtml += "</div></div></div>";
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
      '<details class="article-toc__panel"' + (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 900px)").matches ? "" : " open") + '><summary>文章大綱</summary><ol class="article-toc__list">';
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
    if (window.SBArticleMedia && window.SBArticleMedia.enhanceMarkdownMedia) {
      window.SBArticleMedia.enhanceMarkdownMedia(root);
      return;
    }
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


  /**
   * Mount a full article reading view into existing note-like DOM slots.
   * options: { titleEl, statusEl, contentEl, postSection, applyReadingFocus?: boolean }
   */
  function mountArticleReading(a, options) {
    options = options || {};
    var titleEl = options.titleEl || null;
    var statusEl = options.statusEl || null;
    var contentEl = options.contentEl || null;
    var postSection = options.postSection || null;
    if (!a || !contentEl) return false;
    if (!window.SB || typeof window.SB.renderMarkdown !== "function") {
      contentEl.textContent = a.body || "";
      return false;
    }

    var meta = presentationMeta(a);
    if (typeof document !== "undefined" && document.body) {
      document.body.dataset.presentation = meta.key;
      document.body.classList.add("reading-page", meta.articleClass);
    }
    if (postSection) {
      postSection.classList.add("is-article-reading", meta.articleClass);
      postSection.setAttribute("data-presentation", meta.key);
    }

    if (showTitle(a)) {
      if (titleEl) {
        titleEl.innerText = a.title || "";
        titleEl.classList.remove("visually-hidden");
        titleEl.removeAttribute("aria-hidden");
      }
    } else if (titleEl) {
      titleEl.innerText = "";
      titleEl.classList.add("visually-hidden");
      titleEl.setAttribute("aria-hidden", "true");
    }

    if (statusEl) {
      var bits = [];
      if (a.category) bits.push(displayCategory(a.category));
      bits.push("更新於 " + fmtDate(a.updated_at || a.published_at || a.created_at));
      statusEl.innerText = bits.join(" · ");
    }

    var existingHero = postSection && postSection.querySelector(".article-hero, .article-cover-inline");
    if (existingHero) existingHero.remove();
    if (postSection) postSection.classList.remove("has-article-hero", "has-article-cover-inline");

    // Cover/hero above the article intentionally disabled — body Markdown images only.

    var html = window.SB.renderMarkdown(a.body || "");
    contentEl.innerHTML = '<div class="markdown-body article-reading">' + html + "</div>";
    var bodyRoot = contentEl.querySelector(".markdown-body");

    enhanceArticleFigures(bodyRoot);
    var toc = buildArticleToc(bodyRoot, meta.allowToc);
    if (toc && postSection) {
      var oldToc = postSection.querySelector(".article-toc");
      if (oldToc) oldToc.remove();
      postSection.classList.add("has-toc");
      var md = postSection.querySelector("#markdown-container") || contentEl;
      if (md && md.parentNode === postSection) postSection.insertBefore(toc, md);
      else postSection.appendChild(toc);
    } else if (postSection) {
      postSection.classList.remove("has-toc");
      var stale = postSection.querySelector(".article-toc");
      if (stale) stale.remove();
    }

    if (options.applyReadingFocus !== false && typeof window.applyReadingFocus === "function") {
      window.applyReadingFocus();
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

  function renderArticleInto(target, article, options) {
    options = options || {};
    if (!target) return null;
    target.innerHTML = "";
    target.classList.add("admin-preview-article-host");
    var section = document.createElement("section");
    section.className = "post is-article-reading";
    section.innerHTML =
      '<header class="major">' +
      '<span class="date" id="note-status"></span>' +
      '<h1 id="note-title"></h1>' +
      "</header>" +
      '<div id="markdown-container"></div>';
    target.appendChild(section);
    mountArticleReading(article, {
      titleEl: section.querySelector("#note-title"),
      statusEl: section.querySelector("#note-status"),
      contentEl: section.querySelector("#markdown-container"),
      postSection: section,
      applyReadingFocus: options.applyReadingFocus,
    });
    return section;
  }

  function renderCardInto(target, article, listIndex) {
    if (!target) return null;
    target.innerHTML = "";
    target.classList.add("admin-preview-card-host", "posts");
    var card = buildCard(article, listIndex || 0);
    card.querySelectorAll("a[href]").forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
        e.preventDefault();
      });
      anchor.setAttribute("href", "#");
    });
    target.appendChild(card);
    return card;
  }

  window.SBArticleRenderer = {
    buildCard: buildCard,
    buildArticleCard: buildCard,
    mountArticleReading: mountArticleReading,
    renderArticle: renderArticleInto,
    renderArticleInto: renderArticleInto,
    renderCardInto: renderCardInto,
    enhanceArticleFigures: enhanceArticleFigures,
    buildArticleToc: buildArticleToc,
    presentationMeta: presentationMeta,
    showTitle: showTitle,
    showSummary: showSummary,
    coverConfig: coverConfig,
    semanticCardDisplay: semanticCardDisplay,
    fmtDate: fmtDate,
    esc: esc,
  };
})();
