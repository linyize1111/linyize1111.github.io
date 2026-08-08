/**
 * V6.2 — Shared renderer is the single source of truth.
 * Public cms-public and admin preview both depend on SBArticleRenderer.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import path from "node:path";

const root = path.resolve(".");
const rendererSrc = fs.readFileSync("assets/js/article-renderer.js", "utf8");
const cmsSrc = fs.readFileSync("assets/js/cms-public.js", "utf8");
const adminSrc = fs.readFileSync("assets/js/admin.js", "utf8");
const previewHtml = fs.readFileSync("admin-preview.html", "utf8");

assert.ok(rendererSrc.includes("window.SBArticleRenderer"));
assert.ok(rendererSrc.includes("buildCard"));
assert.ok(rendererSrc.includes("mountArticleReading"));
assert.ok(!rendererSrc.includes("from(\"articles\")"), "renderer must not query articles");
assert.ok(!rendererSrc.includes(".insert("), "renderer must not write DB");

assert.ok(cmsSrc.includes("SBArticleRenderer"));
assert.ok(cmsSrc.includes("r.buildCard") || cmsSrc.includes(".buildCard("));
assert.ok(cmsSrc.includes("mountArticleReading"));
assert.ok(!/function buildCard\s*\(\s*a\s*,\s*listIndex[\s\S]{0,80}presentationMeta/.test(cmsSrc), "full card renderer must not live in cms-public");

assert.ok(adminSrc.includes("collectDraftArticle"));
assert.ok(adminSrc.includes("LYZ_ARTICLE_PREVIEW"));
assert.ok(adminSrc.includes("sendFrontendPreview"));
assert.ok(adminSrc.includes("renderChangesPanel"));
assert.ok(adminSrc.includes("buildSafetyWarnings"));

assert.ok(previewHtml.includes("LYZ_ARTICLE_PREVIEW"));
assert.ok(previewHtml.includes("article-renderer.js"));
assert.ok(previewHtml.includes("presentation-v3.css"));
assert.ok(!/href=["'][^"']*admin\.css/.test(previewHtml), "preview must not load admin.css");
assert.ok(!previewHtml.includes('from("articles")'));

// Execute renderer in a sandbox with stubs and compare card DOM for fixtures
function makeSandbox() {
  const document = {
    body: { classList: { add() {}, remove() {}, contains() { return false; } }, dataset: {} },
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(),
        className: "",
        style: {},
        attributes: {},
        children: [],
        innerHTML: "",
        textContent: "",
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        appendChild(c) { this.children.push(c); return c; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        addEventListener() {},
      };
      // minimal NodeList-ish for forEach on querySelectorAll of anchors after innerHTML set is hard;
      // buildCard sets innerHTML as string — enough for class/attr checks via attributes + className
      return el;
    },
  };
  const window = {
    document,
    SB: {
      escapeText(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      },
      renderMarkdown(md) {
        return "<p>" + this.escapeText(md).replace(/\n/g, "</p><p>") + "</p>";
      },
    },
    SBPresentation: {
      getPresentationMeta(a) {
        const key = (a && a.presentation) || "article-lite";
        return {
          key,
          listClass: "is-" + key,
          articleClass: "presentation-" + key,
          defaultShowTitle: true,
          defaultShowSummary: true,
          allowToc: key === "reference" || key === "longform",
          cardCta: "閱讀",
        };
      },
      showTitle(a) { return a.show_title !== false; },
      showSummary(a) { return !!a.show_summary; },
      effectiveVisibility() { return "public"; },
    },
    SBSections: {
      normalizeCategory(c) { return String(c || "").trim(); },
      displayCategory(c) { return String(c || "").trim(); },
    },
    SBArticleMedia: {
      resolveCoverDisplay() {
        return { style: "inline", ratio: "16/9", fit: "contain", position: "center center" };
      },
      enhanceMarkdownMedia() {},
    },
    location: { href: "https://example.test/" },
  };
  window.window = window;
  const ctx = { window, document, console };
  vm.createContext(ctx);
  vm.runInContext(rendererSrc, ctx);
  return ctx.window.SBArticleRenderer;
}

const R = makeSandbox();
assert.ok(R && typeof R.buildCard === "function");

const presentations = [
  "fragment",
  "photo-note",
  "article-lite",
  "longform",
  "review",
  "fiction",
  "poetry",
  "reference",
  "quote",
];

for (const p of presentations) {
  const a = {
    title: "Fixture " + p,
    slug: "fixture-" + p,
    section: "notes",
    summary: "summary",
    body: "Hello body for " + p + ".\n\nSecond paragraph.",
    category: p === "fiction" || p === "poetry" ? "創作" : "隨想",
    presentation: p,
    show_title: true,
    show_summary: true,
    published_at: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    cover: p === "photo-note" ? "https://example.test/cover.jpg" : null,
    images: p === "photo-note" ? [{ src: "https://example.test/a.jpg", caption: "" }] : [],
    ai_editorial: {
      display: {
        card_topic: "主題",
        card_label: "口語標籤",
        show_card_label: true,
      },
    },
  };
  const card = R.buildCard(a, 0);
  assert.equal(card.getAttribute("data-presentation"), p);
  assert.ok(String(card.className).includes("note-item"));
}

// Same fixture → identical card HTML when built twice (deterministic shared renderer)
const fixture = {
  title: "Shared",
  slug: "shared",
  section: "notes",
  summary: "s",
  body: "body",
  category: "隨想",
  presentation: "fragment",
  show_title: false,
  show_summary: false,
  published_at: "2026-08-01",
  ai_editorial: { display: { card_topic: "夢", card_label: "小廢文", show_card_label: true } },
};
const c1 = R.buildCard(fixture, 0);
const c2 = R.buildCard(fixture, 0);
assert.equal(c1.className, c2.className);
assert.equal(c1.innerHTML, c2.innerHTML);
assert.equal(c1.getAttribute("data-presentation"), "fragment");

console.log("shared renderer tests passed (" + presentations.length + " presentations)");
