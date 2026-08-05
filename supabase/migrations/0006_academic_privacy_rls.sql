-- 0006_academic_privacy_rls.sql
-- P0: anon/authenticated 不可讀學術分類文章（即使 status=published）
-- admin 仍可讀全部

drop policy if exists articles_public_read on public.articles;

create policy articles_public_read on public.articles
  for select
  to anon, authenticated
  using (
    public.is_admin()
    or (
      status = 'published'
      and coalesce(category, '') not in (
        '資訊安全',
        '機器學習',
        '程式語言',
        '人文'
      )
    )
  );

comment on policy articles_public_read on public.articles is
  'Published public read, excluding academic categories; admins see all.';
