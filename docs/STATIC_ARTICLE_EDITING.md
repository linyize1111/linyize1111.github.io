# 主站文章編輯（靜態版）

主站目前由公開 GitHub 儲存庫部署，文章來源是 `content/cms/markdown/notes/` 和 `content/cms/markdown/literature/` 的 Markdown。正式網站讀取 `content/cms/articles.json`，所以**只改 Markdown 不會自動上站**。這個流程完全離線，不需要已暫停的 Supabase 專案，也不需要貼入帳密。

## 修改現有文章

1. 在 GitHub 網頁打開對應 `.md`，按鉛筆編輯，保留最上方 `---` 之間的 `id` 和 `section`。可修改 `title`、`slug`、`category`、`published_at` 及下方正文。`status: draft` 會讓文章從公開索引移除。
2. 將變更存入**同一個儲存庫的新分支**，不要直接改 `main`。到 GitHub 的 **Actions → Build static articles → Run workflow**，選擇剛編輯的分支並啟動。這個手動流程會產生 `articles.json`、跑測試，然後只把產出的文章索引與 manifest 提交回該分支；沒有每天排程，也不會在電腦上跳出視窗。僅站長帳號能執行，`main` 分支不會被這個流程直接修改。
3. 等 workflow 顯示成功，在 PR 的 Files changed 檢查 Markdown 與產出的文章索引；確認沒有錯字或非預期刪除才合併。合併後等候 GitHub Pages 部署，並在公開網址驗證標題、內文、圖片和手機排版。

也可以在本機執行 `npm run articles:build`、`npm test`，將 Markdown、JSON 與 manifest 一起提交 PR。**GitHub 儲存 Markdown 或 workflow 成功都不等於已公開發佈；合併 PR 且 Pages 部署成功才算完成。**

## 新增文章

複製同分區的一篇 `.md` 作為範本，建立新檔案。`id` 必須是**全新 UUID**，`section` 須與資料夾一致，`slug` 在同分區不可重複。至少包含 `id`、`section`、`slug`、`title`、`status`；若要發佈，還須 `published_at`（ISO 日期時間，例如 `2026-10-03T12:00:00+08:00`）。可選 `category`、`summary`、`tags`；標籤以逗號分隔。新文章的其他顯示欄位會採用保守預設，請於 PR 檢查結果。

**重要：這是公開儲存庫。** 即使寫 `status: draft`，Markdown 原始檔與 Git 歷史依然公開。私密草稿請只留在本機、不要提交，也不要把密碼、Token、私人照片或尚未公開的文章放入此儲存庫。`import-inbox/README.md` 記載的舊 Supabase 匯入流程目前不適用於本靜態發佈流程。

建置器會拒絕缺少來源的舊文章、重複 ID／slug、不支援的 frontmatter 及錯誤日期；它不會連線或修改 Supabase。`npm run articles:check` 僅檢查、完全不寫檔；`npm run articles:build` 僅在內容確實變更時寫入 `articles.json` 及更新 manifest 計數／時間。回復文章時，也須把 Markdown 與 JSON 一起回復。
