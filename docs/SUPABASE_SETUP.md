# 主網站 CMS 建置手冊（linyize1111.github.io）

這份文件是「只有你能在控制台做」的步驟。開發端已完成的程式碼、SQL、前端後台都在 repo 裡，等你把下面幾件事做完就能端到端運作。

> 重要原則
> - 這是「全新、獨立」的 Supabase 專案，與 ACG（成人站）**完全隔離**，不共用資料、金鑰或帳號設定。
> - 前端只放 **anon(public) key**（公開只讀）。**service_role key 永遠不要貼進任何前端檔案或 commit。**

---

## Blocker 0：提供管理員 Google 信箱（必要）

我在 repo 找不到現成的 ACG 管理員信箱（ACG 用的是資料庫角色，不是信箱白名單）。
請確認你要用哪個 **Google 登入信箱**當管理員。
網站目前對外聯絡信箱是 `jay0975008815@gmail.com`，若這就是你要用的管理員帳號請直接沿用；否則請提供正確信箱。

之後會用在 `0001_init.sql` 第 8 段的白名單 insert。

---

## 步驟 1：建立新的 Supabase 專案

1. 前往 <https://supabase.com/dashboard> → 右上 **New project**。
2. Organization 隨意；**Project name** 例如 `linyize-main-site`。
3. **Database Password**：產生一組強密碼並自己保存（不用進 repo）。
4. **Region**：選離台灣近的（如 `Northeast Asia (Tokyo)`）。
5. 建立後等資料庫 provisioning 完成。
6. 取得金鑰：左側 **Project Settings → API**（或 Data API / API Keys）
   - 複製 **Project URL**：`https://<your-ref>.supabase.co`
   - 複製 **anon public** key（很長的 JWT）
   - **service_role** key 先別動，只在步驟 5 匯入時可能用到，且用完即丟。

---

## 步驟 2：套用資料庫 schema（SQL）

在 Supabase Dashboard → 左側 **SQL Editor** → **New query**，依序貼上並各按 **Run**：

1. `supabase/migrations/0001_init.sql`
   - ⚠️ 執行前，把檔案第 8 段的白名單那兩行「取消註解」並改成你的信箱：
     ```sql
     insert into public.admins (email, note) values
       ('你的信箱@gmail.com', '主網站站長')
     on conflict (email) do nothing;
     ```
2. `supabase/migrations/0002_storage.sql`（建立 `article-images` bucket 與上傳權限）
3. （可選但建議）`supabase/migrations/0003_seed_articles.sql`
   - 這支把現有的 15 篇文學 / 筆記文章匯入資料庫。可安全重跑。
   - 若之後 md 有更新，可在 temp-pages 目錄重新產生：
     `powershell -ExecutionPolicy Bypass -File tools/gen_seed_sql.ps1`

> 驗證：SQL Editor 執行 `select count(*) from public.articles;` 應為 15（若跑了 0003）。
> 執行 `select public.is_admin();`（未登入）應回 `false`。

---

## 步驟 3：建立 Google OAuth Web Client（Google Cloud）

1. 前往 <https://console.cloud.google.com/> → 建立或選一個專案（可與 ACG 分開，較乾淨）。
2. 左側 **APIs & Services → OAuth consent screen**
   - User Type：**External** → 建立
   - App name、support email 填一填；Scopes 用預設（email、profile、openid 即可）
   - Test users 可加入你的信箱（若不發布到 Production）
3. 左側 **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type：**Web application**
   - Name：`linyize-main-site-web`
   - **Authorized JavaScript origins** 加入：
     - `https://linyize1111.github.io`
   - **Authorized redirect URIs** 加入（★ 用你步驟 1 的 ref ★）：
     - `https://<your-ref>.supabase.co/auth/v1/callback`
   - 建立後複製 **Client ID** 與 **Client Secret**。

> Client Secret 只會貼進 Supabase 後台（步驟 4），不進 repo。

---

## 步驟 4：在 Supabase 啟用 Google 登入

1. Supabase Dashboard → **Authentication → Sign In / Providers → Google** → 開啟 Enable。
2. 貼上步驟 3 的 **Client ID** 與 **Client Secret** → Save。
3. **Authentication → URL Configuration**：
   - **Site URL**：`https://linyize1111.github.io/`
   - **Redirect URLs** 新增：
     - `https://linyize1111.github.io/admin.html`
     - `https://linyize1111.github.io/`
     - （本機測試可另加 `http://localhost:8000/admin.html`）

---

## 步驟 5：把前端接上你的專案

編輯 `assets/js/supabase-config.js`，把兩個 placeholder 換成步驟 1 的值：

```js
window.SUPABASE_CONFIG = {
  url: "https://<your-ref>.supabase.co",   // ← Project URL
  anonKey: "eyJhbGciOi...很長的 anon key",   // ← anon public key（只讀，公開安全）
  bucket: "article-images",
};
```

存檔後 push（見下方 Git 區塊），GitHub Pages 幾分鐘後生效。

> 只要 config 還是 placeholder，全站維持現在的靜態行為，不會壞掉。填好後，
> 清單頁 / 文章頁 / 首頁區塊文字才會改成從資料庫動態讀取。

---

## 步驟 6：驗收

1. 開 `https://linyize1111.github.io/admin.html`
   - 用管理員 Google 帳號登入 → 應看到「文章管理 / 區塊文字」後台。
   - 用「非白名單」帳號登入 → 應顯示「你不是管理員」（只有訪客權限）。
2. 新增一篇測試文章 → 設為 published → 到 `literature.html` 或 `directory.html` 應看到它。
3. 上傳一張圖片 → 應成功且顯示縮圖（自動壓縮、限制 5MB / 圖片類型）。
4. 在「區塊文字」改首頁標語 → 首頁應更新。

---

## （選用）用 Node 匯入而非 SQL

若你有 Node，可改用 `tools/import_md_to_supabase.mjs`（需要 service key，用完即丟）：

```powershell
cd temp-pages
npm install @supabase/supabase-js
$env:SUPABASE_URL="https://<your-ref>.supabase.co"
$env:SUPABASE_SERVICE_KEY="<service_role_key>"   # 用完請關掉這個終端機視窗
node tools/import_md_to_supabase.mjs
```

---

## 殘餘風險（誠實說明）

已做的防護：RLS（僅白名單可寫、anon 只讀 published）、Storage 上傳限白名單、
`is_admin()` 後端判定（前端無法偽造權限）、後台 CSP、文章渲染用 DOMPurify 清理防 XSS、圖片壓縮與大小/類型限制。

但**沒有任何網站能保證絕對不被駭**，仍存在的風險與建議：

- **GitHub Pages 無法設定 HTTP 安全標頭**（CSP/HSTS 等只能靠 `<meta>`，且 meta 版 CSP 對公開頁較寬鬆）。若要更強防護，可改用 Cloudflare Pages / Netlify 之類能設 header 的平台。
- **anon key 外流是設計上可接受的**（本來就公開），真正的防線是 RLS。請務必確認 0001 的 RLS 有成功套用（`select`/`insert` 測試）。
- **管理員帳號本身被盜（釣魚、密碼外洩）** 仍會被入侵 → 請對管理員 Google 帳號開啟兩步驟驗證。
- **service_role key 一旦外流＝資料庫全開**。只在本機匯入時短暫使用、用完關視窗、永不進 repo/log。
- 依賴 jsDelivr CDN（supabase-js / marked / DOMPurify）→ 供應鏈風險。可考慮自行 vendoring 到 `assets/js/`。
- 公開頁目前為了相容既有大量 inline script，未套用嚴格 CSP；後台 `admin.html` 已套用較嚴格的 CSP。
