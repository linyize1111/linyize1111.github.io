begin;

-- ---------------------------------------------------------------------------
-- Manual ingest queue: allow admins to push IDs into the existing candidate
-- pipeline even when the legacy worker is offline.
-- ---------------------------------------------------------------------------
drop policy if exists candidates_admin_insert on public.ingestion_candidates;
drop policy if exists candidates_admin_update on public.ingestion_candidates;

create policy candidates_admin_insert on public.ingestion_candidates
for insert to authenticated
with check (public.is_admin());

create policy candidates_admin_update on public.ingestion_candidates
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant insert, update on public.ingestion_candidates to authenticated;

-- ---------------------------------------------------------------------------
-- Feedback / recommendation rate limit should be per kind, not shared.
-- ---------------------------------------------------------------------------
create or replace function public.validate_feedback_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.user_id <> auth.uid() then raise exception 'Cannot submit for another user'; end if;
    if not public.is_approved() then raise exception 'Account approval required'; end if;
    if exists (
        select 1
          from public.feedback
         where user_id = new.user_id
           and kind = new.kind
           and created_at > now() - interval '10 seconds'
    ) then
        raise exception 'Please wait a moment before sending this category again.';
    end if;
    if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
        raise exception 'Daily feedback limit reached';
    end if;
    new.status = 'open';
    new.resolved_by = null;
    new.resolved_at = null;
    new.created_at = now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feedback thread replies: author 30-minute edit/delete, admin unlimited.
-- ---------------------------------------------------------------------------
create or replace function public.validate_feedback_reply_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.user_id <> auth.uid() and auth.role() <> 'service_role' then
        raise exception 'Cannot reply for another user';
    end if;
    if auth.role() <> 'service_role' and not public.is_approved() then
        raise exception 'Account approval required';
    end if;
    if char_length(trim(coalesce(new.body, ''))) not between 1 and 2000 then
        raise exception 'Reply body must be 1-2000 characters';
    end if;
    new.updated_at = now();
    if auth.role() <> 'service_role' then
        new.created_at = now();
    end if;
    return new;
end;
$$;

create or replace function public.validate_feedback_reply_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.role() <> 'service_role' and not public.is_admin() then
        if old.user_id <> auth.uid() then
            raise exception 'Cannot edit another user reply';
        end if;
        if old.created_at < now() - interval '30 minutes' then
            raise exception 'Reply edit window expired (30 minutes)';
        end if;
    end if;
    if char_length(trim(coalesce(new.body, ''))) not between 1 and 2000 then
        raise exception 'Reply body must be 1-2000 characters';
    end if;
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.validate_feedback_reply_delete()
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
        raise exception 'Cannot delete another user reply';
    end if;
    if old.created_at < now() - interval '30 minutes' then
        raise exception 'Reply delete window expired (30 minutes)';
    end if;
    return old;
end;
$$;

drop trigger if exists feedback_replies_validate_write on public.feedback_replies;
create trigger feedback_replies_validate_write
before insert on public.feedback_replies
for each row execute function public.validate_feedback_reply_write();

drop trigger if exists feedback_replies_validate_update on public.feedback_replies;
create trigger feedback_replies_validate_update
before update on public.feedback_replies
for each row execute function public.validate_feedback_reply_update();

drop trigger if exists feedback_replies_validate_delete on public.feedback_replies;
create trigger feedback_replies_validate_delete
before delete on public.feedback_replies
for each row execute function public.validate_feedback_reply_delete();

drop policy if exists feedback_replies_own_update on public.feedback_replies;
drop policy if exists feedback_replies_own_delete on public.feedback_replies;

create policy feedback_replies_own_update on public.feedback_replies
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy feedback_replies_own_delete on public.feedback_replies
for delete to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists feedback_own_delete on public.feedback;
drop policy if exists feedback_admin_delete on public.feedback;

create policy feedback_own_delete on public.feedback
for delete to authenticated
using (user_id = auth.uid() or public.is_admin());

commit;
