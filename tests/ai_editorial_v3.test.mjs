/**
 * Voice / heuristic regression tests for V3 AI-first editorial stack.
 * Run: node tests/ai_editorial_v3.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// Load schema validator (CJS/UMD)
const schema = require(path.join(root, "assets/js/ai-editorial-schema.js"));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("✔", name);
  } catch (e) {
    failed++;
    console.error("✘", name, e.message);
  }
}

test("schema rejects missing fields", () => {
  const v = schema.validateAnalysis({ title: "x" });
  assert.equal(v.ok, false);
});

test("schema accepts valid analysis", () => {
  const sample = {
    title: "測試",
    show_title: true,
    summary: "一句話",
    show_summary: true,
    category: "隨想",
    content_type: "fragment",
    presentation: "fragment",
    tags: ["想法"],
    series: null,
    edit_level: "format_only",
    clean_body: "第一行\n\n第二行",
    editorial_state: "complete",
    confidence: 0.9,
    reason: "短感觸，適合 fragment。",
    flags: [],
    human_review_required: false,
  };
  const v = schema.validateAnalysis(sample);
  assert.equal(v.ok, true);
  assert.equal(sample.clean_body.split("\n").filter(Boolean).length, 2);
});

test("low confidence forces human_review_required", () => {
  const sample = {
    title: "t",
    show_title: false,
    summary: "",
    show_summary: false,
    category: "隨想",
    content_type: "fragment",
    presentation: "fragment",
    tags: [],
    series: null,
    edit_level: "preserve",
    clean_body: "a\nb",
    editorial_state: "fragmentary",
    confidence: 0.4,
    reason: "不確定",
    flags: [],
    human_review_required: false,
  };
  const v = schema.validateAnalysis(sample);
  assert.equal(v.ok, false);
});

test("summary report-tone warns", () => {
  const sample = {
    title: "t",
    show_title: true,
    summary: "本文探討自由的意義",
    show_summary: true,
    category: "隨筆",
    content_type: "essay",
    presentation: "article-lite",
    tags: [],
    series: null,
    edit_level: "preserve",
    clean_body: "正文",
    editorial_state: "complete",
    confidence: 0.8,
    reason: "ok",
    flags: [],
    human_review_required: false,
  };
  const v = schema.validateAnalysis(sample);
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => /report-tone|本文/.test(w)));
});

test("admin.js has no SHORT_CHARS / LONG_CHARS vars", () => {
  const s = read("assets/js/admin.js");
  assert.equal(/var SHORT_CHARS/.test(s), false);
  assert.equal(/var LONG_CHARS/.test(s), false);
  assert.equal(/line\.length < 120/.test(s), false);
  assert.ok(s.includes("runAiAnalyze"));
  assert.ok(s.includes("applyAiAnalysis"));
});

test("cms-public.js has no bodyPlainLen compact heuristics", () => {
  const s = read("assets/js/cms-public.js");
  assert.equal(s.includes("bodyPlainLen"), false);
  assert.equal(s.includes("isCompactCard"), false);
  assert.equal(s.includes("isPhotoNoteCard"), false);
  assert.ok(s.includes("SBPresentation"));
  assert.ok(s.includes("resolvePresentation") || s.includes("presentationMeta"));
});

test("public list HTML has no static note-item fallbacks", () => {
  for (const f of ["directory.html", "literature.html", "academic.html"]) {
    const h = read(f);
    assert.equal((h.match(/class="note-item/g) || []).length, 0, f);
  }
});

test("AI client does not embed API secrets", () => {
  const s = read("assets/js/ai-editorial-client.js");
  assert.equal(/sk-[a-zA-Z0-9]/.test(s), false);
  assert.equal(s.includes("OPENAI_API_KEY"), false);
  assert.ok(s.includes("functions/v1/editorial-analyze"));
});

test("edge function rejects auto-publish and validates schema", () => {
  const s = read("supabase/functions/editorial-analyze/index.ts");
  assert.ok(s.includes("auto_publish: false"));
  assert.ok(s.includes("validateAnalysis"));
  assert.ok(s.includes("Admin only") || s.includes("is_admin"));
  assert.ok(s.includes("author_voice_priority"));
  assert.ok(s.includes("不得使用"));
});

test("0007 migration keeps presentation nullable", () => {
  const s = read("supabase/migrations/0007_ai_first_content_model.sql");
  assert.ok(s.includes("presentation is null"));
  assert.ok(s.includes("visibility"));
  assert.equal(/presentation text not null/i.test(s), false);
});

test("presentation registry fallback is article-lite", () => {
  // Execute registry in a fake window
  const code = read("assets/js/presentation-registry.js");
  const window = {};
  // eslint-disable-next-line no-new-func
  Function("window", code)(window);
  assert.equal(window.SBPresentation.resolvePresentation({}), "article-lite");
  assert.equal(window.SBPresentation.resolvePresentation({ presentation: "fragment" }), "fragment");
  assert.equal(window.SBPresentation.needsAiAnalysis({}), true);
  assert.equal(window.SBPresentation.needsAiAnalysis({ presentation: "longform" }), false);
});

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nAll tests passed");
