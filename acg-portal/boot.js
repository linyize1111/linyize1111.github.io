(() => {
  "use strict";
  const host = location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]"
    || location.protocol === "file:";
  let started = false;
  function loadApp() {
    if (started) return;
    started = true;
    const cover = document.createElement("script");
    cover.src = "cover-egress.js?v=2.2.5-egress";
    const app = document.createElement("script");
    app.src = "app.js?v=2.2.5-egress";
    cover.onload = () => document.body.appendChild(app);
    cover.onerror = () => document.body.appendChild(app);
    document.body.appendChild(cover);
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
