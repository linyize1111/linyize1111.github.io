-- ACG Portal: admin report navigation fields + leaderboard excludes zero-review works.
-- Safe to run multiple times.

begin;

-- ---------------------------------------------------------------------------
-- admin_list_reports: include work_id for admin navigation
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_reports()
returns table (
    id uuid,
    reason text,
    status text,
    created_at timestamptz,
    review_id uuid,
    work_id uuid,
    review_body text,
    review_status text,
    review_user_id uuid,
    reporter_id uuid,
    reporter_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    return query
    select r.id,
           r.reason,
           r.status,
           r.created_at,
           r.review_id,
           rv.work_id,
           coalesce(rv.body, '')::text as review_body,
           coalesce(rv.status, 'deleted')::text as review_status,
           rv.user_id as review_user_id,
           r.reporter_id,
           coalesce(p.display_name, '會員')::text as reporter_name
      from public.content_reports r
      left join public.reviews rv on rv.id = r.review_id
      left join public.profiles p on p.id = r.reporter_id
     order by r.created_at desc
     limit 200;
end;
$$;

grant execute on function public.admin_list_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard: only list works that still have visible root reviews
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard
with (security_invoker = true)
as
with global_stats as (
    select coalesce(avg(rating), 0)::numeric as global_average
    from public.reviews where parent_id is null and status = 'visible'
), work_stats as (
    select work_id, count(*)::integer as review_count, avg(rating)::numeric as raw_average
    from public.reviews
    where parent_id is null and status = 'visible'
    group by work_id
)
select w.id as work_id,
       w.platform,
       w.work_id as external_id,
       w.title,
       w.author,
       w.cover_url,
       coalesce(s.review_count, 0) as review_count,
       coalesce(round(s.raw_average, 2), 0) as raw_average,
       round(
           coalesce((s.review_count::numeric / (s.review_count + 8)) * s.raw_average, 0)
           + (8::numeric / (coalesce(s.review_count, 0) + 8)) * g.global_average,
           3
       ) as weighted_score
from public.works w
cross join global_stats g
inner join work_stats s on s.work_id = w.id
where w.status = 'active' and not w.is_ai;

grant select on public.leaderboard to anon, authenticated;

commit;
