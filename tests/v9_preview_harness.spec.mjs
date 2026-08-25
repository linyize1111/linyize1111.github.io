/**
 * Reproduce V9 admin preview: parent iframe harness (no auth).
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
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath === "/" ? "admin.html" : urlPath.replace(/^\//, "");
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
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(["console", m.type(), m.text()]));
page.on("pageerror", (e) => logs.push(["pageerror", e.message]));

// 1) iframe alone
await page.goto(`${origin}/admin-preview.html`, { waitUntil: "networkidle" });
const iframeDiag = await page.evaluate(() => ({
  api: !!window.LYZAdminPreview,
  ready: !!(window.LYZAdminPreview && window.LYZAdminPreview.ready),
  SB: !!window.SB,
  renderMd: !!(window.SB && window.SB.renderMarkdown),
  R: !!window.SBArticleRenderer,
  emptyText: (document.getElementById("preview-empty") || {}).textContent || "",
}));
console.log("iframeDiag", iframeDiag);

const render = await page.evaluate(() =>
  window.LYZAdminPreview.render({
    mode: "article",
    draftVersion: 1,
    theme: "light",
    article: {
      title: "Harness Draft",
      body: "Hello **world**\n\nSecond paragraph.",
      presentation: "article-lite",
      section: "notes",
      status: "draft",
      show_title: true,
    },
  })
);
console.log("directRender", render);
assert.equal(render.ok, true);
assert.match(await page.textContent("#note-title"), /Harness Draft/);
assert.ok(await page.locator(".markdown-body").count());

// 2) Parent harness: race late API access
await page.setContent(`<!DOCTYPE html><html><body>
  <iframe id="frontend-preview-frame" src="${origin}/admin-preview.html" sandbox="allow-scripts allow-same-origin" style="width:900px;height:700px;border:0"></iframe>
  <pre id="out"></pre>
  <script>
    (function () {
      var delays = [0, 50, 150, 300, 700];
      var frame = document.getElementById('frontend-preview-frame');
      var out = document.getElementById('out');
      var payload = {
        mode: 'article', draftVersion: 42, theme: 'light',
        article: { title: 'Parent Sent', body: 'From parent harness.', presentation: 'article-lite', section: 'notes', status: 'draft', show_title: true }
      };
      function tryRender(attempt) {
        try {
          var api = frame.contentWindow && frame.contentWindow.LYZAdminPreview;
          if (api && api.ready && typeof api.render === 'function') {
            var r = api.render(payload);
            out.textContent = JSON.stringify({ attempt: attempt, ok: r && r.ok, title: (frame.contentDocument.getElementById('note-title')||{}).textContent });
            return true;
          }
        } catch (e) {
          out.textContent = JSON.stringify({ attempt: attempt, err: String(e) });
        }
        return false;
      }
      frame.addEventListener('load', function () {
        var i = 0;
        function tick() {
          if (tryRender(delays[i])) return;
          i++;
          if (i >= delays.length) {
            out.textContent = JSON.stringify({ failed: true, last: out.textContent });
            return;
          }
          setTimeout(tick, delays[i] - (delays[i - 1] || 0));
        }
        tick();
      });
    })();
  </script>
</body></html>`, { waitUntil: "domcontentloaded" });

await page.waitForFunction(() => {
  const t = document.getElementById("out")?.textContent || "";
  return t.includes('"ok":true') || t.includes('"failed":true');
}, null, { timeout: 5000 });
const harnessOut = await page.textContent("#out");
console.log("harnessOut", harnessOut);
assert.ok(harnessOut.includes('"ok":true'), "parent harness must render via force retry");

const frame = page.frameLocator("#frontend-preview-frame");
await frame.locator("#note-title").waitFor();
assert.match(await frame.locator("#note-title").textContent(), /Parent Sent/);
await page.screenshot({ path: path.join(artifacts, "admin-preview-real-draft.png"), fullPage: true });

// 3) Probe admin.html iframe after load (no login) — diagnose API reachability
await page.goto(`${origin}/admin.html`, { waitUntil: "networkidle" });
const adminProbe = await page.evaluate(async () => {
  const frame = document.getElementById("frontend-preview-frame");
  if (!frame) return { err: "no-frame" };
  await new Promise((r) => {
    if (frame.contentDocument && frame.contentDocument.readyState === "complete") r();
    else frame.addEventListener("load", r, { once: true });
  });
  await new Promise((r) => setTimeout(r, 200));
  let api = null;
  let accessErr = null;
  try {
    api = frame.contentWindow && frame.contentWindow.LYZAdminPreview;
  } catch (e) {
    accessErr = String(e && e.message || e);
  }
  const empty =
    (frame.contentDocument &&
      frame.contentDocument.getElementById("preview-empty") &&
      frame.contentDocument.getElementById("preview-empty").textContent) ||
    "";
  return {
    src: frame.getAttribute("src"),
    api: !!api,
    ready: !!(api && api.ready),
    accessErr,
    empty: String(empty).trim(),
    formHidden: !!(document.getElementById("article-form") && document.getElementById("article-form").classList.contains("hidden")),
  };
});
console.log("adminProbe", adminProbe);
logs.filter((l) => l[0] === "pageerror").forEach((l) => console.log("ERR", l));

assert.equal(adminProbe.api, true, "admin iframe API must be reachable same-origin");
// V9 forcePreview may render an empty draft shell immediately (no longer stuck on waiting copy).
assert.ok(
  !adminProbe.empty || /等待編輯器/.test(adminProbe.empty) || adminProbe.empty.length === 0,
  "iframe should be ready (waiting or already force-rendered)"
);

await browser.close();
server.close();
console.log("v9 preview repro harness passed");
