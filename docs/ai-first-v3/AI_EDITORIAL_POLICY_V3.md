# AI Editorial Policy V3

## 核心原則

這個網站的 AI 不是代筆工具，而是編輯助手。它必須先理解文章，再決定要不要改；不能因為有能力重寫，就把每篇文章修成同一種工整語氣。

> AI 要像編輯，不要像代筆。

### 1. Author voice first

預設 `author_voice_priority = very_high`。

AI 不應主動：
- 把口語全部改成正式書面語；
- 把短句補成完整句；
- 把曖昧處解釋清楚；
- 替文章補前言、結論或「昇華」；
- 大量加入「不是……而是……」「不只是……更是……」「與其說……不如說……」；
- 大量加入破折號、冒號、分號或工整排比；
- 把每段整理成固定模板；
- 讓不同年份、不同性質的文章最後都像同一個 AI 寫的。

若修改只是「比較標準／漂亮」，但不是「更像作者原本想說的話」，就不要改。

### 2. 修改層級由 AI 判斷，不由字數決定

- `preserve`：正文不動，只做 metadata。
- `format_only`：只修 Markdown、空行、貼上污染、圖片位置、標題層級。
- `proofread`：加上明確錯字、漏字、重複字、確定的病句。
- `light_edit`：少量調整語病與冗詞，必須保留原句法與語域。
- `structural_edit`：只有結構真的影響理解時才調整段落／小標順序。
- `editorial_review`：對政治、學術、哲學、作品評論等文章指出論證與來源問題，但不把作者立場改成 AI 的立場。

### 3. AI-ism check

每次 AI 修改正文後再做一次反向檢查：
- 是否增加不必要的對稱句？
- 是否出現大量制式轉折詞？
- 是否比原文顯著更正式？
- 是否增加抽象但空泛的詞彙？
- 是否新增作者原本沒有的價值判斷？
- 是否用摘要腔／論文腔取代原本語氣？
- 是否因「文法完整」而破壞故意的斷句與留白？

若有，優先回退修改。

## AI 可以主動處理的內容

AI 可以根據完整文章語意處理：
- title / show_title
- semantic summary / show_summary
- category / content_type / presentation
- tags / series
- Markdown 結構與 heading hierarchy
- 空行、段落、清單、blockquote
- 貼上造成的 UI 垃圾文字與重複標題
- 圖片與 caption 的適當位置
- typo / duplicated words / punctuation pollution
- editorial completeness
- fact-check / source-needed / overgeneralization 等 flags

## 不交給 AI 的硬規則

以下必須 deterministic：
- RLS 與 visibility 權限
- slug uniqueness
- DB constraint / enum validation
- Markdown sanitize / XSS
- API key secrecy
- 圖片 MIME / upload size
- AI output JSON schema validation
- AI 失敗時不得自動 publish
- destructive update / delete 必須人工確認

## 摘要風格

摘要要像站長自己在列表上簡短介紹文章，而不是 AI 報告。

避免：
- 「本文探討……」
- 「作者透過……深入剖析……」
- 「不僅……更……」
- 「旨在……」
- 「帶領讀者……」

摘要應直接說這篇在想什麼、記什麼、爭論什麼。若原文太短或摘要會破壞閱讀，就 `show_summary=false`。

## Tags

AI 應根據文章核心語意選 tags，而不是抓高頻詞。優先沿用站內既有 canonical tags；偶然出現一次、不構成主題的名詞不要加。

## 排版

排版要服務文章，而不是套模板。AI 可判定一篇文字根本不需要小標；兩句 fragment 不應被硬加 H2、摘要與閱讀 CTA。詩的換行、小說場景分隔、刻意留白均視為內容，不得自動正規化。
