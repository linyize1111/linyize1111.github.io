/**
 * V9.2 About Markdown profile styles + normalize.
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
  if (/\.jpe?g$/i.test(p)) return "image/jpeg";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${origin}/about.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".about-markdown");

const probe = await page.evaluate(() => {
  const body = document.querySelector(".about-profile__body.about-markdown");
  const quote = document.querySelector(".about-profile__quote.about-markdown");
  // Inject sample markdown HTML shapes as if CMS rendered
  body.innerHTML = [
    "<p><strong>您好</strong>，這是<em>自介</em>。</p>",
    "<h2>喜歡的東西</h2>",
    "<ul><li>動畫</li><li>文學</li></ul>",
    "<blockquote><p>有些喜歡的東西，很難解釋。</p></blockquote>",
    "<p>也寫 <code>INTP</code> 與 <a href=\"#\">連結</a>。</p>",
    "<hr>",
    "<pre><code>note</code></pre>",
  ].join("");
  const h2 = body.querySelector("h2");
  const ul = body.querySelector("ul");
  const bq = body.querySelector("blockquote");
  const hs = getComputedStyle(h2);
  const us = getComputedStyle(ul);
  const bs = getComputedStyle(bq);
  return {
    hasBodyClass: !!body,
    hasQuoteClass: !!quote,
    h2Transform: hs.textTransform,
    h2FontSize: parseFloat(hs.fontSize),
    ulListStyle: us.listStyleType,
    bqBorder: bs.borderLeftWidth,
    bqBg: bs.backgroundColor,
    afterContent: getComputedStyle(h2, "::after").content,
  };
});

assert.ok(probe.hasBodyClass);
assert.ok(probe.hasQuoteClass);
assert.equal(probe.h2Transform, "none");
assert.ok(probe.h2FontSize < 40, `h2 should be editorial not huge: ${probe.h2FontSize}`);
assert.ok(probe.ulListStyle === "disc" || probe.ulListStyle === "disc outside");
assert.ok(parseFloat(probe.bqBorder) >= 1.5);
assert.ok(probe.afterContent && probe.afterContent !== "none");

await page.screenshot({ path: path.join(artifacts, "about-markdown-1440.png"), fullPage: false });

const norm = await page.evaluate(() => {
  const fn = window.LYZNormalizeSiteCopyMarkdown;
  if (!fn) return null;
  return fn("    ## 興趣\n    - a\n    - b\n");
});
assert.ok(norm);
assert.ok(!norm.startsWith(" "), "indent stripped");
assert.ok(norm.startsWith("##"));

await browser.close();
server.close();
console.log("v9.2 about markdown tests passed", probe);
