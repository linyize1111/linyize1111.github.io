begin;

-- Timed auto-approve window for member onboarding.
-- When now() < app_settings.auto_approve_until, new profiles are created active
-- and pending members can claim approval on login. After expiry, behaviour
-- returns to manual review without deleting these functions.

create table if not exists public.app_settings (
    id boolean primary key default true check (id),
    auto_approve_until timestamptz,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);

insert into public.app_settings (id, auto_approve_until)
values (true, null)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings
    for select to anon, authenticated
    using (true);

create or replace function public.auto_approve_window_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select auto_approve_until from public.app_settings where id = true),
        '-infinity'::timestamptz
    ) > now();
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    initial_status text := 'pending';
    initial_approved_at timestamptz := null;
begin
    if public.auto_approve_window_open() then
        initial_status := 'active';
        initial_approved_at := now();
    end if;

    insert into public.profiles (id, display_name, avatar_url, status, approved_at)
    values (
        new.id,
        coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, '新會員'), '@', 1)),
        new.raw_user_meta_data ->> 'avatar_url',
        initial_status,
        initial_approved_at
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Existing pending members who log in during the window.
create or replace function public.claim_auto_approval()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    result public.profiles;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.auto_approve_window_open() then
        return jsonb_build_object('approved', false, 'reason', 'window_closed');
    end if;

    update public.profiles
       set status = 'active',
           approved_at = coalesce(approved_at, now()),
           approved_by = coalesce(approved_by, auth.uid())
     where id = auth.uid()
       and status = 'pending'
       and coalesce(role, 'user') <> 'admin'
    returning * into result;

    if result.id is null then
        return jsonb_build_object(
            'approved', false,
            'reason', 'not_pending_or_already_active',
            'status', (select status from public.profiles where id = auth.uid())
        );
    end if;

    return jsonb_build_object('approved', true, 'status', result.status);
end;
$$;

grant execute on function public.claim_auto_approval() to authenticated;

create or replace function public.set_auto_approve_window(hours integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    until_ts timestamptz;
begin
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if hours is null or hours < 0 then
        raise exception 'hours must be >= 0';
    end if;

    until_ts := case when hours = 0 then now() else now() + make_interval(hours => hours) end;

    insert into public.app_settings (id, auto_approve_until, updated_at, updated_by)
    values (true, until_ts, now(), auth.uid())
    on conflict (id) do update
        set auto_approve_until = excluded.auto_approve_until,
            updated_at = now(),
            updated_by = auth.uid();

    return jsonb_build_object(
        'open', until_ts > now(),
        'auto_approve_until', until_ts,
        'hours', hours
    );
end;
$$;

grant execute on function public.set_auto_approve_window(integer) to authenticated;

create or replace function public.get_auto_approve_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'open', public.auto_approve_window_open(),
        'auto_approve_until', (select auto_approve_until from public.app_settings where id = true),
        'server_now', now()
    );
$$;

grant execute on function public.get_auto_approve_status() to anon, authenticated;

commit;
