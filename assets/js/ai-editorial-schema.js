/**
 * ai-editorial-schema.js — validate AI analyzer output (deterministic).
 * Shared by Edge Function (copied logic) and admin browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SBAiEditorialSchema = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PRESENTATIONS = [
    "fragment", "photo-note", "journal", "article-lite", "longform",
    "review", "reference", "quote", "fiction", "poetry",
  ];
  var EDIT_LEVELS = [
    "preserve", "format_only", "proofread", "light_edit",
    "structural_edit", "editorial_review",
  ];
  var EDITORIAL_STATES = ["complete", "fragmentary", "needs_review", "incomplete"];
  var FLAGS = [
    "possible_title_in_body", "duplicate_title", "formatting_damage", "copy_paste_noise",
    "typo", "duplicate_content", "source_needed", "fact_check", "overgeneralization",
    "argument_gap", "copyright_quote", "image_rights", "spoiler", "incomplete_body",
  ];
  var REQUIRED = [
    "title", "show_title", "summary", "show_summary", "category", "content_type",
    "presentation", "tags", "series", "edit_level", "clean_body", "editorial_state",
    "confidence", "reason", "flags", "human_review_required",
  ];
  // Optional semantic card display fields (never overwrite author title)
  var OPTIONAL = ["card_topic", "card_label", "show_card_label"];

  var BANNED_SUMMARY_PREFIX = /^(本文|作者|旨在|本文探討|作者透過)/;
  var BANNED_CARD_LABEL = /^(在.*中尋找|從.*重新審視|當.*遇上|關於.*的深刻反思)/;

  function isObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function validateAnalysis(raw) {
    var errors = [];
    if (!isObject(raw)) {
      return { ok: false, errors: ["output must be a JSON object"], value: null };
    }
    var allowed = {};
    REQUIRED.concat(OPTIONAL).forEach(function (k) { allowed[k] = true; });
    var extra = Object.keys(raw).filter(function (k) {
      return !allowed[k];
    });
    if (extra.length) errors.push("additionalProperties: " + extra.join(", "));

    REQUIRED.forEach(function (k) {
      if (!(k in raw)) errors.push("missing: " + k);
    });

    if (typeof raw.title !== "string") errors.push("title must be string");
    if (typeof raw.show_title !== "boolean") errors.push("show_title must be boolean");
    if (typeof raw.summary !== "string") errors.push("summary must be string");
    if (typeof raw.show_summary !== "boolean") errors.push("show_summary must be boolean");
    if (typeof raw.category !== "string") errors.push("category must be string");
    if (typeof raw.content_type !== "string") errors.push("content_type must be string");
    if (PRESENTATIONS.indexOf(raw.presentation) === -1) {
      errors.push("presentation invalid");
    }
    if (!Array.isArray(raw.tags) || raw.tags.some(function (t) { return typeof t !== "string"; })) {
      errors.push("tags must be string[]");
    }
    if (!(raw.series === null || typeof raw.series === "string")) {
      errors.push("series must be string|null");
    }
    if (EDIT_LEVELS.indexOf(raw.edit_level) === -1) errors.push("edit_level invalid");
    if (typeof raw.clean_body !== "string") errors.push("clean_body must be string");
    if (EDITORIAL_STATES.indexOf(raw.editorial_state) === -1) {
      errors.push("editorial_state invalid");
    }
    if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
      errors.push("confidence must be 0..1 number");
    }
    if (typeof raw.reason !== "string" || raw.reason.length > 280) {
      errors.push("reason must be string <=280");
    }
    if (!Array.isArray(raw.flags)) errors.push("flags must be array");
    else {
      raw.flags.forEach(function (f) {
        if (FLAGS.indexOf(f) === -1) errors.push("flag invalid: " + f);
      });
    }
    if (typeof raw.human_review_required !== "boolean") {
      errors.push("human_review_required must be boolean");
    }

    if ("card_topic" in raw && typeof raw.card_topic !== "string") {
      errors.push("card_topic must be string");
    }
    if ("card_label" in raw && typeof raw.card_label !== "string") {
      errors.push("card_label must be string");
    }
    if ("show_card_label" in raw && typeof raw.show_card_label !== "boolean") {
      errors.push("show_card_label must be boolean");
    }

    var warnings = [];
    if (typeof raw.summary === "string" && BANNED_SUMMARY_PREFIX.test(raw.summary.trim())) {
      warnings.push("summary looks like report-tone (本文/作者/旨在)");
    }
    if (typeof raw.card_label === "string" && BANNED_CARD_LABEL.test(raw.card_label.trim())) {
      warnings.push("card_label looks like polished AI headline");
    }
    if (typeof raw.confidence === "number" && raw.confidence < 0.55) {
      warnings.push("low confidence");
      if (!raw.human_review_required) {
        errors.push("confidence < 0.55 requires human_review_required=true");
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      value: errors.length === 0 ? raw : null,
    };
  }

  function parseModelJson(text) {
    var s = String(text || "").trim();
    if (s.indexOf("```") === 0) {
      s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return {
    PRESENTATIONS: PRESENTATIONS,
    EDIT_LEVELS: EDIT_LEVELS,
    EDITORIAL_STATES: EDITORIAL_STATES,
    FLAGS: FLAGS,
    REQUIRED: REQUIRED,
    OPTIONAL: OPTIONAL,
    validateAnalysis: validateAnalysis,
    parseModelJson: parseModelJson,
  };
});
