# Personal Site — Supabase Exit & Migration Readiness

**Status:** CUTOVER READY (Plan A static) — production still defaults to Supabase until an explicit cutover task flips `CMS_DATA_CONFIG.source`.

**Scope:** `linyize1111.github.io` personal site root (articles / portfolio / CMS).  
**Out of scope:** `acg-portal/` subdirectory, ACG Portal / Yoru Archive / 漫畫工具, `service-a-alpha`, Render Free Postgres, pausing/deleting Supabase.

---

## 1. Preflight snapshot

| Item | Value |
|------|--------|
| Repo | `https://github.com/linyize1111/linyize1111.github.io.git` |
| Local path | `C:\Users\jay09\OneDrive\Desktop\LYZ-workspace\linyize1111.github.io` |
| Branch | `migration/personal-site-supabase-exit` (from clean `main` @ `2288bed`) |
| Framework | Static HTML + vanilla JS on GitHub Pages |
| Build | None (Pages serves files as-is; `.nojekyll`) |
| Deploy | GitHub Pages → https://linyize1111.github.io/ |
| Render | Not used for this site |
| Tests | `npm test` → security + live↔static parity |

---

## 2. Supabase inventory

| Surface | Detail | Replaceability |
|---------|--------|----------------|
| Project | `ypyiqysgfwgxcmmsylob` (independent from ACG) | Keep until cutover; do not pause |
| Client | CDN `@supabase/supabase-js@2` + `assets/js/supabase-*.js` | Dual-source via `cms-data.js` |
| Tables | `articles`, `site_sections`, `admins`, `site_analytics`, `visit_events` | Articles/sections → Git JSON/MD |
| RPCs | `is_admin()`, `record_page_view()` | Admin OAuth stays on Supabase until cutover; analytics writes deferred under Plan A |
| Storage | Public bucket `article-images` (14 referenced objects backed up) | Keep URLs until media cutover; objects copied outside repo |
| Auth | Google OAuth + `admins` whitelist (Founder-only) | Not multi-user password Auth |
| Realtime | None on personal site | N/A |
| Payments / sensitive PII | None | N/A |
| Frontend key | **anon** only in `supabase-config.js` (public by design) | Never put Neon/DB/service_role in frontend |

Visitor writes today: analytics RPC only (not UGC). Content writes: Founder via `admin.html`.

---

## 3. Chosen architecture — **Plan A (static)**

**Why:** Founder-only editorial content; no visitor-authored content. Existing `literature/` / `notes/` MD already align with a Git-backed CMS. Analytics visitor counters are non-critical and can freeze as a snapshot at cutover (or stay on old Supabase until a later task).

**Plan B (Render API + Neon Free Postgres)** deferred — not required for durable public reads. Do **not** use Render Free PostgreSQL.

### Cutover flip (future task only)

1. Re-run `npm run export:static` + `npm run test:parity`
2. Set `window.CMS_DATA_CONFIG.source = "static"` in `assets/js/data-source-config.js`
3. Deploy Pages
4. Keep Supabase project alive for rollback window
5. Optionally mirror Storage objects into `images/cms/` and rewrite URLs

Rollback: set `source` back to `"supabase"` and redeploy.

---

## 4. Backup

Location (outside repo):

`C:\Users\jay09\OneDrive\Desktop\LYZ-workspace\personal-site-migration-backups\20260825-145609`

Contents:

- `data/articles.json` (46 published)
- `data/site_sections.json` (10)
- `data/site_analytics.json` (page_views / unique_visitors snapshot)
- `schema/*.sql` (repo migrations copy)
- `storage/objects/*` (14 public media files) + `url_list.txt`
- `auth/AUTH_INVENTORY.md` (no password hashes / no email dumps)
- `checksums/SHA256SUMS.txt`
- `MANIFEST.json`

**Local restore verification:** `node tools/verify_backup_restore.mjs <backupDir>` → OK.

**Limitation (Founder action if full forensic dump needed):** anon REST cannot export drafts, `auth.users`, `admins` rows, or raw `visit_events`. Use Dashboard SQL / one-shot local `service_role` dump (never commit). Supabase CLI was not logged in (`supabase login` required).

---

## 5. Migration tooling (idempotent, dry-run, fail-closed)

| Command | Purpose |
|---------|---------|
| `npm run export:static:dry` | Preview export without write |
| `npm run export:static` | Write `content/cms/*` from live anon API |
| `node tools/export_supabase_to_static.mjs --from-backup <dir>` | Export from offline backup |
| `npm run test:parity` | Live vs static field parity |
| `npm run test:security` | Dual-source defaults + no secret markers |
| `npm test` | security + parity |

Static artifact: `content/cms/{articles,site_sections,analytics_snapshot,manifest}.json` + `content/cms/markdown/{literature,notes}/*.md`.

---

## 6. Backend / Render API

Not required for Plan A. Prefer GitHub Pages + static JSON. Existing `package.json` Express deps are unused for Pages hosting (`server.js` absent). No Neon credentials introduced.

---

## 7. Frontend dual-source

| File | Role |
|------|------|
| `assets/js/data-source-config.js` | `source: "supabase"` **production default** |
| `assets/js/cms-data.js` | Unified reads (Supabase \| static) |
| `assets/js/cms-public.js` | Consumes `CmsData` |
| `assets/js/analytics.js` | Static mode: snapshot only, **no RPC write** |

Pages wired: `index.html`, `about.html`, `literature.html`, `directory.html`, `note.html`.  
`admin.html` remains Supabase-only until cutover (intentional).

---

## 8. Delta / sync plan

While production stays on Supabase:

1. Edit in `admin.html` as today.
2. Periodically: `npm run export:static && npm test`.
3. Commit refreshed `content/cms/` so static lag is bounded.
4. After cutover to static: editorial workflow becomes Git MD/JSON (or a later Plan B admin API).

No automated bidirectional sync — one-way export is the fail-closed path.

---

## 9. Test results (this readiness run)

- Backup restore verify: **PASS** (46 articles, 10 sections, 14 storage objects)
- Export dry-run + export: **PASS**
- Parity live↔static: **PASS** (46/46, 0 mismatches)
- Security/guardrail tests: **PASS**
- `npm test`: run after commit locally

---

## 10. Secrets policy

- Never commit: `.env`, dumps, Storage backup trees, connection strings, service_role
- Anon key in frontend is intentional public client key
- Neon/DB credentials must never appear in frontend
- `.gitignore` blocks `.env*` and backup folders if accidentally placed in-repo

---

## 11. Stop boundaries observed

- Did not modify 推薦系統 / ACG / 漫畫工具 / service-a-alpha
- Did not pause/delete Supabase
- Did not push / merge / deploy production
- Did not use Render Free Postgres or open Neon/Render payment flows
- Architecture blockers (multi-user passwords, private Storage, payments, complex Realtime, unreplaceable RPCs for public reads): **none blocking Plan A public reads**. Admin OAuth + analytics RPC remain on Supabase until cutover by design.
