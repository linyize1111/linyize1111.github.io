-- ACG Portal v1.7.1: title search uses Steam + DLsite only.
-- Disables Google CSE / DuckDuckGo / Wikipedia as search providers.
-- Safe to re-run (create or replace). Exact RJ/URL fetch unchanged.

begin;

create or replace function public.admin_search_game_web(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, internal
as $$
declare
    q text := trim(coalesce(query, ''));
    steam_hits jsonb := '[]'::jsonb;
    dlsite_hits jsonb := '[]'::jsonb;
    merged jsonb;
    providers text[] := '{}';
    code text;
    empty_hint text := '在 Steam／DLsite 找不到相近作品。請改用更完整標題或原名，或用進階貼 Steam／DLsite URL、RJ／VJ／BJ 代碼。需人工確認候選。';
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
            'query', q,
            'candidates', '[]'::jsonb,
            'hint', format('偵測到代碼 %s：請改用進階「以代碼／URL 精確抓取」，或直接貼作品頁 URL。', code)
        );
    end if;

    steam_hits := public.search_steam_candidates(q, 6);
    if steam_hits is not null and steam_hits <> '[]'::jsonb then
        providers := providers || 'steam';
    end if;

    begin
        dlsite_hits := public.search_dlsite_candidates(q, 6);
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

    merged := public.rank_search_candidates(
        public.merge_search_candidates(
            array[steam_hits, dlsite_hits],
            12
        ),
        10
    );

    if merged is null or merged = '[]'::jsonb then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'provider', 'steam_dlsite',
            'providers_used', to_jsonb(providers),
            'query', q,
            'candidates', '[]'::jsonb,
            'hint', empty_hint
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'mode', 'search',
        'provider', 'steam_dlsite',
        'providers_used', to_jsonb(providers),
        'query', q,
        'candidates', merged,
        'hint', '候選來自 Steam／DLsite。請點「套用此筆」確認後填入；不會自動填分數。'
    );
end;
$$;

create or replace function public.admin_search_provider_status()
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    return jsonb_build_object(
        'ok', true,
        'google_cse', false,
        'providers', jsonb_build_array('steam', 'dlsite'),
        'fallback', 'steam+dlsite',
        'note', '標題搜尋僅使用 Steam 與 DLsite（已停用 Google CSE／網頁通用搜尋）'
    );
end;
$$;

create or replace function public.admin_fetch_game_metadata(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    q text := trim(coalesce(query, ''));
    code text;
    steam_id text;
    item jsonb;
    product jsonb;
    candidates jsonb;
    steam_hits jsonb := '[]'::jsonb;
    dlsite_hits jsonb := '[]'::jsonb;
    merged jsonb;
    html text;
    host text;
    url text;
    empty_hint text := '無法從此連結抓取公開 metadata。請改選其他候選，或手動填寫。';
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if not public.is_admin() then
        raise exception 'Admin required';
    end if;
    if q = '' then
        raise exception '請輸入遊戲名稱、作品 URL 或 RJ/VJ/BJ 代碼';
    end if;
    if char_length(q) > 2000 then
        raise exception 'Query too long';
    end if;

    -- DLsite code / URL with code
    code := public.extract_dlsite_product_code(q);
    if code is not null and (q ~* 'dlsite\.com' or q !~* '^https?://') then
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
                'hint', format('找不到代碼 %s 的作品。請確認代碼，或改用主搜尋 Steam／DLsite 標題。', code)
            );
        end;
    end if;

    -- Steam app URL
    steam_id := public.extract_steam_app_id(q);
    if steam_id is not null then
        begin
            product := public.fetch_steam_app_details(steam_id);
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
                'hint', format('無法抓取 Steam app %s。請稍後再試或手動填寫。', steam_id)
            );
        end;
    end if;

    -- HTTPS URL → Steam/DLsite preferred; other public pages keep og:* best-effort
    if q ~* '^https?://' then
        url := public.unwrap_search_redirect_url(q);
        host := public.extract_url_host(url);
        if public.is_blocked_download_host(host) then
            return jsonb_build_object(
                'ok', false,
                'mode', 'detail',
                'query', q,
                'product', null,
                'candidates', '[]'::jsonb,
                'hint', '此網域屬於下載／破解／網盤類來源，系統不會抓取內容。請改貼 Steam 或 DLsite 作品頁。'
            );
        end if;

        if host ~ 'dlsite\.com' and code is not null then
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
                null;
            end;
        end if;

        begin
            html := public.safe_https_get(url);
            product := public.normalize_web_page_product(url, html);
            if coalesce(product ->> 'title', '') = '' then
                return jsonb_build_object(
                    'ok', false,
                    'mode', 'detail',
                    'query', q,
                    'product', null,
                    'candidates', '[]'::jsonb,
                    'hint', empty_hint
                );
            end if;
            return jsonb_build_object(
                'ok', true,
                'mode', 'detail',
                'query', q,
                'product', product,
                'candidates', jsonb_build_array(product),
                'hint', '已依公開網頁 og／title 粗抓；請人工核對後再存檔。'
            );
        exception when others then
            return jsonb_build_object(
                'ok', false,
                'mode', 'detail',
                'query', q,
                'product', null,
                'candidates', '[]'::jsonb,
                'hint', empty_hint
            );
        end;
    end if;

    -- Plain title (advanced path): Steam + DLsite candidates
    steam_hits := public.search_steam_candidates(q, 6);
    begin
        dlsite_hits := public.search_dlsite_candidates(q, 6);
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
        end if;
    exception when others then
        dlsite_hits := '[]'::jsonb;
    end;

    merged := public.rank_search_candidates(
        public.merge_search_candidates(array[steam_hits, dlsite_hits], 12),
        10
    );

    if merged is null or merged = '[]'::jsonb then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'query', q,
            'product', null,
            'candidates', '[]'::jsonb,
            'hint', 'Steam／DLsite 無結果。請改用主搜尋標題，或貼 Steam／DLsite URL、RJ／VJ／BJ。'
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'mode', 'search',
        'query', q,
        'product', null,
        'candidates', merged,
        'hint', '請從候選點「套用此筆」；主路徑請用「搜尋 Steam／DLsite」。'
    );
end;
$$;

commit;
