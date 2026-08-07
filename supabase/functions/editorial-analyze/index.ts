// supabase/functions/editorial-analyze/index.ts
// Server-side AI editorial analyzer. Secrets stay on the server.
// Deploy: supabase functions deploy editorial-analyze --project-ref <ref>
// Secrets: OPENAI_API_KEY (or ANTHROPIC_API_KEY), optional OPENAI_MODEL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const PRESENTATIONS = new Set([
  "fragment", "photo-note", "journal", "article-lite", "longform",
  "review", "reference", "quote", "fiction", "poetry",
]);
const EDIT_LEVELS = new Set([
  "preserve", "format_only", "proofread", "light_edit",
  "structural_edit", "editorial_review",
]);
const EDITORIAL_STATES = new Set([
  "complete", "fragmentary", "needs_review", "incomplete",
]);
const FLAGS = new Set([
  "possible_title_in_body", "duplicate_title", "formatting_damage", "copy_paste_noise",
  "typo", "duplicate_content", "source_needed", "fact_check", "overgeneralization",
  "argument_gap", "copyright_quote", "image_rights", "spoiler", "incomplete_body",
]);
const REQUIRED = [
  "title", "show_title", "summary", "show_summary", "category", "content_type",
  "presentation", "tags", "series", "edit_level", "clean_body", "editorial_state",
  "confidence", "reason", "flags", "human_review_required",
];
const OPTIONAL = ["card_topic", "card_label", "show_card_label"];

const SYSTEM_PROMPT = `你是 LYZ 個人網站的編輯助手。你的工作不是代筆，而是理解作者已經寫出的內容，幫忙分類、整理、校對與決定呈現方式。

作者非常在意個人聲音。author_voice_priority = very_high。不要把文章改成典型 AI 文風。除非有明確問題，否則保留原句。

## 工作順序
1. 完整閱讀 title、body、既有 metadata、圖片資訊。
2. 先判斷「這篇實際是什麼」，不要先看字數套類型。
3. 判斷是否需要顯示 title / summary，以及適合的 presentation。
4. 判斷正文需要哪個 edit_level。
5. 只做該層級必要的修改。
6. 產生真正的 semantic summary、tags、series 建議。
7. 為 fragment / photo-note / quote / journal 產生語意卡片辨識（card_topic / card_label）。
8. 檢查匯入污染、標題誤吃、排版錯誤、事實／來源／論證風險。
9. 對改稿做 AI-ism check；若變得比原文更制式、更漂亮但不像作者，回退。

## 禁止用門檻代替理解
不得使用「少於 N 字就是 fragment」「多於 N 字就是 longform」「第一行少於 N 字就是標題」等規則做語意判定。篇幅、圖片數、heading 數只能作參考訊號，不能作決策條件。
也不得用：字數判定、regex、第一個名詞、出現次數最多的詞、tags 拼接、title 截斷、body 第一行直接當標題，來產生 card_topic / card_label。

## 標題（author title）
- frontmatter title 或明確 H1：高可信。
- 普通第一行只能是「疑似標題」，除非語意結構明顯支持，不得從正文刪除。
- fragment / quote / poetry 可以 show_title=false。
- 不要為每個短感觸硬生成漂亮標題。
- card_label ≠ title。絕對不要把 AI card_label 寫進 title 欄位。

## Semantic card label（列表辨識，不是文章標題）
回答：「如果朋友問你這則短文在講什麼，你會用幾個字怎麼說？」不是「請生成專業標題」。

對 presentation 為 fragment / photo-note / quote / journal 的內容：
- card_topic：一個最能辨識的主題詞（必要時最多「卡繆與自由」這種複合），不是 tag cloud。
- card_label：約 6～18 中文字的自然口語辨識句；句型必須多樣，禁止整站都套「關於X的一則小廢文」。
- show_card_label：若正文本身已夠短、硬產 label 反而變醜，設為 false（仍可給 card_topic）。
- 可借用作者正文裡自然適合作辨識的短句，但不要機械取第一句。
- 禁止 AI 式標題：在…中尋找、從…重新審視、當…遇上、關於…的深刻反思。

## 正文修改
允許：空行、Markdown、heading、list、blockquote、圖片 caption；明顯 typo／重複字；複製貼上污染；必要時非常小幅語病修正。
避免：擅自提升文學性；口語變書面；補結論；強迫起承轉合；固定 AI 句型（不是…而是…、不僅…更…、破折號排比）；把作者尖銳立場磨平。

## Summary
語意摘要，不是正文截斷。直接、自然、短。禁止「本文」「作者」「旨在」「探討了」報告腔。

## Output
只能輸出符合 schema 的 JSON（不要 markdown fence）。clean_body 必須是完整 Markdown 正文。
必填鍵：title, show_title, summary, show_summary, category, content_type, presentation, tags, series, edit_level, clean_body, editorial_state, confidence, reason, flags, human_review_required
選填鍵：card_topic, card_label, show_card_label
presentation enum: fragment, photo-note, journal, article-lite, longform, review, reference, quote, fiction, poetry
edit_level enum: preserve, format_only, proofread, light_edit, structural_edit, editorial_review
editorial_state enum: complete, fragmentary, needs_review, incomplete
confidence < 0.55 時 human_review_required 必須為 true。`;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function validateAnalysis(raw: Record<string, unknown>) {
  const errors: string[] = [];
  const allowed = new Set([...REQUIRED, ...OPTIONAL]);
  for (const k of REQUIRED) {
    if (!(k in raw)) errors.push("missing:" + k);
  }
  for (const k of Object.keys(raw)) {
    if (!allowed.has(k)) errors.push("additional:" + k);
  }
  if (typeof raw.title !== "string") errors.push("title");
  if (typeof raw.show_title !== "boolean") errors.push("show_title");
  if (typeof raw.summary !== "string") errors.push("summary");
  if (typeof raw.show_summary !== "boolean") errors.push("show_summary");
  if (typeof raw.category !== "string") errors.push("category");
  if (typeof raw.content_type !== "string") errors.push("content_type");
  if (!PRESENTATIONS.has(String(raw.presentation))) errors.push("presentation");
  if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== "string")) errors.push("tags");
  if (!(raw.series === null || typeof raw.series === "string")) errors.push("series");
  if (!EDIT_LEVELS.has(String(raw.edit_level))) errors.push("edit_level");
  if (typeof raw.clean_body !== "string") errors.push("clean_body");
  if (!EDITORIAL_STATES.has(String(raw.editorial_state))) errors.push("editorial_state");
  if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
    errors.push("confidence");
  }
  if (typeof raw.reason !== "string" || raw.reason.length > 280) errors.push("reason");
  if (!Array.isArray(raw.flags) || raw.flags.some((f) => !FLAGS.has(String(f)))) {
    errors.push("flags");
  }
  if (typeof raw.human_review_required !== "boolean") errors.push("human_review_required");
  if (typeof raw.confidence === "number" && raw.confidence < 0.55 && raw.human_review_required !== true) {
    errors.push("low_confidence_requires_review");
  }
  if ("card_topic" in raw && typeof raw.card_topic !== "string") errors.push("card_topic");
  if ("card_label" in raw && typeof raw.card_label !== "string") errors.push("card_label");
  if ("show_card_label" in raw && typeof raw.show_card_label !== "boolean") {
    errors.push("show_card_label");
  }
  return errors;
}

function parseModelJson(text: string) {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(s);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(405, { error: "POST only" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !serviceKey) {
    return json(503, { unavailable: true, error: "Server misconfigured" }, origin);
  }

  const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: "Unauthorized" }, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const email = (userData.user.email || "").toLowerCase();
  const { data: adminRow } = await adminClient
    .from("admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  // also try case-insensitive via rpc if available
  const { data: isAdminRpc } = await userClient.rpc("is_admin");
  if (!adminRow && !isAdminRpc) {
    return json(403, { error: "Admin only" }, origin);
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!openaiKey && !anthropicKey) {
    return json(503, {
      unavailable: true,
      error: "AI unavailable: set OPENAI_API_KEY or ANTHROPIC_API_KEY secret. Do not fall back to length heuristics.",
    }, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" }, origin);
  }

  const article = (body.article || {}) as Record<string, unknown>;
  const mode = String(body.mode || "analyze_and_format");
  const signals = (article.signals || {}) as Record<string, unknown>;

  const userPrompt = JSON.stringify({
    instruction:
      "Analyze this article. Signals are REFERENCE ONLY and must not be used as classification thresholds.",
    mode,
    author_voice_priority: body.author_voice_priority || "very_high",
    article: {
      id: article.id ?? null,
      title: article.title ?? "",
      body: article.body ?? "",
      category: article.category ?? "",
      tags: article.tags ?? [],
      cover: article.cover ?? null,
      images: article.images ?? [],
      section: article.section ?? "",
      summary: article.summary ?? "",
    },
    reference_signals_only: signals,
    required_json_keys: REQUIRED,
    optional_json_keys: OPTIONAL,
  });

  let modelText = "";
  let provider = "";
  let model = "";

  try {
    if (openaiKey) {
      provider = "openai";
      model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + openaiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        return json(502, { error: "OpenAI error: " + (data.error?.message || r.status) }, origin);
      }
      modelText = data.choices?.[0]?.message?.content || "";
    } else {
      provider = "anthropic";
      model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-20250514";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          temperature: 0.2,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        return json(502, { error: "Anthropic error: " + (data.error?.message || r.status) }, origin);
      }
      modelText = (data.content || []).map((c: { text?: string }) => c.text || "").join("");
    }
  } catch (e) {
    return json(503, {
      unavailable: true,
      error: "AI call failed: " + (e instanceof Error ? e.message : String(e)),
    }, origin);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseModelJson(modelText);
  } catch (e) {
    return json(422, {
      error: "AI returned invalid JSON",
      detail: e instanceof Error ? e.message : String(e),
    }, origin);
  }

  const errors = validateAnalysis(parsed);
  if (errors.length) {
    return json(422, { error: "AI JSON failed schema validation", errors }, origin);
  }

  // Never auto-publish — analysis only
  return json(200, {
    analysis: parsed,
    meta: {
      provider,
      model,
      version: "v3",
      analyzed_at: new Date().toISOString(),
      auto_publish: false,
    },
  }, origin);
});
