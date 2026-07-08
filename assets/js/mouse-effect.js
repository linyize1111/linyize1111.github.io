/**
 * Cat Paw Cursor v2 — SVG 主游標 + 點擊 ripple/印章 + 節制拖尾
 * 零外部依賴；transform/opacity only；可關閉 / 觸控 / reduced-motion / 背景分頁暫停
 */
(function () {
  "use strict";

  var STORAGE_KEY = "catPawEnabled";
  var MAX_STAMPS = 16;
  var MAX_TRAILS = 4;
  var MAX_RIPPLES = 6;
  var TRAIL_INTERVAL = 90;
  var COARSE = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PAW_SVG =
    '<svg class="paw-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<ellipse class="paw-pad paw-pad-main" cx="24" cy="33" rx="13" ry="11"/>' +
    '<ellipse class="paw-pad" cx="13" cy="17" rx="4.8" ry="5.8"/>' +
    '<ellipse class="paw-pad" cx="24" cy="12.5" rx="4.8" ry="5.8"/>' +
    '<ellipse class="paw-pad" cx="35" cy="17" rx="4.8" ry="5.8"/>' +
    '<ellipse class="paw-pad paw-pad-side" cx="7.5" cy="24" rx="3.2" ry="4.2"/>' +
    '<ellipse class="paw-pad paw-pad-side" cx="40.5" cy="24" rx="3.2" ry="4.2"/>' +
    "</svg>";

  function readEnabled() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "0" || saved === "false") return false;
      if (saved === "1" || saved === "true") return true;
    } catch (e) { /* ignore */ }
    return !REDUCED && !COARSE;
  }

  function writeEnabled(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
  }

  function CatPawCursor(options) {
    options = options || {};
    this.enabled = options.enabled !== false;
    this.mounted = false;
    this.running = false;
    this.visible = !document.hidden;
    this.isPressed = false;
    this.pos = { x: -120, y: -120 };
    this.target = { x: -120, y: -120 };
    this.angle = -18;
    this.lastTrailAt = 0;
    this.stamps = [];
    this.trails = [];
    this.ripples = [];
    this._onMove = this._onMove.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onVis = this._onVis.bind(this);
    if (this.enabled) this.mount();
  }

  CatPawCursor.prototype.mount = function () {
    if (this.mounted || COARSE || REDUCED) return;
    this.mounted = true;
    document.documentElement.classList.add("paw-cursor-active");

    this.fxLayer = document.createElement("div");
    this.fxLayer.className = "paw-cursor-fx";
    this.fxLayer.setAttribute("aria-hidden", "true");

    this.cursor = document.createElement("div");
    this.cursor.className = "paw-cursor-main";
    this.cursor.setAttribute("aria-hidden", "true");
    this.cursor.innerHTML = PAW_SVG;

    document.body.appendChild(this.fxLayer);
    document.body.appendChild(this.cursor);

    window.addEventListener("mousemove", this._onMove, { passive: true });
    window.addEventListener("mousedown", this._onDown);
    window.addEventListener("mouseup", this._onUp);
    document.addEventListener("visibilitychange", this._onVis);
    this.start();
  };

  CatPawCursor.prototype.unmount = function () {
    this.stop();
    document.documentElement.classList.remove("paw-cursor-active");
    window.removeEventListener("mousemove", this._onMove);
    window.removeEventListener("mousedown", this._onDown);
    window.removeEventListener("mouseup", this._onUp);
    document.removeEventListener("visibilitychange", this._onVis);
    if (this.fxLayer && this.fxLayer.parentNode) this.fxLayer.parentNode.removeChild(this.fxLayer);
    if (this.cursor && this.cursor.parentNode) this.cursor.parentNode.removeChild(this.cursor);
    this.fxLayer = null;
    this.cursor = null;
    this.stamps = [];
    this.trails = [];
    this.ripples = [];
    this.mounted = false;
  };

  CatPawCursor.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    writeEnabled(this.enabled);
    if (this.enabled) this.mount();
    else this.unmount();
    return this.enabled;
  };

  CatPawCursor.prototype._onMove = function (e) {
    this.target.x = e.clientX;
    this.target.y = e.clientY;
  };

  CatPawCursor.prototype._onDown = function (e) {
    if (e.button !== 0 || !this.mounted) return;
    this.isPressed = true;
    this.cursor.classList.add("is-pressed");
    this.spawnClickFeedback(e.clientX, e.clientY);
  };

  CatPawCursor.prototype._onUp = function () {
    this.isPressed = false;
    if (this.cursor) this.cursor.classList.remove("is-pressed");
  };

  CatPawCursor.prototype._onVis = function () {
    this.visible = !document.hidden;
    if (this.visible) this.start();
    else this.stop();
  };

  CatPawCursor.prototype.spawnClickFeedback = function (x, y) {
    this.spawnRipple(x, y);
    this.spawnGlow(x, y);
    this.spawnStamp(x, y);
  };

  CatPawCursor.prototype.spawnRipple = function (x, y) {
    if (!this.fxLayer) return;
    while (this.ripples.length >= MAX_RIPPLES) {
      var old = this.ripples.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    var ring = document.createElement("div");
    ring.className = "paw-click-ripple";
    ring.style.left = x + "px";
    ring.style.top = y + "px";
    this.fxLayer.appendChild(ring);
    this.ripples.push(ring);
    setTimeout(function () {
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }, 480);
  };

  CatPawCursor.prototype.spawnGlow = function (x, y) {
    if (!this.fxLayer) return;
    var glow = document.createElement("div");
    glow.className = "paw-click-glow";
    glow.style.left = x + "px";
    glow.style.top = y + "px";
    this.fxLayer.appendChild(glow);
    setTimeout(function () {
      if (glow.parentNode) glow.parentNode.removeChild(glow);
    }, 380);
  };

  CatPawCursor.prototype.spawnStamp = function (x, y) {
    if (!this.fxLayer) return;
    while (this.stamps.length >= MAX_STAMPS) {
      var old = this.stamps.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    var stamp = document.createElement("div");
    stamp.className = "paw-click-stamp";
    stamp.innerHTML = PAW_SVG;
    stamp.style.left = x + "px";
    stamp.style.top = y + "px";
    this.fxLayer.appendChild(stamp);
    this.stamps.push(stamp);
    setTimeout(function () {
      if (stamp.parentNode) stamp.parentNode.removeChild(stamp);
    }, 2400);
  };

  CatPawCursor.prototype.maybeTrail = function (x, y, now) {
    if (!this.fxLayer || this.isPressed) return;
    if (now - this.lastTrailAt < TRAIL_INTERVAL) return;
    this.lastTrailAt = now;
    while (this.trails.length >= MAX_TRAILS) {
      var old = this.trails.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    var dot = document.createElement("div");
    dot.className = "paw-trail-dot";
    dot.style.left = x + "px";
    dot.style.top = y + "px";
    this.fxLayer.appendChild(dot);
    this.trails.push(dot);
    setTimeout(function () {
      if (dot.parentNode) dot.parentNode.removeChild(dot);
    }, 520);
  };

  CatPawCursor.prototype.start = function () {
    if (this.running || !this.mounted) return;
    this.running = true;
    this._tick();
  };

  CatPawCursor.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  CatPawCursor.prototype._tick = function () {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick.bind(this));
    if (!this.visible || !this.cursor) return;

    var now = performance.now();
    var dx = this.target.x - this.pos.x;
    var dy = this.target.y - this.pos.y;

    if (this.isPressed) {
      this.pos.x = this.target.x;
      this.pos.y = this.target.y;
    } else {
      this.pos.x += dx * 0.32;
      this.pos.y += dy * 0.32;
      var targetAngle = -18 + dx * -0.35;
      targetAngle = Math.max(-32, Math.min(-8, targetAngle));
      this.angle += (targetAngle - this.angle) * 0.22;
      this.maybeTrail(this.pos.x, this.pos.y, now);
    }

    var scale = this.isPressed ? 0.86 : 1;
    var rot = this.isPressed ? 0 : this.angle;
    this.cursor.style.transform =
      "translate(" + this.pos.x + "px," + this.pos.y + "px) " +
      "translate(-50%,-50%) rotate(" + rot + "deg) scale(" + scale + ")";
  };

  function initPawToggle(effect) {
    document.addEventListener("DOMContentLoaded", function () {
      var controls = document.getElementById("video-controls");
      if (!controls) return;
      var btn = document.createElement("button");
      btn.id = "btn-paw";
      btn.type = "button";
      function sync() {
        var on = effect.enabled;
        btn.innerHTML = on ? '<i class="fas fa-paw"></i>' : '<i class="fas fa-ban"></i>';
        btn.title = on ? "關閉貓掌游標" : "開啟貓掌游標";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("is-off", !on);
      }
      sync();
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        effect.setEnabled(!effect.enabled);
        sync();
      });
      controls.insertBefore(btn, controls.firstChild);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (COARSE) return;
    var effect = new CatPawCursor({ enabled: readEnabled() });
    window.CatPawEffect = effect;
    initPawToggle(effect);
  });
})();
