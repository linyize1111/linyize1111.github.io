/**
 * preview-fixture.js — deterministic draft for admin-preview / tests (no Supabase).
 */
(function () {
  "use strict";
  window.LYZ_PREVIEW_FIXTURE = {
    id: "fixture-preview-v8",
    section: "notes",
    title: "V8 Preview Fixture · 多圖展示",
    slug: "v8-preview-fixture",
    summary: "未儲存草稿也可預覽；驗證 adaptive gallery 與 public DOM 一致。",
    category: "筆記",
    tags: ["fixture", "gallery"],
    body:
      "# 開場\n\n這是一段正文，後面接著連續三張圖（應合併為 adaptive gallery）。\n\n" +
      "![一](https://picsum.photos/seed/lyz-a/960/640)\n\n" +
      "![二](https://picsum.photos/seed/lyz-b/720/900)\n\n" +
      "![三](https://picsum.photos/seed/lyz-c/1100/700)\n\n" +
      "中間插入一段文字，打斷圖組。\n\n" +
      "![四](https://picsum.photos/seed/lyz-d/800/800)\n\n" +
      "結尾文字。",
    content_type: "note",
    presentation: "article-lite",
    visibility: "public",
    show_title: true,
    show_summary: true,
    cover: "https://picsum.photos/seed/lyz-cover/1200/800",
    images: [
      { src: "https://picsum.photos/seed/lyz-i1/640/480", caption: "legacy 1" },
      { src: "https://picsum.photos/seed/lyz-i2/640/800", caption: "legacy 2" },
      { src: "https://picsum.photos/seed/lyz-i3/900/600", caption: "legacy 3" }
    ],
    ai_editorial: {
      display: {
        card_topic: "預覽測試",
        card_label: "Fixture",
        show_card_label: true
      }
    },
    status: "draft",
    published_at: null,
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-17T00:00:00.000Z",
    sort_index: 0
  };
})();
