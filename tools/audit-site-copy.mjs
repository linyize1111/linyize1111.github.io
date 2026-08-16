/**
 * Audit unmanaged user-visible static text vs data-section-key / schema registry.
 * Usage: node tools/audit-site-copy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pages = ["index.html", "directory.html", "literature.html", "about.html", "academic.html", "note.html"];

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const filePath = path.join(root, rel);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("x");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

const report = [];
for (const pageName of pages) {
  const page = await browser.newPage();
  await page.goto(`${origin}/${pageName}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const unmanaged = await page.evaluate(() => {
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "I", "CANVAS", "VIDEO", "AUDIO", "SOURCE"]);
    const schemaFallbacks = new Set();
    try {
      const entries = (window.LYZSiteCopySchema && window.LYZSiteCopySchema.ENTRIES) || [];
      entries.forEach((e) => {
        if (e && e.fallback) schemaFallbacks.add(String(e.fallback).replace(/\s+/g, " ").trim());
      });
    } catch (e) {}

    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 2) continue;
      if (/^[\d\s·|/<>←→↑✓🎨🔊🌸◉]+$/.test(text)) continue;
      const el = node.parentElement;
      if (!el) continue;
      if (skip.has(el.tagName)) continue;
      if (el.closest("script,style,noscript,#posts-container,#markdown-container,.article-lightbox,#mobile-filter-list")) continue;
      if (el.closest("[data-section-key]")) continue;
      if (el.closest('[data-ui-copy="technical"]')) continue;
      // Dynamic article category names in filter options (content, not site chrome)
      if (el.matches("option") && el.closest("#filter-category, #sort-by-mobile") && el.value && el.value !== "all") {
        const known = ["upload-desc","upload-asc","edit-desc","title-asc","title-desc","list"];
        if (!known.includes(el.value)) continue;
      }
      // icon-only / aria labels often duplicate
      if (el.classList.contains("label") && el.closest(".icons, ul.icons")) continue;
      if (el.closest("#btn-mute, #btn-play, #btn-theme, #btn-top, #mobile-controls-fab")) continue;
      // Match schema fallback registry (runtime UI copy)
      if (schemaFallbacks.has(text)) continue;
      // Dynamic theme label variants
      if (/^🎨\s*主題/.test(text) || /^✓\s/.test(text)) continue;
      out.push({ text: text.slice(0, 80), tag: el.tagName.toLowerCase(), path: el.className || el.id || "" });
    }
    const seen = new Set();
    return out.filter((r) => {
      const k = r.text;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });
  report.push({ page: pageName, unmanaged });
  await page.close();
}

await browser.close();
server.close();

let total = 0;
for (const row of report) {
  console.log("\n===", row.page, "===");
  if (!row.unmanaged.length) {
    console.log("(none)");
    continue;
  }
  row.unmanaged.forEach((u) => {
    total++;
    console.log("-", u.text, `(${u.tag}${u.path ? "." + String(u.path).split(" ")[0] : ""})`);
  });
}
console.log("\nTOTAL_UNMANAGED", total);
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(root, "artifacts", "site-copy-audit.json"), JSON.stringify({ total, report }, null, 2), "utf8");
