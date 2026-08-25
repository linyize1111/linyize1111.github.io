# 0007 Migration Safety Review (V3)

Date: 2026-08-06  
Status: **NOT applied to production** (per V3 instructions)

## Production schema check

Live `articles` columns (service-role probe):

`body, category, cover, created_at, id, images, pdf_url, published_at, section, slug, sort_index, status, summary, tags, title, updated_at`

None of the V3 columns exist yet. Adding them with `IF NOT EXISTS` is non-destructive.

## Changes vs proposal

| Item | Proposal | Reviewed decision |
|---|---|---|
| `presentation` | nullable + check | Keep nullable until AI migration accepted |
| `visibility` | NOT NULL default public | Keep; backfill academic → `private` |
| RLS | visibility-based | Replaces category-hardcoded 0006 if applied |
| `needs_ai_analysis` | (not in proposal) | Added — marks legacy rows for admin badge |

## How to apply (manual)

1. Dashboard → SQL Editor → backup / export articles JSON.
2. Run `0007_ai_first_content_model.sql` inside a transaction (file wraps `begin/commit`).
3. Smoke with anon key:
   - academic / `visibility=private` → 0 rows
   - `visibility=public` published → listable
   - `visibility=unlisted` published → readable by slug, not in public list queries
4. Do **not** bulk-set presentation from length heuristics. Use `docs/ai-first-v3/AI_MIGRATION_REVIEW_V3.md` after human review.

## App compatibility

Frontend selects `*` / optional V3 fields and falls back:

- missing `presentation` → render `article-lite`, admin shows needs-AI badge
- missing `visibility` → treat as public (pre-migration)
- no threshold classification at runtime
