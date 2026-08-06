/**
 * Build AI_MIGRATION_REVIEW_V3.md + proposals JSON from V2 refined pack + live DB.
 * Does NOT write to Supabase. Proposals remain accepted:false.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve("..");
const outDir = path.join(root, "docs", "ai-first-v3");
const refinedPath = path.join(outDir, "ALL_ARTICLES_REFINED_V2.json");

const refined = JSON.parse(fs.readFileSync(refinedPath, "utf8"));
const refinedById = new Map((refined.articles || []).map((a) => [a.id, a]));

const url = process.env.MAIN_SUPABASE_URL;
const key = process.env.MAIN_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Need MAIN_SUPABASE_* env");
  process.exit(1);
}
const sb = createClient(url, key);
const { data: live, error } = await sb.from("articles").select("*").order("updated_at", { ascending: false });
if (error) throw error;

const proposals = [];
const groups = {
  safe_metadata_format: [],
  body_copy_edit: [],
  editorial_factcheck: [],
  duplicate_delete: [],
};

for (const row of live || []) {
  const r = refinedById.get(row.id) || null;
  const presentation = r?.presentation || null;
  const proposal = {
    id: row.id,
    title: row.title,
    before: {
      section: row.section,
      category: row.category,
      status: row.status,
      summary: row.summary,
      tags: row.tags,
      presentation: row.presentation ?? null,
      visibility: row.visibility ?? null,
      show_title: row.show_title ?? null,
      show_summary: row.show_summary ?? null,
    },
    ai_proposal: r
      ? {
          title: r.title,
          show_title: r.show_title !== false && r.presentation !== "fragment" && r.presentation !== "quote",
          summary: r.summary || "",
          show_summary: !!r.show_summary,
          category: r.category,
          content_type: r.content_type,
          presentation: r.presentation,
          tags: r.tags || [],
          series: r.series || null,
          edit_level: r.revision_level || "format_only",
          clean_body: null, // body edits require explicit future AI pass; metadata-first
          editorial_state: (r.risk_flags || []).length ? "needs_review" : "complete",
          confidence: presentation ? 0.82 : 0.45,
          reason: r.editorial_review_note || "From semantic V2 refined pack; re-validate under V3 voice policy before accept.",
          flags: r.risk_flags || [],
          human_review_required: true,
          visibility: r.visibility || "public",
        }
      : {
          title: row.title,
          show_title: true,
          summary: row.summary || "",
          show_summary: !!row.summary,
          category: row.category,
          content_type: null,
          presentation: null,
          tags: row.tags || [],
          series: null,
          edit_level: "preserve",
          clean_body: null,
          editorial_state: "needs_review",
          confidence: 0.2,
          reason: "No V2 refined match — needs full AI analysis.",
          flags: ["incomplete_body"],
          human_review_required: true,
          visibility: "public",
        },
    accepted: false,
    source: r ? "v2_refined_semantic_pack" : "live_only",
  };

  // Never treat length as decision — proposals already semantic from V2.
  proposals.push(proposal);

  const p = proposal.ai_proposal;
  if (r?.duplicate_of_id || (r?.editorial_action || "").includes("delete")) {
    groups.duplicate_delete.push(proposal);
  } else if ((p.flags || []).some((f) => /fact_check|source_needed|argument_gap|overgeneralization/.test(f)) ||
    (r?.risk_flags || []).length) {
    groups.editorial_factcheck.push(proposal);
  } else if ((p.edit_level || "").includes("edit") && p.edit_level !== "format_only" && p.edit_level !== "preserve") {
    groups.body_copy_edit.push(proposal);
  } else {
    groups.safe_metadata_format.push(proposal);
  }
}

fs.writeFileSync(
  path.join(outDir, "AI_MIGRATION_PROPOSALS_V3.json"),
  JSON.stringify({ meta: { generated_at: new Date().toISOString(), count: proposals.length, note: "accepted:false — do not apply until human review" }, proposals }, null, 2)
);

function listGroup(title, arr) {
  let md = `## ${title} (${arr.length})\n\n`;
  for (const p of arr) {
    md += `- **${p.title}** \`${p.id.slice(0, 8)}\` → presentation=\`${p.ai_proposal.presentation || "null"}\` visibility=\`${p.ai_proposal.visibility}\` category=\`${p.ai_proposal.category}\` conf=${p.ai_proposal.confidence}\n`;
    if (p.ai_proposal.reason) md += `  - ${p.ai_proposal.reason}\n`;
  }
  return md + "\n";
}

let md = `# AI_MIGRATION_REVIEW_V3

Generated: ${new Date().toISOString()}

## Rules
- Proposals are **not** applied to Supabase.
- \`accepted: false\` for every record.
- Source labels come from semantic V2 refined pack / live DB — **not** from character-count thresholds.
- Before accept: re-check author voice; reject report-tone summaries; keep poetry/fiction whitespace.
- Apply only after 0007 migration is reviewed and run, then update-by-id.

## Totals
- proposals: ${proposals.length}
- safe metadata/format-only: ${groups.safe_metadata_format.length}
- body copy-edit proposed: ${groups.body_copy_edit.length}
- editorial/fact-check review: ${groups.editorial_factcheck.length}
- duplicate/delete candidates: ${groups.duplicate_delete.length}

`;

md += listGroup("safe metadata/format-only", groups.safe_metadata_format);
md += listGroup("body copy-edit proposed", groups.body_copy_edit);
md += listGroup("editorial/fact-check review required", groups.editorial_factcheck);
md += listGroup("duplicate/delete candidates", groups.duplicate_delete);

fs.writeFileSync(path.join(outDir, "AI_MIGRATION_REVIEW_V3.md"), md);
console.log("wrote", proposals.length, "proposals");
