/**
 * admin.js — 主網站後台 CMS 邏輯
 *
 * 權限模型：前端只是「介面顯示」，真正的權限由後端 RLS + is_admin() 決定。
 * 即使有人手動打開介面，沒有白名單身分，任何寫入 / 上傳都會被資料庫拒絕。
 */
(function () {
  "use strict";

  var CATEGORIES = {
    literature: ["隨想", "隨筆", "心得", "創作", "長文"],
    notes: ["資訊安全", "機器學習", "程式語言", "人文", "隨想", "長文"],
  };
  var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  var SHORT_CHARS = 450;
  var LONG_CHARS = 2200;

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
    var path = (section || "misc") + "/" + Date.now() + "-" + rand + "." + out.ext;
    var up = await client.storage.from(bucket).upload(path, out.blob, {
      contentType: out.type, upsert: false,
    });
    if (up.error) throw up.error;
    var pub = client.storage.from(bucket).getPublicUrl(path);
    return pub.data.publicUrl;
  }

  // ---------- 分類 datalist ----------
  function refreshCategoryList() {
    var section = $("f-section").value;
    var dl = $("category-list");
    dl.innerHTML = (CATEGORIES[section] || [])
      .map(function (c) { return '<option value="' + c + '"></option>'; })
      .join("");
  }

  // ---------- 文章清單 ----------
  async function loadArticles() {
    var section = $("list-section").value;
    var listEl = $("article-list");
    listEl.innerHTML = '<p class="muted"><span class="spinner-inline"></span> 載入中…</p>';
    var res = await client
      .from("articles")
      .select("id,title,slug,category,status,updated_at,section,sort_index")
      .eq("section", section)
      .order("sort_index", { ascending: false })
      .order("updated_at", { ascending: false });
    if (res.error) { listEl.innerHTML = '<p class="muted">讀取失敗：' + res.error.message + "</p>"; return; }
    var rows = res.data || [];
    if (!rows.length) { listEl.innerHTML = '<p class="muted">此分區尚無文章。</p>'; return; }
    listEl.innerHTML = "";
    rows.forEach(function (a) {
      var div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML =
        '<div class="meta"><h4>' + window.SB.escapeText(a.title) + "</h4>" +
        '<small>' + window.SB.escapeText(a.category || "—") + " · " +
        window.SB.escapeText((a.updated_at || "").slice(0, 10)) + " · " +
        '<span class="badge ' + a.status + '">' + a.status + "</span></small></div>";
      var btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "編輯";
      btn.addEventListener("click", function () { openForm(a.id); });
      div.appendChild(btn);
      listEl.appendChild(div);
    });
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
  }

  function markFormDirty() {
    formDirty = true;
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
    else if (action === "image") wrapSelection("![", "](https://)", "圖說");
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
    currentImages = [];
    renderImagesEditor();
    refreshCategoryList();
    msg("form-msg", "");
    updateMdPreview();
  }

  async function openForm(id) {
    resetForm();
    $("btn-delete").classList.toggle("hidden", !id);
    $("form-title").textContent = id ? "編輯文章" : "新增文章";
    showEditor();
    if (id) {
      var res = await client.from("articles").select("*").eq("id", id).single();
      if (res.error) { msg("form-msg", "讀取失敗：" + res.error.message, "err"); return; }
      var a = res.data;
      $("f-id").value = a.id;
      $("f-section").value = a.section;
      $("f-status").value = a.status;
      $("f-category").value = normalizeCategory(a.category || "");
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
    if (forced === "short") return "short";
    if (forced === "long") return "long";
    var n = String(body || "").replace(/\s+/g, "").length;
    if (n <= SHORT_CHARS) return "short";
    if (n >= LONG_CHARS) return "long";
    return "medium";
  }

  function lengthLabel(kind) {
    if (kind === "short") return "隨想";
    if (kind === "long") return "長文";
    return "中篇";
  }

  function normalizeCategory(cat) {
    var c = String(cat || "").trim();
    if (c === "短思") return "隨想";
    return c;
  }

  function isThoughtCategory(cat) {
    var c = normalizeCategory(cat);
    return c === "隨想";
  }

  function todayThoughtTitle() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day + " 隨想";
  }

  function firstSentenceTitle(text) {
    var plain = plainSummary(text).replace(/^["「『]|["」』]$/g, "");
    if (!plain) return "";
    var cut = plain.split(/[。！？\n.!?\u2026]/)[0] || plain;
    cut = cut.trim().slice(0, 48);
    return cut;
  }

  function ensureThoughtTitle(out) {
    var title = String(out.title || "").trim();
    var weak = !title || title === "未命名匯入" || /^https?:\/\//i.test(title);
    if (!weak) return;
    if (out.lengthKind === "short" || isThoughtCategory(out.category)) {
      var fromBody = firstSentenceTitle(out.body || out.summary || "");
      out.title = fromBody || todayThoughtTitle();
    } else if (!title) {
      out.title = firstSentenceTitle(out.body) || todayThoughtTitle();
    }
  }

  function updateLengthHint() {
    var el = $("length-hint");
    if (!el) return;
    var body = ($("f-body") && $("f-body").value) || "";
    var kind = detectLengthKind(body, "auto");
    var n = String(body).replace(/\s+/g, "").length;
    el.textContent = n
      ? ("篇幅提示：" + lengthLabel(kind) + "（約 " + n + " 字）— 抱怨／碎念 → 隨想；HackMD／長筆記 → 長文。")
      : "";
  }

  function addTagSuggestion(tag) {
    var input = $("f-tags");
    if (!input || !tag) return;
    var cur = input.value.split(/[,，、]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    if (cur.indexOf(tag) !== -1) return;
    cur.push(tag);
    input.value = cur.join(", ");
  }

  function setCategoryQuick(cat) {
    var input = $("f-category");
    if (!input) return;
    input.value = normalizeCategory(cat);
  }

  function ensureCategoryOnSave() {
    var cat = normalizeCategory($("f-category").value);
    if (cat) {
      $("f-category").value = cat;
      return cat;
    }
    var body = ($("f-body") && $("f-body").value) || "";
    var kind = detectLengthKind(body, "auto");
    var section = ($("f-section") && $("f-section").value) || "literature";
    if (kind === "short") cat = "隨想";
    else if (kind === "long") cat = section === "notes" ? "人文" : "長文";
    else cat = section === "notes" ? "人文" : "隨筆";
    $("f-category").value = cat;
    return cat;
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
      if (/note|筆記|學科/i.test(v)) out.section = "notes";
      else if (/liter|文學|隨筆/i.test(v)) out.section = "literature";
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
      var end = text.indexOf("\n---", 3);
      if (end !== -1) {
        text.slice(3, end).split("\n").forEach(function (line) {
          var m = line.match(/^([^\s:#]+)\s*[:：]\s*(.+)$/);
          if (m) parseMetaLine(m[1], m[2].replace(/^["']|["']$/g, ""), out);
        });
        text = text.slice(end + 4).trim();
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
      if (!out.title && line.length < 120) {
        out.title = line.replace(/^["「『]|["」』]$/g, "");
        bodyStart = i + 1;
        break;
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

    if (!out.category) {
      var sectionGuess = out.section || opts.section || ($("import-section") && $("import-section").value) || ($("f-section") && $("f-section").value) || "literature";
      // 只認明確寫在 meta 的分類；內文出現「心得」等字不硬猜，避免誤標
      if (out.lengthKind === "short") out.category = "隨想";
      else if (out.lengthKind === "long") out.category = sectionGuess === "notes" ? "人文" : "長文";
      else out.category = sectionGuess === "notes" ? "人文" : "隨筆";
    }

    if (!out.section) {
      out.section = opts.section || ($("import-section") && $("import-section").value) || "literature";
    }
    if (!out.status) out.status = "draft";
    ensureThoughtTitle(out);
    if (!out.slug && out.title) out.slug = slugify(out.title);
    if (!out.slug) out.slug = "import-" + Date.now().toString(36);
    if (!out.summary) out.summary = plainSummary(out.body).slice(0, 120);
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
      " · 分類 " + (parsed.category || "自動") +
      " · 標籤 " + ((parsed.tags && parsed.tags.length) ? parsed.tags.join(", ") : "空白（可選）") +
      " · slug " + (parsed.slug || "—") +
      (parsed.cover ? " · 已抓到封面圖" : "") +
      (parsed.images && parsed.images.length ? (" · 另 " + parsed.images.length + " 張圖") : "");
    var hint = $("preview-hint");
    if (hint) {
      hint.textContent = isThoughtCategory(parsed.category)
        ? "已當成「隨想」：抱怨／碎念／突然的想法都適合這裡。標題可之後再改。"
        : "分類已自動填好；若想改成隨想或長文，進大編輯後點一鍵即可。";
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
    if (!title) {
      var kind = detectLengthKind(bodyVal, "auto");
      title = (kind === "short" ? firstSentenceTitle(bodyVal) : "") || todayThoughtTitle();
      $("f-title").value = title;
    }
    var slug = $("f-slug").value.trim() || slugify(title);
    if (!title) { msg("form-msg", "請填標題", "err"); return; }
    if (!slug) { msg("form-msg", "請填 slug", "err"); return; }
    $("f-slug").value = slug;

    var category = ensureCategoryOnSave();
    var tags = $("f-tags").value.split(/[,，、]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var payload = {
      section: $("f-section").value,
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
    };

    $("btn-save").disabled = true;
    msg("form-msg", '<span class="spinner-inline"></span> 儲存中…', "ok");
    var res;
    if (id) res = await client.from("articles").update(payload).eq("id", id).select().single();
    else res = await client.from("articles").insert(payload).select().single();
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
    $("btn-delete").classList.remove("hidden");
    $("form-title").textContent = "編輯文章";
    captureFormSnapshot();
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

    if ($("import-section") && $("list-section")) {
      $("import-section").addEventListener("change", function () {
        $("list-section").value = $("import-section").value;
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
        markFormDirty();
      });
    }

    $("f-title").addEventListener("blur", function () {
      if (!$("f-slug").value.trim() && $("f-title").value.trim()) {
        $("f-slug").value = slugify($("f-title").value);
      }
    });
    if ($("f-body")) {
      $("f-body").addEventListener("input", function () {
        markFormDirty();
        updateLengthHint();
        scheduleMdPreview();
      });
    }
    ["f-title", "f-slug", "f-summary", "f-tags", "f-pdf", "f-category", "f-cover", "f-sort"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", markFormDirty);
    });
    if ($("f-status")) $("f-status").addEventListener("change", markFormDirty);
    $("f-section").addEventListener("change", function () {
      markFormDirty();
      refreshCategoryList();
    });
    $("f-cover").addEventListener("input", function () {
      var v = $("f-cover").value.trim();
      if (v) { $("cover-thumb").src = v; $("cover-thumb").classList.remove("hidden"); }
      else $("cover-thumb").classList.add("hidden");
    });

    $("cover-file").addEventListener("change", async function (e) {
      var file = e.target.files[0]; if (!file) return;
      $("cover-status").innerHTML = '<span class="spinner-inline"></span> 上傳中…';
      try {
        var urlStr = await uploadImage(file, $("f-section").value);
        $("f-cover").value = urlStr;
        $("cover-thumb").src = urlStr; $("cover-thumb").classList.remove("hidden");
        $("cover-status").textContent = "已上傳 ✔";
        markFormDirty();
      } catch (err) { $("cover-status").textContent = "失敗：" + (err.message || err); }
      e.target.value = "";
    });

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

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    refreshView();
    if (window.SBAuth && window.SB && window.SB.isConfigured()) {
      window.SBAuth.onChange(function () { refreshView(); });
    }
  });
})();
