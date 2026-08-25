-- 0007_ai_first_content_model.sql
-- REVIEWED proposal for AI-first content model (V3).
-- DO NOT apply blindly. Backup first. Prefer SQL Editor dry-run / transaction.
--
-- Safety notes vs production (checked 2026-08-06):
--   * Current articles columns: id, section, slug, title, summary, body, cover,
--     images, category, tags, pdf_url, status, sort_index, published_at,
--     created_at, updated_at. None of the new columns exist yet — ADD is safe.
--   * presentation stays NULLABLE (no NOT NULL) until AI migration reviewed.
--   * visibility defaults to 'public' so existing published rows keep working.
--   * Academic privacy: set visibility='private' for academic categories after
--     columns exist (see backfill below). RLS then uses visibility, not category names.
--   * This replaces 0006 category-hardcoded academic exclusion if that was applied.
--
-- Apply order: backup → run this file → verify anon cannot read visibility=private
-- → backfill presentation via AI migration review (not automatic).

begin;

alter table public.articles
  add column if not exists content_type text,
  add column if not exists presentation text,
  add column if not exists visibility text not null default 'public',
  add column if not exists series text,
  add column if not exists show_title boolean,
  add column if not exists show_summary boolean,
  add column if not exists ai_editorial jsonb not null default '{}'::jsonb,
  add column if not exists source_meta jsonb not null default '{}'::jsonb,
  add column if not exists cover_display jsonb not null default '{}'::jsonb,
  add column if not exists needs_ai_analysis boolean not null default true;

alter table public.articles drop constraint if exists articles_visibility_check;
alter table public.articles add constraint articles_visibility_check
  check (visibility in ('public', 'unlisted', 'private'));

alter table public.articles drop constraint if exists articles_presentation_check;
alter table public.articles add constraint articles_presentation_check
  check (
    presentation is null
    or presentation in (
      'fragment', 'photo-note', 'journal', 'article-lite', 'longform',
      'review', 'reference', 'quote', 'fiction', 'poetry'
    )
  );

-- Mark existing rows as needing AI review until presentation is set.
update public.articles
set needs_ai_analysis = true
where presentation is null;

-- Soft academic privacy via visibility (no AI involvement).
update public.articles
set visibility = 'private'
where coalesce(category, '') in ('資訊安全', '機器學習', '程式語言', '人文')
  and visibility = 'public';

-- Public read: published + visibility public|unlisted. Admins see all.
-- List pages must still filter visibility='public' in the query.
drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
  for select
  to anon, authenticated
  using (
    public.is_admin()
    or (
      status = 'published'
      and visibility in ('public', 'unlisted')
    )
  );

comment on column public.articles.presentation is
  'Frontend renderer key. NULL = treat as article-lite + needs_ai_analysis.';
comment on column public.articles.visibility is
  'public = listable; unlisted = URL-only; private = admin-only.';
comment on column public.articles.ai_editorial is
  'AI provenance: version, analyzed_at, provider, model, confidence, reason, edit_level, flags, human_review_required.';
comment on column public.articles.needs_ai_analysis is
  'True until a human-accepted AI (or manual) presentation exists.';

commit;
