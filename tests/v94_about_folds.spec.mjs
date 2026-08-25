/**
 * V9.4 About: wider shell usage + collapsed ## folds.
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
await page.waitForFunction(() => typeof window.LYZEnhanceAboutMarkdownFolds === "function");
await page.waitForSelector(".about-profile__body");

const sample = [
  "歡迎駐足。",
  "",
  "**2004** / `INTP`",
  "",
  "---",
  "",
  "## ▸ 動畫與漫畫",
  "",
  "動畫是高中才正式入坑的。",
  "",
  "1. 進擊的巨人",
  "",
  "---",
  "",
  "## ▸ 遊戲",
  "",
  "大學以前花最多時間的應該是《傳說對決》，現在主要玩：",
  "",
  "Valorant / LOL ARAM / 各種 Steam 遊戲",
  "",
  "歡迎直接找我打遊戲，我不氣氛的。",
  "",
  "---",
  "",
  "## ▸ 關於我",
  "",
  "這段應排到主題最上方。",
].join("\n");

const result = await page.evaluate((md) => {
  const body = document.querySelector(".about-profile__body");
  body.innerHTML = window.SB.renderMarkdown(md);
  body.removeAttribute("data-folds-ready");
  window.LYZEnhanceAboutMarkdownFolds(body);
  const folds = [...body.querySelectorAll("details.about-fold")];
  const titles = folds.map((d) => d.querySelector("h2")?.textContent?.trim() || "");
  const game = folds.find((d) => d.textContent.includes("遊戲"));
  const beforeOpen = game ? game.open : null;
  if (game) game.open = true;
  const pageW = document.querySelector(".about-page").getBoundingClientRect().width;
  const mainW = document.getElementById("main").getBoundingClientRect().width;
  const foldStyles = folds.map((d) => getComputedStyle(d).gridColumn);
  return {
    foldCount: folds.length,
    titles,
    firstTitle: titles[0] || "",
    allClosedInitially: folds.every((d) => d.open === false) || beforeOpen === false,
    gameWasClosed: beforeOpen === false,
    gamePanelText: game?.querySelector(".about-fold__panel")?.textContent || "",
    hasPreamble: !!body.querySelector(":scope > p"),
    pageW,
    mainW,
    fillRatio: pageW / mainW,
    singleColumn: foldStyles.every((c) => c === "auto" || c === "1" || !c.includes("/")),
  };
}, sample);

assert.ok(result.foldCount >= 3, `expected folds, got ${result.foldCount}`);
assert.match(result.firstTitle, /關於我/);
assert.equal(result.gameWasClosed, true);
assert.ok(result.gamePanelText.includes("傳說對決"));
assert.ok(result.gamePanelText.includes("Valorant"));
assert.ok(result.hasPreamble);
assert.ok(result.fillRatio > 0.85, `page should fill main shell, ratio=${result.fillRatio}`);
assert.ok(result.singleColumn, "topics should stay single-column");

await page.screenshot({ path: path.join(artifacts, "about-folds-1440.png"), fullPage: false });

// v93 layout still: body under masthead
const layout = await page.evaluate(() => {
  const body = document.querySelector(".about-profile__body");
  const mast = document.querySelector(".about-profile__masthead");
  return body.getBoundingClientRect().top >= mast.getBoundingClientRect().bottom - 2;
});
assert.ok(layout);

await browser.close();
server.close();
console.log("v9.4 about folds tests passed", result);
