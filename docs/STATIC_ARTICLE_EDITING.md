# 主站文章編輯（靜態版）

主站目前由公開 GitHub 儲存庫部署，文章來源是 `content/cms/markdown/notes/` 和 `content/cms/markdown/literature/` 的 Markdown。正式網站讀取 `content/cms/articles.json`，所以**只改 Markdown 不會自動上站**。這個流程完全離線，不需要已暫停的 Supabase 專案，也不需要貼入帳密。

## 修改現有文章

1. 在 GitHub 網頁打開對應 `.md`，按鉛筆編輯，保留最上方 `---` 之間的 `id` 和 `section`。可修改 `title`、`slug`、`category`、`published_at` 及下方正文。`status: draft` 會讓文章從公開索引移除。
2. 將變更存入分支／PR，而不是直接覆蓋主分支。提交前在本機執行 `npm run articles:build`，檢查 `content/cms/articles.json` 的差異，然後執行 `npm test`。兩個檔案應一同進入 PR。
3. 合併後等候 GitHub Pages 部署，才在公開網址驗證標題、內文、圖片和手機排版。

目前尚未提供純 GitHub 網頁的一鍵發佈；如果只透過 GitHub 網頁改 Markdown，需要請維護者在本機執行第 2 步。不要誤以為 GitHub 儲存檔案就已經發佈。

## 新增文章

複製同分區的一篇 `.md` 作為範本，建立新檔案。`id` 必須是**全新 UUID**，`section` 須與資料夾一致，`slug` 在同分區不可重複。至少包含 `id`、`section`、`slug`、`title`、`status`；若要發佈，還須 `published_at`（ISO 日期時間，例如 `2026-10-03T12:00:00+08:00`）。可選 `category`、`summary`、`tags`；標籤以逗號分隔。新文章的其他顯示欄位會採用保守預設，請於 PR 檢查結果。

**重要：這是公開儲存庫。** 即使寫 `status: draft`，Markdown 原始檔與 Git 歷史依然公開。私密草稿請只留在本機、不要提交，也不要把密碼、Token、私人照片或尚未公開的文章放入此儲存庫。`import-inbox/README.md` 記載的舊 Supabase 匯入流程目前不適用於本靜態發佈流程。

建置器會拒絕缺少來源的舊文章、重複 ID／slug、不支援的 frontmatter 及錯誤日期；它不會連線或修改 Supabase。`npm run articles:check` 僅檢查、完全不寫檔；`npm run articles:build` 僅在內容確實變更時寫入 `articles.json` 及更新 manifest 計數／時間。回復文章時，也須把 Markdown 與 JSON 一起回復。
