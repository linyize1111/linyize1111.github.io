-- ACG Portal v1.8.1: unify game tags + genres into one label list
-- UI keeps a single「標籤」field; both columns stay for compat and are kept in sync.

begin;

comment on column public.games.genres is
  '類型／分類標籤（與 tags 合併為同一組；寫入時雙欄同步）';
comment on column public.games.tags is
  '標籤（含類型／分類；與 genres 合併顯示與儲存）';

-- Backfill: merge tags ∪ genres → write both columns the same (preserve tag order, then extras from genres)
alter table public.games disable trigger games_validate_write;

update public.games g
   set tags = sub.merged,
       genres = sub.merged,
       updated_at = now()
  from (
    select id,
           coalesce((
             select array_agg(x order by ord)
               from (
                 select trim(x) as x, min(ord) as ord
                   from (
                     select t as x, ordinality as ord
                       from unnest(coalesce(tags, '{}')) with ordinality as u(t, ordinality)
                      where trim(coalesce(t, '')) <> ''
                     union all
                     select ge as x, 100000 + ordinality as ord
                       from unnest(coalesce(genres, '{}')) with ordinality as u(ge, ordinality)
                      where trim(coalesce(ge, '')) <> ''
                   ) raw
                  group by trim(x)
               ) d
           ), '{}'::text[]) as merged
      from public.games
  ) sub
 where g.id = sub.id
   and (g.tags is distinct from sub.merged or g.genres is distinct from sub.merged);

alter table public.games enable trigger games_validate_write;

-- admin_upsert_game_review: merge game_tags ∪ game_genres into both columns
create or replace function public.admin_upsert_game_review(
    target_game uuid default null,
    game_name text default null,
    game_cover_url text default '',
    game_rating integer default null,
    game_tags text[] default '{}',
    game_review_body text default null,
    game_scores jsonb default null,
    game_developer text default '',
    game_genres text[] default '{}',
    game_cg_type text default 'unknown',
    game_source_url text default '',
    game_product_code text default '',
    game_release_date date default null,
    game_work_type_label text default '',
    game_metadata jsonb default '{}'::jsonb
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
    -- Unified labels: tags first, then genres extras (deduped)
    clean_labels text[] := coalesce((
        select array_agg(x order by ord)
          from (
            select trim(x) as x, min(ord) as ord
              from (
                select t as x, ordinality as ord
                  from unnest(coalesce(game_tags, '{}')) with ordinality as u(t, ordinality)
                 where trim(coalesce(t, '')) <> ''
                union all
                select ge as x, 100000 + ordinality as ord
                  from unnest(coalesce(game_genres, '{}')) with ordinality as u(ge, ordinality)
                 where trim(coalesce(ge, '')) <> ''
              ) raw
             group by trim(x)
          ) d
    ), '{}'::text[]);
    actor uuid := auth.uid();
    game_id uuid := nullif(target_game, '00000000-0000-0000-0000-000000000000'::uuid);
    clean_scores jsonb;
    total numeric;
    computed_grade text;
    legacy_score integer;
    stored_rating integer;
    clean_cg text := lower(trim(coalesce(game_cg_type, 'unknown')));
    clean_dev text := trim(coalesce(game_developer, ''));
    clean_source text := trim(coalesce(game_source_url, ''));
    clean_code text := upper(trim(coalesce(game_product_code, '')));
    clean_work_type text := trim(coalesce(game_work_type_label, ''));
    clean_meta jsonb := coalesce(game_metadata, '{}'::jsonb);
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
    if clean_cg not in ('static', 'animated', 'mixed', 'unknown') then
        clean_cg := 'unknown';
    end if;
    if clean_code <> '' and clean_code !~ '^(RJ|BJ|VJ)[0-9]{6,}$' then
        raise exception 'Invalid product code';
    end if;

    if game_scores is not null and game_scores <> '{}'::jsonb then
        clean_scores := public.normalize_game_scores(game_scores);
    elsif game_rating is not null then
        if game_rating between 1 and 10 then
            legacy_score := game_rating;
        elsif game_rating between -5 and 5 then
            legacy_score := greatest(1, least(10, game_rating + 5));
        else
            raise exception 'Game rating must be 1-10 (or legacy -5..+5)';
        end if;
        clean_scores := jsonb_build_object(
            'story', legacy_score,
            'art', legacy_score,
            'voice', null,
            'gameplay', legacy_score,
            'utility', legacy_score,
            'atmosphere', legacy_score,
            'animation', null
        );
    else
        raise exception 'Game scores required';
    end if;

    total := public.compute_game_score_total(clean_scores);
    if total is null then
        raise exception 'At least one score is required';
    end if;
    computed_grade := public.game_score_grade(total);
    stored_rating := greatest(1, least(10, round(total)::integer));

    if game_id is null then
        insert into public.games (
            name, cover_url, rating, scores, score_total, grade,
            review_body, tags, status, created_by,
            developer, genres, cg_type, source_url, product_code,
            release_date, work_type_label, metadata
        )
        values (
            clean_name, clean_cover, stored_rating, clean_scores, total, computed_grade,
            clean_review, clean_labels, 'published', actor,
            clean_dev, clean_labels, clean_cg, clean_source, clean_code,
            game_release_date, clean_work_type, clean_meta
        )
        returning id into result_id;
    else
        update public.games
           set name = clean_name,
               cover_url = clean_cover,
               rating = stored_rating,
               scores = clean_scores,
               score_total = total,
               grade = computed_grade,
               review_body = clean_review,
               tags = clean_labels,
               status = 'published',
               created_by = coalesce(created_by, actor),
               developer = clean_dev,
               genres = clean_labels,
               cg_type = clean_cg,
               source_url = clean_source,
               product_code = clean_code,
               release_date = game_release_date,
               work_type_label = clean_work_type,
               metadata = clean_meta,
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

grant execute on function public.admin_upsert_game_review(
    uuid, text, text, integer, text[], text, jsonb,
    text, text[], text, text, text, date, text, jsonb
) to authenticated;

commit;
