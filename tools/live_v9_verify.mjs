import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const artifacts = "artifacts";
fs.mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

await page.goto("https://linyize1111.github.io/about.html", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1800);
const about = await page.evaluate(() => {
  const img = document.querySelector(".about-profile__media img");
  const st = img && getComputedStyle(img);
  const link = document.querySelector('link[href*="site-custom"]');
  return {
    hasProfile: !!document.querySelector(".about-profile"),
    fit: st && st.objectFit,
    cards: document.querySelectorAll(".about-trajectory__card").length,
    css: link && link.href,
  };
});
console.log("LIVE_ABOUT", about);
await page.screenshot({ path: path.join(artifacts, "live-about-1440.png"), fullPage: true });

await page.goto("https://linyize1111.github.io/admin-preview.html?fixture=1", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1500);
const prev = await page.evaluate(() => ({
  api: !!window.LYZAdminPreview,
  title: (document.getElementById("note-title") || {}).textContent || "",
  waiting: !!document.getElementById("preview-empty"),
}));
console.log("LIVE_PREVIEW", prev);
await page.screenshot({ path: path.join(artifacts, "admin-preview-real-draft.png"), fullPage: true });

await page.goto("https://linyize1111.github.io/academic.html", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
const robots = await page.locator('meta[name="robots"]').getAttribute("content").catch(() => null);
console.log("LIVE_ACADEMIC", { url: page.url(), robots });

await browser.close();
