/**
 * V8: adaptive gallery + admin preview reliability (Playwright).
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

function svgDataUri(w, h, label, color) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="100%" height="100%" fill="${color}"/>` +
    `<text x="50%" y="50%" fill="#fff" font-size="28" text-anchor="middle" dy=".35em">${label}</text>` +
    `</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.join(root, urlPath === "/" ? "admin-preview.html" : urlPath.replace(/^\//, ""));
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

function bodyWithImages(n) {
  let md = "開頭文字\n\n";
  for (let i = 0; i < n; i++) {
    const w = 600 + (i % 3) * 120;
    const h = 400 + (i % 2) * 200;
    md += `![img${i + 1}](${svgDataUri(w, h, String(i + 1), ["#3a6", "#36a", "#a63", "#63a", "#a36", "#6a3", "#933"][i % 7])})\n\n`;
  }
  md += "結尾文字\n";
  return md;
}

function makeArticle(nImages, extra) {
  return Object.assign(
    {
      title: `Gallery ${nImages}`,
      slug: `gallery-${nImages}`,
      section: "notes",
      summary: "adaptive gallery fixture",
      body: bodyWithImages(nImages),
      category: "筆記",
      presentation: "article-lite",
      show_title: true,
      show_summary: true,
      cover: svgDataUri(1200, 800, "C", "#224"),
      images: [
        { src: svgDataUri(640, 480, "L1", "#345"), caption: "legacy 1" },
        { src: svgDataUri(640, 800, "L2", "#543"), caption: "legacy 2" },
        { src: svgDataUri(900, 600, "L3", "#435"), caption: "legacy 3" },
      ],
      status: "draft",
      created_at: "2026-08-17T00:00:00.000Z",
      updated_at: "2026-08-17T00:00:00.000Z",
    },
    extra || {}
  );
}

const browser = await chromium.launch({ headless: true });

// ---------- Preview API + DOM parity ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.LYZAdminPreview && window.SBArticleRenderer && window.SBArticleMedia);

  const article = makeArticle(3);
  const result = await page.evaluate((a) => {
    const api = window.LYZAdminPreview;
    const out = api.render({ mode: "article", theme: "light", draftVersion: 7, article: a });
    const main = document.getElementById("main");
    const section = main && main.querySelector("section.post.is-article-reading");
    const gallery = main && main.querySelector(".article-gallery");
    const items = gallery ? gallery.querySelectorAll(".article-gallery__item") : [];
    const visible = Array.from(items).filter((el) => {
      const st = getComputedStyle(el);
      return st.display !== "none" && st.visibility !== "hidden" && el.offsetHeight > 0;
    });
    return {
      ok: !!(out && out.ok),
      renderedVersion: out && out.renderedVersion,
      hasMainSection: !!(section && section.parentElement && section.parentElement.id === "main"),
      presentation: document.body.dataset.presentation || "",
      title: (document.getElementById("note-title") || {}).textContent || "",
      galleryMode: gallery && gallery.dataset.galleryMode,
      itemCount: items.length,
      visibleCount: visible.length,
      hasCarouselNav: !!document.querySelector(".article-gallery__nav"),
      emptyBody: !!(a.body && a.body.trim()),
    };
  }, article);

  assert.equal(result.ok, true, "preview render ok");
  assert.equal(result.renderedVersion, 7);
  assert.equal(result.hasMainSection, true, "section must be under #main");
  assert.equal(result.title, "Gallery 3");
  assert.equal(result.itemCount, 3);
  assert.equal(result.visibleCount, 3, "all 3 images visible simultaneously");
  assert.equal(result.hasCarouselNav, false);

  // DOM parity: same renderer into a public-like #main twin
  const parity = await page.evaluate((a) => {
    const host = document.createElement("div");
    host.id = "parity-main";
    document.body.appendChild(host);
    // temporarily swap id
    const real = document.getElementById("main");
    const previewHtml = real.innerHTML;
    real.innerHTML = "";
    window.SBArticleRenderer.renderArticleInto(real, a, { applyReadingFocus: false });
    const previewSnap = {
      sectionClass: real.querySelector("section.post")?.className,
      presentation: real.querySelector("[data-presentation]")?.getAttribute("data-presentation") ||
        document.body.dataset.presentation,
      galleryMode: real.querySelector(".article-gallery")?.dataset.galleryMode,
      itemCount: real.querySelectorAll(".article-gallery__item").length,
      mdHasReading: !!real.querySelector(".markdown-body.article-reading"),
    };
    real.innerHTML = previewHtml;
    host.remove();
    return previewSnap;
  }, article);

  assert.ok(parity.sectionClass.includes("is-article-reading"));
  assert.equal(parity.itemCount, 3);
  assert.equal(parity.mdHasReading, true);

  // Unsaved empty-ish draft still shows title
  const emptyDraft = await page.evaluate(() => {
    return window.LYZAdminPreview.render({
      mode: "article",
      draftVersion: 8,
      article: {
        title: "未儲存草稿",
        body: "",
        presentation: "article-lite",
        section: "notes",
        status: "draft",
      },
    });
  });
  assert.equal(emptyDraft.ok, true);
  const emptyTitle = await page.textContent("#note-title");
  assert.match(emptyTitle, /未儲存草稿/);
  await page.screenshot({ path: path.join(artifacts, "admin-preview-draft-unsaved.png"), fullPage: true });

  await page.evaluate((a) => {
    window.LYZAdminPreview.render({ mode: "article", draftVersion: 9, theme: "light", article: a });
  }, makeArticle(3));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(artifacts, "admin-preview-article-gallery.png"), fullPage: true });
  await page.close();
}

// ---------- Adaptive gallery counts ----------
{
  const counts = [1, 2, 3, 4, 7];
  for (const n of counts) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LYZAdminPreview && window.SBArticleMedia);

    const stats = await page.evaluate((a) => {
      window.LYZAdminPreview.render({ mode: "article", draftVersion: 1, article: a });
      const gallery = document.querySelector(".article-gallery");
      const singles = document.querySelectorAll("#markdown-container figure.article-figure");
      if (a._expectSingle) {
        return {
          mode: "single-figure",
          visible: Array.from(singles).filter((el) => el.offsetHeight > 0).length,
          items: singles.length,
        };
      }
      const items = gallery ? Array.from(gallery.querySelectorAll(".article-gallery__item")) : [];
      const visible = items.filter((el) => {
        const st = getComputedStyle(el);
        return st.display !== "none" && el.offsetWidth > 0 && el.offsetHeight > 0;
      });
      return {
        mode: gallery && gallery.dataset.galleryMode,
        items: items.length,
        visible: visible.length,
        nav: !!document.querySelector(".carousel-prev, .article-gallery__nav"),
      };
    }, Object.assign(makeArticle(n), { _expectSingle: n === 1 }));

    if (n === 1) {
      assert.ok(stats.items >= 1, "single image figure present");
    } else {
      assert.equal(stats.items, n, `gallery item count ${n}`);
      assert.equal(stats.visible, n, `all ${n} visible at once`);
      assert.equal(stats.nav, false, "no carousel nav by default");
    }

    if (n === 2 || n === 3 || n === 7) {
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(artifacts, `article-gallery-${n}-desktop.png`),
        fullPage: true,
      });
    }
    await page.close();
  }

  // Mobile 7
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LYZAdminPreview);
    await page.evaluate((a) => {
      window.LYZAdminPreview.render({ mode: "article", draftVersion: 1, article: a });
    }, makeArticle(7));
    const mobile = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".article-gallery__item"));
      return {
        visible: items.filter((el) => el.offsetHeight > 0).length,
        mode: document.querySelector(".article-gallery")?.dataset.galleryMode,
      };
    });
    assert.equal(mobile.visible, 7);
    await page.screenshot({ path: path.join(artifacts, "article-gallery-7-mobile.png"), fullPage: true });
    await page.close();
  }
}

// ---------- Lightbox ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.LYZAdminPreview);
  await page.evaluate((a) => {
    window.LYZAdminPreview.render({ mode: "article", draftVersion: 1, article: a });
  }, makeArticle(5));
  await page.waitForSelector(".article-gallery__item img");
  await page.locator(".article-gallery__item img").nth(3).click();
  await page.waitForSelector(".article-lightbox");
  let counter = await page.textContent(".article-lightbox__counter");
  assert.match(counter, /4\s*\/\s*5/);
  await page.keyboard.press("ArrowRight");
  counter = await page.textContent(".article-lightbox__counter");
  assert.match(counter, /5\s*\/\s*5/);
  await page.screenshot({ path: path.join(artifacts, "lightbox-desktop.png") });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".article-lightbox").count(), 0);
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
  await mobile.waitForFunction(() => window.LYZAdminPreview);
  await mobile.evaluate((a) => {
    window.LYZAdminPreview.render({ mode: "article", draftVersion: 1, article: a });
  }, makeArticle(4));
  await mobile.locator(".article-gallery__item img").first().click();
  await mobile.waitForSelector(".article-lightbox");
  await mobile.screenshot({ path: path.join(artifacts, "lightbox-mobile.png") });
  await mobile.close();
}

// ---------- Card collage ----------
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(`${origin}/admin-preview.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.LYZAdminPreview);
  const cardStats = await page.evaluate((a) => {
    window.LYZAdminPreview.render({ mode: "card", draftVersion: 1, article: a });
    return {
      collage: !!document.querySelector(".card-collage"),
      more: (document.querySelector(".card-collage__more") || {}).textContent || "",
      prev: !!document.querySelector(".carousel-prev"),
      next: !!document.querySelector(".carousel-next"),
      underPosts: !!document.querySelector("#main #posts-container.posts article.note-item"),
    };
  }, makeArticle(3));
  assert.equal(cardStats.collage, true);
  assert.equal(cardStats.prev, false);
  assert.equal(cardStats.next, false);
  assert.equal(cardStats.underPosts, true);

  const card4 = await page.evaluate((a) => {
    window.LYZAdminPreview.render({ mode: "card", draftVersion: 2, article: a });
    return {
      more: (document.querySelector(".card-collage__more") || {}).textContent || "",
      cells: document.querySelectorAll(".card-collage__cell").length,
      slidesHint: a.images.length,
    };
  }, makeArticle(5));
  // collectSlides = cover + images[3] => 4 slides; collage shows 3 + "+1"
  assert.equal(card4.cells, 3);
  assert.equal(card4.more, "+1");
  await page.close();
}

await browser.close();
server.close();
console.log("v8 preview + adaptive gallery tests passed");
