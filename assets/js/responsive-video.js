// Keep the large decorative video off small or data-saving screens. The poster
// remains available as a CSS background; desktop retains the original motion.
(function () {
  "use strict";
  var video = document.getElementById("bg-video");
  var source = video && video.querySelector("source[data-src]");
  if (!video || !source) return;

  var wide = window.matchMedia("(min-width: 737px)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  function sync() {
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    if (wide.matches && !reduced.matches && !saveData) {
      if (!source.hasAttribute("src")) {
        source.setAttribute("src", source.dataset.src);
        video.load();
        video.play().catch(function () {});
      }
    } else if (source.hasAttribute("src")) {
      video.pause();
      source.removeAttribute("src");
      video.load();
    }
  }

  sync();
  if (wide.addEventListener) wide.addEventListener("change", sync);
  else wide.addListener(sync);
  if (reduced.addEventListener) reduced.addEventListener("change", sync);
  else reduced.addListener(sync);
})();
