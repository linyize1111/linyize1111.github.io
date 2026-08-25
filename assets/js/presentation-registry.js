/**
 * presentation-registry.js — V3
 * Frontend renders ONLY from stored presentation. No semantic guessing.
 */
(function () {
  "use strict";

  var PRESENTATIONS = {
    fragment: {
      listClass: "is-fragment is-thought is-compact",
      articleClass: "presentation-fragment",
      defaultShowTitle: false,
      defaultShowSummary: false,
      allowToc: false,
      cardCta: "閱讀",
    },
    "photo-note": {
      listClass: "is-photo-note is-thought",
      articleClass: "presentation-photo-note",
      defaultShowTitle: true,
      defaultShowSummary: false,
      allowToc: false,
      cardCta: "觀看",
    },
    journal: {
      listClass: "is-journal is-thought",
      articleClass: "presentation-journal",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: false,
      cardCta: "閱讀",
    },
    "article-lite": {
      listClass: "",
      articleClass: "presentation-article-lite",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: false,
      cardCta: "閱讀文章",
    },
    longform: {
      listClass: "is-longform",
      articleClass: "presentation-longform",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: true,
      cardCta: "閱讀文章",
    },
    review: {
      listClass: "is-review",
      articleClass: "presentation-review",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: true,
      cardCta: "閱讀心得",
    },
    reference: {
      listClass: "is-reference",
      articleClass: "presentation-reference",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: true,
      cardCta: "檢視筆記",
    },
    quote: {
      listClass: "is-quote is-compact",
      articleClass: "presentation-quote",
      defaultShowTitle: false,
      defaultShowSummary: false,
      allowToc: false,
      cardCta: "閱讀",
    },
    fiction: {
      listClass: "is-fiction",
      articleClass: "presentation-fiction",
      defaultShowTitle: true,
      defaultShowSummary: true,
      allowToc: false,
      cardCta: "閱讀創作",
    },
    poetry: {
      listClass: "is-poetry",
      articleClass: "presentation-poetry",
      defaultShowTitle: true,
      defaultShowSummary: false,
      allowToc: false,
      cardCta: "閱讀",
    },
  };

  var VALID = Object.keys(PRESENTATIONS);

  function resolvePresentation(article) {
    var raw = article && article.presentation;
    if (raw && PRESENTATIONS[raw]) return raw;
    // Safe neutral fallback — never infer from length/category/images
    return "article-lite";
  }

  function getPresentationMeta(article) {
    var key = resolvePresentation(article);
    return Object.assign({ key: key }, PRESENTATIONS[key]);
  }

  function showTitle(article) {
    if (article && typeof article.show_title === "boolean") return article.show_title;
    return getPresentationMeta(article).defaultShowTitle;
  }

  function showSummary(article) {
    if (article && typeof article.show_summary === "boolean") return article.show_summary;
    return getPresentationMeta(article).defaultShowSummary;
  }

  function needsAiAnalysis(article) {
    if (article && typeof article.needs_ai_analysis === "boolean") {
      return article.needs_ai_analysis;
    }
    return !(article && article.presentation && PRESENTATIONS[article.presentation]);
  }

  function effectiveVisibility(article) {
    var v = article && article.visibility;
    if (v === "public" || v === "unlisted" || v === "private") return v;
    // Pre-migration: academic categories treated as private for list/gate UX only
    if (
      window.SBSections &&
      window.SBSections.isAcademicCategory &&
      window.SBSections.isAcademicCategory(article && article.category)
    ) {
      return "private";
    }
    return "public";
  }

  window.SBPresentation = {
    PRESENTATIONS: PRESENTATIONS,
    VALID: VALID,
    resolvePresentation: resolvePresentation,
    getPresentationMeta: getPresentationMeta,
    showTitle: showTitle,
    showSummary: showSummary,
    needsAiAnalysis: needsAiAnalysis,
    effectiveVisibility: effectiveVisibility,
  };
})();
