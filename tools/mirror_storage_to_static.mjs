#!/usr/bin/env node
/** Mirror Supabase Storage URLs in articles.json to images/cms/ for static hosting. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES = path.join(ROOT, "content", "cms", "articles.json");
const OUT_DIR = path.join(ROOT, "images", "cms", "notes");
const SB_HOST = "ypyiqysgfwgxcmmsylob.supabase.co";

const raw = fs.readFileSync(ARTICLES, "utf8");
const re = new RegExp(`https://${SB_HOST.replace(/\./g, "\\.")}/storage/v1/object/public/article-images/notes/([^)\\s"']+)`, "g");
const names = new Set();
let m;
while ((m = re.exec(raw))) names.add(m[1]);

fs.mkdirSync(OUT_DIR, { recursive: true });
let downloaded = 0;
for (const name of names) {
  const url = `https://${SB_HOST}/storage/v1/object/public/article-images/notes/${name}`;
  const dest = path.join(OUT_DIR, name);
  if (fs.existsSync(dest)) {
    downloaded++;
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${url} → HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  downloaded++;
}

let updated = raw;
for (const name of names) {
  const from = `https://${SB_HOST}/storage/v1/object/public/article-images/notes/${name}`;
  const to = `images/cms/notes/${name}`;
  updated = updated.split(from).join(to);
}
fs.writeFileSync(ARTICLES, updated);

// Refresh markdown exports for touched articles
const articles = JSON.parse(updated);
const mdRoot = path.join(ROOT, "content", "cms", "markdown");
for (const a of articles) {
  if (!a.body || !String(a.body).includes("images/cms/notes/")) continue;
  const dir = path.join(mdRoot, a.section);
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(a.slug).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
  const fm = [
    "---",
    "id: " + a.id,
    "section: " + a.section,
    "slug: " + JSON.stringify(a.slug),
    "title: " + JSON.stringify(a.title),
    "category: " + JSON.stringify(a.category || ""),
    "status: " + a.status,
    "published_at: " + JSON.stringify(a.published_at || ""),
    "---",
    "",
    a.body || "",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, safe + ".md"), fm);
}

console.log(JSON.stringify({ mirrored: names.size, downloaded, out: OUT_DIR }, null, 2));
