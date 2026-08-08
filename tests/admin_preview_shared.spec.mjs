/**
 * Browser proof: admin-preview iframe uses the same SBArticleRenderer.buildCard
 * as a direct call (shared source of truth).
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.join(root, urlPath === "/" ? "admin-preview.html" : urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const fixture = {
  title: "Preview Shared Card",
  slug: "preview-shared-card",
  section: "notes",
  summary: "摘要測試",
  body: "這是一段正文。\n\n第二段。",
  category: "隨想",
  presentation: "fragment",
  show_title: false,
  show_summary: false,
  published_at: "2026-08-01T00:00:00Z",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  ai_editorial: {
    display: { card_topic: "夢", card_label: "長大後夢被枕頭悶殺了", show_card_label: true },
  },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SBArticleRenderer && window.SBArticleRenderer.buildCard);

const result = await page.evaluate(async (article) => {
  const R = window.SBArticleRenderer;
  const direct = R.buildCard(article, 0);
  // Simulate postMessage path
  const stage = document.getElementById("preview-stage");
  const empty = document.getElementById("preview-empty");
  empty.hidden = true;
  stage.hidden = false;
  R.renderCardInto(stage, article, 0);
  const viaHost = stage.querySelector("article.note-item");
  return {
    sameClass: direct.className === viaHost.className,
    samePresentation: viaHost.getAttribute("data-presentation") === "fragment",
    hasSemantic: viaHost.classList.contains("note-item--semantic"),
    label: (viaHost.querySelector(".note-card__label") || {}).textContent || "",
    topic: viaHost.getAttribute("data-card-topic") || "",
    rendererName: typeof R.buildCard,
  };
}, fixture);

assert.equal(result.rendererName, "function");
assert.equal(result.sameClass, true);
assert.equal(result.samePresentation, true);
assert.equal(result.hasSemantic, true);
assert.ok(result.label.includes("長大後") || result.topic === "夢");

await page.screenshot({ path: path.join(artifacts, "admin-preview-card-desktop.png") });

// Theme glass + mobile-ish article
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate((article) => {
  window.postMessage(
    {
      type: "LYZ_ARTICLE_PREVIEW",
      mode: "article",
      theme: "glass",
      readingFocus: false,
      article,
    },
    location.origin
  );
}, { ...fixture, presentation: "article-lite", show_title: true, title: "Glass Mobile Preview" });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(artifacts, "admin-preview-glass-mobile.png") });

await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate((article) => {
  window.postMessage(
    {
      type: "LYZ_ARTICLE_PREVIEW",
      mode: "article",
      theme: "glass",
      article,
    },
    location.origin
  );
}, { ...fixture, presentation: "longform", show_title: true, title: "Glass Desktop Preview", body: "# Hello\n\nLongform body.\n\n## Section\n\nMore." });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(artifacts, "admin-preview-glass-desktop.png") });

await browser.close();
server.close();
console.log("admin preview shared renderer browser tests passed");
console.log("artifacts →", artifacts);
