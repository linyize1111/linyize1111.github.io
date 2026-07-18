-- ACG Portal user acceptance fixes (2026-07).
-- Safe to run multiple times.

begin;

-- ---------------------------------------------------------------------------
-- Rating-only reviews + optional body on root reviews
-- ---------------------------------------------------------------------------
alter table public.reviews drop constraint if exists reviews_body_check;
alter table public.reviews alter column body drop not null;
alter table public.reviews add constraint reviews_body_check check (
    (parent_id is not null and char_length(body) between 1 and 300)
    or (parent_id is null and char_length(coalesce(body, '')) between 0 and 500)
);

create or replace function public.validate_review_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare parent_review public.reviews;
begin
    if new.user_id <> auth.uid() and auth.role() <> 'service_role' then
        raise exception 'Cannot write for another user';
    end if;
    if auth.role() <> 'service_role' and not public.is_approved() then
        raise exception 'Account approval required';
    end if;
    if exists (select 1 from public.reviews where user_id = new.user_id and created_at > now() - interval '15 seconds') then
        raise exception 'Please wait before posting again';
    end if;
    if (select count(*) from public.reviews where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
        raise exception 'Hourly posting limit reached';
    end if;
    if (select count(*) from public.reviews where user_id = new.user_id and created_at > now() - interval '1 day') >= 100 then
        raise exception 'Daily posting limit reached';
    end if;
    if new.parent_id is null then
        if new.rating is null then raise exception 'Top-level reviews require a rating'; end if;
        if char_length(coalesce(new.body, '')) > 500 then raise exception 'Review body too long'; end if;
    else
        select * into parent_review from public.reviews where id = new.parent_id;
        if parent_review.id is null or parent_review.parent_id is not null then raise exception 'Only one reply level is allowed'; end if;
        if parent_review.work_id <> new.work_id then raise exception 'Reply work does not match'; end if;
        if new.rating is not null then raise exception 'Replies cannot include a rating'; end if;
        if char_length(new.body) > 300 then raise exception 'Replies are limited to 300 characters'; end if;
    end if;
    if auth.role() <> 'service_role' then
        new.status = 'visible';
        new.created_at = now();
        new.updated_at = now();
    end if;
    return new;
end;
$$;

create or replace function public.validate_review_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.role() <> 'service_role' and not public.is_admin() then
        if old.user_id <> auth.uid() then raise exception 'Cannot edit another user review'; end if;
        if old.created_at < now() - interval '30 minutes' then
            raise exception 'Edit window expired (30 minutes)';
        end if;
    end if;
    if new.parent_id is null and new.rating is null then
        raise exception 'Top-level reviews require a rating';
    end if;
    return new;
end;
$$;

drop trigger if exists reviews_validate_update on public.reviews;
create trigger reviews_validate_update before update on public.reviews
for each row execute function public.validate_review_update();

-- ---------------------------------------------------------------------------
-- Display name change limit (monthly for non-admin)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists display_name_changed_at timestamptz;

create or replace function public.update_my_profile(new_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
declare current public.profiles;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if char_length(trim(new_display_name)) not between 1 and 40 then raise exception 'Display name must be 1-40 characters'; end if;
    select * into current from public.profiles where id = auth.uid();
    if current.id is null then raise exception 'Profile not found'; end if;
    if trim(new_display_name) = current.display_name then return current; end if;
    if current.role <> 'admin' then
        if current.display_name_changed_at is not null
           and current.display_name_changed_at > now() - interval '30 days' then
            raise exception 'Display name can only be changed once per month';
        end if;
    end if;
    update public.profiles
       set display_name = trim(new_display_name),
           display_name_changed_at = now()
     where id = auth.uid()
     returning * into result;
    return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- One-click approve all pending members
-- ---------------------------------------------------------------------------
create or replace function public.approve_all_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
    if not public.is_admin() then raise exception 'Admin required'; end if;
    update public.profiles
       set status = 'active',
           approved_at = coalesce(approved_at, now()),
           approved_by = auth.uid()
     where status = 'pending' and role <> 'admin';
    get diagnostics affected = row_count;
    return affected;
end;
$$;

grant execute on function public.approve_all_pending() to authenticated;

-- ---------------------------------------------------------------------------
-- Feedback board: public read for approved users, replies, admin moderation
-- ---------------------------------------------------------------------------
create table if not exists public.feedback_replies (
    id uuid primary key default gen_random_uuid(),
    feedback_id uuid not null references public.feedback(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    body text not null check (char_length(body) between 1 and 2000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists feedback_replies_feedback_idx on public.feedback_replies (feedback_id, created_at);

alter table public.feedback_replies enable row level security;

drop policy if exists feedback_board_read on public.feedback;
create policy feedback_board_read on public.feedback for select to authenticated
    using (public.is_approved());

drop policy if exists feedback_replies_read on public.feedback_replies;
drop policy if exists feedback_replies_insert on public.feedback_replies;
drop policy if exists feedback_replies_admin_update on public.feedback_replies;
drop policy if exists feedback_replies_admin_delete on public.feedback_replies;

create policy feedback_replies_read on public.feedback_replies for select to authenticated
    using (public.is_approved());
create policy feedback_replies_insert on public.feedback_replies for insert to authenticated
    with check (user_id = auth.uid() and public.is_approved());
create policy feedback_replies_admin_update on public.feedback_replies for update to authenticated
    using (public.is_admin()) with check (public.is_admin());
create policy feedback_replies_admin_delete on public.feedback_replies for delete to authenticated
    using (public.is_admin());

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback for delete to authenticated
    using (public.is_admin());

grant select, insert on public.feedback_replies to authenticated;
grant update, delete on public.feedback_replies to authenticated;

-- Ensure reports insert works for approved users (re-grant)
grant insert, select, update on public.content_reports to authenticated;

-- Games: ensure admin insert always publishes
create or replace function public.validate_game_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.role() <> 'service_role' and not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if new.status is null or new.status = '' then new.status := 'published'; end if;
    if coalesce(new.cover_url, '') = '' then new.cover_url := ''; end if;
    return new;
end;
$$;

drop trigger if exists games_validate_write on public.games;
create trigger games_validate_write before insert or update on public.games
for each row execute function public.validate_game_write();

commit;
