/**
 * cms-data.js — unified public CMS data access (Supabase | static JSON)
 *
 * Used by cms-public.js. Admin writes stay on Supabase until cutover.
 */
(function () {
  "use strict";

  var cfg = window.CMS_DATA_CONFIG || { source: "supabase", staticBase: "content/cms" };

  function source() {
    var s = (cfg.source || "supabase").toLowerCase();
    return s === "static" ? "static" : "supabase";
  }

  function staticBase() {
    var base = cfg.staticBase || "content/cms";
    return base.replace(/\/$/, "");
  }

  function isReady() {
    if (source() === "static") return true;
    return !!(window.SB && window.SB.isConfigured && window.SB.isConfigured());
  }

  var _cache = null;
  async function loadStaticBundle() {
    if (_cache) return _cache;
    var base = staticBase();
    var [articlesRes, sectionsRes, analyticsRes] = await Promise.all([
      fetch(base + "/articles.json", { cache: "no-cache" }),
      fetch(base + "/site_sections.json", { cache: "no-cache" }),
      fetch(base + "/analytics_snapshot.json", { cache: "no-cache" }).catch(function () {
        return null;
      }),
    ]);
    if (!articlesRes.ok) throw new Error("static articles.json HTTP " + articlesRes.status);
    if (!sectionsRes.ok) throw new Error("static site_sections.json HTTP " + sectionsRes.status);
    var articles = await articlesRes.json();
    var sections = await sectionsRes.json();
    var analytics = analyticsRes && analyticsRes.ok ? await analyticsRes.json() : [];
    _cache = { articles: articles || [], sections: sections || [], analytics: analytics || [] };
    return _cache;
  }

  async function listPublishedArticles(section) {
    if (source() === "static") {
      var bundle = await loadStaticBundle();
      var rows = (bundle.articles || []).filter(function (a) {
        return a.status === "published" && (!section || a.section === section);
      });
      rows.sort(function (a, b) {
        var si = (b.sort_index || 0) - (a.sort_index || 0);
        if (si) return si;
        return String(b.published_at || "").localeCompare(String(a.published_at || ""));
      });
      return { data: rows, error: null };
    }
    var client = window.SB.client();
    if (!client) return { data: null, error: new Error("Supabase not configured") };
    try {
      var res = await client
        .from("articles")
        .select(
          "id,section,slug,title,summary,body,cover,images,category,tags,pdf_url,status,published_at,created_at,updated_at,sort_index,cover_display"
        )
        .eq("section", section)
        .eq("status", "published")
        .order("sort_index", { ascending: false })
        .order("published_at", { ascending: false });
      return res;
    } catch (e) {
      return { data: null, error: e };
    }
  }

  async function getPublishedArticle(slug, section) {
    if (source() === "static") {
      var bundle = await loadStaticBundle();
      var hit = (bundle.articles || []).find(function (a) {
        if (a.status !== "published") return false;
        if (a.slug !== slug) return false;
        if (section && a.section !== section) return false;
        return true;
      });
      return { data: hit ? [hit] : [], error: null };
    }
    var client = window.SB.client();
    if (!client) return { data: null, error: new Error("Supabase not configured") };
    var q = client
      .from("articles")
      .select(
        "title,body,cover,category,published_at,updated_at,section,status,images,cover_display"
      )
      .eq("slug", slug)
      .eq("status", "published")
      .limit(1);
    if (section) q = q.eq("section", section);
    return q;
  }

  async function getSiteSections() {
    if (source() === "static") {
      var bundle = await loadStaticBundle();
      return { data: bundle.sections || [], error: null };
    }
    var client = window.SB.client();
    if (!client) return { data: null, error: new Error("Supabase not configured") };
    return client.from("site_sections").select("key,value");
  }

  async function getAnalyticsSnapshot() {
    if (source() === "static") {
      var bundle = await loadStaticBundle();
      return { data: bundle.analytics || [], error: null };
    }
    var client = window.SB.client();
    if (!client) return { data: null, error: new Error("Supabase not configured") };
    return client.from("site_analytics").select("key,value");
  }

  window.CmsData = {
    source: source,
    isReady: isReady,
    listPublishedArticles: listPublishedArticles,
    getPublishedArticle: getPublishedArticle,
    getSiteSections: getSiteSections,
    getAnalyticsSnapshot: getAnalyticsSnapshot,
  };
})();
