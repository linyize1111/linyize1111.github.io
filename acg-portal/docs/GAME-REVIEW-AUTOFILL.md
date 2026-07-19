# 遊戲評鑑自動填入（DLsite 標題搜尋）

ACG Portal **v1.6.0+**：站長在「新增／編輯遊戲評鑑」可用 **遊戲標題** 搜尋 DLsite，從候選確認後填入 metadata，**不會自動填分數**。

## 怎麼用（建議流程）

1. 以管理員登入 → 遊戲評鑑 → 新增／編輯。
2. 在 **名稱** 欄輸入遊戲標題（建議日文原名或官方英文名）。
3. 按「**用上方名稱搜尋**」，或在搜尋框輸入標題後按「**搜尋標題**」。
4. 從候選列表（封面＋店家徽章＋社團／代碼）點「**套用此筆**」確認。
5. **手動填分項評分與心得** → 儲存。

### 進階（代碼／URL）

有 **RJ／VJ／BJ** 或作品頁 URL 時，可貼進搜尋框（見面板「進階」說明）。精確命中會預填欄位並顯示候選卡，仍請確認；**不會**自動填分數。

### 以圖搜圖（P1 預留，尚未啟用）

面板有「以此封面搜尋」按鈕，目前為 **disabled**。啟用條件：

1. 申請 [SauceNAO](https://saucenao.com/user.php) API key  
2. 部署 Edge Function（建議），將金鑰放在 Supabase **secrets**（`SAUCENAO_API_KEY`），**勿**寫進前端  
3. 流程：封面 URL／已上傳圖 → 圖搜候選 → 站長確認 → 若可解析 RJ／URL 再复用本文件的 metadata 抓取  

未設定金鑰前請改用標題或代碼。Steam 等多店家標題搜尋列為後續（見可行性評估）。

## 會自動填哪些欄位

| 欄位 | 來源 |
|------|------|
| 名稱 | `work_name` |
| 開發商／社團 | `maker_name` |
| 封面網址 | `image_main` |
| 產品代碼 | RJ／VJ／BJ（可空） |
| 來源連結 | 作品頁 URL |
| 發售日 | `regist_date` |
| 作品形式 | `work_type_string` |
| 演出類型 | 依 work_type／options／anime／movies 推斷 static／animated／mixed／unknown |
| genres | `genres[].name`（並可合併進標籤） |
| metadata | 精簡原始資料（jsonb，含 `source`／`store`） |

**不會填**：分項分數、總分、等級、心得正文。

## 技術流程

```text
管理員前端（標題為主）
  → supabase.rpc('admin_fetch_game_metadata', { query })
  → Postgres security definer（is_admin）
  → extensions.http GET DLsite
       1) 關鍵字 HTML fsr → 候選（封面／店家／代碼）→ 站長確認
       2) product.json?workno=…（代碼／URL：精確預填）
  → { ok, mode: search|detail, candidates[], hint? }
  → 空結果回傳 soft failure + hint（不強制 raise）
```

- Migration：`0017_game_dlsite_autofill.sql`、`0018_game_title_search_primary.sql`
- 本機除錯可用：`backend/acg_portal/scrapers/dlsite.py`
- 評估與決策：[`GAME-REVIEW-SEARCH-FEASIBILITY.md`](./GAME-REVIEW-SEARCH-FEASIBILITY.md)

## 限制與替代用法

- **標題搜尋**依賴 DLsite 日文索引與 HTML 結構；中文譯名、破解站改標題常空結果 → 改原名或貼 URL／代碼。
- **關鍵字路徑**不會自動取第一筆；必須點「套用此筆」。
- 僅 **admin** 可呼叫 RPC；前端只用 anon key + 登入 JWT。
- 不依賴 Render worker；即時抓取在 Supabase DB 端完成。
- 以圖搜圖／Steam：見上「預留」與可行性文件後續項。

## 套用 migration

```powershell
.\python-portable\python.exe tools\apply_migration.py supabase\migrations\0018_game_title_search_primary.sql --project-ref xpztpetskjohuxrpgmcm
```
