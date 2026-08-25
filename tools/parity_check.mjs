#!/usr/bin/env node
/**
 * parity_check.mjs — compare live Supabase (anon) vs content/cms static export
 * Exit 0 on match; 1 on mismatch / fetch failure (fail closed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CMS = path.join(ROOT, "content", "cms");

function stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "");
}
function readJson(p) {
  return JSON.parse(stripBom(fs.readFileSync(p, "utf8")));
}

function readConfig() {
  const txt = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-config.js"), "utf8");
  return {
    url: (txt.match(/url:\s*"([^"]+)"/) || [])[1],
    anonKey: (txt.match(/anonKey:\s*"([^"]+)"/) || [])[1],
  };
}

function normArticle(a) {
  function normUrl(u) {
    if (!u) return u;
    var s = String(u);
    var m = s.match(/\/notes\/([^/?#]+\.(?:webp|jpg|jpeg|png|gif))(?:[?#].*)?$/i);
    if (m) return "images/cms/notes/" + m[1];
    return s;
  }
  function normBody(body) {
    return String(body || "").replace(
      /https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/article-images\/notes\/([^)\s"']+)/g,
      "images/cms/notes/$1"
    );
  }
  return {
    section: a.section,
    slug: a.slug,
    title: a.title,
    summary: a.summary || "",
    body: normBody(a.body),
    cover: normUrl(a.cover || null),
    category: a.category || null,
    status: a.status,
    sort_index: a.sort_index || 0,
  };
}

function key(a) {
  return a.section + "::" + a.slug;
}

async function main() {
  if (!fs.existsSync(path.join(CMS, "articles.json"))) {
    throw new Error("missing content/cms/articles.json — run export first");
  }
  const staticArts = readJson(path.join(CMS, "articles.json"));
  const staticSecs = readJson(path.join(CMS, "site_sections.json"));
  const cfg = readConfig();
  const h = { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey };
  const artRes = await fetch(
    cfg.url.replace(/\/$/, "") +
      "/rest/v1/articles?select=section,slug,title,summary,body,cover,category,status,sort_index&status=eq.published&order=section.asc,slug.asc",
    { headers: h }
  );
  if (!artRes.ok) throw new Error("live articles HTTP " + artRes.status);
  const liveArts = await artRes.json();
  const secRes = await fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/site_sections?select=key,value&order=key.asc", {
    headers: h,
  });
  if (!secRes.ok) throw new Error("live site_sections HTTP " + secRes.status);
  const liveSecs = await secRes.json();

  const liveMap = new Map(liveArts.map((a) => [key(a), normArticle(a)]));
  const staticMap = new Map(staticArts.map((a) => [key(a), normArticle(a)]));

  const missingInStatic = [...liveMap.keys()].filter((k) => !staticMap.has(k));
  const missingInLive = [...staticMap.keys()].filter((k) => !liveMap.has(k));
  const mismatched = [];
  for (const k of liveMap.keys()) {
    if (!staticMap.has(k)) continue;
    const L = JSON.stringify(liveMap.get(k));
    const S = JSON.stringify(staticMap.get(k));
    if (L !== S) mismatched.push(k);
  }

  const liveSecMap = Object.fromEntries(liveSecs.map((s) => [s.key, s.value]));
  const staticSecMap = Object.fromEntries(staticSecs.map((s) => [s.key, s.value]));
  const secMismatch = Object.keys(liveSecMap).filter((k) => liveSecMap[k] !== staticSecMap[k]);

  const report = {
    live_articles: liveArts.length,
    static_articles: staticArts.length,
    missing_in_static: missingInStatic,
    missing_in_live: missingInLive,
    article_field_mismatches: mismatched,
    section_mismatches: secMismatch,
  };
  console.log(JSON.stringify(report, null, 2));

  if (
    missingInStatic.length ||
    missingInLive.length ||
    mismatched.length ||
    secMismatch.length ||
    liveArts.length !== staticArts.length
  ) {
    process.exit(1);
  }
  console.log("[parity] OK");
}

main().catch((e) => {
  console.error("[parity] FAIL", e.message || e);
  process.exit(1);
});
