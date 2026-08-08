/**
 * V7.2 desktop / mobile navigation isolation regression.
 * Run: node tests/navigation-desktop-v7_2.spec.mjs
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
const bust = `v72=${Date.now()}`;

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

async function withPage(viewport, fn) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport, colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("colorTheme", "glass"));
  try {
    await fn(page);
  } finally {
    await page.close();
    await browser.close();
  }
}

function visible(cs) {
  return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) > 0;
}

await test("1440: desktop nav visible, mobile hidden, in viewport", async () => {
  await withPage({ width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#desktop-global-nav a", { timeout: 20000 });
    const info = await page.evaluate(() => {
      const d = document.getElementById("desktop-global-nav");
      const m = document.getElementById("mobile-global-nav");
      const dcs = getComputedStyle(d);
      const mcs = m ? getComputedStyle(m) : null;
      const rect = d.getBoundingClientRect();
      const links = [...d.querySelectorAll("a")].map((a) => {
        const cs = getComputedStyle(a);
        const r = a.getBoundingClientRect();
        return {
          text: a.textContent.trim(),
          display: cs.display,
          visibility: cs.visibility,
          opacity: Number(cs.opacity),
          w: r.width,
          h: r.height,
        };
      });
      return {
        desktopDisplay: dcs.display,
        mobileDisplay: mcs ? mcs.display : "none",
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        vw: window.innerWidth,
        vh: window.innerHeight,
        links,
      };
    });
    assert.notEqual(info.desktopDisplay, "none", "desktop visible");
    assert.equal(info.mobileDisplay, "none", "mobile hidden");
    assert.ok(info.top >= 0, `top ${info.top}`);
    assert.ok(info.left >= 0, `left ${info.left}`);
    assert.ok(info.right <= info.vw + 1, `right ${info.right}/${info.vw}`);
    assert.ok(info.bottom <= info.vh + 1, `bottom ${info.bottom}/${info.vh}`);
    assert.ok(info.links.length >= 4, "primary links");
    for (const link of info.links) {
      assert.notEqual(link.display, "none", link.text);
      assert.notEqual(link.visibility, "hidden", link.text);
      assert.ok(link.opacity > 0, link.text);
      assert.ok(link.w > 0 && link.h > 0, link.text);
    }
    await page.screenshot({ path: path.join(artifacts, "desktop-home-1440.png") });
  });
});

await test("1920 home screenshot", async () => {
  await withPage({ width: 1920, height: 1080 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#desktop-global-nav a", { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifacts, "desktop-home-1920.png") });
  });
});

await test("1440 directory screenshot", async () => {
  await withPage({ width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#desktop-global-nav a", { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(artifacts, "desktop-directory-1440.png") });
  });
});

await test("1024 home screenshot", async () => {
  await withPage({ width: 1024, height: 768 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#desktop-global-nav a", { timeout: 20000 });
    const info = await page.evaluate(() => ({
      desktop: getComputedStyle(document.getElementById("desktop-global-nav")).display,
      mobile: getComputedStyle(document.getElementById("mobile-global-nav")).display,
    }));
    assert.notEqual(info.desktop, "none");
    assert.equal(info.mobile, "none");
    await page.screenshot({ path: path.join(artifacts, "desktop-home-1024.png") });
  });
});

await test("legacy #nav links+icons layout at 1440", async () => {
  await withPage({ width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#nav", { timeout: 20000 });
    const info = await page.evaluate(() => {
      const nav = document.getElementById("nav");
      const links = nav.querySelector("ul.links");
      const icons = nav.querySelector("ul.icons");
      const ncs = getComputedStyle(nav);
      const lcs = getComputedStyle(links);
      const ics = getComputedStyle(icons);
      const lr = links.getBoundingClientRect();
      const ir = icons.getBoundingClientRect();
      const overlap = !(lr.right <= ir.left + 1 || ir.right <= lr.left + 1 || lr.bottom <= ir.top + 1 || ir.bottom <= lr.top + 1);
      return {
        navDisplay: ncs.display,
        linksDisplay: lcs.display,
        iconsDisplay: ics.display,
        linksRight: lr.right,
        iconsLeft: ir.left,
        overlap,
        iconCount: icons.querySelectorAll("a.icon").length,
        linkCount: links.querySelectorAll("a").length,
      };
    });
    assert.notEqual(info.navDisplay, "none");
    assert.notEqual(info.linksDisplay, "none");
    assert.notEqual(info.iconsDisplay, "none");
    assert.ok(info.linkCount >= 4, "legacy links");
    assert.ok(info.iconCount >= 4, "legacy icons");
    assert.ok(info.iconsLeft + 1 >= info.linksRight, `icons should be right of links ${info.linksRight}/${info.iconsLeft}`);
    assert.equal(info.overlap, false, "links/icons must not overlap");
  });
});

await test("breakpoint 900 mobile / 901 desktop exclusive", async () => {
  await withPage({ width: 900, height: 800 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-global-nav", { timeout: 20000 });
    let info = await page.evaluate(() => ({
      desktop: getComputedStyle(document.getElementById("desktop-global-nav")).display,
      mobile: getComputedStyle(document.getElementById("mobile-global-nav")).display,
      toggle: !!document.getElementById("mobile-nav-toggle"),
    }));
    assert.equal(info.desktop, "none", "900 desktop hidden");
    assert.notEqual(info.mobile, "none", "900 mobile visible");
    assert.ok(info.toggle);

    await page.setViewportSize({ width: 901, height: 800 });
    await page.waitForTimeout(200);
    info = await page.evaluate(() => ({
      desktop: getComputedStyle(document.getElementById("desktop-global-nav")).display,
      mobile: getComputedStyle(document.getElementById("mobile-global-nav")).display,
    }));
    assert.notEqual(info.desktop, "none", "901 desktop visible");
    assert.equal(info.mobile, "none", "901 mobile hidden");
  });
});

await test("intermediate widths neither both-on nor both-off", async () => {
  const widths = [960, 1100, 1280, 1600];
  await withPage({ width: 960, height: 800 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#desktop-global-nav, #mobile-global-nav", { timeout: 20000 });
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(120);
      const info = await page.evaluate(() => {
        const d = getComputedStyle(document.getElementById("desktop-global-nav")).display !== "none";
        const m = getComputedStyle(document.getElementById("mobile-global-nav")).display !== "none";
        return { d, m };
      });
      assert.notEqual(info.d && info.m, true, `${w} both visible`);
      assert.notEqual(!info.d && !info.m, true, `${w} both hidden`);
      assert.equal(info.d, true, `${w} expect desktop`);
      assert.equal(info.m, false, `${w} expect mobile hidden`);
    }
  });
});

await test("390 mobile home screenshot still ok", async () => {
  await withPage({ width: 390, height: 844 }, async (page) => {
    await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-nav-toggle", { timeout: 20000 });
    const info = await page.evaluate(() => ({
      desktop: getComputedStyle(document.getElementById("desktop-global-nav")).display,
      mobile: getComputedStyle(document.getElementById("mobile-global-nav")).display,
      overflowOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    }));
    assert.equal(info.desktop, "none");
    assert.notEqual(info.mobile, "none");
    assert.ok(info.overflowOk);
    await page.screenshot({ path: path.join(artifacts, "mobile-home-390.png") });
  });
});

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nAll V7.2 desktop navigation tests passed");
console.log("artifacts →", artifacts);
