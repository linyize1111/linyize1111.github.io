/**
 * ai-editorial-client.js — call server-side editorial-analyze Edge Function.
 * Never embeds model secrets. Never auto-applies results.
 */
(function () {
  "use strict";

  var CONFIDENCE_FORCE_REVIEW = 0.55;

  async function getAccessToken() {
    if (!window.SB || !window.SB.client) return null;
    var client = window.SB.client();
    var sess = await client.auth.getSession();
    return (sess && sess.data && sess.data.session && sess.data.session.access_token) || null;
  }

  function functionsBase() {
    var cfg = window.SUPABASE_CONFIG || (window.SB && window.SB.config) || {};
    var url = cfg.url || "";
    return url.replace(/\/$/, "") + "/functions/v1/editorial-analyze";
  }

  /**
   * @param {object} article
   * @param {string} mode analyze_and_format | metadata_only
   * @returns {Promise<{ok:boolean, analysis?:object, error?:string, unavailable?:boolean, warnings?:string[]}>}
   */
  async function analyzeArticle(article, mode) {
    var token = await getAccessToken();
    if (!token) {
      return { ok: false, unavailable: true, error: "未登入，無法呼叫 AI 分析" };
    }

    var payload = {
      article: {
        id: article.id || null,
        title: article.title || "",
        body: article.body || "",
        category: article.category || "",
        tags: Array.isArray(article.tags) ? article.tags : [],
        cover: article.cover || null,
        images: Array.isArray(article.images) ? article.images : [],
        section: article.section || "",
        summary: article.summary || "",
        // Reference signals only — server must NOT use as classification rules
        signals: {
          body_char_count: String(article.body || "").replace(/\s+/g, "").length,
          image_count:
            (article.cover ? 1 : 0) +
            (Array.isArray(article.images) ? article.images.length : 0),
          heading_count: (String(article.body || "").match(/^#{1,3}\s/gm) || []).length,
        },
      },
      mode: mode || "analyze_and_format",
      author_voice_priority: "very_high",
    };

    var anon = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || "";
    var res;
    try {
      res = await fetch(functionsBase(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anon,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return {
        ok: false,
        unavailable: true,
        error: "AI 服務無法連線（Edge Function 未部署或網路錯誤）。請改為手動填寫 metadata，勿用字數規則猜測。",
      };
    }

    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      return { ok: false, unavailable: true, error: "AI 回應不是 JSON" };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: data && data.error ? data.error : "非管理員，無法使用 AI 分析" };
    }
    if (res.status === 503 || (data && data.unavailable)) {
      return {
        ok: false,
        unavailable: true,
        error: (data && data.error) || "AI unavailable — 請手動確認，不要自動分類",
      };
    }
    if (!res.ok) {
      return { ok: false, error: (data && data.error) || ("HTTP " + res.status) };
    }

    var analysis = data && data.analysis;
    if (!analysis) {
      return { ok: false, error: "回應缺少 analysis" };
    }

    // Client-side re-validate (defense in depth)
    if (window.SBAiEditorialSchema) {
      var v = window.SBAiEditorialSchema.validateAnalysis(analysis);
      if (!v.ok) {
        return { ok: false, error: "AI JSON schema 無效：" + v.errors.join("; ") };
      }
      if (analysis.confidence < CONFIDENCE_FORCE_REVIEW) {
        analysis.human_review_required = true;
      }
      return { ok: true, analysis: analysis, warnings: v.warnings || [], meta: data.meta || {} };
    }
    return { ok: true, analysis: analysis, meta: data.meta || {} };
  }

  window.SBAiEditorial = {
    analyzeArticle: analyzeArticle,
    CONFIDENCE_FORCE_REVIEW: CONFIDENCE_FORCE_REVIEW,
  };
})();
