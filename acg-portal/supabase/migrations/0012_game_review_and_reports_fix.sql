-- ACG Portal: submit_content_report RPC + harden game/report admin paths.
-- Safe to run multiple times.

begin;

-- ---------------------------------------------------------------------------
-- submit_content_report: security-definer insert for approved members
-- (bypasses RLS edge cases; still enforces auth.uid + is_approved in-body)
-- ---------------------------------------------------------------------------
create or replace function public.submit_content_report(
    target_review uuid,
    report_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    actor uuid := auth.uid();
    result_id uuid;
    clean_reason text := trim(coalesce(report_reason, ''));
begin
    if actor is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_approved() then
        raise exception 'Account approval required';
    end if;
    if target_review is null then
        raise exception 'Review required';
    end if;
    if char_length(clean_reason) < 3 or char_length(clean_reason) > 500 then
        raise exception 'Report reason must be 3-500 characters';
    end if;
    if not exists (
        select 1 from public.reviews r where r.id = target_review
    ) then
        raise exception 'Review not found';
    end if;

    insert into public.content_reports as cr (reporter_id, review_id, reason)
    values (actor, target_review, clean_reason)
    on conflict (reporter_id, review_id) do update
        set reason = excluded.reason,
            status = 'open',
            resolved_by = null,
            resolved_at = null,
            created_at = now()
    returning cr.id into result_id;

    return result_id;
end;
$$;

grant execute on function public.submit_content_report(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_upsert_game_review: normalize empty target_game; re-grant
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_game_review(
    target_game uuid default null,
    game_name text default null,
    game_cover_url text default '',
    game_rating integer default 0,
    game_tags text[] default '{}',
    game_review_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    result_id uuid;
    clean_name text := trim(coalesce(game_name, ''));
    clean_review text := trim(coalesce(game_review_body, ''));
    clean_cover text := trim(coalesce(game_cover_url, ''));
    clean_tags text[] := array(
        select distinct trim(tag)
        from unnest(coalesce(game_tags, '{}')) tag
        where trim(coalesce(tag, '')) <> ''
    );
    actor uuid := auth.uid();
    game_id uuid := nullif(target_game, '00000000-0000-0000-0000-000000000000'::uuid);
begin
    if actor is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if clean_name = '' then
        raise exception 'Game name required';
    end if;
    if clean_review = '' then
        raise exception 'Game review required';
    end if;
    if game_rating is null or game_rating < -5 or game_rating > 5 then
        raise exception 'Game rating must be between -5 and 5';
    end if;

    if game_id is null then
        insert into public.games (
            name, cover_url, rating, review_body, tags, status, created_by
        )
        values (
            clean_name, clean_cover, game_rating, clean_review,
            coalesce(clean_tags, '{}'), 'published', actor
        )
        returning id into result_id;
    else
        update public.games
           set name = clean_name,
               cover_url = clean_cover,
               rating = game_rating,
               review_body = clean_review,
               tags = coalesce(clean_tags, '{}'),
               status = 'published',
               created_by = coalesce(created_by, actor),
               updated_at = now()
         where id = game_id
         returning id into result_id;
        if result_id is null then
            raise exception 'Game not found';
        end if;
    end if;

    return result_id;
end;
$$;

grant execute on function public.admin_upsert_game_review(uuid, text, text, integer, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_reports: ensure stable column names for PostgREST
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_reports()
returns table (
    id uuid,
    reason text,
    status text,
    created_at timestamptz,
    review_id uuid,
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

grant insert, select, update on public.content_reports to authenticated;

commit;
