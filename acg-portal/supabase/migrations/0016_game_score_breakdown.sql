-- ACG Portal: professional multi-criteria game review scores.
-- Adds jsonb scores + score_total + grade; migrates legacy -5..+5 rating.
-- Safe to run multiple times (idempotent where practical).

begin;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.games
    add column if not exists scores jsonb not null default '{}'::jsonb;

alter table public.games
    add column if not exists score_total numeric(3, 1);

alter table public.games
    add column if not exists grade text;

comment on column public.games.scores is
    '分項評分 JSON：story/art/voice/gameplay/presentation/animation；值 1-10 或 null（N/A）';
comment on column public.games.score_total is
    '分項等權平均（略過 null），範圍 1.0–10.0';
comment on column public.games.grade is
    '總評等級：S/A/B/C/D';

-- ---------------------------------------------------------------------------
-- Helpers: validate scores, compute total & grade
-- ---------------------------------------------------------------------------
create or replace function public.game_score_grade(total numeric)
returns text
language sql
immutable
as $$
    select case
        when total is null then null
        when total >= 9.0 then 'S'
        when total >= 8.0 then 'A'
        when total >= 6.5 then 'B'
        when total >= 5.0 then 'C'
        else 'D'
    end;
$$;

create or replace function public.normalize_game_scores(raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
    keys text[] := array['story', 'art', 'voice', 'gameplay', 'presentation', 'animation'];
    optional_keys text[] := array['voice', 'animation'];
    result jsonb := '{}'::jsonb;
    k text;
    v jsonb;
    n numeric;
begin
    if raw is null or jsonb_typeof(raw) <> 'object' then
        raise exception 'Game scores must be a JSON object';
    end if;

    foreach k in array keys loop
        v := raw -> k;
        if v is null or v = 'null'::jsonb then
            if k = any (optional_keys) then
                result := result || jsonb_build_object(k, null);
            else
                raise exception 'Score "%" is required (1-10)', k;
            end if;
        elsif jsonb_typeof(v) = 'number' then
            n := (v #>> '{}')::numeric;
            if n <> trunc(n) or n < 1 or n > 10 then
                raise exception 'Score "%" must be an integer 1-10', k;
            end if;
            result := result || jsonb_build_object(k, n::integer);
        else
            raise exception 'Score "%" must be a number or null', k;
        end if;
    end loop;

    return result;
end;
$$;

create or replace function public.compute_game_score_total(scores jsonb)
returns numeric
language sql
immutable
as $$
    select round(avg(val)::numeric, 1)
    from (
        select (value #>> '{}')::numeric as val
        from jsonb_each(scores) as e(key, value)
        where value is not null and value <> 'null'::jsonb
    ) s;
$$;

-- ---------------------------------------------------------------------------
-- Migrate legacy rating (-5..+5) → scores / score_total / grade / rating(1-10)
-- ---------------------------------------------------------------------------
-- Drop old -5..+5 check before writing 1–10 totals into rating.
alter table public.games drop constraint if exists games_rating_check;

-- Bypass admin-only write trigger for data backfill (postgres migration role).
alter table public.games disable trigger games_validate_write;

update public.games
   set scores = jsonb_build_object(
           'story', greatest(1, least(10, rating + 5)),
           'art', greatest(1, least(10, rating + 5)),
           'voice', null,
           'gameplay', greatest(1, least(10, rating + 5)),
           'presentation', greatest(1, least(10, rating + 5)),
           'animation', null
       ),
       score_total = greatest(1, least(10, rating + 5))::numeric,
       grade = public.game_score_grade(greatest(1, least(10, rating + 5))::numeric)
 where scores = '{}'::jsonb
    or scores is null
    or not (scores ? 'story');

update public.games
   set rating = greatest(1, least(10, round(score_total)::integer))
 where score_total is not null;

alter table public.games enable trigger games_validate_write;

alter table public.games
    add constraint games_rating_check check (rating between 1 and 10);

alter table public.games drop constraint if exists games_grade_check;
alter table public.games
    add constraint games_grade_check
    check (grade is null or grade in ('S', 'A', 'B', 'C', 'D'));

-- ---------------------------------------------------------------------------
-- admin_upsert_game_review: accept game_scores jsonb
-- ---------------------------------------------------------------------------
drop function if exists public.admin_upsert_game_review(uuid, text, text, integer, text[], text);

create or replace function public.admin_upsert_game_review(
    target_game uuid default null,
    game_name text default null,
    game_cover_url text default '',
    game_rating integer default null,
    game_tags text[] default '{}',
    game_review_body text default null,
    game_scores jsonb default null
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
    clean_scores jsonb;
    total numeric;
    computed_grade text;
    legacy_score integer;
    stored_rating integer;
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

    if game_scores is not null and game_scores <> '{}'::jsonb then
        clean_scores := public.normalize_game_scores(game_scores);
    elsif game_rating is not null then
        -- Backward compat: single overall 1-10 (or legacy -5..+5) → equal required scores
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
            'presentation', legacy_score,
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
            review_body, tags, status, created_by
        )
        values (
            clean_name, clean_cover, stored_rating, clean_scores, total, computed_grade,
            clean_review, coalesce(clean_tags, '{}'), 'published', actor
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

grant execute on function public.admin_upsert_game_review(uuid, text, text, integer, text[], text, jsonb) to authenticated;
grant execute on function public.game_score_grade(numeric) to anon, authenticated;
grant execute on function public.compute_game_score_total(jsonb) to anon, authenticated;

commit;
