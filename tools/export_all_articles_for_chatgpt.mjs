/**
 * Export all main-site articles to a single MD + JSON for ChatGPT handoff.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs", "chatgpt-handoff");
fs.mkdirSync(OUT, { recursive: true });

const ACADEMIC = new Set(["資訊安全", "機器學習", "程式語言", "人文"]);

function uiBucket(a) {
  if (a.section === "literature") return "文學創作";
  if (ACADEMIC.has(String(a.category || "").trim())) return "學科筆記";
  return "隨筆";
}

function yamlEscape(s) {
  const t = String(s ?? "");
  if (/[:#\n"'\\]/.test(t) || t !== t.trim()) {
    return JSON.stringify(t);
  }
  return t || '""';
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from("articles")
  .select("*")
  .order("section", { ascending: true })
  .order("category", { ascending: true })
  .order("updated_at", { ascending: false });

if (error) throw error;

const rows = data || [];
const exportMeta = {
  exported_at: new Date().toISOString(),
  source: "Supabase articles @ ypyiqysgfwgxcmmsylob",
  site: "https://linyize1111.github.io/",
  count: rows.length,
  by_status: {},
  by_ui_bucket: {},
  by_category: {},
};

for (const a of rows) {
  exportMeta.by_status[a.status] = (exportMeta.by_status[a.status] || 0) + 1;
  const b = uiBucket(a);
  exportMeta.by_ui_bucket[b] = (exportMeta.by_ui_bucket[b] || 0) + 1;
  const c = a.category || "(無分類)";
  exportMeta.by_category[c] = (exportMeta.by_category[c] || 0) + 1;
}

// JSON (full fidelity for re-import)
const jsonPath = path.join(OUT, "ALL_ARTICLES_EXPORT.json");
fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      meta: exportMeta,
      articles: rows.map((a) => ({
        id: a.id,
        ui_bucket: uiBucket(a),
        section: a.section,
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        category: a.category,
        tags: a.tags || [],
        status: a.status,
        sort_index: a.sort_index,
        cover: a.cover,
        images: a.images || [],
        pdf_url: a.pdf_url,
        published_at: a.published_at,
        created_at: a.created_at,
        updated_at: a.updated_at,
        body: a.body || "",
      })),
    },
    null,
    2
  ),
  "utf8"
);

// Single Markdown for ChatGPT reading / editing
const sep = "\n\n" + "=".repeat(72) + "\n";
const parts = [];
parts.push(`# LYZ 主站全部文章匯出（單一檔）

> 匯出時間：${exportMeta.exported_at}  
> 篇數：${exportMeta.count}  
> 站台：https://linyize1111.github.io/  
> 配套 JSON：\`ALL_ARTICLES_EXPORT.json\`（建議機器重匯入用這個）

## 匯出統計

\`\`\`json
${JSON.stringify(
  {
    by_status: exportMeta.by_status,
    by_ui_bucket: exportMeta.by_ui_bucket,
    by_category: exportMeta.by_category,
  },
  null,
  2
)}
\`\`\`

## 給 ChatGPT 的使用說明

1. 每一篇以下方 \`ARTICLE_START\` / \`ARTICLE_END\` 區塊分隔。
2. 區塊內 YAML frontmatter 含 id/slug/section/category/status——**整理時請保留 id 與 slug**，方便之後精準覆寫回資料庫。
3. 你的任務優先序建議見 \`00_CHATGPT_MASTER_BRIEF.md\`。
4. 整理完可輸出「每篇一個 .md」或更新後的單一檔；工程端會用 JSON／frontmatter 重匯入。

`);

rows.forEach((a, idx) => {
  const n = idx + 1;
  const bucket = uiBucket(a);
  const fm = [
    "---",
    `export_index: ${n}`,
    `id: ${a.id}`,
    `ui_bucket: ${yamlEscape(bucket)}`,
    `section: ${yamlEscape(a.section)}`,
    `slug: ${yamlEscape(a.slug)}`,
    `title: ${yamlEscape(a.title)}`,
    `category: ${yamlEscape(a.category || "")}`,
    `status: ${yamlEscape(a.status)}`,
    `tags: ${JSON.stringify(a.tags || [])}`,
    `summary: ${yamlEscape(a.summary || "")}`,
    `cover: ${yamlEscape(a.cover || "")}`,
    `pdf_url: ${yamlEscape(a.pdf_url || "")}`,
    `sort_index: ${a.sort_index ?? 0}`,
    `published_at: ${yamlEscape(a.published_at || "")}`,
    `updated_at: ${yamlEscape(a.updated_at || "")}`,
    `body_chars: ${(a.body || "").length}`,
    "---",
  ].join("\n");

  parts.push(
    `${sep}ARTICLE_START ${n}/${rows.length} · ${bucket} · ${a.status}\n${fm}\n\n${a.body || "（空白正文）"}\n\nARTICLE_END ${n}\n`
  );
});

const mdPath = path.join(OUT, "ALL_ARTICLES_EXPORT.md");
fs.writeFileSync(mdPath, parts.join(""), "utf8");

// Index CSV for quick scanning
const csvLines = [
  "index,ui_bucket,section,category,status,title,slug,body_chars,updated_at",
];
rows.forEach((a, i) => {
  const title = String(a.title || "").replace(/"/g, '""');
  csvLines.push(
    [
      i + 1,
      uiBucket(a),
      a.section,
      a.category || "",
      a.status,
      `"${title}"`,
      a.slug,
      (a.body || "").length,
      a.updated_at || "",
    ].join(",")
  );
});
fs.writeFileSync(path.join(OUT, "ALL_ARTICLES_INDEX.csv"), csvLines.join("\n"), "utf8");

console.log("Wrote:");
console.log(" ", mdPath, `(${(fs.statSync(mdPath).size / 1024).toFixed(1)} KB)`);
console.log(" ", jsonPath, `(${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);
console.log(" ", path.join(OUT, "ALL_ARTICLES_INDEX.csv"));
