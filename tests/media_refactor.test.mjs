/**
 * Smoke tests for article-media gallery merge heuristics (DOM-free string checks via file).
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const media = fs.readFileSync("assets/js/article-media.js", "utf8");
const cms = fs.readFileSync("assets/js/cms-public.js", "utf8");
const renderer = fs.readFileSync("assets/js/article-renderer.js", "utf8");
const css = fs.readFileSync("assets/css/site-custom.css", "utf8");
const v3 = fs.readFileSync("assets/css/presentation-v3.css", "utf8");

assert.ok(media.includes("mergeConsecutiveGalleries"));
assert.ok(media.includes("article-lightbox"));
assert.ok(media.includes("resolveCoverDisplay"));
assert.ok(media.includes("article-gallery__item"));
assert.ok(media.includes("applyJustifiedLayout"));
assert.ok(media.includes("photo-note"));
assert.ok(renderer.includes("coverConfig"));
assert.ok(renderer.includes("Cover/hero above the article intentionally disabled"));
assert.ok(renderer.includes("a.cover) push(a.cover"));
assert.ok(renderer.includes("collectSlides"));
assert.ok(renderer.includes("cardMediaStrategy"));
assert.ok(renderer.includes("card-collage"));
assert.ok(renderer.includes("SBArticleMedia"));
assert.ok(cms.includes("SBArticleRenderer"));
assert.ok(cms.includes("mountArticleReading"));
assert.ok(cms.includes("buildCard"));
assert.ok(css.includes(".article-gallery"));
assert.ok(css.includes(".article-lightbox") || v3.includes(".article-lightbox"));
assert.ok(css.includes(".article-cover-inline"));
assert.ok(css.includes("card-media-zone--editorial"));
assert.ok(v3.includes("article-gallery--justified"));
assert.ok(v3.includes("card-collage"));

console.log("all media refactor smoke tests passed");
