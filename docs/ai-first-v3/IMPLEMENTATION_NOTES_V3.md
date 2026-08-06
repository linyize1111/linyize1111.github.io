# V3 AI-First Implementation Notes

Branch: `cursor/ai-first-editorial-v3`  
Spec source: `docs/ai-first-v3/*` (from `LYZ_SITE_AI_FIRST_V3_2026-08-06.zip`)

## What shipped on this branch

### Schema (NOT applied to production)
- `supabase/migrations/0007_ai_first_content_model.sql` — reviewed, nullable `presentation`, `visibility`, `ai_editorial`, etc.
- `supabase/MIGRATION_0007_REVIEW.md` — safety notes vs live columns.

### AI analyzer (server-side)
- `supabase/functions/editorial-analyze/index.ts`
- Admin calls via `assets/js/ai-editorial-client.js` → `POST /functions/v1/editorial-analyze`
- Schema validation: `assets/js/ai-editorial-schema.js` (+ Edge Function duplicate)
- Secrets: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (never in Pages JS)
- Returns analysis only; **never writes / never publishes**

### Admin human confirmation
- Buttons: AI 整理與判斷 / 只重分析 metadata
- Review panel with metadata + clean_body
- Actions: 全部採用 / 只採用分類與呈現 / 只採用排版修正 / 放棄
- After adopt → still must click **儲存**; status stays whatever user set (default draft on new)

### Frontend renderer
- `assets/js/presentation-registry.js` + rewritten `cms-public.js`
- Uses stored `presentation` / `show_title` / `show_summary`
- Missing presentation → `article-lite` (no length guessing)
- Public lists filter `visibility=public` (compat: academic categories treated private pre-migration)

### Heuristics removed
- `SHORT_CHARS` / `LONG_CHARS` classification
- `bodyPlainLen` / compact / photo-note length+image rules in cms-public
- first-line `< 120` auto title consumption
- auto category / auto title-from-length on save
- `suggestCategory` stubbed (no semantic decision)

### Privacy / source-of-truth
- Static `note-item` fallbacks stripped from `directory.html` / `literature.html`

### Migration proposals (not applied)
- `docs/ai-first-v3/AI_MIGRATION_REVIEW_V3.md`
- `docs/ai-first-v3/AI_MIGRATION_PROPOSALS_V3.json` (`accepted: false`)

### Tests
```bash
node tests/ai_editorial_v3.test.mjs
```

## Deploy Edge Function (when ready)
```bash
supabase functions deploy editorial-analyze --project-ref ypyiqysgfwgxcmmsylob
supabase secrets set OPENAI_API_KEY=... --project-ref ypyiqysgfwgxcmmsylob
```

## Apply 0007 (manual, after backup)
See `supabase/MIGRATION_0007_REVIEW.md`. Do not auto-apply presentation from length.
