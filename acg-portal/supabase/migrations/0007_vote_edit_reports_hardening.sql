-- ACG Portal: vote reliability, 30-min delete window, reports admin readability.
-- Safe to run multiple times.

begin;

-- ---------------------------------------------------------------------------
-- 30-minute delete window for non-admin authors (mirror edit window).
-- ---------------------------------------------------------------------------
create or replace function public.validate_review_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.role() = 'service_role' or public.is_admin() then
        return old;
    end if;
    if old.user_id <> auth.uid() then
        raise exception 'Cannot delete another user review';
    end if;
    if old.created_at < now() - interval '30 minutes' then
        raise exception 'Delete window expired (30 minutes)';
    end if;
    return old;
end;
$$;

drop trigger if exists reviews_validate_delete on public.reviews;
create trigger reviews_validate_delete before delete on public.reviews
for each row execute function public.validate_review_delete();

-- ---------------------------------------------------------------------------
-- Reliable vote cast via RPC (avoids fragile upsert grant/RLS edge cases).
-- Toggle: same vote again removes; opposite vote replaces.
-- ---------------------------------------------------------------------------
create or replace function public.cast_review_vote(target_review uuid, desired_vote smallint)
returns table(review_id uuid, user_id uuid, vote smallint)
language plpgsql
security definer
set search_path = public
as $$
declare existing smallint;
declare actor uuid := auth.uid();
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

    select v.vote into existing
      from public.review_votes v
     where v.review_id = target_review and v.user_id = actor;

    if existing is not null and existing = desired_vote then
        delete from public.review_votes v
         where v.review_id = target_review and v.user_id = actor;
        return;
    end if;

    insert into public.review_votes as rv (review_id, user_id, vote)
    values (target_review, actor, desired_vote)
    on conflict (review_id, user_id) do update
        set vote = excluded.vote,
            updated_at = now()
    returning rv.review_id, rv.user_id, rv.vote
    into review_id, user_id, vote;
    return next;
end;
$$;

grant execute on function public.cast_review_vote(uuid, smallint) to authenticated;

-- Re-affirm direct policy + grants (fallback path).
drop policy if exists votes_own_write on public.review_votes;
create policy votes_own_write on public.review_votes for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid() and public.is_approved());

grant select on public.review_votes to anon, authenticated;
grant insert, delete on public.review_votes to authenticated;
grant update (vote, updated_at) on public.review_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Admin reports helper: readable list with review snippet / status.
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
           coalesce(rv.body, '') as review_body,
           rv.status as review_status,
           rv.user_id as review_user_id,
           r.reporter_id,
           coalesce(p.display_name, '會員') as reporter_name
      from public.content_reports r
      left join public.reviews rv on rv.id = r.review_id
      left join public.profiles p on p.id = r.reporter_id
     order by r.created_at desc
     limit 200;
end;
$$;

grant execute on function public.admin_list_reports() to authenticated;

grant select on public.content_reports to authenticated;
grant update on public.content_reports to authenticated;

commit;
