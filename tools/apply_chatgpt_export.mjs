/**
 * Apply ChatGPT ALL_ARTICLES_IMPROVED.json to Supabase articles by id.
 *
 *   node tools/apply_chatgpt_export.mjs --dry-run
 *   node tools/apply_chatgpt_export.mjs --apply
 *   node tools/apply_chatgpt_export.mjs --apply --delete-candidates
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PACK = path.join(
  ROOT,
  "docs",
  "chatgpt-handoff",
  "from-chatgpt-2026-08-06"
);
const IMPROVED = path.join(PACK, "ALL_ARTICLES_IMPROVED.json");
const DELETE_IDS = new Set([
  "3e8eb4e3-9ed5-4d50-8c75-8656da292daa", // #1 merge into #36
  "6660c706-ab66-456f-9480-6e92ffff51e7", // #52 merge into #53
]);

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run") || !args.has("--apply");
const APPLY = args.has("--apply");
const DO_DELETE = args.has("--delete-candidates");

const ACADEMIC = new Set(["資訊安全", "機器學習", "程式語言", "人文"]);
const CANON = new Set([
  "隨想",
  "日記",
  "感想",
  "心得",
  "隨筆",
  "創作",
  "長文",
  ...ACADEMIC,
]);

function diffField(oldV, newV) {
  const a = oldV == null ? null : oldV;
  const b = newV == null ? null : newV;
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  return { from: a, to: b };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("Need SUPABASE_URL and SUPABASE_SERVICE_KEY");
    process.exit(1);
  }
  const improved = JSON.parse(fs.readFileSync(IMPROVED, "utf8"));
  const rows = improved.articles || [];
  if (rows.length !== 55) {
    console.warn("Warning: expected 55 articles, got", rows.length);
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: current, error } = await sb.from("articles").select("*");
  if (error) throw error;
  const byId = new Map((current || []).map((a) => [a.id, a]));

  // backup
  const backupDir = path.join(PACK, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `articles-before-apply-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ exported_at: new Date().toISOString(), articles: current }, null, 2));
  console.log("Backup:", backupPath);

  const report = [];
  const missing = [];
  const invalidCat = [];
  const pairKeys = new Map();
  const pairDup = [];

  for (const n of rows) {
    const o = byId.get(n.id);
    if (!o) {
      missing.push(n.id);
      continue;
    }
    if (n.category && !CANON.has(n.category)) invalidCat.push([n.id, n.category]);
    const pair = `${n.section}::${n.slug}`;
    if (pairKeys.has(pair)) pairDup.push(pair);
    else pairKeys.set(pair, n.id);

    const changes = {
      title: diffField(o.title, n.title),
      section: diffField(o.section, n.section),
      slug: diffField(o.slug, n.slug),
      category: diffField(o.category, n.category),
      status: diffField(o.status, n.status),
      summary: diffField(o.summary, n.summary),
      tags: diffField(o.tags || [], n.tags || []),
      cover: diffField(o.cover, n.cover),
      pdf_url: diffField(o.pdf_url, n.pdf_url),
      images: diffField(o.images || [], n.images || []),
      body: (o.body || "") === (n.body || "") ? null : { from_len: (o.body || "").length, to_len: (n.body || "").length },
    };
    const changed = Object.entries(changes).filter(([, v]) => v);
    report.push({
      id: n.id,
      title_new: n.title,
      delete_candidate: DELETE_IDS.has(n.id),
      changed: Object.fromEntries(changed),
    });
  }

  console.log("\n=== DRY REPORT ===");
  console.log("DB count:", current.length, "improved:", rows.length);
  console.log("missing ids:", missing.length, missing);
  console.log("invalid categories:", invalidCat.length, invalidCat);
  console.log("duplicate (section,slug) in improved:", pairDup.length, pairDup);
  const withChanges = report.filter((r) => Object.keys(r.changed).length);
  console.log("rows with changes:", withChanges.length);
  const statusFlip = report.filter((r) => r.changed.status);
  console.log("status changes:", statusFlip.length);
  statusFlip.slice(0, 20).forEach((r) => {
    console.log(`  ${r.changed.status.from} → ${r.changed.status.to} | ${r.title_new}`);
  });
  const sectionFlip = report.filter((r) => r.changed.section);
  console.log("section moves:", sectionFlip.length);
  sectionFlip.forEach((r) => {
    console.log(`  ${r.changed.section.from} → ${r.changed.section.to} | ${r.title_new} | slug ${r.changed.slug ? r.changed.slug.from + "→" + r.changed.slug.to : "(same)"}`);
  });

  const reportPath = path.join(PACK, `apply-report-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ missing, invalidCat, pairDup, report }, null, 2));
  console.log("Report:", reportPath);

  if (missing.length || invalidCat.length || pairDup.length) {
    console.error("Abort: validation failed.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }

  // Phase 1: demote published→draft first (privacy)
  const demote = rows.filter((n) => {
    const o = byId.get(n.id);
    return o && o.status === "published" && n.status === "draft";
  });
  console.log("\nPhase1 demote published→draft:", demote.length);
  for (const n of demote) {
    const { error: e } = await sb.from("articles").update({ status: "draft" }).eq("id", n.id);
    if (e) throw e;
    console.log("  demoted", n.title);
  }

  // Phase 2: full update by id
  // For section+slug changes, update in one shot; if unique conflict, use temp slug
  console.log("\nPhase2 full updates...");
  let ok = 0;
  let fail = 0;
  for (const n of rows) {
    if (DELETE_IDS.has(n.id) && DO_DELETE) {
      console.log("  skip update (will delete):", n.title);
      continue;
    }
    const o = byId.get(n.id);
    const payload = {
      section: n.section,
      slug: n.slug,
      title: n.title,
      summary: n.summary || null,
      category: n.category || null,
      tags: n.tags || [],
      status: n.status,
      cover: n.cover || null,
      images: n.images || [],
      pdf_url: n.pdf_url || null,
      body: n.body || "",
      sort_index: n.sort_index ?? 0,
    };

    // published_at rules
    if (n.status === "published") {
      if (o.published_at) payload.published_at = o.published_at;
      else if (o.status !== "published") payload.published_at = new Date().toISOString();
    }

    let { error: e } = await sb.from("articles").update(payload).eq("id", n.id);
    if (e && /duplicate|unique/i.test(e.message || "")) {
      const tempSlug = `tmp-${n.id.slice(0, 8)}-${Date.now().toString(36)}`;
      console.warn("  unique conflict, temp slug for", n.title);
      const r1 = await sb.from("articles").update({ ...payload, slug: tempSlug }).eq("id", n.id);
      if (r1.error) {
        console.error("  FAIL temp", n.id, r1.error.message);
        fail++;
        continue;
      }
      const r2 = await sb.from("articles").update({ slug: n.slug }).eq("id", n.id);
      if (r2.error) {
        console.error("  FAIL final slug", n.id, r2.error.message);
        fail++;
        continue;
      }
      ok++;
      continue;
    }
    if (e) {
      console.error("  FAIL", n.id, n.title, e.message);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`Updates done: ok=${ok} fail=${fail}`);

  if (DO_DELETE) {
    console.log("\nPhase3 delete candidates...");
    // verify survivors exist
    const keep36 = rows.find((a) => a.id === "3e8eb4e3-9ed5-4d50-8c75-8656da292daa");
    // #36 is the keeper with title 困在數字遊戲裡 - find by title in improved that is NOT delete id
    const canonical36 = rows.find(
      (a) => a.title === "困在數字遊戲裡" && a.id !== "3e8eb4e3-9ed5-4d50-8c75-8656da292daa"
    );
    const keep53 = rows.find((a) => a.title === "取材" && a.id !== "6660c706-ab66-456f-9480-6e92ffff51e7");
    if (!canonical36) console.warn("  warn: canonical #36 not found by title");
    if (!keep53) console.warn("  warn: canonical #53 取材 not found");
    if (keep53 && !(keep53.body || "").includes("創作後談")) {
      console.warn("  warn: #53 body may not contain 創作後談 — still deleting #52 per plan");
    }
    for (const id of DELETE_IDS) {
      const { error: e } = await sb.from("articles").delete().eq("id", id);
      if (e) console.error("  delete fail", id, e.message);
      else console.log("  deleted", id);
    }
  } else {
    console.log("\nSkip deletes (pass --delete-candidates to remove #1 and #52).");
  }

  const { count } = await sb.from("articles").select("*", { count: "exact", head: true });
  const { data: pub } = await sb.from("articles").select("id,section,category,status,title").eq("status", "published");
  const lit = (pub || []).filter((a) => a.section === "literature");
  const acadPub = (pub || []).filter((a) => ACADEMIC.has(a.category));
  console.log("\n=== AFTER ===");
  console.log("count:", count);
  console.log("published:", (pub || []).length);
  console.log("literature published:", lit.length);
  console.log("academic published (should 0):", acadPub.length);
  lit.forEach((a) => console.log("  lit:", a.title));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
