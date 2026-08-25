# CONTENT MODEL V3 — AI First

## 設計原則

V2 的問題不是分類太少，而是仍然保留「從字數／圖片數／heading 數量推 presentation」的思維。V3 改成：

> AI 做語意判斷；資料庫保存判斷；前端只渲染。

### 文章核心欄位

- `category`：讀者可理解的分類。
- `content_type`：文章編輯語意。
- `presentation`：前台呈現方式。
- `show_title` / `show_summary`：每篇獨立決定。
- `series`：系列。
- `visibility`：public / unlisted / private。
- `ai_editorial`：AI 判斷的 provenance、confidence、reason、flags。

## 禁止 runtime semantic heuristic

前端不得再：
- 由 body length 決定 fragment / longform；
- 由第一行長度判斷 title；
- 由圖片數直接判斷 photo-note；
- 由 category 決定是否顯示 summary；
- 由 heading 數量決定文章「是什麼」。

這些訊號可以送給 AI 作為 context，但不能直接形成 if/else 的語意結論。

## Presentation registry

保留 V2 的十種 renderer，但由 `article.presentation` 直接選：

`fragment / photo-note / journal / article-lite / longform / review / reference / quote / fiction / poetry`

若舊資料沒有 presentation，fallback 應是安全中性的 `article-lite`，並在後台標記 `needs_ai_analysis=true`；不要現場猜。

## AI provenance

建議 `ai_editorial` JSONB：

```json
{
  "version": "v3",
  "analyzed_at": "...",
  "provider": "...",
  "model": "...",
  "confidence": 0.91,
  "reason": "完整論點但語氣偏隨筆，適合 article-lite。",
  "edit_level": "format_only",
  "flags": [],
  "human_review_required": false
}
```

不要保存 chain-of-thought；只存簡短、可供編輯者理解的理由。

## AI 分析時機

1. 新增／貼上文章：按「AI 整理與判斷」。
2. 編輯舊文：可按「重新分析 metadata」，預設不覆寫正文。
3. 批次 migration：逐篇完整送入 AI，產生 diff，人工核准後 update by id。
4. AI 不可在讀者每次開頁時即時呼叫。

## Failure behavior

AI timeout / schema invalid / confidence 太低時：
- 保留原文；
- 不發佈；
- 顯示「AI 分析失敗／需要人工確認」；
- 絕不 fallback 成字數規則自動分類。
