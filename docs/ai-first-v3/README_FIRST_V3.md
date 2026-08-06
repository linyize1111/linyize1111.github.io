# README FIRST — V3 AI-FIRST

這版取代 V2 中所有以字數／圖片數／heading 數量作為語意分類門檻的設計。

核心：**AI 讀懂文章後決定 metadata、排版與 presentation；程式只負責安全、驗證、保存與 renderer。**

先讀：
1. `AI_EDITORIAL_POLICY_V3.md`
2. `AI_EDITORIAL_PROMPT_V3.md`
3. `AI_ANALYZER_SCHEMA_V3.json`
4. `CONTENT_MODEL_V3_AI_FIRST.md`
5. `CURSOR_IMPLEMENTATION_SPEC_V3_AI_FIRST.md`
6. `0007_ai_first_content_model_PROPOSAL.sql`

不要直接執行 SQL proposal；先備份、dry-run、確認 RLS。

AI 編輯預設 `author_voice_priority = very_high`：能只整理排版就不要潤稿，能修一個字就不要重寫一句。
