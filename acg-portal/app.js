(() => {
  "use strict";

  const config = window.ACG_CONFIG;
  const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" }
  });

  const PLATFORM_LABELS = { nhentai: "Nhentai", "18comic": "禁漫", hanime: "Hanime", pixiv: "Pixiv" };
  const state = {
    works: [],
    sourceStats: Object.fromEntries(config.platforms.map(platform => [platform, { total: 0, active: 0, inactive: 0, rejected: 0, running: false, lastRun: null }])),
    workById: new Map(),
    leaderboard: [],
    scoreByWork: new Map(),
    shownByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, new Set()])),
    currentByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, null])),
    recentByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, []])),
    cardSideByPlatform: Object.fromEntries(config.platforms.map(platform => [platform, "front"])),
    session: null,
    profile: null,
    profiles: new Map(),
    favorites: new Set(),
    preferenceTags: new Map(),
    libraryVisible: 60,
    librarySeed: crypto.randomUUID?.() || String(Date.now()),
    bulkWorks: [],
    currentWork: null,
    currentReviews: new Map(),
    currentGameId: null,
    adminWorks: [],
    currentRating: 5,
    adminTab: "users",
    workerStatus: { available: null, lastError: null },
    googleProviderEnabled: null
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  function debounce(fn, wait = 220) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function toast(message, type = "info") {
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    $("#toast-region").append(node);
    setTimeout(() => node.remove(), 4200);
  }

  function workerErrorMessage(error) {
    const detail = error?.detail || error?.message || String(error || "");
    return detail ? `後端 worker 目前不可用：${detail}` : "後端 worker 目前不可用";
  }

  async function fetchWorkerJson(path, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.workerUrl}${path}`, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.detail || `HTTP ${response.status}`);
        error.status = response.status;
        error.detail = payload.detail || `HTTP ${response.status}`;
        throw error;
      }
      state.workerStatus = { available: true, lastError: null };
      return payload;
    } catch (error) {
      state.workerStatus = {
        available: false,
        lastError: error.name === "AbortError" ? "連線逾時" : (error.detail || error.message || String(error))
      };
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function flashButton(button) {
    if (!button) return;
    button.classList.remove("is-pressing");
    void button.offsetWidth;
    button.classList.add("is-pressing");
    setTimeout(() => button.classList.remove("is-pressing"), 520);
  }

  function flashDrawArea() {
    const area = $("#platform-cards");
    if (!area) return;
    area.classList.remove("draw-pulse");
    void area.offsetWidth;
    area.classList.add("draw-pulse");
    setTimeout(() => area.classList.remove("draw-pulse"), 620);
  }

  function normalize(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-TW").replace(/\s+/g, " ").trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function similarity(a, b) {
    const longest = Math.max(a.length, b.length);
    return longest ? 1 - levenshtein(a, b) / longest : 1;
  }

  function workMatches(work, query) {
    return workSearchScore(work, query) > Number.NEGATIVE_INFINITY;
  }

  function stableRandom(value, seed = state.librarySeed) {
    const text = `${seed}:${value}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function searchableFields(work) {
    return [
      { value: work.work_id, weight: 120 },
      { value: work.title, weight: 75 },
      ...((work.title_alt || []).map(value => ({ value, weight: 55 }))),
      { value: work.author, weight: 48 },
      ...((work.tags || []).map(value => ({ value, weight: 34 }))),
    ].map(field => ({ ...field, normalized: normalize(field.value) })).filter(field => field.normalized);
  }

  function scoreTerm(field, term) {
    if (!term) return 0;
    if (field.normalized === term) return field.weight * 2.2;
    if (field.normalized.startsWith(term)) return field.weight * 1.55;
    if (field.normalized.includes(term)) return field.weight;
    if (term.length < 3) return 0;
    const tokens = field.normalized.split(/[\s\-_()[\]【】「」,，/]+/).filter(Boolean);
    let best = 0;
    for (const token of tokens) {
      if (Math.abs(token.length - term.length) > 3) continue;
      const match = similarity(token, term);
      if (match >= .68) best = Math.max(best, field.weight * match * .75);
    }
    return best;
  }

  function workSearchScore(work, query) {
    const q = normalize(query);
    if (!q) return stableRandom(work.id || `${work.platform}:${work.work_id}`);
    const terms = q.split(" ").filter(Boolean);
    const fields = searchableFields(work);
    let total = 0;
    for (const term of terms) {
      const best = Math.max(...fields.map(field => scoreTerm(field, term)), 0);
      if (best <= 0) return Number.NEGATIVE_INFINITY;
      total += best;
    }
    const rating = state.scoreByWork.get(work.id) || 0;
    return total + Math.max(0, rating + 5) + stableRandom(work.id) * .01;
  }

  function imageUrl(url) {
    if (!url) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect fill="#171b2d" width="100%" height="100%"/><text fill="#737b96" x="50%" y="50%" text-anchor="middle" font-size="32">NO COVER</text></svg>'
    );
    if (url.includes("pximg.net")) return url.replace(/https?:\/\/i\.pximg\.net/, "https://i.pixiv.re");
    return url;
  }

  function isApproved() { return state.profile?.status === "active"; }
  function isAdmin() { return isApproved() && state.profile?.role === "admin"; }

  async function fetchAll(table, queryBuilder) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from(table).select("*").range(offset, offset + 999);
      query = queryBuilder ? queryBuilder(query) : query;
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function loadWorks() {
    state.sourceStats = await loadSourceStatus();
    $("#home-summary").textContent = "同步狀態已更新，正在讀取可抽選作品…";
    renderSourceStatus();
    renderPlatformPlaceholders();

    const activeWorks = await fetchAll("works", query => query.eq("status", "active"));
    state.works = activeWorks.filter(work => work.is_ai !== true);
    state.workById = new Map(state.works.map(work => [work.id, work]));
    if (!Object.values(state.sourceStats).some(stats => stats.total > 0 || stats.active > 0)) {
      state.sourceStats = summarizeSourceStats(state.works);
    }
    const readySources = config.platforms.filter(platform => platformStats(platform).active > 0).length;
    const workerNote = state.workerStatus.available === false ? "（後端 worker 未連線，狀態改用作品庫估算）" : "";
    $("#home-summary").textContent = `目前可抽選 ${state.works.length.toLocaleString()} 筆通過驗證的作品；${readySources} / ${config.platforms.length} 個來源已有 active 內容${workerNote}`;
    renderSourceStatus();
    renderPlatformPlaceholders();
    drawAll();
  }

  async function loadSourceStatus() {
    try {
      const rows = await fetchWorkerJson("/api/source-status", {}, 8000);
      return sourceStatsFromRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.warn("Source status unavailable; falling back to active works only", error);
      return summarizeSourceStats(state.works);
    }
  }

  function summarizeSourceStats(works) {
    const stats = Object.fromEntries(config.platforms.map(platform => [platform, {
      total: 0, active: 0, inactive: 0, rejected: 0, running: false, lastRun: null
    }]));
    for (const work of works) {
      if (!stats[work.platform]) continue;
      const status = work.status || "active";
      stats[work.platform].total += 1;
      stats[work.platform][status] = (stats[work.platform][status] || 0) + 1;
    }
    return stats;
  }

  function sourceStatsFromRows(rows) {
    const stats = summarizeSourceStats([]);
    for (const row of rows) {
      if (!stats[row.platform]) continue;
      stats[row.platform] = {
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        inactive: Number(row.inactive || 0),
        rejected: Number(row.rejected || 0),
        running: Boolean(row.running),
        lastRun: row.last_run || null
      };
    }
    return stats;
  }

  function platformStats(platform) {
    return state.sourceStats[platform] || { total: 0, active: 0, inactive: 0, rejected: 0, running: false, lastRun: null };
  }

  function sourceState(platform) {
    const stats = platformStats(platform);
    if (stats.running) {
      return {
        className: "running",
        label: "RUNNING",
        count: stats.active > 0 ? `${stats.active.toLocaleString()} active` : `${stats.total.toLocaleString()} pending`,
        description: "正在同步；完成後作品數會自動更新"
      };
    }
    if (stats.active > 0) {
      return {
        className: "ready",
        label: "READY",
        count: `${stats.active.toLocaleString()} active`,
        description: stats.inactive || stats.rejected
          ? `${(stats.inactive + stats.rejected).toLocaleString()} 筆非 active 保留`
          : "可抽卡、搜尋與評分"
      };
    }
    if (stats.total > 0) {
      return {
        className: "pending",
        label: "SYNCING",
        count: `${stats.total.toLocaleString()} pending`,
        description: "已建立資料槽，等待匯入或啟用"
      };
    }
    return {
      className: "empty",
      label: "EMPTY",
      count: "尚未匯入",
      description: "尚未建立此來源資料"
    };
  }

  function renderSourceStatus(selector = "#source-status-grid") {
    const target = $(selector);
    if (!target) return;
    target.innerHTML = config.platforms.map(platform => {
      const status = sourceState(platform);
      return `
        <article class="source-status-card ${status.className}">
          <div class="source-status-top">
            <strong>${escapeHtml(PLATFORM_LABELS[platform])}</strong>
            <span class="source-status-pill">${escapeHtml(status.label)}</span>
          </div>
          <div class="source-status-count">${escapeHtml(status.count)}</div>
          <p>${escapeHtml(status.description)}</p>
        </article>`;
    }).join("");
  }

  async function loadLeaderboardData() {
    state.leaderboard = await fetchAll("leaderboard");
    state.scoreByWork = new Map(state.leaderboard.map(item => [item.work_id, Number(item.weighted_score || 0)]));
  }

  function randomUnit() {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  }

  function weightedPick(candidates, source = null) {
    if (!candidates.length) return null;
    const scored = candidates.map(work => {
      let score = 1;
      const tags = work.tags || [];
      if (source) {
        const sourceTags = new Set((source.tags || []).map(normalize));
        const overlap = tags.filter(tag => sourceTags.has(normalize(tag))).length;
        score += overlap * 8;
        if (source.author && source.author !== "Unknown Artist" && normalize(work.author) === normalize(source.author)) score += 4;
      }
      const preference = tags.reduce((sum, tag) => sum + (state.preferenceTags.get(normalize(tag)) || 0), 0);
      const rating = state.scoreByWork.get(work.id) || 0;
      score += Math.max(0, (rating + 5) / 10) * 2;
      score += Math.max(-.75, Math.min(1.5, preference * .15));
      const daysOld = Math.max(0, (Date.now() - new Date(work.last_seen_at || work.created_at).getTime()) / 86400000);
      score += Math.max(0, 1 - daysOld / 365) * .5;
      return { work, score: Math.max(.05, score) };
    });
    const total = scored.reduce((sum, item) => sum + item.score, 0);
    let target = randomUnit() * total;
    for (const item of scored) {
      target -= item.score;
      if (target <= 0) return item.work;
    }
    return scored.at(-1).work;
  }

  function diversifyByAuthor(works, gap = 3) {
    const pending = [...works];
    const output = [];
    const recentAuthors = [];
    while (pending.length) {
      let index = pending.findIndex(work => {
        const author = normalize(work.author || "Unknown Artist");
        return !author || author === "unknown artist" || !recentAuthors.includes(author);
      });
      if (index < 0) index = 0;
      const [work] = pending.splice(index, 1);
      output.push(work);
      const author = normalize(work.author || "Unknown Artist");
      if (author && author !== "unknown artist") {
        recentAuthors.push(author);
        while (recentAuthors.length > gap) recentAuthors.shift();
      }
    }
    return output;
  }

  function rememberDraw(work) {
    if (!work) return;
    const list = state.recentByPlatform[work.platform] || [];
    state.recentByPlatform[work.platform] = [work.id, ...list.filter(id => id !== work.id)].slice(0, 20);
  }

  function candidatesFor(platform, query = "") {
    return state.works.filter(work => work.platform === platform && workMatches(work, query));
  }

  function drawPlatform(platform, source = null) {
    const query = $("#home-search").value;
    let candidates = candidatesFor(platform, query).filter(work => !state.shownByPlatform[platform].has(work.id));
    if (!candidates.length) {
      state.shownByPlatform[platform].clear();
      candidates = candidatesFor(platform, query);
    }
    if (source) candidates = candidates.filter(work => work.id !== source.id);
    const work = weightedPick(candidates, source);
    state.currentByPlatform[platform] = work;
    state.cardSideByPlatform[platform] = "front";
    rememberDraw(work);
    renderPlatformCard(platform, work);
    if (work) state.shownByPlatform[platform].add(work.id);
  }

  function drawAll() {
    config.platforms.forEach(platform => drawPlatform(platform));
    flashDrawArea();
  }

  function drawBatch(count) {
    const query = $("#home-search").value;
    const pool = state.works.filter(work => workMatches(work, query));
    const selected = [];
    const used = new Set();
    for (let index = 0; index < count && used.size < pool.length; index++) {
      const pick = weightedPick(pool.filter(work => !used.has(work.id)));
      if (!pick) break;
      used.add(pick.id);
      selected.push(pick);
    }
    state.bulkWorks = diversifyByAuthor(selected, 2);
    renderBulkDraw();
    $("#bulk-draw-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPlatformPlaceholders() {
    $("#platform-cards").innerHTML = config.platforms.map(platform => `
      <div class="card-placeholder" data-card="${platform}">
        <div>${emptyPlatformHtml(platform)}</div>
      </div>`).join("");
  }

  function emptyPlatformHtml(platform) {
    const status = sourceState(platform);
    const query = $("#home-search")?.value?.trim() || "";
    let title = PLATFORM_LABELS[platform];
    let description = "此來源尚無通過驗證的 active 內容。";
    if (query && platformStats(platform).active > 0) {
      title = "搜尋沒有結果";
      description = "換個車號、作者、標籤或清空搜尋後再抽。";
    } else if (status.className === "running") {
      description = "正在同步；完成後作品會自動進入抽卡與圖書館。";
    } else if (status.className === "pending") {
      description = "資料來源已建立，爬蟲匯入完成後會自動出現在這裡。";
    } else if (status.className === "empty") {
      description = "尚未建立此來源資料，稍後可從後台或排程同步。";
    }
    return `
      <span class="source-status-pill">${escapeHtml(status.label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
      <button class="button button-secondary" data-refresh-platform="${escapeHtml(platform)}">再試一次</button>`;
  }

  function favoriteIcon(workId) {
    return state.favorites.has(workId) ? "♥" : "♡";
  }

  function favoriteButtonHtml(workId, label = false) {
    const active = state.favorites.has(workId);
    return `<button class="${label ? "button button-secondary" : "quick-favorite"} ${active ? "active" : ""}" data-favorite="${escapeHtml(workId)}" aria-label="${active ? "取消收藏" : "加入收藏"}" title="${active ? "取消收藏" : "加入收藏"}">${label ? `${favoriteIcon(workId)} ${active ? "已收藏" : "收藏"}` : favoriteIcon(workId)}</button>`;
  }

  function workCardHtml(work) {
    if (state.cardSideByPlatform[work.platform] === "back") return workCardBackHtml(work.platform);
    const tags = (work.tags || []).slice(0, 4).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    return `
      <article class="work-card" data-card="${escapeHtml(work.platform)}">
        <span class="platform-badge">${escapeHtml(PLATFORM_LABELS[work.platform])}</span>
        <div class="cover-wrap">
          <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
            <img class="work-card-cover" src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}" loading="lazy">
          </a>
          ${favoriteButtonHtml(work.id)}
        </div>
        <div class="work-card-shade"></div>
        <div class="work-card-body">
          <h3>${escapeHtml(work.title)}</h3>
          <div class="work-card-meta">${escapeHtml(work.author)}<br>ID ${escapeHtml(work.work_id)}</div>
          <div class="tag-row">${tags}</div>
          <div class="card-actions">
            <button class="button button-secondary" data-open-work="${work.id}">查看與評分</button>
            <button class="button button-secondary" data-flip-card="${escapeHtml(work.platform)}">車號</button>
            <button class="button button-primary" data-refresh-platform="${escapeHtml(work.platform)}" aria-label="更新 ${escapeHtml(PLATFORM_LABELS[work.platform])}">↻</button>
          </div>
        </div>
      </article>`;
  }

  function workCardBackHtml(platform) {
    const ids = state.recentByPlatform[platform] || [];
    const works = ids.map(id => state.workById.get(id)).filter(Boolean);
    return `
      <article class="work-card card-back" data-card="${escapeHtml(platform)}">
        <span class="platform-badge">${escapeHtml(PLATFORM_LABELS[platform])}</span>
        <h3>最近抽過的車號</h3>
        <p class="muted">刷新卡片會自動記錄；點車號可開詳情，一鍵可複製本張卡片背面的全部車號。</p>
        <div class="card-history-list">
          ${works.map(work => `<button class="card-history-item" data-open-work="${work.id}"><strong>${escapeHtml(work.work_id)}</strong><small>${escapeHtml(work.title)}</small></button>`).join("") || '<p class="muted">這張卡片還沒有抽取紀錄。</p>'}
        </div>
        <div class="card-actions">
          <button class="button button-secondary" data-copy-card-ids="${escapeHtml(platform)}">複製全部</button>
          <button class="button button-primary" data-flip-card="${escapeHtml(platform)}">回到封面</button>
        </div>
      </article>`;
  }

  function renderPlatformCard(platform, work) {
    const existing = $(`[data-card="${platform}"]`);
    if (!existing) return;
    if (!work) {
      existing.outerHTML = `<div class="card-placeholder" data-card="${platform}"><div>${emptyPlatformHtml(platform)}</div></div>`;
      return;
    }
    existing.outerHTML = workCardHtml(work);
  }

  function flipCard(platform) {
    state.cardSideByPlatform[platform] = state.cardSideByPlatform[platform] === "back" ? "front" : "back";
    renderPlatformCard(platform, state.currentByPlatform[platform]);
  }

  async function copyCardIds(platform) {
    const ids = (state.recentByPlatform[platform] || [])
      .map(id => state.workById.get(id)?.work_id)
      .filter(Boolean);
    if (!ids.length) return toast("這張卡片還沒有可複製的車號", "warning");
    await navigator.clipboard.writeText(ids.join("\n"));
    toast(`已複製 ${ids.length} 個車號`, "success");
  }

  function filteredLibraryWorks() {
    const platform = $("#library-platform").value;
    const query = $("#library-search").value;
    const scope = $("#library-scope")?.value || "all";
    let rows = state.works.filter(work =>
      (platform === "all" || work.platform === platform) &&
      (scope !== "favorites" || state.favorites.has(work.id)) &&
      workMatches(work, query)
    );
    if (scope === "favorites" && !state.session) {
      rows = [];
    }
    rows.sort((a, b) => {
      const scoreDiff = workSearchScore(b, query) - workSearchScore(a, query);
      if (Math.abs(scoreDiff) > .0001) return scoreDiff;
      return stableRandom(a.id) - stableRandom(b.id);
    });
    return diversifyByAuthor(rows, query.trim() ? 4 : 3);
  }

  function renderLibrary(reset = false) {
    if (reset) state.libraryVisible = 60;
    const works = filteredLibraryWorks();
    const scope = $("#library-scope")?.value || "all";
    $("#library-summary").textContent = scope === "favorites" && !state.session
      ? "請先登入後查看你的收藏"
      : `${works.length.toLocaleString()} 筆符合條件；預設順序已打亂，搜尋時以相關性排序並盡量錯開同作者`;
    $("#library-grid").innerHTML = works.slice(0, state.libraryVisible).map(work => `
      <article class="library-item" data-open-work="${work.id}" tabindex="0">
        <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
          <img src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}" loading="lazy">
        </a>
        ${favoriteButtonHtml(work.id)}
        <div><h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(PLATFORM_LABELS[work.platform])} · ${escapeHtml(work.author)}</p></div>
      </article>`).join("") || '<div class="empty-state">沒有符合條件的作品</div>';
    $("#library-more").classList.toggle("hidden", works.length <= state.libraryVisible);
  }

  function renderBulkDraw() {
    const panel = $("#bulk-draw-panel");
    const list = $("#bulk-draw-list");
    if (!panel || !list) return;
    panel.classList.toggle("hidden", !state.bulkWorks.length);
    list.innerHTML = state.bulkWorks.map(work => `
      <article class="bulk-draw-item">
        <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
          <img src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}" loading="lazy">
        </a>
        ${favoriteButtonHtml(work.id)}
        <div><h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(PLATFORM_LABELS[work.platform])} · ID ${escapeHtml(work.work_id)}</p></div>
      </article>`).join("");
  }

  function renderLeaderboard() {
    const platform = $("#ranking-platform").value;
    const order = $("#ranking-order").value;
    let rows = state.leaderboard.filter(item => platform === "all" || item.platform === platform);
    rows.sort((a, b) => (order === "top" ? 1 : -1) * (Number(b.weighted_score) - Number(a.weighted_score)));
    rows = rows.slice(0, 30);
    $("#ranking-list").innerHTML = rows.map((item, index) => `
      <article class="ranking-row" data-open-work="${item.work_id}">
        <div class="ranking-number">#${index + 1}</div>
        <img src="${escapeHtml(imageUrl(item.cover_url))}" alt="" loading="lazy">
        <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(PLATFORM_LABELS[item.platform])} · ${escapeHtml(item.author)} · ${item.review_count} 則評分</p></div>
        <div class="score"><strong>${Number(item.weighted_score).toFixed(2)}</strong><small>原始 ${Number(item.raw_average).toFixed(2)}</small></div>
      </article>`).join("") || '<div class="empty-state">目前還沒有足夠的評分資料</div>';
  }

  async function loadAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    state.session = session;
    state.profile = null;
    if (session) {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      state.profile = data;
      await loadFavorites();
      await loadPreferences();
    }
    updateAuthUi();
    renderBulkDraw();
    if ($("#view-library")?.classList.contains("active")) renderLibrary();
    if (state.works.length) drawAll();
  }

  function login() {
    openModal("auth-modal");
    $("#password-login-email")?.focus();
  }

  function updateGoogleProviderUi() {
    const button = $("#google-login-button");
    const help = $("#auth-help");
    if (!button || !help) return;
    const checking = state.googleProviderEnabled === null;
    button.disabled = checking;
    button.setAttribute("aria-busy", String(checking));
    if (checking) {
      help.textContent = "正在檢查 Google 登入狀態…";
    } else if (state.googleProviderEnabled) {
      help.textContent = "Google 登入已可使用；第一次登入後需等待管理員審核，才可留言、評分與收藏。";
    } else {
      help.textContent = "Google OAuth 尚未在 Supabase 啟用；目前請先使用信箱＋站內密碼或信箱魔法連結。";
    }
  }

  async function detectGoogleProvider() {
    state.googleProviderEnabled = null;
    updateGoogleProviderUi();
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: config.supabaseAnonKey }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const settings = await response.json();
      state.googleProviderEnabled = Boolean(settings?.external?.google);
    } catch (error) {
      console.warn("Unable to detect Google auth provider status", error);
      state.googleProviderEnabled = config.googleProviderEnabled === true;
    }
    updateGoogleProviderUi();
    return state.googleProviderEnabled;
  }

  async function loginWithGoogle() {
    if (state.googleProviderEnabled === null) await detectGoogleProvider();
    if (!state.googleProviderEnabled) {
      $("#auth-help").textContent = "Google provider 尚未在 Supabase 啟用，所以我先不跳轉，避免再次出現 400 JSON 錯誤。請先用 Gmail 信箱＋站內密碼登入。";
      return toast("Google OAuth 尚未啟用；請先用 Gmail 信箱帳密登入", "warning");
    }
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      const message = error.message || "";
      if (message.includes("Unsupported provider") || message.includes("provider is not enabled")) {
        $("#auth-help").textContent = "Google provider 尚未在 Supabase 啟用。請先用 Gmail 信箱帳密登入；之後可到 Supabase Dashboard → Authentication → Providers → Google 啟用 OAuth。";
      }
      toast(`Google OAuth 尚未啟用或設定錯誤：${message}`, "error");
    }
  }

  async function loginWithEmail() {
    const email = $("#email-login-input").value.trim();
    if (!email || !email.includes("@")) return toast("請輸入有效信箱", "warning");
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) return toast(`信箱登入失敗：${error.message}`, "error");
    $("#auth-help").textContent = "登入連結已寄出，請到信箱點擊連結後回到本站。";
    toast("登入連結已寄出", "success");
  }

  async function loginWithPassword() {
    const email = $("#password-login-email").value.trim();
    const password = $("#password-login-password").value;
    if (!email || !email.includes("@") || !password) return toast("請輸入信箱與密碼", "warning");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(`帳密登入失敗：${error.message}`, "error");
    closeModal("auth-modal");
    toast("已登入", "success");
    await loadAuth();
  }

  async function logout() {
    await supabase.auth.signOut();
    state.session = null; state.profile = null; state.favorites.clear(); state.preferenceTags.clear();
    updateAuthUi();
    toast("已登出");
  }

  function updateAuthUi() {
    const loggedIn = Boolean(state.session);
    $("#login-button").classList.toggle("hidden", loggedIn);
    $("#profile-menu").classList.toggle("hidden", !loggedIn);
    if (loggedIn) {
      $("#profile-name").textContent = state.profile?.display_name || state.session.user.user_metadata?.full_name || "新會員";
      const labels = { pending: "等待管理員審核", active: isAdmin() ? "管理員" : "已通過審核", suspended: "帳號已停權" };
      $("#profile-status").textContent = labels[state.profile?.status] || "建立資料中";
      $("#profile-avatar").src = state.profile?.avatar_url || state.session.user.user_metadata?.avatar_url || imageUrl("");
    }
    $$(".admin-only").forEach(node => node.classList.toggle("hidden", !isAdmin()));
    if (!isAdmin() && location.hash === "#admin") location.hash = "#home";
  }

  async function requireMember() {
    if (!state.session) { toast("請先登入", "warning"); return false; }
    if (!isApproved()) { toast("帳號仍在等待管理員審核", "warning"); return false; }
    return true;
  }

  async function loadFavorites() {
    if (!state.session) return;
    const { data } = await supabase.from("favorites").select("work_id").eq("user_id", state.session.user.id);
    state.favorites = new Set((data || []).map(item => item.work_id));
  }

  async function loadPreferences() {
    if (!state.session || !isApproved()) return;
    const [{ data: history }, { data: reviews }] = await Promise.all([
      supabase.from("viewing_history").select("work_id,interaction").eq("user_id", state.session.user.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("reviews").select("work_id,rating").eq("user_id", state.session.user.id).is("parent_id", null)
    ]);
    const weights = new Map();
    const add = (workId, weight) => {
      const work = state.workById.get(workId);
      for (const tag of work?.tags || []) {
        const key = normalize(tag);
        weights.set(key, (weights.get(key) || 0) + weight);
      }
    };
    state.favorites.forEach(workId => add(workId, 3));
    (history || []).forEach(item => add(item.work_id, item.interaction === "hide" ? -2 : .25));
    (reviews || []).forEach(item => add(item.work_id, Number(item.rating || 0) / 2));
    state.preferenceTags = weights;
  }

  async function toggleFavorite(workId) {
    if (!await requireMember()) return;
    if (state.favorites.has(workId)) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", state.session.user.id).eq("work_id", workId);
      if (error) return toast(error.message, "error");
      state.favorites.delete(workId);
      toast("已取消收藏");
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: state.session.user.id, work_id: workId });
      if (error) return toast(error.message, "error");
      state.favorites.add(workId);
      toast("已加入收藏", "success");
    }
    updateFavoriteButtons(workId);
    await loadPreferences();
    if ($("#view-library").classList.contains("active")) renderLibrary();
    renderBulkDraw();
  }

  function updateFavoriteButtons(workId) {
    $$(`[data-favorite="${workId}"]`).forEach(button => {
      const active = state.favorites.has(workId);
      button.classList.toggle("active", active);
      button.setAttribute("aria-label", active ? "取消收藏" : "加入收藏");
      button.setAttribute("title", active ? "取消收藏" : "加入收藏");
      button.textContent = button.classList.contains("quick-favorite")
        ? favoriteIcon(workId)
        : `${favoriteIcon(workId)} ${active ? "已收藏" : "收藏"}`;
    });
  }

  async function recordView(workId, interaction = "open") {
    if (!state.session || !isApproved()) return;
    await supabase.from("viewing_history").insert({ user_id: state.session.user.id, work_id: workId, interaction });
  }

  async function openWork(workId) {
    const work = state.workById.get(workId);
    if (!work) return;
    state.currentWork = work;
    const tags = (work.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    $("#detail-content").innerHTML = `
      <div class="detail-hero">
        <a class="cover-link" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer" data-source-open="${work.id}" aria-label="開啟 ${escapeHtml(work.title)} 來源">
          <img class="detail-cover" src="${escapeHtml(imageUrl(work.cover_url))}" alt="${escapeHtml(work.title)}">
        </a>
        <div class="detail-info">
          <p class="eyebrow">${escapeHtml(PLATFORM_LABELS[work.platform])} · ID ${escapeHtml(work.work_id)}</p>
          <h2 id="detail-title">${escapeHtml(work.title)}</h2>
          <p>${escapeHtml(work.author)}${work.publisher ? ` · ${escapeHtml(work.publisher)}` : ""}</p>
          <div class="tag-row">${tags || '<span class="muted">尚無標籤</span>'}</div>
          <div class="detail-actions">
            <a class="button button-primary" href="${escapeHtml(work.source_url)}" target="_blank" rel="noopener noreferrer">前往來源 ↗</a>
            ${favoriteButtonHtml(work.id, true)}
            <button class="button button-secondary" data-similar="${work.id}">推薦相似</button>
          </div>
        </div>
      </div>
      <div class="review-area">
        <h3>評分與評論</h3>
        <div id="review-form-container"></div>
        <div id="reviews-list"><p class="muted">載入評論中…</p></div>
      </div>`;
    openModal("detail-modal");
    recordView(work.id);
    await renderReviews(work.id);
  }

  function renderReviewForm(existing = null) {
    const container = $("#review-form-container");
    if (!container) return;
    if (!state.session) {
      container.innerHTML = '<div class="review-form"><p class="muted">登入並通過審核後即可評分。</p><button class="button button-primary" data-login>登入</button></div>';
      return;
    }
    if (!isApproved()) {
      container.innerHTML = '<div class="review-form"><p class="muted">帳號正在等待管理員審核；公開內容仍可正常瀏覽。</p></div>';
      return;
    }
    state.currentRating = Number(existing?.rating ?? 5);
    container.innerHTML = `
      <form id="review-form" class="review-form">
        <div><strong>${existing ? "編輯你的評分" : "留下你的評分"}</strong><p class="muted">每件作品限一篇主評論，最多 500 字。</p></div>
        <div class="rating-picker">${Array.from({ length: 11 }, (_, i) => i - 5).map(value => `<button type="button" data-rating="${value}" class="${value === state.currentRating ? "selected" : ""}">${value > 0 ? "+" : ""}${value}</button>`).join("")}</div>
        <textarea id="review-body" maxlength="500" required placeholder="分享你的心得…">${escapeHtml(existing?.body || "")}</textarea>
        <button class="button button-primary" type="submit">${existing ? "儲存修改" : "送出評論"}</button>
      </form>`;
  }

  async function loadProfilesForReviews(reviews) {
    const ids = [...new Set(reviews.map(review => review.user_id))].filter(id => !state.profiles.has(id));
    if (!ids.length) return;
    const { data } = await supabase.from("profiles").select("id,display_name,avatar_url,role,status").in("id", ids);
    (data || []).forEach(profile => state.profiles.set(profile.id, profile));
  }

  async function renderReviews(workId) {
    const { data: reviews, error } = await supabase.from("reviews").select("*").eq("work_id", workId).order("created_at", { ascending: true });
    if (error) { $("#reviews-list").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; return; }
    state.currentReviews = new Map((reviews || []).map(review => [review.id, review]));
    const reviewIds = [...state.currentReviews.keys()];
    const { data: votes } = reviewIds.length
      ? await supabase.from("review_votes").select("review_id,user_id,vote").in("review_id", reviewIds)
      : { data: [] };
    await loadProfilesForReviews(reviews || []);
    const voteStats = new Map();
    for (const vote of votes || []) {
      const stats = voteStats.get(vote.review_id) || { up: 0, down: 0, mine: 0 };
      if (vote.vote === 1) stats.up++; else stats.down++;
      if (vote.user_id === state.session?.user?.id) stats.mine = vote.vote;
      voteStats.set(vote.review_id, stats);
    }
    const roots = (reviews || []).filter(review => !review.parent_id && review.status === "visible");
    const replies = new Map();
    (reviews || []).filter(review => review.parent_id && review.status === "visible").forEach(review => {
      if (!replies.has(review.parent_id)) replies.set(review.parent_id, []);
      replies.get(review.parent_id).push(review);
    });
    const mine = roots.find(review => review.user_id === state.session?.user?.id);
    renderReviewForm(mine);
    const reviewHtml = review => {
      const profile = state.profiles.get(review.user_id) || { display_name: "會員" };
      const stats = voteStats.get(review.id) || { up: 0, down: 0, mine: 0 };
      const canDelete = isAdmin() || review.user_id === state.session?.user?.id;
      const canEdit = review.user_id === state.session?.user?.id;
      return `<article class="review" data-review="${review.id}">
        <div class="review-header"><strong>${escapeHtml(profile.display_name)}${profile.role === "admin" ? " · ADMIN" : ""}</strong>${review.rating === null ? "" : `<span>${review.rating > 0 ? "+" : ""}${review.rating}</span>`}</div>
        <p>${escapeHtml(review.body)}</p>
        <div class="review-footer">
          <button data-vote="1" data-review-id="${review.id}">${stats.mine === 1 ? "●" : "▲"} ${stats.up}</button>
          <button data-vote="-1" data-review-id="${review.id}">${stats.mine === -1 ? "●" : "▼"} ${stats.down}</button>
          ${!review.parent_id ? `<button data-reply="${review.id}">回覆</button>` : ""}
          ${canEdit ? `<button data-edit-review="${review.id}">編輯</button>` : ""}
          <button data-report="${review.id}">檢舉</button>
          ${canDelete ? `<button data-delete-review="${review.id}">刪除</button>` : ""}
        </div>
      </article>`;
    };
    $("#reviews-list").innerHTML = roots.map(root => `${reviewHtml(root)}<div class="replies">${(replies.get(root.id) || []).map(reviewHtml).join("")}</div><div class="reply-form" id="reply-${root.id}"></div>`).join("") || '<p class="muted">目前還沒有評論，成為第一位評分者吧。</p>';
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!await requireMember() || !state.currentWork) return;
    const body = $("#review-body").value.trim();
    if (!body || body.length > 500) return toast("評論需為 1～500 字", "warning");
    const { data: existing } = await supabase.from("reviews").select("id").eq("work_id", state.currentWork.id).eq("user_id", state.session.user.id).is("parent_id", null).maybeSingle();
    const request = existing
      ? supabase.from("reviews").update({ body, rating: state.currentRating }).eq("id", existing.id)
      : supabase.from("reviews").insert({ work_id: state.currentWork.id, user_id: state.session.user.id, body, rating: state.currentRating });
    const { error } = await request;
    if (error) return toast(error.message, "error");
    toast(existing ? "評論已更新" : "評論已送出", "success");
    await renderReviews(state.currentWork.id);
    await loadLeaderboardData();
    await loadPreferences();
  }

  async function submitReply(parentId) {
    if (!await requireMember() || !state.currentWork) return;
    const body = $(`#reply-body-${parentId}`)?.value.trim();
    if (!body || body.length > 300) return toast("回覆需為 1～300 字", "warning");
    const { error } = await supabase.from("reviews").insert({ work_id: state.currentWork.id, user_id: state.session.user.id, parent_id: parentId, body, rating: null });
    if (error) return toast(error.message, "error");
    await renderReviews(state.currentWork.id);
  }

  async function voteReview(reviewId, vote) {
    if (!await requireMember()) return;
    const { error } = await supabase.from("review_votes").upsert({ review_id: reviewId, user_id: state.session.user.id, vote }, { onConflict: "review_id,user_id" });
    if (error) return toast(error.message, "error");
    await renderReviews(state.currentWork.id);
  }

  async function deleteReview(reviewId) {
    if (!state.session || !confirm("確定刪除這則內容？")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
    if (error) return toast(error.message, "error");
    await renderReviews(state.currentWork.id);
  }

  async function editReview(reviewId) {
    if (!await requireMember()) return;
    const review = state.currentReviews.get(reviewId);
    if (!review || review.user_id !== state.session.user.id) return;
    if (!review.parent_id) {
      renderReviewForm(review);
      $("#review-body")?.focus();
      return;
    }
    const body = prompt("編輯回覆（1～300 字）：", review.body)?.trim();
    if (!body || body.length > 300) return;
    const { error } = await supabase.from("reviews").update({ body }).eq("id", reviewId);
    if (error) return toast(error.message, "error");
    await renderReviews(state.currentWork.id);
    toast("回覆已更新", "success");
  }

  async function reportReview(reviewId) {
    if (!await requireMember()) return;
    const reason = prompt("請說明檢舉原因（3～500 字）：")?.trim();
    if (!reason) return;
    const { error } = await supabase.from("content_reports").insert({ reporter_id: state.session.user.id, review_id: reviewId, reason });
    toast(error ? error.message : "檢舉已送交管理員", error ? "error" : "success");
  }

  function recommendSimilar(workId) {
    const source = state.workById.get(workId);
    if (!source) return;
    const candidates = candidatesFor(source.platform).filter(work => work.id !== source.id);
    const pick = weightedPick(candidates, source);
    if (pick) openWork(pick.id); else toast("目前沒有可推薦的相似作品", "warning");
  }

  async function loadGames() {
    const { data, error } = await supabase.from("games").select("*").order("created_at", { ascending: false });
    if (error) return toast(error.message, "error");
    $("#games-grid").innerHTML = (data || []).map(game => `
      <article class="game-card" data-open-game="${game.id}">
        <img src="${escapeHtml(imageUrl(game.cover_url))}" alt="${escapeHtml(game.name)}" loading="lazy">
        <div><h3>${escapeHtml(game.name)}</h3><span class="game-rating">${game.rating > 0 ? "+" : ""}${game.rating}</span><div class="tag-row">${(game.tags || []).slice(0,3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></div>
      </article>`).join("") || '<div class="empty-state">站長尚未發表遊戲評鑑</div>';
  }

  async function openGame(gameId) {
    const { data: game, error } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (error) return toast(error.message, "error");
    state.currentGameId = gameId;
    const { data: comments } = await supabase.from("game_comments").select("*").eq("game_id", gameId).order("created_at");
    await loadProfilesForReviews(comments || []);
    $("#editor-content").innerHTML = `
      <h2 id="editor-title">${escapeHtml(game.name)}</h2>
      <img class="detail-cover" src="${escapeHtml(imageUrl(game.cover_url))}" alt="">
      <p class="game-rating">站長評分 ${game.rating > 0 ? "+" : ""}${game.rating}</p>
      <p>${escapeHtml(game.review_body)}</p>
      <div class="tag-row">${(game.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      ${isAdmin() ? `<button class="button button-secondary" data-edit-game="${game.id}">編輯評鑑</button><button class="button button-danger" data-delete-game="${game.id}">刪除評鑑</button>` : ""}
      <hr><h3>會員留言</h3>
      <div>${(comments || []).map(comment => `<div class="review"><strong>${escapeHtml(state.profiles.get(comment.user_id)?.display_name || "會員")}</strong><p>${escapeHtml(comment.body)}</p>${isAdmin() || comment.user_id === state.session?.user?.id ? `<button data-delete-game-comment="${comment.id}" data-game-id="${game.id}">刪除</button>` : ""}</div>`).join("") || '<p class="muted">尚無留言</p>'}</div>
      ${isApproved() ? `<form id="game-comment-form" class="review-form" data-game-id="${game.id}"><textarea id="game-comment-body" maxlength="500" required placeholder="留言…"></textarea><button class="button button-primary">送出留言</button></form>` : ""}`;
    openModal("editor-modal");
  }

  function gameEditor(game = null) {
    if (!isAdmin()) return;
    $("#editor-content").innerHTML = `<h2 id="editor-title">${game ? "編輯" : "新增"}遊戲評鑑</h2>
      <form id="game-editor-form" class="editor-form" data-game-id="${game?.id || ""}">
        <label>名稱<input id="game-name" type="text" maxlength="300" required value="${escapeHtml(game?.name || "")}"></label>
        <label>封面網址<input id="game-cover" type="url" value="${escapeHtml(game?.cover_url || "")}"></label>
        <label>評分（-5～+5）<input id="game-rating" type="number" min="-5" max="5" required value="${game?.rating ?? 0}"></label>
        <label>標籤（逗號分隔）<input id="game-tags" type="text" value="${escapeHtml((game?.tags || []).join(", "))}"></label>
        <label>心得<textarea id="game-review" maxlength="5000" required>${escapeHtml(game?.review_body || "")}</textarea></label>
        <button class="button button-primary">儲存評鑑</button>
      </form>`;
    openModal("editor-modal");
  }

  async function saveGame(event) {
    event.preventDefault();
    if (!isAdmin()) return;
    const id = event.currentTarget.dataset.gameId;
    const payload = {
      name: $("#game-name").value.trim(), cover_url: $("#game-cover").value.trim(),
      rating: Number($("#game-rating").value), review_body: $("#game-review").value.trim(),
      tags: $("#game-tags").value.split(/[,，]/).map(value => value.trim()).filter(Boolean),
      created_by: state.session.user.id
    };
    const request = id ? supabase.from("games").update(payload).eq("id", id) : supabase.from("games").insert(payload);
    const { error } = await request;
    if (error) return toast(error.message, "error");
    closeModal("editor-modal"); await loadGames(); toast("遊戲評鑑已儲存", "success");
  }

  async function saveGameComment(event) {
    event.preventDefault(); if (!await requireMember()) return;
    const gameId = event.currentTarget.dataset.gameId;
    const body = $("#game-comment-body").value.trim();
    const { error } = await supabase.from("game_comments").insert({ game_id: gameId, user_id: state.session.user.id, body });
    if (error) return toast(error.message, "error");
    await openGame(gameId);
  }

  async function deleteGame(gameId) {
    if (!isAdmin() || !confirm("確定永久刪除這篇遊戲評鑑與全部留言？")) return;
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    if (error) return toast(error.message, "error");
    closeModal("editor-modal"); await loadGames(); toast("遊戲評鑑已刪除", "success");
  }

  async function deleteGameComment(commentId, gameId) {
    if (!state.session || !confirm("確定刪除這則留言？")) return;
    const { error } = await supabase.from("game_comments").delete().eq("id", commentId);
    if (error) return toast(error.message, "error");
    await openGame(gameId);
  }

  async function sendFeedback(kind = "feedback") {
    if (!await requireMember()) return;
    const isRecommendation = kind === "recommendation";
    const textarea = isRecommendation ? $("#recommendation-body") : $("#feedback-body");
    const counter = isRecommendation ? $("#recommendation-count") : $("#feedback-count");
    const body = textarea.value.trim();
    if (!body || body.length > 2000) return toast("意見內容需為 1～2000 字", "warning");
    try {
      await fetchWorkerJson("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.session.access_token}` },
        body: JSON.stringify({ body: `${isRecommendation ? "[作品推薦]" : "[意見反饋]"}\n${body}` })
      });
    } catch (error) {
      return toast(workerErrorMessage(error), "error");
    }
    textarea.value = "";
    counter.textContent = "0 / 2000";
    toast(isRecommendation ? "推薦已送出，等待站長審核" : "意見已寄出", "success");
  }

  async function loadAdmin(tab = state.adminTab) {
    if (!isAdmin()) return;
    state.adminTab = tab;
    $$("[data-admin-tab]").forEach(button => button.classList.toggle("active", button.dataset.adminTab === tab));
    const content = $("#admin-content");
    content.innerHTML = '<div class="empty-state">載入中…</div>';
    if (tab === "users") {
      let result;
      let isWorkerFallback = false;
      try {
        result = await fetchWorkerJson("/api/admin/users", { headers: { Authorization: `Bearer ${state.session.access_token}` } });
      } catch (error) {
        isWorkerFallback = true;
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id,display_name,role,status,approved_at,created_at,updated_at")
          .order("created_at", { ascending: false });
        if (profileError) {
          content.innerHTML = `<div class="empty-state">${escapeHtml(workerErrorMessage(error))}<br>${escapeHtml(profileError.message)}</div>`;
          return;
        }
        result = data || [];
      }
      const users = result.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const fallbackNotice = isWorkerFallback ? '<div class="empty-state warning">Render worker 目前不可用，暫時只顯示 Supabase profiles；信箱與最近登入時間需等 worker 恢復。</div>' : "";
      content.innerHTML = fallbackNotice + (users.map(profile => `<div class="admin-row"><div><h4>${escapeHtml(profile.display_name)}</h4><p>${escapeHtml(profile.email || "信箱需 worker 讀取")} · ${escapeHtml(profile.role)} · ${escapeHtml(profile.status)}</p><small>最近登入：${profile.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleString("zh-TW") : (isWorkerFallback ? "需 worker 讀取" : "尚未登入")}</small></div><div class="admin-actions">${profile.role === "admin" ? "" : `${profile.status === "pending" ? `<button class="button button-primary" data-approve-user="${profile.id}">通過</button>` : ""}<button class="button button-secondary" data-suspend-user="${profile.id}" data-suspend="${profile.status === "suspended" ? "false" : "true"}">${profile.status === "suspended" ? "解除停權" : "停權"}</button>`}</div></div>`).join("") || '<div class="empty-state">目前沒有會員</div>');
    } else if (tab === "works") {
      state.adminWorks = await fetchAll("works", query => query.order("updated_at", { ascending: false }));
      content.innerHTML = `<div class="job-controls"><button class="button button-primary" data-new-work>＋ 手動新增</button><button class="button button-danger" data-purge-inactive>永久刪除所有失效作品</button><input id="admin-work-search" type="search" placeholder="搜尋車號、標題、作者或標籤…"></div><p id="admin-work-summary" class="muted"></p><div id="admin-work-list"></div>`;
      renderAdminWorks();
    } else if (tab === "reports") {
      const { data } = await supabase.from("content_reports").select("*").order("created_at", { ascending: false });
      content.innerHTML = (data || []).map(report => `<div class="admin-row"><div><h4>${escapeHtml(report.reason)}</h4><p>${escapeHtml(report.review_id || "內容已移除")} · ${escapeHtml(report.status)}</p></div><div class="admin-actions">${report.review_id ? `<button class="button button-secondary" data-hide-review="${report.review_id}">隱藏內容</button><button class="button button-danger" data-admin-delete-review="${report.review_id}">刪除內容</button>` : ""}<button class="button button-primary" data-resolve-report="${report.id}">標記完成</button></div></div>`).join("") || '<div class="empty-state">沒有待處理檢舉</div>';
    } else if (tab === "jobs") {
      state.sourceStats = await loadSourceStatus();
      content.innerHTML = `<div class="admin-source-status"><div id="admin-source-status-grid" class="source-status-grid"></div></div><div class="job-controls">${["all","discord","hanime","18comic","pixiv"].map(source => `<button class="button ${source === "all" ? "button-primary" : "button-secondary"}" data-run-job="${source}">執行 ${source}</button>`).join("")}<button class="button button-secondary" data-refresh-jobs>更新狀態</button><a class="button button-secondary" href="https://github.com/linyize1111/acg-portal/actions/workflows/scheduled-sync.yml" target="_blank" rel="noopener noreferrer">GitHub 手動同步 ↗</a></div><div id="job-list"></div>`;
      renderSourceStatus("#admin-source-status-grid");
      await loadJobs();
    }
  }

  function renderAdminWorks() {
    const list = $("#admin-work-list");
    if (!list) return;
    const query = $("#admin-work-search")?.value || "";
    const rows = state.adminWorks.filter(work => workMatches(work, query));
    $("#admin-work-summary").textContent = `${rows.length.toLocaleString()} 筆；畫面顯示前 200 筆`;
    list.innerHTML = rows.slice(0, 200).map(work => `<div class="admin-row"><div><h4>${escapeHtml(work.title)}</h4><p>${escapeHtml(work.platform)} · ${escapeHtml(work.work_id)} · ${escapeHtml(work.status)}</p></div><div class="admin-actions"><button class="button button-secondary" data-edit-work="${work.id}">編輯</button><button class="button button-danger" data-toggle-work="${work.id}" data-status="${work.status === "active" ? "inactive" : "active"}">${work.status === "active" ? "標記失效" : "恢復"}</button></div></div>`).join("") || '<div class="empty-state">沒有符合條件的作品</div>';
  }

  async function loadJobs() {
    const list = $("#job-list"); if (!list) return;
    let rows;
    let usedDatabaseFallback = false;
    try {
      rows = await fetchWorkerJson("/api/admin/jobs", { headers: { Authorization: `Bearer ${state.session.access_token}` } });
    } catch (error) {
      const { data, error: databaseError } = await supabase
        .from("scrape_runs")
        .select("job_name,status,started_at,finished_at,discovered_count,accepted_count,rejected_count,error_count,error_message,created_at")
        .order("started_at", { ascending: false })
        .limit(30);
      if (databaseError) {
        list.innerHTML = `<div class="empty-state">${escapeHtml(workerErrorMessage(error))}<br>${escapeHtml(databaseError.message)}</div>`;
        return;
      }
      rows = data || [];
      usedDatabaseFallback = true;
    }
    const fallbackNotice = usedDatabaseFallback
      ? '<div class="empty-state warning">Render worker 目前不可用；以下執行紀錄直接讀自 Supabase，仍可使用上方 GitHub 手動同步。</div>'
      : "";
    list.innerHTML = fallbackNotice + rows.map(run => {
      const started = run.started_at || run.created_at;
      const finished = run.finished_at ? `完成：${new Date(run.finished_at).toLocaleString("zh-TW")}` : "尚未完成";
      return `<div class="admin-row"><div><h4>${escapeHtml(run.job_name)} <span class="job-badge ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></h4><p>開始：${started ? new Date(started).toLocaleString("zh-TW") : "未知"} · ${finished}</p><p>發現 ${run.discovered_count || 0} · 接受 ${run.accepted_count || 0} · 拒絕 ${run.rejected_count || 0} · 錯誤 ${run.error_count || 0}</p>${run.error_message ? `<p class="error-text">${escapeHtml(run.error_message)}</p>` : ""}</div></div>`;
    }).join("") || '<div class="empty-state">尚無執行紀錄</div>';
  }

  async function runJob(source) {
    try {
      await fetchWorkerJson("/api/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}` }, body: JSON.stringify({ source }) });
      toast(`已喚醒 ${source} 工作`, "success");
      setTimeout(() => loadAdmin("jobs"), 1500);
    } catch (error) {
      toast(workerErrorMessage(error), "error");
    }
  }

  async function editWork(workId = null) {
    const work = workId ? (await supabase.from("works").select("*").eq("id", workId).single()).data : null;
    $("#editor-content").innerHTML = `<h2 id="editor-title">${work ? "編輯" : "新增"}作品</h2><form id="work-editor-form" class="editor-form" data-work-id="${work?.id || ""}">
      <label>平台<select id="work-platform">${config.platforms.map(platform => `<option value="${platform}" ${work?.platform === platform ? "selected" : ""}>${PLATFORM_LABELS[platform]}</option>`).join("")}</select></label>
      <label>外部 ID<input id="work-external-id" required value="${escapeHtml(work?.work_id || "")}"></label>
      <label>標題<input id="work-title" required value="${escapeHtml(work?.title || "")}"></label>
      <label>作者<input id="work-author" value="${escapeHtml(work?.author || "Unknown Artist")}"></label>
      <label>封面網址<input id="work-cover" type="url" value="${escapeHtml(work?.cover_url || "")}"></label>
      <label>來源網址<input id="work-source" type="url" required value="${escapeHtml(work?.source_url || "")}"></label>
      <label>標籤<input id="work-tags" value="${escapeHtml((work?.tags || []).join(", "))}"></label>
      <label>狀態<select id="work-status"><option value="active">active</option><option value="inactive" ${work?.status === "inactive" ? "selected" : ""}>inactive</option><option value="rejected" ${work?.status === "rejected" ? "selected" : ""}>rejected</option></select></label>
      <button class="button button-primary">儲存作品</button></form>`;
    openModal("editor-modal");
  }

  async function saveWork(event) {
    event.preventDefault(); if (!isAdmin()) return;
    const id = event.currentTarget.dataset.workId;
    const payload = { platform: $("#work-platform").value, work_id: $("#work-external-id").value.trim(), title: $("#work-title").value.trim(), author: $("#work-author").value.trim() || "Unknown Artist", cover_url: $("#work-cover").value.trim(), source_url: $("#work-source").value.trim(), tags: $("#work-tags").value.split(/[,，]/).map(value => value.trim()).filter(Boolean), status: $("#work-status").value, source_kind: "manual" };
    const request = id ? supabase.from("works").update(payload).eq("id", id) : supabase.from("works").insert(payload);
    const { error } = await request; if (error) return toast(error.message, "error");
    closeModal("editor-modal"); await loadWorks(); await loadAdmin("works"); toast("作品已儲存", "success");
  }

  function openModal(id) { $(`#${id}`).classList.add("open"); document.body.style.overflow = "hidden"; }
  function closeModal(id) { $(`#${id}`).classList.remove("open"); document.body.style.overflow = ""; }

  function toggleMobileMenu(force = null) {
    const nav = $("#main-nav");
    const button = $("#mobile-menu-button");
    const open = force === null ? !nav.classList.contains("open") : Boolean(force);
    nav.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  function switchView(view) {
    if (view === "admin" && !isAdmin()) view = "home";
    $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
    $$("[data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === view));
    $("#main-nav").classList.remove("open");
    if (view === "library") renderLibrary(true);
    if (view === "leaderboard") renderLeaderboard();
    if (view === "games") loadGames();
    if (view === "admin") loadAdmin();
  }

  function bindEvents() {
    document.addEventListener("error", event => {
      if (event.target instanceof HTMLImageElement && !event.target.dataset.fallbackApplied) {
        event.target.dataset.fallbackApplied = "1";
        event.target.src = imageUrl("");
      }
    }, true);
    $("#age-enter").addEventListener("click", () => { localStorage.setItem("acg_age_confirmed", "1"); closeModal("age-gate"); });
    $("#age-leave").addEventListener("click", () => { location.href = "https://www.google.com/"; });
    if (localStorage.getItem("acg_age_confirmed") === "1") closeModal("age-gate");
    $("#login-button").addEventListener("click", login); $("#logout-button").addEventListener("click", logout);
    $("#google-login-button").addEventListener("click", loginWithGoogle);
    $("#password-login-button").addEventListener("click", loginWithPassword);
    $("#password-login-password").addEventListener("keydown", event => { if (event.key === "Enter") loginWithPassword(); });
    $("#email-login-button").addEventListener("click", loginWithEmail);
    $("#email-login-input").addEventListener("keydown", event => { if (event.key === "Enter") loginWithEmail(); });
    $("#mobile-menu-button").addEventListener("click", event => { event.stopPropagation(); toggleMobileMenu(); });
    $("#draw-all-button").addEventListener("click", drawAll);
    $("#draw-five-button").addEventListener("click", () => drawBatch(5));
    $("#draw-ten-button").addEventListener("click", () => drawBatch(10));
    $("#clear-bulk-button").addEventListener("click", () => { state.bulkWorks = []; renderBulkDraw(); });
    $("#home-search").addEventListener("input", debounce(drawAll));
    $("#library-platform").addEventListener("change", () => renderLibrary(true));
    $("#library-scope").addEventListener("change", () => renderLibrary(true));
    $("#library-search").addEventListener("input", debounce(() => renderLibrary(true)));
    $("#library-more").addEventListener("click", () => { state.libraryVisible += 60; renderLibrary(); });
    $("#ranking-platform").addEventListener("change", renderLeaderboard); $("#ranking-order").addEventListener("change", renderLeaderboard);
    $("#new-game-button").addEventListener("click", () => gameEditor());
    $("#feedback-body").addEventListener("input", event => $("#feedback-count").textContent = `${event.target.value.length} / 2000`);
    $("#recommendation-body").addEventListener("input", event => $("#recommendation-count").textContent = `${event.target.value.length} / 2000`);
    document.addEventListener("input", event => { if (event.target.id === "admin-work-search") renderAdminWorks(); });
    $("#feedback-send").addEventListener("click", () => sendFeedback("feedback"));
    $("#recommendation-send").addEventListener("click", () => sendFeedback("recommendation"));
    window.addEventListener("hashchange", () => switchView(location.hash.slice(1) || "home"));
    document.addEventListener("keydown", event => { if (event.key === "Escape") $$(".modal.open:not(#age-gate)").forEach(modal => closeModal(modal.id)); });
    document.addEventListener("submit", async event => {
      if (event.target.id === "review-form") return submitReview(event);
      if (event.target.matches("[data-reply-form]")) { event.preventDefault(); return submitReply(event.target.dataset.replyForm); }
      if (event.target.id === "game-editor-form") return saveGame(event);
      if (event.target.id === "game-comment-form") return saveGameComment(event);
      if (event.target.id === "work-editor-form") return saveWork(event);
    });
    document.addEventListener("click", async event => {
      if (event.target.classList?.contains("modal") && event.target.id !== "age-gate") {
        closeModal(event.target.id);
        return;
      }
      if (!event.target.closest("#main-nav") && !event.target.closest("#mobile-menu-button")) toggleMobileMenu(false);
      const target = event.target.closest("button,a,article"); if (!target) return;
      if (target.tagName === "BUTTON") flashButton(target);
      if (target.dataset.closeModal) closeModal(target.dataset.closeModal);
      if (target.dataset.login !== undefined) login();
      if (target.dataset.refreshPlatform) drawPlatform(target.dataset.refreshPlatform);
      if (target.dataset.flipCard) flipCard(target.dataset.flipCard);
      if (target.dataset.copyCardIds) copyCardIds(target.dataset.copyCardIds);
      if (target.dataset.sourceOpen) recordView(target.dataset.sourceOpen, "source");
      if (target.dataset.openWork) openWork(target.dataset.openWork);
      if (target.dataset.favorite) toggleFavorite(target.dataset.favorite);
      if (target.dataset.similar) recommendSimilar(target.dataset.similar);
      if (target.dataset.rating !== undefined) { state.currentRating = Number(target.dataset.rating); $$("[data-rating]").forEach(button => button.classList.toggle("selected", Number(button.dataset.rating) === state.currentRating)); }
      if (target.dataset.reply) { if (!await requireMember()) return; $(`#reply-${target.dataset.reply}`).innerHTML = `<form data-reply-form="${target.dataset.reply}" class="review-form"><textarea id="reply-body-${target.dataset.reply}" maxlength="300" required placeholder="回覆（最多 300 字）…"></textarea><button class="button button-primary">送出回覆</button></form>`; }
      if (target.dataset.vote) voteReview(target.dataset.reviewId, Number(target.dataset.vote));
      if (target.dataset.editReview) editReview(target.dataset.editReview);
      if (target.dataset.deleteReview) deleteReview(target.dataset.deleteReview);
      if (target.dataset.report) reportReview(target.dataset.report);
      if (target.dataset.openGame) openGame(target.dataset.openGame);
      if (target.dataset.editGame) { const { data } = await supabase.from("games").select("*").eq("id", target.dataset.editGame).single(); gameEditor(data); }
      if (target.dataset.deleteGame) deleteGame(target.dataset.deleteGame);
      if (target.dataset.deleteGameComment) deleteGameComment(target.dataset.deleteGameComment, target.dataset.gameId);
      if (target.dataset.adminTab) loadAdmin(target.dataset.adminTab);
      if (target.dataset.approveUser) { const { error } = await supabase.rpc("approve_user", { target_user: target.dataset.approveUser, approve: true }); toast(error ? error.message : "會員已通過", error ? "error" : "success"); if (!error) loadAdmin("users"); }
      if (target.dataset.suspendUser) { const { error } = await supabase.rpc("set_user_suspension", { target_user: target.dataset.suspendUser, suspend: target.dataset.suspend === "true" }); toast(error ? error.message : "會員狀態已更新", error ? "error" : "success"); if (!error) loadAdmin("users"); }
      if (target.dataset.runJob) runJob(target.dataset.runJob);
      if (target.dataset.refreshJobs !== undefined) loadJobs();
      if (target.dataset.newWork !== undefined) editWork();
      if (target.dataset.editWork) editWork(target.dataset.editWork);
      if (target.dataset.toggleWork) { const { error } = await supabase.from("works").update({ status: target.dataset.status }).eq("id", target.dataset.toggleWork); toast(error ? error.message : "作品狀態已更新", error ? "error" : "success"); if (!error) { await loadWorks(); loadAdmin("works"); } }
      if (target.dataset.purgeInactive !== undefined) { const confirmation = prompt('永久刪除所有 inactive/rejected 作品。請輸入「PURGE INACTIVE WORKS」確認：'); if (confirmation) { const { data, error } = await supabase.rpc("purge_inactive_works", { confirmation }); toast(error ? error.message : `已永久刪除 ${data} 筆`, error ? "error" : "success"); if (!error) { await loadWorks(); loadAdmin("works"); } } }
      if (target.dataset.resolveReport) { const { error } = await supabase.from("content_reports").update({ status: "resolved", resolved_by: state.session.user.id, resolved_at: new Date().toISOString() }).eq("id", target.dataset.resolveReport); toast(error ? error.message : "檢舉已完成", error ? "error" : "success"); if (!error) loadAdmin("reports"); }
      if (target.dataset.hideReview) { const { error } = await supabase.rpc("moderate_review", { target_review: target.dataset.hideReview, new_status: "hidden" }); toast(error ? error.message : "內容已隱藏", error ? "error" : "success"); if (!error) loadAdmin("reports"); }
      if (target.dataset.adminDeleteReview && confirm("確定永久刪除被檢舉的內容？")) { const { error } = await supabase.from("reviews").delete().eq("id", target.dataset.adminDeleteReview); toast(error ? error.message : "內容已刪除", error ? "error" : "success"); if (!error) loadAdmin("reports"); }
    });
  }

  async function init() {
    bindEvents();
    detectGoogleProvider();
    supabase.auth.onAuthStateChange((_event, session) => { state.session = session; setTimeout(loadAuth, 0); });
    try {
      await Promise.all([loadWorks(), loadLeaderboardData()]);
      await loadAuth();
      renderLibrary(true); renderLeaderboard();
      switchView(location.hash.slice(1) || "home");
    } catch (error) {
      console.error(error);
      $("#home-summary").textContent = "資料載入失敗，請稍後重試。";
      toast(`初始化失敗：${error.message}`, "error");
    }
  }

  init();
})();
