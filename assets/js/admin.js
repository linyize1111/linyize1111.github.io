/**
 * admin.js — 主網站後台 CMS 邏輯
 *
 * 權限模型：前端只是「介面顯示」，真正的權限由後端 RLS + is_admin() 決定。
 * 即使有人手動打開介面，沒有白名單身分，任何寫入 / 上傳都會被資料庫拒絕。
 */
(function () {
  "use strict";

  var CATEGORIES = {
    literature: ["隨筆", "心得", "創作"],
    notes: ["資訊安全", "機器學習", "程式語言", "人文"],
  };
  var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

  var $ = function (id) { return document.getElementById(id); };
  var client = null;
  var currentImages = []; // [{src,caption}]

  // ---------- 訊息 ----------
  function msg(container, text, kind) {
    var el = typeof container === "string" ? $(container) : container;
    if (!el) return;
    if (!text) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="msg ' + (kind || "ok") + '">' + text + "</div>";
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
      cap.addEventListener("input", function () { currentImages[idx].caption = cap.value; });
      var del = document.createElement("button");
      del.className = "btn danger"; del.textContent = "移除";
      del.addEventListener("click", function () {
        currentImages.splice(idx, 1); renderImagesEditor();
      });
      row.appendChild(thumb); row.appendChild(cap); row.appendChild(del);
      box.appendChild(row);
    });
  }

  // ---------- 開啟 / 重置表單 ----------
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
  }

  async function openForm(id) {
    resetForm();
    $("article-form").classList.remove("hidden");
    $("btn-delete").classList.toggle("hidden", !id);
    $("form-title").textContent = id ? "編輯文章" : "新增文章";
    if (id) {
      var res = await client.from("articles").select("*").eq("id", id).single();
      if (res.error) { msg("form-msg", "讀取失敗：" + res.error.message, "err"); return; }
      var a = res.data;
      $("f-id").value = a.id;
      $("f-section").value = a.section;
      $("f-status").value = a.status;
      $("f-category").value = a.category || "";
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
    }
    $("article-form").scrollIntoView({ behavior: "smooth" });
  }

  function slugify(s) {
    return String(s || "").trim().toLowerCase()
      .replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "").slice(0, 120);
  }

  async function saveArticle() {
    var id = $("f-id").value;
    var title = $("f-title").value.trim();
    var slug = $("f-slug").value.trim() || slugify(title);
    if (!title) { msg("form-msg", "請填標題", "err"); return; }
    if (!slug) { msg("form-msg", "請填 slug", "err"); return; }

    var tags = $("f-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    var payload = {
      section: $("f-section").value,
      slug: slug,
      title: title,
      summary: $("f-summary").value.trim(),
      body: $("f-body").value,
      cover: $("f-cover").value.trim() || null,
      images: currentImages,
      category: $("f-category").value.trim() || null,
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
    loadArticles();
  }

  async function deleteArticle() {
    var id = $("f-id").value;
    if (!id) return;
    if (!confirm("確定刪除這篇文章？此動作無法復原。")) return;
    var res = await client.from("articles").delete().eq("id", id);
    if (res.error) { msg("form-msg", "刪除失敗：" + res.error.message, "err"); return; }
    $("article-form").classList.add("hidden");
    loadArticles();
  }

  // ---------- 區塊文字 ----------
  async function loadSections() {
    var box = $("sections-list");
    box.innerHTML = '<p class="muted"><span class="spinner-inline"></span> 載入中…</p>';
    var res = await client.from("site_sections").select("key,value").order("key");
    if (res.error) { box.innerHTML = '<p class="muted">讀取失敗：' + res.error.message + "</p>"; return; }
    var rows = res.data || [];
    box.innerHTML = "";
    if (!rows.length) { box.innerHTML = '<p class="muted">尚無區塊資料（可先套用 0001 SQL 的種子）。</p>'; }
    rows.forEach(function (r) {
      var wrap = document.createElement("div");
      wrap.className = "field full";
      var lab = document.createElement("label");
      lab.textContent = r.key;
      var ta = document.createElement("textarea");
      ta.style.minHeight = "80px"; ta.value = r.value || "";
      var btn = document.createElement("button");
      btn.className = "btn primary"; btn.textContent = "儲存此區塊";
      btn.style.marginTop = ".4rem";
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        var up = await client.from("site_sections").update({ value: ta.value }).eq("key", r.key);
        btn.disabled = false;
        msg("global-msg", up.error ? "儲存失敗：" + up.error.message : "已儲存區塊 " + r.key + " ✔", up.error ? "err" : "ok");
        setTimeout(function () { msg("global-msg", ""); }, 2500);
      });
      wrap.appendChild(lab); wrap.appendChild(ta); wrap.appendChild(btn);
      box.appendChild(wrap);
    });
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
    var user = await window.SBAuth.getUser();
    if (!user) { show("view-login"); $("who").textContent = ""; $("btn-logout").classList.add("hidden"); return; }
    var admin = await window.SBAuth.isAdmin();
    if (!admin) {
      show("view-guest");
      $("who").textContent = "訪客：" + (user.email || "");
      $("btn-logout").classList.remove("hidden");
      return;
    }
    enterAdmin(user);
  }

  // ---------- 事件綁定 ----------
  function bind() {
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
    $("btn-cancel").addEventListener("click", function () { $("article-form").classList.add("hidden"); });
    $("btn-save").addEventListener("click", saveArticle);
    $("btn-delete").addEventListener("click", deleteArticle);
    $("f-section").addEventListener("change", refreshCategoryList);
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
