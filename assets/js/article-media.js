/**
 * article-media.js — body galleries + lightbox
 * Consecutive images with no prose between → carousel gallery (not vertical stack).
 */
(function () {
  "use strict";

  function isImageOnlyBlock(node) {
    if (!node) return false;
    if (node.nodeType !== 1) return false;
    if (node.matches && node.matches("figure.article-figure, figure.article-gallery-slide")) {
      return !!node.querySelector("img");
    }
    if (node.tagName === "P") {
      var kids = Array.prototype.filter.call(node.childNodes, function (n) {
        return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
      });
      if (kids.length === 1 && kids[0].tagName === "IMG") return true;
      if (kids.length === 1 && kids[0].tagName === "FIGURE" && kids[0].querySelector("img")) return true;
    }
    if (node.tagName === "IMG") return true;
    return false;
  }

  function extractImg(node) {
    if (node.tagName === "IMG") return node;
    return node.querySelector && node.querySelector("img");
  }

  function wrapFigures(root) {
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

  function mergeConsecutiveGalleries(root) {
    var children = Array.prototype.slice.call(root.childNodes).filter(function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
    });
    var i = 0;
    while (i < children.length) {
      if (!isImageOnlyBlock(children[i])) {
        i++;
        continue;
      }
      var run = [children[i]];
      var j = i + 1;
      while (j < children.length && isImageOnlyBlock(children[j])) {
        run.push(children[j]);
        j++;
      }
      if (run.length >= 2) {
        var gallery = document.createElement("div");
        gallery.className = "article-gallery";
        gallery.setAttribute("data-gallery", "1");
        gallery.setAttribute("tabindex", "0");
        gallery.setAttribute("role", "region");
        gallery.setAttribute("aria-label", "圖片集");

        var track = document.createElement("div");
        track.className = "article-gallery__track";

        run.forEach(function (node, idx) {
          var img = extractImg(node);
          if (!img) return;
          var slide = document.createElement("figure");
          slide.className = "article-gallery__slide" + (idx === 0 ? " is-active" : "");
          var clone = img.cloneNode(true);
          clone.removeAttribute("style");
          clone.setAttribute("loading", "lazy");
          slide.appendChild(clone);
          var capEl = node.querySelector && node.querySelector("figcaption");
          var alt = (img.getAttribute("alt") || "").trim();
          if (capEl || alt) {
            var cap = document.createElement("figcaption");
            cap.className = "article-gallery__caption";
            cap.textContent = capEl ? capEl.textContent : alt;
            slide.appendChild(cap);
          }
          track.appendChild(slide);
          if (node.parentNode) node.parentNode.removeChild(node);
        });

        gallery.appendChild(track);

        var prev = document.createElement("button");
        prev.type = "button";
        prev.className = "article-gallery__nav article-gallery__prev";
        prev.setAttribute("aria-label", "上一張");
        prev.innerHTML = "&#10094;";
        var next = document.createElement("button");
        next.type = "button";
        next.className = "article-gallery__nav article-gallery__next";
        next.setAttribute("aria-label", "下一張");
        next.innerHTML = "&#10095;";
        gallery.appendChild(prev);
        gallery.appendChild(next);

        var dots = document.createElement("div");
        dots.className = "article-gallery__dots";
        var slides = track.querySelectorAll(".article-gallery__slide");
        Array.prototype.forEach.call(slides, function (_, idx) {
          var dot = document.createElement("button");
          dot.type = "button";
          dot.className = "article-gallery__dot" + (idx === 0 ? " is-active" : "");
          dot.setAttribute("aria-label", "第 " + (idx + 1) + " 張");
          dots.appendChild(dot);
        });
        gallery.appendChild(dots);

        var insertBefore = children[j] || null;
        if (insertBefore && insertBefore.parentNode === root) {
          root.insertBefore(gallery, insertBefore);
        } else {
          root.appendChild(gallery);
        }
        bindGallery(gallery);
      }
      i = j;
      children = Array.prototype.slice.call(root.childNodes).filter(function (n) {
        return n.nodeType === 1 || (n.nodeType === 3 && String(n.textContent || "").trim());
      });
    }
  }

  function bindGallery(gallery) {
    var slides = gallery.querySelectorAll(".article-gallery__slide");
    var dots = gallery.querySelectorAll(".article-gallery__dot");
    var index = 0;
    function show(n) {
      index = (n + slides.length) % slides.length;
      Array.prototype.forEach.call(slides, function (s, i) {
        s.classList.toggle("is-active", i === index);
      });
      Array.prototype.forEach.call(dots, function (d, i) {
        d.classList.toggle("is-active", i === index);
      });
    }
    var prev = gallery.querySelector(".article-gallery__prev");
    var next = gallery.querySelector(".article-gallery__next");
    if (prev) prev.addEventListener("click", function () { show(index - 1); });
    if (next) next.addEventListener("click", function () { show(index + 1); });
    Array.prototype.forEach.call(dots, function (d, i) {
      d.addEventListener("click", function () { show(i); });
    });
    gallery.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
    Array.prototype.forEach.call(slides, function (slide, i) {
      var img = slide.querySelector("img");
      if (!img) return;
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () {
        openLightbox(collectGallerySrcs(gallery), i);
      });
    });
  }

  function collectGallerySrcs(gallery) {
    return Array.prototype.map.call(gallery.querySelectorAll(".article-gallery__slide img"), function (img) {
      return { src: img.getAttribute("src"), caption: (img.closest("figure") && img.closest("figure").querySelector("figcaption") || {}).textContent || img.getAttribute("alt") || "" };
    });
  }

  function openLightbox(items, startIndex) {
    if (!items || !items.length) return;
    var existing = document.querySelector(".article-lightbox");
    if (existing) existing.remove();
    var idx = startIndex || 0;
    var overlay = document.createElement("div");
    overlay.className = "article-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<button type="button" class="article-lightbox__close" aria-label="關閉">×</button>' +
      '<button type="button" class="article-lightbox__nav article-lightbox__prev" aria-label="上一張">&#10094;</button>' +
      '<figure class="article-lightbox__figure"><img alt="" /><figcaption></figcaption></figure>' +
      '<button type="button" class="article-lightbox__nav article-lightbox__next" aria-label="下一張">&#10095;</button>';
    document.body.appendChild(overlay);
    document.body.classList.add("lightbox-open");

    var img = overlay.querySelector("img");
    var cap = overlay.querySelector("figcaption");
    function render() {
      img.src = items[idx].src;
      cap.textContent = items[idx].caption || "";
    }
    function close() {
      overlay.remove();
      document.body.classList.remove("lightbox-open");
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") { idx = (idx - 1 + items.length) % items.length; render(); }
      if (e.key === "ArrowRight") { idx = (idx + 1) % items.length; render(); }
    }
    overlay.querySelector(".article-lightbox__close").addEventListener("click", close);
    overlay.querySelector(".article-lightbox__prev").addEventListener("click", function () {
      idx = (idx - 1 + items.length) % items.length;
      render();
    });
    overlay.querySelector(".article-lightbox__next").addEventListener("click", function () {
      idx = (idx + 1) % items.length;
      render();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);
    render();
  }

  function enhanceSingleFigures(root) {
    Array.prototype.forEach.call(root.querySelectorAll("figure.article-figure"), function (fig) {
      if (fig.closest(".article-gallery")) return;
      var img = fig.querySelector("img");
      if (!img) return;
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () {
        openLightbox([{ src: img.getAttribute("src"), caption: (fig.querySelector("figcaption") || {}).textContent || "" }], 0);
      });
    });
  }

  function resolveCoverDisplay(article) {
    var cd = (article && article.cover_display) || {};
    var presentation = (window.SBPresentation && window.SBPresentation.resolvePresentation(article)) || "article-lite";
    var defaults = {
      fragment: { style: "none", ratio: "auto", fit: "contain", position: "center center" },
      quote: { style: "none", ratio: "auto", fit: "contain", position: "center center" },
      "photo-note": { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
      review: { style: "hero", ratio: "16/9", fit: "cover", position: "center center" },
      longform: { style: "hero", ratio: "16/9", fit: "cover", position: "center 30%" },
      "article-lite": { style: "inline", ratio: "16/9", fit: "cover", position: "center center" },
    };
    var d = defaults[presentation] || defaults["article-lite"];
    return {
      style: cd.style || d.style,
      ratio: cd.ratio || d.ratio,
      fit: cd.fit || d.fit,
      position: cd.position || d.position,
    };
  }

  window.SBArticleMedia = {
    enhanceMarkdownMedia: function (root) {
      if (!root) return;
      wrapFigures(root);
      mergeConsecutiveGalleries(root);
      enhanceSingleFigures(root);
    },
    resolveCoverDisplay: resolveCoverDisplay,
    openLightbox: openLightbox,
  };
})();
