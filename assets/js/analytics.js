/**
 * analytics.js — 主站訪客 / 瀏覽計數
 * - source=supabase：RPC 寫入 + site_analytics 讀取（現行）
 * - source=static：只顯示 analytics_snapshot.json，不寫入（Plan A）
 */
(function () {
  "use strict";

  var VISITOR_KEY = "site_visitor_id";
  var SESSION_KEY = "site_view_tracked";

  function dataSource() {
    return window.CmsData && window.CmsData.source
      ? window.CmsData.source()
      : "supabase";
  }

  function canUseSupabase() {
    return !!(window.SB && window.SB.isConfigured && window.SB.isConfigured());
  }

  if (dataSource() === "supabase" && !canUseSupabase()) return;
  if (dataSource() === "static" && !(window.CmsData && window.CmsData.isReady())) return;

  function getVisitorId() {
    try {
      var id = localStorage.getItem(VISITOR_KEY);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
      localStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch (e) {
      return null;
    }
  }

  function pageKey() {
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    var params = new URLSearchParams(location.search);
    if (path === "note.html" && params.get("id")) {
      return "note:" + (params.get("section") || "unknown") + ":" + params.get("id");
    }
    return path.replace(/\.html$/, "") || "index";
  }

  async function trackPageView() {
    // Plan A static：訪客寫入暫停（可逆；正式 cutover 再決定替代方案）
    if (dataSource() === "static") return;
    if (document.hidden) return;
    var sessionId = pageKey();
    try {
      if (sessionStorage.getItem(SESSION_KEY) === sessionId) return;
    } catch (e) { /* ignore */ }

    var visitorId = getVisitorId();
    if (!visitorId) return;

    var client = window.SB.client();
    if (!client) return;

    try {
      var res = await client.rpc("record_page_view", {
        p_visitor_id: visitorId,
        p_page_key: sessionId,
      });
      if (!res.error) {
        try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch (e2) { /* ignore */ }
      }
    } catch (e3) {
      /* silent — analytics must not break the page */
    }
  }

  async function fetchStats() {
    var res;
    if (window.CmsData && window.CmsData.getAnalyticsSnapshot) {
      res = await window.CmsData.getAnalyticsSnapshot();
    } else {
      var client = window.SB.client();
      if (!client) return null;
      res = await client.from("site_analytics").select("key,value");
    }
    if (res.error || !res.data) return null;
    var out = { visitors: 0, views: 0 };
    res.data.forEach(function (row) {
      if (row.key === "unique_visitors") out.visitors = Number(row.value) || 0;
      if (row.key === "page_views") out.views = Number(row.value) || 0;
    });
    return out;
  }

  function renderFooterStats() {
    var host = document.getElementById("site-stats");
    if (!host) return;
    fetchStats().then(function (stats) {
      if (!stats) return;
      host.innerHTML =
        '<span class="site-stat" title="累計不重複訪客（以瀏覽器識別碼估算）">' +
        '<i class="fas fa-users" aria-hidden="true"></i> ' +
        stats.visitors.toLocaleString() +
        "</span>" +
        '<span class="site-stat" title="累計頁面瀏覽（同一訪客同一頁每日最多計一次）">' +
        '<i class="fas fa-eye" aria-hidden="true"></i> ' +
        stats.views.toLocaleString() +
        "</span>";
    });
  }

  function init() {
    trackPageView();
    renderFooterStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.SBAnalytics = {
    trackPageView: trackPageView,
    fetchStats: fetchStats,
    renderFooterStats: renderFooterStats,
  };
})();
