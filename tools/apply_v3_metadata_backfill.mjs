/**
 * Apply V3 metadata from AI_MIGRATION_PROPOSALS_V3.json (metadata only, no body overwrite).
 * Marks proposals accepted after successful update.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const path = "../docs/ai-first-v3/AI_MIGRATION_PROPOSALS_V3.json";
const pack = JSON.parse(fs.readFileSync(path, "utf8"));
const sb = createClient(process.env.MAIN_SUPABASE_URL, process.env.MAIN_SUPABASE_SERVICE_KEY);

const ACADEMIC = new Set(["資訊安全", "機器學習", "程式語言", "人文"]);
let ok = 0;
let fail = 0;

for (const p of pack.proposals || []) {
  const a = p.ai_proposal || {};
  const visibility =
    a.visibility ||
    (ACADEMIC.has(a.category) || ACADEMIC.has(p.before?.category) ? "private" : "public");

  const payload = {
    category: a.category || p.before?.category || null,
    content_type: a.content_type || null,
    presentation: a.presentation || "article-lite",
    visibility,
    series: a.series || null,
    show_title: typeof a.show_title === "boolean" ? a.show_title : true,
    show_summary: typeof a.show_summary === "boolean" ? a.show_summary : false,
    needs_ai_analysis: !a.presentation,
    ai_editorial: {
      version: "v3",
      analyzed_at: new Date().toISOString(),
      provider: "v2_refined_semantic_pack",
      model: "migration-backfill",
      confidence: a.confidence ?? 0.8,
      reason: a.reason || "Automated metadata apply from V3 proposals",
      edit_level: a.edit_level || "format_only",
      flags: a.flags || [],
      human_review_required: false,
      source: p.source || "v3_proposals",
    },
  };

  // Prefer proposal summary when non-empty and not report-tone
  if (a.summary && !/^(本文|作者|旨在)/.test(String(a.summary).trim())) {
    payload.summary = a.summary;
  }

  const res = await sb.from("articles").update(payload).eq("id", p.id).select("id,presentation,visibility").single();
  if (res.error) {
    fail++;
    console.error("fail", p.title, res.error.message);
  } else {
    ok++;
    p.accepted = true;
    p.accepted_at = new Date().toISOString();
    console.log("ok", res.data.presentation, res.data.visibility, p.title);
  }
}

fs.writeFileSync(path, JSON.stringify(pack, null, 2));
console.log("DONE ok", ok, "fail", fail);

const { data } = await sb.from("articles").select("presentation,visibility,status,category");
const byP = {};
const byV = {};
for (const r of data || []) {
  byP[r.presentation || "null"] = (byP[r.presentation || "null"] || 0) + 1;
  byV[r.visibility || "null"] = (byV[r.visibility || "null"] || 0) + 1;
}
console.log("presentation", byP);
console.log("visibility", byV);

// anon smoke
const anon = createClient(process.env.MAIN_SUPABASE_URL, process.env.MAIN_SUPABASE_ANON_KEY);
const { data: priv } = await anon.from("articles").select("id,title,category,visibility").eq("visibility", "private");
const { data: pub } = await anon.from("articles").select("id").eq("status", "published").eq("visibility", "public");
const { data: acad } = await anon.from("articles").select("id,category").in("category", [...ACADEMIC]);
console.log("anon private rows", (priv || []).length);
console.log("anon public published", (pub || []).length);
console.log("anon academic category rows", (acad || []).length);
