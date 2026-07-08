/**
 * Cat Paw Cursor — Zdog 3D 游標 + 點擊紅光點回饋
 * 依賴 Zdog（頁面需先載入 zdog.dist.min.js）
 */
(function () {
  "use strict";

  var STORAGE_KEY = "catPawEnabled";
  var MAX_PRINTS = 28;
  var MAX_CLICK_FX = 8;
  var CLICK_FX_MS = 320;
  var GLOW_SIZE = 22;
  var COARSE = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  class CatPawEffect {
    constructor(options) {
      options = options || {};
      this.enabled = options.enabled !== false;
      this.size = options.size || 36;
      this.padPrintColor = options.padPrintColor || "#F5F5EC";
      this.cursorPadColor = options.cursorPadColor || "#FFA1B8";
      this.pawBaseColor = options.pawBaseColor || "#404040";
      this.maxPrintLifeTime = options.maxPrintLifeTime || 2200;
      this.padList = [];
      this.clickFx = [];
      this.DEFAULT_SHAPE_SIZE = 80;
      this.pos = { x: -120, y: -120 };
      this.target = { x: -120, y: -120 };
      this.vel = { x: 0, y: 0 };
      this.angle = -34;
      this.isPressed = false;
      this.running = false;
      this.visible = !document.hidden;
      this._onMove = this._onMove.bind(this);
      this._onDown = this._onDown.bind(this);
      this._onUp = this._onUp.bind(this);
      this._onScroll = this._onScroll.bind(this);
      this._onVis = this._onVis.bind(this);
      this._onResize = this._onResize.bind(this);
      if (this.enabled) this.mount();
    }

    mount() {
      if (this.mounted || typeof window.Zdog === "undefined") return;
      this.mounted = true;
      document.documentElement.classList.add("paw-cursor-active");
      this.initClickLayer();
      this.initCursorGlow();
      this.initCanvas();
      this.initZdog();
      this.initArm();
      this.bindEvents();
      this.start();
    }

    unmount() {
      this.stop();
      document.documentElement.classList.remove("paw-cursor-active");
      window.removeEventListener("mousemove", this._onMove);
      window.removeEventListener("mousedown", this._onDown);
      window.removeEventListener("mouseup", this._onUp);
      window.removeEventListener("scroll", this._onScroll, { passive: true });
      document.removeEventListener("visibilitychange", this._onVis);
      window.removeEventListener("resize", this._onResize);
      if (this.clickLayer && this.clickLayer.parentNode) this.clickLayer.parentNode.removeChild(this.clickLayer);
      if (this.cursorGlow && this.cursorGlow.parentNode) this.cursorGlow.parentNode.removeChild(this.cursorGlow);
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      if (this.catArm && this.catArm.parentNode) this.catArm.parentNode.removeChild(this.catArm);
      this.clickLayer = null;
      this.cursorGlow = null;
      this.canvas = null;
      this.catArm = null;
      this.illo = null;
      this.padList = [];
      this.clickFx = [];
      this.mounted = false;
    }

    setEnabled(on) {
      this.enabled = !!on;
      writeEnabled(this.enabled);
      if (this.enabled) this.mount();
      else this.unmount();
      return this.enabled;
    }

    initClickLayer() {
      this.clickLayer = document.createElement("div");
      this.clickLayer.className = "paw-click-layer";
      this.clickLayer.setAttribute("aria-hidden", "true");
      document.body.appendChild(this.clickLayer);
    }

    initCursorGlow() {
      if (REDUCED) return;
      this.cursorGlow = document.createElement("div");
      this.cursorGlow.className = "paw-cursor-glow";
      this.cursorGlow.setAttribute("aria-hidden", "true");
      document.body.appendChild(this.cursorGlow);
    }

    spawnClickFeedback(x, y) {
      if (!this.clickLayer || REDUCED) return;
      while (this.clickFx.length >= MAX_CLICK_FX) {
        var old = this.clickFx.shift();
        if (old && old.parentNode) old.parentNode.removeChild(old);
      }
      var wrap = document.createElement("div");
      wrap.className = "paw-click-fx";
      wrap.style.left = x + "px";
      wrap.style.top = y + "px";

      var dot = document.createElement("span");
      dot.className = "paw-click-dot";
      wrap.appendChild(dot);

      var ripple = document.createElement("span");
      ripple.className = "paw-click-ripple";
      wrap.appendChild(ripple);

      this.clickLayer.appendChild(wrap);
      this.clickFx.push(wrap);
      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, CLICK_FX_MS + 80);
    }

    initCanvas() {
      this.canvas = document.createElement("canvas");
      this.canvas.setAttribute("aria-hidden", "true");
      Object.assign(this.canvas.style, {
        position: "fixed", top: "0", left: "0",
        width: "100vw", height: "100vh",
        pointerEvents: "none", zIndex: "9998",
      });
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      document.body.appendChild(this.canvas);
    }

    initZdog() {
      this.illo = new Zdog.Illustration({
        element: this.canvas,
        dragRotate: false,
      });
    }

    initArm() {
      var ratio = this.size / 80;
      this.catArm = document.createElement("div");
      this.catArm.setAttribute("aria-hidden", "true");
      Object.assign(this.catArm.style, {
        position: "fixed", pointerEvents: "none", zIndex: "10000",
        width: (68 * ratio) + "px", height: (136 * ratio) + "px",
        backgroundColor: this.pawBaseColor, borderRadius: (34 * ratio) + "px",
        transformStyle: "preserve-3d", perspective: "500px",
        top: "0", left: "0", transform: "translate(-120px,-120px)",
        willChange: "transform",
      });
      this.catArm.innerHTML =
        '<div id="paw-pads" style="width:100%;height:100%;transition:opacity .06s;">' +
        '<div style="position:absolute;width:' + (45 * ratio) + 'px;height:' + (40 * ratio) + 'px;background:' + this.cursorPadColor + ';border-radius:50%;top:' + (38 * ratio) + 'px;left:' + (11.5 * ratio) + 'px;"></div>' +
        '<div style="position:absolute;width:' + (35 * ratio) + 'px;height:' + (40 * ratio) + 'px;background:' + this.cursorPadColor + ';border-radius:50%;top:' + (35 * ratio) + 'px;left:' + (16.5 * ratio) + 'px;"></div>' +
        '<div style="position:absolute;width:' + (10 * ratio) + 'px;height:' + (20 * ratio) + 'px;background:' + this.cursorPadColor + ';border-radius:50%;top:' + (18 * ratio) + 'px;left:' + (49 * ratio) + 'px;"></div>' +
        '<div style="position:absolute;width:' + (10 * ratio) + 'px;height:' + (20 * ratio) + 'px;background:' + this.cursorPadColor + ';border-radius:50%;top:' + (8 * ratio) + 'px;left:' + (37 * ratio) + 'px;"></div>' +
        '<div style="position:absolute;width:' + (10 * ratio) + 'px;height:' + (20 * ratio) + 'px;background:' + this.cursorPadColor + ';border-radius:50%;top:' + (8 * ratio) + 'px;left:' + (21 * ratio) + 'px;"></div>' +
        '<div style="position:absolute;width:' + (10 * ratio) + 'px;height:' + (20 * ratio) + 'px;background:' + this.cursorPadColor + ';border-radius:50%;top:' + (18 * ratio) + 'px;left:' + (9 * ratio) + 'px;"></div>' +
        "</div>";
      document.body.appendChild(this.catArm);
      this.padsEl = this.catArm.querySelector("#paw-pads");
    }

    getValue(baseValue) {
      return baseValue * (this.size / this.DEFAULT_SHAPE_SIZE);
    }

    createPaw(x, y) {
      var group = new Zdog.Group({
        addTo: this.illo,
        translate: {
          x: x - window.innerWidth / 2,
          y: y - window.innerHeight / 2 + this.getValue(20),
        },
        rotate: { z: 0 },
      });
      new Zdog.Hemisphere({ addTo: group, translate: { y: this.getValue(-10), z: this.getValue(38) }, color: this.padPrintColor, stroke: 0, width: this.getValue(45), height: this.getValue(40) });
      new Zdog.Hemisphere({ addTo: group, translate: { y: this.getValue(-13), z: this.getValue(38) }, color: this.padPrintColor, stroke: 0, width: this.getValue(35), height: this.getValue(40) });
      [[20, -40], [8, -50], [-8, -50], [-20, -40]].forEach(function (t) {
        new Zdog.Hemisphere({ addTo: group, translate: { x: this.getValue(t[0]), y: this.getValue(t[1]), z: this.getValue(38) }, color: this.padPrintColor, width: this.getValue(10), height: this.getValue(20) });
      }, this);
      return { group: group, createdAt: performance.now() };
    }

    hexToRgba(hex, alpha) {
      hex = String(hex).replace("#", "");
      if (hex.length === 3) hex = hex.split("").map(function (x) { return x + x; }).join("");
      var n = parseInt(hex, 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
    }

    bindEvents() {
      window.addEventListener("mousemove", this._onMove, { passive: true });
      window.addEventListener("mousedown", this._onDown);
      window.addEventListener("mouseup", this._onUp);
      window.addEventListener("scroll", this._onScroll, { passive: true });
      document.addEventListener("visibilitychange", this._onVis);
      window.addEventListener("resize", this._onResize);
    }

    _onMove(e) {
      this.target.x = e.clientX;
      this.target.y = e.clientY;
    }

    _onDown(e) {
      if (e.button !== 0) return;
      this.isPressed = true;
      this.spawnClickFeedback(e.clientX, e.clientY);
      this.padList.push(this.createPaw(e.clientX + window.scrollX, e.clientY + window.scrollY));
      while (this.padList.length > MAX_PRINTS) {
        var old = this.padList.shift();
        if (old && old.group) old.group.remove();
      }
      if (this.illo) this.illo.updateRenderGraph();
    }

    _onUp() { this.isPressed = false; }

    _onScroll() {
      if (!this.illo) return;
      this.illo.translate.x = window.scrollX;
      this.illo.translate.y = -window.scrollY;
      this.illo.updateRenderGraph();
    }

    _onVis() {
      this.visible = !document.hidden;
      if (this.visible) this.start();
      else this.stop();
    }

    _onResize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      if (this.illo) this.illo.updateRenderGraph();
    }

    start() {
      if (this.running || !this.mounted) return;
      this.running = true;
      this._tick();
    }

    stop() {
      this.running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    _tick() {
      if (!this.running) return;
      this._raf = requestAnimationFrame(this._tick.bind(this));
      if (!this.visible || !this.catArm) return;

      var now = performance.now();
      var ratio = this.size / 80;

      if (this.cursorGlow && !REDUCED) {
        this.cursorGlow.style.transform = "translate(" + this.target.x + "px," + this.target.y + "px)";
      }

      if (!this.isPressed) {
        var dx = this.target.x - this.pos.x;
        var dy = this.target.y - this.pos.y;
        this.vel.x = dx * 0.28;
        this.vel.y = dy * 0.28;
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        var targetAngle = -34 + (this.vel.x * -0.45);
        targetAngle = Math.max(-50, Math.min(-15, targetAngle));
        this.angle += (targetAngle - this.angle) * 0.28;
        this.catArm.style.transform = "translate(" + (this.pos.x + 25) + "px," + (this.pos.y + 25) + "px) rotateY(0deg) rotateZ(" + this.angle + "deg) scale(1)";
        if (this.padsEl) this.padsEl.style.opacity = "1";
      } else {
        this.pos.x = this.target.x;
        this.pos.y = this.target.y;
        var offsetX = 34 * ratio;
        var offsetY = 58 * ratio;
        this.catArm.style.transform = "translate(" + (this.pos.x - offsetX) + "px," + (this.pos.y - offsetY) + "px) rotateY(-180deg) rotateZ(0deg) scale(1)";
        if (this.padsEl) this.padsEl.style.opacity = "0";
      }

      for (var i = this.padList.length - 1; i >= 0; i--) {
        var pad = this.padList[i];
        var delta = now - pad.createdAt;
        if (delta > this.maxPrintLifeTime - 900) {
          var opacity = Math.max(0, 1 - (delta - (this.maxPrintLifeTime - 900)) / 900);
          pad.group.children.forEach(function (child) {
            if (child instanceof Zdog.Hemisphere) child.color = this.hexToRgba(this.padPrintColor, opacity);
          }, this);
        }
        if (delta > this.maxPrintLifeTime) {
          pad.group.remove();
          this.padList.splice(i, 1);
        }
      }

      if (this.illo) this.illo.updateRenderGraph();
    }
  }

  function initPawToggle(effect) {
    document.addEventListener("DOMContentLoaded", function () {
      var controls = document.getElementById("video-controls") || document.getElementById("site-controls");
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
    var effect = new CatPawEffect({
      enabled: readEnabled(),
      size: 34,
      padPrintColor: "#F5F5EC",
      cursorPadColor: "#FFA1B8",
      pawBaseColor: "#404040",
      maxPrintLifeTime: 2400,
    });
    window.CatPawEffect = effect;
    initPawToggle(effect);
  });
})();
