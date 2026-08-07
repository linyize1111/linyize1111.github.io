/**
 * article-media.js — V5
 * Complete-image-first media layout, ambient backdrops, galleries and lightbox.
 */
(function () {
  "use strict";

  var mediaObserver;

  function imageOnlyBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches("figure.article-figure, figure.article-gallery-slide")) return !!node.querySelector("img");
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
      if (host.dataset.mediaV5 === signature) return;
      var r = w / h;
      ["media-ratio-tall","media-ratio-portrait","media-ratio-square","media-ratio-landscape","media-ratio-panorama"].forEach(function (c) {
        host.classList.remove(c);
      });
      host.classList.add(ratioClass(r));
      var ambient = ambientMode === "always" || (ambientMode === "odd" && (r < 0.82 || r > 1.75));
      host.classList.toggle("media-ambient", ambient);
      if (ambient) addBackdrop(host, img.currentSrc || img.src);
      host.dataset.mediaV5 = signature;
    }

    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener("load", apply, { once: true });
  }

  function wrapFigures(root) {
    Array.prototype.forEach.call(root.querySelectorAll("img"), function (img) {
      if (img.closest("figure")) return;
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

      var gallery = document.createElement("div");
      gallery.className = "article-gallery";
      gallery.tabIndex = 0;
      gallery.setAttribute("role", "region");
      gallery.setAttribute("aria-label", "圖片集");
      var track = document.createElement("div");
      track.className = "article-gallery__track";

      run.forEach(function (node, idx) {
        var original = extractImg(node);
        if (!original) return;
        var slide = document.createElement("figure");
        slide.className = "article-gallery__slide" + (idx === 0 ? " is-active" : "");
        var clone = original.cloneNode(true);
        clone.removeAttribute("style");
        clone.loading = "lazy";
        clone.decoding = "async";
        slide.appendChild(clone);
        var oldCap = node.querySelector && node.querySelector("figcaption");
        var alt = (original.getAttribute("alt") || "").trim();
        if (oldCap || alt) {
          var cap = document.createElement("figcaption");
          cap.className = "article-gallery__caption";
          cap.textContent = oldCap ? oldCap.textContent : alt;
          slide.appendChild(cap);
        }
        track.appendChild(slide);
        if (node.parentNode) node.parentNode.removeChild(node);
        analyze(slide, clone, "always");
      });
      gallery.appendChild(track);

      [
        ["article-gallery__nav article-gallery__prev", "上一張", "&#10094;"],
        ["article-gallery__nav article-gallery__next", "下一張", "&#10095;"]
      ].forEach(function (spec) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = spec[0];
        b.setAttribute("aria-label", spec[1]);
        b.innerHTML = spec[2];
        gallery.appendChild(b);
      });

      var dots = document.createElement("div");
      dots.className = "article-gallery__dots";
      Array.prototype.forEach.call(track.querySelectorAll(".article-gallery__slide"), function (_, idx) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "article-gallery__dot" + (idx === 0 ? " is-active" : "");
        dot.setAttribute("aria-label", "第 " + (idx + 1) + " 張");
        dots.appendChild(dot);
      });
      gallery.appendChild(dots);

      var insertBefore = children[j] || null;
      if (insertBefore && insertBefore.parentNode === root) root.insertBefore(gallery, insertBefore);
      else root.appendChild(gallery);
      bindGallery(gallery);
      children = Array.prototype.slice.call(root.childNodes).filter(function (n) {
        return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
      });
      i = j;
    }
  }

  function bindGallery(gallery) {
    if (!gallery || gallery.dataset.boundV5 === "1") return;
    gallery.dataset.boundV5 = "1";
    var slides = gallery.querySelectorAll(".article-gallery__slide");
    var dots = gallery.querySelectorAll(".article-gallery__dot");
    var index = 0, touchX = null;

    function show(n) {
      index = (n + slides.length) % slides.length;
      Array.prototype.forEach.call(slides, function (s, i) { s.classList.toggle("is-active", i === index); });
      Array.prototype.forEach.call(dots, function (d, i) { d.classList.toggle("is-active", i === index); });
      var activeImg = slides[index] && slides[index].querySelector("img");
      if (activeImg) analyze(gallery, activeImg, "always");
    }

    var prev = gallery.querySelector(".article-gallery__prev");
    var next = gallery.querySelector(".article-gallery__next");
    if (prev) prev.addEventListener("click", function () { show(index - 1); });
    if (next) next.addEventListener("click", function () { show(index + 1); });
    Array.prototype.forEach.call(dots, function (d, i) { d.addEventListener("click", function () { show(i); }); });
    gallery.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
    gallery.addEventListener("touchstart", function (e) { touchX = e.touches[0] && e.touches[0].clientX; }, { passive: true });
    gallery.addEventListener("touchend", function (e) {
      if (touchX == null || !e.changedTouches[0]) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 44) show(index + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });

    Array.prototype.forEach.call(slides, function (slide, i) {
      var img = slide.querySelector("img");
      if (!img) return;
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () { openLightbox(collectGallerySrcs(gallery), i); });
    });
    show(0);
  }

  function collectGallerySrcs(gallery) {
    return Array.prototype.map.call(gallery.querySelectorAll(".article-gallery__slide img"), function (img) {
      var fig = img.closest("figure"), cap = fig && fig.querySelector("figcaption");
      return { src: img.currentSrc || img.getAttribute("src"), caption: cap ? cap.textContent : (img.getAttribute("alt") || "") };
    });
  }

  function openLightbox(items, startIndex) {
    if (!items || !items.length) return;
    var old = document.querySelector(".article-lightbox");
    if (old) old.remove();
    var idx = startIndex || 0;
    var overlay = document.createElement("div");
    overlay.className = "article-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<button type="button" class="article-lightbox__close" aria-label="關閉">×</button>' +
      '<button type="button" class="article-lightbox__nav article-lightbox__prev" aria-label="上一張">&#10094;</button>' +
      '<figure class="article-lightbox__figure"><img alt="" decoding="async"/><figcaption></figcaption></figure>' +
      '<button type="button" class="article-lightbox__nav article-lightbox__next" aria-label="下一張">&#10095;</button>';
    document.body.appendChild(overlay);
    document.body.classList.add("lightbox-open");
    var img = overlay.querySelector("img"), cap = overlay.querySelector("figcaption");

    function render() { img.src = items[idx].src; cap.textContent = items[idx].caption || ""; }
    function move(delta) { idx = (idx + delta + items.length) % items.length; render(); }
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
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
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
      if (img.dataset.lightboxV5 === "1") return;
      img.dataset.lightboxV5 = "1";
      img.addEventListener("click", function () {
        var cap = fig.querySelector("figcaption");
        openLightbox([{ src: img.currentSrc || img.getAttribute("src"), caption: cap ? cap.textContent : "" }], 0);
      });
    });
  }

  function enhancePageMedia(scope) {
    var root = scope || document;
    Array.prototype.forEach.call(root.querySelectorAll(".card-media-zone"), function (zone, i) {
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
    Array.prototype.forEach.call(root.querySelectorAll(".article-gallery__slide"), function (slide) {
      var img = slide.querySelector("img");
      if (img) analyze(slide, img, "always");
    });
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
    enhancePageMedia: enhancePageMedia
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeDynamicMedia, { once: true });
  else observeDynamicMedia();
})();
