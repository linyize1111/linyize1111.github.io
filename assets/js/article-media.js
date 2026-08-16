/**
 * article-media.js — V8 Adaptive Gallery
 * Complete-image-first layouts (no default carousel), justified packing, image viewer.
 */
(function () {
  "use strict";

  var mediaObserver;
  var layoutRaf = 0;
  var TARGET_ROW_H = 250;
  var GALLERY_GAP = 10;

  function imageOnlyBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches("figure.article-figure, figure.article-gallery__item")) return !!node.querySelector("img");
    if (node.tagName === "IMG") return true;
    if (node.tagName !== "P") return false;
    var useful = Array.prototype.filter.call(node.childNodes, function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
    });
    return useful.length === 1 && (
      useful[0].tagName === "IMG" ||
      (useful[0].tagName === "FIGURE" && useful[0].querySelector("img"))
    );
  }

  function extractImg(node) {
    return node && (node.tagName === "IMG" ? node : node.querySelector && node.querySelector("img"));
  }

  function ratioClass(r) {
    if (!isFinite(r) || r <= 0) return "media-ratio-landscape";
    if (r < 0.64) return "media-ratio-tall";
    if (r < 0.90) return "media-ratio-portrait";
    if (r <= 1.12) return "media-ratio-square";
    if (r <= 1.90) return "media-ratio-landscape";
    return "media-ratio-panorama";
  }

  function addBackdrop(host, src) {
    if (!host || !src) return;
    var bg = null;
    try { bg = host.querySelector(":scope > .media-ambient__backdrop"); } catch (e) {}
    if (!bg) {
      bg = document.createElement("span");
      bg.className = "media-ambient__backdrop";
      bg.setAttribute("aria-hidden", "true");
      host.insertBefore(bg, host.firstChild);
    }
    bg.style.backgroundImage = 'url("' + String(src).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '")';
  }

  function analyze(host, img, ambientMode) {
    if (!host || !img) return;
    img.setAttribute("decoding", "async");
    if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");

    function apply() {
      var w = img.naturalWidth || 0, h = img.naturalHeight || 0;
      if (!w || !h) return;
      var signature = w + "x" + h;
      if (host.dataset.mediaV8 === signature) return;
      var r = w / h;
      ["media-ratio-tall","media-ratio-portrait","media-ratio-square","media-ratio-landscape","media-ratio-panorama"].forEach(function (c) {
        host.classList.remove(c);
      });
      host.classList.add(ratioClass(r));
      var ambient = ambientMode === "always" || (ambientMode === "odd" && (r < 0.82 || r > 1.75));
      host.classList.toggle("media-ambient", ambient);
      if (ambient) addBackdrop(host, img.currentSrc || img.src);
      else {
        host.classList.remove("media-ambient");
        var stale = null;
        try { stale = host.querySelector(":scope > .media-ambient__backdrop"); } catch (e) {}
        if (stale) stale.remove();
      }
      host.dataset.mediaV8 = signature;
    }

    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener("load", apply, { once: true });
  }

  function parseGalleryDirective(root, beforeNode) {
    var mode = "adaptive";
    var prev = beforeNode && beforeNode.previousSibling;
    while (prev) {
      if (prev.nodeType === 8) {
        var m = String(prev.nodeValue || "").match(/gallery\s*:\s*(adaptive|grid|carousel|justified)/i);
        if (m) mode = m[1].toLowerCase();
        break;
      }
      if (prev.nodeType === 1 || (prev.nodeType === 3 && String(prev.textContent || "").trim())) break;
      prev = prev.previousSibling;
    }
    return mode;
  }

  function wrapFigures(root) {
    Array.prototype.forEach.call(root.querySelectorAll("img"), function (img) {
      if (img.closest("figure") || img.closest(".article-gallery") || img.closest(".article-lightbox")) return;
      var fig = document.createElement("figure");
      fig.className = "article-figure";
      img.parentNode.insertBefore(fig, img);
      fig.appendChild(img);
      var alt = (img.getAttribute("alt") || "").trim();
      if (alt) {
        var cap = document.createElement("figcaption");
        cap.textContent = alt;
        fig.appendChild(cap);
      }
    });
  }

  function buildGalleryItem(original, node, idx, eager) {
    var item = document.createElement("figure");
    item.className = "article-gallery__item";
    var clone = original.cloneNode(true);
    clone.removeAttribute("style");
    clone.loading = eager ? "eager" : "lazy";
    clone.decoding = "async";
    if (eager) clone.setAttribute("fetchpriority", "high");
    item.appendChild(clone);
    var oldCap = node.querySelector && node.querySelector("figcaption");
    var alt = (original.getAttribute("alt") || "").trim();
    if (oldCap || alt) {
      var cap = document.createElement("figcaption");
      cap.className = "article-gallery__caption";
      cap.textContent = oldCap ? oldCap.textContent : alt;
      item.appendChild(cap);
    }
    var r = 1.5;
    if (clone.naturalWidth && clone.naturalHeight) r = clone.naturalWidth / clone.naturalHeight;
    item.dataset.ratio = String(r);
    return { item: item, img: clone };
  }

  function layoutModeForCount(n, forced) {
    if (forced === "carousel") return "carousel";
    if (forced === "grid" || forced === "justified") return forced === "grid" ? "grid" : "justified";
    if (n <= 1) return "single";
    if (n === 2) return "pair";
    if (n === 3) return "trio";
    if (n === 4) return "quad";
    return "justified";
  }

  function mergeConsecutiveGalleries(root) {
    var children = Array.prototype.slice.call(root.childNodes).filter(function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
    });
    var i = 0;
    while (i < children.length) {
      if (!imageOnlyBlock(children[i])) { i++; continue; }
      var run = [children[i]], j = i + 1;
      while (j < children.length && imageOnlyBlock(children[j])) { run.push(children[j]); j++; }
      if (run.length < 2) { i = j; continue; }

      var forced = parseGalleryDirective(root, run[0]);
      var gallery = document.createElement("div");
      gallery.className = "article-gallery";
      gallery.tabIndex = 0;
      gallery.setAttribute("role", "region");
      gallery.setAttribute("aria-label", "圖片集");
      gallery.dataset.count = String(run.length);
      gallery.dataset.galleryMode = layoutModeForCount(run.length, forced);

      var items = [];
      run.forEach(function (node, idx) {
        var original = extractImg(node);
        if (!original) return;
        var built = buildGalleryItem(original, node, idx, idx === 0);
        gallery.appendChild(built.item);
        items.push(built);
        if (node.parentNode) node.parentNode.removeChild(node);
        // No ambient blur on every gallery cell (GPU + visual noise)
        analyze(built.item, built.img, "never");
      });

      var insertBefore = children[j] || null;
      if (insertBefore && insertBefore.parentNode === root) root.insertBefore(gallery, insertBefore);
      else root.appendChild(gallery);

      bindAdaptiveGallery(gallery);
      children = Array.prototype.slice.call(root.childNodes).filter(function (n) {
        return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
      });
      i = Array.prototype.indexOf.call(children, gallery) + 1;
      if (i <= 0) i = j;
    }
  }

  function readItemRatio(item) {
    var stored = parseFloat(item.dataset.ratio || "");
    if (isFinite(stored) && stored > 0) return stored;
    var img = item.querySelector("img");
    if (img && img.naturalWidth && img.naturalHeight) {
      var r = img.naturalWidth / img.naturalHeight;
      item.dataset.ratio = String(r);
      return r;
    }
    return 1.5;
  }

  function applyJustifiedLayout(gallery) {
    var items = Array.prototype.slice.call(gallery.querySelectorAll(":scope > .article-gallery__item"));
    if (!items.length) return;
    var containerWidth = gallery.clientWidth || gallery.offsetWidth || 0;
    if (containerWidth < 40) return;

    // READ phase
    var ratios = items.map(readItemRatio);
    var gap = GALLERY_GAP;
    var targetH = TARGET_ROW_H;
    if (containerWidth < 600) targetH = 180;

    var rows = [];
    var cur = { idxs: [], ratioSum: 0 };
    ratios.forEach(function (ratio, idx) {
      cur.idxs.push(idx);
      cur.ratioSum += ratio;
      var gaps = Math.max(0, cur.idxs.length - 1) * gap;
      var projected = targetH * cur.ratioSum + gaps;
      if (projected >= containerWidth * 0.92 && cur.idxs.length >= 1) {
        rows.push(cur);
        cur = { idxs: [], ratioSum: 0 };
      }
    });
    if (cur.idxs.length) rows.push(cur);

    // WRITE phase
    items.forEach(function (item) {
      item.style.flex = "";
      item.style.width = "";
      item.style.height = "";
      item.style.margin = "";
    });

    rows.forEach(function (row, rowIndex) {
      var isLast = rowIndex === rows.length - 1;
      var gaps = Math.max(0, row.idxs.length - 1) * gap;
      var rowHeight;
      if (isLast && row.ratioSum * targetH + gaps < containerWidth * 0.72) {
        rowHeight = targetH;
      } else {
        rowHeight = (containerWidth - gaps) / row.ratioSum;
      }
      rowHeight = Math.max(120, Math.min(rowHeight, 360));
      row.idxs.forEach(function (idx) {
        var item = items[idx];
        var w = rowHeight * ratios[idx];
        item.style.width = w + "px";
        item.style.height = rowHeight + "px";
        item.style.flex = "0 0 auto";
      });
    });
  }

  function scheduleGalleryLayouts(scope) {
    if (layoutRaf) cancelAnimationFrame(layoutRaf);
    layoutRaf = requestAnimationFrame(function () {
      layoutRaf = 0;
      var root = scope || document;
      Array.prototype.forEach.call(root.querySelectorAll(".article-gallery[data-gallery-mode='justified']"), applyJustifiedLayout);
    });
  }

  function bindAdaptiveGallery(gallery) {
    if (!gallery || gallery.dataset.boundV8 === "1") return;
    gallery.dataset.boundV8 = "1";
    var mode = gallery.dataset.galleryMode || "adaptive";
    gallery.classList.add("article-gallery--" + mode);

    var items = gallery.querySelectorAll(":scope > .article-gallery__item");
    Array.prototype.forEach.call(items, function (item, i) {
      var img = item.querySelector("img");
      if (!img) return;
      img.style.cursor = "zoom-in";
      function onReady() {
        if (img.naturalWidth && img.naturalHeight) {
          item.dataset.ratio = String(img.naturalWidth / img.naturalHeight);
        }
        if (mode === "justified") scheduleGalleryLayouts(gallery.parentNode || document);
      }
      if (img.complete && img.naturalWidth) onReady();
      else img.addEventListener("load", onReady, { once: true });
      img.addEventListener("click", function () {
        openLightbox(collectGallerySrcs(gallery), i);
      });
    });

    if (mode === "justified") {
      scheduleGalleryLayouts(gallery.parentNode || document);
      if (typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () { scheduleGalleryLayouts(gallery.parentNode || document); });
        ro.observe(gallery);
      }
    }

    // Optional explicit carousel (directive only)
    if (mode === "carousel") {
      bindLegacyCarousel(gallery);
    }
  }

  function bindLegacyCarousel(gallery) {
    var items = gallery.querySelectorAll(":scope > .article-gallery__item");
    if (items.length < 2) return;
    gallery.classList.add("article-gallery--carousel-active");
    Array.prototype.forEach.call(items, function (item, i) {
      item.classList.toggle("is-active", i === 0);
    });
    [
      ["article-gallery__nav article-gallery__prev", "上一張", "&#10094;"],
      ["article-gallery__nav article-gallery__next", "下一張", "&#10095;"]
    ].forEach(function (spec) {
      if (gallery.querySelector("." + spec[0].split(" ").pop())) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = spec[0];
      b.setAttribute("aria-label", spec[1]);
      b.innerHTML = spec[2];
      gallery.appendChild(b);
    });
    var index = 0;
    function show(n) {
      index = (n + items.length) % items.length;
      Array.prototype.forEach.call(items, function (s, i) {
        s.classList.toggle("is-active", i === index);
      });
    }
    var prev = gallery.querySelector(".article-gallery__prev");
    var next = gallery.querySelector(".article-gallery__next");
    if (prev) prev.addEventListener("click", function () { show(index - 1); });
    if (next) next.addEventListener("click", function () { show(index + 1); });
  }

  function collectGallerySrcs(gallery) {
    return Array.prototype.map.call(gallery.querySelectorAll(".article-gallery__item img"), function (img) {
      var fig = img.closest("figure"), cap = fig && fig.querySelector("figcaption");
      return { src: img.currentSrc || img.getAttribute("src"), caption: cap ? cap.textContent : (img.getAttribute("alt") || "") };
    });
  }

  function openLightbox(items, startIndex) {
    if (!items || !items.length) return;
    var old = document.querySelector(".article-lightbox");
    if (old) old.remove();
    var idx = Math.max(0, Math.min(startIndex || 0, items.length - 1));
    var overlay = document.createElement("div");
    overlay.className = "article-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<button type="button" class="article-lightbox__close" aria-label="關閉">×</button>' +
      '<div class="article-lightbox__counter" aria-live="polite"></div>' +
      '<button type="button" class="article-lightbox__nav article-lightbox__prev" aria-label="上一張">&#10094;</button>' +
      '<figure class="article-lightbox__figure"><img alt="" decoding="async"/><figcaption class="article-lightbox__caption"></figcaption></figure>' +
      '<button type="button" class="article-lightbox__nav article-lightbox__next" aria-label="下一張">&#10095;</button>' +
      '<div class="article-lightbox__thumbs" role="list"></div>';
    document.body.appendChild(overlay);
    document.body.classList.add("lightbox-open");
    var img = overlay.querySelector(".article-lightbox__figure img");
    var cap = overlay.querySelector(".article-lightbox__caption");
    var counter = overlay.querySelector(".article-lightbox__counter");
    var thumbs = overlay.querySelector(".article-lightbox__thumbs");
    var touchX = null, touchY = null;

    items.forEach(function (it, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "article-lightbox__thumb";
      btn.setAttribute("role", "listitem");
      btn.setAttribute("aria-label", "第 " + (i + 1) + " 張");
      btn.innerHTML = '<img src="' + String(it.src).replace(/"/g, "&quot;") + '" alt="" loading="lazy" decoding="async" />';
      btn.addEventListener("click", function () { idx = i; render(); });
      thumbs.appendChild(btn);
    });

    function render() {
      img.src = items[idx].src;
      cap.textContent = items[idx].caption || "";
      counter.textContent = idx + 1 + " / " + items.length;
      Array.prototype.forEach.call(thumbs.children, function (t, i) {
        t.classList.toggle("is-active", i === idx);
      });
      var activeThumb = thumbs.children[idx];
      if (activeThumb && activeThumb.scrollIntoView) {
        activeThumb.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      }
    }
    function move(delta) {
      idx = (idx + delta + items.length) % items.length;
      render();
    }
    function close() {
      overlay.remove();
      document.body.classList.remove("lightbox-open");
      document.removeEventListener("keydown", key);
    }
    function key(e) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
    }
    overlay.querySelector(".article-lightbox__close").addEventListener("click", close);
    overlay.querySelector(".article-lightbox__prev").addEventListener("click", function () { move(-1); });
    overlay.querySelector(".article-lightbox__next").addEventListener("click", function () { move(1); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    overlay.addEventListener("touchstart", function (e) {
      if (!e.touches[0]) return;
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    overlay.addEventListener("touchend", function (e) {
      if (touchX == null || !e.changedTouches[0]) return;
      var dx = e.changedTouches[0].clientX - touchX;
      var dy = e.changedTouches[0].clientY - (touchY || 0);
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
      touchX = null;
      touchY = null;
    }, { passive: true });
    document.addEventListener("keydown", key);
    render();
  }

  function enhanceSingleFigures(root) {
    Array.prototype.forEach.call(root.querySelectorAll("figure.article-figure"), function (fig) {
      if (fig.closest(".article-gallery")) return;
      var img = fig.querySelector("img");
      if (!img) return;
      analyze(fig, img, "odd");
      img.style.cursor = "zoom-in";
      if (img.dataset.lightboxV8 === "1") return;
      img.dataset.lightboxV8 = "1";
      img.addEventListener("click", function () {
        var cap = fig.querySelector("figcaption");
        openLightbox([{ src: img.currentSrc || img.getAttribute("src"), caption: cap ? cap.textContent : "" }], 0);
      });
    });
  }

  function enhancePageMedia(scope) {
    var root = scope || document;
    Array.prototype.forEach.call(root.querySelectorAll(".card-media-zone"), function (zone, i) {
      var collage = zone.querySelector(".card-collage");
      if (collage) {
        Array.prototype.forEach.call(collage.querySelectorAll("img"), function (img, j) {
          img.loading = i < 2 && j === 0 ? "eager" : "lazy";
          img.decoding = "async";
        });
        // Ambient only on primary collage cell host (the zone), using first image
        var first = collage.querySelector("img");
        if (first) analyze(zone, first, "always");
        return;
      }
      var img = zone.querySelector("img");
      if (!img) return;
      analyze(zone, img, "always");
      img.loading = i < 2 ? "eager" : "lazy";
      img.decoding = "async";
      if (i < 2) img.setAttribute("fetchpriority", "high");
    });
    Array.prototype.forEach.call(root.querySelectorAll(".article-hero"), function (hero) {
      var img = hero.querySelector("img");
      if (!img) return;
      img.loading = "eager";
      img.decoding = "async";
      img.setAttribute("fetchpriority", "high");
      analyze(hero, img, "always");
    });
    scheduleGalleryLayouts(root);
  }

  function observeDynamicMedia() {
    if (mediaObserver || !document.body) return;
    var queued = false;
    mediaObserver = new MutationObserver(function (mutations) {
      if (!mutations.some(function (m) { return m.addedNodes && m.addedNodes.length; }) || queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; enhancePageMedia(document); });
    });
    mediaObserver.observe(document.body, { childList: true, subtree: true });
    enhancePageMedia(document);
  }

  function resolveCoverDisplay(article) {
    var cd = (article && article.cover_display) || {};
    var p = (window.SBPresentation && window.SBPresentation.resolvePresentation(article)) || "article-lite";
    var defaults = {
      fragment: { style: "none", ratio: "auto", fit: "contain", position: "center center" },
      quote: { style: "none", ratio: "auto", fit: "contain", position: "center center" },
      "photo-note": { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
      journal: { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
      review: { style: "hero", ratio: "auto", fit: "contain", position: "center center" },
      longform: { style: "hero", ratio: "auto", fit: "contain", position: "center center" },
      "article-lite": { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
      fiction: { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
      poetry: { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
      reference: { style: "inline", ratio: "auto", fit: "contain", position: "center center" }
    };
    var d = defaults[p] || defaults["article-lite"];
    return {
      style: cd.style || d.style,
      ratio: cd.ratio || d.ratio,
      fit: cd.fit || d.fit,
      position: cd.position || d.position
    };
  }

  function countLoadedImages(root) {
    var imgs = (root || document).querySelectorAll(".article-gallery img, .markdown-body img, .card-collage img");
    var total = imgs.length, loaded = 0;
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.complete && img.naturalWidth) loaded++;
    });
    return { loaded: loaded, total: total };
  }

  window.SBArticleMedia = {
    enhanceMarkdownMedia: function (root) {
      if (!root) return;
      wrapFigures(root);
      mergeConsecutiveGalleries(root);
      enhanceSingleFigures(root);
      enhancePageMedia(root);
    },
    resolveCoverDisplay: resolveCoverDisplay,
    openLightbox: openLightbox,
    enhancePageMedia: enhancePageMedia,
    layoutGalleries: scheduleGalleryLayouts,
    countLoadedImages: countLoadedImages
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeDynamicMedia, { once: true });
  else observeDynamicMedia();
})();
