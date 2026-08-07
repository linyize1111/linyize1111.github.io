/**
 * V6 layout tests — real browser geometry against live GitHub Pages
 * (or LOCAL_BASE_URL). Requires: npx playwright install chromium
 *
 * Run: node tests/layout-v6.spec.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

const BASE = process.env.LOCAL_BASE_URL || "https://linyize1111.github.io";
const bust = `v6=${Date.now()}`;

let failed = 0;
function test(name, fn) {
  return fn()
    .then(() => console.log("✔", name))
    .catch((e) => {
      failed++;
      console.error("✘", name, e.message);
    });
}

const browser = await chromium.launch({ headless: true });

await test("1440 directory: 2-col grid, equal cards, balanced gutters", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("article.note-item", { timeout: 45000 });
  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const container = document.getElementById("posts-container");
    const cards = Array.from(container.querySelectorAll("article.note-item")).filter(
      (el) => el.offsetParent !== null && getComputedStyle(el).display !== "none"
    );
    const cs = getComputedStyle(container);
    const c1 = cards[0]?.getBoundingClientRect();
    const c2 = cards[1]?.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    return {
      display: cs.display,
      cols: cs.gridTemplateColumns,
      maxW0: cards[0] ? getComputedStyle(cards[0]).maxWidth : null,
      c1: c1 ? { top: c1.top, left: c1.left, width: c1.width, right: c1.right } : null,
      c2: c2 ? { top: c2.top, left: c2.left, width: c2.width, right: c2.right } : null,
      cr: { left: cr.left, right: cr.right, width: cr.width },
      html: document.documentElement.outerHTML.slice(0, 5000),
      academicInNav: !!document.querySelector('#global-nav a[href="academic.html"]'),
      academicInSource: /academic\.html/.test(document.documentElement.outerHTML) &&
        /學科筆記/.test(document.documentElement.outerHTML),
      genericLabel: Array.from(document.querySelectorAll(".note-card__label, .note-card__content")).some(
        (el) => (el.textContent || "").trim() === "一則小廢文"
      ),
      cardCount: cards.length,
    };
  });

  await page.screenshot({ path: path.join(artifacts, "v6-directory-1440.png"), fullPage: false });

  assert.equal(metrics.display, "grid", `display=${metrics.display}`);
  assert.ok((metrics.cols || "").split(" ").filter(Boolean).length >= 2, `cols=${metrics.cols}`);
  assert.ok(metrics.cardCount >= 2, "need ≥2 visible cards");
  assert.ok(metrics.c1 && metrics.c2, "two cards");
  assert.ok(Math.abs(metrics.c1.top - metrics.c2.top) < 5, `same row tops ${metrics.c1.top} vs ${metrics.c2.top}`);
  assert.ok(Math.abs(metrics.c1.width - metrics.c2.width) < 10, `equal width ${metrics.c1.width} vs ${metrics.c2.width}`);
  const left = metrics.c1.left - metrics.cr.left;
  const right = metrics.cr.right - metrics.c2.right;
  assert.ok(Math.abs(left - right) < 24, `gutters L=${left} R=${right}`);
  assert.ok(!metrics.maxW0 || metrics.maxW0 === "none" || parseFloat(metrics.maxW0) > 600, `maxWidth=${metrics.maxW0}`);
  assert.equal(metrics.academicInNav, false, "public nav must not show academic");
  assert.equal(metrics.genericLabel, false, "must not show 一則小廢文");

  await page.close();
});

await test("390 directory: single column, no horizontal overflow", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("article.note-item", { timeout: 45000 });
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const container = document.getElementById("posts-container");
    const cs = getComputedStyle(container);
    const cards = Array.from(container.querySelectorAll("article.note-item")).filter(
      (el) => el.offsetParent !== null && getComputedStyle(el).display !== "none"
    );
    const c1 = cards[0]?.getBoundingClientRect();
    const c2 = cards[1]?.getBoundingClientRect();
    return {
      display: cs.display,
      cols: cs.gridTemplateColumns,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      stacked: c1 && c2 ? c2.top > c1.bottom - 2 : true,
    };
  });
  await page.screenshot({ path: path.join(artifacts, "v6-directory-390.png"), fullPage: false });
  assert.equal(m.overflowX, false, "no horizontal overflow");
  assert.ok(m.stacked, "cards stacked on mobile");
  await page.close();
});

await test("glass article: no forced reading-focus on first paint", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem("colorTheme", "glass");
    localStorage.setItem("readingFocus", "false");
  });
  // pick a public note from directory
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("article.note-item a", { timeout: 45000 });
  const href = await page.evaluate(() => {
    const a = document.querySelector("article.note-item a[href*='note.html']");
    return a ? a.getAttribute("href") : null;
  });
  assert.ok(href, "need article link");
  await page.goto(`${BASE}/${href.replace(/^\//, "")}${href.includes("?") ? "&" : "?"}${bust}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    focus: document.body.classList.contains("reading-focus"),
    bgVisible: (() => {
      const v = document.getElementById("bg-video");
      if (!v) return true;
      const cs = getComputedStyle(v);
      return cs.visibility !== "hidden" && cs.opacity !== "0";
    })(),
  }));
  await page.screenshot({ path: path.join(artifacts, "v6-article-glass.png"), fullPage: false });
  assert.equal(state.theme, "glass");
  assert.equal(state.focus, false);
  assert.equal(state.bgVisible, true);
  await page.close();
});

await test("anon smoke: private academic rows not in public HTML source of directory", async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "networkidle", timeout: 60000 });
  const html = await page.content();
  assert.ok(!/學科筆記/.test(html), "raw HTML must not advertise 學科筆記");
  // common private academic titles should not appear as static markup before JS;
  // after JS, public list should still not include private visibility rows.
  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("article.note-item")).map((el) => el.getAttribute("data-title") || "")
  );
  for (const t of titles) {
    assert.ok(!/資訊安全入門|機器學習筆記|Python 私密/.test(t), `leaked title? ${t}`);
  }
  await page.close();
});

await browser.close();

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nAll V6 layout tests passed");
console.log("artifacts →", artifacts);
