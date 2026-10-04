// Keep the age decision usable even while the larger auth bundle is loading.
(() => {
  "use strict";
  const gate = document.getElementById("age-gate");
  const enter = document.getElementById("age-enter");
  const leave = document.getElementById("age-leave");
  if (!gate || !enter || !leave) return;

  const dismiss = () => {
    gate.classList.remove("open");
    if (!document.querySelector(".modal.open")) document.body.style.overflow = "";
  };
  try {
    if (localStorage.getItem("acg_age_confirmed") === "1") dismiss();
  } catch (_) { /* Storage may be unavailable in private mode. */ }

  enter.addEventListener("click", () => {
    try { localStorage.setItem("acg_age_confirmed", "1"); } catch (_) { /* private mode */ }
    dismiss();
  });
  leave.addEventListener("click", () => { location.href = "https://www.google.com/"; });
})();
