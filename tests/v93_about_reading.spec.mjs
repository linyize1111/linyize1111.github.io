/**
 * V9.3 About: marked must load; stacked reading layout; real MD render.
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
  if (/\.jpe?g$/i.test(p)) return "image/jpeg";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const filePath = path.join(root, rel);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${origin}/about.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".about-profile__masthead");

const html = await page.content();
assert.ok(html.includes("marked/marked.min.js"), "about.html must load marked");

const layout = await page.evaluate(() => {
  const profile = document.querySelector(".about-profile");
  const masthead = document.querySelector(".about-profile__masthead");
  const body = document.querySelector(".about-profile__body");
  const media = document.querySelector(".about-profile__media");
  const ps = getComputedStyle(profile);
  const ms = getComputedStyle(masthead);
  const bs = getComputedStyle(body);
  const mediaRect = media.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  return {
    profileDisplay: ps.display,
    mastheadCols: ms.gridTemplateColumns,
    bodyMaxWidth: bs.maxWidth,
    bodyWidth: bodyRect.width,
    mediaWidth: mediaRect.width,
    bodyBelowMasthead: bodyRect.top >= masthead.getBoundingClientRect().bottom - 2,
    sideBySideBody: Math.abs(bodyRect.top - mediaRect.top) < 40 && bodyRect.right < mediaRect.left,
  };
});

assert.equal(layout.profileDisplay, "block");
assert.ok(layout.bodyBelowMasthead, "body must sit under masthead, not beside avatar");
assert.equal(layout.sideBySideBody, false);
assert.ok(layout.mediaWidth < 240, `avatar should be compact, got ${layout.mediaWidth}`);
assert.ok(layout.bodyWidth > 700, `body should use shell width, got ${layout.bodyWidth}`);

const md = await page.evaluate(() => {
  const hasMarked = typeof window.marked !== "undefined";
  const sample = [
    "歡迎認識一下我～",
    "",
    "**2004** / `INTP`",
    "",
    "> 最大的夢想之一",
    "",
    "## ▸ 動畫與漫畫",
    "",
    "1. 進擊的巨人",
    "2. 終將成為你",
  ].join("\n");
  const htmlOut = window.SB.renderMarkdown(sample);
  const wrap = document.createElement("div");
  wrap.className = "about-markdown";
  wrap.innerHTML = htmlOut;
  document.querySelector(".about-profile__body").replaceChildren(...wrap.childNodes);
  const body = document.querySelector(".about-profile__body");
  return {
    hasMarked,
    htmlHead: htmlOut.slice(0, 220),
    h2: !!body.querySelector("h2"),
    strong: !!body.querySelector("strong"),
    ol: !!body.querySelector("ol"),
    bq: !!body.querySelector("blockquote"),
    solePre: body.children.length === 1 && body.firstElementChild?.tagName === "PRE",
  };
});

assert.ok(md.hasMarked, "marked must be available on About");
assert.equal(md.solePre, false, "must not dump whole bio into <pre>");
assert.ok(md.h2 && md.strong && md.ol && md.bq, JSON.stringify(md));

await page.screenshot({ path: path.join(artifacts, "about-reading-1440.png"), fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(artifacts, "about-reading-390.png"), fullPage: false });

await browser.close();
server.close();
console.log("v9.3 about reading tests passed", { layout, md });
