# Bugfix Checklist

更新時間：2026-07-28（ACG v1.8.1 標籤合併）

## 本輪：ACG Portal v1.8.1

### 變更
- 遊戲評鑑編輯單：**類型標籤**與**標籤**合併為單一「標籤」欄（含類型／分類）。
- 儲存時 `tags`／`genres` 寫入同一陣列；讀取／列表／詳情合併顯示，舊資料不遺失。
- Steam／DLsite 自動填入 genres 併入同一標籤欄。
- Migration `0023_unify_game_tags_genres.sql`（backfill + RPC 雙欄同步）。

### 部署
- 源碼 repo：v1.8.1 commit + push
- 套用 migration：`0023_unify_game_tags_genres.sql`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.8.1`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.8.1**
2. 編輯評鑑：應只有一個「標籤」輸入；舊 genres／tags 合併出現
3. 詳情／列表不應再出現兩排重複標籤；分項評分不受影響

---

## 前輪：ACG Portal v1.8.0

### 變更
- 遊戲評鑑分項改為 **7 項**（劇情／美術／配音／系統／**實用性**／**氛圍**／**動態**），**全部可 N/A**。
- 釐清舊「表現力／演出」：`presentation`→`atmosphere`（氛圍＝音樂／UI／節奏）；`animation`→動態（純靜態請 N/A）。
- 新增尺規說明（表單小字＋`?` tooltip）；總分仍為有效分等權平均。
- Migration `0022_game_score_rubric_v2.sql`：schema／RPC／既有 JSON 遷移。
- 說明：`docs/GAME-REVIEW-SCORING.md`

### 部署
- 源碼 repo：v1.8.0 commit + push
- 套用 migration：`0022_game_score_rubric_v2.sql`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.8.0`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.8.0**
2. 編輯舊評鑑：應見「氛圍」承接舊表現力；「實用性」預設 N/A；每項有 N/A 與尺規
3. 新增評鑑：每項需打分或 N/A；至少一項有效分；Steam／DLsite 搜尋與封面仍正常
4. 公開頁分項列應顯示新標籤；總分略過 N/A

---

## 前輪：ACG Portal v1.7.1

### 變更
- 遊戲評鑑標題搜尋**只保留 Steam＋DLsite**；停用 Google CSE／DuckDuckGo／Wikipedia 網頁通用搜尋。
- UI 文案改為「搜尋 Steam／DLsite」；移除 CSE 設定提示。
- RPC：`admin_search_game_web`、`admin_search_provider_status`、`admin_fetch_game_metadata` hint 更新（migration `0021`）。
- 說明：`docs/GAME-REVIEW-AUTOFILL.md`

### 部署
- 源碼 repo：v1.7.1 commit + push
- 套用 migration：`0021_game_search_steam_dlsite_only.sql`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.7.1`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.7.1**
2. 管理員新增評鑑 → 填名稱 →「用上方名稱搜尋」→ 候選僅 Steam／DLsite
3. 「套用此筆」應填入標題／封面／來源等；分項分數仍手填
4. 進階 RJ／Steam URL 精確抓取仍可用；畫面上不應再出現 Google CSE 設定文案

---

## 前輪：ACG Portal v1.7.0

### 變更
- 遊戲評鑑自動填入主路徑改為 **Google／網頁搜尋標題 → 多來源候選 → 套用後抓頁面 metadata**。
- Provider：Google CSE（需 `GOOGLE_CSE_API_KEY`＋`GOOGLE_CSE_CX` 存 `internal.app_secrets`）；無 key 時 **Steam＋DuckDuckGo＋DLsite** 備援。
- 詳情：Steam `appdetails`、DLsite `product.json`、其他公開頁 og:*；盜版／網盤網域不抓內容。
- RPC：`admin_search_game_web`、`admin_upsert_app_secret`、`admin_search_provider_status`；強化 `admin_fetch_game_metadata`。
- 說明：`docs/GAME-REVIEW-AUTOFILL.md`

### 部署
- 源碼 repo：v1.7.0 commit + push
- 套用 migration：`0019`＋`0020`（web search＋Wikipedia 備援）
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.7.0`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.7.0**
2. 管理員新增評鑑 → 填名稱 →「用上方名稱搜尋」→ 候選可含 Steam／DLsite／其他來源徽章與 snippet
3. 「套用此筆」應填入標題／封面／來源等；分項分數仍手填
4. 進階 RJ／Steam URL 精確抓取仍可用

---

## 前輪：ACG Portal v1.6.0

### 變更
- 遊戲評鑑自動填入改以 **標題搜尋 → 候選確認** 為主路徑（名稱預填、「用上方名稱搜尋」、DLsite 店家徽章、空結果引導）。
- RJ／URL 保留為進階；精確命中仍預填但不填分數。
- RPC：`admin_fetch_game_metadata` soft empty + `hint`；normalize 加 `store`。
- 以圖搜圖：UI 預留（需 `SAUCENAO_API_KEY`，尚未啟用）。
- 說明：`docs/GAME-REVIEW-AUTOFILL.md`、決策見 `docs/GAME-REVIEW-SEARCH-FEASIBILITY.md`

### 部署
- 源碼 repo：v1.6.0 commit + push
- 套用 migration：`python-portable\python.exe tools/apply_migration.py supabase/migrations/0018_game_title_search_primary.sql --project-ref xpztpetskjohuxrpgmcm`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.6.0`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.6.0**
2. 管理員新增評鑑 → 填名稱 →「用上方名稱搜尋」→ 候選有封面／店家 →「套用此筆」
3. 空結果應出現改原名／URL 引導；分項分數仍為空白／手填
4. 貼 `RJ…` 進階路徑仍可預填，分數不自動帶入

---

## 前輪：ACG Portal v1.5.0

### 變更
- 遊戲評鑑編輯器新增 **DLsite 自動填入**（代碼／URL／關鍵字）→ 補全標題、社團、封面、genres、來源連結等。
- **不自動填分數**；分項評分仍由站長手填。
- DB：`developer`、`genres`、`cg_type`、`source_url`、`product_code`、`release_date`、`work_type_label`、`metadata`。
- RPC：`admin_fetch_game_metadata`（admin-only，Postgres `extensions.http` 抓 DLsite `product.json`）。
- 說明：`docs/GAME-REVIEW-AUTOFILL.md`

### 部署
- 源碼 repo：v1.5.0 commit + push
- 套用 migration：`python-portable\python.exe tools/apply_migration.py supabase/migrations/0017_game_dlsite_autofill.sql --project-ref xpztpetskjohuxrpgmcm`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.5.0`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.5.0**
2. 管理員新增評鑑 → 貼 `RJ…`／`VJ…` →「搜尋／自動填入」應帶入名稱／封面
3. 確認分項分數仍為空白／手填，儲存後詳情顯示開發商與來源連結

---

## 前輪：ACG Portal v1.4.0

### 變更
- 遊戲評鑑由單一 `-5～+5` 改為 **6 分項 1–10**（劇情／美術／配音／系統／表現力／演出）。
- 配音、演出可標 **N/A**；總分＝非 null 等權平均（一位小數）；等級 S/A/B/C/D。
- DB：`scores` jsonb、`score_total`、`grade`；`rating` 改存 1–10 總分整數。
- RPC：`admin_upsert_game_review` 新增 `game_scores`。
- 規則說明：`docs/GAME-REVIEW-SCORING.md`

### 部署
- 源碼 repo：v1.4.0 commit + push
- 套用 migration：`python-portable\python.exe tools/apply_migration.py supabase/migrations/0016_game_score_breakdown.sql`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.4.0`

### 使用者驗證步驟
1. 強制重新整理確認頂部版本 **v1.4.0**
2. 遊戲評鑑列表／詳情應顯示 **x.x/10 · 等級**
3. 管理員新增／編輯：分項 1–10 chip；配音／演出可 N/A；預覽總分即時更新
4. 儲存後列表與詳情分項列一致

---

## 前輪：ACG Portal v1.3.11

### 根因
1. **檢舉後台**：`admin_list_reports` 未回傳 `work_id`，管理員無法從檢舉列表直接跳到被檢舉作品／留言。
2. **刪除評論後仍留榜**：`deleteReview()` 與後台「刪除內容」只重繪評論區，**未重載排行榜**；`state.leaderboard` 快取舊資料。DB `leaderboard` view 亦回傳 `review_count=0` 的作品（雖前端有 filter，但快取未更新時仍顯示）。

### 修復
- Migration **0015**：`admin_list_reports` 加 `work_id`；`leaderboard` view 改 `INNER JOIN work_stats`（僅含仍有可見主評論的作品）。
- 檢舉列表加 **「前往作品」「前往留言」** 按鈕 → 開作品 detail modal，並 scroll 高亮該則評論；支援 hash `#work-{id}` / `#work-{id}-review-{reviewId}`。
- `deleteReview`、後台刪除／隱藏評論後呼叫 `refreshLeaderboardAfterReviewChange()` 重載排行榜與週榜。

### 部署
- 源碼 repo：v1.3.11 commit + push
- 套用 migration：`python tools/apply_migration.py supabase/migrations/0015_report_nav_and_leaderboard.sql`
- Pages `temp-pages/acg-portal`：同步 + push
- 快取：`?v=1.3.11`

### 使用者驗證步驟
1. 強制重新整理（Ctrl+Shift+R）確認頂部版本 **v1.3.11**
2. 後台 → 檢舉：點「前往作品」應開作品 modal；點「前往留言」應捲動並高亮該則評論
3. 對某作品留下唯一評分 → 確認在排行榜 → 刪除該評論 → 排行榜應不再出現該作品
4. 網址 hash `#work-{作品uuid}` 應能直接開啟作品詳情

---

## 前輪：v1.3.10
見 git history；modal 送出修復（檢舉／遊戲評鑑按鈕）。

## 前輪：v1.3.7～v1.3.9
見 git history `43c407e`、`a313d84`。
