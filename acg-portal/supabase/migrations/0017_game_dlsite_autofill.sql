-- ACG Portal: DLsite autofill metadata for game reviews.
-- Adds game metadata columns + admin-only fetch RPC (server-side via extensions.http).
-- Does NOT auto-fill scores. Safe to re-run where practical.

begin;

create extension if not exists http with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.games
    add column if not exists developer text not null default '';

alter table public.games
    add column if not exists genres text[] not null default '{}';

alter table public.games
    add column if not exists cg_type text not null default 'unknown';

alter table public.games
    add column if not exists source_url text not null default '';

alter table public.games
    add column if not exists product_code text not null default '';

alter table public.games
    add column if not exists release_date date;

alter table public.games
    add column if not exists work_type_label text not null default '';

alter table public.games
    add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.games drop constraint if exists games_cg_type_check;
alter table public.games
    add constraint games_cg_type_check
    check (cg_type in ('static', 'animated', 'mixed', 'unknown'));

comment on column public.games.developer is '開發商／社團／品牌';
comment on column public.games.genres is '類型標籤（來自來源站，供站長參考；可併入 tags）';
comment on column public.games.cg_type is '演出類型：static/animated/mixed/unknown';
comment on column public.games.source_url is '來源作品頁 URL';
comment on column public.games.product_code is '產品代碼（如 RJ/VJ/BJ）';
comment on column public.games.release_date is '發售日（若來源有提供）';
comment on column public.games.work_type_label is '作品形式（如 アドベンチャー）';
comment on column public.games.metadata is '自動填入原始 metadata（不含分數）';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.urlencode_utf8(data text)
returns text
language plpgsql
immutable
strict
as $$
declare
    i int;
    result text := '';
    b int;
    bytes bytea;
begin
    bytes := convert_to(data, 'UTF8');
    for i in 0 .. octet_length(bytes) - 1 loop
        b := get_byte(bytes, i);
        if (b >= 48 and b <= 57)
           or (b >= 65 and b <= 90)
           or (b >= 97 and b <= 122)
           or b in (45, 46, 95, 126) then
            result := result || chr(b);
        elsif b = 32 then
            result := result || '%20';
        else
            result := result || '%' || upper(lpad(to_hex(b), 2, '0'));
        end if;
    end loop;
    return result;
end;
$$;

create or replace function public.dlsite_http_get(target_url text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    resp extensions.http_response;
begin
    if target_url is null or target_url !~ '^https://www\.dlsite\.com/' then
        raise exception 'Only DLsite HTTPS URLs are allowed';
    end if;
    select * into resp
    from extensions.http((
        'GET',
        target_url,
        array[
            extensions.http_header(
                'User-Agent',
                'Mozilla/5.0 (compatible; ACGPortalBot/1.5; +https://linyize1111.github.io/acg-portal/)'
            ),
            extensions.http_header('Accept', 'application/json,text/html,*/*'),
            extensions.http_header('Accept-Language', 'ja,zh-TW;q=0.9,en;q=0.8'),
            extensions.http_header('Cookie', 'adultchecked=1')
        ],
        null,
        null
    )::extensions.http_request);

    if resp.status is null or resp.status >= 500 then
        raise exception 'DLsite fetch failed (HTTP %)', coalesce(resp.status, 0);
    end if;
    return coalesce(resp.content, '');
end;
$$;

create or replace function public.extract_dlsite_product_code(raw_query text)
returns text
language plpgsql
immutable
as $$
declare
    q text := upper(trim(coalesce(raw_query, '')));
    m text[];
begin
    if q = '' then
        return null;
    end if;
    m := regexp_match(q, '((?:RJ|BJ|VJ)[0-9]{6,})');
    if m is not null then
        return m[1];
    end if;
    return null;
end;
$$;

create or replace function public.infer_dlsite_cg_type(item jsonb)
returns text
language plpgsql
immutable
as $$
declare
    work_type text := upper(coalesce(item ->> 'work_type', ''));
    work_label text := coalesce(item ->> 'work_type_string', '');
    options text := upper(coalesce(item ->> 'options', ''));
    genre_blob text := lower(coalesce(item -> 'genres', '[]'::jsonb)::text);
    has_anime boolean := false;
    has_static boolean := false;
begin
    if (item ->> 'movies') in ('true', 't', '1') then
        has_anime := true;
    end if;
    if item -> 'anime' is not null and jsonb_typeof(item -> 'anime') <> 'null' then
        has_anime := true;
    end if;
    if options ~ '(MOV|AVI|VID|ANI|MP4)' then
        has_anime := true;
    end if;
    if work_type in ('MOV', 'AVI') or work_label ~ '動画|アニメ|ムービー' then
        has_anime := true;
    end if;
    if genre_blob ~ 'アニメ|動画|ムービー' then
        has_anime := true;
    end if;

    if work_type in ('MNG', 'ICG', 'CG', 'SOU', 'MUS', 'BOOK') then
        has_static := true;
    end if;
    if work_type in ('ADV', 'RPG', 'ACT', 'SLN', 'STG', 'QIZ', 'TBL', 'TYP', 'TOOL', 'ETC', 'GAM') then
        has_static := true;
    end if;

    if has_anime and has_static then
        return 'mixed';
    end if;
    if has_anime then
        return 'animated';
    end if;
    if has_static then
        return 'static';
    end if;
    return 'unknown';
end;
$$;

create or replace function public.normalize_dlsite_product(item jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
    code text := upper(coalesce(item ->> 'workno', item ->> 'product_id', ''));
    site text := coalesce(nullif(item ->> 'site_id', ''), 'maniax');
    cover text := coalesce(
        nullif(item #>> '{image_main,url}', ''),
        nullif(item ->> 'image_thumb', ''),
        nullif(item ->> 'work_image', '')
    );
    genres text[] := array(
        select distinct trim(g ->> 'name')
        from jsonb_array_elements(coalesce(item -> 'genres', '[]'::jsonb)) g
        where trim(coalesce(g ->> 'name', '')) <> ''
    );
    release_raw text := left(coalesce(item ->> 'regist_date', ''), 10);
    release_d date := null;
    developer text := coalesce(
        nullif(trim(item ->> 'maker_name'), ''),
        nullif(trim(item ->> 'brand_name'), ''),
        ''
    );
begin
    if cover like '//%' then
        cover := 'https:' || cover;
    end if;
    if release_raw ~ '^\d{4}-\d{2}-\d{2}$' then
        release_d := release_raw::date;
    end if;

    return jsonb_build_object(
        'source', 'dlsite',
        'product_code', code,
        'title', coalesce(nullif(trim(item ->> 'work_name'), ''), ''),
        'developer', developer,
        'cover_url', coalesce(cover, ''),
        'genres', to_jsonb(coalesce(genres, '{}'::text[])),
        'cg_type', public.infer_dlsite_cg_type(item),
        'source_url', format('https://www.dlsite.com/%s/work/=/product_id/%s.html', site, code),
        'release_date', release_d,
        'work_type', coalesce(item ->> 'work_type', ''),
        'work_type_label', coalesce(item ->> 'work_type_string', ''),
        'options', coalesce(item ->> 'options', ''),
        'site_id', site,
        'series_name', coalesce(item ->> 'series_name', ''),
        'age_category', item -> 'age_category',
        'raw', jsonb_build_object(
            'work_type', item -> 'work_type',
            'options', item -> 'options',
            'movies', item -> 'movies',
            'anime', item -> 'anime',
            'maker_id', item -> 'maker_id',
            'file_type_string', item -> 'file_type_string'
        )
    );
end;
$$;

create or replace function public.fetch_dlsite_product_json(product_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    code text := upper(trim(coalesce(product_code, '')));
    site text;
    sites text[];
    body text;
    parsed jsonb;
    item jsonb;
begin
    if code !~ '^(RJ|BJ|VJ)[0-9]{6,}$' then
        raise exception 'Invalid DLsite product code: %', product_code;
    end if;

    if code like 'VJ%' then
        sites := array['pro', 'maniax', 'books', 'home', 'girls', 'bl', 'comic'];
    elsif code like 'BJ%' then
        sites := array['books', 'maniax', 'pro', 'home', 'girls', 'bl'];
    else
        sites := array['maniax', 'pro', 'home', 'books', 'girls', 'bl', 'comic'];
    end if;

    foreach site in array sites loop
        begin
            body := public.dlsite_http_get(
                format('https://www.dlsite.com/%s/api/=/product.json?workno=%s', site, code)
            );
        exception when others then
            continue;
        end;
        if body is null or trim(body) = '' or trim(body) = '[]' then
            continue;
        end if;
        begin
            parsed := body::jsonb;
        exception when others then
            continue;
        end;
        if jsonb_typeof(parsed) = 'array' and jsonb_array_length(parsed) > 0 then
            item := parsed -> 0;
            if coalesce(item ->> 'workno', '') <> '' then
                return item;
            end if;
        elsif jsonb_typeof(parsed) = 'object' and parsed ? code then
            return parsed -> code;
        end if;
    end loop;

    raise exception 'DLsite product not found: %', code;
end;
$$;

create or replace function public.search_dlsite_candidates(keyword text, max_results integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    kw text := trim(coalesce(keyword, ''));
    html text;
    site text;
    sites text[] := array['maniax', 'pro', 'home', 'books'];
    ids text[] := '{}';
    code text;
    item jsonb;
    product jsonb;
    candidates jsonb := '[]'::jsonb;
    lim int := greatest(1, least(coalesce(max_results, 8), 8));
    matched text;
begin
    if char_length(kw) < 1 then
        raise exception 'Search keyword required';
    end if;
    if char_length(kw) > 120 then
        raise exception 'Search keyword too long';
    end if;

    foreach site in array sites loop
        begin
            html := public.dlsite_http_get(
                format(
                    'https://www.dlsite.com/%s/fsr/=/language/jp/keyword/%s/order/trend/per_page/12/from/fs.header',
                    site,
                    public.urlencode_utf8(kw)
                )
            );
        exception when others then
            continue;
        end;

        ids := '{}';
        for matched in
            select m[1]
            from regexp_matches(coalesce(html, ''), 'product_id/((?:RJ|BJ|VJ)[0-9]{6,})', 'g') as m
        loop
            if not (matched = any (ids)) then
                ids := ids || matched;
            end if;
            exit when coalesce(array_length(ids, 1), 0) >= lim;
        end loop;

        if coalesce(array_length(ids, 1), 0) = 0 then
            continue;
        end if;

        foreach code in array ids loop
            begin
                item := public.fetch_dlsite_product_json(code);
                product := public.normalize_dlsite_product(item);
                candidates := candidates || jsonb_build_array(product);
            exception when others then
                candidates := candidates || jsonb_build_array(
                    jsonb_build_object(
                        'source', 'dlsite',
                        'product_code', code,
                        'title', code,
                        'developer', '',
                        'cover_url', '',
                        'genres', '[]'::jsonb,
                        'cg_type', 'unknown',
                        'source_url', format('https://www.dlsite.com/%s/work/=/product_id/%s.html', site, code),
                        'release_date', null,
                        'work_type', '',
                        'work_type_label', '',
                        'options', '',
                        'site_id', site
                    )
                );
            end;
        end loop;

        if candidates <> '[]'::jsonb then
            return candidates;
        end if;
    end loop;

    return '[]'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPC: fetch metadata (never returns scores)
-- ---------------------------------------------------------------------------
create or replace function public.admin_fetch_game_metadata(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    q text := trim(coalesce(query, ''));
    code text;
    item jsonb;
    product jsonb;
    candidates jsonb;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if q = '' then
        raise exception '請輸入遊戲名稱、RJ/VJ 代碼或 DLsite URL';
    end if;
    if char_length(q) > 500 then
        raise exception 'Query too long';
    end if;

    code := public.extract_dlsite_product_code(q);
    if code is not null then
        item := public.fetch_dlsite_product_json(code);
        product := public.normalize_dlsite_product(item);
        return jsonb_build_object(
            'ok', true,
            'mode', 'detail',
            'query', q,
            'product', product,
            'candidates', jsonb_build_array(product)
        );
    end if;

    -- Keyword search → candidate list (caller can re-fetch with product_code)
    candidates := public.search_dlsite_candidates(q, 8);
    if candidates = '[]'::jsonb then
        raise exception '找不到符合「%」的 DLsite 作品；請改貼 RJ/VJ 代碼或作品頁 URL', q;
    end if;

    return jsonb_build_object(
        'ok', true,
        'mode', 'search',
        'query', q,
        'product', null,
        'candidates', candidates
    );
end;
$$;

revoke all on function public.admin_fetch_game_metadata(text) from public;
grant execute on function public.admin_fetch_game_metadata(text) to authenticated;

revoke all on function public.dlsite_http_get(text) from public;
revoke all on function public.fetch_dlsite_product_json(text) from public;
revoke all on function public.search_dlsite_candidates(text, integer) from public;
-- Helpers remain executable by authenticated only via security definer parent; lock down direct use:
revoke all on function public.urlencode_utf8(text) from public;
grant execute on function public.urlencode_utf8(text) to authenticated;
grant execute on function public.extract_dlsite_product_code(text) to authenticated;
grant execute on function public.infer_dlsite_cg_type(jsonb) to authenticated;
grant execute on function public.normalize_dlsite_product(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_upsert_game_review: persist metadata fields (scores unchanged)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_upsert_game_review(uuid, text, text, integer, text[], text, jsonb);

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
    clean_tags text[] := array(
        select distinct trim(tag)
        from unnest(coalesce(game_tags, '{}')) tag
        where trim(coalesce(tag, '')) <> ''
    );
    clean_genres text[] := array(
        select distinct trim(g)
        from unnest(coalesce(game_genres, '{}')) g
        where trim(coalesce(g, '')) <> ''
    );
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
            review_body, tags, status, created_by,
            developer, genres, cg_type, source_url, product_code,
            release_date, work_type_label, metadata
        )
        values (
            clean_name, clean_cover, stored_rating, clean_scores, total, computed_grade,
            clean_review, coalesce(clean_tags, '{}'), 'published', actor,
            clean_dev, coalesce(clean_genres, '{}'), clean_cg, clean_source, clean_code,
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
               tags = coalesce(clean_tags, '{}'),
               status = 'published',
               created_by = coalesce(created_by, actor),
               developer = clean_dev,
               genres = coalesce(clean_genres, '{}'),
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
