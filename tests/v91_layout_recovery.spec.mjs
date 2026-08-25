/**
 * V9.1 layout recovery regression tests.
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
  if (/\.(jpg|jpeg|png|svg|mp3|mp4)$/i.test(p)) {
    if (/\.jpe?g$/i.test(p)) return "image/jpeg";
    if (/\.png$/i.test(p)) return "image/png";
    return "application/octet-stream";
  }
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

async function shot(page, name) {
  await page.screenshot({ path: path.join(artifacts, name), fullPage: true });
}

// Directory hero
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}/directory.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".list-page-hero");
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const hero = document.querySelector(".list-page-hero");
    const title = document.querySelector(".list-page-hero__title");
    const body = document.querySelector(".list-page-hero__body");
    const heading = document.querySelector(".list-page-hero__heading");
    const hr = hero.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const hdr = heading.getBoundingClientRect();
    const bodyStyle = getComputedStyle(body);
    const datePseudo = !!document.querySelector(".list-page-hero .date, .list-page-hero header.major");
    const mainChildPad = getComputedStyle(hero).paddingTop;
    return {
      height: hr.height,
      titleLeft: tr.left,
      headingLeft: hdr.left,
      bodyLeft: br.left,
      bodyMarginLeft: bodyStyle.marginLeft,
      hasPostFeatured: !!document.querySelector("#main > article.post.featured"),
      datePseudo,
      gapAboveHero: hr.top - document.querySelector("#main").getBoundingClientRect().top,
      mainChildPad,
    };
  });
  assert.equal(d.hasPostFeatured, false, "must not use post.featured hero");
  assert.ok(d.height < 420, `hero height ${d.height}`);
  assert.ok(d.gapAboveHero < 8, `no huge blank above hero: ${d.gapAboveHero}`);
  assert.ok(Math.abs(d.titleLeft - d.headingLeft) < 4, "title/heading left");
  assert.ok(d.bodyLeft > d.titleLeft + 80, "asymmetric: body should sit to the right of title on desktop");
  assert.ok(d.bodyMarginLeft === "0px" || Number.parseFloat(d.bodyMarginLeft) < 1, "body not auto-centered");
  await shot(page, "v91-directory-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await shot(page, "v91-directory-390.png");
  await page.close();
}

// Literature
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}/literature.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".list-page-hero").count(), 1);
  assert.equal(await page.locator("#main > article.post.featured").count(), 0);
  await shot(page, "v91-literature-1440.png");
  await page.close();
}

// About
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}/about.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".about-profile__identity > h1");
  await page.waitForFunction(() => {
    const img = document.querySelector(".about-profile__media img");
    const profile = document.querySelector(".about-profile");
    return img && ((img.complete && img.naturalWidth > 0) || profile.classList.contains("media-failed"));
  });
  const a = await page.evaluate(() => {
    const img = document.querySelector(".about-profile__media img");
    const q = document.querySelector(".about-profile__quote");
    const title = document.querySelector(".about-profile__identity > h1");
    const body = document.querySelector(".about-profile__body");
    const updated = document.querySelector(".about-updated");
    const traj = document.querySelector(".about-trajectory > h2");
    const lefts = [updated, title, q, body, traj].map((el) => el.getBoundingClientRect().left);
    const ir = img.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const mediaRect = document.querySelector(".about-profile__media").getBoundingClientRect();
    return {
      naturalWidth: img.naturalWidth,
      imgW: ir.width,
      lefts,
      maxLeftDiff: Math.max(...lefts) - Math.min(...lefts),
      quotePre: !!q.querySelector("pre"),
      quoteCode: !!q.querySelector("code"),
      profileDisplay: getComputedStyle(document.querySelector(".about-profile")).display,
      bodyBelowMedia: bodyRect.top >= mediaRect.bottom - 8 || bodyRect.top >= document.querySelector(".about-profile__masthead").getBoundingClientRect().bottom - 2,
      mediaFailed: document.querySelector(".about-profile").classList.contains("media-failed"),
    };
  });
  assert.ok(a.naturalWidth > 0, "about image must load");
  assert.ok(a.imgW >= 160 && a.imgW <= 360, `avatar width ${a.imgW}`);
  assert.ok(a.maxLeftDiff <= 4, `left edges diff ${a.maxLeftDiff} lefts=${a.lefts}`);
  assert.equal(a.quotePre, false);
  assert.equal(a.profileDisplay, "block");
  assert.ok(a.bodyBelowMedia, "markdown body must not sit beside the avatar");
  await shot(page, "about-after-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await shot(page, "about-after-390.png");
  await page.close();
}

// Preview pipeline: same-origin harness page (not about:blank)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/tests/preview-harness.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const s = document.documentElement.getAttribute("data-preview");
      return s === "ok" || s === "fail";
    },
    null,
    { timeout: 10000 }
  );
  const state = await page.getAttribute("html", "data-preview");
  assert.equal(state, "ok", "preview direct API must render");
  const frame = page.frameLocator("#frontend-preview-frame");
  await frame.locator("text=TEST-PREVIEW-123").first().waitFor({ timeout: 3000 });
  await page.screenshot({ path: path.join(artifacts, "admin-preview-real-draft.png") });
  await page.close();
}

// Markdown normalizer
{
  const page = await browser.newPage();
  await page.goto(`${origin}/about.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.LYZNormalizeSiteCopyMarkdown === "function");
  const normalized = await page.evaluate(() => {
    const fn = window.LYZNormalizeSiteCopyMarkdown;
    const raw = "    月季花四季盛放\n    說起來，落花時節就是花開時節呢。\n";
    return fn(raw);
  });
  assert.ok(normalized);
  assert.ok(!normalized.startsWith(" "), "indent stripped");
  await page.close();
}

// Extra viewports
for (const [w, h, label] of [
  [1920, 1080, "1920"],
  [1024, 768, "1024"],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const name of ["index.html", "directory.html", "about.html"]) {
    await page.goto(`${origin}/${name}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    await shot(page, `v91-${name.replace(".html", "")}-${label}.png`);
  }
  await page.close();
}

await browser.close();
server.close();
console.log("v9.1 layout recovery tests passed");
