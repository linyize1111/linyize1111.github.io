/**
 * common.js
 *
 * Shared logic for LYZ's website:
 * 1. Loading screen
 * 2. Media controls (video + audio)
 * 3. Sakura canvas animation
 * 4. Three-mode theme system: light / dark / glass
 */

/* ─── 1. Loading Screen ─────────────────────────────────────── */
function initLoadingScreen() {
    var loader = document.getElementById('loading-screen');
    if (!loader) return;

    window.addEventListener('load', function () {
        setTimeout(function () {
            loader.classList.add('fade-out');
            setTimeout(function () {
                loader.style.display = 'none';
                var v = document.getElementById('bg-video');
                if (v && sessionStorage.getItem('mediaPaused') !== 'true') {
                    v.play().catch(function () { });
                }
            }, 700);
        }, 400);
    });
}

/* ─── 2. Media Controls ─────────────────────────────────────── */
function initMediaControls() {
    document.addEventListener('DOMContentLoaded', function () {
        var video = document.getElementById('bg-video');
        var music = document.getElementById('bg-music');
        var btnMute = document.getElementById('btn-mute');
        var btnPlay = document.getElementById('btn-play');

        if (!video || !music || !btnMute || !btnPlay) return;

        video.muted = true;
        var isMuted = (sessionStorage.getItem('mediaMuted') === 'true');
        music.muted = isMuted;

        function updateMuteBtn() {
            btnMute.innerHTML = music.muted
                ? '<i class="fas fa-volume-mute"></i>'
                : '<i class="fas fa-volume-up"></i>';
        }
        updateMuteBtn();

        var savedTime = sessionStorage.getItem('musicCurrentTime');
        if (savedTime && !isNaN(savedTime)) {
            var timeToSet = parseFloat(savedTime);
            // 由於 preload="none" ，在音樂還沒載入 metadata 前無法設定 currentTime
            if (music.readyState >= 1) { // HAVE_METADATA or higher
                music.currentTime = timeToSet;
            } else {
                music.addEventListener('loadedmetadata', function () {
                    music.currentTime = timeToSet;
                }, { once: true });
            }
        }

        if (sessionStorage.getItem('mediaPaused') === 'true') {
            btnPlay.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            var pp = music.play();
            if (pp !== undefined) {
                pp.catch(function () {
                    music.muted = true;
                    updateMuteBtn();
                    sessionStorage.setItem('mediaMuted', 'true');
                    music.play().catch(function () { });
                });
            }
        }

        btnMute.addEventListener('click', function (e) {
            e.stopPropagation();
            music.muted = !music.muted;
            updateMuteBtn();
            sessionStorage.setItem('mediaMuted', music.muted);
            if (music.paused && sessionStorage.getItem('mediaPaused') !== 'true') {
                music.play().catch(function () { });
            }
        });

        btnPlay.addEventListener('click', function () {
            if (video.paused) {
                video.play(); music.play();
                btnPlay.innerHTML = '<i class="fas fa-pause"></i>';
                sessionStorage.setItem('mediaPaused', 'false');
            } else {
                video.pause(); music.pause();
                btnPlay.innerHTML = '<i class="fas fa-play"></i>';
                sessionStorage.setItem('mediaPaused', 'true');
            }
        });

        window.addEventListener('beforeunload', function () {
            sessionStorage.setItem('mediaMuted', music.muted);
            sessionStorage.setItem('mediaPaused', video.paused);
            sessionStorage.setItem('musicCurrentTime', music.currentTime);
        });
    });
}

/* ─── 3. Sakura Canvas ──────────────────────────────────────── */
function initSakuraIfPresent() {
    var canvas = document.getElementById('sakura-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    var COLORS = [[255, 183, 197], [255, 160, 180], [255, 200, 210], [250, 140, 165], [255, 218, 225]];
    var petals = [];

    function makePetal(top) {
        var c = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x: Math.random() * canvas.width,
            y: top ? -20 - Math.random() * 100 : Math.random() * canvas.height,
            size: 8 + Math.random() * 14,
            speedY: 0.25 + Math.random() * 0.45,
            speedX: -0.1 + Math.random() * 0.3,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.025,
            sway: Math.random() * Math.PI * 2,
            swaySpeed: 0.005 + Math.random() * 0.01,
            swayAmp: 0.2 + Math.random() * 0.4,
            alpha: 0.5 + Math.random() * 0.5,
            r: c[0], g: c[1], b: c[2]
        };
    }

    for (var i = 0; i < 80; i++) petals.push(makePetal(false));

    function drawPetal(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        var w = p.size * 0.55, h = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.bezierCurveTo(w, -h * 0.1, w, h * 0.4, 0, h / 2);
        ctx.bezierCurveTo(-w, h * 0.4, -w, -h * 0.1, 0, -h / 2);
        var g = ctx.createRadialGradient(0, -h * 0.1, 0, 0, 0, h / 2);
        g.addColorStop(0, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + Math.min(1, p.alpha + 0.2).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (p.alpha * 0.3).toFixed(2) + ')');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
    }

    var rid;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        petals.forEach(function (p, i) {
            p.sway += p.swaySpeed;
            p.x += p.speedX + Math.sin(p.sway) * p.swayAmp;
            p.y += p.speedY;
            p.angle += p.spin;
            if (p.y > canvas.height + 30 || p.x < -60 || p.x > canvas.width + 60) {
                petals[i] = makePetal(true);
                petals[i].x = Math.random() * canvas.width;
            }
            drawPetal(petals[i]);
        });
        rid = requestAnimationFrame(animate);
    }
    if (window._sakuraAnimId) cancelAnimationFrame(window._sakuraAnimId);
    animate();
    window._sakuraAnimId = rid;
}

/* ─── 4. Three-Mode Theme System ───────────────────────────── */
/**
 * Themes:
 *   'light' (default) — normal light panels
 *   'dark'            — dark glass panels
 *   'glass'           — transparent/no panel, text protected by shadows
 *
 * Applied via data-theme="" on <html>:
 *   light → attribute absent (default CSS)
 *   dark  → data-theme="dark"
 *   glass → data-theme="glass"
 */

var THEMES = ['light', 'dark', 'glass'];

var THEME_META = {
    light: { icon: '<i class="fas fa-sun"></i>', label: '亮色模式 (Light)', next: 'dark' },
    dark: { icon: '<i class="fas fa-moon"></i>', label: '暗色模式 (Dark)', next: 'glass' },
    glass: { icon: '<i class="fas fa-eye"></i>', label: '透明模式 (Glass)', next: 'light' }
};

function applyTheme(theme) {
    if (!theme || theme === 'light') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function initTheme() {
    var saved = localStorage.getItem('colorTheme');
    var theme = (saved && THEMES.indexOf(saved) !== -1) ? saved : 'light';
    applyTheme(theme);

    document.addEventListener('DOMContentLoaded', function () {
        var controls = document.getElementById('video-controls');
        var btn = document.createElement('button');
        btn.id = 'btn-theme';
        btn.style.cssText = 'position:relative;';

        function updateBtn() {
            var t = currentTheme();
            var meta = THEME_META[t];
            btn.innerHTML = meta.icon;
            btn.title = '切換：' + meta.label + ' → ' + THEME_META[meta.next].label;
            btn.setAttribute('aria-label', meta.label);
        }
        updateBtn();

        btn.addEventListener('click', function () {
            var t = currentTheme();
            var next = THEME_META[t].next;
            applyTheme(next);
            localStorage.setItem('colorTheme', next);
            updateBtn();
        });

        if (controls) {
            controls.insertBefore(btn, controls.firstChild);
        } else {
            var panel = document.createElement('div');
            panel.id = 'video-controls';
            panel.appendChild(btn);
            document.body.appendChild(panel);
        }
    });
}

/* ─── Hero Spacer for Non-Index pages ───────────────────────
 * Index has a tall #intro section that lets background show.
 * All other pages go straight header→nav→#main, covering bg.
 * Fix: inject a transparent spacer div BEFORE #main on sub-pages.
 * The spacer is z-index 1 (above bg, below content) and fully
 * transparent so only the fixed background is visible through it.
 */
function initHeroSpacer() {
    document.addEventListener('DOMContentLoaded', function () {
        // Only run on pages without #intro (sub-pages)
        var intro = document.getElementById('intro');
        if (intro) return; // Index — leave alone

        var main = document.getElementById('main');
        if (!main) return;

        // Create the spacer
        var spacer = document.createElement('div');
        spacer.id = 'page-hero-spacer';
        main.parentNode.insertBefore(spacer, main);
    });
}

/* ─── Init ───────────────────────────────────────────────────── */
function initCommon() {
    initTheme();           // Must be first — applies theme before paint
    initHeroSpacer();      // Inject hero spacer before #main on sub-pages
    initLoadingScreen();
    initMediaControls();
    initSakuraIfPresent();
}

initCommon();
