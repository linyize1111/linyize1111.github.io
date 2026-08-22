(() => {
  "use strict";
  const gate = document.getElementById("age-gate");
  const enter = document.getElementById("age-enter");
  const leave = document.getElementById("age-leave");
  const confirmed = () => {
    try { return localStorage.getItem("acg_age_confirmed") === "1"; } catch (_) { return false; }
  };
  const dismiss = () => {
    gate?.classList.remove("open");
    if (!document.querySelector(".modal.open")) document.body.style.overflow = "";
  };
  if (confirmed()) dismiss();
  enter?.addEventListener("click", () => {
    try { localStorage.setItem("acg_age_confirmed", "1"); } catch (_) { /* private mode */ }
    dismiss();
  });
  leave?.addEventListener("click", () => { location.href = "https://www.google.com/"; });

  const host = location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]"
    || location.protocol === "file:";
  let started = false;
  function loadApp() {
    if (started) return;
    started = true;
    const app = document.createElement("script");
    app.src = "app.js?v=2.2.4";
    document.body.appendChild(app);
  }
  if (!local) {
    loadApp();
    return;
  }
  const s = document.createElement("script");
  s.src = "config.local.js?v=2.2.4";
  s.onload = loadApp;
  s.onerror = loadApp;
  document.head.appendChild(s);
  setTimeout(loadApp, 800);
})();
