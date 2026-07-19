-- ACG Portal v1.7.0: web / Google CSE title search for game review autofill.
-- Primary: Google Custom Search JSON API (secrets in internal.app_secrets).
-- Fallback (no key): Steam storesearch + DuckDuckGo HTML POST + DLsite keyword.
-- Selecting a candidate resolves page metadata (Steam/DLsite parsers or og:*).
-- Does NOT crawl pirate/crack/netdisk download content. Does NOT auto-fill scores.
-- Safe to re-run (create or replace / if not exists).

begin;

create schema if not exists internal;

create table if not exists internal.app_secrets (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now()
);

revoke all on table internal.app_secrets from public;
revoke all on table internal.app_secrets from anon;
revoke all on table internal.app_secrets from authenticated;
alter table internal.app_secrets enable row level security;

create or replace function public.get_app_secret(secret_key text)
returns text
language plpgsql
security definer
set search_path = public, internal
as $$
declare
    v text;
begin
    if secret_key is null or secret_key !~ '^[A-Z0-9_]{3,64}$' then
        return null;
    end if;
    select s.value into v
    from internal.app_secrets s
    where s.key = secret_key;
    return v;
end;
$$;

revoke all on function public.get_app_secret(text) from public;
revoke all on function public.get_app_secret(text) from anon;
revoke all on function public.get_app_secret(text) from authenticated;

create or replace function public.admin_upsert_app_secret(secret_key text, secret_value text)
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
    if secret_key is null or secret_key !~ '^[A-Z0-9_]{3,64}$' then
        raise exception 'Invalid secret key';
    end if;
    if secret_key not in (
        'GOOGLE_CSE_API_KEY',
        'GOOGLE_CSE_CX',
        'SERPAPI_API_KEY',
        'BING_SEARCH_API_KEY',
        'SAUCENAO_API_KEY'
    ) then
        raise exception 'Secret key not allowed: %', secret_key;
    end if;
    if secret_value is null or length(secret_value) < 4 or length(secret_value) > 4000 then
        raise exception 'Invalid secret value length';
    end if;

    insert into internal.app_secrets as t (key, value, updated_at)
    values (secret_key, secret_value, now())
    on conflict (key) do update
        set value = excluded.value,
            updated_at = now();

    return jsonb_build_object('ok', true, 'key', secret_key);
end;
$$;

revoke all on function public.admin_upsert_app_secret(text, text) from public;
grant execute on function public.admin_upsert_app_secret(text, text) to authenticated;

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
        'fallback', 'steam+duckduckgo+dlsite',
        'note', case when has_google
            then '使用 Google Custom Search'
            else '尚未設定 Google CSE；使用 Steam／DuckDuckGo／DLsite 備援'
        end
    );
end;
$$;

revoke all on function public.admin_search_provider_status() from public;
grant execute on function public.admin_search_provider_status() to authenticated;

-- ---------------------------------------------------------------------------
-- URL / host helpers
-- ---------------------------------------------------------------------------
create or replace function public.urldecode_utf8(data text)
returns text
language plpgsql
immutable
as $$
declare
    s text := coalesce(data, '');
    out text := '';
    i int := 1;
    c text;
    hex text;
begin
    s := replace(s, '+', ' ');
    while i <= char_length(s) loop
        c := substr(s, i, 1);
        if c = '%' and i + 2 <= char_length(s) then
            hex := substr(s, i + 1, 2);
            if hex ~* '^[0-9a-f]{2}$' then
                begin
                    out := out || convert_from(decode(hex, 'hex'), 'UTF8');
                exception when others then
                    out := out || c;
                    i := i + 1;
                    continue;
                end;
                i := i + 3;
                continue;
            end if;
        end if;
        out := out || c;
        i := i + 1;
    end loop;
    return out;
end;
$$;

create or replace function public.html_entity_decode(data text)
returns text
language plpgsql
immutable
as $$
declare
    s text := coalesce(data, '');
begin
    s := regexp_replace(s, '<[^>]+>', '', 'g');
    s := replace(s, '&amp;', '&');
    s := replace(s, '&quot;', '"');
    s := replace(s, '&#39;', '''');
    s := replace(s, '&apos;', '''');
    s := replace(s, '&lt;', '<');
    s := replace(s, '&gt;', '>');
    s := replace(s, '&nbsp;', ' ');
    s := trim(both from s);
    return s;
end;
$$;

create or replace function public.extract_url_host(raw_url text)
returns text
language plpgsql
immutable
as $$
declare
    u text := trim(coalesce(raw_url, ''));
    m text[];
begin
    if u = '' then
        return '';
    end if;
    if u like '//%' then
        u := 'https:' || u;
    end if;
    m := regexp_match(u, '^https?://([^/]+)', 'i');
    if m is null then
        return '';
    end if;
    return lower(m[1]);
end;
$$;

create or replace function public.is_blocked_download_host(host text)
returns boolean
language plpgsql
immutable
as $$
declare
    h text := lower(trim(coalesce(host, '')));
begin
    if h = '' then
        return false;
    end if;
    -- Pirate / crack / torrent / netdisk style hosts — never fetch page bodies for autofill.
    return h ~ '(steamunlocked|steamrip|steamgg|igg-games|fitgirl|oceanofgames|ovagames|apunkagames|crookedbee|modyolo|gog-games\.to|gamecopyworld|cs\.rin\.ru|f95zone\.to|nyaa\.si|sukebei|rutracker|1337x|thepiratebay|piratebay|megadb|gofile\.io|mediafire\.com|mega\.nz|1fichier\.com|pixeldrain\.com|workupload\.com|pan\.baidu\.com|aliyundrive\.com|alipan\.com|123pan\.com|lanzou|quark\.cn|skidrow|codex\.re|repacks\.me|crackwatch)';
end;
$$;

create or replace function public.detect_store_label(raw_url text)
returns text
language plpgsql
immutable
as $$
declare
    h text := public.extract_url_host(raw_url);
    u text := lower(trim(coalesce(raw_url, '')));
begin
    if h ~ 'dlsite\.com' then
        return 'DLsite';
    end if;
    if h ~ 'steampowered\.com' or h ~ 'steamcommunity\.com' then
        return 'Steam';
    end if;
    if h ~ 'dmm\.co\.jp' or h ~ 'fantia\.jp' or u ~ 'fanza' then
        return 'Fanza/DMM';
    end if;
    if h ~ 'getchu\.com' then
        return 'Getchu';
    end if;
    if h ~ 'itch\.io' then
        return 'itch.io';
    end if;
    if h ~ 'wikipedia\.org' then
        return 'Wikipedia';
    end if;
    if h ~ 'fandom\.com' then
        return 'Fandom';
    end if;
    if h ~ 'gog\.com' then
        return 'GOG';
    end if;
    if h ~ 'nintendo\.com' or h ~ 'playstation\.com' or h ~ 'xbox\.com' or h ~ 'epicgames\.com' then
        return '官方商店';
    end if;
    if public.is_blocked_download_host(h) then
        return '略過抓取';
    end if;
    if h <> '' then
        return h;
    end if;
    return '網頁';
end;
$$;

create or replace function public.unwrap_search_redirect_url(raw_url text)
returns text
language plpgsql
immutable
as $$
declare
    u text := trim(coalesce(raw_url, ''));
    m text[];
    decoded text;
begin
    if u = '' then
        return '';
    end if;
    if u like '//%' then
        u := 'https:' || u;
    end if;
    -- DuckDuckGo redirect: .../l/?uddg=<urlencoded>
    m := regexp_match(u, '[?&]uddg=([^&]+)', 'i');
    if m is not null then
        decoded := public.urldecode_utf8(m[1]);
        if decoded ~* '^https?://' then
            return decoded;
        end if;
    end if;
    return u;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic HTTPS GET (allowlist / blocklist). Never follows download hosts.
-- ---------------------------------------------------------------------------
create or replace function public.safe_https_get(target_url text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    u text := trim(coalesce(target_url, ''));
    host text;
    resp extensions.http_response;
begin
    u := public.unwrap_search_redirect_url(u);
    if u !~* '^https://' then
        raise exception 'Only HTTPS URLs are allowed';
    end if;
    if char_length(u) > 2000 then
        raise exception 'URL too long';
    end if;
    host := public.extract_url_host(u);
    if host = '' then
        raise exception 'Invalid URL host';
    end if;
    if public.is_blocked_download_host(host) then
        raise exception 'Blocked host (download/pirate): %', host;
    end if;

    select * into resp
    from extensions.http((
        'GET',
        u,
        array[
            extensions.http_header(
                'User-Agent',
                'Mozilla/5.0 (compatible; ACGPortalBot/1.7; +https://linyize1111.github.io/acg-portal/)'
            ),
            extensions.http_header('Accept', 'application/json,text/html,*/*'),
            extensions.http_header('Accept-Language', 'ja,zh-TW;q=0.9,en;q=0.8')
        ],
        null,
        null
    )::extensions.http_request);

    if resp.status is null or resp.status >= 500 then
        raise exception 'HTTP fetch failed (HTTP %)', coalesce(resp.status, 0);
    end if;
    return left(coalesce(resp.content, ''), 500000);
end;
$$;

revoke all on function public.safe_https_get(text) from public;

create or replace function public.safe_https_post_form(target_url text, form_body text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    u text := trim(coalesce(target_url, ''));
    host text;
    resp extensions.http_response;
begin
    if u !~* '^https://' then
        raise exception 'Only HTTPS URLs are allowed';
    end if;
    host := public.extract_url_host(u);
    if public.is_blocked_download_host(host) then
        raise exception 'Blocked host: %', host;
    end if;
    -- Only allow known search endpoints for POST
    if host not in ('html.duckduckgo.com', 'lite.duckduckgo.com', 'duckduckgo.com') then
        raise exception 'POST not allowed for host: %', host;
    end if;

    select * into resp
    from extensions.http((
        'POST',
        u,
        array[
            extensions.http_header(
                'User-Agent',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            ),
            extensions.http_header('Accept', 'text/html,*/*'),
            extensions.http_header('Content-Type', 'application/x-www-form-urlencoded')
        ],
        'application/x-www-form-urlencoded',
        coalesce(form_body, '')
    )::extensions.http_request);

    if resp.status is null or resp.status >= 500 then
        raise exception 'HTTP POST failed (HTTP %)', coalesce(resp.status, 0);
    end if;
    return left(coalesce(resp.content, ''), 500000);
end;
$$;

revoke all on function public.safe_https_post_form(text, text) from public;

-- ---------------------------------------------------------------------------
-- Meta extraction from HTML (og:* best-effort)
-- ---------------------------------------------------------------------------
create or replace function public.extract_meta_content(html text, prop text)
returns text
language plpgsql
immutable
as $$
declare
    h text := coalesce(html, '');
    m text[];
    p text := prop;
begin
    m := regexp_match(
        h,
        format(
            'property=["'']%s["''][^>]*content=["'']([^"'']+)["'']',
            p
        ),
        'i'
    );
    if m is not null then
        return public.html_entity_decode(m[1]);
    end if;
    m := regexp_match(
        h,
        format(
            'content=["'']([^"'']+)["''][^>]*property=["'']%s["'']',
            p
        ),
        'i'
    );
    if m is not null then
        return public.html_entity_decode(m[1]);
    end if;
    m := regexp_match(
        h,
        format(
            'name=["'']%s["''][^>]*content=["'']([^"'']+)["'']',
            p
        ),
        'i'
    );
    if m is not null then
        return public.html_entity_decode(m[1]);
    end if;
    m := regexp_match(
        h,
        format(
            'content=["'']([^"'']+)["''][^>]*name=["'']%s["'']',
            p
        ),
        'i'
    );
    if m is not null then
        return public.html_entity_decode(m[1]);
    end if;
    return '';
end;
$$;

create or replace function public.normalize_web_page_product(source_url text, html text)
returns jsonb
language plpgsql
immutable
as $$
declare
    title text;
    cover text;
    desc_text text;
    developer text := '';
    store text := public.detect_store_label(source_url);
    m text[];
begin
    title := public.extract_meta_content(html, 'og:title');
    if title = '' then
        m := regexp_match(coalesce(html, ''), '<title[^>]*>(.*?)</title>', 'i');
        if m is not null then
            title := public.html_entity_decode(m[1]);
        end if;
    end if;
    cover := public.extract_meta_content(html, 'og:image');
    if cover like '//%' then
        cover := 'https:' || cover;
    end if;
    desc_text := public.extract_meta_content(html, 'og:description');
    if desc_text = '' then
        desc_text := public.extract_meta_content(html, 'description');
    end if;
    developer := coalesce(
        nullif(public.extract_meta_content(html, 'author'), ''),
        nullif(public.extract_meta_content(html, 'application-name'), ''),
        ''
    );

    return jsonb_build_object(
        'source', 'web',
        'store', store,
        'product_code', '',
        'title', coalesce(title, ''),
        'developer', developer,
        'cover_url', coalesce(cover, ''),
        'genres', '[]'::jsonb,
        'cg_type', 'unknown',
        'source_url', source_url,
        'release_date', null,
        'work_type', '',
        'work_type_label', '',
        'snippet', left(coalesce(desc_text, ''), 400),
        'options', '',
        'site_id', '',
        'raw', jsonb_build_object('via', 'og_meta')
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Steam helpers
-- ---------------------------------------------------------------------------
create or replace function public.extract_steam_app_id(raw_query text)
returns text
language plpgsql
immutable
as $$
declare
    q text := trim(coalesce(raw_query, ''));
    m text[];
begin
    m := regexp_match(q, 'store\.steampowered\.com/app/([0-9]{1,12})', 'i');
    if m is not null then
        return m[1];
    end if;
    m := regexp_match(q, 'steamcommunity\.com/app/([0-9]{1,12})', 'i');
    if m is not null then
        return m[1];
    end if;
    return null;
end;
$$;

create or replace function public.normalize_steam_product(app_id text, data jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
    genres text[] := array(
        select distinct trim(g ->> 'description')
        from jsonb_array_elements(coalesce(data -> 'genres', '[]'::jsonb)) g
        where trim(coalesce(g ->> 'description', '')) <> ''
    );
    developers text[] := array(
        select trim(x)
        from jsonb_array_elements_text(coalesce(data -> 'developers', '[]'::jsonb)) x
        where trim(x) <> ''
    );
    release_raw text := left(coalesce(data #>> '{release_date,date}', ''), 32);
    release_d date := null;
    cover text := coalesce(nullif(data ->> 'header_image', ''), '');
begin
    -- Steam dates are often "12 Oct, 2020" — leave null unless ISO-like
    if release_raw ~ '^\d{4}-\d{2}-\d{2}' then
        release_d := left(release_raw, 10)::date;
    end if;

    return jsonb_build_object(
        'source', 'steam',
        'store', 'Steam',
        'product_code', coalesce(app_id, ''),
        'title', coalesce(nullif(trim(data ->> 'name'), ''), ''),
        'developer', coalesce(array_to_string(developers, ', '), ''),
        'cover_url', cover,
        'genres', to_jsonb(coalesce(genres, '{}'::text[])),
        'cg_type', 'unknown',
        'source_url', format('https://store.steampowered.com/app/%s/', app_id),
        'release_date', release_d,
        'work_type', '',
        'work_type_label', coalesce(data ->> 'type', 'game'),
        'snippet', left(public.html_entity_decode(coalesce(data ->> 'short_description', '')), 400),
        'options', '',
        'site_id', 'steam',
        'raw', jsonb_build_object(
            'steam_appid', app_id,
            'publishers', data -> 'publishers',
            'categories', data -> 'categories'
        )
    );
end;
$$;

create or replace function public.fetch_steam_app_details(app_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    id text := trim(coalesce(app_id, ''));
    body text;
    parsed jsonb;
    node jsonb;
begin
    if id !~ '^[0-9]{1,12}$' then
        raise exception 'Invalid Steam app id';
    end if;
    body := public.safe_https_get(
        format('https://store.steampowered.com/api/appdetails?appids=%s&l=english', id)
    );
    parsed := body::jsonb;
    node := parsed -> id;
    if node is null or coalesce(node ->> 'success', '') not in ('true', 't', '1') then
        raise exception 'Steam app not found: %', id;
    end if;
    return public.normalize_steam_product(id, node -> 'data');
end;
$$;

revoke all on function public.fetch_steam_app_details(text) from public;

create or replace function public.search_steam_candidates(keyword text, max_results integer default 6)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    kw text := trim(coalesce(keyword, ''));
    lim int := greatest(1, least(coalesce(max_results, 6), 8));
    body text;
    parsed jsonb;
    item jsonb;
    candidates jsonb := '[]'::jsonb;
    app_id text;
    cover text;
begin
    if char_length(kw) < 1 or char_length(kw) > 120 then
        return '[]'::jsonb;
    end if;
    begin
        body := public.safe_https_get(
            format(
                'https://store.steampowered.com/api/storesearch/?term=%s&l=english&cc=US',
                public.urlencode_utf8(kw)
            )
        );
        parsed := body::jsonb;
    exception when others then
        return '[]'::jsonb;
    end;

    for item in
        select value
        from jsonb_array_elements(coalesce(parsed -> 'items', '[]'::jsonb))
        limit lim
    loop
        app_id := coalesce(item ->> 'id', '');
        if app_id = '' then
            continue;
        end if;
        cover := coalesce(item ->> 'tiny_image', '');
        candidates := candidates || jsonb_build_array(
            jsonb_build_object(
                'source', 'steam',
                'store', 'Steam',
                'product_code', app_id,
                'title', coalesce(item ->> 'name', ''),
                'developer', '',
                'cover_url', cover,
                'genres', '[]'::jsonb,
                'cg_type', 'unknown',
                'source_url', format('https://store.steampowered.com/app/%s/', app_id),
                'release_date', null,
                'work_type', '',
                'work_type_label', coalesce(item ->> 'type', ''),
                'snippet', '',
                'fetchable', true,
                'ready', false
            )
        );
    end loop;
    return candidates;
end;
$$;

revoke all on function public.search_steam_candidates(text, integer) from public;

-- ---------------------------------------------------------------------------
-- Google CSE + DuckDuckGo search
-- ---------------------------------------------------------------------------
create or replace function public.search_google_cse_candidates(keyword text, max_results integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, internal
as $$
declare
    kw text := trim(coalesce(keyword, ''));
    lim int := greatest(1, least(coalesce(max_results, 8), 10));
    api_key text := public.get_app_secret('GOOGLE_CSE_API_KEY');
    cx text := public.get_app_secret('GOOGLE_CSE_CX');
    body text;
    parsed jsonb;
    item jsonb;
    candidates jsonb := '[]'::jsonb;
    link text;
    host text;
    cover text;
    fetchable boolean;
begin
    if api_key is null or cx is null or api_key = '' or cx = '' then
        return '[]'::jsonb;
    end if;
    if char_length(kw) < 1 or char_length(kw) > 200 then
        return '[]'::jsonb;
    end if;

    begin
        body := public.safe_https_get(
            format(
                'https://www.googleapis.com/customsearch/v1?key=%s&cx=%s&q=%s&num=%s&safe=off',
                public.urlencode_utf8(api_key),
                public.urlencode_utf8(cx),
                public.urlencode_utf8(kw),
                lim
            )
        );
        parsed := body::jsonb;
    exception when others then
        return '[]'::jsonb;
    end;

    for item in
        select value
        from jsonb_array_elements(coalesce(parsed -> 'items', '[]'::jsonb))
        limit lim
    loop
        link := public.unwrap_search_redirect_url(coalesce(item ->> 'link', ''));
        if link = '' then
            continue;
        end if;
        host := public.extract_url_host(link);
        fetchable := not public.is_blocked_download_host(host);
        cover := coalesce(
            nullif(item #>> '{pagemap,cse_thumbnail,0,src}', ''),
            nullif(item #>> '{pagemap,cse_image,0,src}', ''),
            ''
        );
        candidates := candidates || jsonb_build_array(
            jsonb_build_object(
                'source', 'google',
                'store', public.detect_store_label(link),
                'product_code', '',
                'title', coalesce(item ->> 'title', ''),
                'developer', '',
                'cover_url', cover,
                'genres', '[]'::jsonb,
                'cg_type', 'unknown',
                'source_url', link,
                'release_date', null,
                'work_type', '',
                'work_type_label', '',
                'snippet', left(coalesce(item ->> 'snippet', ''), 400),
                'fetchable', fetchable,
                'ready', false,
                'host', host
            )
        );
    end loop;
    return candidates;
end;
$$;

revoke all on function public.search_google_cse_candidates(text, integer) from public;

create or replace function public.search_duckduckgo_candidates(keyword text, max_results integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    kw text := trim(coalesce(keyword, ''));
    lim int := greatest(1, least(coalesce(max_results, 8), 10));
    html text;
    form_body text;
    candidates jsonb := '[]'::jsonb;
    matched text[];
    href text;
    title text;
    link text;
    host text;
    fetchable boolean;
    n int := 0;
    snippet text := '';
    snippets text[];
    sn_i int := 0;
begin
    if char_length(kw) < 1 or char_length(kw) > 200 then
        return '[]'::jsonb;
    end if;

    form_body := 'q=' || public.urlencode_utf8(kw) || '&b=';
    begin
        html := public.safe_https_post_form('https://html.duckduckgo.com/html/', form_body);
    exception when others then
        return '[]'::jsonb;
    end;

    snippets := array(
        select public.html_entity_decode(m[1])
        from regexp_matches(coalesce(html, ''), 'class="result__snippet"[^>]*>(.*?)</a>', 'gi') as m
    );

    for matched in
        select m
        from regexp_matches(
            coalesce(html, ''),
            '<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
            'gi'
        ) as m
    loop
        href := matched[1];
        title := public.html_entity_decode(matched[2]);
        link := public.unwrap_search_redirect_url(href);
        if link !~* '^https://' then
            continue;
        end if;
        host := public.extract_url_host(link);
        fetchable := not public.is_blocked_download_host(host);
        sn_i := sn_i + 1;
        snippet := coalesce(snippets[sn_i], '');
        candidates := candidates || jsonb_build_array(
            jsonb_build_object(
                'source', 'duckduckgo',
                'store', public.detect_store_label(link),
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
                'snippet', left(snippet, 400),
                'fetchable', fetchable,
                'ready', false,
                'host', host
            )
        );
        n := n + 1;
        exit when n >= lim;
    end loop;

    return candidates;
end;
$$;

revoke all on function public.search_duckduckgo_candidates(text, integer) from public;

create or replace function public.merge_search_candidates(parts jsonb[], max_results integer default 10)
returns jsonb
language plpgsql
immutable
as $$
declare
    lim int := greatest(1, least(coalesce(max_results, 10), 12));
    seen text[] := '{}';
    out jsonb := '[]'::jsonb;
    part jsonb;
    item jsonb;
    url_key text;
    n int := 0;
begin
    foreach part in array parts loop
        if part is null or part = '[]'::jsonb then
            continue;
        end if;
        for item in select value from jsonb_array_elements(part) loop
            url_key := lower(trim(coalesce(item ->> 'source_url', item ->> 'product_code', '')));
            if url_key = '' then
                continue;
            end if;
            if url_key = any (seen) then
                continue;
            end if;
            seen := seen || url_key;
            out := out || jsonb_build_array(item);
            n := n + 1;
            exit when n >= lim;
        end loop;
        exit when n >= lim;
    end loop;
    return out;
end;
$$;

-- Prefer known stores when ordering: rebuild with priority buckets
create or replace function public.rank_search_candidates(candidates jsonb, max_results integer default 10)
returns jsonb
language plpgsql
immutable
as $$
declare
    lim int := greatest(1, least(coalesce(max_results, 10), 12));
    preferred jsonb := '[]'::jsonb;
    normal jsonb := '[]'::jsonb;
    blocked jsonb := '[]'::jsonb;
    item jsonb;
    store text;
    fetchable boolean;
begin
    for item in select value from jsonb_array_elements(coalesce(candidates, '[]'::jsonb)) loop
        store := lower(coalesce(item ->> 'store', ''));
        fetchable := coalesce((item ->> 'fetchable')::boolean, true);
        if not fetchable or store = '略過抓取' then
            blocked := blocked || jsonb_build_array(item);
        elsif store in ('steam', 'dlsite', 'fanza/dmm', 'getchu', 'itch.io', 'wikipedia', 'gog', '官方商店') then
            preferred := preferred || jsonb_build_array(item);
        else
            normal := normal || jsonb_build_array(item);
        end if;
    end loop;
    return public.merge_search_candidates(array[preferred, normal, blocked], lim);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: web title search
-- ---------------------------------------------------------------------------
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

    -- Exact DLsite code still short-circuits via detail RPC path hint
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

    -- Always enrich with Steam structured results (cheap, no key)
    steam_hits := public.search_steam_candidates(q, 5);
    if steam_hits is not null and steam_hits <> '[]'::jsonb then
        providers := providers || 'steam';
    end if;

    if not has_google or google_hits = '[]'::jsonb then
        ddg_hits := public.search_duckduckgo_candidates(q, 8);
        if ddg_hits is not null and ddg_hits <> '[]'::jsonb then
            providers := providers || 'duckduckgo';
        end if;
        begin
            dlsite_hits := public.search_dlsite_candidates(q, 4);
            -- ensure store/fetchable fields on DLsite cards
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
    end if;

    merged := public.rank_search_candidates(
        public.merge_search_candidates(
            array[google_hits, steam_hits, dlsite_hits, ddg_hits],
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
                then '（尚未設定 Google CSE，備援準確率較差；見 GAME-REVIEW-AUTOFILL.md）'
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

revoke all on function public.admin_search_game_web(text) from public;
grant execute on function public.admin_search_game_web(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enhance detail fetch: Steam + generic OG + existing DLsite
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
    steam_id text;
    item jsonb;
    product jsonb;
    candidates jsonb;
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
                'hint', format('找不到代碼 %s 的作品。請確認代碼，或改用網頁搜尋標題。', code)
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

    -- Generic HTTPS URL → og meta (skip blocked hosts)
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
                'hint', '此網域屬於下載／破解／網盤類來源，系統不會抓取內容。請改選 Steam、DLsite、官方站或 Wikipedia 等公開介紹頁。'
            );
        end if;

        -- DLsite URL without extracted code handled above; try product page anyway
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

    -- Plain title: keep soft DLsite keyword path for advanced / backward compat
    begin
        candidates := public.search_dlsite_candidates(q, 8);
    exception when others then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'query', q,
            'product', null,
            'candidates', '[]'::jsonb,
            'hint', 'DLsite 標題搜尋失敗。請改用主搜尋（網頁／Google），或貼官方 URL。'
        );
    end;

    if candidates is null or candidates = '[]'::jsonb then
        return jsonb_build_object(
            'ok', false,
            'mode', 'search',
            'query', q,
            'product', null,
            'candidates', '[]'::jsonb,
            'hint', 'DLsite 無結果。請改按主搜尋「用網頁搜尋標題」，或貼 Steam／官方 URL。'
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'mode', 'search',
        'query', q,
        'product', null,
        'candidates', candidates,
        'hint', '（進階 DLsite）請從候選點「套用此筆」；主路徑請用網頁／Google 搜尋。'
    );
end;
$$;

revoke all on function public.admin_fetch_game_metadata(text) from public;
grant execute on function public.admin_fetch_game_metadata(text) to authenticated;

revoke all on function public.urldecode_utf8(text) from public;
revoke all on function public.html_entity_decode(text) from public;
revoke all on function public.extract_url_host(text) from public;
revoke all on function public.is_blocked_download_host(text) from public;
revoke all on function public.detect_store_label(text) from public;
revoke all on function public.unwrap_search_redirect_url(text) from public;
revoke all on function public.extract_meta_content(text, text) from public;
revoke all on function public.normalize_web_page_product(text, text) from public;
revoke all on function public.extract_steam_app_id(text) from public;
revoke all on function public.normalize_steam_product(text, jsonb) from public;
revoke all on function public.merge_search_candidates(jsonb[], integer) from public;
revoke all on function public.rank_search_candidates(jsonb, integer) from public;

commit;
