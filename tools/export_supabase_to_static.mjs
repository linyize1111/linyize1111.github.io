#!/usr/bin/env node
/**
 * export_supabase_to_static.mjs
 *
 * Dry-run / idempotent exporter: published CMS → content/cms/*.json
 * Uses anon key only (public reads). Fail closed if live fetch fails.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_ANON_KEY="<anon>"   # or omit to read assets/js/supabase-config.js
 *   node tools/export_supabase_to_static.mjs --dry-run
 *   node tools/export_supabase_to_static.mjs
 *   node tools/export_supabase_to_static.mjs --from-backup <backupDir>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "content", "cms");
const DRY = process.argv.includes("--dry-run");
const fromIdx = process.argv.indexOf("--from-backup");
const FROM_BACKUP = fromIdx >= 0 ? process.argv[fromIdx + 1] : null;

function readConfigFromRepo() {
  const p = path.join(ROOT, "assets", "js", "supabase-config.js");
  const txt = fs.readFileSync(p, "utf8");
  const url = (txt.match(/url:\s*"([^"]+)"/) || [])[1];
  const anonKey = (txt.match(/anonKey:\s*"([^"]+)"/) || [])[1];
  if (!url || !anonKey) throw new Error("Cannot parse supabase-config.js");
  return { url, anonKey };
}

function stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "");
}

function readJson(file) {
  return JSON.parse(stripBom(fs.readFileSync(file, "utf8")));
}

async function fetchLive(url, anon) {
  const h = { apikey: anon, Authorization: "Bearer " + anon };
  async function get(q) {
    const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/" + q, { headers: h });
    if (!r.ok) throw new Error("REST fail " + q + " → HTTP " + r.status);
    return r.json();
  }
  const articles = await get("articles?select=*&status=eq.published&order=section.asc,slug.asc");
  const sections = await get("site_sections?select=*&order=key.asc");
  const analytics = await get("site_analytics?select=*");
  return { articles, sections, analytics };
}

function assertParityShape(articles, sections) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error("fail-closed: no published articles");
  }
  for (const a of articles) {
    for (const f of ["id", "section", "slug", "title", "body", "status"]) {
      if (a[f] == null || a[f] === "") throw new Error("fail-closed: article missing " + f);
    }
    if (!["literature", "notes"].includes(a.section)) {
      throw new Error("fail-closed: bad section " + a.section);
    }
    if (a.status !== "published") throw new Error("fail-closed: non-published slipped in");
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error("fail-closed: no site_sections");
  }
}

function writeOutputs(payload) {
  const { articles, sections, analytics } = payload;
  assertParityShape(articles, sections);

  const manifest = {
    exported_at: new Date().toISOString(),
    architecture: "Plan A static (Markdown/JSON in Git)",
    article_count: articles.length,
    section_count: sections.length,
    source: FROM_BACKUP ? "backup:" + FROM_BACKUP : "supabase-anon",
    notes: [
      "Production frontend default remains source=supabase until cutover.",
      "Analytics snapshot is read-only under Plan A (no visitor writes).",
    ],
  };

  if (DRY) {
    console.log("[dry-run] would write", {
      out: OUT,
      articles: articles.length,
      sections: sections.length,
      analytics: (analytics || []).length,
    });
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "articles.json"), JSON.stringify(articles, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "site_sections.json"), JSON.stringify(sections, null, 2) + "\n");
  fs.writeFileSync(
    path.join(OUT, "analytics_snapshot.json"),
    JSON.stringify(analytics || [], null, 2) + "\n"
  );
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Also emit per-article markdown for git-friendly editing (idempotent overwrite)
  const mdRoot = path.join(OUT, "markdown");
  for (const a of articles) {
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
  console.log("[ok] exported", articles.length, "articles →", OUT);
}

async function main() {
  let payload;
  if (FROM_BACKUP) {
    const base = path.resolve(FROM_BACKUP);
    payload = {
      articles: readJson(path.join(base, "data", "articles.json")).filter(
        (a) => a.status === "published"
      ),
      sections: readJson(path.join(base, "data", "site_sections.json")),
      analytics: readJson(path.join(base, "data", "site_analytics.json")),
    };
  } else {
    const envUrl = process.env.SUPABASE_URL;
    const envAnon = process.env.SUPABASE_ANON_KEY;
    const cfg = envUrl && envAnon ? { url: envUrl, anonKey: envAnon } : readConfigFromRepo();
    payload = await fetchLive(cfg.url, cfg.anonKey);
  }
  writeOutputs(payload);
}

main().catch((e) => {
  console.error("[fail-closed]", e.message || e);
  process.exit(1);
});
