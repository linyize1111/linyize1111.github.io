import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const sb = createClient(process.env.MAIN_SUPABASE_URL, process.env.MAIN_SUPABASE_SERVICE_KEY);
const fields = "id,section,slug,title,summary,body,cover,images,category,tags,status,created_at,updated_at,published_at,sort_index,pdf_url,content_type,presentation,visibility,series,show_title,show_summary,ai_editorial,needs_ai_analysis,cover_display,source_meta";
const { data, error } = await sb.from("articles").select(fields).order("updated_at", { ascending: false });
if (error) { console.error(error); process.exit(1); }

const outDir = path.join("docs", "content-repair");
fs.mkdirSync(outDir, { recursive: true });
const payload = {
  meta: {
    exported_at: new Date().toISOString(),
    source: "live Supabase articles @ ypyiqysgfwgxcmmsylob",
    count: (data||[]).length,
    note: "PRIMARY SOURCE for repair pipeline — not offline V3 packs",
  },
  articles: data || [],
};
fs.writeFileSync(path.join(outDir, "LIVE_ARTICLES_EXPORT.json"), JSON.stringify(payload, null, 2));
console.log("exported", payload.meta.count, "→ docs/content-repair/LIVE_ARTICLES_EXPORT.json");
const sizes = (data||[]).map(a => ({ title: a.title, body: (a.body||"").length, titleLen: (a.title||"").length, presentation: a.presentation }));
console.log(sizes.slice(0,5));
