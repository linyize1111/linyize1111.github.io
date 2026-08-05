# 文章匯入收件匣

把要重上的文章 **以 `.md` 檔** 放進對應子資料夾，檔名就是預設標題（我會再幫你整理分類／摘要）。

```
import-inbox/
├── literature/     ← 文學、隨筆、日記、創作、心得
└── notes/          ← 學科筆記（資安、ML、程式…）
```

## 檔名規則

| 檔名範例 | 標題 | slug（網址） |
|----------|------|----------------|
| `該死的咖啡因.md` | 該死的咖啡因 | 該死的咖啡因 |
| `2024-09-13_生活札記-中山大學入學.md` | 生活札記：中山大學入學 | 2024-09-13_生活札記-中山大學入學 |
| `plague-notes.md` | plague-notes（或文內 H1） | plague-notes |

- 建議用 **中文檔名** 當標題，最直覺。
- 日期可選加在檔名開頭 `YYYY-MM-DD_`，方便排序。
- 避免 `<>:"/\|?*` 等 Windows 不允許的字元。

## 檔案內容（可選 frontmatter）

不寫也可以，只有正文就行：

```markdown
---
title: 自訂標題（可覆蓋檔名）
category: 日記
tags: 生活, 抱怨
status: draft
published: 2024-09-13
summary: 一句話摘要（可留空，匯入時可再補）
slug: custom-url-name
---

正文從這裡開始…
```

**category** 建議值：`隨想` `日記` `隨筆` `心得` `創作` `長文`（筆記區還有 `資訊安全` `機器學習` `程式語言` `人文`）

沒寫 category 時，匯入腳本會依內文**謹慎推測**（生活札記→日記、閱讀心得→心得…）。

**status**：預設 `draft`（草稿），你後台確認後再發佈；若要直接上線寫 `published`。

## 你貼完後跟我說

我會執行（或你自己跑）：

```powershell
cd temp-pages
npm install @supabase/supabase-js
$env:SUPABASE_URL="https://ypyiqysgfwgxcmmsylob.supabase.co"
$env:SUPABASE_SERVICE_KEY="<service_role，見 .handoff/main_secrets.env>"
node tools/import_inbox.mjs              # 匯入為草稿
node tools/import_inbox.mjs --dry-run    # 只預覽
node tools/import_inbox.mjs --publish    # 全部直接發佈（慎用）
```

清空資料庫後重來：

```powershell
node tools/import_inbox.mjs --clear-only
```

`.md` 檔案預設 **不會 commit 到 Git**（見 `.gitignore`），避免私人草稿外洩。
