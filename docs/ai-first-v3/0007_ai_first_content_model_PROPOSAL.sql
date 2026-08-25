-- 0007_ai_first_content_model_PROPOSAL.sql
-- REVIEW FIRST. Do not run directly on production without backup/dry-run.

alter table public.articles
  add column if not exists content_type text,
  add column if not exists presentation text,
  add column if not exists visibility text not null default 'public',
  add column if not exists series text,
  add column if not exists show_title boolean,
  add column if not exists show_summary boolean,
  add column if not exists ai_editorial jsonb not null default '{}'::jsonb,
  add column if not exists source_meta jsonb not null default '{}'::jsonb,
  add column if not exists cover_display jsonb not null default '{}'::jsonb;

alter table public.articles drop constraint if exists articles_visibility_check;
alter table public.articles add constraint articles_visibility_check
  check (visibility in ('public','unlisted','private'));

alter table public.articles drop constraint if exists articles_presentation_check;
alter table public.articles add constraint articles_presentation_check
  check (presentation is null or presentation in (
    'fragment','photo-note','journal','article-lite','longform',
    'review','reference','quote','fiction','poetry'
  ));

-- Privacy must depend on visibility, never AI/category/front-end CSS.
drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
  for select to anon, authenticated
  using (
    public.is_admin()
    or (status='published' and visibility in ('public','unlisted'))
  );

-- List query must additionally filter visibility='public'.
-- unlisted remains readable only when URL is known.
