#!/usr/bin/env node
/**
 * import_md_to_supabase.mjs
 *
 * 把現有的 literature/*.md 與 notes/*.md 匯入新的 Supabase articles 表。
 * 會從 literature.html / directory.html 的卡片解析分類、日期、封面、摘要、PDF。
 *
 * ★ 安全：service key 只從環境變數讀取，絕不寫入檔案 / repo / log。★
 *
 * 用法（PowerShell，在 temp-pages 目錄）：
 *   npm install @supabase/supabase-js
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY="<service_role_key>"      # 用完請關掉視窗
 *   node tools/import_md_to_supabase.mjs                # 正式匯入
 *   node tools/import_md_to_supabase.mjs --dry-run      # 只預覽不寫入
 *
 * 匯入為 status='published'（沿用目前線上狀態）。以 (section, slug) upsert，可重跑。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry-run");

function stripTags(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 解析單一 HTML 檔中所有 .note-item 卡片，回傳 { slugDecoded -> meta }
function parseCards(htmlPath, section) {
  const map = {};
  if (!fs.existsSync(htmlPath)) return map;
  const html = fs.readFileSync(htmlPath, "utf8");
  const blocks = html.match(/<article class="note-item"[\s\S]*?<\/article>/g) || [];
  for (const b of blocks) {
    const cat = (b.match(/data-category="([^"]*)"/) || [])[1] || "";
    const up = (b.match(/data-upload="([^"]*)"/) || [])[1] || "";
    const ed = (b.match(/data-edit="([^"]*)"/) || [])[1] || "";
    const title = (b.match(/data-title="([^"]*)"/) || [])[1] || "";
    const linkMatch = b.match(/note\.html\?(lit|file)=([^"&]+)/);
    if (!linkMatch) continue;
    const slug = decodeURIComponent(linkMatch[2]);
    const pdfMatch = b.match(/note\.html\?pdf=([^"&]+)/);
    const pdf = pdfMatch ? "pdfs/" + decodeURIComponent(pdfMatch[1]) + ".pdf" : null;

    // 圖片（含輪播）
    const imgs = [];
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*>/g;
    let m;
    while ((m = imgRe.exec(b))) {
      if (!/^images\//.test(m[1])) continue;
      imgs.push(m[1]);
    }
    const cover = imgs.length ? imgs[0] : null;
    const extra = imgs.slice(1).map((src) => ({ src, caption: "" }));

    const pMatch = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const summary = pMatch ? stripTags(pMatch[1]) : "";

    map[slug] = {
      section,
      slug,
      category: cat,
      upload: up || null,
      edit: ed || up || null,
      title,
      cover,
      images: extra,
      pdf_url: pdf,
      summary,
    };
  }
  return map;
}

function readMdDir(dir, section, cardMap) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full)) {
    if (!f.toLowerCase().endsWith(".md")) continue;
    const slug = f.replace(/\.md$/i, "");
    const body = fs.readFileSync(path.join(full, f), "utf8");
    const meta = cardMap[slug] || {};
    // 標題：卡片 data-title → md 第一個 # → slug
    let title = meta.title;
    if (!title) {
      const h1 = body.match(/^#\s+(.+)$/m);
      title = h1 ? h1[1].trim() : slug;
    }
    const upIso = meta.upload ? new Date(meta.upload + "T00:00:00Z").toISOString() : null;
    const edIso = meta.edit ? new Date(meta.edit + "T00:00:00Z").toISOString() : upIso;
    out.push({
      section,
      slug,
      title,
      summary: meta.summary || "",
      body,
      cover: meta.cover || null,
      images: meta.images || [],
      category: meta.category || null,
      tags: [],
      pdf_url: meta.pdf_url || null,
      status: "published",
      sort_index: 0,
      published_at: upIso,
      created_at: upIso || undefined,
      updated_at: edIso || undefined,
    });
  }
  return out;
}

async function main() {
  const litCards = parseCards(path.join(ROOT, "literature.html"), "literature");
  const noteCards = parseCards(path.join(ROOT, "directory.html"), "notes");

  const rows = [
    ...readMdDir("literature", "literature", litCards),
    ...readMdDir("notes", "notes", noteCards),
  ];

  console.log(`找到 ${rows.length} 篇 Markdown 文章：`);
  for (const r of rows) {
    console.log(
      `  [${r.section}] ${r.slug}  分類=${r.category || "-"}  封面=${r.cover || "-"}  圖=${r.images.length}  pdf=${r.pdf_url ? "有" : "-"}`
    );
  }

  if (DRY) {
    console.log("\n--dry-run：未寫入資料庫。");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("\n✗ 請先設定環境變數 SUPABASE_URL 與 SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let ok = 0, fail = 0;
  for (const r of rows) {
    const { error } = await supabase
      .from("articles")
      .upsert(r, { onConflict: "section,slug" });
    if (error) { console.error(`  ✗ ${r.slug}: ${error.message}`); fail++; }
    else { console.log(`  ✔ ${r.slug}`); ok++; }
  }
  console.log(`\n完成：成功 ${ok}，失敗 ${fail}。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
