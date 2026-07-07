-- =====================================================================
-- linyize1111.github.io  個人主網站 CMS  —  初始 schema + RLS
-- 目標 Supabase 專案：全新、獨立（與 ACG 專案完全隔離）
-- 套用方式：Supabase Dashboard → SQL Editor → 貼上整份執行
-- 安全模型：
--   * 公開（anon）只能讀取 status='published' 的文章與所有區塊文字
--   * 只有白名單 admins.email（= 登入者 Google 信箱）可寫入
--   * admins 白名單一般人 / 前端都無法讀寫，只能由開發者用 SQL / service key 改
-- =====================================================================

-- gen_random_uuid()（Supabase 預設已安裝，這裡確保存在）
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 共用：updated_at 自動更新
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. admins 白名單
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  '管理員白名單。僅能由開發者透過 SQL / service key 維護，前端無法新增。';

-- ---------------------------------------------------------------------
-- 3. is_admin()：比對登入者 JWT 的 email 是否在白名單
--    SECURITY DEFINER：略過 admins 的 RLS，讓白名單本身可保持鎖定
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

comment on function public.is_admin() is
  '回傳目前登入者 email 是否在 admins 白名單。給前端與 RLS policy 使用。';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. articles 文章（文學隨筆 + 學科筆記共用；用 section 區分）
-- ---------------------------------------------------------------------
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  section      text not null check (section in ('literature','notes')),
  slug         text not null,
  title        text not null,
  summary      text not null default '',       -- 卡片摘要
  body         text not null default '',        -- Markdown 內文
  cover        text,                            -- 主圖 URL（Storage 或外部）
  images       jsonb not null default '[]'::jsonb, -- 額外圖 / 輪播 [{src,caption}]
  category     text,                            -- 分類（隨筆/心得/創作 或 資訊安全/機器學習/程式語言/人文）
  tags         text[] not null default '{}',
  pdf_url      text,                            -- 選擇性 PDF
  status       text not null default 'draft' check (status in ('draft','published')),
  sort_index   int  not null default 0,         -- 手動排序（可選）
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (section, slug)
);

create index if not exists articles_section_status_idx
  on public.articles (section, status, published_at desc);
create index if not exists articles_category_idx
  on public.articles (category);

drop trigger if exists trg_articles_updated_at on public.articles;
create trigger trg_articles_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- 發佈時自動補 published_at
create or replace function public.articles_set_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_articles_published_at on public.articles;
create trigger trg_articles_published_at
  before insert or update on public.articles
  for each row execute function public.articles_set_published_at();

-- ---------------------------------------------------------------------
-- 5. site_sections 主要區塊文字（key -> value）
--    例：home.intro.title / home.intro.subtitle / about.body ...
-- ---------------------------------------------------------------------
create table if not exists public.site_sections (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_sections_updated_at on public.site_sections;
create trigger trg_site_sections_updated_at
  before update on public.site_sections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.articles      enable row level security;
alter table public.site_sections enable row level security;
alter table public.admins        enable row level security;

-- articles：公開讀 published；admin 讀全部 + 寫全部
drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
  for select
  to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists articles_admin_insert on public.articles;
create policy articles_admin_insert on public.articles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists articles_admin_update on public.articles;
create policy articles_admin_update on public.articles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists articles_admin_delete on public.articles;
create policy articles_admin_delete on public.articles
  for delete to authenticated
  using (public.is_admin());

-- site_sections：公開讀；admin 寫
drop policy if exists site_sections_public_read on public.site_sections;
create policy site_sections_public_read on public.site_sections
  for select to anon, authenticated
  using (true);

drop policy if exists site_sections_admin_write on public.site_sections;
create policy site_sections_admin_write on public.site_sections
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- admins：只有 admin 能讀（一般使用者連白名單都看不到）；不開放任何 API 寫入
drop policy if exists admins_admin_read on public.admins;
create policy admins_admin_read on public.admins
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 7. Grants（RLS 之外還需要 table 權限）
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.articles      to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;
grant select on public.site_sections to anon, authenticated;
grant insert, update, delete on public.site_sections to authenticated;
grant select on public.admins        to authenticated;

-- ---------------------------------------------------------------------
-- 8. 初始白名單（★ 必填 ★）
--    請把下面的 email 換成你的「Google 登入信箱」（= ACG 管理員信箱）。
--    未替換前，沒有人具備管理員權限（安全預設）。
-- ---------------------------------------------------------------------
insert into public.admins (email, note) values
  ('jay0975008815@gmail.com', '主網站站長')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------
-- 9. 主要區塊文字種子（可先建立，之後在後台編輯）
-- ---------------------------------------------------------------------
-- 注意：以下 E'...' 字串中的 \n 代表換行（前端 text 模式會轉成 <br>）
insert into public.site_sections (key, value) values
  ('home.intro.title',    'WELCOME!!!'),
  ('home.intro.subtitle', 'An average student from Taiwan'),
  ('home.featured.title', '關於本站與我'),
  ('home.featured.body',  E'我是林佾則，目前就讀於國立中山大學資訊工程學系二年級。\n\n本網站於 2020 年 12 月初試啼聲，那時十分感謝資訊社學長的指導，讓我得以搭建出這專屬於我的數位空間。雖然當時僅具雛形，卻也成為我記錄學習歷程的珍貴起點。\n\n升上大二後，我不僅在程式語言與資訊科學上持續精進，更重新拾起閱讀的習慣，廣泛涉獵文學、藝術、音樂與咖啡等多元領域。基於對美學與技術的雙重追求，我於近期著手將網站進行全方位的翻新與優化。未來，這裡將持續蛻變為我記錄技術筆記與生活思想的靜謐天地，歡迎您的駐足與閱覽。'),
  ('about.heading',       E'月季花四季盛放\n說起來，落花時節就是花開時節呢。'),
  ('about.body',          E'您好，我是林佾則。目前就讀於國立中山大學資訊工程學系。\n\n我熱愛撰寫程式、沉浸於文學，也喜歡在閒暇時享受一杯好咖啡與音樂。這個網站最初是我在 2020 年建置的雛形，隨著學習歷程逐漸豐富，我於近期對它進行了全面的翻修。希望能藉由這個空間，記錄並分享我在技術追求與生活思索間的各種火花。')
on conflict (key) do nothing;
