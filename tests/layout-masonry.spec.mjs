/**
 * V6.1 Masonry layout tests against live Pages (or LOCAL_BASE_URL).
 * Run: node tests/layout-masonry.spec.mjs
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
const bust = `m=${Date.now()}`;

let failed = 0;
function test(name, fn) {
  return fn()
    .then(() => console.log("✔", name))
    .catch((e) => {
      failed++;
      console.error("✘", name, e.message);
    });
}

/** Cluster left edges into columns (subpixel / scrollbar jitter). */
function clusterColumns(rects, tolerance = 24) {
  const xs = rects.map((r) => r.left).sort((a, b) => a - b);
  const centers = [];
  for (const x of xs) {
    const hit = centers.find((c) => Math.abs(c - x) <= tolerance);
    if (hit == null) centers.push(x);
  }
  return centers.sort((a, b) => a - b);
}

async function waitMasonry(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById("posts-container");
    if (!c) return false;
    const visible = Array.from(c.querySelectorAll("article.note-item")).some((el) => {
      if (el.hidden || el.style.display === "none") return false;
      return getComputedStyle(el).display !== "none";
    });
    return visible && c.classList.contains("masonry-ready") && c.classList.contains("masonry-active");
  }, { timeout: 45000 });
  // settle after fonts / image observers
  await page.waitForTimeout(400);
}

async function visibleRects(page) {
  return page.evaluate(() => {
    const container = document.getElementById("posts-container");
    const gapRaw = getComputedStyle(container).getPropertyValue("--masonry-gap").trim();
    let gap = parseFloat(gapRaw);
    if (!Number.isFinite(gap) || gapRaw.includes("clamp") || gapRaw.includes("var(")) {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;height:0;width:var(--masonry-gap);";
      container.appendChild(probe);
      gap = probe.offsetWidth || 16;
      probe.remove();
    } else if (/rem$/i.test(gapRaw)) {
      gap *= parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    }
    const cards = Array.from(container.querySelectorAll("article.note-item")).filter((el) => {
      if (el.style.display === "none" || el.hidden) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none";
    });
    const rects = cards.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    });
    const cr = container.getBoundingClientRect();
    return {
      gap,
      rects,
      containerBottom: cr.bottom,
      containerTop: cr.top,
      containerHeight: cr.height,
      masonry: container.classList.contains("masonry-active"),
      listView: container.classList.contains("list-view"),
    };
  });
}

function assertPackedColumns(m, label) {
  assert.ok(m.masonry, `${label}: masonry-active`);
  assert.ok(m.rects.length >= 4, `${label}: enough cards`);
  const cols = clusterColumns(m.rects);
  assert.equal(cols.length, 2, `${label}: unique columns=${cols.map((c) => Math.round(c))}`);

  const left = m.rects.filter((r) => Math.abs(r.left - cols[0]) < 24).sort((a, b) => a.top - b.top);
  const right = m.rects.filter((r) => Math.abs(r.left - cols[1]) < 24).sort((a, b) => a.top - b.top);
  assert.ok(left.length >= 1 && right.length >= 1, `${label}: both columns used`);

  for (const col of [left, right]) {
    for (let i = 1; i < col.length; i++) {
      assert.ok(col[i - 1].bottom <= col[i].top + 1, `${label}: no overlap in column`);
      const g = col[i].top - col[i - 1].bottom;
      assert.ok(Math.abs(g - m.gap) < 4, `${label}: gap ~${m.gap} got ${g}`);
    }
  }

  const maxBottom = Math.max(...m.rects.map((r) => r.bottom));
  assert.ok(Math.abs(m.containerBottom - maxBottom) < 8, `${label}: container height covers cards`);
}

const browser = await chromium.launch({ headless: true });

async function newPage(viewport) {
  return browser.newPage({
    viewport,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
}

await test("1440 masonry: two columns, no overlap, gap packing", async () => {
  const page = await newPage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMasonry(page);
  await page.evaluate(() => document.getElementById("posts-container")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  const m = await visibleRects(page);
  assertPackedColumns(m, "1440");
  await page.screenshot({ path: path.join(artifacts, "masonry-directory-1440.png") });
  await page.close();
});

await test("1600 masonry screenshot", async () => {
  const page = await newPage({ width: 1600, height: 900 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMasonry(page);
  await page.evaluate(() => document.getElementById("posts-container")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  const m = await visibleRects(page);
  assertPackedColumns(m, "1600");
  await page.screenshot({ path: path.join(artifacts, "masonry-directory-1600.png") });
  await page.close();
});

await test("1024 masonry still two columns", async () => {
  const page = await newPage({ width: 1024, height: 768 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMasonry(page);
  await page.evaluate(() => document.getElementById("posts-container")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  const m = await visibleRects(page);
  assert.equal(clusterColumns(m.rects).length, 2, "1024 still 2 cols");
  await page.screenshot({ path: path.join(artifacts, "masonry-directory-1024.png") });
  await page.close();
});

await test("390 mobile: single column flow, no absolute packing holes", async () => {
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => {
    const c = document.getElementById("posts-container");
    return c && Array.from(c.querySelectorAll("article.note-item")).some((el) => getComputedStyle(el).display !== "none");
  }, { timeout: 45000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.getElementById("posts-container")?.scrollIntoView({ block: "start" }));
  const m = await page.evaluate(() => {
    const container = document.getElementById("posts-container");
    const cards = Array.from(container.querySelectorAll("article.note-item")).filter(
      (el) => el.style.display !== "none" && getComputedStyle(el).display !== "none"
    );
    const rects = cards.slice(0, 4).map((el) => el.getBoundingClientRect());
    return {
      positions: cards.slice(0, 3).map((el) => getComputedStyle(el).position),
      stacked: rects.length < 2 || rects[1].top >= rects[0].bottom - 2,
      xs: clusterLocal(rects.map((r) => r.left)),
    };
    function clusterLocal(xs, tol = 24) {
      const centers = [];
      for (const x of [...xs].sort((a, b) => a - b)) {
        if (!centers.some((c) => Math.abs(c - x) <= tol)) centers.push(x);
      }
      return centers;
    }
  });
  assert.ok(m.stacked, "stacked vertically");
  assert.ok(m.xs.length === 1, "single column x");
  await page.screenshot({ path: path.join(artifacts, "masonry-directory-390.png") });
  await page.close();
});

await test("filter relayout packs from top without holes", async () => {
  const page = await newPage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMasonry(page);
  const before = await visibleRects(page);
  const options = await page.$$eval("#filter-category option", (opts) =>
    opts.map((o) => ({ value: o.value, text: o.textContent }))
  );
  const cat = options.find((o) => o.value && o.value !== "all");
  assert.ok(cat, "has a category option");
  await page.selectOption("#filter-category", cat.value);
  await page.waitForTimeout(800);
  await waitMasonry(page);
  const after = await visibleRects(page);
  assert.ok(after.rects.length >= 1, "filtered cards");
  assert.ok(after.rects.length <= before.rects.length, "filter reduced or equal");
  const minTop = Math.min(...after.rects.map((r) => r.top));
  assert.ok(Math.abs(minTop - after.containerTop) < 12, "packs from container top");
  // no leftover holes: columns still packed with ~gap
  if (after.rects.length >= 3) {
    assertPackedColumns(after, "filter");
  }
  await page.close();
});

await test("list-view destroys absolute masonry", async () => {
  const page = await newPage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMasonry(page);
  await page.selectOption("#sort-by", "list");
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const c = document.getElementById("posts-container");
    const card = Array.from(c.querySelectorAll("article.note-item")).find(
      (el) => el.style.display !== "none" && getComputedStyle(el).display !== "none"
    );
    const cs = card ? getComputedStyle(card) : null;
    return {
      list: c.classList.contains("list-view"),
      masonry: c.classList.contains("masonry-active"),
      position: cs && cs.position,
      height: c.style.height,
    };
  });
  assert.equal(m.list, true);
  assert.equal(m.masonry, false);
  assert.ok(m.position === "relative" || m.position === "static");
  await page.selectOption("#sort-by", "upload-desc");
  await waitMasonry(page);
  const again = await visibleRects(page);
  assert.equal(clusterColumns(again.rects).length, 2);
  await page.close();
});

await test("sort upload-asc repacks with DOM order", async () => {
  const page = await newPage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/directory.html?${bust}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMasonry(page);
  await page.selectOption("#sort-by", "upload-asc");
  await page.waitForTimeout(800);
  await waitMasonry(page);
  const order = await page.evaluate(() => {
    const c = document.getElementById("posts-container");
    return Array.from(c.querySelectorAll("article.note-item"))
      .filter((el) => el.style.display !== "none" && getComputedStyle(el).display !== "none")
      .map((el) => el.getAttribute("data-upload") || "");
  });
  const sorted = order.slice().sort((a, b) => new Date(a) - new Date(b));
  assert.deepEqual(order, sorted, "DOM upload-asc");
  const m = await visibleRects(page);
  assert.equal(clusterColumns(m.rects).length, 2);
  await page.close();
});

await browser.close();

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nAll masonry tests passed");
console.log("artifacts →", artifacts);
