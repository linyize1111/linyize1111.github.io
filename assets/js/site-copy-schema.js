/**
 * LYZ site copy schema — editable text keys + fallbacks from current HTML.
 * Exposes window.LYZSiteCopySchema and window.LYZSiteCopySchema.ENTRIES.
 */
(function (global) {
  "use strict";

  var ENTRIES = [
    // —— GLOBAL ——
    {
      key: "site.brand",
      page: "global",
      group: "品牌",
      label: "網站品牌名稱",
      description: "頁首 logo／品牌文字",
      mode: "text",
      fallback: "LYZ's website",
      pageUrl: "index.html"
    },
    {
      key: "nav.home",
      page: "global",
      group: "導覽",
      label: "導覽 · 首頁",
      description: "主導覽「首頁」連結文字",
      mode: "text",
      fallback: "首頁",
      pageUrl: "index.html"
    },
    {
      key: "nav.notes",
      page: "global",
      group: "導覽",
      label: "導覽 · 隨筆",
      description: "主導覽「隨筆」連結文字",
      mode: "text",
      fallback: "隨筆",
      pageUrl: "directory.html"
    },
    {
      key: "nav.literature",
      page: "global",
      group: "導覽",
      label: "導覽 · 文學創作",
      description: "主導覽「文學創作」連結文字",
      mode: "text",
      fallback: "文學創作",
      pageUrl: "literature.html"
    },
    {
      key: "nav.about",
      page: "global",
      group: "導覽",
      label: "導覽 · 關於我",
      description: "主導覽「關於我」連結文字",
      mode: "text",
      fallback: "關於我",
      pageUrl: "about.html"
    },
    {
      key: "footer.copyright",
      page: "global",
      group: "頁尾",
      label: "版權文字",
      description: "頁尾版權列",
      mode: "text",
      fallback: "© LYZ",
      pageUrl: "index.html"
    },

    // —— HOME ——
    {
      key: "home.intro.title",
      page: "home",
      group: "歡迎",
      label: "首頁 · 歡迎標題",
      description: "首頁 hero 主標題",
      mode: "text",
      fallback: "WELCOME!!!",
      pageUrl: "index.html"
    },
    {
      key: "home.intro.subtitle",
      page: "home",
      group: "歡迎",
      label: "首頁 · 歡迎副標",
      description: "首頁 hero 副標題",
      mode: "text",
      fallback: "An average student from Taiwan",
      pageUrl: "index.html"
    },
    {
      key: "home.intro.cta",
      page: "home",
      group: "歡迎",
      label: "首頁 · 歡迎 CTA",
      description: "首頁 intro 行動按鈕（目前頁面無對應文案）",
      mode: "text",
      fallback: "",
      pageUrl: "index.html"
    },
    {
      key: "home.featured.eyebrow",
      page: "home",
      group: "精選",
      label: "首頁 · 精選眉標",
      description: "關於本站區塊上方小標（date）",
      mode: "text",
      fallback: "HELLO WORLD",
      pageUrl: "index.html"
    },
    {
      key: "home.featured.title",
      page: "home",
      group: "精選",
      label: "首頁 · 精選標題",
      description: "關於本站與我區塊標題",
      mode: "text",
      fallback: "關於本站與我",
      pageUrl: "index.html"
    },
    {
      key: "home.featured.body",
      page: "home",
      group: "精選",
      label: "首頁 · 精選內文",
      description: "首頁關於本站長文；換行會顯示為斷行",
      mode: "multiline",
      fallback:
        "我是林佾則，目前就讀於國立中山大學資訊工程學系二年級。\n\n" +
        "本網站於 2020 年 12 月初試啼聲，那時十分感謝資訊社學長的指導，讓我得以搭建出這專屬於我的數位空間。雖然當時僅具雛形，卻也成為我記錄學習歷程的珍貴起點。\n\n" +
        "升上大二後，我不僅在程式語言與資訊科學上持續精進，更重新拾起閱讀的習慣，廣泛涉獵文學、藝術、音樂與咖啡等多元領域。基於對美學與技術的雙重追求，我於近期著手將網站進行全方位的翻新與優化。未來，這裡將持續蛻變為我記錄技術筆記與生活思想的靜謐天地，歡迎您的駐足與閱覽。",
      pageUrl: "index.html"
    },
    {
      key: "home.featured.cta",
      page: "home",
      group: "精選",
      label: "首頁 · 精選 CTA",
      description: "關於本站區塊按鈕文字",
      mode: "text",
      fallback: "了解更多關於我",
      pageUrl: "index.html"
    },
    {
      key: "home.notes.eyebrow",
      page: "home",
      group: "隨筆卡",
      label: "首頁 · 隨筆眉標",
      description: "首頁隨筆卡片上方小標",
      mode: "text",
      fallback: "生活與閱讀",
      pageUrl: "index.html"
    },
    {
      key: "home.notes.title",
      page: "home",
      group: "隨筆卡",
      label: "首頁 · 隨筆標題",
      description: "首頁隨筆卡片標題",
      mode: "text",
      fallback: "隨筆",
      pageUrl: "index.html"
    },
    {
      key: "home.notes.body",
      page: "home",
      group: "隨筆卡",
      label: "首頁 · 隨筆說明",
      description: "首頁隨筆卡片說明文字",
      mode: "text",
      fallback: "碎念、日記、感想、閱讀心得與整理過的散文。不必完美——只是留下當下的痕跡。",
      pageUrl: "index.html"
    },
    {
      key: "home.notes.cta",
      page: "home",
      group: "隨筆卡",
      label: "首頁 · 隨筆 CTA",
      description: "首頁隨筆卡片按鈕文字",
      mode: "text",
      fallback: "查看隨筆",
      pageUrl: "index.html"
    },
    {
      key: "home.literature.eyebrow",
      page: "home",
      group: "文學卡",
      label: "首頁 · 文學眉標",
      description: "首頁文學創作卡片上方小標",
      mode: "text",
      fallback: "創作",
      pageUrl: "index.html"
    },
    {
      key: "home.literature.title",
      page: "home",
      group: "文學卡",
      label: "首頁 · 文學標題",
      description: "首頁文學創作卡片標題",
      mode: "text",
      fallback: "文學創作",
      pageUrl: "index.html"
    },
    {
      key: "home.literature.body",
      page: "home",
      group: "文學卡",
      label: "首頁 · 文學說明",
      description: "首頁文學創作卡片說明文字",
      mode: "text",
      fallback: "小說、詩、劇本與長篇創作。虛構與文學作品放這裡；心得感想請到隨筆。",
      pageUrl: "index.html"
    },
    {
      key: "home.literature.cta",
      page: "home",
      group: "文學卡",
      label: "首頁 · 文學 CTA",
      description: "首頁文學創作卡片按鈕文字",
      mode: "text",
      fallback: "查看文學創作",
      pageUrl: "index.html"
    },

    // —— DIRECTORY ——
    {
      key: "directory.eyebrow",
      page: "directory",
      group: "頁首",
      label: "隨筆頁 · 眉標",
      description: "隨筆列表頁 featured 上方小標",
      mode: "text",
      fallback: "生活與閱讀",
      pageUrl: "directory.html"
    },
    {
      key: "directory.title",
      page: "directory",
      group: "頁首",
      label: "隨筆頁 · 標題",
      description: "隨筆列表頁主標題",
      mode: "text",
      fallback: "隨筆",
      pageUrl: "directory.html"
    },
    {
      key: "directory.body",
      page: "directory",
      group: "頁首",
      label: "隨筆頁 · 說明",
      description: "隨筆列表頁頁首說明",
      mode: "multiline",
      fallback:
        "碎念、日記、感想、閱讀心得、整理過的散文都在這裡。\n\n" +
        "不必完美——只是留下當下的痕跡。小說、詩、劇本請到「文學創作」。",
      pageUrl: "directory.html"
    },

    // —— LITERATURE ——
    {
      key: "literature.eyebrow",
      page: "literature",
      group: "頁首",
      label: "文學頁 · 眉標",
      description: "文學創作列表頁 featured 上方小標",
      mode: "text",
      fallback: "創作",
      pageUrl: "literature.html"
    },
    {
      key: "literature.title",
      page: "literature",
      group: "頁首",
      label: "文學頁 · 標題",
      description: "文學創作列表頁主標題",
      mode: "text",
      fallback: "文學創作",
      pageUrl: "literature.html"
    },
    {
      key: "literature.body",
      page: "literature",
      group: "頁首",
      label: "文學頁 · 說明",
      description: "文學創作列表頁頁首說明",
      mode: "multiline",
      fallback:
        "小說、詩、劇本與長篇創作。\n\n" +
        "碎念、日記、閱讀心得請到「隨筆」。這區留給虛構與文學作品。",
      pageUrl: "literature.html"
    },

    // —— ABOUT ——
    {
      key: "about.updated",
      page: "about",
      group: "介紹",
      label: "關於我 · 更新日期",
      description: "關於我頁上方更新日期列",
      mode: "text",
      fallback: "最近更新日期: 2026/03",
      pageUrl: "about.html"
    },
    {
      key: "about.title",
      page: "about",
      group: "介紹",
      label: "關於我 · 頁標題",
      description: "關於我頁主標題",
      mode: "text",
      fallback: "關於我",
      pageUrl: "about.html"
    },
    {
      key: "about.heading",
      page: "about",
      group: "介紹",
      label: "關於我 · 引言標題",
      description: "關於我頁引言／詩句標題（支援 Markdown）",
      mode: "markdown",
      fallback: "月季花四季盛放\n說起來，落花時節就是花開時節呢。",
      pageUrl: "about.html"
    },
    {
      key: "about.body",
      page: "about",
      group: "介紹",
      label: "關於我 · 內文",
      description: "關於我頁自我介紹正文（支援 Markdown）",
      mode: "markdown",
      fallback:
        "**您好，我是林佾則。**目前就讀於國立中山大學資訊工程學系。\n\n" +
        "我熱愛撰寫程式、沉浸於文學，也喜歡在閒暇時享受一杯好咖啡與音樂。這個網站最初是我在 2020 " +
        "年建置的雛形，隨著學習歷程逐漸豐富，我於近期對它進行了全面的翻修。希望能藉由這個空間，記錄並分享我在技術追求與生活思索間的各種火花。",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.title",
      page: "about",
      group: "軌跡",
      label: "軌跡 · 區塊標題",
      description: "技術與學習軌跡區塊標題",
      mode: "text",
      fallback: "技術與學習軌跡",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.1.title",
      page: "about",
      group: "軌跡",
      label: "軌跡 1 · 標題",
      description: "學習軌跡第一項標題",
      mode: "text",
      fallback: "程式語言",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.1.body",
      page: "about",
      group: "軌跡",
      label: "軌跡 1 · 內容",
      description: "學習軌跡第一項說明",
      mode: "text",
      fallback: "C++ (APCS 實作3 觀念4)、Python 開發",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.2.title",
      page: "about",
      group: "軌跡",
      label: "軌跡 2 · 標題",
      description: "學習軌跡第二項標題",
      mode: "text",
      fallback: "網頁前端",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.2.body",
      page: "about",
      group: "軌跡",
      label: "軌跡 2 · 內容",
      description: "學習軌跡第二項說明",
      mode: "text",
      fallback: "HTML/CSS 架構設計、JavaScript 動態渲染 (CSR) 實作",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.3.title",
      page: "about",
      group: "軌跡",
      label: "軌跡 3 · 標題",
      description: "學習軌跡第三項標題",
      mode: "text",
      fallback: "系統與工具",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.3.body",
      page: "about",
      group: "軌跡",
      label: "軌跡 3 · 內容",
      description: "學習軌跡第三項說明",
      mode: "text",
      fallback: "Git 基礎版本控制、GitHub Pages 部署",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.4.title",
      page: "about",
      group: "軌跡",
      label: "軌跡 4 · 標題",
      description: "學習軌跡第四項標題",
      mode: "text",
      fallback: "進階理論",
      pageUrl: "about.html"
    },
    {
      key: "about.trajectory.4.body",
      page: "about",
      group: "軌跡",
      label: "軌跡 4 · 內容",
      description: "學習軌跡第四項說明",
      mode: "text",
      fallback: "機器學習進階理論知識、資訊安全基礎知識",
      pageUrl: "about.html"
    },

    // —— ACADEMIC ——
    {
      key: "academic.eyebrow",
      page: "academic",
      group: "頁首",
      label: "學科頁 · 眉標",
      description: "學科筆記頁 featured 上方小標",
      mode: "text",
      fallback: "僅管理員",
      pageUrl: "academic.html"
    },
    {
      key: "academic.title",
      page: "academic",
      group: "頁首",
      label: "學科頁 · 標題",
      description: "學科筆記頁主標題",
      mode: "text",
      fallback: "學科筆記",
      pageUrl: "academic.html"
    },
    {
      key: "academic.body",
      page: "academic",
      group: "頁首",
      label: "學科頁 · 說明",
      description: "學科筆記頁頁首說明（僅管理員可見）",
      mode: "text",
      fallback: "管理員專用區。",
      pageUrl: "academic.html"
    }
  ];

  var PAGE_ORDER = ["global", "home", "directory", "literature", "about", "academic"];

  function byKey(key) {
    for (var i = 0; i < ENTRIES.length; i++) {
      if (ENTRIES[i].key === key) return ENTRIES[i];
    }
    return null;
  }

  function byPage(page) {
    var out = [];
    for (var i = 0; i < ENTRIES.length; i++) {
      if (ENTRIES[i].page === page) out.push(ENTRIES[i]);
    }
    return out;
  }

  function pages() {
    var seen = {};
    var out = [];
    var i, p;
    for (i = 0; i < PAGE_ORDER.length; i++) {
      p = PAGE_ORDER[i];
      if (!seen[p] && byPage(p).length) {
        seen[p] = true;
        out.push(p);
      }
    }
    for (i = 0; i < ENTRIES.length; i++) {
      p = ENTRIES[i].page;
      if (!seen[p]) {
        seen[p] = true;
        out.push(p);
      }
    }
    return out;
  }

  function groupsForPage(page) {
    var seen = {};
    var out = [];
    var list = byPage(page);
    for (var i = 0; i < list.length; i++) {
      var g = list[i].group;
      if (g && !seen[g]) {
        seen[g] = true;
        out.push(g);
      }
    }
    return out;
  }

  var api = {
    entries: ENTRIES,
    ENTRIES: ENTRIES,
    byKey: byKey,
    byPage: byPage,
    pages: pages,
    groupsForPage: groupsForPage
  };

  global.LYZSiteCopySchema = api;
})(typeof window !== "undefined" ? window : this);
