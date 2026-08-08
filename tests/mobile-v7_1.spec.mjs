/**
 * V7.1 mobile regression: social icons, reading shell centering, control contrast.
 * Run: node tests/mobile-v7_1.spec.mjs
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
const bust = `v71=${Date.now()}`;

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("✔", name);
  } catch (e) {
    failed++;
    console.error("✘", name, e.message);
  }
}

function parseRgb(c) {
  const m = String(c || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function contrastish(a, b) {
  if (!a || !b) return 0;
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

async function withPage(theme, fn) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: theme === "light" ? "light" : "dark",
  });
  await page.addInitScript((t) => {
    localStorage.setItem("colorTheme", t);
  }, theme);
  try {
    await fn(page);
  } finally {
    await page.close();
    await browser.close();
  }
}

await test("common.js syntax", async () => {
  // smoke: file exists and contains social icon markup
  const src = fs.readFileSync(path.join(root, "assets/js/common.js"), "utf8");
  assert.ok(src.includes("mobile-social-link"));
  assert.ok(src.includes("icon brands fa-github"));
  assert.ok(src.includes("icon brands fa-instagram"));
  assert.ok(src.includes("icon fa-envelope"));
  assert.ok(src.includes('data-active'));
});

await test("390 glass: social icons + labels in menu", async () => {
  await withPage("glass", async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-nav-toggle", { timeout: 20000 });
    await page.click("#mobile-nav-toggle");
    await page.waitForSelector("#mobile-nav-sheet:not([hidden])");
    const info = await page.evaluate(() => {
      const links = [...document.querySelectorAll(".mobile-social-link")];
      return {
        count: links.length,
        icons: links.map((a) => !!a.querySelector(".icon, i")),
        texts: links.map((a) => (a.textContent || "").trim()),
        hrefs: links.map((a) => a.getAttribute("href")),
      };
    });
    assert.equal(info.count, 3);
    assert.ok(info.icons.every(Boolean), "each social has icon");
    assert.ok(info.texts.every((t) => t.length > 0), "accessible text");
    assert.ok(info.hrefs[0].includes("github.com/linyize1111"));
    assert.ok(info.hrefs[1].includes("instagram.com/linyize._.mcxi"));
    assert.ok(info.hrefs[2].startsWith("mailto:"));
    await page.screenshot({ path: path.join(artifacts, "mobile-nav-open-glass-390.png") });
  });
});

await test("390 light: social menu screenshot", async () => {
  await withPage("light", async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-nav-toggle", { timeout: 20000 });
    await page.click("#mobile-nav-toggle");
    await page.waitForSelector("#mobile-nav-sheet:not([hidden])");
    await page.screenshot({ path: path.join(artifacts, "mobile-nav-open-light-390.png") });
  });
});

await test("390 glass: controls contrast + active state", async () => {
  await withPage("glass", async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-controls-fab", { timeout: 20000 });
    await page.click("#mobile-controls-fab");
    await page.waitForSelector("#mobile-controls-popover:not([hidden])");
    const info = await page.evaluate(() => {
      const pop = document.getElementById("mobile-controls-popover");
      const btn = pop.querySelector("button");
      const pcs = getComputedStyle(pop);
      const bcs = getComputedStyle(btn);
      return {
        popBg: pcs.backgroundColor,
        btnBg: bcs.backgroundColor,
        btnColor: bcs.color,
        fabBg: getComputedStyle(document.getElementById("mobile-controls-fab")).backgroundColor,
        fabColor: getComputedStyle(document.getElementById("mobile-controls-fab")).color,
      };
    });
    const pop = parseRgb(info.popBg);
    const btnBg = parseRgb(info.btnBg);
    const btnColor = parseRgb(info.btnColor);
    assert.ok(contrastish(btnBg, btnColor) > 180, `btn contrast too low ${info.btnBg} / ${info.btnColor}`);
    assert.ok(contrastish(pop, btnColor) > 120, "popover text readable");
    assert.ok(contrastish(parseRgb(info.fabBg), parseRgb(info.fabColor)) > 180, "fab contrast");
    await page.screenshot({ path: path.join(artifacts, "mobile-controls-glass-390.png") });
  });
});

await test("390 light: controls stay dark overlay", async () => {
  await withPage("light", async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-controls-fab", { timeout: 20000 });
    await page.click("#mobile-controls-fab");
    await page.waitForSelector("#mobile-controls-popover:not([hidden])");
    const info = await page.evaluate(() => {
      const pop = document.getElementById("mobile-controls-popover");
      const btn = pop.querySelector("button");
      return {
        popBg: getComputedStyle(pop).backgroundColor,
        btnColor: getComputedStyle(btn).color,
        btnBg: getComputedStyle(btn).backgroundColor,
      };
    });
    const pop = parseRgb(info.popBg);
    assert.ok(pop && pop.r + pop.g + pop.b < 120, `popover should stay dark, got ${info.popBg}`);
    assert.ok(contrastish(parseRgb(info.btnBg), parseRgb(info.btnColor)) > 180);
    await page.screenshot({ path: path.join(artifacts, "mobile-controls-light-390.png") });
  });
});

await test("390 article: reading shell centered, body left, no overflow", async () => {
  await withPage("glass", async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("article.note-item a[href*='note.html']")).some((a) => {
        const art = a.closest("article");
        return art && getComputedStyle(art).display !== "none" && a.offsetParent !== null;
      });
    }, { timeout: 45000 });
    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("article.note-item a[href*='note.html']")).find((el) => {
        const art = el.closest("article");
        return art && getComputedStyle(art).display !== "none";
      });
      return a ? a.getAttribute("href") : null;
    });
    assert.ok(href);
    const url = href.startsWith("http")
      ? href
      : `${BASE}/${href.replace(/^\//, "")}${href.includes("?") ? "&" : "?"}${bust}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#markdown-container .markdown-body, #note-title", { timeout: 45000 });
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => {
      const md = document.getElementById("markdown-container");
      const body = document.querySelector("#markdown-container .markdown-body") || md;
      const p = body && body.querySelector("p");
      const mdRect = md.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const leftGutter = mdRect.left;
      const rightGutter = vw - mdRect.right;
      return {
        leftGutter,
        rightGutter,
        bodyAlign: body ? getComputedStyle(body).textAlign : null,
        pAlign: p ? getComputedStyle(p).textAlign : null,
        overflowOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    });
    assert.ok(Math.abs(info.leftGutter - info.rightGutter) <= 6, `gutter asymmetry ${info.leftGutter}/${info.rightGutter}`);
    assert.ok(info.leftGutter >= 10 && info.leftGutter <= 24, `left gutter ${info.leftGutter}`);
    assert.ok(["left", "start"].includes(info.bodyAlign) || info.bodyAlign === "start");
    if (info.pAlign) assert.ok(["left", "start"].includes(info.pAlign), `p align ${info.pAlign}`);
    assert.ok(info.overflowOk, "horizontal overflow");
    await page.screenshot({ path: path.join(artifacts, "mobile-article-390.png") });
  });
});

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nAll V7.1 mobile regression tests passed");
console.log("artifacts →", artifacts);
