# 遊戲評鑑自動填入（DLsite）

ACG Portal v1.5.0+：站長在「新增／編輯遊戲評鑑」可用 DLsite 線上抓取作品 metadata，**不會自動填分數**。

## 怎麼用（3 步）

1. 以管理員登入 → 遊戲評鑑 → 新增／編輯。
2. 在頂部「自動填入（DLsite）」貼上 **RJ／VJ／BJ 代碼** 或 **作品頁 URL**（也可用關鍵字），按「搜尋／自動填入」。
3. 確認預覽後按「套用此筆」（代碼／URL 常會直接填入）→ **手動填分項評分與心得** → 儲存。

## 會自動填哪些欄位

| 欄位 | 來源 |
|------|------|
| 名稱 | `work_name` |
| 開發商／社團 | `maker_name` |
| 封面網址 | `image_main` |
| 產品代碼 | RJ／VJ／BJ |
| 來源連結 | 作品頁 URL |
| 發售日 | `regist_date` |
| 作品形式 | `work_type_string` |
| 演出類型 | 依 work_type／options／anime／movies 推斷 static／animated／mixed／unknown |
| genres | `genres[].name`（並可合併進標籤） |
| metadata | 精簡原始資料（jsonb） |

**不會填**：分項分數、總分、等級、心得正文。

## 技術流程

```text
管理員前端
  → supabase.rpc('admin_fetch_game_metadata', { query })
  → Postgres security definer（is_admin 檢查）
  → extensions.http GET DLsite
       1) …/api/=/product.json?workno=RJxxxx   （代碼／URL 最穩）
       2) …/fsr/=/…/keyword/…                 （關鍵字搜尋為輔）
  → 回傳 candidates／product（不含 scores）
```

- Migration：`0017_game_dlsite_autofill.sql`（已含 `http` extension）
- 本機除錯可用：`backend/acg_portal/scrapers/dlsite.py`（同樣不開瀏覽器視窗）

## 限制與替代用法

- **關鍵字搜尋**可能被站點結構／地區結果影響，或回傳不夠精準：請改貼 **RJ／VJ 代碼** 或作品頁 URL。
- 僅 **admin** 可呼叫 RPC；前端只用 anon key + 登入 JWT，**沒有** service key。
- 不依賴 Render worker；即時抓取在 Supabase DB 端完成。

## 套用 migration

```powershell
.\python-portable\python.exe tools\apply_migration.py supabase\migrations\0017_game_dlsite_autofill.sql --project-ref xpztpetskjohuxrpgmcm
```
