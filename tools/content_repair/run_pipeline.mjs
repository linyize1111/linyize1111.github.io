#!/usr/bin/env node
/**
 * Content repair pipeline — PRIMARY SOURCE = live Supabase articles.
 *
 *   node tools/content_repair/run_pipeline.mjs              # analyze only
 *   node tools/content_repair/run_pipeline.mjs --apply-safe # apply safe_auto_repair
 *   node tools/content_repair/run_pipeline.mjs --export-only
 *
 * Never auto-publishes. Never invents missing prose.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { detectAnomalies, classify } from "./detect.mjs";
import { safeRepairArticle, reviewSuggestions } from "./repair.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs", "content-repair");
const APPLY = process.argv.includes("--apply-safe");
const EXPORT_ONLY = process.argv.includes("--export-only");

const FIELDS =
  "id,section,slug,title,summary,body,cover,images,category,tags,status,created_at,updated_at,published_at,sort_index,pdf_url,content_type,presentation,visibility,series,show_title,show_summary,ai_editorial,needs_ai_analysis,cover_display,source_meta";

fs.mkdirSync(OUT, { recursive: true });

const sb = createClient(process.env.MAIN_SUPABASE_URL, process.env.MAIN_SUPABASE_SERVICE_KEY);
const { data: articles, error } = await sb.from("articles").select(FIELDS).order("updated_at", { ascending: false });
if (error) {
  console.error(error);
  process.exit(1);
}

const exportPayload = {
  meta: {
    exported_at: new Date().toISOString(),
    source: "live Supabase articles @ " + (process.env.MAIN_SUPABASE_REF || "ypyiqysgfwgxcmmsylob"),
    count: articles.length,
    primary: true,
  },
  articles,
};
fs.writeFileSync(path.join(OUT, "LIVE_ARTICLES_EXPORT.json"), JSON.stringify(exportPayload, null, 2));
console.log("exported", articles.length);

if (EXPORT_ONLY) process.exit(0);

const buckets = {
  clean: [],
  safe_auto_repair: [],
  needs_review: [],
  needs_manual_restore: [],
};
const applied = [];

for (const article of articles) {
  const detection = detectAnomalies(article);
  const bucket = classify(detection);
  const entry = {
    ...detection,
    bucket,
    suggestions: reviewSuggestions(article, detection),
  };

  if (bucket === "safe_auto_repair" || (bucket === "clean" && APPLY)) {
    const { patch, changes } = safeRepairArticle(article, detection);
    entry.proposed_changes = changes;
    entry.proposed_patch_preview = {
      title: patch.title,
      cover_display: patch.cover_display,
      body_len: (patch.body || "").length,
    };

    // Always set cover_display defaults for clean rows when applying
    if (APPLY && (bucket === "safe_auto_repair" || bucket === "clean")) {
      const shouldWrite =
        changes.length > 0 ||
        JSON.stringify(patch.cover_display) !== JSON.stringify(article.cover_display || {});
      if (shouldWrite) {
        // Never touch status / published_at
        const update = {
          cover_display: patch.cover_display,
        };
        if (changes.includes("fix_title_punctuation")) update.title = patch.title;
        if (
          changes.includes("remove_duplicate_title_from_body") ||
          changes.includes("collapse_excess_blank_lines") ||
          changes.includes("strip_duplicate_h1_title") ||
          changes.includes("demote_extra_h1")
        ) {
          update.body = patch.body;
        }
        // Stamp repair provenance without claiming full AI rewrite
        const prev = article.ai_editorial && typeof article.ai_editorial === "object" ? article.ai_editorial : {};
        update.ai_editorial = {
          ...prev,
          repair: {
            at: new Date().toISOString(),
            pipeline: "content_repair_v1",
            bucket,
            changes,
            author_voice_priority: "very_high",
          },
        };
        const res = await sb.from("articles").update(update).eq("id", article.id).select("id,title").single();
        if (res.error) {
          entry.apply_error = res.error.message;
        } else {
          entry.applied = true;
          applied.push({ id: article.id, title: article.title, changes });
        }
      }
    }
  }

  if (bucket === "needs_manual_restore") {
    entry.restore_note =
      "疑似原文遺失或僅有 stub。不可憑空補寫。請人工貼回原文後再跑 pipeline。";
  }

  buckets[bucket].push(entry);
}

const report = {
  meta: {
    ran_at: new Date().toISOString(),
    apply_safe: APPLY,
    counts: {
      total: articles.length,
      clean: buckets.clean.length,
      safe_auto_repair: buckets.safe_auto_repair.length,
      needs_review: buckets.needs_review.length,
      needs_manual_restore: buckets.needs_manual_restore.length,
      applied: applied.length,
    },
  },
  applied,
  needs_manual_restore: buckets.needs_manual_restore,
  needs_review: buckets.needs_review,
  safe_auto_repair: buckets.safe_auto_repair,
  clean_ids: buckets.clean.map((x) => ({ id: x.id, title: x.title })),
};

fs.writeFileSync(path.join(OUT, "REPAIR_REPORT.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(OUT, "REPAIR_REPORT.md"),
  [
    "# Content Repair Report",
    "",
    `- Ran: ${report.meta.ran_at}`,
    `- Apply safe: ${APPLY}`,
    `- Total: ${report.meta.counts.total}`,
    `- clean: ${report.meta.counts.clean}`,
    `- safe_auto_repair: ${report.meta.counts.safe_auto_repair}`,
    `- needs_review: ${report.meta.counts.needs_review}`,
    `- needs_manual_restore: ${report.meta.counts.needs_manual_restore}`,
    `- applied: ${report.meta.counts.applied}`,
    "",
    "## needs_manual_restore",
    ...buckets.needs_manual_restore.map(
      (x) => `- **${x.title}** (\`${x.slug}\`) — flags: ${x.flags.join(", ") || "(none)"}`
    ),
    "",
    "## needs_review",
    ...buckets.needs_review.map(
      (x) => `- **${x.title}** — flags: ${x.flags.join(", ")}`
    ),
    "",
    "## Applied safe repairs",
    ...applied.map((x) => `- **${x.title}** — ${x.changes.join(", ")}`),
    "",
  ].join("\n")
);

console.log(JSON.stringify(report.meta.counts, null, 2));
console.log("wrote", path.join(OUT, "REPAIR_REPORT.md"));
