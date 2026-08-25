#!/usr/bin/env node
/**
 * verify_backup_restore.mjs — local restore verification for an outside-repo backup folder
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node tools/verify_backup_restore.mjs <backupDir>");
  process.exit(2);
}

function stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "");
}
function readJson(p) {
  return JSON.parse(stripBom(fs.readFileSync(p, "utf8")));
}

const articles = readJson(path.join(root, "data", "articles.json"));
const sections = readJson(path.join(root, "data", "site_sections.json"));
const analytics = readJson(path.join(root, "data", "site_analytics.json"));
const sumsPath = path.join(root, "checksums", "SHA256SUMS.txt");

let bad = 0;
for (const a of articles) {
  for (const f of ["id", "section", "slug", "title", "body", "status"]) {
    if (a[f] == null || a[f] === "") {
      console.error("missing", f, a.slug);
      bad++;
    }
  }
}
if (!sections.length) {
  console.error("no sections");
  bad++;
}

if (fs.existsSync(sumsPath)) {
  const lines = stripBom(fs.readFileSync(sumsPath, "utf8"))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
    if (!m) continue;
    const file = path.join(root, m[2].replace(/\//g, path.sep));
    if (!fs.existsSync(file)) {
      console.error("checksum missing file", m[2]);
      bad++;
      continue;
    }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash.toLowerCase() !== m[1].toLowerCase()) {
      console.error("checksum mismatch", m[2]);
      bad++;
    }
  }
}

const storageObjs = fs.existsSync(path.join(root, "storage", "objects"))
  ? fs.readdirSync(path.join(root, "storage", "objects"), { recursive: true }).filter((n) => {
      const p = path.join(root, "storage", "objects", n);
      return fs.statSync(p).isFile();
    }).length
  : 0;

console.log(
  JSON.stringify(
    {
      ok: bad === 0,
      articles: articles.length,
      sections: sections.length,
      analytics: analytics.length,
      storage_objects: storageObjs,
      bad,
    },
    null,
    2
  )
);
process.exit(bad ? 1 : 0);
