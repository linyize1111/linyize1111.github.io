#!/usr/bin/env node
/**
 * import_inbox.mjs — 從 import-inbox/{literature,notes,academic}/*.md 匯入 Supabase articles
 *
 * 檔名 → 預設標題與 slug；可選 YAML frontmatter 覆寫。
 * academic/ 寫入 DB section=notes，並用學科分類區隔（僅 admin 清單可見）。
 * Service key 僅從環境變數讀取，絕不寫入 repo。
 *
 *   node tools/import_inbox.mjs --dry-run
 *   node tools/import_inbox.mjs --clear-only
 *   node tools/import_inbox.mjs
 *   node tools/import_inbox.mjs --publish
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INBOX = path.join(ROOT, "import-inbox");

const SHORT_CHARS = 450;
const LONG_CHARS = 2200;

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const CLEAR_ONLY = args.has("--clear-only");
const PUBLISH = args.has("--publish");

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .slice(0, 120);
}

function normalizeCategory(cat) {
  const c = String(cat || "").trim();
  if (!c) return "";
  if (["短思", "碎念", "短文"].includes(c)) return "隨想";
  if (["生活札記", "札記", "日常"].includes(c)) return "日記";
  if (["短感想", "隨感"].includes(c)) return "感想";
  if (["閱讀心得", "讀後感", "心得感想"].includes(c)) return "心得";
  if (["文學創作", "小說", "詩"].includes(c)) return "創作";
  return c;
}

function plainSummary(text, maxLen = 280) {
  return String(text || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

const ACADEMIC_CATEGORIES = ["資訊安全", "機器學習", "程式語言", "人文"];

function suggestCategory(title, body, folder) {
  const text = `${title}\n${body}`;
  const plain = text.replace(/\s+/g, "");
  const n = plain.length;
  const sec = folder || "literature";

  if (sec === "academic") {
    if (/資訊安全|資安|security/i.test(text)) return "資訊安全";
    if (/機器學習|machine\s*learning|\bml\b/i.test(text)) return "機器學習";
    if (/python|java|程式|程式語言|coding/i.test(text)) return "程式語言";
    return "人文";
  }

  if (sec === "notes") {
    if (/閱讀心得|讀後感|書評|觀後感|讀書筆記|如何讀一本書|劇情大綱/.test(text)) {
      return "心得";
    }
    if (/日記|生活札記|札記|今天的|凌晨.*(荒謬|平凡|見證)|入學日記|與海對話/.test(text)) {
      return "日記";
    }
    if (/感想|有感/.test(text) && n > SHORT_CHARS) return "感想";
    if (n > SHORT_CHARS && n < LONG_CHARS) return "隨筆";
    return "隨想";
  }

  if (/創作|短篇小說|劇本|詩集|四幕|小說/.test(text)) return "創作";
  if (n >= LONG_CHARS) return "長文";
  return "創作";
}

function titleFromFilename(filename) {
  let base = filename.replace(/\.md$/i, "");
  const datePrefix = base.match(/^(\d{4}-\d{2}-\d{2})[_\s-]+(.+)$/);
  if (datePrefix) base = datePrefix[2];
  base = base.replace(/_/g, "：").replace(/-/g, " ").trim();
  if (base.includes("：")) {
    const parts = base.split("：");
    if (parts[0].length <= 8 && parts.length >= 2) {
      return parts.join("：");
    }
  }
  return base;
}

function parseFrontmatter(raw) {
  const meta = {};
  let body = raw;
  if (!raw.startsWith("---")) return { meta, body };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta, body };
  const block = raw.slice(3, end);
  // Only treat as YAML frontmatter when block has key: value lines.
  // Literary scene dividers (--- ... ---) must not consume prose.
  const looksYaml = /^\s*[A-Za-z0-9_\u4e00-\u9fff][\w\u4e00-\u9fff.-]*\s*[:：]/m.test(block);
  if (!looksYaml) return { meta, body };
  body = raw.slice(end + 4).replace(/^\n/, "");
  block.split("\n").forEach((line) => {
    const m = line.match(/^([^\s:#]+)\s*[:：]\s*(.+)$/);
    if (!m) return;
    const key = m[1].trim().toLowerCase();
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "title" || key === "標題") meta.title = val;
    else if (key === "slug") meta.slug = slugify(val);
    else if (key === "category" || key === "分類") meta.category = normalizeCategory(val);
    else if (key === "tags" || key === "標籤") {
      meta.tags = val.split(/[,，、]+/).map((t) => t.trim()).filter(Boolean);
    } else if (key === "summary" || key === "摘要") meta.summary = val;
    else if (key === "status" || key === "狀態") meta.status = /publish|發佈|发布/i.test(val) ? "published" : "draft";
    else if (key === "published" || key === "date" || key === "日期") meta.published = val.slice(0, 10);
    else if (key === "cover" || key === "主圖") meta.cover = val;
    else if (key === "pdf") meta.pdf_url = val;
  });
  return { meta, body };
}

function readInboxSection(folder) {
  const dir = path.join(INBOX, folder);
  if (!fs.existsSync(dir)) return [];
  const dbSection = folder === "academic" ? "notes" : folder;
  const rows = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const filePath = path.join(dir, name);
    const raw = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontmatter(raw);

    const fileTitle = titleFromFilename(name);
    const h1 = body.match(/^#\s+(.+)$/m);
    let title = meta.title || (h1 ? h1[1].trim() : "") || fileTitle;
    let slug = meta.slug || slugify(fileTitle) || slugify(title) || slugify(name.replace(/\.md$/i, ""));
    if (!slug) slug = "post-" + Date.now().toString(36);

    let category = normalizeCategory(meta.category) || suggestCategory(title, body, folder);
    if (folder === "academic" && !ACADEMIC_CATEGORIES.includes(category)) {
      category = suggestCategory(title, body, "academic");
    }
    const summary = meta.summary || plainSummary(body, 120);
    const tags = meta.tags || [];
    const status = meta.status || (PUBLISH ? "published" : "draft");
    const pub = meta.published && /^\d{4}-\d{2}-\d{2}/.test(meta.published)
      ? new Date(meta.published + "T12:00:00Z").toISOString()
      : null;

    rows.push({
      section: dbSection,
      slug,
      title,
      summary,
      body: body.trim(),
      cover: meta.cover || null,
      images: [],
      category,
      tags,
      pdf_url: meta.pdf_url || null,
      status,
      sort_index: 0,
      published_at: status === "published" ? pub : null,
      _file: name,
      _folder: folder,
    });
  }
  return rows;
}

async function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("✗ 請設定 SUPABASE_URL 與 SUPABASE_SERVICE_KEY");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function clearArticles(supabase) {
  const { count, error: countErr } = await supabase
    .from("articles")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;
  console.log(`將刪除 articles 表內 ${count ?? "?"} 筆資料…`);
  const { error } = await supabase.from("articles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
  console.log("✔ 已清空 articles。");
}

async function main() {
  if (CLEAR_ONLY || !DRY) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      if (CLEAR_ONLY) {
        console.error("✗ --clear-only 需要 SUPABASE_URL / SUPABASE_SERVICE_KEY");
        process.exit(1);
      }
    }
  }

  const rows = [
    ...readInboxSection("literature"),
    ...readInboxSection("notes"),
    ...readInboxSection("academic"),
  ];

  if (!CLEAR_ONLY) {
    console.log(`import-inbox 找到 ${rows.length} 篇 .md：`);
    for (const r of rows) {
      const label = r._folder === "academic" ? "academic→notes" : r.section;
      console.log(
        `  [${label}] ${r._file}\n    → 標題「${r.title}」 slug=${r.slug} 分類=${r.category} 狀態=${r.status}`
      );
    }
    if (!rows.length) {
      console.log("\n收件匣是空的。請把 .md 放到 import-inbox/{literature,notes,academic}/");
    }
  }

  if (DRY) {
    console.log("\n--dry-run：未寫入資料庫。");
    return;
  }

  const supabase = await getClient();

  if (CLEAR_ONLY) {
    await clearArticles(supabase);
    return;
  }

  if (!rows.length) return;

  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    const payload = { ...r };
    delete payload._file;
    delete payload._folder;
    const { error } = await supabase.from("articles").upsert(payload, { onConflict: "section,slug" });
    if (error) {
      console.error(`  ✗ ${r.slug}: ${error.message}`);
      fail++;
    } else {
      console.log(`  ✔ ${r.slug} (${r.status})`);
      ok++;
    }
  }
  console.log(`\n完成：成功 ${ok}，失敗 ${fail}。請到 admin.html 確認後發佈。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
