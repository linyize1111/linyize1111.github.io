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

  function startBackgroundVideo(video) {
    if (!video) return;
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
      if (video) idle(function () { startBackgroundVideo(video); }, 800);
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
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.style.display = "none";
      return;
    }
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var count = window.innerWidth < 736 ? 22 : 38;
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
        size: 7 + Math.random() * 12,
        speedY: 0.22 + Math.random() * 0.38,
        speedX: -0.08 + Math.random() * 0.22,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.022,
        sway: Math.random() * Math.PI * 2,
        alpha: 0.48 + Math.random() * 0.42,
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
    function hide() {
      Array.prototype.forEach.call(document.querySelectorAll(".nav-admin-only"), function (el) {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
        el.classList.remove("is-admin-visible");
      });
    }
    function reveal() {
      if (!window.SBAuth || typeof window.SBAuth.isAdmin !== "function") return;
      window.SBAuth.isAdmin().then(function (ok) {
        Array.prototype.forEach.call(document.querySelectorAll(".nav-admin-only"), function (el) {
          el.hidden = !ok;
          if (ok) {
            el.removeAttribute("aria-hidden");
            el.classList.add("is-admin-visible");
          } else {
            el.setAttribute("aria-hidden", "true");
            el.classList.remove("is-admin-visible");
          }
        });
      }).catch(function () {});
    }
    hide();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", reveal, { once: true });
    else reveal();
    setTimeout(reveal, 900);
  }

  function applyReadingFocus(requested) {
    /* CMS used to force true after every render. V5 treats focus as a user preference. */
    var stored = localStorage.getItem("readingFocus") === "true";
    var enable = requested === false ? false : (requested === true ? stored : stored);
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

  function initCommon() {
    initTheme();
    initLoadingScreen();
    initHeroSpacer();
    initMediaControls();
    initSakuraIfPresent();
    initAdminNav();
    initReadingFocusUi();
    initAnalytics();
  }

  initCommon();
})();
