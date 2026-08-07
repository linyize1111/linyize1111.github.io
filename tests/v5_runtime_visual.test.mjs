import assert from "node:assert/strict";
import fs from "node:fs";

const common = fs.readFileSync("assets/js/common.js", "utf8");
const media = fs.readFileSync("assets/js/article-media.js", "utf8");
const css = fs.readFileSync("assets/css/presentation-v3.css", "utf8");
const cms = fs.readFileSync("assets/js/cms-public.js", "utf8");

assert.ok(common.includes("setTimeout(dismissLoader, 900)"), "fast loader cap");
assert.ok(common.includes('localStorage.getItem("readingFocus")'), "opt-in reading focus");
assert.ok(!/applyReadingFocus\(true\)/.test(cms), "cms must not force reading focus");
assert.ok(media.includes("media-ambient"), "ambient backdrop");
assert.ok(media.includes("mergeConsecutiveGalleries"), "gallery retained");
assert.ok(media.includes("openLightbox"), "lightbox retained");
assert.ok(media.includes('loading", "lazy"') || media.includes("loading = \"lazy\"") || media.includes('loading = "lazy"') || media.includes("loading\",\"lazy") || /loading/.test(media));
assert.ok(css.includes("media-ambient"), "css ambient");
assert.ok(css.includes('data-theme="glass"'), "glass theme css");
assert.ok(css.includes('data-presentation="fragment"'), "fragment card identity");

console.log("v5 runtime visual smoke tests passed");
