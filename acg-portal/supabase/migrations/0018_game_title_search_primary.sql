-- ACG Portal v1.6.0: title-search as primary autofill path.
-- Soft empty results + clearer hints; keep RJ/URL detail path.
-- Does NOT auto-fill scores. Safe to re-run (create or replace).

begin;

-- Slightly friendlier UA for title-search traffic
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
                'Mozilla/5.0 (compatible; ACGPortalBot/1.6; +https://linyize1111.github.io/acg-portal/)'
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
        'store', 'DLsite',
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

-- Admin RPC: title search primary; empty search returns soft failure + hint (no raise).
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
    empty_hint text := '找不到符合的 DLsite 作品。請改用日文原名或更精準標題，或貼上作品頁 URL／RJ・VJ・BJ 代碼。';
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if q = '' then
        raise exception '請輸入遊戲名稱（建議）、RJ/VJ 代碼或 DLsite URL';
    end if;
    if char_length(q) > 500 then
        raise exception 'Query too long';
    end if;

    code := public.extract_dlsite_product_code(q);
    if code is not null then
        begin
            item := public.fetch_dlsite_product_json(code);
            product := public.normalize_dlsite_product(item);
            return jsonb_build_object(
                'ok', true,
                'mode', 'detail',
                'query', q,
                'product', product,
                'candidates', jsonb_build_array(product),
                'hint', null
            );
        exception when others then
            return jsonb_build_object(
                'ok', false,
                'mode', 'detail',
                'query', q,
                'product', null,
                'candidates', '[]'::jsonb,
                'hint', format('找不到代碼 %s 的作品。請確認代碼是否正確，或改用標題搜尋／貼作品頁 URL。', code)
            );
        end;
    end if;

    -- Keyword / title search → candidate list (never auto-pick first)
    begin
        candidates := public.search_dlsite_candidates(q, 8);
    exception when others then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'query', q,
            'product', null,
            'candidates', '[]'::jsonb,
            'hint', empty_hint || '（搜尋暫時失敗，可稍後再試或改貼 URL／代碼。）'
        );
    end;

    if candidates is null or candidates = '[]'::jsonb then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'query', q,
            'product', null,
            'candidates', '[]'::jsonb,
            'hint', empty_hint
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'mode', 'search',
        'query', q,
        'product', null,
        'candidates', candidates,
        'hint', '請從候選列表點「套用此筆」確認；不會自動填分數。'
    );
end;
$$;

revoke all on function public.admin_fetch_game_metadata(text) from public;
grant execute on function public.admin_fetch_game_metadata(text) to authenticated;

-- Ensure keyword fallback cards also expose store label
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
                        'store', 'DLsite',
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

revoke all on function public.search_dlsite_candidates(text, integer) from public;
revoke all on function public.dlsite_http_get(text) from public;

commit;
