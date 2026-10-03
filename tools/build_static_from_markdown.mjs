#!/usr/bin/env node
// Build the public, static article index from owner-edited Markdown files.
// No network, credentials, or Supabase access is involved.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "content", "cms", "markdown");
const target = path.join(root, "content", "cms", "articles.json");
const manifestPath = path.join(root, "content", "cms", "manifest.json");
const mode = process.argv[2] || "--check";
if (!["--check", "--write"].includes(mode)) throw new Error("Use --check or --write");

function parse(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n(?:\n)?([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (!pair) throw new Error(`${file}: unsupported frontmatter line: ${line}`);
    if (Object.hasOwn(meta, pair[1])) throw new Error(`${file}: duplicate ${pair[1]}`);
    let value = pair[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error(`${file}: invalid quoted ${pair[1]}`); }
    }
    meta[pair[1]] = value;
  }
  for (const key of Object.keys(meta)) {
    if (!["id", "section", "slug", "title", "category", "status", "published_at", "summary", "tags"].includes(key)) {
      throw new Error(`${file}: unsupported field ${key}`);
    }
  }
  for (const key of ["id", "section", "slug", "title", "status"]) {
    if (!meta[key]) throw new Error(`${file}: missing ${key}`);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meta.id)) throw new Error(`${file}: id must be a UUID`);
  if (!["published", "draft"].includes(meta.status)) throw new Error(`${file}: unsupported status`);
  if (meta.section !== path.basename(path.dirname(file))) throw new Error(`${file}: section must match its folder`);
  if (!["notes", "literature"].includes(meta.section)) throw new Error(`${file}: unsupported section`);
  if (meta.status === "published" && !meta.published_at) throw new Error(`${file}: published_at required`);
  if (meta.tags != null) meta.tags = meta.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  // The original export appended one separator newline after the stored body.
  return { meta, body: match[2].replace(/\n$/, "") };
}

const existing = JSON.parse(fs.readFileSync(target, "utf8"));
const byId = new Map(existing.map((article) => [article.id, article]));
const seenIds = new Set();
const seenKeys = new Set();
const generated = [];
for (const section of ["literature", "notes"]) {
  const dir = path.join(source, section);
  for (const name of fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
    const file = path.join(dir, name);
    const { meta, body } = parse(file);
    if (seenIds.has(meta.id)) throw new Error(`${file}: duplicate id`);
    const key = `${meta.section}/${meta.slug}`;
    if (seenKeys.has(key)) throw new Error(`${file}: duplicate section/slug`);
    seenIds.add(meta.id);
    seenKeys.add(key);
    const old = byId.get(meta.id);
    if (old && old.section !== meta.section) throw new Error(`${file}: existing article section cannot change`);
    if (meta.status === "draft") continue;
    const timestamp = new Date(meta.published_at);
    if (!Number.isFinite(timestamp.getTime())) throw new Error(`${file}: invalid published_at`);
    const article = old ? { ...old } : {
      id: meta.id, summary: "", cover: null, images: [], tags: [], pdf_url: null,
      sort_index: 0, created_at: timestamp.toISOString(), updated_at: timestamp.toISOString(),
      content_type: "article", presentation: "prose", visibility: "public", series: null,
      show_title: true, show_summary: true, ai_editorial: {}, source_meta: {},
      cover_display: { fit: "cover", ratio: "auto", style: "inline", position: "center center" },
      needs_ai_analysis: false,
    };
    for (const field of ["section", "slug", "title", "category", "status", "published_at"]) {
      if (meta[field] != null) article[field] = meta[field];
    }
    for (const field of ["summary", "tags"]) {
      if (meta[field] != null) article[field] = meta[field];
    }
    article.body = body;
    generated.push(article);
  }
}
for (const old of existing) {
  if (!seenIds.has(old.id)) throw new Error(`Missing Markdown source for published article ${old.id} (${old.title})`);
}
const order = new Map(existing.map((article, index) => [article.id, index]));
generated.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.id.localeCompare(b.id));
const output = JSON.stringify(generated, null, 2) + "\n";
const current = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
if (mode === "--check") {
  if (output !== current) {
    const index = generated.findIndex((article, i) => JSON.stringify(article) !== JSON.stringify(existing[i]));
    const article = generated[index];
    const field = article && Object.keys(article).find((key) => JSON.stringify(article[key]) !== JSON.stringify(existing[index]?.[key]));
    throw new Error(`Markdown and articles.json differ at ${article?.id || "formatting"}, field ${field || "formatting"}; run npm run articles:build and review the diff`);
  }
  console.log(`[articles] OK: ${generated.length} published articles match Markdown`);
} else if (output !== current) {
  fs.writeFileSync(target, output, "utf8");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.article_count = generated.length;
  manifest.exported_at = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`[articles] Wrote ${generated.length} published articles; review before committing`);
} else {
  console.log(`[articles] No changes (${generated.length} published articles)`);
}
