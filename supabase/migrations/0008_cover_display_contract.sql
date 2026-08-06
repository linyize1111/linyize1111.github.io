-- 0008_cover_display_contract.sql
-- Extends existing cover_display jsonb contract (added in 0007).
-- No new required columns. Backward compatible.
--
-- cover_display shape:
-- {
--   "style": "hero" | "inline" | "none",
--   "ratio": "16/9" | "4/3" | "3/2" | "1/1" | "auto",
--   "fit": "cover" | "contain",
--   "position": CSS object-position, e.g. "center center"
-- }
-- Missing keys → frontend defaults by presentation.

begin;

comment on column public.articles.cover_display is
  'Cover presentation: {style:hero|inline|none, ratio, fit, position}. Empty {} uses presentation defaults.';

-- Ensure column exists for environments that skipped 0007 partially
alter table public.articles
  add column if not exists cover_display jsonb not null default '{}'::jsonb;

commit;
