/**
 * Apply semantic card metadata only into articles.ai_editorial.display.
 * Never touches title / body / summary / category / presentation / status / published_at.
 *
 * Usage:
 *   node tools/apply_semantic_card_backfill.mjs           # apply
 *   node tools/apply_semantic_card_backfill.mjs --dry-run  # preview only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const proposalsPath = path.join(root, "docs", "semantic-cards", "PROPOSALS.json");
const dryRun = process.argv.includes("--dry-run");

const url = process.env.MAIN_SUPABASE_URL;
const key = process.env.MAIN_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Need MAIN_SUPABASE_URL + MAIN_SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const pack = JSON.parse(fs.readFileSync(proposalsPath, "utf8"));
const sb = createClient(url, key);
const preview = [];
let ok = 0;
let fail = 0;

for (const p of pack.proposals || []) {
  const { data: row, error: readErr } = await sb
    .from("articles")
    .select("id,title,body,summary,category,presentation,status,published_at,ai_editorial")
    .eq("id", p.id)
    .single();
  if (readErr || !row) {
    fail++;
    console.error("read fail", p.title, readErr?.message);
    continue;
  }

  const prev = row.ai_editorial && typeof row.ai_editorial === "object" ? row.ai_editorial : {};
  const display = Object.assign({}, prev.display || {}, {
    card_topic: p.card_topic || "",
    card_label: p.card_label || "",
    show_card_label: !!p.show_card_label && !!p.card_label,
  });
  const next = Object.assign({}, prev, {
    display,
    card_topic: display.card_topic,
    card_label: display.card_label,
    show_card_label: display.show_card_label,
    semantic_card_version: "v1",
    semantic_card_at: new Date().toISOString(),
    semantic_card_source: "semantic-card-backfill-v1",
  });

  const entry = {
    id: p.id,
    title: row.title,
    before: prev.display || null,
    after: display,
    untouched: {
      title: row.title,
      summary: row.summary,
      category: row.category,
      presentation: row.presentation,
      status: row.status,
      published_at: row.published_at,
      body_len: String(row.body || "").length,
    },
  };
  preview.push(entry);

  if (dryRun) {
    console.log("DRY", row.title, "→", display.card_topic, "/", display.card_label || "(no label)");
    ok++;
    continue;
  }

  const { error: upErr } = await sb
    .from("articles")
    .update({ ai_editorial: next })
    .eq("id", p.id);
  if (upErr) {
    fail++;
    console.error("update fail", p.title, upErr.message);
  } else {
    ok++;
    p.accepted = true;
    p.accepted_at = new Date().toISOString();
    console.log("ok", row.title, "→", display.card_topic, "/", display.show_card_label ? display.card_label : "(label hidden)");
  }
}

const outPreview = path.join(root, "docs", "semantic-cards", dryRun ? "PREVIEW_DIFF.json" : "APPLIED_DIFF.json");
fs.writeFileSync(
  outPreview,
  JSON.stringify({ generated_at: new Date().toISOString(), dryRun, ok, fail, preview }, null, 2)
);
if (!dryRun) {
  fs.writeFileSync(proposalsPath, JSON.stringify(pack, null, 2));
}
console.log(dryRun ? "DRY-RUN done" : "APPLIED", "ok", ok, "fail", fail, "→", outPreview);
