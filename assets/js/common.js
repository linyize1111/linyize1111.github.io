/**
 * common.js — V5 runtime
 * Fast first paint, resilient background, three themes, lightweight effects.
 */
(function () {
  "use strict";

  var THEMES = ["light", "dark", "glass"];
  var THEME_META = {
    light: { icon: '<i class="fas fa-sun"></i>', label: "亮色模式", next: "dark" },
    dark: { icon: '<i class="fas fa-moon"></i>', label: "暗色模式", next: "glass" },
    glass: { icon: '<i class="fas fa-eye"></i>', label: "玻璃模式", next: "light" }
  };

  function afterPaint(fn) {
    requestAnimationFrame(function () { requestAnimationFrame(fn); });
  }

  function idle(fn, timeout) {
    if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: timeout || 1200 });
    else setTimeout(fn, Math.min(timeout || 600, 600));
  }

  /* Loading overlay must never wait for every CDN/media request. */
  function dismissLoader() {
    var loader = document.getElementById("loading-screen");
    if (!loader || loader.dataset.dismissed === "1") return;
    loader.dataset.dismissed = "1";
    loader.classList.add("fade-out");
    setTimeout(function () { loader.style.display = "none"; }, 260);
  }

  function initLoadingScreen() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { afterPaint(dismissLoader); }, { once: true });
    } else {
      afterPaint(dismissLoader);
    }
    /* absolute safety cap */
    setTimeout(dismissLoader, 900);
  }

  function applyTheme(theme) {
    var t = THEMES.indexOf(theme) !== -1 ? theme : "light";
    if (t === "light") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", t === "light" ? "#e8eef6" : t === "dark" ? "#0d1118" : "#0a1420");
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function initTheme() {
    var saved = localStorage.getItem("colorTheme");
    applyTheme(saved || "light");

    function mount() {
      var controls = document.getElementById("video-controls");
      if (document.getElementById("btn-theme")) return;
      var btn = document.createElement("button");
      btn.id = "btn-theme";
      btn.type = "button";
      btn.style.cssText = "position:relative;";

      function refresh() {
        var meta = THEME_META[currentTheme()] || THEME_META.light;
        btn.innerHTML = meta.icon;
        btn.title = meta.label + " → " + THEME_META[meta.next].label;
        btn.setAttribute("aria-label", meta.label);
      }
      refresh();
      btn.addEventListener("click", function () {
        var meta = THEME_META[currentTheme()] || THEME_META.light;
        applyTheme(meta.next);
        localStorage.setItem("colorTheme", meta.next);
        refresh();
      });

      if (!controls) {
        controls = document.createElement("div");
        controls.id = "video-controls";
        document.body.appendChild(controls);
      }
      controls.insertBefore(btn, controls.firstChild);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function saveDataPreferred() {
    try {
      if (navigator.connection && navigator.connection.saveData) return true;
    } catch (e) {}
    return false;
  }

  function startBackgroundVideo(video) {
    if (!video) return;
    if (prefersReducedMotion() || saveDataPreferred()) {
      try { video.pause(); } catch (e) {}
      video.removeAttribute("autoplay");
      return;
    }
    video.muted = true;
    video.play().catch(function () {});
  }

  function initMediaControls() {
    function mount() {
      var video = document.getElementById("bg-video");
      var music = document.getElementById("bg-music");
      var btnMute = document.getElementById("btn-mute");
      var btnPlay = document.getElementById("btn-play");

      /* Background video is decorative: start after first paint, never block it. */
      if (video && !prefersReducedMotion() && !saveDataPreferred()) {
        idle(function () { startBackgroundVideo(video); }, 1200);
      }
      if (!music || !btnMute || !btnPlay) return;

      var isMuted = sessionStorage.getItem("mediaMuted") === "true";
      music.muted = isMuted;
      music.pause();

      function updateMuteBtn() {
        btnMute.innerHTML = music.muted
          ? '<i class="fas fa-volume-mute"></i>'
          : '<i class="fas fa-volume-up"></i>';
      }
      function updatePlayBtn() {
        btnPlay.innerHTML = music.paused
          ? '<i class="fas fa-play"></i>'
          : '<i class="fas fa-pause"></i>';
      }
      updateMuteBtn();
      updatePlayBtn();

      var savedTime = Number(sessionStorage.getItem("musicCurrentTime") || 0);
      if (savedTime > 0) {
        var setTime = function () { try { music.currentTime = savedTime; } catch (e) {} };
        if (music.readyState >= 1) setTime();
        else music.addEventListener("loadedmetadata", setTime, { once: true });
      }

      btnMute.addEventListener("click", function (e) {
        e.stopPropagation();
        music.muted = !music.muted;
        sessionStorage.setItem("mediaMuted", String(music.muted));
        updateMuteBtn();
      });

      btnPlay.addEventListener("click", function () {
        if (music.paused) {
          if (video) startBackgroundVideo(video);
          music.play().catch(function () {});
        } else {
          music.pause();
        }
        updatePlayBtn();
      });

      window.addEventListener("pagehide", function () {
        sessionStorage.setItem("mediaMuted", String(music.muted));
        sessionStorage.setItem("musicCurrentTime", String(music.currentTime || 0));
      });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  function initSakuraIfPresent() {
    var canvas = document.getElementById("sakura-canvas");
    if (!canvas) return;
    canvas.style.pointerEvents = "none";
    if (prefersReducedMotion() || saveDataPreferred()) {
      canvas.style.display = "none";
      return;
    }
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w0 = window.innerWidth;
    var count = w0 <= 600 ? 16 : w0 < 900 ? 24 : 38;
    var COLORS = [[255,183,197],[255,160,180],[255,200,210],[250,140,165],[255,218,225]];
    var petals = [];
    var running = true;
    var frame = 0;

    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makePetal(top) {
      var c = COLORS[Math.floor(Math.random() * COLORS.length)];
      return {
        x: Math.random() * window.innerWidth,
        y: top ? -30 - Math.random() * 100 : Math.random() * window.innerHeight,
        size: (window.innerWidth <= 600 ? 5 : 7) + Math.random() * (window.innerWidth <= 600 ? 8 : 12),
        speedY: 0.22 + Math.random() * 0.38,
        speedX: -0.08 + Math.random() * 0.22,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.022,
        sway: Math.random() * Math.PI * 2,
        alpha: (window.innerWidth <= 600 ? 0.32 : 0.48) + Math.random() * (window.innerWidth <= 600 ? 0.28 : 0.42),
        c: c
      };
    }

    function draw(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      var w = p.size * 0.55, h = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.bezierCurveTo(w, -h * 0.1, w, h * 0.4, 0, h / 2);
      ctx.bezierCurveTo(-w, h * 0.4, -w, -h * 0.1, 0, -h / 2);
      ctx.fillStyle = "rgba(" + p.c.join(",") + "," + p.alpha.toFixed(2) + ")";
      ctx.fill();
      ctx.restore();
    }

    function animate() {
      if (!running) return;
      frame = requestAnimationFrame(animate);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      petals.forEach(function (p, i) {
        p.sway += 0.009;
        p.x += p.speedX + Math.sin(p.sway) * 0.28;
        p.y += p.speedY;
        p.angle += p.spin;
        if (p.y > window.innerHeight + 35 || p.x < -50 || p.x > window.innerWidth + 50) petals[i] = makePetal(true);
        draw(petals[i]);
      });
    }

    resize();
    for (var i = 0; i < count; i++) petals.push(makePetal(false));
    animate();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) animate();
      else cancelAnimationFrame(frame);
    });
  }

  function initHeroSpacer() {
    function mount() {
      if (document.getElementById("intro") || document.getElementById("page-hero-spacer")) return;
      var main = document.getElementById("main");
      if (!main || !main.parentNode) return;
      var spacer = document.createElement("div");
      spacer.id = "page-hero-spacer";
      main.parentNode.insertBefore(spacer, main);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  function injectFooterStatsHost() {
    if (document.getElementById("site-stats")) return;
    var cr = document.getElementById("copyright");
    var ul = cr && cr.querySelector("ul");
    if (!ul) return;
    var li = document.createElement("li");
    li.className = "site-stats-li";
    li.innerHTML = '<span id="site-stats" class="site-stats-wrap" aria-label="網站瀏覽統計"></span>';
    ul.appendChild(li);
  }

  function initAnalytics() {
    if (!window.SB || !window.SB.isConfigured || !window.SB.isConfigured()) return;
    idle(function () {
      injectFooterStatsHost();
      if (document.querySelector("script[data-site-analytics]")) return;
      var s = document.createElement("script");
      s.src = "assets/js/analytics.js";
      s.defer = true;
      s.setAttribute("data-site-analytics", "1");
      document.body.appendChild(s);
    }, 1600);
  }

  function initAdminNav() {
    var PUBLIC_LINKS = [
      { href: "index.html", label: "首頁" },
      { href: "directory.html", label: "隨筆" },
      { href: "literature.html", label: "文學創作" },
      { href: "about.html", label: "關於我" },
    ];
    var ADMIN_LINK = { href: "academic.html", label: "學科筆記" };
    var menuOpen = false;

    function ensureGlobalNavShell() {
      var nav = document.getElementById("global-nav");
      if (!nav) {
        nav = document.createElement("nav");
        nav.id = "global-nav";
        document.body.appendChild(nav);
      }
      nav.removeAttribute("style");
      nav.setAttribute("aria-label", "主要導覽");
      return nav;
    }

    function currentPath() {
      return (location.pathname || "").split("/").pop() || "index.html";
    }

    function buildLink(item, extraAttrs) {
      var a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      if (currentPath() === item.href) a.setAttribute("aria-current", "page");
      if (extraAttrs) {
        Object.keys(extraAttrs).forEach(function (k) {
          a.setAttribute(k, extraAttrs[k]);
        });
      }
      return a;
    }

    function closeMenu() {
      menuOpen = false;
      var nav = document.getElementById("global-nav");
      var btn = document.getElementById("mobile-nav-toggle");
      var sheet = document.getElementById("mobile-nav-sheet");
      var backdrop = document.getElementById("mobile-nav-backdrop");
      if (nav) nav.classList.remove("is-open");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (sheet) sheet.hidden = true;
      if (backdrop) backdrop.hidden = true;
      document.body.classList.remove("mobile-nav-open");
    }

    function openMenu() {
      menuOpen = true;
      var nav = document.getElementById("global-nav");
      var btn = document.getElementById("mobile-nav-toggle");
      var sheet = document.getElementById("mobile-nav-sheet");
      var backdrop = document.getElementById("mobile-nav-backdrop");
      if (nav) nav.classList.add("is-open");
      if (btn) btn.setAttribute("aria-expanded", "true");
      if (sheet) sheet.hidden = false;
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add("mobile-nav-open");
    }

    function toggleMenu() {
      if (menuOpen) closeMenu();
      else openMenu();
    }

    function syncThemeColor() {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
      }
      var t = currentTheme();
      meta.setAttribute("content", t === "light" ? "#e8eef6" : t === "dark" ? "#0d1118" : "#0a1420");
    }

    function fillSheetExtras(sheet) {
      var extras = document.createElement("div");
      extras.className = "mobile-nav-sheet__extras";
      extras.innerHTML =
        '<div class="mobile-nav-sheet__divider" role="separator"></div>' +
        '<div class="mobile-nav-sheet__row" role="group" aria-label="主題">' +
        '<button type="button" class="mobile-nav-chip" data-theme-set="light">Light</button>' +
        '<button type="button" class="mobile-nav-chip" data-theme-set="dark">Dark</button>' +
        '<button type="button" class="mobile-nav-chip" data-theme-set="glass">Glass</button>' +
        "</div>" +
        '<div class="mobile-nav-sheet__social">' +
        '<a href="https://github.com/linyize1111" target="_blank" rel="noopener">GitHub</a>' +
        '<a href="https://www.instagram.com/linyize._.mcxi/" target="_blank" rel="noopener">Instagram</a>' +
        '<a href="mailto:jay0975008815@gmail.com">Mail</a>' +
        "</div>";
      sheet.appendChild(extras);
      extras.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-theme-set]");
        if (!chip) return;
        var next = chip.getAttribute("data-theme-set");
        applyTheme(next);
        localStorage.setItem("colorTheme", next);
        syncThemeColor();
        var themeBtn = document.getElementById("btn-theme");
        if (themeBtn) themeBtn.dispatchEvent(new Event("lyz-theme-refresh"));
        closeMenu();
      });
    }

    function renderPublicNav() {
      var nav = ensureGlobalNavShell();
      nav.innerHTML = "";
      nav.classList.add("global-nav--v7");

      var brand = document.createElement("a");
      brand.className = "mobile-nav-brand";
      brand.href = "index.html";
      brand.textContent = "LYZ";
      brand.setAttribute("aria-label", "LYZ 首頁");

      var desktopLinks = document.createElement("div");
      desktopLinks.className = "global-nav__desktop";
      PUBLIC_LINKS.forEach(function (item) {
        desktopLinks.appendChild(buildLink(item));
      });

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = "mobile-nav-toggle";
      toggle.className = "mobile-nav-toggle";
      toggle.setAttribute("aria-label", "開啟選單");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "mobile-nav-sheet");
      toggle.innerHTML = '<span class="mobile-nav-toggle__bars" aria-hidden="true"></span>';

      var sheet = document.createElement("div");
      sheet.id = "mobile-nav-sheet";
      sheet.className = "mobile-nav-sheet";
      sheet.hidden = true;
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-label", "網站選單");
      var sheetLinks = document.createElement("div");
      sheetLinks.className = "mobile-nav-sheet__links";
      PUBLIC_LINKS.forEach(function (item) {
        sheetLinks.appendChild(buildLink(item));
      });
      sheet.appendChild(sheetLinks);
      fillSheetExtras(sheet);

      var backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.id = "mobile-nav-backdrop";
      backdrop.className = "mobile-nav-backdrop";
      backdrop.hidden = true;
      backdrop.setAttribute("aria-label", "關閉選單");

      nav.appendChild(brand);
      nav.appendChild(desktopLinks);
      nav.appendChild(toggle);
      nav.appendChild(sheet);

      if (!document.getElementById("mobile-nav-backdrop")) {
        document.body.appendChild(backdrop);
      } else {
        backdrop = document.getElementById("mobile-nav-backdrop");
      }

      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleMenu();
      });
      backdrop.addEventListener("click", closeMenu);
      sheet.addEventListener("click", function (e) {
        if (e.target.closest("a")) closeMenu();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && menuOpen) closeMenu();
      });
      window.addEventListener(
        "resize",
        function () {
          if (window.matchMedia("(min-width: 901px)").matches) closeMenu();
        },
        { passive: true }
      );

      syncThemeColor();
      return nav;
    }

    function injectAdminLink(nav) {
      if (!nav) return;
      var desktop = nav.querySelector(".global-nav__desktop");
      var sheetLinks = nav.querySelector(".mobile-nav-sheet__links");
      function place(container) {
        if (!container || container.querySelector('[data-admin-nav="academic"]')) return;
        var a = buildLink(ADMIN_LINK, { "data-admin-nav": "academic" });
        var about = container.querySelector('a[href="about.html"]');
        if (about) container.insertBefore(a, about);
        else container.appendChild(a);
      }
      place(desktop);
      place(sheetLinks);
    }

    function stripStaticAdminHints() {
      Array.prototype.forEach.call(
        document.querySelectorAll('a[href="academic.html"], li.nav-admin-only'),
        function (el) {
          if (el.getAttribute("data-admin-nav") === "academic") return;
          if (el.closest("#global-nav")) return;
          el.remove();
        }
      );
    }

    stripStaticAdminHints();
    var nav = renderPublicNav();

    function revealIfAdmin() {
      if (!window.SBAuth || typeof window.SBAuth.isAdmin !== "function") return;
      window.SBAuth
        .isAdmin()
        .then(function (ok) {
          if (ok) injectAdminLink(nav);
        })
        .catch(function () {});
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", revealIfAdmin, { once: true });
    } else {
      revealIfAdmin();
    }
    setTimeout(revealIfAdmin, 900);

    // Keep theme button icon in sync when sheet changes theme
    document.addEventListener("lyz-theme-refresh", function () {});
    var themeBtnPoll = setInterval(function () {
      var themeBtn = document.getElementById("btn-theme");
      if (!themeBtn) return;
      clearInterval(themeBtnPoll);
      themeBtn.addEventListener("lyz-theme-refresh", function () {
        var meta = THEME_META[currentTheme()] || THEME_META.light;
        themeBtn.innerHTML = meta.icon;
        themeBtn.title = meta.label + " → " + THEME_META[meta.next].label;
        themeBtn.setAttribute("aria-label", meta.label);
        syncThemeColor();
      });
    }, 200);
  }

  function initMobileControlsFab() {
    function mount() {
      if (document.getElementById("mobile-controls-fab")) return;
      var controls = document.getElementById("video-controls");
      if (!controls) return;
      controls.classList.add("site-controls");

      var fab = document.createElement("button");
      fab.type = "button";
      fab.id = "mobile-controls-fab";
      fab.className = "mobile-controls-fab";
      fab.setAttribute("aria-label", "開啟控制選單");
      fab.setAttribute("aria-expanded", "false");
      fab.setAttribute("aria-controls", "mobile-controls-popover");
      fab.innerHTML = '<span aria-hidden="true">◉</span>';

      var pop = document.createElement("div");
      pop.id = "mobile-controls-popover";
      pop.className = "mobile-controls-popover";
      pop.hidden = true;
      pop.innerHTML =
        '<button type="button" data-ctrl="theme">切換主題</button>' +
        '<button type="button" data-ctrl="focus" class="mobile-ctrl-focus">專注閱讀</button>' +
        '<button type="button" data-ctrl="mute">音效</button>' +
        '<button type="button" data-ctrl="play">背景</button>' +
        '<button type="button" data-ctrl="top" class="mobile-ctrl-top" hidden>回頂端</button>';

      document.body.appendChild(fab);
      document.body.appendChild(pop);

      function setOpen(open) {
        fab.setAttribute("aria-expanded", open ? "true" : "false");
        pop.hidden = !open;
        document.body.classList.toggle("mobile-controls-open", open);
      }

      fab.addEventListener("click", function (e) {
        e.stopPropagation();
        setOpen(pop.hidden);
      });
      document.addEventListener("click", function (e) {
        if (!pop.hidden && !e.target.closest("#mobile-controls-popover") && e.target !== fab) {
          setOpen(false);
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setOpen(false);
      });

      pop.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-ctrl]");
        if (!btn) return;
        var action = btn.getAttribute("data-ctrl");
        if (action === "theme") {
          var t = document.getElementById("btn-theme");
          if (t) t.click();
        } else if (action === "focus") {
          var f = document.getElementById("reading-focus-toggle");
          if (f) f.click();
          else {
            var next = !document.body.classList.contains("reading-focus");
            localStorage.setItem("readingFocus", String(next));
            applyReadingFocus(next);
          }
          btn.textContent = document.body.classList.contains("reading-focus") ? "顯示背景" : "專注閱讀";
        } else if (action === "mute") {
          var m = document.getElementById("btn-mute");
          if (m) m.click();
        } else if (action === "play") {
          var p = document.getElementById("btn-play");
          if (p) p.click();
        } else if (action === "top") {
          window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        }
        setOpen(false);
      });

      var topBtn = pop.querySelector(".mobile-ctrl-top");
      function syncTop() {
        if (!topBtn) return;
        topBtn.hidden = window.scrollY <= 700;
      }
      syncTop();
      window.addEventListener("scroll", syncTop, { passive: true });

      // Focus button only meaningful on article pages
      var focusBtn = pop.querySelector(".mobile-ctrl-focus");
      if (focusBtn && !document.getElementById("markdown-container")) focusBtn.hidden = true;
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  function applyReadingFocus(requested) {
    /* Never force focus on render — only localStorage preference. */
    var stored = localStorage.getItem("readingFocus") === "true";
    var enable =
      requested === true ? true : requested === false ? false : stored;
    if (requested === true || requested === false) {
      /* explicit toggle path already wrote localStorage */
    }
    document.body.classList.toggle("reading-focus", enable);
    document.body.classList.add("reading-page");

    var video = document.getElementById("bg-video");
    var canvas = document.getElementById("sakura-canvas");
    if (video) {
      video.style.visibility = enable ? "hidden" : "";
      if (enable) video.pause();
      else idle(function () { startBackgroundVideo(video); }, 500);
    }
    if (canvas) canvas.style.visibility = enable ? "hidden" : "";

    var btn = document.getElementById("reading-focus-toggle");
    if (btn) btn.textContent = enable ? "顯示背景" : "專注閱讀";
    return enable;
  }
  window.applyReadingFocus = applyReadingFocus;

  function initReadingFocusUi() {
    if (!document.getElementById("markdown-container")) return;
    document.body.classList.add("reading-page");
    var btn = document.getElementById("reading-focus-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "reading-focus-toggle";
      btn.className = "reading-focus-toggle";
      document.body.appendChild(btn);
    }
    btn.addEventListener("click", function () {
      var next = !document.body.classList.contains("reading-focus");
      localStorage.setItem("readingFocus", String(next));
      applyReadingFocus(next);
    });
    applyReadingFocus();
  }

  function initScrollTopButton() {
    var btn = document.getElementById("btn-top");
    if (!btn) return;
    var threshold = 700;
    function sync() {
      var show = window.scrollY > threshold;
      btn.hidden = !show;
      btn.classList.toggle("is-hidden", !show);
    }
    sync();
    window.addEventListener("scroll", sync, { passive: true });
  }

  function initCommon() {
    initTheme();
    initLoadingScreen();
    initHeroSpacer();
    initMediaControls();
    initSakuraIfPresent();
    initAdminNav();
    initReadingFocusUi();
    initScrollTopButton();
    initMobileControlsFab();
    initAnalytics();
  }

  initCommon();
})();
