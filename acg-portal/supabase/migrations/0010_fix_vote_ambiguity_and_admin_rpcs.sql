-- ACG Portal: fix ambiguous cast_review_vote, harden admin APIs, seedable reports helper.
-- Safe to run multiple times.

begin;

-- ---------------------------------------------------------------------------
-- cast_review_vote: RETURNS TABLE column names collided with ON CONFLICT
-- targets (review_id / user_id / vote) → "column reference is ambiguous".
-- Fix: return jsonb and use clearly named locals.
-- ---------------------------------------------------------------------------
drop function if exists public.cast_review_vote(uuid, smallint);

create or replace function public.cast_review_vote(target_review uuid, desired_vote smallint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor uuid := auth.uid();
    existing_vote smallint;
    out_review uuid;
    out_user uuid;
    out_vote smallint;
begin
    if actor is null then raise exception 'Authentication required'; end if;
    if not public.is_approved() then raise exception 'Account approval required'; end if;
    if desired_vote not in (-1, 1) then raise exception 'Invalid vote'; end if;
    if not exists (
        select 1 from public.reviews r
        where r.id = target_review and r.status = 'visible'
    ) then
        raise exception 'Review not found';
    end if;

    select v.vote into existing_vote
      from public.review_votes v
     where v.review_id = target_review and v.user_id = actor;

    if existing_vote is not null and existing_vote = desired_vote then
        delete from public.review_votes v
         where v.review_id = target_review and v.user_id = actor;
        return jsonb_build_object(
            'removed', true,
            'review_id', target_review,
            'user_id', actor
        );
    end if;

    insert into public.review_votes as rv (review_id, user_id, vote)
    values (target_review, actor, desired_vote)
    on conflict (review_id, user_id) do update
        set vote = excluded.vote,
            updated_at = now()
    returning rv.review_id, rv.user_id, rv.vote
    into out_review, out_user, out_vote;

    return jsonb_build_object(
        'removed', false,
        'review_id', out_review,
        'user_id', out_user,
        'vote', out_vote
    );
end;
$$;

grant execute on function public.cast_review_vote(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_reports: qualify RETURN QUERY columns to avoid ambiguous outputs
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
    if not public.is_admin() then raise exception 'Admin required'; end if;
    return query
    select r.id,
           r.reason,
           r.status,
           r.created_at,
           r.review_id,
           coalesce(rv.body, '')::text,
           coalesce(rv.status, 'deleted')::text,
           rv.user_id,
           r.reporter_id,
           coalesce(p.display_name, '會員')::text
      from public.content_reports r
      left join public.reviews rv on rv.id = r.review_id
      left join public.profiles p on p.id = r.reporter_id
     order by r.created_at desc
     limit 200;
end;
$$;

grant execute on function public.admin_list_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- approve_all_pending: return clearer jsonb payload
-- ---------------------------------------------------------------------------
drop function if exists public.approve_all_pending();

create or replace function public.approve_all_pending()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    affected integer := 0;
begin
    if not public.is_admin() then raise exception 'Admin required'; end if;
    update public.profiles
       set status = 'active',
           approved_at = coalesce(approved_at, now()),
           approved_by = auth.uid()
     where status = 'pending'
       and coalesce(role, 'user') <> 'admin';
    get diagnostics affected = row_count;
    return jsonb_build_object('approved', affected);
end;
$$;

grant execute on function public.approve_all_pending() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_upsert_game_review: tolerate empty cover; ensure published status
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
begin
    if actor is null then raise exception 'Authentication required'; end if;
    if not public.is_admin() then raise exception 'Admin required'; end if;
    if clean_name = '' then raise exception 'Game name required'; end if;
    if clean_review = '' then raise exception 'Game review required'; end if;
    if game_rating is null or game_rating < -5 or game_rating > 5 then
        raise exception 'Game rating must be between -5 and 5';
    end if;

    if target_game is null then
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
         where id = target_game
         returning id into result_id;
        if result_id is null then
            raise exception 'Game not found';
        end if;
    end if;

    return result_id;
end;
$$;

grant execute on function public.admin_upsert_game_review(uuid, text, text, integer, text[], text) to authenticated;

-- Keep game trigger allowing security-definer admin RPC path.
create or replace function public.validate_game_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if new.status is null or new.status = '' then new.status := 'published'; end if;
    if new.cover_url is null then new.cover_url := ''; end if;
    return new;
end;
$$;

commit;
