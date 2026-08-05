# 主站怎麼匯入（含分類說明）

目標站：[`linyize1111.github.io`](https://linyize1111.github.io/)  
後台：[`/admin.html`](https://linyize1111.github.io/admin.html)（`jay0975008815@gmail.com` Google 登入）  
資料庫：Supabase `ypyiqysgfwgxcmmsylob` → 表 `articles`

---

## 兩個分區（先選對資料夾）

| 分區 | 網址 | 放什麼 |
|------|------|--------|
| **雜記** | [`directory.html`](https://linyize1111.github.io/directory.html) | 隨手寫：碎念、日記、短感想 |
| **文學** | [`literature.html`](https://linyize1111.github.io/literature.html) | 認真寫：隨筆、心得、創作、長文 |

學科舊筆記不再公開；`notes` 這個技術分區已改作「雜記」用途。

---

## 分類

### 雜記（`notes`）

| 分類 | 適合 |
|------|------|
| **隨想** | 碎念、抱怨、隨便發 |
| **日記** | 當天生活、札記 |
| **感想** | 短感想、隨手記 |

### 文學（`literature`）

| 分類 | 適合 |
|------|------|
| **隨筆** | 整理過的散文 |
| **心得** | 讀書／觀影感想 |
| **創作** | 小說、詩、劇本 |
| **長文** | 長篇論述 |

不確定時：短的、隨便的 → 雜記；願意給人慢慢讀的 → 文學。

---

## 收件匣匯入

**路徑：** `temp-pages/import-inbox/`

```
import-inbox/
├── literature/   ← 文學 .md
└── notes/        ← 雜記 .md
```

- **檔名 = 預設標題**
- 可選 frontmatter 指定 `category` / `tags` / `published`
- `.md` 預設不進 Git

貼完跟我說，跑 `node tools/import_inbox.mjs` 匯入為草稿。

---

## 後台編輯

頂部會顯示「編輯：標題」與分區／分類／狀態。列表可篩草稿、搜尋標題。

---

## 疑難

| 狀況 | 作法 |
|------|------|
| 不知道在編哪篇 | 看頂部標題；列表搜尋 |
| 碎念該放哪 | `import-inbox/notes/`，分類「隨想」 |
| 認真長文該放哪 | `import-inbox/literature/` |
| slug 重複 | 換 slug 或編輯舊文 |
