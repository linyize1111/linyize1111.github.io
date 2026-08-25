# AI_MIGRATION_REVIEW_V3

Generated: 2026-08-06T14:48:24.763Z

## Rules
- Proposals are **not** applied to Supabase.
- `accepted: false` for every record.
- Source labels come from semantic V2 refined pack / live DB — **not** from character-count thresholds.
- Before accept: re-check author voice; reject report-tone summaries; keep poetry/fiction whitespace.
- Apply only after 0007 migration is reviewed and run, then update-by-id.

## Totals
- proposals: 53
- safe metadata/format-only: 22
- body copy-edit proposed: 0
- editorial/fact-check review: 31
- duplicate/delete candidates: 0

## safe metadata/format-only (22)

- **海面的霓虹** `28a5ee3f` → presentation=`photo-note` visibility=`public` category=`日記` conf=0.82
  - 照片型短記；保留文字原貌，不加多餘文章結構。
- **困在數字遊戲裡** `38138e80` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 保留作 canonical；#1 刪除。
- **不願妥協，也是一種純真** `8a6a10f9` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 只做省略號與空白整理。
- **音樂可以拯救靈魂** `09204f40` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 統一歌曲名稱書名號／篇名號呈現；保留短感觸。
- **感情，或許是一張素紙** `ed30b152` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 保留原始比喻；版型以 fragment 呈現。
- **簡談文筆** `112b5008` → presentation=`fragment` visibility=`public` category=`觀點` conf=0.82
  - 保留短論點；分類改「觀點」，但 presentation 仍是 fragment。
- **活著真好啊。** `142f76ca` → presentation=`photo-note` visibility=`public` category=`日記` conf=0.82
  - 照片日記；不要用正式長文卡片。
- **夢被枕頭悶殺** `4617b60e` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 保留原句意象；只處理標點與段落。
- **我們會開始對一切產生「恐怖谷」嗎？** `891a4ef5` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 保留兩句式 fragment；不要顯示大 Hero、摘要與「閱讀文章」CTA。
- **贖回自由** `8aa75604` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 一句式 fragment；不需要 title + summary + CTA 三次重複同一句意思。
- **我真的很喜歡卡繆** `57b0a61e` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 不補長，讓它維持短感想；版型應小而安靜。
- **科學不該成為新的教條** `77551a9e` → presentation=`fragment` visibility=`public` category=`觀點` conf=0.82
  - 只修段落與標點；改用「觀點」語意分類，不因字數短就被當成隨想。
- **取材** `5d8e944f` → presentation=`fiction` visibility=`public` category=`短篇小說` conf=0.82
  - 移除後談第一句重複提示、修正中文問號；小說正文不改聲音。
- **「美」究竟是怎麼出現的？** `d006ad0b` → presentation=`article-lite` visibility=`public` category=`觀點` conf=0.82
  - 短哲學文章已完整；只做機械校讀。
- **感受與思考主義** `93d5b260` → presentation=`article-lite` visibility=`public` category=`觀點` conf=0.82
  - 整體完整；只做標點與空白整理。
- **四幕短詩：告白、分手、死亡、重逢** `9f1f2b8d` → presentation=`poetry` visibility=`public` category=`詩` conf=0.82
  - 詩保留行分；不顯示摘要。
- **酒紅宴下** `7e426bee` → presentation=`poetry` visibility=`public` category=`詩` conf=0.82
  - 詩／二創只做機械清潔；若公開可補作品來源標籤，不需正文解說。
- **下雨的夜晚** `b7450161` → presentation=`poetry` visibility=`public` category=`詩` conf=0.82
  - 詩只做機械清潔。
- **忌日快樂** `ff3a52b9` → presentation=`poetry` visibility=`public` category=`詩` conf=0.82
  - 詩只清理不可見字元與多餘空行，不主動改詞。
- **看海隨想** `208db295` → presentation=`journal` visibility=`public` category=`日記` conf=0.82
  - 修正「已經明天」等明顯錯字與副詞用法；不動原本口語節奏。
- **嗜血的邂逅** `c26807a9` → presentation=`fiction` visibility=`public` category=`短篇小說` conf=0.82
  - 小說以作者語氣為主，只做隱形字元、標點與段落清潔。
- **《活俠傳》六周目心得** `249d13b2` → presentation=`review` visibility=`public` category=`作品心得` conf=0.82
  - 正文已相對完整；只做機械式排版校讀，不改遊戲心得的個人口氣。

## body copy-edit proposed (0)


## editorial/fact-check review required (31)

- **Python 學習紀錄** `38181215` → presentation=`reference` visibility=`private` category=`程式語言` conf=0.82
  - 整理成「索引／待補」格式，避免 stub 被當成完整文章。
- **普通心理學筆記** `12248c6a` → presentation=`reference` visibility=`private` category=`人文` conf=0.82
  - 把「只有卡片入口」說清楚，避免看起來像完整文章。
- **資訊安全基礎知識** `c6a3c68d` → presentation=`reference` visibility=`private` category=`資訊安全` conf=0.82
  - 整理成明確的待辦大綱，保持 private draft。
- **機器學習基石課程筆記** `b928be8f` → presentation=`reference` visibility=`private` category=`機器學習` conf=0.82
  - 只做基本排版與拼字清潔，不把這份原始技術筆記假裝成完成稿；內容含多處概念／公式／英文錯誤，需另做一輪技術校訂。
- **高三進階程式設計課程學習成果** `a3ce235a` → presentation=`reference` visibility=`private` category=`程式語言` conf=0.82
  - 整理成課程成果 PDF 入口。
- **開發 Discord 聊天機器人** `90835079` → presentation=`reference` visibility=`private` category=`程式語言` conf=0.82
  - 整理成 PDF 學習成果入口。
- **學習歷程 117-11** `ee221034` → presentation=`reference` visibility=`private` category=`人文` conf=0.82
  - 改成明確 PDF／學習歷程索引，不假裝是文章正文。
- **搭建自己的網站** `a0ff6534` → presentation=`reference` visibility=`private` category=`程式語言` conf=0.82
  - 整理成網站建置筆記入口，後續可拆成版本演進紀錄。
- **進擊的巨人與北歐神話** `1f2ca188` → presentation=`reference` visibility=`public` category=`作品筆記` conf=0.82
  - 在開頭加入「可能對照／待查證」限定；不要把影響關係寫成官方確定設定。
- **個體才是最重要的** `399e7b27` → presentation=`article-lite` visibility=`public` category=`觀點` conf=0.82
  - 保留價值立場，但把「民主必然放大暴力／資本社會就是階級制度」等斷言改成可辯論的條件式說法。
- **生命與法律的重量** `ef219e76` → presentation=`photo-note` visibility=`public` category=`隨想` conf=0.82
  - 修正重複字；圖片若來自 Pixiv，需保留作者名稱＋原作 URL／授權資訊，否則不建議公開。
- **夜裡的忠烈祠** `eef311f2` → presentation=`journal` visibility=`public` category=`日記` conf=0.82
  - 修正「牠們／沉重／背後是」等字詞；對忠烈祠人物的歷史動機不以一句話概括，改成較審慎的表述。
- **抽離意義的性** `e7f9595c` → presentation=`article-lite` visibility=`public` category=`觀點` conf=0.82
  - 將普遍化的道德判斷改寫成第一人稱倫理偏好；保留立場，但明確承認不是替所有親密關係下定義。
- **紙本書與精神調律** `7a289d29` → presentation=`quote` visibility=`public` category=`摘錄` conf=0.82
  - 改成摘錄型內容；需要標示作品／集數或原始來源，且卡片不應再另造摘要包裝成正式文章。
- **時間或許只是幻覺？** `e582e260` → presentation=`fragment` visibility=`public` category=`隨想` conf=0.82
  - 移除正文開頭日期，改成 metadata；加上「物理哲學隨想，不是物理結論」的限定，避免把負時間座標等直覺當成時間倒流。
- **臺灣政治不該只剩二元對立** `b6d2d0b1` → presentation=`article-lite` visibility=`public` category=`時事` conf=0.82
  - 把「大部分臺灣人」與「只是棋子」等過度概括改成可檢驗、保留主體性的說法；若要寫民意趨勢需補民調來源。
- **咖啡的風味從哪裡來？談影響咖啡風味的變量** `60a89582` → presentation=`longform` visibility=`public` category=`專題` conf=0.82
  - 修補明顯殘缺小標；長文用專題版型，建議之後替技術性咖啡知識補資料來源。
- **十四夜月與一隻貓** `04be00a5` → presentation=`photo-note` visibility=`public` category=`日記` conf=0.82
  - 刪除五行孤立句點；保留「照片＋一句話」的 photo-note 性質。
- **記憶與遺忘的鬥爭** `0ac06d81` → presentation=`article-lite` visibility=`public` category=`時事` conf=0.82
  - 文章立場可保留，但白色恐怖、六四與卡繆引文都屬可核實資訊，正式發佈前應補來源。
- **一些有關《無職轉生》的想法** `7b953c20` → presentation=`review` visibility=`public` category=`作品評論` conf=0.82
  - 重寫推測批評者「真正動機」的段落；把焦點從人格／道德表演拉回作品如何敘事、合理化與反思。
- **該死的咖啡因** `f929a42e` → presentation=`fiction` visibility=`public` category=`短篇小說` conf=0.82
  - 移除開頭多餘水平線，修正「沒有沒有／嘀咕」等明顯錯字；不改小說情節。
- **嘉義咖啡節** `c94ce8a9` → presentation=`journal` visibility=`public` category=`日記` conf=0.82
  - 修正數字單位與語病；公開版不要直接招呼陌生讀者到宿舍，可改成「熟人想試可以私訊」。
- **贖回時間、自由與愛** `6eeeda2e` → presentation=`article-lite` visibility=`public` category=`散文` conf=0.82
  - 把社群貼上造成的句點後空格改回自然段落，修正「一再地」等語法。
- **大眾心理學其實不適合大眾讀** `e0422ffb` → presentation=`article-lite` visibility=`public` category=`觀點` conf=0.82
  - 把「大眾心理學不適合大眾讀」改成對「拿來自我診斷」的批判，避免把心理學本身與通俗心理讀物混為一談。
- **凌晨三點半的幸福** `3e4b19ac` → presentation=`journal` visibility=`public` category=`日記` conf=0.82
  - 修正「甚麼／?」；歌詞段落需注意引用長度與來源，網站可改成較短節錄＋作品名。
- **《無窮盡的交響曲》閱讀心得與批判** `e4335dde` → presentation=`review` visibility=`public` category=`作品評論` conf=0.82
  - 修正重複詞、錯字與問號；把「計算不可化約性＝宿命論」相關內容明確寫成批判與條件式判斷，不當作已證實結論。
- **《如何閱讀一本書》閱讀筆記** `5e9bf718` → presentation=`reference` visibility=`public` category=`閱讀筆記` conf=0.82
  - 修正多處明顯錯字、標點與章節編號；把「如何閱讀想像文學」補成第十四章，並調整第十八／十九章順序。
- **《百年孤寂》閱讀心得** `9a822c00` → presentation=`longform` visibility=`public` category=`作品評論` conf=0.82
  - 保留核心閱讀感受；拉丁美洲歷史與現代事件類比需補來源，避免文學心得被誤讀成歷史論文。
- **《盲目》閱讀心得** `35434d68` → presentation=`longform` visibility=`public` category=`作品評論` conf=0.82
  - 保留原有閱讀論述；建議之後替歷史／政治類比補來源或改成「我聯想到」。
- **論《鼠疫》中的責任、自由與感受** `f2bbc2ad` → presentation=`longform` visibility=`public` category=`作品評論` conf=0.82
  - 整體結構成熟；僅做空白、標點與 Markdown 一致化。正式長文可保留參考書目與註記。
- **《變形記》閱讀心得** `ce077857` → presentation=`review` visibility=`public` category=`作品評論` conf=0.82
  - 修正引號、年代間距與「鐫刻」等字詞；作者生平與名言摘錄需逐條核對來源，避免把網路流傳語錄當卡夫卡原話。

## duplicate/delete candidates (0)


