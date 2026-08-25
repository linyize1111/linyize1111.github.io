# Content Repair + Media Refactor (v1)

Branch: `cursor/content-repair-media-v1`  
Primary source: **live Supabase `articles`** (`docs/content-repair/LIVE_ARTICLES_EXPORT.json`)  
Offline V3 packs are **not** used as repair source of truth.

## Part 1 — Content repair

### Pipeline
```bash
# load MAIN_SUPABASE_* from .handoff/main_secrets.env
node tools/content_repair/run_pipeline.mjs              # analyze only
node tools/content_repair/run_pipeline.mjs --apply-safe # safe mechanical repairs only
```

Outputs:
- `LIVE_ARTICLES_EXPORT.json` — full live dump
- `REPAIR_REPORT.json` / `REPAIR_REPORT.md` — buckets + applied changes

### Buckets
| Bucket | Meaning |
|--------|---------|
| `safe_auto_repair` | Mechanical fixes only (duplicate title line, blank lines, H1 demote, cover_display defaults) |
| `needs_review` | AI/human suggestions only (summary truncation, heading skips, prose titles still in body) |
| `needs_manual_restore` | Suspected missing source text / stubs — **never invent prose** |
| `clean` | No content flags (may still receive cover_display defaults on `--apply-safe`) |

### Rules enforced
- `author_voice_priority = very_high`
- No length/first-line heuristics to decide presentation/type
- Never auto-publish / never touch `status` or `published_at`
- Prefer layout-only edits

### Latest apply result (see REPAIR_REPORT.md)
- needs_manual_restore: 搭建自己的網站、普通心理學筆記、Python 學習紀錄
- needs_review: 《如何閱讀一本書》閱讀筆記、機器學習基石課程筆記
- Body field fixes: duplicate-title strip is now guarded (refuses to wipe short fragments). Two articles briefly emptied by an overly aggressive strip were restored from the pre-apply live export.
- Most rows: `cover_display` defaults by presentation

## Part 2 — Media display

### Cover (`cover_display` jsonb, migration `0008`)
```json
{ "style": "hero|inline|none", "ratio": "16/9|4/3|3/2|1/1|auto", "fit": "cover|contain", "position": "center center" }
```
- Missing keys → presentation defaults (fragment/quote → none; review/longform → hero; photo-note → inline; …)
- Article page no longer forces every cover into a title-area hero

### Body images
- Single image: natural aspect, max-width ~720px, lightbox on click
- Consecutive images with no prose between → `.article-gallery` carousel (arrows + dots + lightbox)
- Not stacked as a tall vertical strip

### Cards
- fragment/quote: no cover
- photo-note: photo-priority ratio
- review/longform: editorial 16:9 card media
- carousel dots + arrow controls on multi-image cards

### Files
- `assets/js/article-media.js` (new)
- `assets/js/cms-public.js`, `assets/js/page-list.js`
- `assets/css/site-custom.css`
- HTML cache bump `?v=media-repair-1`

## Backward compatibility
- Old rows with empty `cover_display {}` keep working via presentation defaults
- Legacy article field select still falls back if new columns missing
- Existing `cover` / `images` columns unchanged
- Migration 0008 only comments + `IF NOT EXISTS` for `cover_display`

## Tests
```bash
node tests/content_repair.test.mjs
node tests/media_refactor.test.mjs
```
