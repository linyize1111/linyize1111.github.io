/**
 * Production smoke: public pages must make ZERO requests to personal-site Supabase.
 */
import { test, expect } from "@playwright/test";

const PERSONAL_SB = "ypyiqysgfwgxcmmsylob.supabase.co";
const PAGES = [
  "https://linyize1111.github.io/",
  "https://linyize1111.github.io/about.html",
  "https://linyize1111.github.io/literature.html",
  "https://linyize1111.github.io/directory.html",
];

test.describe("static cutover — zero personal Supabase network", () => {
  for (const url of PAGES) {
    test(url, async ({ page }) => {
      const hits = [];
      page.on("request", (req) => {
        const u = req.url();
        if (u.includes(PERSONAL_SB)) hits.push(u);
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector("body", { timeout: 30000 });
      await page.waitForTimeout(3000);
      expect(hits, "personal-site Supabase requests").toEqual([]);
      const cfg = await page.evaluate(() => window.CMS_DATA_CONFIG || null);
      expect(cfg && cfg.source).toBe("static");
    });
  }

  test("note page loads article from static JSON", async ({ page }) => {
    const hits = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes(PERSONAL_SB)) hits.push(u);
    });
    await page.goto("https://linyize1111.github.io/literature.html", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(3000);
    const link = page.locator('a[href*="note.html"]').first();
    await expect(link).toBeVisible({ timeout: 15000 });
    const href = await link.getAttribute("href");
    await page.goto(new URL(href, "https://linyize1111.github.io/").href, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await expect(page.locator("#note-title")).not.toHaveText(/404|未找到/, { timeout: 15000 });
    expect(hits).toEqual([]);
  });
});
