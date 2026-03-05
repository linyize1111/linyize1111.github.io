/**
 * common.js
 * 
 * Shared logic for LYZ's website:
 * 1. Loading screen overlay (bg.png always visible, short delay)
 * 2. Media controls (background video & music)
 * 3. Sakura effect (with DOM guard)
 * 4. Dark mode toggle initialization
 */

function initLoadingScreen() {
    var loader = document.getElementById('loading-screen');
    if (!loader) return;

    // The #loading-screen already shows bg.png via CSS immediately.
    // Just wait for DOM+resources to be ready, then fade out quickly (1.2s).
    window.addEventListener('load', function () {
        setTimeout(function () {
            loader.classList.add('fade-out');
            setTimeout(function () {
                loader.style.display = 'none';
                // Start video only after fade is complete
                var v = document.getElementById('bg-video');
                if (v && sessionStorage.getItem('mediaPaused') !== 'true') {
                    v.play().catch(function (e) { console.log('Autoplay prevented:', e); });
                }
            }, 700); // Match CSS transition 0.6s + small buffer
        }, 400); // Very short delay — bg.png loads immediately, we just wait for paint
    });
}

function initMediaControls() {
    document.addEventListener('DOMContentLoaded', function () {
        var video = document.getElementById('bg-video');
        var music = document.getElementById('bg-music');
        var btnMute = document.getElementById('btn-mute');
        var btnPlay = document.getElementById('btn-play');

        if (!video || !music || !btnMute || !btnPlay) return;

        var savedMuted = sessionStorage.getItem('mediaMuted');
        var savedPaused = sessionStorage.getItem('mediaPaused');

        // Video always muted for autoplay compatibility
        video.muted = true;

        var isMuted = (savedMuted === 'true');
        music.muted = isMuted;

        function updateMuteBtn() {
            btnMute.innerHTML = music.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        }
        updateMuteBtn();

        if (savedPaused === 'true') {
            video.pause();
            btnPlay.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            var playPromise = music.play();
            if (playPromise !== undefined) {
                playPromise.catch(function () {
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
            if (music.paused && savedPaused !== 'true') {
                music.play().catch(function () { });
            }
        });

        btnPlay.addEventListener('click', function () {
            if (video.paused) {
                video.play();
                music.play();
                btnPlay.innerHTML = '<i class="fas fa-pause"></i>';
                sessionStorage.setItem('mediaPaused', 'false');
            } else {
                video.pause();
                music.pause();
                btnPlay.innerHTML = '<i class="fas fa-play"></i>';
                sessionStorage.setItem('mediaPaused', 'true');
            }
        });

        window.addEventListener('beforeunload', function () {
            sessionStorage.setItem('mediaMuted', music.muted);
            sessionStorage.setItem('mediaPaused', video.paused);
        });
    });
}

function initSakuraIfPresent() {
    var canvas = document.getElementById('sakura-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    var COLORS = [
        [255, 183, 197],
        [255, 160, 180],
        [255, 200, 210],
        [250, 140, 165],
        [255, 218, 225]
    ];

    var PETAL_COUNT = 80;
    var petals = [];

    function makePetal(startFromTop) {
        var c = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x: Math.random() * canvas.width,
            y: startFromTop ? -20 - Math.random() * 100 : Math.random() * canvas.height,
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

    for (var i = 0; i < PETAL_COUNT; i++) {
        petals.push(makePetal(false));
    }

    function drawPetal(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        var w = p.size * 0.55;
        var h = p.size;

        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.bezierCurveTo(w, -h * 0.1, w, h * 0.4, 0, h / 2);
        ctx.bezierCurveTo(-w, h * 0.4, -w, -h * 0.1, 0, -h / 2);

        var grad = ctx.createRadialGradient(0, -h * 0.1, 0, 0, 0, h / 2);
        grad.addColorStop(0, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + Math.min(1, p.alpha + 0.2).toFixed(2) + ')');
        grad.addColorStop(1, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (p.alpha * 0.3).toFixed(2) + ')');

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    }

    var requestID;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (var i = 0; i < petals.length; i++) {
            var p = petals[i];

            p.sway += p.swaySpeed;
            p.x += p.speedX + Math.sin(p.sway) * p.swayAmp;
            p.y += p.speedY;
            p.angle += p.spin;

            if (p.y > canvas.height + 30 || p.x < -60 || p.x > canvas.width + 60) {
                petals[i] = makePetal(true);
                petals[i].x = Math.random() * canvas.width;
            }

            drawPetal(petals[i]);
        }

        requestID = requestAnimationFrame(animate);
    }

    if (window._sakuraAnimId) {
        cancelAnimationFrame(window._sakuraAnimId);
    }

    animate();
    window._sakuraAnimId = requestID;
}

// ─── Dark Mode ───────────────────────────────────────────────────────────────

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function initDarkMode() {
    // Read preference: localStorage > system preference
    var saved = localStorage.getItem('colorTheme');
    var preferred;
    if (saved) {
        preferred = saved;
    } else {
        preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(preferred);

    // Create toggle button when DOM is ready
    document.addEventListener('DOMContentLoaded', function () {
        var controls = document.getElementById('video-controls');
        var btn = document.createElement('button');
        btn.id = 'btn-darkmode';
        btn.title = '切換深色/亮色模式';
        btn.innerHTML = '<i class="fas fa-moon"></i>';

        function updateIcon() {
            var isDark = document.documentElement.hasAttribute('data-theme');
            btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            btn.title = isDark ? '切換亮色模式' : '切換深色模式';
        }
        updateIcon();

        btn.addEventListener('click', function () {
            var isDark = document.documentElement.hasAttribute('data-theme');
            var newTheme = isDark ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('colorTheme', newTheme);
            updateIcon();
        });

        if (controls) {
            // Insert at top of controls panel
            controls.insertBefore(btn, controls.firstChild);
        } else {
            // Fallback: inject a standalone controls panel
            var panel = document.createElement('div');
            panel.id = 'video-controls';
            panel.appendChild(btn);
            document.body.appendChild(panel);
        }
    });

    // Also watch for system changes (if user hasn't manually set a preference)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!localStorage.getItem('colorTheme')) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
}

function initCommon() {
    initDarkMode(); // Must be first so theme applies before paint
    initLoadingScreen();
    initMediaControls();
    initSakuraIfPresent();
}

initCommon();
