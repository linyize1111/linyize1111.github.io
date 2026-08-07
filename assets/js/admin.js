/**
 * admin.js — 主網站後台 CMS 邏輯
 *
 * 權限模型：前端只是「介面顯示」，真正的權限由後端 RLS + is_admin() 決定。
 * 即使有人手動打開介面，沒有白名單身分，任何寫入 / 上傳都會被資料庫拒絕。
 */
(function () {
  "use strict";

  // literature = 文學創作
  // notes + essay list = 隨筆（含心得）
  // notes + academic list = 學科筆記（導覽僅 admin）
  var ACADEMIC_CATEGORIES = ["資訊安全", "機器學習", "程式語言", "人文"];
  var CATEGORIES = {
    literature: ["創作", "長文"],
    notes: ["隨想", "日記", "心得", "隨筆"],
    academic: ["資訊安全", "機器學習", "程式語言", "人文"],
  };
  var CATEGORY_CHIPS = {
    literature: [
      { cat: "創作", title: "小說、詩、劇本", label: "創作" },
      { cat: "長文", title: "長篇創作／論述", label: "長文" },
    ],
    notes: [
      { cat: "隨想", title: "碎念、抱怨、隨便發", label: "隨想" },
      { cat: "日記", title: "當天生活紀錄、札記", label: "日記" },
      { cat: "心得", title: "閱讀／觀影心得", label: "心得" },
      { cat: "隨筆", title: "整理過的散文（UI：散文）", label: "散文" },
    ],
    academic: [
      { cat: "資訊安全", title: "資安筆記", label: "資訊安全" },
      { cat: "機器學習", title: "ML 筆記", label: "機器學習" },
      { cat: "程式語言", title: "程式學習", label: "程式語言" },
      { cat: "人文", title: "其他學科／人文", label: "人文" },
    ],
  };
  var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  // V3: no SHORT_CHARS / LONG_CHARS semantic thresholds
  var lastAiAnalysis = null;
  var editingArticleId = null;
  var articlesCache = [];

  var $ = function (id) { return document.getElementById(id); };
  var client = null;
  var currentImages = []; // [{src,caption}]
  var deleteInProgress = false;
  var lastParsed = null; // 匯入預覽結果
  var previewTimer = null;
  var editorMode = "split"; // split | edit | preview
  var formDirty = false;
  var formSnapshot = "";
  var sectionsCache = [];
  var activeSectionKey = null;
  var sectionDirty = false;
  var mediaUploadedUnsaved = false;
  var selectedIds = {};

  var SECTION_META = {
    "home.intro.title": { title: "首頁 · 歡迎標題", desc: "首頁 hero 主標題（短句）", mode: "text" },
    "home.intro.subtitle": { title: "首頁 · 歡迎副標", desc: "首頁 hero 副標題", mode: "text" },
    "home.featured.title": { title: "首頁 · 關於本站標題", desc: "首頁精選／關於區塊標題", mode: "text" },
    "home.featured.body": { title: "首頁 · 關於本站內文", desc: "首頁長文案；換行會顯示為斷行", mode: "text" },
    "about.heading": { title: "關於我 · 標題", desc: "about 頁大標（可多行）", mode: "text" },
    "about.body": { title: "關於我 · 內文", desc: "about 頁介紹文字", mode: "text" },
  };

  // ---------- 訊息 ----------
  function msg(container, text, kind) {
    var el = typeof container === "string" ? $(container) : container;
    if (!el) return;
    if (!text) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="msg ' + (kind || "ok") + '">' + window.SB.escapeText(text) + "</div>";
  }

  // ---------- 視圖切換 ----------
  function show(view) {
    ["view-unconfigured", "view-login", "view-guest", "view-admin"].forEach(function (v) {
      var el = $(v);
      if (el) el.classList.toggle("hidden", v !== view);
    });
  }

  // ---------- 影像壓縮 ----------
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) {
        reject(new Error("只允許圖片檔"));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var maxDim = 1600;
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // gif 不壓（避免失去動畫）；其餘輸出 webp
        if (file.type === "image/gif") { resolve({ blob: file, ext: "gif", type: file.type }); return; }
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error("壓縮失敗")); return; }
          resolve({ blob: blob, ext: "webp", type: "image/webp" });
        }, "image/webp", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("無法讀取圖片")); };
      img.src = url;
    });
  }

  async function uploadImage(file, section) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("原始檔超過 5MB");
    var out = await compressImage(file);
    if (out.blob.size > MAX_UPLOAD_BYTES) throw new Error("壓縮後仍超過 5MB");
    var bucket = window.SB.config.bucket || "article-images";
    var rand = Math.random().toString(36).slice(2, 8);
    var sec = typeof dbSection === "function" ? dbSection(section) : section;
    var path = (sec || "misc") + "/" + Date.now() + "-" + rand + "." + out.ext;
    var up = await client.storage.from(bucket).upload(path, out.blob, {
      contentType: out.type, upsert: false,
    });
    if (up.error) throw up.error;
    var pub = client.storage.from(bucket).getPublicUrl(path);
    return pub.data.publicUrl;
  }

  function setBodyImageStatus(html, isErr) {
    var el = $("body-image-status");
    if (!el) return;
    el.innerHTML = html || "";
    el.style.color = isErr ? "#c0392b" : "";
  }

  function displayCategoryLabel(cat) {
    if (window.SBSections && window.SBSections.displayCategory) {
      return window.SBSections.displayCategory(cat);
    }
    var n = normalizeCategory(cat);
    return n === "隨筆" ? "散文" : n;
  }

  function updateSaveStateUi() {
    var el = $("editor-save-state");
    if (!el) return;
    if (formDirty || mediaUploadedUnsaved) {
      var parts = [];
      if (mediaUploadedUnsaved) parts.push("✓ 圖片已上傳");
      parts.push("● 文章尚未儲存");
      el.textContent = parts.join(" · ");
      el.classList.add("is-dirty");
    } else {
      el.textContent = "已同步";
      el.classList.remove("is-dirty");
    }
  }

  function selectedIdList() {
    return Object.keys(selectedIds).filter(function (id) { return selectedIds[id]; });
  }

  function updateBulkUi() {
    var n = selectedIdList().length;
    var count = $("bulk-count");
    if (count) count.textContent = "已選 " + n;
    var apply = $("btn-bulk-apply");
    if (apply) apply.disabled = n === 0;
  }

  function clipboardImageFile(clipboardData) {
    if (!clipboardData || !clipboardData.items) return null;
    var items = clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && /^image\//.test(items[i].type)) {
        return items[i].getAsFile();
      }
    }
    return null;
  }

  function insertMarkdownAtCursor(md) {
    var ta = $("f-body");
    if (!ta) return;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var before = ta.value.slice(0, start);
    var needLead = before.length && !/\n\n$/.test(before) && !/\n$/.test(before);
    var block = (needLead ? "\n\n" : before.endsWith("\n") && !before.endsWith("\n\n") ? "\n" : "") + md + "\n\n";
    replaceBodyRange(start, end, block, start + block.length, start + block.length);
  }

  /** 上傳一或多張圖，插入正文 Markdown（可貼上／拖曳／工具列） */
  async function uploadImagesIntoBody(files) {
    files = Array.prototype.filter.call(files || [], function (f) {
      return f && /^image\//.test(f.type);
    });
    if (!files.length) return;
    setBodyImageStatus('<span class="spinner-inline"></span> 上傳圖片中…');
    var ok = 0;
    var errMsg = "";
    for (var i = 0; i < files.length; i++) {
      try {
        var url = await uploadImage(files[i], ($("f-section") && $("f-section").value) || "notes");
        insertMarkdownAtCursor("![](" + url + ")");
        ok++;
      } catch (err) {
        errMsg = err && err.message ? err.message : String(err);
      }
    }
    if (ok) {
      mediaUploadedUnsaved = true;
      markFormDirty();
    }
    if (ok && !errMsg) setBodyImageStatus("✓ 圖片已上傳（" + ok + "）· ● 文章尚未儲存");
    else if (ok && errMsg) setBodyImageStatus("已貼上 " + ok + " 張；部分失敗：" + errMsg, true);
    else setBodyImageStatus("上傳失敗：" + (errMsg || "未知錯誤"), true);
  }

  // ---------- 分類 datalist ----------
  function refreshCategoryList() {
    var section = ($("f-section") && $("f-section").value) || ($("list-section") && $("list-section").value) || "notes";
    var cats = CATEGORIES[section] || [];
    var sel = $("f-category");
    var cur = sel ? normalizeCategory(sel.value) : "";
    if (sel && sel.tagName === "SELECT") {
      sel.innerHTML = cats
        .map(function (c) {
          return '<option value="' + c + '">' + displayCategoryLabel(c) + "</option>";
        })
        .join("");
      if (cur && cats.indexOf(cur) !== -1) sel.value = cur;
      else if (cats.length) sel.value = cats[0];
    } else if (sel) {
      var dl = $("category-list");
      if (dl) {
        dl.innerHTML = cats.map(function (c) { return '<option value="' + c + '"></option>'; }).join("");
      }
    }
    var bulkCat = $("bulk-category");
    if (bulkCat) {
      var keep = bulkCat.value;
      bulkCat.innerHTML =
        '<option value="">改分類…</option>' +
        cats
          .map(function (c) {
            return '<option value="' + c + '">' + displayCategoryLabel(c) + "</option>";
          })
          .join("");
      if (keep) bulkCat.value = keep;
    }
    refreshCategoryChips();
  }

  async function loadArticles() {
    var uiSection = $("list-section").value;
    var section = dbSection(uiSection);
    var listEl = $("article-list");
    listEl.innerHTML = '<p class="muted"><span class="spinner-inline"></span> 載入中…</p>';
    var res = await client
      .from("articles")
      .select("id,title,slug,category,status,updated_at,section,sort_index")
      .eq("section", section)
      .order("sort_index", { ascending: false })
      .order("updated_at", { ascending: false });
    if (res.error) { listEl.innerHTML = '<p class="muted">讀取失敗：' + res.error.message + "</p>"; return; }
    articlesCache = (res.data || []).filter(function (a) {
      var academic = isAcademicCategory(a.category);
      if (uiSection === "academic") return academic;
      if (uiSection === "notes") return !academic;
      return true;
    });
    if (!articlesCache.length) { listEl.innerHTML = '<p class="muted">此分區尚無文章。</p>'; return; }
    renderArticleList(articlesCache);
  }

  // ---------- 文章清單 ----------
  function sectionLabel(section, category) {
    if (section === "notes" && isAcademicCategory(category)) return "學科筆記";
    if (section === "notes") return "隨筆";
    if (section === "academic") return "學科筆記";
    return "文學創作";
  }

  function dbSection(uiSection) {
    return uiSection === "academic" ? "notes" : uiSection;
  }

  function isAcademicCategory(cat) {
    var c = normalizeCategory(cat);
    return ACADEMIC_CATEGORIES.indexOf(c) !== -1;
  }

  function refreshCategoryChips() {
    var row = $("category-quick");
    var guide = document.querySelector(".cat-guide");
    var section = ($("f-section") && $("f-section").value) || "literature";
    var chips = CATEGORY_CHIPS[section] || CATEGORY_CHIPS.literature;
    if (row) {
      row.innerHTML = chips
        .map(function (c) {
          return (
            '<button type="button" class="chip" data-cat="' +
            c.cat +
            '" title="' +
            c.title +
            '">' +
            (c.label || displayCategoryLabel(c.cat)) +
            "</button>"
          );
        })
        .join("");
    }
    if (guide) {
      if (section === "notes") {
        guide.innerHTML =
          "<strong>隨想</strong>＝碎念　<strong>日記</strong>＝當天生活　<strong>心得</strong>＝閱讀／觀影　<strong>散文</strong>＝整理過的長文（DB：隨筆）<br /><span style=\"opacity:.85\">「感想」已退場。閱讀心得請放隨筆區。</span>";
      } else if (section === "academic") {
        guide.innerHTML =
          "學科筆記：僅管理員導覽可見。分類選資安／機器學習／程式／人文。";
      } else {
        guide.innerHTML =
          "<strong>創作</strong>＝小說／詩／劇本　<strong>長文</strong>＝長篇創作或文學論述<br /><span style=\"opacity:.85\">讀書心得請改放到「隨筆」。</span>";
      }
    }
    syncCategoryChips();
  }

  function statusLabel(status) {
    return status === "published" ? "已發佈" : "草稿";
  }

  function updateFormChrome() {
    var titleEl = $("form-title");
    var ctxEl = $("form-context");
    if (!titleEl) return;
    var id = ($("f-id") && $("f-id").value) || "";
    var title = (($("f-title") && $("f-title").value) || "").trim();
    var cat = normalizeCategory(($("f-category") && $("f-category").value) || "");
    var status = ($("f-status") && $("f-status").value) || "draft";
    var section = ($("f-section") && $("f-section").value) || "literature";
    var slug = (($("f-slug") && $("f-slug").value) || "").trim();

    if (!id && !title) {
      titleEl.textContent = "新增文章";
    } else {
      titleEl.textContent = (id ? "編輯：" : "新增：") + (title || "（尚未命名）");
    }
    if (ctxEl) {
      ctxEl.textContent =
        sectionLabel(section, cat) +
        " · " +
        (cat ? displayCategoryLabel(cat) : "未分類") +
        " · " +
        statusLabel(status) +
        (slug ? " · " + slug : "") +
        (id ? " · #" + String(id).slice(0, 8) : " · 尚未存檔");
    }
    document.title = (title || (id ? "編輯文章" : "新增文章")) + " · 後台";
    highlightActiveListItem(id || editingArticleId);
  }

  function highlightActiveListItem(id) {
    var listEl = $("article-list");
    if (!listEl) return;
    Array.prototype.forEach.call(listEl.querySelectorAll(".list-item"), function (el) {
      var match = id && el.getAttribute("data-id") === String(id);
      el.classList.toggle("is-active", !!match);
    });
  }

  function renderArticleList(rows) {
    var listEl = $("article-list");
    if (!listEl) return;
    var statusFilter = ($("list-status") && $("list-status").value) || "all";
    var q = (($("list-search") && $("list-search").value) || "").trim().toLowerCase();
    var filtered = (rows || []).filter(function (a) {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && String(a.title || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var hint = $("list-hint");
    if (hint) {
      hint.textContent =
        "共 " + (rows || []).length + " 篇" +
        (filtered.length !== (rows || []).length ? "（目前顯示 " + filtered.length + " 篇）" : "") +
        "。可勾選後批次改分區／分類／狀態。";
    }
    if (!filtered.length) {
      listEl.innerHTML = '<p class="muted">沒有符合條件的文章。</p>';
      updateBulkUi();
      return;
    }
    listEl.innerHTML = "";
    filtered.forEach(function (a) {
      var div = document.createElement("div");
      div.className = "list-item";
      div.setAttribute("data-id", a.id);
      if (editingArticleId && String(editingArticleId) === String(a.id)) {
        div.classList.add("is-active");
      }
      var check = document.createElement("input");
      check.type = "checkbox";
      check.className = "bulk-check";
      check.checked = !!selectedIds[a.id];
      check.addEventListener("change", function () {
        if (check.checked) selectedIds[a.id] = true;
        else delete selectedIds[a.id];
        updateBulkUi();
      });
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML =
        "<h4>" + window.SB.escapeText(a.title) + "</h4>" +
        "<small>" +
        '<span class="badge cat">' + window.SB.escapeText(displayCategoryLabel(a.category) || "未分類") + "</span> · " +
        window.SB.escapeText((a.updated_at || "").slice(0, 10)) + " · " +
        '<span class="badge ' + a.status + '">' + statusLabel(a.status) + "</span>" +
        (a.slug ? " · <code>" + window.SB.escapeText(a.slug) + "</code>" : "") +
        "</small>";
      var btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "編輯";
      btn.addEventListener("click", function () { openForm(a.id); });
      div.appendChild(check);
      div.appendChild(meta);
      div.appendChild(btn);
      listEl.appendChild(div);
    });
    updateBulkUi();
  }

  async function applyBulkMetadata() {
    var ids = selectedIdList();
    if (!ids.length) return;
    var nextSection = ($("bulk-section") && $("bulk-section").value) || "";
    var nextCat = ($("bulk-category") && $("bulk-category").value) || "";
    var nextStatus = ($("bulk-status") && $("bulk-status").value) || "";
    if (!nextSection && !nextCat && !nextStatus) {
      msg("global-msg", "請先選擇要改的分區／分類／狀態", "err");
      return;
    }
    var lines = [ids.length + " selected"];
    if (nextSection) lines.push("section → " + nextSection);
    if (nextCat) lines.push("category → " + displayCategoryLabel(nextCat));
    if (nextStatus) lines.push("status → " + nextStatus);
    if (!window.confirm("將套用以下變更？\n\n" + lines.join("\n"))) return;

    var payload = {};
    if (nextSection) payload.section = dbSection(nextSection);
    if (nextCat) payload.category = normalizeCategory(nextCat);
    if (nextStatus) payload.status = nextStatus;

    msg("global-msg", '<span class="spinner-inline"></span> 批次更新中…', "ok");
    var done = 0;
    var err = "";
    for (var i = 0; i < ids.length; i++) {
      var res = await client.from("articles").update(payload).eq("id", ids[i]);
      if (res.error) { err = res.error.message || String(res.error); break; }
      done++;
    }
    if (err) msg("global-msg", "批次部分失敗（成功 " + done + "）：" + err, "err");
    else msg("global-msg", "已更新 " + done + " 篇 ✔", "ok");
    selectedIds = {};
    if ($("bulk-section")) $("bulk-section").value = "";
    if ($("bulk-category")) $("bulk-category").value = "";
    if ($("bulk-status")) $("bulk-status").value = "";
    if ($("bulk-select-all")) $("bulk-select-all").checked = false;
    await loadArticles();
  }

  // ---------- images editor ----------
  function renderImagesEditor() {
    var box = $("images-editor");
    box.innerHTML = "";
    currentImages.forEach(function (im, idx) {
      var row = document.createElement("div");
      row.className = "img-row";
      var thumb = document.createElement("img");
      thumb.className = "thumb"; thumb.src = im.src;
      var cap = document.createElement("input");
      cap.placeholder = "圖說（選填）"; cap.value = im.caption || "";
      cap.addEventListener("input", function () {
        currentImages[idx].caption = cap.value;
        markFormDirty();
      });
      var del = document.createElement("button");
      del.className = "btn danger"; del.textContent = "移除";
      del.addEventListener("click", function () {
        currentImages.splice(idx, 1); renderImagesEditor(); markFormDirty();
      });
      row.appendChild(thumb); row.appendChild(cap); row.appendChild(del);
      box.appendChild(row);
    });
  }

  // ---------- 開啟 / 重置表單（大編輯 overlay） ----------
  function updateMdPreview() {
    var preview = $("md-preview");
    var body = $("f-body");
    if (!preview || !body) return;
    var md = body.value || "";
    if (!md.trim()) {
      preview.innerHTML = "";
      return;
    }
    if (window.SB && typeof window.SB.renderMarkdown === "function") {
      preview.innerHTML = window.SB.renderMarkdown(md);
    } else {
      preview.textContent = md;
    }
  }

  function scheduleMdPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(updateMdPreview, 120);
  }

  function setEditorMode(mode) {
    if (mode !== "split" && mode !== "edit" && mode !== "preview") mode = "split";
    editorMode = mode;
    var main = $("editor-main");
    if (main) main.setAttribute("data-layout", mode);
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-editor-mode") === mode);
    });
    if (mode === "preview" || mode === "split") updateMdPreview();
  }

  function captureFormSnapshot() {
    formSnapshot = JSON.stringify({
      id: ($("f-id") && $("f-id").value) || "",
      section: ($("f-section") && $("f-section").value) || "",
      status: ($("f-status") && $("f-status").value) || "",
      category: ($("f-category") && $("f-category").value) || "",
      title: ($("f-title") && $("f-title").value) || "",
      slug: ($("f-slug") && $("f-slug").value) || "",
      summary: ($("f-summary") && $("f-summary").value) || "",
      tags: ($("f-tags") && $("f-tags").value) || "",
      pdf: ($("f-pdf") && $("f-pdf").value) || "",
      sort: ($("f-sort") && $("f-sort").value) || "",
      cover: ($("f-cover") && $("f-cover").value) || "",
      body: ($("f-body") && $("f-body").value) || "",
      images: currentImages,
    });
    formDirty = false;
    mediaUploadedUnsaved = false;
    updateSaveStateUi();
  }

  function markFormDirty() {
    formDirty = true;
    updateSaveStateUi();
  }

  function confirmLeaveEditor() {
    if (!formDirty) return true;
    return window.confirm("有尚未儲存的變更，確定離開編輯器？");
  }

  function closeForm(force) {
    if (!force && !confirmLeaveEditor()) return;
    var form = $("article-form");
    if (form) form.classList.add("hidden");
    document.body.classList.remove("editor-open");
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    formDirty = false;
    editingArticleId = null;
    highlightActiveListItem(null);
    document.title = "後台管理 · LYZ's website";
  }

  function showEditor() {
    var form = $("article-form");
    if (!form) return;
    form.classList.remove("hidden");
    document.body.classList.add("editor-open");
    setEditorMode(editorMode || "split");
    updateMdPreview();
    updateLengthHint();
  }

  // ---------- Markdown 工具列 ----------
  function notifyBodyChanged() {
    markFormDirty();
    updateLengthHint();
    scheduleMdPreview();
  }

  function replaceBodyRange(start, end, text, selStart, selEnd) {
    var ta = $("f-body");
    if (!ta) return;
    var val = ta.value;
    ta.value = val.slice(0, start) + text + val.slice(end);
    var a = typeof selStart === "number" ? selStart : start + text.length;
    var b = typeof selEnd === "number" ? selEnd : a;
    ta.focus();
    ta.setSelectionRange(a, b);
    notifyBodyChanged();
  }

  function wrapSelection(before, after, placeholder) {
    var ta = $("f-body");
    if (!ta) return;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var selected = ta.value.slice(start, end);
    var body = selected || placeholder || "";
    var insert = before + body + after;
    var selStart = start + before.length;
    replaceBodyRange(start, end, insert, selStart, selStart + body.length);
  }

  function prefixSelectedLines(prefix) {
    var ta = $("f-body");
    if (!ta) return;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var val = ta.value;
    var lineStart = val.lastIndexOf("\n", start - 1) + 1;
    var lineEnd = val.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = val.length;
    var block = val.slice(lineStart, lineEnd);
    if (!block) {
      replaceBodyRange(lineStart, lineEnd, prefix, lineStart + prefix.length, lineStart + prefix.length);
      return;
    }
    var lines = block.split("\n");
    var next = lines.map(function (ln) {
      if (!ln.trim()) return ln;
      if (ln.indexOf(prefix) === 0) return ln;
      return prefix + ln;
    }).join("\n");
    replaceBodyRange(lineStart, lineEnd, next, lineStart, lineStart + next.length);
  }

  function applyMdTool(action) {
    if (action === "h2") prefixSelectedLines("## ");
    else if (action === "h3") prefixSelectedLines("### ");
    else if (action === "bold") wrapSelection("**", "**", "粗體文字");
    else if (action === "italic") wrapSelection("*", "*", "斜體文字");
    else if (action === "link") wrapSelection("[", "](https://)", "連結文字");
    else if (action === "image") {
      var pick = $("body-image-file");
      if (pick) pick.click();
      else wrapSelection("![", "](https://)", "圖說");
    }
    else if (action === "ul") prefixSelectedLines("- ");
    else if (action === "ol") prefixSelectedLines("1. ");
    else if (action === "quote") prefixSelectedLines("> ");
    else if (action === "hr") {
      var ta = $("f-body");
      if (!ta) return;
      var start = ta.selectionStart;
      var pad = (start > 0 && ta.value[start - 1] !== "\n") ? "\n\n" : "\n";
      replaceBodyRange(start, ta.selectionEnd, pad + "---\n\n");
    } else if (action === "code") wrapSelection("`", "`", "code");
  }

  function handleBodyTab(e) {
    if (e.key !== "Tab") return;
    var ta = $("f-body");
    if (!ta || document.activeElement !== ta) return;
    e.preventDefault();
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    if (e.shiftKey) {
      var val = ta.value;
      var lineStart = val.lastIndexOf("\n", start - 1) + 1;
      var lineEnd = val.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = val.length;
      var block = val.slice(lineStart, lineEnd);
      var next = block.split("\n").map(function (ln) {
        if (ln.indexOf("  ") === 0) return ln.slice(2);
        if (ln.indexOf("\t") === 0) return ln.slice(1);
        return ln;
      }).join("\n");
      replaceBodyRange(lineStart, lineEnd, next, Math.max(lineStart, start - 2), Math.max(lineStart, end - (block.length - next.length)));
      return;
    }
    if (start !== end) {
      prefixSelectedLines("  ");
      return;
    }
    replaceBodyRange(start, end, "  ", start + 2, start + 2);
  }

  function resetForm() {
    $("f-id").value = "";
    $("f-section").value = $("list-section").value;
    $("f-status").value = "draft";
    $("f-category").value = "";
    $("f-title").value = "";
    $("f-slug").value = "";
    $("f-summary").value = "";
    $("f-tags").value = "";
    $("f-pdf").value = "";
    $("f-sort").value = "0";
    $("f-cover").value = "";
    $("cover-thumb").classList.add("hidden");
    $("f-body").value = "";
    if ($("f-content-type")) $("f-content-type").value = "";
    if ($("f-presentation")) $("f-presentation").value = "";
    if ($("f-visibility")) {
      $("f-visibility").value = $("list-section").value === "academic" ? "private" : "public";
    }
    if ($("f-series")) $("f-series").value = "";
    if ($("f-show-title")) $("f-show-title").checked = true;
    if ($("f-show-summary")) $("f-show-summary").checked = true;
    if ($("f-card-topic")) $("f-card-topic").value = "";
    if ($("f-card-label")) $("f-card-label").value = "";
    if ($("f-show-card-label")) $("f-show-card-label").checked = true;
    window.__lastOpenedAiEditorial = {};
    lastAiAnalysis = null;
    if ($("ai-review-panel")) $("ai-review-panel").classList.add("hidden");
    if ($("ai-status")) $("ai-status").textContent = "";
    currentImages = [];
    renderImagesEditor();
    refreshCategoryList();
    msg("form-msg", "");
    updateMdPreview();
  }

  async function openForm(id) {
    resetForm();
    editingArticleId = id || null;
    $("btn-delete").classList.toggle("hidden", !id);
    showEditor();
    updateFormChrome();
    if (id) {
      var res = await client.from("articles").select("*").eq("id", id).single();
      if (res.error) { msg("form-msg", "讀取失敗：" + res.error.message, "err"); return; }
      var a = res.data;
      $("f-id").value = a.id;
      editingArticleId = a.id;
      window.__lastOpenedAiEditorial =
        a.ai_editorial && typeof a.ai_editorial === "object" ? a.ai_editorial : {};
      var catNorm = normalizeCategory(a.category || "");
      $("f-section").value =
        a.section === "notes" && isAcademicCategory(catNorm) ? "academic" : a.section;
      $("f-status").value = a.status;
      $("f-category").value = catNorm;
      if ($("f-content-type")) $("f-content-type").value = a.content_type || "";
      if ($("f-presentation")) $("f-presentation").value = a.presentation || "";
      if ($("f-visibility")) {
        $("f-visibility").value = a.visibility || (isAcademicCategory(catNorm) ? "private" : "public");
      }
      if ($("f-series")) $("f-series").value = a.series || "";
      if ($("f-show-title")) $("f-show-title").checked = a.show_title !== false;
      if ($("f-show-summary")) $("f-show-summary").checked = !!a.show_summary;
      (function fillCardDisplay() {
        var ae = a.ai_editorial && typeof a.ai_editorial === "object" ? a.ai_editorial : {};
        var d = ae.display && typeof ae.display === "object" ? ae.display : {};
        if ($("f-card-topic")) {
          $("f-card-topic").value = d.card_topic || ae.card_topic || "";
        }
        if ($("f-card-label")) {
          $("f-card-label").value = d.card_label || ae.card_label || "";
        }
        if ($("f-show-card-label")) {
          var show =
            typeof d.show_card_label === "boolean"
              ? d.show_card_label
              : typeof ae.show_card_label === "boolean"
                ? ae.show_card_label
                : true;
          $("f-show-card-label").checked = show;
        }
      })();
      $("f-title").value = a.title || "";
      $("f-slug").value = a.slug || "";
      $("f-summary").value = a.summary || "";
      $("f-tags").value = (a.tags || []).join(", ");
      $("f-pdf").value = a.pdf_url || "";
      $("f-sort").value = a.sort_index || 0;
      $("f-cover").value = a.cover || "";
      if (a.cover) { $("cover-thumb").src = a.cover; $("cover-thumb").classList.remove("hidden"); }
      $("f-body").value = a.body || "";
      currentImages = Array.isArray(a.images) ? a.images.slice() : [];
      renderImagesEditor();
      refreshCategoryList();
      updateMdPreview();
      updateLengthHint();
      syncCategoryChips();
      updateFormChrome();
      if (!a.presentation) setAiStatus("此篇尚無 presentation，建議執行 AI 整理與判斷", false);
    } else {
      syncCategoryChips();
      updateFormChrome();
    }
    captureFormSnapshot();
    var bodyEl = $("f-body");
    if (bodyEl && editorMode !== "preview") {
      setTimeout(function () { bodyEl.focus(); }, 50);
    }
  }

  function slugify(s) {
    return String(s || "").trim().toLowerCase()
      .replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "").slice(0, 120);
  }

  function plainSummary(s) {
    return String(s || "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/[#>*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
  }

  function detectLengthKind(body, forced) {
    // V3: length is a reference signal only — never a semantic class.
    if (forced === "short" || forced === "long") return forced;
    return "unknown";
  }

  function lengthLabel(kind) {
    if (kind === "short") return "隨想";
    if (kind === "long") return "長文";
    return "中篇";
  }

  function normalizeCategory(cat) {
    if (window.SBSections && window.SBSections.normalizeCategory) {
      return window.SBSections.normalizeCategory(cat);
    }
    var c = String(cat || "").trim();
    if (c === "短思" || c === "碎念" || c === "短文") return "隨想";
    if (c === "生活札記" || c === "札記" || c === "日常") return "日記";
    if (c === "短感想" || c === "隨感" || c === "感想") return "隨想";
    if (c === "閱讀心得" || c === "讀後感" || c === "心得感想") return "心得";
    if (c === "文學創作" || c === "小說" || c === "詩") return "創作";
    if (c === "散文" || c === "長隨筆") return "隨筆";
    return c;
  }

  function isThoughtCategory(cat) {
    var c = normalizeCategory(cat);
    return c === "隨想" || c === "日記";
  }

  function isLightListCategory(cat) {
    return isThoughtCategory(cat);
  }

  /** 謹慎推測分類 */
  function suggestCategory(title, body, section, existing) {
    // V3: semantic classification is AI/human only. Regex/length must not decide.
    void title; void body; void section;
    return normalizeCategory(existing || "") || "";
  }

  function syncCategoryChips() {
    var cur = normalizeCategory(($("f-category") && $("f-category").value) || "");
    var row = $("category-quick");
    if (!row) return;
    Array.prototype.forEach.call(row.querySelectorAll(".chip"), function (btn) {
      var cat = btn.getAttribute("data-cat");
      btn.classList.toggle("is-selected", cat === cur);
    });
  }

  function todayThoughtTitle(catHint) {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var cat = normalizeCategory(catHint || ($("f-category") && $("f-category").value) || "隨想");
    var label = cat === "日記" ? "日記" : "隨想";
    return y + "-" + m + "-" + day + " " + label;
  }

  function firstSentenceTitle(text) {
    var plain = plainSummary(text).replace(/^["「『]|["」』]$/g, "");
    if (!plain) return "";
    var cut = plain.split(/[。！？\n.!?\u2026]/)[0] || plain;
    cut = cut.trim().slice(0, 48);
    return cut;
  }

  function ensureThoughtTitle(out) {
    // V3: never invent title from first sentence / length.
    void out;
  }

  function updateLengthHint() {
    var el = $("length-hint");
    if (!el) return;
    var body = ($("f-body") && $("f-body").value) || "";
    var n = String(body).replace(/\s+/g, "").length;
    el.textContent = n
      ? ("約 " + n + " 字（僅供參考）。分類／presentation 請用「AI 整理與判斷」或手動選擇。")
      : "貼上後請按「AI 整理與判斷」，或手動填分類。AI 失敗時不會用字數規則猜。";
  }

  function addTagSuggestion(tag) {
    var input = $("f-tags");
    if (!input || !tag) return;
    var cur = input.value.split(/[,，、]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    if (cur.indexOf(tag) !== -1) return;
    cur.push(tag);
    input.value = cur.join(", ");
    markFormDirty();
    updateFormChrome();
  }

  function setCategoryQuick(cat) {
    var input = $("f-category");
    if (!input) return;
    input.value = normalizeCategory(cat);
    syncCategoryChips();
    markFormDirty();
    updateFormChrome();
    updateLengthHint();
  }

  function ensureCategoryOnSave() {
    var cat = normalizeCategory($("f-category").value);
    if (cat) {
      $("f-category").value = cat;
      return cat;
    }
    msg("form-msg", "請先選擇分類，或執行「AI 整理與判斷」後確認。", "err");
    return "";
  }

  function isJunkSocialLine(line) {
    var t = String(line || "").trim();
    if (!t) return false;
    if (/^(Like|Comment|Share|Send|Follow|Following|Translate|View\s+insights|Liked by|Reply|Repost|Quote|轉發|回覆|讚|留言|分享|追蹤|更多|查看翻譯|查看洞察報告)$/i.test(t)) return true;
    if (/^\d+\s*(likes?|comments?|replies?|views?|讚|留言|次觀看)$/i.test(t)) return true;
    if (/^(Threads|Facebook|Instagram|HackMD)\b/i.test(t) && t.length < 40) return true;
    return false;
  }

  function isImageUrl(u) {
    if (!u) return false;
    if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u)) return true;
    if (/fbcdn\.net|cdninstagram\.com|twimg\.com|imgur\.com\/[A-Za-z0-9]+($|\?)/i.test(u)) return true;
    if (/supabase\.co\/storage\/v1\/object\/public\//i.test(u)) return true;
    return false;
  }

  // ---------- 貼文解析（本地啟發式，不送第三方） ----------
  function parseMetaLine(key, value, out) {
    var k = String(key || "").trim().toLowerCase();
    var v = String(value || "").trim();
    if (!v) return;
    if (k === "title" || k === "標題") out.title = v;
    else if (k === "slug") out.slug = slugify(v);
    else if (k === "summary" || k === "摘要" || k === "description") out.summary = v;
    else if (k === "category" || k === "分類") out.category = normalizeCategory(v);
    else if (k === "tags" || k === "標籤") {
      out.tags = v.split(/[,，、]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    } else if (k === "cover" || k === "主圖" || k === "image" || k === "img") out.cover = v;
    else if (k === "pdf" || k === "pdf_url") out.pdf = v;
    else if (k === "status" || k === "狀態") {
      if (/publish|發佈|发布/i.test(v)) out.status = "published";
      else if (/draft|草稿/i.test(v)) out.status = "draft";
    } else if (k === "section" || k === "分區") {
      if (/academic|學科/i.test(v)) out.section = "academic";
      else if (/note|雜記|隨筆|隨想區/i.test(v)) out.section = "notes";
      else if (/liter|文學|創作區/i.test(v)) out.section = "literature";
    } else if (k === "length" || k === "篇幅" || k === "kind") {
      if (/短|隨想|抱怨|碎念|short|thought/i.test(v)) out.lengthKind = "short";
      else if (/長|long/i.test(v)) out.lengthKind = "long";
    }
  }

  function parseArticleBlob(raw, opts) {
    opts = opts || {};
    var text = String(raw || "").replace(/\r\n/g, "\n").trim();
    var out = {
      title: "", slug: "", summary: "", body: "", category: "",
      tags: [], cover: "", pdf: "", status: "", section: "",
      images: [], lengthKind: "",
    };
    if (!text) return out;

    var onlyUrl = text.match(/^(https?:\/\/[^\s]+)$/i);
    if (onlyUrl) {
      out.title = "未命名匯入";
      out.body = "來源：" + onlyUrl[1] + "\n\n（請把全文貼上後再解析；僅貼連結無法抓遠端內容。）";
      out.summary = "請改貼全文內容。";
      out.slug = slugify("import-" + Date.now().toString(36));
      out.lengthKind = "short";
      return out;
    }

    if (text.indexOf("---") === 0) {
      var close = text.search(/\r?\n---\s*(?:\r?\n|$)/);
      if (close !== -1) {
        var between = text.slice(3, close);
        var yamlLines = between.split(/\r?\n/).filter(function (line) {
          return /^\s*[A-Za-z0-9_\u4e00-\u9fff][\w\u4e00-\u9fff.-]*\s*[:：]/.test(line);
        });
        var sentenceMarks = (between.match(/[。！？]/g) || []).length;
        if (yamlLines.length && !(sentenceMarks >= 2 && yamlLines.length < 2)) {
          between.split("\n").forEach(function (line) {
            var m = line.match(/^([^\s:#]+)\s*[:：]\s*(.+)$/);
            if (m) parseMetaLine(m[1], m[2].replace(/^["']|["']$/g, ""), out);
          });
          text = text.slice(close).replace(/^\r?\n---\s*/, "").trim();
        }
      }
    }

    var mdImgRe = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
    var mdm;
    while ((mdm = mdImgRe.exec(text)) !== null) {
      var src = mdm[2].replace(/[),.]+$/, "");
      if (!out.cover) out.cover = src;
      else if (!out.images.some(function (im) { return im.src === src; })) {
        out.images.push({ src: src, caption: mdm[1] || "" });
      }
    }

    var lines = text.split("\n").filter(function (ln) { return !isJunkSocialLine(ln); });
    var bodyStart = 0;
    var urlRe = /(https?:\/\/[^\s)>\]]+)/gi;
    var allUrls = text.match(urlRe) || [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var meta = line.match(/^(title|slug|summary|category|tags|cover|pdf|status|section|length|標題|摘要|分類|標籤|主圖|狀態|分區|篇幅)\s*[:：]\s*(.+)$/i);
      if (meta) {
        parseMetaLine(meta[1], meta[2], out);
        bodyStart = i + 1;
        continue;
      }
      var h1 = line.match(/^#\s+(.+)$/);
      if (h1 && !out.title) {
        out.title = h1[1].trim();
        bodyStart = i + 1;
        break;
      }
      if (/^https?:\/\//i.test(line)) {
        bodyStart = i;
        break;
      }
      // V3: first non-empty line is only a title candidate; keep it in body
      if (!out.title && !out._titleCandidate) {
        out._titleCandidate = line.replace(/^["「『]|["」』]$/g, "");
      }
      break;
    }

    var bodyLines = lines.slice(bodyStart);
    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();

    if (out.title && bodyLines.length && bodyLines[0].trim() === out.title) {
      bodyLines.shift();
      while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    }

    if (!out.summary && bodyLines.length) {
      var para = [];
      for (var j = 0; j < bodyLines.length; j++) {
        var bl = bodyLines[j].trim();
        if (!bl) break;
        if (/^#+\s/.test(bl) || /^[-*]\s/.test(bl)) break;
        if (/^https?:\/\//i.test(bl) || /^!\[/.test(bl)) continue;
        para.push(bl);
        if (para.join(" ").length > 40) break;
      }
      out.summary = plainSummary(para.join(" "));
    }

    // 標籤預設空白：不強迫、不自動灌 hashtag（使用者可一鍵建議）
    if (!Array.isArray(out.tags)) out.tags = [];

    allUrls.forEach(function (u) {
      var clean = u.replace(/[),.]+$/, "");
      if (!out.pdf && /\.pdf(\?|#|$)/i.test(clean)) out.pdf = clean;
      else if (isImageUrl(clean)) {
        if (!out.cover) out.cover = clean;
        else if (!out.images.some(function (im) { return im.src === clean; })) {
          out.images.push({ src: clean, caption: "" });
        }
      }
    });

    out.body = bodyLines.join("\n").trim();
    if (!out.body && out.title) out.body = out.title;

    var forced = opts.lengthPreference || "auto";
    out.lengthKind = out.lengthKind || detectLengthKind(out.body, forced);

    if (out.category) out.category = normalizeCategory(out.category);

    // 使用者在匯入第一步選的分區永遠優先；heuristic / frontmatter 不可覆寫
    var lockedSection = opts.section || ($("import-section") && $("import-section").value) || "";
    if (lockedSection) out.section = lockedSection;
    else if (!out.section) out.section = "notes";

    var sectionForCat = out.section || "notes";
    if (out.category) {
      var allowed = CATEGORIES[sectionForCat] || CATEGORIES.notes;
      if (allowed.indexOf(out.category) === -1) out.category = "";
    }
    if (!out.status) out.status = "draft";
    ensureThoughtTitle(out);
    if (!out.slug && out.title) out.slug = slugify(out.title);
    if (!out.slug) out.slug = "draft-" + Date.now().toString(36);
    if (!out.summary) out.summary = "";
    out.needs_ai_analysis = true;
    out.human_review_required = true;
    return out;
  }

  function showImportPreview(parsed) {
    var box = $("import-preview");
    if (!box) return;
    box.classList.remove("hidden");
    $("preview-title").textContent = parsed.title || "（無標題）";
    var badge = $("preview-length-badge");
    badge.textContent = lengthLabel(parsed.lengthKind);
    badge.className = "badge length-" + (parsed.lengthKind || "medium");
    $("preview-meta").textContent =
      "分區 " + (parsed.section || "—") +
      " · 分類 " + (parsed.category ? displayCategoryLabel(parsed.category) : "自動") +
      " · 標籤 " + ((parsed.tags && parsed.tags.length) ? parsed.tags.join(", ") : "空白（可選）") +
      " · slug " + (parsed.slug || "—") +
      (parsed.cover ? " · 已抓到封面圖" : "") +
      (parsed.images && parsed.images.length ? (" · 另 " + parsed.images.length + " 張圖") : "");
    var hint = $("preview-hint");
    if (hint) {
      hint.textContent = isThoughtCategory(parsed.category)
        ? (normalizeCategory(parsed.category) === "日記"
          ? "已當成「日記」：當天生活／札記類。若其實是碎念，請改點「隨想」。"
          : "已當成「隨想」：抱怨／碎念／隨便發都適合。若是當天生活紀錄，請改點「日記」。")
        : "分類推測為「" + (parsed.category || "—") + "」。進大編輯後可一鍵改成隨想／日記／心得／創作。";
    }
    $("preview-summary").textContent = parsed.summary || "（無摘要）";
    $("preview-body").textContent = (parsed.body || "").slice(0, 1200) + ((parsed.body || "").length > 1200 ? "\n…" : "");
  }

  function applyParsedArticle(parsed) {
    openForm(null);
    if (parsed.section) $("f-section").value = parsed.section;
    if (parsed.status) $("f-status").value = parsed.status;
    if (parsed.category) $("f-category").value = normalizeCategory(parsed.category);
    if (parsed.title) $("f-title").value = parsed.title;
    if (parsed.slug) $("f-slug").value = parsed.slug;
    if (parsed.summary) $("f-summary").value = parsed.summary;
    // 標籤預設空白；僅當貼文明確寫了 tags: 才帶入
    $("f-tags").value = (parsed.tags && parsed.tags.length) ? parsed.tags.join(", ") : "";
    if (parsed.pdf) $("f-pdf").value = parsed.pdf;
    if (parsed.cover) {
      $("f-cover").value = parsed.cover;
      $("cover-thumb").src = parsed.cover;
      $("cover-thumb").classList.remove("hidden");
    } else {
      $("f-cover").value = "";
      $("cover-thumb").classList.add("hidden");
    }
    if (parsed.body) $("f-body").value = parsed.body;
    currentImages = [];
    if (parsed.images && parsed.images.length) {
      parsed.images.forEach(function (im) {
        if (!currentImages.some(function (x) { return x.src === im.src; })) {
          currentImages.push(im);
        }
      });
    }
    renderImagesEditor();
    refreshCategoryList();
    updateLengthHint();
    updateMdPreview();
    syncCategoryChips();
    updateFormChrome();
    markFormDirty();
  }

  async function quickSaveDraft(parsed) {
    applyParsedArticle(parsed);
    $("f-status").value = "draft";
    await saveArticle();
  }

  async function saveArticle() {
    var id = $("f-id").value;
    var bodyVal = ($("f-body") && $("f-body").value) || "";
    var title = $("f-title").value.trim();
    var slug = $("f-slug").value.trim() || (title ? slugify(title) : "");
    if (!title) { msg("form-msg", "請填標題（或先跑 AI 整理並確認）。系統不會再用首句／字數自動命名。", "err"); return; }
    if (!slug) { msg("form-msg", "請填 slug", "err"); return; }
    $("f-slug").value = slug;

    var category = ensureCategoryOnSave();
    if (!category) return;
    var tags = $("f-tags").value.split(/[,，、]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var uiSection = $("f-section").value;
    var payload = {
      section: dbSection(uiSection),
      slug: slug,
      title: title,
      summary: $("f-summary").value.trim(),
      body: bodyVal,
      cover: $("f-cover").value.trim() || null,
      images: currentImages,
      category: category || null,
      tags: tags,
      pdf_url: $("f-pdf").value.trim() || null,
      status: $("f-status").value,
      sort_index: parseInt($("f-sort").value, 10) || 0,
      content_type: ($("f-content-type") && $("f-content-type").value) || null,
      presentation: ($("f-presentation") && $("f-presentation").value) || null,
      visibility: ($("f-visibility") && $("f-visibility").value) || "public",
      series: ($("f-series") && $("f-series").value.trim()) || null,
      show_title: $("f-show-title") ? !!$("f-show-title").checked : null,
      show_summary: $("f-show-summary") ? !!$("f-show-summary").checked : null,
      needs_ai_analysis: !(($("f-presentation") && $("f-presentation").value)),
    };
    // Merge semantic card display into ai_editorial (never overwrites article.title)
    (function stampCardDisplay() {
      if (!$("f-card-topic") && !$("f-card-label")) return;
      var topic = $("f-card-topic") ? $("f-card-topic").value.trim() : "";
      var label = $("f-card-label") ? $("f-card-label").value.trim() : "";
      var showLabel = $("f-show-card-label") ? !!$("f-show-card-label").checked : !!label;
      var prev =
        window.__lastOpenedAiEditorial && typeof window.__lastOpenedAiEditorial === "object"
          ? window.__lastOpenedAiEditorial
          : {};
      var display = Object.assign({}, prev.display || {}, {
        card_topic: topic,
        card_label: label,
        show_card_label: showLabel && !!label,
      });
      var next = Object.assign({}, prev, {
        display: display,
        card_topic: topic,
        card_label: label,
        show_card_label: display.show_card_label,
      });
      if (lastAiAnalysis) {
        next.analyzed_at = new Date().toISOString();
        next.source = next.source || "admin_ai_confirm";
        next.confidence = lastAiAnalysis.confidence;
        next.reason = lastAiAnalysis.reason;
        next.flags = lastAiAnalysis.flags || next.flags || [];
        next.edit_level = lastAiAnalysis.edit_level || next.edit_level;
        next.human_review_required = !!lastAiAnalysis.human_review_required;
        next.semantic_card_version = "v1";
      }
      payload.ai_editorial = next;
      window.__lastOpenedAiEditorial = next;
    })();
    if (uiSection === "academic") {
      payload.visibility = ($("f-visibility") && $("f-visibility").value) || "private";
    }
    // Drop unknown columns until 0007 applied (retry without V3 fields on schema error)
    payload._v3 = true;

    $("btn-save").disabled = true;
    msg("form-msg", '<span class="spinner-inline"></span> 儲存中…', "ok");
    var res;
    delete payload._v3;
    if (id) res = await client.from("articles").update(payload).eq("id", id).select().single();
    else res = await client.from("articles").insert(payload).select().single();

    if (res.error && /column|does not exist|42703/i.test(res.error.message || "")) {
      delete payload.content_type;
      delete payload.presentation;
      delete payload.visibility;
      delete payload.series;
      delete payload.show_title;
      delete payload.show_summary;
      delete payload.needs_ai_analysis;
      if (id) res = await client.from("articles").update(payload).eq("id", id).select().single();
      else res = await client.from("articles").insert(payload).select().single();
      if (!res.error) {
        msg("form-msg", "已儲存（資料庫尚未套用 0007，V3 metadata 未寫入）。", "ok");
      }
    }

    $("btn-save").disabled = false;

    if (res.error) {
      var m = res.error.message || "";
      if (/duplicate|unique/i.test(m)) m = "slug 在此分區已存在，請換一個。";
      else if (/row-level security|permission/i.test(m)) m = "沒有寫入權限（非管理員）。";
      msg("form-msg", "儲存失敗：" + m, "err");
      return;
    }
    msg("form-msg", "已儲存 ✔", "ok");
    $("f-id").value = res.data.id;
    editingArticleId = res.data.id;
    $("btn-delete").classList.remove("hidden");
    mediaUploadedUnsaved = false;
    setBodyImageStatus("");
    captureFormSnapshot();
    updateFormChrome();
    loadArticles();
  }

  // ---------- 刪除文章（雙重確認 modal） ----------
  function closeDeleteModal() {
    var modal = $("delete-modal");
    if (modal) modal.classList.add("hidden");
    $("delete-step-1").classList.remove("hidden");
    $("delete-step-2").classList.add("hidden");
    $("delete-confirm-input").value = "";
    $("delete-confirm").disabled = true;
    if (!deleteInProgress) $("btn-delete").disabled = false;
  }

  function openDeleteModal() {
    var id = $("f-id").value;
    if (!id || deleteInProgress) return;
    var title = ($("f-title").value || "").trim();
    if (!title) {
      msg("form-msg", "無法刪除：缺少文章標題", "err");
      return;
    }
    $("delete-preview-title").textContent = "「" + title + "」";
    $("delete-expected-title").textContent = title;
    $("delete-confirm-input").value = "";
    $("delete-confirm").disabled = true;
    $("delete-step-1").classList.remove("hidden");
    $("delete-step-2").classList.add("hidden");
    $("delete-modal").classList.remove("hidden");
    $("delete-cancel-1").focus();
  }

  function showDeleteStep2() {
    $("delete-step-1").classList.add("hidden");
    $("delete-step-2").classList.remove("hidden");
    $("delete-confirm-input").focus();
  }

  function bindDeleteModal() {
    var modal = $("delete-modal");
    if (!modal) return;

    $("delete-cancel-1").addEventListener("click", closeDeleteModal);
    $("delete-back").addEventListener("click", function () {
      $("delete-step-2").classList.add("hidden");
      $("delete-step-1").classList.remove("hidden");
      $("delete-confirm-input").value = "";
      $("delete-confirm").disabled = true;
    });
    $("delete-continue").addEventListener("click", showDeleteStep2);

    $("delete-confirm-input").addEventListener("input", function () {
      var expected = ($("delete-expected-title").textContent || "").trim();
      var typed = ($("delete-confirm-input").value || "").trim();
      $("delete-confirm").disabled = typed !== expected;
    });

    $("delete-confirm").addEventListener("click", function () {
      executeDeleteArticle();
    });

    modal.addEventListener("click", function (e) {
      if (e.target === modal && !deleteInProgress) closeDeleteModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || deleteInProgress) return;
      if (!modal.classList.contains("hidden")) {
        closeDeleteModal();
        return;
      }
      var form = $("article-form");
      if (form && !form.classList.contains("hidden")) {
        // 不強制關閉編輯器，避免誤觸丟內容；僅關閉刪除 modal
      }
    });
  }

  async function executeDeleteArticle() {
    var id = $("f-id").value;
    if (!id || deleteInProgress) return;
    var expected = ($("delete-expected-title").textContent || "").trim();
    var typed = ($("delete-confirm-input").value || "").trim();
    if (typed !== expected) {
      msg("form-msg", "標題不符，請重新輸入以確認刪除", "err");
      return;
    }

    deleteInProgress = true;
    var btnDel = $("btn-delete");
    var btnConfirm = $("delete-confirm");
    var prevDelText = btnDel ? btnDel.textContent : "";
    if (btnDel) { btnDel.disabled = true; btnDel.textContent = "刪除中…"; }
    if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.innerHTML = '<span class="spinner-inline"></span> 刪除中…'; }
    ["delete-cancel-1", "delete-continue", "delete-back"].forEach(function (bid) {
      var b = $(bid); if (b) b.disabled = true;
    });

    var res = await client.from("articles").delete().eq("id", id);

    deleteInProgress = false;
    if (btnDel) { btnDel.disabled = false; btnDel.textContent = prevDelText; }
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "確認永久刪除"; }
    ["delete-cancel-1", "delete-continue", "delete-back"].forEach(function (bid) {
      var b = $(bid); if (b) b.disabled = false;
    });

    if (res.error) {
      msg("form-msg", "刪除失敗：" + res.error.message, "err");
      return;
    }
    closeDeleteModal();
    closeForm(true);
    msg("global-msg", "文章已永久刪除", "ok");
    setTimeout(function () { msg("global-msg", ""); }, 2500);
    loadArticles();
  }

  // ---------- 區塊文字 ----------
  function sectionMeta(key) {
    return SECTION_META[key] || {
      title: key,
      desc: "自訂區塊文字",
      mode: "text",
    };
  }

  function escapeHtml(s) {
    return window.SB && window.SB.escapeText
      ? window.SB.escapeText(s)
      : String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
  }

  function updateSectionPreview() {
    var preview = $("sec-preview");
    var ta = $("sec-value");
    if (!preview || !ta) return;
    var meta = sectionMeta(activeSectionKey || "");
    var val = ta.value || "";
    if (!val.trim()) {
      preview.innerHTML = "";
      return;
    }
    if (meta.mode === "markdown" && window.SB && typeof window.SB.renderMarkdown === "function") {
      preview.innerHTML = window.SB.renderMarkdown(val);
      preview.className = "sec-preview markdown-body";
    } else {
      preview.innerHTML = escapeHtml(val).replace(/\n/g, "<br />");
      preview.className = "sec-preview";
    }
  }

  function renderSectionsNav() {
    var box = $("sections-list");
    var empty = $("sections-nav-empty");
    if (!box) return;
    box.innerHTML = "";
    if (!sectionsCache.length) {
      if (empty) {
        empty.classList.remove("hidden");
        empty.textContent = "尚無區塊資料（可先套用 0001 SQL 的種子）。";
      }
      return;
    }
    if (empty) empty.classList.add("hidden");
    sectionsCache.forEach(function (r) {
      var meta = sectionMeta(r.key);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sec-nav-item" + (r.key === activeSectionKey ? " active" : "");
      btn.setAttribute("data-sec-key", r.key);
      var snip = String(r.value || "").replace(/\s+/g, " ").trim().slice(0, 48);
      btn.innerHTML =
        '<span class="sec-nav-title">' + escapeHtml(meta.title) + "</span>" +
        '<span class="sec-nav-snip">' + escapeHtml(snip || "（空白）") + "</span>";
      btn.addEventListener("click", function () { openSectionEditor(r.key); });
      box.appendChild(btn);
    });
  }

  function openSectionEditor(key) {
    if (sectionDirty && activeSectionKey && activeSectionKey !== key) {
      if (!window.confirm("目前區塊有未儲存變更，確定切換？")) return;
    }
    var row = sectionsCache.find(function (r) { return r.key === key; });
    if (!row) return;
    activeSectionKey = key;
    sectionDirty = false;
    var meta = sectionMeta(key);
    var editor = $("sections-editor");
    var placeholder = $("sections-placeholder");
    if (editor) editor.classList.remove("hidden");
    if (placeholder) placeholder.classList.add("hidden");
    if ($("sec-title")) $("sec-title").textContent = meta.title;
    if ($("sec-desc")) $("sec-desc").textContent = meta.desc;
    if ($("sec-key")) $("sec-key").textContent = key;
    if ($("sec-value")) $("sec-value").value = row.value || "";
    if ($("sec-status")) $("sec-status").textContent = "";
    updateSectionPreview();
    renderSectionsNav();
  }

  async function saveActiveSection() {
    if (!activeSectionKey) return;
    var ta = $("sec-value");
    var btn = $("btn-sec-save");
    if (!ta) return;
    if (btn) btn.disabled = true;
    if ($("sec-status")) $("sec-status").textContent = "儲存中…";
    var up = await client.from("site_sections").update({ value: ta.value }).eq("key", activeSectionKey);
    if (btn) btn.disabled = false;
    if (up.error) {
      if ($("sec-status")) $("sec-status").textContent = "儲存失敗：" + up.error.message;
      msg("global-msg", "儲存失敗：" + up.error.message, "err");
      return;
    }
    sectionsCache.forEach(function (r) {
      if (r.key === activeSectionKey) r.value = ta.value;
    });
    sectionDirty = false;
    if ($("sec-status")) $("sec-status").textContent = "已儲存 ✔";
    msg("global-msg", "已儲存區塊 " + activeSectionKey + " ✔", "ok");
    setTimeout(function () { msg("global-msg", ""); }, 2500);
    renderSectionsNav();
  }

  async function loadSections() {
    var empty = $("sections-nav-empty");
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "載入中…";
    }
    var list = $("sections-list");
    if (list) list.innerHTML = "";
    var res = await client.from("site_sections").select("key,value").order("key");
    if (res.error) {
      if (empty) empty.textContent = "讀取失敗：" + res.error.message;
      return;
    }
    sectionsCache = res.data || [];
    activeSectionKey = null;
    sectionDirty = false;
    if ($("sections-editor")) $("sections-editor").classList.add("hidden");
    if ($("sections-placeholder")) $("sections-placeholder").classList.remove("hidden");
    renderSectionsNav();
  }

  // ---------- 進入後台 ----------
  async function enterAdmin(user) {
    show("view-admin");
    $("who").textContent = "管理員：" + (user.email || "");
    $("btn-logout").classList.remove("hidden");
    loadArticles();
    loadSections();
  }

  async function refreshView() {
    if (!window.SB || !window.SB.isConfigured()) { show("view-unconfigured"); return; }
    client = window.SB.client();
    var hint = $("login-hint");
    if (hint) hint.textContent = "";
    var guestHint = $("guest-hint");
    if (guestHint) guestHint.textContent = "";

    var user = null;
    try {
      user = await window.SBAuth.getUser();
    } catch (e) {
      console.warn("[admin] getUser failed:", e);
      if (hint) hint.textContent = "讀取登入狀態失敗，請按「清除登入資料後重登」。";
      show("view-login");
      $("who").textContent = "";
      $("btn-logout").classList.add("hidden");
      return;
    }
    if (!user) {
      show("view-login");
      $("who").textContent = "";
      $("btn-logout").classList.add("hidden");
      return;
    }
    var admin = false;
    try {
      admin = await window.SBAuth.isAdmin();
    } catch (e2) {
      console.warn("[admin] isAdmin failed:", e2);
    }
    if (!admin) {
      show("view-guest");
      $("who").textContent = "訪客：" + (user.email || "");
      $("btn-logout").classList.remove("hidden");
      if (guestHint) {
        guestHint.textContent =
          "目前登入：" + (user.email || "（無 email）") +
          "。若你確定是管理員帳號卻看到這頁，請清除登入資料後用 jay0975008815@gmail.com 重登。";
      }
      return;
    }
    enterAdmin(user);
  }

  function bindClearAuthButtons() {
    function onClear() {
      if (!window.SBAuth || !window.SBAuth.clearLocalAuthAndReload) return;
      if (!confirm("將清除本機主站登入資料並重新整理，接著請再用管理員 Google 帳號登入。繼續？")) return;
      window.SBAuth.clearLocalAuthAndReload();
    }
    var a = $("btn-clear-auth");
    var b = $("btn-clear-auth-guest");
    if (a) a.addEventListener("click", onClear);
    if (b) b.addEventListener("click", onClear);
  }

  // ---------- 事件綁定 ----------
  function bind() {
    bindClearAuthButtons();
    var g = $("btn-google");
    if (g) g.addEventListener("click", function () {
      window.SBAuth.signInWithGoogle(window.location.href.split("#")[0]);
    });
    var lo = $("btn-logout");
    if (lo) lo.addEventListener("click", async function () { await window.SBAuth.signOut(); refreshView(); });

    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        var tab = t.getAttribute("data-tab");
        $("tab-articles").classList.toggle("hidden", tab !== "articles");
        $("tab-sections").classList.toggle("hidden", tab !== "sections");
      });
    });

    $("list-section").addEventListener("change", loadArticles);
    if ($("list-status")) $("list-status").addEventListener("change", function () { renderArticleList(articlesCache); });
    if ($("list-search")) {
      $("list-search").addEventListener("input", function () { renderArticleList(articlesCache); });
    }
    $("btn-new").addEventListener("click", function () { openForm(null); });
    $("btn-cancel").addEventListener("click", function () { closeForm(false); });
    $("btn-save").addEventListener("click", saveArticle);
    $("btn-delete").addEventListener("click", openDeleteModal);
    bindDeleteModal();

    var toolbar = $("md-toolbar");
    if (toolbar) {
      toolbar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-md]");
        if (!btn) return;
        applyMdTool(btn.getAttribute("data-md"));
      });
    }

    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setEditorMode(btn.getAttribute("data-editor-mode"));
      });
    });

    document.addEventListener("keydown", function (e) {
      var form = $("article-form");
      var editorOpen = form && !form.classList.contains("hidden");
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        if (editorOpen) {
          e.preventDefault();
          saveArticle();
          return;
        }
        if (activeSectionKey && $("tab-sections") && !$("tab-sections").classList.contains("hidden")) {
          e.preventDefault();
          saveActiveSection();
        }
        return;
      }
      if (editorOpen) handleBodyTab(e);
    });

    window.addEventListener("beforeunload", function (e) {
      if (!formDirty && !sectionDirty) return;
      e.preventDefault();
      e.returnValue = "";
    });

    if ($("btn-sec-save")) {
      $("btn-sec-save").addEventListener("click", saveActiveSection);
    }
    if ($("sec-value")) {
      $("sec-value").addEventListener("input", function () {
        sectionDirty = true;
        updateSectionPreview();
      });
    }

    var parseBtn = $("btn-parse-paste");
    function runParse(showPreview) {
      var raw = ($("paste-blob").value || "").trim();
      if (!raw) {
        $("paste-status").textContent = "請先貼上內容";
        lastParsed = null;
        if ($("btn-apply-paste")) $("btn-apply-paste").disabled = true;
        return null;
      }
      var opts = {
        section: ($("import-section") && $("import-section").value) || "literature",
        lengthPreference: ($("import-length") && $("import-length").value) || "auto",
      };
      var parsed = parseArticleBlob(raw, opts);
      if (!parsed.title && !parsed.body) {
        $("paste-status").textContent = "無法辨識標題或內文";
        lastParsed = null;
        if ($("btn-apply-paste")) $("btn-apply-paste").disabled = true;
        return null;
      }
      lastParsed = parsed;
      if (showPreview !== false) showImportPreview(parsed);
      if ($("btn-apply-paste")) $("btn-apply-paste").disabled = false;
      $("paste-status").textContent =
        "已整理：" + (parsed.title || "（無標題）") +
        " · " + (parsed.category || lengthLabel(parsed.lengthKind)) +
        " · 標籤空白（可選）";
      return parsed;
    }
    if (parseBtn) {
      parseBtn.addEventListener("click", function () { runParse(true); });
    }
    var applyPaste = $("btn-apply-paste");
    if (applyPaste) {
      applyPaste.addEventListener("click", function () {
        var parsed = lastParsed || runParse(true);
        if (!parsed) {
          $("paste-status").textContent = "請先貼上內容";
          return;
        }
        applyParsedArticle(parsed);
        $("paste-status").textContent = "已進大編輯；左側寫 Markdown，右側看排版，改完再儲存";
      });
    }
    
    if ($("btn-ai-analyze")) {
      $("btn-ai-analyze").addEventListener("click", function () { runAiAnalyze("analyze_and_format"); });
    }
    if ($("btn-ai-meta-only")) {
      $("btn-ai-meta-only").addEventListener("click", function () { runAiAnalyze("metadata_only"); });
    }
    if ($("btn-ai-apply-all")) {
      $("btn-ai-apply-all").addEventListener("click", function () { applyAiAnalysis("all"); });
    }
    if ($("btn-ai-apply-meta")) {
      $("btn-ai-apply-meta").addEventListener("click", function () { applyAiAnalysis("meta"); });
    }
    if ($("btn-ai-apply-body")) {
      $("btn-ai-apply-body").addEventListener("click", function () { applyAiAnalysis("body"); });
    }
    if ($("btn-ai-discard")) {
      $("btn-ai-discard").addEventListener("click", function () {
        lastAiAnalysis = null;
        if ($("ai-review-panel")) $("ai-review-panel").classList.add("hidden");
        setAiStatus("已放棄 AI 建議");
      });
    }
var quickDraft = $("btn-quick-draft");
    if (quickDraft) {
      quickDraft.addEventListener("click", async function () {
        var parsed = runParse(true);
        if (!parsed) return;
        quickDraft.disabled = true;
        $("paste-status").textContent = "儲存草稿中…";
        try {
          await quickSaveDraft(parsed);
          $("paste-status").textContent = "已存成草稿 ✔（分類：" + (parsed.category || "自動") + "）— 可在大編輯繼續改";
        } catch (e) {
          $("paste-status").textContent = "儲存失敗";
        }
        quickDraft.disabled = false;
      });
    }
    var clearPaste = $("btn-clear-paste");
    if (clearPaste) {
      clearPaste.addEventListener("click", function () {
        $("paste-blob").value = "";
        $("paste-status").textContent = "";
        lastParsed = null;
        if ($("btn-apply-paste")) $("btn-apply-paste").disabled = true;
        var box = $("import-preview");
        if (box) box.classList.add("hidden");
      });
    }

    function setImportSection(sec) {
      if (!sec) return;
      if ($("import-section")) $("import-section").value = sec;
      if ($("list-section")) $("list-section").value = sec;
      var pick = $("section-pick");
      if (pick) {
        Array.prototype.forEach.call(pick.querySelectorAll("[data-section]"), function (btn) {
          var on = btn.getAttribute("data-section") === sec;
          btn.classList.toggle("is-selected", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
      refreshCategoryList();
    }

    var sectionPick = $("section-pick");
    if (sectionPick) {
      sectionPick.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-section]");
        if (!btn) return;
        setImportSection(btn.getAttribute("data-section"));
        loadArticles();
      });
      setImportSection(($("import-section") && $("import-section").value) || "notes");
    } else if ($("import-section") && $("list-section")) {
      $("import-section").addEventListener("change", function () {
        $("list-section").value = $("import-section").value;
      });
    }

    if ($("bulk-select-all")) {
      $("bulk-select-all").addEventListener("change", function () {
        var on = !!$("bulk-select-all").checked;
        Array.prototype.forEach.call(document.querySelectorAll(".bulk-check"), function (cb) {
          cb.checked = on;
          var row = cb.closest(".list-item");
          var id = row && row.getAttribute("data-id");
          if (!id) return;
          if (on) selectedIds[id] = true;
          else delete selectedIds[id];
        });
        updateBulkUi();
      });
    }
    if ($("btn-bulk-apply")) {
      $("btn-bulk-apply").addEventListener("click", function () { applyBulkMetadata(); });
    }
    if ($("list-section")) {
      $("list-section").addEventListener("change", function () {
        selectedIds = {};
        if ($("bulk-select-all")) $("bulk-select-all").checked = false;
        refreshCategoryList();
      });
    }

    var tagBox = $("tag-suggestions");
    if (tagBox) {
      tagBox.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-tag]");
        if (!btn) return;
        addTagSuggestion(btn.getAttribute("data-tag"));
        markFormDirty();
      });
    }
    var catQuick = $("category-quick");
    if (catQuick) {
      catQuick.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-cat]");
        if (!btn) return;
        setCategoryQuick(btn.getAttribute("data-cat"));
      });
    }

    $("f-title").addEventListener("blur", function () {
      if (!$("f-slug").value.trim() && $("f-title").value.trim()) {
        $("f-slug").value = slugify($("f-title").value);
      }
      updateFormChrome();
    });
    if ($("f-body")) {
      $("f-body").addEventListener("input", function () {
        markFormDirty();
        updateLengthHint();
        scheduleMdPreview();
      });
      $("f-body").addEventListener("paste", function (e) {
        var file = clipboardImageFile(e.clipboardData);
        if (!file) return;
        e.preventDefault();
        uploadImagesIntoBody([file]);
      });
    }

    var writePane = $("editor-pane-write");
    if (writePane) {
      writePane.addEventListener("dragover", function (e) {
        if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (t) {
          return t === "Files";
        })) {
          e.preventDefault();
          writePane.classList.add("is-drop-target");
        }
      });
      writePane.addEventListener("dragleave", function () {
        writePane.classList.remove("is-drop-target");
      });
      writePane.addEventListener("drop", function (e) {
        writePane.classList.remove("is-drop-target");
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        var imgs = Array.prototype.filter.call(files, function (f) {
          return /^image\//.test(f.type);
        });
        if (!imgs.length) return;
        e.preventDefault();
        uploadImagesIntoBody(imgs);
      });
    }

    var bodyImageFile = $("body-image-file");
    if (bodyImageFile) {
      bodyImageFile.addEventListener("change", function (e) {
        var files = Array.from(e.target.files || []);
        if (files.length) uploadImagesIntoBody(files);
        e.target.value = "";
      });
    }
    if ($("f-category")) $("f-category").addEventListener("change", function () {
      markFormDirty();
      syncCategoryChips();
      updateFormChrome();
    });
    ["f-title", "f-slug", "f-summary", "f-tags", "f-pdf", "f-category", "f-cover", "f-sort"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", function () {
        markFormDirty();
        if (id === "f-title" || id === "f-category" || id === "f-slug") {
          if (id === "f-category") syncCategoryChips();
          updateFormChrome();
        }
      });
    });
    if ($("f-status")) $("f-status").addEventListener("change", function () {
      markFormDirty();
      updateFormChrome();
    });
    $("f-section").addEventListener("change", function () {
      markFormDirty();
      refreshCategoryList();
      updateFormChrome();
    });
    $("f-cover").addEventListener("input", function () {
      var v = $("f-cover").value.trim();
      if (v) { $("cover-thumb").src = v; $("cover-thumb").classList.remove("hidden"); }
      else $("cover-thumb").classList.add("hidden");
    });
    var clearCoverBtn = $("btn-clear-cover");
    if (clearCoverBtn) {
      clearCoverBtn.addEventListener("click", function () {
        $("f-cover").value = "";
        $("cover-thumb").classList.add("hidden");
        $("cover-thumb").removeAttribute("src");
        $("cover-status").textContent = "已清除封面（儲存後生效）";
        var fileInput = $("cover-file");
        if (fileInput) fileInput.value = "";
      });
    }

    async function setCoverFromFile(file) {
      if (!file || !/^image\//.test(file.type)) return;
      var status = $("cover-status");
      if (status) status.innerHTML = '<span class="spinner-inline"></span> 上傳封面中…';
      try {
        var urlStr = await uploadImage(file, ($("f-section") && $("f-section").value) || "notes");
        $("f-cover").value = urlStr;
        $("cover-thumb").src = urlStr;
        $("cover-thumb").classList.remove("hidden");
        mediaUploadedUnsaved = true;
        if (status) status.textContent = "✓ 封面已上傳 · ● 文章尚未儲存";
        markFormDirty();
      } catch (err) {
        if (status) status.textContent = "失敗：" + (err.message || err);
      }
    }

    $("cover-file").addEventListener("change", async function (e) {
      var file = e.target.files[0]; if (!file) return;
      await setCoverFromFile(file);
      e.target.value = "";
    });

    var coverInput = $("f-cover");
    if (coverInput) {
      coverInput.addEventListener("paste", function (e) {
        var file = clipboardImageFile(e.clipboardData);
        if (!file) return;
        e.preventDefault();
        setCoverFromFile(file);
      });
    }

    var coverDrop = $("cover-drop");
    if (coverDrop) {
      coverDrop.addEventListener("dragover", function (e) {
        if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (t) {
          return t === "Files";
        })) {
          e.preventDefault();
          coverDrop.classList.add("is-drop-target");
        }
      });
      coverDrop.addEventListener("dragleave", function () {
        coverDrop.classList.remove("is-drop-target");
      });
      coverDrop.addEventListener("drop", function (e) {
        coverDrop.classList.remove("is-drop-target");
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        var img = null;
        for (var i = 0; i < files.length; i++) {
          if (/^image\//.test(files[i].type)) { img = files[i]; break; }
        }
        if (!img) return;
        e.preventDefault();
        setCoverFromFile(img);
      });
    }

    $("more-file").addEventListener("change", async function (e) {
      var files = Array.from(e.target.files || []); if (!files.length) return;
      $("more-status").innerHTML = '<span class="spinner-inline"></span> 上傳中…';
      for (var i = 0; i < files.length; i++) {
        try {
          var urlStr = await uploadImage(files[i], $("f-section").value);
          currentImages.push({ src: urlStr, caption: "" });
        } catch (err) { $("more-status").textContent = "有檔案失敗：" + (err.message || err); }
      }
      renderImagesEditor();
      $("more-status").textContent = "完成 ✔";
      markFormDirty();
      e.target.value = "";
    });
  }

  

  // ---------- V3 AI editorial review ----------
  function setAiStatus(text, isErr) {
    var el = $("ai-status");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isErr ? "#f4708a" : "";
  }

  function renderAiReview(analysis, meta) {
    lastAiAnalysis = analysis;
    var panel = $("ai-review-panel");
    if (!panel) return;
    panel.classList.remove("hidden");
    function setText(id, v) { var el = $(id); if (el) el.textContent = v == null ? "—" : String(v); }
    setText("ai-r-title", analysis.title);
    setText("ai-r-show-title", analysis.show_title ? "顯示" : "隱藏");
    setText("ai-r-summary", analysis.summary || "（空）");
    setText("ai-r-show-summary", analysis.show_summary ? "顯示" : "隱藏");
    setText("ai-r-category", analysis.category);
    setText("ai-r-content-type", analysis.content_type);
    setText("ai-r-presentation", analysis.presentation);
    setText("ai-r-card-topic", analysis.card_topic || "（無）");
    setText("ai-r-card-label", analysis.card_label || "（無）");
    setText(
      "ai-r-show-card-label",
      typeof analysis.show_card_label === "boolean"
        ? analysis.show_card_label
          ? "顯示"
          : "隱藏"
        : analysis.card_label
          ? "顯示"
          : "—"
    );
    setText("ai-r-tags", (analysis.tags || []).join(", ") || "（無）");
    setText("ai-r-series", analysis.series || "（無）");
    setText("ai-r-edit-level", analysis.edit_level);
    setText("ai-r-state", analysis.editorial_state);
    setText("ai-r-confidence", String(analysis.confidence));
    setText("ai-r-reason", analysis.reason || "");
    setText("ai-r-flags", (analysis.flags || []).join(", ") || "（無）");
    setText("ai-r-review", analysis.human_review_required ? "需要人工確認" : "可快速採用");
    setText("ai-r-meta", meta ? ((meta.provider || "") + " / " + (meta.model || "") + " / " + (meta.analyzed_at || "")) : "");
    var bodyDiff = $("ai-r-body");
    if (bodyDiff) bodyDiff.value = analysis.clean_body || "";
    var warn = $("ai-r-warn");
    if (warn) {
      warn.textContent = analysis.human_review_required
        ? "此結果標記為需要人工確認，請逐項檢查後再採用。不會自動發佈。"
        : "請確認後再採用。AI 不會自動發佈。";
    }
  }

  function applyAiAnalysis(mode) {
    if (!lastAiAnalysis) {
      setAiStatus("沒有可採用的 AI 結果", true);
      return;
    }
    var a = lastAiAnalysis;
    if (mode === "all" || mode === "meta" || mode === "taxonomy") {
      if (a.title != null) $("f-title").value = a.title;
      if ($("f-show-title")) $("f-show-title").checked = !!a.show_title;
      if (a.summary != null) $("f-summary").value = a.summary;
      if ($("f-show-summary")) $("f-show-summary").checked = !!a.show_summary;
      if (a.category) {
        $("f-category").value = normalizeCategory(a.category);
        syncCategoryChips();
      }
      if ($("f-content-type")) $("f-content-type").value = a.content_type || "";
      if ($("f-presentation")) $("f-presentation").value = a.presentation || "";
      if (a.tags && $("f-tags")) $("f-tags").value = a.tags.join(", ");
      if ($("f-series")) $("f-series").value = a.series || "";
      // Semantic card label ≠ author title — never write card_label into f-title
      if ($("f-card-topic") && a.card_topic != null) $("f-card-topic").value = a.card_topic;
      if ($("f-card-label") && a.card_label != null) $("f-card-label").value = a.card_label;
      if ($("f-show-card-label") && typeof a.show_card_label === "boolean") {
        $("f-show-card-label").checked = a.show_card_label;
      }
    }
    if ((mode === "all" || mode === "body") && a.clean_body != null) {
      $("f-body").value = a.clean_body;
      scheduleMdPreview();
    }
    if (a.ai_editorial || true) {
      // provenance stamped on next successful save via fields
    }
    markFormDirty();
    updateFormChrome();
    updateLengthHint();
    setAiStatus("已套用 AI 建議（" + mode + "）。請再按「儲存」；不會自動發佈。");
  }

  async function runAiAnalyze(mode) {
    if (!window.SBAiEditorial) {
      setAiStatus("AI 模組未載入", true);
      return;
    }
    setAiStatus("AI 分析中…");
    var article = {
      id: ($("f-id") && $("f-id").value) || null,
      title: ($("f-title") && $("f-title").value) || "",
      body: ($("f-body") && $("f-body").value) || "",
      category: ($("f-category") && $("f-category").value) || "",
      tags: (($("f-tags") && $("f-tags").value) || "").split(/[,，、]+/).map(function (t) { return t.trim(); }).filter(Boolean),
      cover: ($("f-cover") && $("f-cover").value) || null,
      images: currentImages,
      section: ($("f-section") && $("f-section").value) || "",
      summary: ($("f-summary") && $("f-summary").value) || "",
    };
    if (!article.body.trim()) {
      setAiStatus("請先貼上或填寫正文", true);
      return;
    }
    var res = await window.SBAiEditorial.analyzeArticle(article, mode || "analyze_and_format");
    if (!res.ok) {
      setAiStatus((res.unavailable ? "AI unavailable — " : "") + (res.error || "失敗") + "。請改為手動填寫，系統不會用字數規則猜測。", true);
      lastAiAnalysis = null;
      return;
    }
    renderAiReview(res.analysis, res.meta);
    setAiStatus("AI 分析完成。請審核後選擇採用方式。");
  }


document.addEventListener("DOMContentLoaded", function () {
    bind();
    refreshView();
    if (window.SBAuth && window.SB && window.SB.isConfigured()) {
      window.SBAuth.onChange(function () { refreshView(); });
    }
  });
})();
