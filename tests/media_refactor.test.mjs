/**
 * Smoke tests for article-media gallery merge heuristics (DOM-free string checks via file).
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const media = fs.readFileSync("assets/js/article-media.js", "utf8");
const cms = fs.readFileSync("assets/js/cms-public.js", "utf8");
const renderer = fs.readFileSync("assets/js/article-renderer.js", "utf8");
const css = fs.readFileSync("assets/css/site-custom.css", "utf8");

assert.ok(media.includes("mergeConsecutiveGalleries"));
assert.ok(media.includes("article-lightbox"));
assert.ok(media.includes("resolveCoverDisplay"));
assert.ok(renderer.includes("coverConfig"));
assert.ok(renderer.includes('style === "hero"'));
assert.ok(renderer.includes('style === "inline"'));
assert.ok(renderer.includes("cardMediaStrategy"));
assert.ok(renderer.includes("SBArticleMedia"));
assert.ok(cms.includes("SBArticleRenderer"));
assert.ok(cms.includes("mountArticleReading"));
assert.ok(cms.includes("buildCard"));
assert.ok(css.includes(".article-gallery"));
assert.ok(css.includes(".article-lightbox"));
assert.ok(css.includes(".article-cover-inline"));
assert.ok(css.includes("card-media-zone--editorial"));

console.log("all media refactor smoke tests passed");
