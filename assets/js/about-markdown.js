/**
 * About-page Markdown helpers (shared by public site + admin Site Copy preview).
 */
(function () {
  /**
   * Turn ## headings into collapsed <details> folds.
   * Preamble before the first h2 stays open; default closed.
   */
  function enhanceAboutMarkdownFolds(root) {
    if (!root || root.getAttribute("data-folds-ready") === "1") return;
    var children = Array.from(root.children);
    var firstH2 = -1;
    for (var i = 0; i < children.length; i++) {
      if (children[i].tagName === "H2") {
        firstH2 = i;
        break;
      }
    }
    if (firstH2 < 0) return;

    var keep = [];
    for (var p = 0; p < firstH2; p++) {
      var pre = children[p];
      if (pre.tagName === "HR" && p === firstH2 - 1) continue;
      keep.push(pre);
    }

    var folds = [];
    var idx = firstH2;
    while (idx < children.length) {
      var heading = children[idx++];
      if (heading.tagName !== "H2") break;
      var panelNodes = [];
      while (idx < children.length && children[idx].tagName !== "H2") {
        var node = children[idx++];
        var nextIsH2 = idx < children.length && children[idx].tagName === "H2";
        if (node.tagName === "HR" && nextIsH2) continue;
        if (node.tagName === "HR" && idx >= children.length) continue;
        panelNodes.push(node);
      }
      folds.push({ heading: heading, panelNodes: panelNodes });
    }

    root.textContent = "";
    keep.forEach(function (n) {
      root.appendChild(n);
    });
    folds.forEach(function (fold) {
      var details = document.createElement("details");
      details.className = "about-fold";
      var summary = document.createElement("summary");
      summary.className = "about-fold__summary";
      fold.heading.classList.add("about-fold__heading");
      summary.appendChild(fold.heading);
      var panel = document.createElement("div");
      panel.className = "about-fold__panel";
      fold.panelNodes.forEach(function (n) {
        panel.appendChild(n);
      });
      details.appendChild(summary);
      details.appendChild(panel);
      root.appendChild(details);
    });
    root.setAttribute("data-folds-ready", "1");
    root.classList.add("about-markdown--folds");
  }

  window.LYZEnhanceAboutMarkdownFolds = enhanceAboutMarkdownFolds;
})();
