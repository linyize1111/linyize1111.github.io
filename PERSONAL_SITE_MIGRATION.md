# Personal Site — Supabase Exit & Migration

**Status:** CUTOVER COMPLETE (Plan A static) — production serves `content/cms/` via GitHub Pages. Personal-site Supabase project `ypyiqysgfwgxcmmsylob` is **ready to pause** after Founder confirms manual Dashboard pause (CLI token not available in automation).

**Scope:** `linyize1111.github.io` personal site root (articles / portfolio / CMS).  
**Out of scope:** `acg-portal/` subdirectory (separate Supabase project), ACG Portal / Yoru Archive / 漫畫工具, `service-a-alpha`, Render Free Postgres.

---

## 1. Preflight snapshot

| Item | Value |
|------|--------|
| Repo | `https://github.com/linyize1111/linyize1111.github.io.git` |
| Production branch | `main` |
| Cutover commits | `8a07f28` (static flip), `ddfe448` (storage mirror) |
| Deploy | GitHub Pages workflow → https://linyize1111.github.io/ |
| Data source | `assets/js/data-source-config.js` → `source: "static"` |

---

## 2. Supabase inventory (personal site only)

| Surface | Detail | Post-cutover |
|---------|--------|--------------|
| Project ref | `ypyiqysgfwgxcmmsylob` | Pause when ready (rollback window) |
| Public reads | articles, site_sections, analytics snapshot | Served from Git JSON |
| Storage | `article-images` (46 objects mirrored) | `images/cms/notes/` on Pages |
| Auth / admin | Google OAuth + `admins` | `admin.html` still references Supabase config for rollback; not used by public pages |
| Visitor writes | `record_page_view` RPC | Frozen at cutover snapshot (`analytics_snapshot.json`) |

---

## 3. Architecture — Plan A (static)

Production public pages load:

- `content/cms/articles.json`, `site_sections.json`, `analytics_snapshot.json`
- `images/cms/notes/*` for inlined article media
- No `@supabase/supabase-js`, no `supabase-config.js`, no Supabase CSP `connect-src` on public HTML

**Rollback:** set `CMS_DATA_CONFIG.source = "supabase"`, restore Supabase script tags on public pages, redeploy Pages, **resume** paused Supabase project if applicable.

---

## 4. Backup

Location (outside repo):

`C:\Users\jay09\OneDrive\Desktop\LYZ-workspace\personal-site-migration-backups\20260825-145609`

Verified before cutover: 46 articles, 10 sections, 14 referenced storage objects, restore script OK.

---

## 5. Tooling

| Command | Purpose |
|---------|---------|
| `npm run export:static` | Refresh `content/cms/*` from live anon API |
| `npm run test:parity` | Live vs static field parity |
| `npm run test:security` | Static-mode guardrails |
| `npm test` | security + parity |
| `node tools/mirror_storage_to_static.mjs` | Rewrite Storage URLs → `images/cms/notes/` |
| `node tools/verify_backup_restore.mjs <dir>` | Offline backup integrity |

---

## 6. Cutover verification (2026-08-25)

| Gate | Result |
|------|--------|
| Parity live↔static | **PASS** 46/46 |
| `npm test` | **PASS** |
| GitHub Pages deploy | **PASS** SHA `ddfe448` |
| Production smoke (Playwright) | **PASS** 5/5 — zero requests to `ypyiqysgfwgxcmmsylob.supabase.co` |
| Secret scan (CMS + public bundle) | **PASS** |
| Backup restore | **PASS** |

---

## 7. Manual pause (Founder)

Supabase CLI / Management API token was not available in the automation environment.

**Pause only project `ypyiqysgfwgxcmmsylob`:**

1. [Supabase Dashboard](https://supabase.com/dashboard/project/ypyiqysgfwgxcmmsylob/settings/general)
2. **Settings → General → Pause project**
3. Confirm site still loads at https://linyize1111.github.io/

Do **not** delete the project until the rollback window ends.

---

## 8. Secrets policy

- Never commit `.env`, service_role, DB URLs, or backup trees
- `supabase-config.js` retains anon key for admin rollback path only; removed from public page script tags
- Neon / Render DB credentials never introduced for Plan A

---

## 9. Stop boundaries observed

- Did not modify 推薦系統 / ACG Portal Supabase / 漫畫工具 / service-a-alpha
- Did not delete Supabase project or backups
- Did not force-push
