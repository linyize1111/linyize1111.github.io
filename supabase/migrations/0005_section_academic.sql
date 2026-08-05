-- Allow third section: academic (學科筆記，前台預設隱藏，僅 admin 導覽可見)
alter table public.articles drop constraint if exists articles_section_check;
alter table public.articles
  add constraint articles_section_check
  check (section in ('literature', 'notes', 'academic'));

comment on column public.articles.section is
  'literature=文學創作; notes=隨筆; academic=學科筆記(導覽僅 admin)';
