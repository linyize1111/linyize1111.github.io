/**
 * V9 visual + preview acceptance (local static server).
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
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".mp4")) return "video/mp4";
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

// About layout
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${origin}/about.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const about = await page.evaluate(() => {
    const img = document.querySelector(".about-profile__media img");
    const st = img && getComputedStyle(img);
    const copy = document.querySelector(".about-profile__copy");
    return {
      hasGrid: !!document.querySelector(".about-profile"),
      objectFit: st && st.objectFit,
      width: st && st.width,
      height: st && st.height,
      copyAlign: copy && getComputedStyle(copy).textAlign,
      cards: document.querySelectorAll(".about-trajectory__card").length,
      no350: !document.body.innerHTML.includes("350px"),
    };
  });
  assert.equal(about.hasGrid, true);
  assert.equal(about.objectFit, "contain");
  assert.equal(about.cards, 4);
  assert.equal(about.no350, true);
  assert.equal(about.copyAlign, "left");
  await page.screenshot({ path: path.join(artifacts, "about-after-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, "about-after-390.png"), fullPage: true });
  await page.screenshot({ path: path.join(artifacts, "mobile-about-390.png"), fullPage: true });
  await page.close();
}

// Home / directory / literature
for (const [file, shot] of [
  ["index.html", "home-1440.png"],
  ["directory.html", "directory-1440.png"],
  ["literature.html", "literature-1440.png"],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${origin}/${file}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(artifacts, shot), fullPage: true });
  await page.close();
}

// Gallery not polluted by note legacy CSS
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.LYZAdminPreview, null, { timeout: 10000 });
  const svg = (w, h, n) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#3a6"/><text x="50%" y="50%" fill="#fff" font-size="28" text-anchor="middle" dy=".35em">${n}</text></svg>`
    );
  let body = "x\n\n";
  for (let i = 0; i < 3; i++) body += `![${i}](${svg(700 + i * 40, 500, i + 1)})\n\n`;
  await page.evaluate((b) => {
    window.LYZAdminPreview.render({
      mode: "article",
      draftVersion: 1,
      article: { title: "G3", body: b, presentation: "article-lite", section: "notes", status: "draft", show_title: true },
    });
  }, body);
  const g3 = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".article-gallery__item")];
    return {
      n: items.length,
      visible: items.filter((el) => el.offsetHeight > 0).length,
      maxH: items.map((el) => getComputedStyle(el.querySelector("img")).maxHeight),
    };
  });
  assert.equal(g3.visible, 3);
  assert.ok(g3.maxH.every((h) => h === "none" || h === "0px" || !h.includes("65")), "gallery imgs must not use 65vh legacy");
  await page.screenshot({ path: path.join(artifacts, "article-gallery-3.png"), fullPage: true });

  body = "x\n\n";
  for (let i = 0; i < 7; i++) body += `![${i}](${svg(600 + i * 30, 420 + (i % 3) * 80, i + 1)})\n\n`;
  await page.evaluate((b) => {
    window.LYZAdminPreview.render({
      mode: "article",
      draftVersion: 2,
      article: { title: "G7", body: b, presentation: "article-lite", section: "notes", status: "draft", show_title: true },
    });
  }, body);
  const g7 = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".article-gallery__item")];
    return { visible: items.filter((el) => el.offsetHeight > 0).length };
  });
  assert.equal(g7.visible, 7);
  await page.screenshot({ path: path.join(artifacts, "article-gallery-7.png"), fullPage: true });
  await page.close();
}

// Discord toast
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.goto(`${origin}/about.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  await page.locator("#nav .js-copy-id").click({ force: true });
  await page.waitForSelector("#site-toast.is-visible", { timeout: 5000 });
  const toast = await page.textContent("#site-toast");
  assert.match(toast, /已複製 Discord/);
  assert.match(toast, /lookin_her_eyes/);
  await page.close();
}

// Schema present
{
  assert.ok(fs.existsSync(path.join(root, "assets/js/site-copy-schema.js")));
  const schema = fs.readFileSync(path.join(root, "assets/js/site-copy-schema.js"), "utf8");
  assert.ok(schema.includes("about.trajectory.4.body"));
  assert.ok(schema.includes("LYZSiteCopySchema"));
}

// Mobile article shot from preview
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${origin}/admin-preview.html?fixture=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifacts, "mobile-article-390.png"), fullPage: true });
  await page.close();
}

await browser.close();
server.close();
console.log("v9 polish visual tests passed");
