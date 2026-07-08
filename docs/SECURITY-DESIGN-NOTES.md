# 主站資安 × 美術決策筆記（2026-07）

> 依 Web 研究與程式自我審查整理。**不含任何 secret。**

## 研究摘要

### 資安（GitHub Pages + Supabase 靜態 CMS）

| 來源 | 採用決策 |
|------|----------|
| Supabase / OWASP / RFC 9700 | RLS 為唯一資料邊界；前端只用 anon key；service_role 永不進 repo |
| GitHub Pages 限制 | 無法設定 HTTP 安全標頭 → 以 `<meta CSP>` + Supabase Dashboard redirect 白名單 補強 |
| TinaCMS / Payload / Authentik CVE (2025–2026) | 所有 CMS 輸出走 DOMPurify；admin 訊息 escape；OAuth redirect 限同 origin |
| OAuth open redirect | `auth.js` 新增 `safeRedirectTo()`，拒絕跨域 redirect |

### 美術（玻璃擬態 + 游標 + 中文排版）

| 來源 | 採用決策 |
|------|----------|
| Glassmorphism 2024–2026 | 玻璃留給 nav / 控制列 / hero；長文區維持較不透明面板保可讀性 |
| 自訂游標 UX | 主游標 SVG + 白描邊 + drop-shadow；點擊 ripple ≥420ms + 光暈 + 掌印印章 |
| 中文部落格排版 | `clamp()` 流體字級、行高 1.72、卡片 16:10 封面、分類 tag pill |

---

## 本次程式變更（資安）

- **CSP meta**：公開頁 + admin（admin 已有，公開頁新增）
- **DOMPurify 加強**：禁 script/iframe/svg/math、禁事件 handler、URI 白名單
- **OAuth**：`safeRedirectTo()` 同 origin 校驗
- **CMS PDF 連結**：僅允許 `https:` URL
- **Analytics**：背景分頁不送 RPC（配合 RLS 每小時 120 次上限）
- **Admin msg()**：錯誤訊息 HTML escape

## 資安檢查表

| 項目 | 狀態 |
|------|------|
| 所有表 RLS 啟用 | ✅（0001_init.sql） |
| 前端無 service_role | ✅ |
| 公開只讀 published 文章 | ✅ RLS |
| admins 白名單前端不可寫 | ✅ |
| Markdown XSS → DOMPurify | ✅ 已加強 |
| OAuth redirect 同 origin | ✅ auth.js |
| Analytics 防灌水 RPC | ✅ DB 端 rate limit |
| CSP（meta） | ✅ 公開頁 + admin |
| Storage policy 僅 admin 上傳 | ✅ 0002_storage.sql |
| Supabase Auth redirect 白名單 | ⚠️ 需 Dashboard 手動確認 production URL |

## 殘餘風險（誠實）

1. **GitHub Pages 無 HTTP 標頭**：meta CSP 弱於 server header；`unsafe-inline` 仍允許 inline script（主題 FOUC、媒體控制）。
2. **Anon key 公開**：依設計可見；若 RLS 設定錯誤即全站資料外洩 → 需定期以 anon 身分測試。
3. **localStorage visitor_id**：可被清除重算；unique_visitors 為估算值非精確指紋。
4. **CDN 供應鏈**：marked / DOMPurify / supabase-js 來自 jsdelivr；SRI 尚未全面加上。
5. **KaTeX**：note 頁數學渲染增加 attack surface；已禁 svg/math 於 DOMPurify，但 KaTeX 自身需信任 CDN 版本。

## 美術變更摘要

- 貓掌游標 v2：零 Zdog 依賴，SVG + ripple/光暈/印章
- `site-custom.css`：typography tokens、卡片 16:10、按鈕 focus、tag pill
- `admin.css`：focus ring、卡片陰影、列表 hover
