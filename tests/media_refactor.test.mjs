/**
 * Smoke tests for article-media gallery merge heuristics (DOM-free string checks via file).
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const media = fs.readFileSync("assets/js/article-media.js", "utf8");
const cms = fs.readFileSync("assets/js/cms-public.js", "utf8");
const css = fs.readFileSync("assets/css/site-custom.css", "utf8");

assert.ok(media.includes("mergeConsecutiveGalleries"));
assert.ok(media.includes("article-lightbox"));
assert.ok(media.includes("resolveCoverDisplay"));
assert.ok(cms.includes("coverConfig"));
assert.ok(cms.includes('style === "hero"'));
assert.ok(cms.includes('style === "inline"'));
assert.ok(cms.includes("cardMediaStrategy"));
assert.ok(cms.includes("SBArticleMedia"));
assert.ok(css.includes(".article-gallery"));
assert.ok(css.includes(".article-lightbox"));
assert.ok(css.includes(".article-cover-inline"));
assert.ok(css.includes("card-media-zone--editorial"));

console.log("all media refactor smoke tests passed");
