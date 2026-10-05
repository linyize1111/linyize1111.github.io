// Make the login dialog responsive before the larger auth bundle has loaded.
(() => {
  "use strict";
  const modal = document.getElementById("auth-modal");
  if (!modal) return;

  const syncScrollLock = () => {
    document.body.style.overflow = document.querySelector(".modal.open") ? "hidden" : "";
  };
  const open = () => {
    modal.classList.add("open");
    syncScrollLock();
    document.getElementById("password-login-email")?.focus();
  };
  for (const id of ["login-button", "landing-login"]) {
    document.getElementById(id)?.addEventListener("click", open);
  }
  modal.querySelector('[data-close-modal="auth-modal"]')?.addEventListener("click", () => {
    modal.classList.remove("open");
    syncScrollLock();
  });

  // A visible but unbound sign-in button looks broken during a slow download.
  const actions = ["google-login-button", "password-login-button", "password-signup-button", "auth-clear-storage-button"]
    .map(id => document.getElementById(id)).filter(Boolean);
  actions.forEach(button => { button.disabled = true; });
  const help = document.getElementById("auth-help");
  if (help) help.textContent = "登入功能載入中…若持續未完成，請重新整理頁面。";
  window.addEventListener("acg:auth-ready", () => {
    actions.forEach(button => {
      // Google availability is set by detectGoogleProvider(), not this bridge.
      if (button.id !== "google-login-button") button.disabled = false;
    });
  }, { once: true });
})();
