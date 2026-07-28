# 遊戲評鑑自動填入（Steam／DLsite 標題搜尋）

ACG Portal **v1.7.1+**：站長在「新增／編輯遊戲評鑑」可用 **遊戲標題** 搜尋 **Steam／DLsite**，從候選確認後抓公開頁 metadata 填入，**不會自動填分數**。

系統只查 Steam 與 DLsite；其他資料請自行查找後手動填寫。不會整合盜版下載站，也不會從破解／網盤頁抓下載內容。

## 怎麼用（建議流程）

1. 以管理員登入 → 遊戲評鑑 → 新增／編輯。
2. 在 **名稱** 欄輸入遊戲標題（原名／官方英文名較準）。
3. 按「**用上方名稱搜尋**」，或在搜尋框按「**搜尋 Steam／DLsite**」。
4. 從候選（來源徽章＋縮圖／連結）點「**套用此筆**」→ 系統再抓該頁 metadata 填入。
5. **手動填分項評分與心得** → 儲存。

### 進階（DLsite 代碼／官方 URL）

有 **RJ／VJ／BJ**、DLsite 作品頁，或 **Steam** `store.steampowered.com/app/…` 時：展開「進階：DLsite 代碼／URL 精確抓取」→「精確抓取」。

### 以圖搜圖（預留，尚未啟用）

需 `SAUCENAO_API_KEY`（見可行性文件）。未設定前請用標題或 URL。

## 搜尋來源

| Provider | 用途 |
|----------|------|
| **Steam** | `storesearch` 標題候選；選中後 `appdetails` |
| **DLsite** | 關鍵字候選；選中後 `product.json`（或 RJ／VJ／BJ／作品 URL 精確抓取） |

（v1.7.0 的 Google CSE／DuckDuckGo／Wikipedia 網頁通用搜尋已於 v1.7.1 停用。）

## 會自動填哪些欄位

| 欄位 | 來源 |
|------|------|
| 名稱 | Steam／DLsite |
| 開發商／社團 | Steam developers／DLsite maker |
| 封面網址 | Steam header／DLsite image |
| 產品代碼 | RJ／VJ／BJ 或 Steam app id（可空） |
| 來源連結 | 候選 URL |
| 發售日 | 有結構化資料時 |
| 作品形式 | DLsite／Steam |
| 標籤（含類型／genres） | Steam／DLsite → 合併寫入單一「標籤」欄（`tags`／`genres` 同步） |
| metadata | 精簡原始資料（jsonb，含 `source`／`store`） |

**不會填**：分項分數、總分、等級、心得正文。

## 技術流程

```text
管理員前端（標題為主）
  → supabase.rpc('admin_search_game_web', { query })
  → Steam storesearch ＋ DLsite 關鍵字
  → 候選（Steam／DLsite 徽章、連結、縮圖）
  → 站長點「套用此筆」
  → supabase.rpc('admin_fetch_game_metadata', { query: url 或 code })
  → Steam／DLsite parser → 填入表單（不含分數）
```

- Migration：`0017`…`0020`（歷史）、`0021_game_search_steam_dlsite_only.sql`
- 本機除錯：`backend/acg_portal/scrapers/dlsite.py`、`web_search.py`

## 誠實限制

- 僅搜尋 Steam／DLsite；不在商店上架或改名嚴重的標題可能無結果 → **必須人工確認**，不足欄位請手動補。
- 僅 **admin** 可呼叫搜尋／抓取 RPC。

## 套用 migration

```powershell
.\python-portable\python.exe tools\apply_migration.py supabase\migrations\0021_game_search_steam_dlsite_only.sql --project-ref xpztpetskjohuxrpgmcm
```
