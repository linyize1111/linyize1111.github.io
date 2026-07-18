begin;

-- More reliable admin-side writes for the browser app.

create or replace function public.admin_queue_manual_ingestion(
    target_platform text,
    target_external_id text
)
returns public.ingestion_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
    result public.ingestion_candidates;
    clean_platform text := lower(trim(coalesce(target_platform, '')));
    clean_external_id text := trim(coalesce(target_external_id, ''));
begin
    if not public.is_admin() then raise exception 'Admin required'; end if;
    if clean_platform not in ('nhentai', '18comic', 'pixiv') then
        raise exception 'Unsupported platform for manual queue';
    end if;
    if clean_external_id = '' then raise exception 'External ID required'; end if;

    insert into public.ingestion_candidates (
        source, platform, external_id, raw_text, source_author, status, rejection_reason, processed_at
    )
    values (
        'manual', clean_platform, clean_external_id, clean_external_id,
        coalesce((select display_name from public.profiles where id = auth.uid()), 'admin'),
        'pending', null, null
    )
    on conflict (source, platform, external_id) do update
        set raw_text = excluded.raw_text,
            source_author = excluded.source_author,
            status = 'pending',
            rejection_reason = null,
            processed_at = null,
            discovered_at = now()
    returning * into result;

    return result;
end;
$$;

grant execute on function public.admin_queue_manual_ingestion(text, text) to authenticated;

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
        select distinct tag
        from unnest(coalesce(game_tags, '{}')) tag
        where trim(coalesce(tag, '')) <> ''
    );
begin
    if not public.is_admin() then raise exception 'Admin required'; end if;
    if clean_name = '' then raise exception 'Game name required'; end if;
    if clean_review = '' then raise exception 'Game review required'; end if;
    if game_rating < -5 or game_rating > 5 then raise exception 'Game rating must be between -5 and 5'; end if;

    if target_game is null then
        insert into public.games (
            name, cover_url, rating, review_body, tags, status, created_by
        )
        values (
            clean_name, clean_cover, game_rating, clean_review,
            coalesce(clean_tags, '{}'), 'published', auth.uid()
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
               created_by = coalesce(created_by, auth.uid()),
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

commit;
