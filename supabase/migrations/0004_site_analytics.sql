-- =====================================================================
-- 0004_site_analytics.sql — 訪客 / 瀏覽計數（防灌水 RLS）
-- 公開端只能透過 RPC 寫入；聚合數字可公開讀取；原始事件表不對外開放。
-- =====================================================================

create table if not exists public.site_analytics (
  key        text primary key,
  value      bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now()
);

insert into public.site_analytics (key, value) values
  ('unique_visitors', 0),
  ('page_views', 0)
on conflict (key) do nothing;

create table if not exists public.visit_events (
  id          bigserial primary key,
  visitor_id  uuid not null,
  page_key    text not null,
  bucket_date date not null default ((timezone('utc', now()))::date),
  created_at  timestamptz not null default now(),
  unique (visitor_id, page_key, bucket_date)
);

create index if not exists visit_events_visitor_created_idx
  on public.visit_events (visitor_id, created_at desc);

create index if not exists visit_events_created_idx
  on public.visit_events (created_at desc);

alter table public.site_analytics enable row level security;
alter table public.visit_events enable row level security;

drop policy if exists site_analytics_public_read on public.site_analytics;
create policy site_analytics_public_read on public.site_analytics
  for select to anon, authenticated
  using (true);

-- visit_events：不建立任何 policy → anon/authenticated 無法直接讀寫

grant select on public.site_analytics to anon, authenticated;

create or replace function public.record_page_view(
  p_visitor_id uuid,
  p_page_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page text;
  v_hourly int;
  v_seen_before boolean;
  v_inserted int := 0;
begin
  if p_visitor_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor');
  end if;

  v_page := left(trim(coalesce(p_page_key, '')), 200);
  if v_page = '' then
    v_page := '/';
  end if;
  if v_page !~ '^[a-zA-Z0-9_./?=&:%-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_page');
  end if;

  select count(*)::int into v_hourly
  from public.visit_events
  where visitor_id = p_visitor_id
    and created_at > now() - interval '1 hour';
  if v_hourly >= 120 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select exists (
    select 1 from public.visit_events where visitor_id = p_visitor_id limit 1
  ) into v_seen_before;

  insert into public.visit_events (visitor_id, page_key, bucket_date)
  values (p_visitor_id, v_page, (timezone('utc', now()))::date)
  on conflict (visitor_id, page_key, bucket_date) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.site_analytics
      set value = value + 1, updated_at = now()
      where key = 'page_views';

    if not v_seen_before then
      update public.site_analytics
        set value = value + 1, updated_at = now()
        where key = 'unique_visitors';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'counted', v_inserted,
    'page', v_page
  );
end;
$$;

comment on function public.record_page_view(uuid, text) is
  '記錄頁面瀏覽：同一訪客同一頁每日最多計一次；每小時最多 120 次請求。';

revoke all on function public.record_page_view(uuid, text) from public;
grant execute on function public.record_page_view(uuid, text) to anon, authenticated;
