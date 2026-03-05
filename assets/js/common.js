/**
 * common.js
 * 
 * Shared logic for LYZ's website:
 * 1. Loading screen overlay
 * 2. Media controls (background video & music)
 * 3. Sakura effect (with DOM guard)
 */

 function initLoadingScreen() {
    // Show bg.png immediately via CSS in #loading-screen
    // Wait for window load
    window.addEventListener('load', function () {
        setTimeout(function () {
            var loader = document.getElementById('loading-screen');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(function () {
                    loader.style.display = 'none';
                    // Start video after fade out
                    var v = document.getElementById('bg-video');
                    if (v && sessionStorage.getItem('mediaPaused') !== 'true') {
                        v.play().catch(function (e) { console.log('Autoplay prevented:', e); });
                    }
                }, 500); // 0.5s fade transition
            } else {
                // Flash fallback if no loader
                var v = document.getElementById('bg-video');
                if (v && sessionStorage.getItem('mediaPaused') !== 'true') {
                    v.play().catch(function (e) { console.log('Autoplay prevented:', e); });
                }
            }
        }, 5000); // Wait 5 seconds to ensure stability
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

        // 影片永遠靜音
        video.muted = true;

        // 如果 session 記錄為真才靜音，否則預設想開聲音
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
            // 嘗試即刻播放 (若被瀏覽器阻擋則先靜音播放)
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

            // 防呆：如果音樂根本沒開始播，接觸解靜音時順便啟動
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
    // Sakura effect canvas
    var canvas = document.getElementById('sakura-canvas');
    if (!canvas) return; // ✅ DOM guard directly prevents errors if absent
    
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

    // Cancel old animation on re-init just in case
    if (window._sakuraAnimId) {
        cancelAnimationFrame(window._sakuraAnimId);
    }
    
    animate();
    window._sakuraAnimId = requestID;
}

function initCommon() {
    initLoadingScreen();
    initMediaControls();
    initSakuraIfPresent();
}

// Ensure execution
initCommon();
