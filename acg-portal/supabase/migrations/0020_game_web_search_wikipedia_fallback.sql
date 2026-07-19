-- ACG Portal v1.7.0 follow-up: Wikipedia opensearch fallback when DuckDuckGo is blocked from cloud IPs.
-- Safe to re-run (create or replace).

begin;

create or replace function public.search_wikipedia_candidates(keyword text, max_results integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    kw text := trim(coalesce(keyword, ''));
    lim int := greatest(1, least(coalesce(max_results, 5), 8));
    lang text;
    langs text[] := array['en', 'ja', 'zh'];
    body text;
    parsed jsonb;
    titles jsonb;
    urls jsonb;
    i int;
    title text;
    link text;
    candidates jsonb := '[]'::jsonb;
    n int := 0;
    seen text[] := '{}';
begin
    if char_length(kw) < 1 or char_length(kw) > 200 then
        return '[]'::jsonb;
    end if;

    foreach lang in array langs loop
        begin
            body := public.safe_https_get(
                format(
                    'https://%s.wikipedia.org/w/api.php?action=opensearch&search=%s&limit=%s&namespace=0&format=json',
                    lang,
                    public.urlencode_utf8(kw),
                    least(lim, 5)
                )
            );
            parsed := body::jsonb;
        exception when others then
            continue;
        end;

        if jsonb_typeof(parsed) <> 'array' or jsonb_array_length(parsed) < 4 then
            continue;
        end if;
        titles := parsed -> 1;
        urls := parsed -> 3;
        if jsonb_typeof(titles) <> 'array' or jsonb_typeof(urls) <> 'array' then
            continue;
        end if;

        for i in 0 .. least(jsonb_array_length(titles), jsonb_array_length(urls)) - 1 loop
            title := coalesce(titles ->> i, '');
            link := coalesce(urls ->> i, '');
            if title = '' or link = '' then
                continue;
            end if;
            if lower(link) = any (seen) then
                continue;
            end if;
            seen := seen || lower(link);
            candidates := candidates || jsonb_build_array(
                jsonb_build_object(
                    'source', 'wikipedia',
                    'store', 'Wikipedia',
                    'product_code', '',
                    'title', title,
                    'developer', '',
                    'cover_url', '',
                    'genres', '[]'::jsonb,
                    'cg_type', 'unknown',
                    'source_url', link,
                    'release_date', null,
                    'work_type', '',
                    'work_type_label', '',
                    'snippet', format('Wikipedia (%s)', lang),
                    'fetchable', true,
                    'ready', false,
                    'host', public.extract_url_host(link)
                )
            );
            n := n + 1;
            exit when n >= lim;
        end loop;
        exit when n >= lim;
    end loop;

    return candidates;
end;
$$;

revoke all on function public.search_wikipedia_candidates(text, integer) from public;

create or replace function public.admin_search_game_web(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, internal
as $$
declare
    q text := trim(coalesce(query, ''));
    has_google boolean;
    google_hits jsonb := '[]'::jsonb;
    steam_hits jsonb := '[]'::jsonb;
    ddg_hits jsonb := '[]'::jsonb;
    wiki_hits jsonb := '[]'::jsonb;
    dlsite_hits jsonb := '[]'::jsonb;
    merged jsonb;
    providers text[] := '{}';
    provider text;
    code text;
    empty_hint text := '找不到相近的公開商品／介紹頁。請改用更完整標題、原名，或貼 Steam／DLsite 等官方 URL。資料來源為公開網頁資訊，需人工確認。';
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if q = '' then
        raise exception '請輸入遊戲標題';
    end if;
    if char_length(q) > 500 then
        raise exception 'Query too long';
    end if;

    code := public.extract_dlsite_product_code(q);
    if code is not null then
        return jsonb_build_object(
            'ok', true,
            'mode', 'detail_hint',
            'provider', 'dlsite_code',
            'providers_used', jsonb_build_array('dlsite'),
            'google_configured', (
                coalesce(public.get_app_secret('GOOGLE_CSE_API_KEY'), '') <> ''
                and coalesce(public.get_app_secret('GOOGLE_CSE_CX'), '') <> ''
            ),
            'query', q,
            'candidates', '[]'::jsonb,
            'hint', format('偵測到代碼 %s：請改用進階「以代碼／URL 精確抓取」，或直接貼作品頁 URL。', code)
        );
    end if;

    has_google := coalesce(public.get_app_secret('GOOGLE_CSE_API_KEY'), '') <> ''
        and coalesce(public.get_app_secret('GOOGLE_CSE_CX'), '') <> '';

    if has_google then
        google_hits := public.search_google_cse_candidates(q, 8);
        if google_hits is not null and google_hits <> '[]'::jsonb then
            providers := providers || 'google_cse';
        end if;
    end if;

    steam_hits := public.search_steam_candidates(q, 5);
    if steam_hits is not null and steam_hits <> '[]'::jsonb then
        providers := providers || 'steam';
    end if;

    if not has_google or google_hits = '[]'::jsonb then
        ddg_hits := public.search_duckduckgo_candidates(q, 8);
        if ddg_hits is not null and ddg_hits <> '[]'::jsonb then
            providers := providers || 'duckduckgo';
        end if;

        wiki_hits := public.search_wikipedia_candidates(q, 4);
        if wiki_hits is not null and wiki_hits <> '[]'::jsonb then
            providers := providers || 'wikipedia';
        end if;

        begin
            dlsite_hits := public.search_dlsite_candidates(q, 4);
            if dlsite_hits is not null and dlsite_hits <> '[]'::jsonb then
                dlsite_hits := (
                    select coalesce(jsonb_agg(
                        c || jsonb_build_object(
                            'store', coalesce(c ->> 'store', 'DLsite'),
                            'snippet', '',
                            'fetchable', true,
                            'ready', true
                        )
                    ), '[]'::jsonb)
                    from jsonb_array_elements(dlsite_hits) c
                );
                providers := providers || 'dlsite';
            end if;
        exception when others then
            dlsite_hits := '[]'::jsonb;
        end;
    else
        -- Even with Google, add a little Wikipedia enrichment for encyclopedia hits
        wiki_hits := public.search_wikipedia_candidates(q, 2);
        if wiki_hits is not null and wiki_hits <> '[]'::jsonb then
            providers := providers || 'wikipedia';
        end if;
    end if;

    merged := public.rank_search_candidates(
        public.merge_search_candidates(
            array[google_hits, steam_hits, dlsite_hits, wiki_hits, ddg_hits],
            12
        ),
        10
    );

    if merged is null or merged = '[]'::jsonb then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'provider', case when has_google then 'google_cse' else 'fallback_multi' end,
            'providers_used', to_jsonb(providers),
            'google_configured', has_google,
            'query', q,
            'candidates', '[]'::jsonb,
            'hint', empty_hint || case when not has_google
                then '（尚未設定 Google CSE；備援為 Steam／Wikipedia／DLsite。DuckDuckGo 在雲端 IP 可能無結果。）'
                else ''
            end
        );
    end if;

    provider := case
        when has_google and 'google_cse' = any (providers) then 'google_cse'
        else 'fallback_multi'
    end;

    return jsonb_build_object(
        'ok', true,
        'mode', 'search',
        'provider', provider,
        'providers_used', to_jsonb(providers),
        'google_configured', has_google,
        'query', q,
        'candidates', merged,
        'hint', '資料來源為公開網頁資訊。請點「套用此筆」確認後填入；不會自動填分數。盜版／破解站僅顯示連結、不抓下載內容。'
    );
end;
$$;

create or replace function public.admin_search_provider_status()
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
    has_google boolean;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    has_google := coalesce(public.get_app_secret('GOOGLE_CSE_API_KEY'), '') <> ''
        and coalesce(public.get_app_secret('GOOGLE_CSE_CX'), '') <> '';
    return jsonb_build_object(
        'ok', true,
        'google_cse', has_google,
        'fallback', 'steam+wikipedia+dlsite(+duckduckgo if reachable)',
        'note', case when has_google
            then '使用 Google Custom Search'
            else '尚未設定 Google CSE；使用 Steam／Wikipedia／DLsite 備援（DuckDuckGo 在雲端可能被擋）'
        end
    );
end;
$$;

commit;
