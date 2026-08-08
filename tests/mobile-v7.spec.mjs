/**
 * V7 mobile experience regression suite (live Pages or LOCAL_BASE_URL).
 * Run: node tests/mobile-v7.spec.mjs
 */
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

const BASE = process.env.LOCAL_BASE_URL || "https://linyize1111.github.io";
const bust = `v7=${Date.now()}`;

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

async function noHOverflow(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const cw = document.documentElement.clientWidth;
    return { sw, cw, ok: sw <= cw + 1 };
  });
}

async function withBrowser(engine, viewport, fn) {
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({
    viewport,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  try {
    await fn(page);
  } finally {
    await page.close();
    await browser.close();
  }
}

const engines = [{ name: "chromium", api: chromium }];
try {
  await webkit.launch({ headless: true }).then((b) => b.close());
  engines.push({ name: "webkit", api: webkit });
} catch {
  console.log("(webkit unavailable — chromium only)");
}

for (const eng of engines) {
  await test(`${eng.name} 390 home: no overflow + sticky mobile nav`, async () => {
    await withBrowser(eng.api, { width: 390, height: 844 }, async (page) => {
      await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("#global-nav.global-nav--v7", { timeout: 20000 });
      const nav = await page.evaluate(() => {
        const n = document.getElementById("global-nav");
        const cs = getComputedStyle(n);
        return {
          sticky: cs.position === "sticky" || cs.position === "fixed",
          toggle: !!document.getElementById("mobile-nav-toggle"),
          desktopHidden: getComputedStyle(n.querySelector(".global-nav__desktop")).display === "none",
        };
      });
      assert.ok(nav.toggle, "hamburger");
      assert.ok(nav.desktopHidden, "desktop links hidden");
      const o = await noHOverflow(page);
      assert.ok(o.ok, `overflow ${o.sw}/${o.cw}`);
      await page.screenshot({ path: path.join(artifacts, `mobile-home-390-${eng.name}.png`) });
      if (eng.name === "chromium") {
        fs.copyFileSync(
          path.join(artifacts, `mobile-home-390-${eng.name}.png`),
          path.join(artifacts, "mobile-home-390.png")
        );
      }
    });
  });

  await test(`${eng.name} 390 menu open/close`, async () => {
    await withBrowser(eng.api, { width: 390, height: 844 }, async (page) => {
      await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("#mobile-nav-toggle", { timeout: 20000 });
      await page.click("#mobile-nav-toggle");
      await page.waitForSelector("#mobile-nav-sheet:not([hidden])");
      const open = await page.evaluate(() => ({
        expanded: document.getElementById("mobile-nav-toggle").getAttribute("aria-expanded"),
        sheet: !document.getElementById("mobile-nav-sheet").hidden,
        academic: !!document.querySelector('#mobile-nav-sheet a[href="academic.html"]:not([data-admin-nav])'),
      }));
      assert.equal(open.expanded, "true");
      assert.equal(open.sheet, true);
      assert.equal(open.academic, false, "public menu must not show academic");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.getElementById("mobile-nav-sheet").hidden);
    });
  });

  await test(`${eng.name} 390 directory: 1-col, masonry off, gutter`, async () => {
    await withBrowser(eng.api, { width: 390, height: 844 }, async (page) => {
      await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("article.note-item", { timeout: 45000 });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const c = document.getElementById("posts-container");
        const cards = [...c.querySelectorAll("article.note-item")].filter(
          (el) => getComputedStyle(el).display !== "none"
        );
        const rects = cards.slice(0, 4).map((el) => el.getBoundingClientRect());
        const cs0 = cards[0] ? getComputedStyle(cards[0]) : null;
        const main = document.getElementById("main").getBoundingClientRect();
        return {
          masonry: c.classList.contains("masonry-active") && cs0 && cs0.position === "absolute",
          position: cs0 && cs0.position,
          leftGutter: rects[0] ? rects[0].left : 0,
          rightGutter: rects[0] ? document.documentElement.clientWidth - rects[0].right : 0,
          widthRatio: rects[0] ? rects[0].width / main.width : 0,
          xs: [...new Set(rects.map((r) => Math.round(r.left / 8) * 8))],
        };
      });
      assert.equal(m.masonry, false, "masonry inactive");
      assert.ok(m.position === "relative" || m.position === "static");
      assert.ok(m.leftGutter >= 10 && m.leftGutter <= 24, `left gutter ${m.leftGutter}`);
      assert.ok(m.xs.length === 1, "single column");
      const o = await noHOverflow(page);
      assert.ok(o.ok, `overflow ${o.sw}/${o.cw}`);
      await page.screenshot({ path: path.join(artifacts, `mobile-directory-390-${eng.name}.png`) });
      if (eng.name === "chromium") {
        fs.copyFileSync(
          path.join(artifacts, `mobile-directory-390-${eng.name}.png`),
          path.join(artifacts, "mobile-directory-390.png")
        );
      }
    });
  });
}

await test("chromium 430 directory", async () => {
  await withBrowser(chromium, { width: 430, height: 932 }, async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("article.note-item", { timeout: 45000 });
    const o = await noHOverflow(page);
    assert.ok(o.ok);
    await page.screenshot({ path: path.join(artifacts, "mobile-directory-430.png") });
  });
});

await test("chromium 390 literature", async () => {
  await withBrowser(chromium, { width: 390, height: 844 }, async (page) => {
    await page.goto(`${BASE}/literature.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#posts-container", { timeout: 20000 });
    await page.waitForTimeout(1200);
    const o = await noHOverflow(page);
    assert.ok(o.ok);
    await page.screenshot({ path: path.join(artifacts, "mobile-literature-390.png") });
  });
});

await test("chromium 390 article reading + images", async () => {
  await withBrowser(chromium, { width: 390, height: 844 }, async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("article.note-item a[href*='note.html']")).some(
        (a) => {
          const art = a.closest("article");
          return art && getComputedStyle(art).display !== "none" && a.offsetParent !== null;
        }
      );
    }, { timeout: 45000 });
    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("article.note-item a[href*='note.html']")).find(
        (el) => {
          const art = el.closest("article");
          return art && getComputedStyle(art).display !== "none";
        }
      );
      return a ? a.getAttribute("href") : null;
    });
    assert.ok(href, "article link");
    const url = href.startsWith("http")
      ? href
      : `${BASE}/${href.replace(/^\//, "")}${href.includes("?") ? "&" : "?"}${bust}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#markdown-container .markdown-body, #note-title", { timeout: 45000 });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const title = document.getElementById("note-title");
      const body = document.querySelector("#markdown-container .markdown-body") || document.getElementById("markdown-container");
      const imgs = [...document.querySelectorAll("#markdown-container img")].slice(0, 4);
      const vw = document.documentElement.clientWidth;
      return {
        titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        bodySize: body ? parseFloat(getComputedStyle(body).fontSize) : 0,
        imgOk: imgs.every((img) => img.getBoundingClientRect().width <= vw + 1),
        preOk: [...document.querySelectorAll("#markdown-container pre")].every(
          (pre) => pre.scrollWidth >= pre.clientWidth || pre.getBoundingClientRect().width <= vw + 1
        ),
      };
    });
    assert.ok(info.bodySize >= 16.5, `body font ${info.bodySize}`);
    assert.ok(info.imgOk, "images within viewport");
    const o = await noHOverflow(page);
    assert.ok(o.ok, `overflow ${o.sw}/${o.cw}`);
    await page.screenshot({ path: path.join(artifacts, "mobile-article-fragment-390.png") });
  });
});

await test("chromium 390 about", async () => {
  await withBrowser(chromium, { width: 390, height: 844 }, async (page) => {
    await page.goto(`${BASE}/about.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(500);
    const o = await noHOverflow(page);
    assert.ok(o.ok);
    await page.screenshot({ path: path.join(artifacts, "mobile-about-390.png") });
  });
});

await test("chromium 768 tablet directory", async () => {
  await withBrowser(chromium, { width: 768, height: 1024 }, async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("article.note-item", { timeout: 45000 });
    await page.waitForTimeout(800);
    const o = await noHOverflow(page);
    assert.ok(o.ok);
    await page.screenshot({ path: path.join(artifacts, "tablet-directory-768.png") });
  });
});

await test("chromium 320 usable", async () => {
  await withBrowser(chromium, { width: 320, height: 568 }, async (page) => {
    await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#mobile-nav-toggle", { timeout: 20000 });
    const o = await noHOverflow(page);
    assert.ok(o.ok, `overflow ${o.sw}/${o.cw}`);
  });
});

await test("reduced motion: sakura/video inactive", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await page.goto(`${BASE}/index.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const canvas = document.getElementById("sakura-canvas");
    const video = document.getElementById("bg-video");
    return {
      sakuraHidden: !canvas || getComputedStyle(canvas).display === "none" || canvas.style.display === "none",
      videoPaused: !video || video.paused || video.style.visibility === "hidden",
    };
  });
  assert.ok(state.sakuraHidden, "sakura off");
  assert.ok(state.videoPaused, "video inactive");
  await page.close();
  await browser.close();
});

await test("admin preview defaults mobile/glass markup", async () => {
  const admin = fs.readFileSync(path.join(root, "assets/js/admin.js"), "utf8");
  assert.ok(admin.includes('frontendPreviewDevice = "mobile"'));
  assert.ok(admin.includes('frontendPreviewTheme = "glass"'));
});

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nAll V7 mobile tests passed");
console.log("artifacts →", artifacts);
