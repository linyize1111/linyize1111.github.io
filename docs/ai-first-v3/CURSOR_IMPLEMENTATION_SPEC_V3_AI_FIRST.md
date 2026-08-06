# CURSOR IMPLEMENTATION SPEC V3 — AI-FIRST EDITORIAL CMS

## 0. Non-negotiable principles

1. AI understands content; deterministic code enforces security and data validity.
2. No character-count / image-count / heading-count rule may decide semantic category or presentation.
3. AI is an editor, not a ghostwriter. Preserve author voice by default.
4. AI never auto-publishes and never silently overwrites accepted manual metadata.
5. Public renderer must use stored metadata; do not re-classify at runtime.

Read first:
- `AI_EDITORIAL_POLICY_V3.md`
- `AI_EDITORIAL_PROMPT_V3.md`
- `AI_ANALYZER_SCHEMA_V3.json`
- `CONTENT_MODEL_V3_AI_FIRST.md`

## 1. Privacy / source-of-truth P0

Before AI work, remove all embedded article fallback data from public HTML, especially academic titles/PDFs. Public source must not contain private academic fixtures.

Verify the live DB RLS migration. Do not assume a migration file existing in GitHub means production has applied it.

## 2. Database

Review and apply `0007_ai_first_content_model_PROPOSAL.sql` after backup.

Do not make `presentation` NOT NULL immediately. Existing rows should be nullable until AI migration is reviewed. Missing presentation renders safely as `article-lite` plus admin `needs AI review` badge.

## 3. AI endpoint architecture

DO NOT put model/API secrets in GitHub Pages JS.

Implement a server-side endpoint, preferably Supabase Edge Function `editorial-analyze`:

Input:
```json
{
  "article": {
    "id": "optional",
    "title": "...",
    "body": "full markdown",
    "category": "...",
    "tags": [],
    "cover": null,
    "images": []
  },
  "mode": "analyze_and_format"
}
```

Server responsibilities:
- verify authenticated admin;
- call configured model using server secret;
- force structured JSON matching `AI_ANALYZER_SCHEMA_V3.json`;
- reject schema-invalid output;
- return analysis only; do not write article automatically.

The provider/model should be configurable. Cursor may use its own AI to perform the one-time 55-article migration, but the website runtime still needs a server endpoint if AI analysis is available in admin UI.

## 4. Admin UX

Add explicit button: `AI 整理與判斷`.

Show a diff/review panel with:
- title + show_title
- category / content_type / presentation
- semantic summary + show_summary
- tags / series
- edit_level
- flags
- confidence + short reason
- body diff

Actions:
- `全部採用`
- `只採用分類與呈現`
- `只採用排版修正`
- `逐項勾選`
- `放棄 AI 建議`

Never silently apply AI results when the user merely pastes text.

## 5. Remove semantic heuristics

Refactor/remove the current logic based on:
- `SHORT_CHARS`
- `LONG_CHARS`
- `bodyPlainLen()` deciding compactness
- image count deciding photo-note semantics
- first non-empty line `< 120` deciding title and deleting that line
- regex deciding category as final answer

Regex is still fine for deterministic cleanup such as BOM/zero-width/social UI junk detection, but not for semantic classification.

If AI is unavailable: leave fields manual and show `AI unavailable`; do not guess.

## 6. Renderer

Use only stored `presentation`:

```js
const renderer = PRESENTATIONS[article.presentation] || PRESENTATIONS['article-lite'];
renderer(article);
```

`show_title` and `show_summary` come from stored fields. A presentation may have sensible visual defaults, but it must not override explicit per-article values.

## 7. Semantic formatting

AI may return a cleaned full Markdown body. Apply it only after diff review.

Formatting target includes:
- paragraph boundaries and blank lines;
- accidental H1/H2 hierarchy;
- lists / quotes;
- duplicated copied title;
- paste pollution;
- image placement and captions;
- obvious typo/repeated words.

Do not normalize poetry line breaks, fiction pacing, deliberate fragments, or author-specific punctuation merely for consistency.

## 8. 55-article AI migration

Do not generate a script that maps by length thresholds.

Cursor Agent should open the full article JSON and semantically review EACH article using the V3 prompt/schema. For each article produce a proposal record:

```json
{
  "id": "...",
  "before": {...},
  "ai_proposal": {...},
  "accepted": false
}
```

Then produce `AI_MIGRATION_REVIEW_V3.md` grouped by:
- safe metadata/format-only;
- body copy-edit proposed;
- editorial/fact-check review required;
- duplicate/delete candidates.

Do not update Supabase until the proposals are reviewed.

## 9. Voice-preservation regression test

Add tests/fixtures covering:
- two-line fragment remains two-line fragment;
- poetry whitespace preserved;
- casual first-person note is not rewritten into formal prose;
- semantic summary does not begin with `本文` / `作者` / `旨在` by default;
- AI cannot auto-publish;
- invalid AI JSON is rejected;
- AI unavailable does not trigger threshold fallback.

## 10. Acceptance criteria

V3 is complete only when:
- no runtime semantic threshold classification remains;
- AI analysis is server-side and schema validated;
- admin can review a diff before applying;
- renderer consumes stored presentation/show_title/show_summary;
- public HTML contains no academic fallback data;
- 55 legacy records have a semantic AI review proposal;
- author voice policy is included in analyzer prompt and tests.
