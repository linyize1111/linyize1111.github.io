/**
 * Restore former academic notes into import-inbox/academic/ then exit.
 * Run: node tools/restore_academic_inbox.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "import-inbox", "academic");
fs.mkdirSync(OUT, { recursive: true });

function writeMd(filename, meta, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null || v === "") continue;
    lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", body.trim(), "");
  fs.writeFileSync(path.join(OUT, filename), lines.join("\n"), "utf8");
  console.log("wrote", filename);
}

const today = new Date().toISOString().slice(0, 10);

// 1–3: existing markdown notes
const localNotes = [
  {
    file: "security_basics.md",
    title: "資訊安全基礎知識",
    category: "資訊安全",
    slug: "security-basics",
    cover: "images/pic_note1.jpg",
    pdf: "pdfs/資安.pdf",
    summary: "參加資訊安全課程及其他資訊領域的自行探索紀錄。",
  },
  {
    file: "machine_learning.md",
    title: "機器學習進階理論",
    category: "機器學習",
    slug: "machine-learning",
    cover: "images/pic_note2.jpg",
    summary: "台大林軒田教授課程「機器學習基石」的學習筆記與重點整理。",
  },
  {
    file: "python_learning.md",
    title: "Python 學習紀錄",
    category: "程式語言",
    slug: "python-learning",
    cover: "images/pic_note3.jpg",
    pdf: "pdfs/Python.pdf",
    summary: "自學 Python 程式語言的基礎語法與專案實作紀錄。",
  },
];

for (const n of localNotes) {
  const body = fs.readFileSync(path.join(ROOT, "notes", n.file), "utf8");
  writeMd(n.file, {
    title: n.title,
    slug: n.slug,
    category: n.category,
    summary: n.summary,
    cover: n.cover,
    pdf: n.pdf || "",
    status: "published",
    published: today,
  }, body);
}

// 4–6: cards that only had summaries (no .md in repo) — restore as notes + PDF when available
writeMd("discord_bot.md", {
  title: "開發 Discord 聊天機器人",
  slug: "discord-bot",
  category: "程式語言",
  summary: "使用 Python 與 discord.py 函式庫，從零開始建構一個具備指令系統與自動回覆功能的 Discord 機器人。",
  cover: "images/pic_note4.jpg",
  pdf: "pdfs/多元表現 自製discord機器人.pdf",
  status: "published",
  published: today,
}, `# 開發 Discord 聊天機器人

使用 Python 與 discord.py 函式庫，從零開始建構一個具備指令系統與自動回覆功能的 Discord 機器人。

詳細內容與成果請見附檔 PDF。
`);

writeMd("build_website.md", {
  title: "搭建自己的網站",
  slug: "build-website",
  category: "程式語言",
  summary: "從購買網域、設定 GitHub Pages，到設計前端頁面，完整記錄建立個人網站的全過程。",
  cover: "images/pic_note5.jpg",
  status: "published",
  published: today,
}, `# 搭建自己的網站

從購買網域、設定 GitHub Pages，到設計前端頁面，完整記錄建立個人網站的全過程。

（此篇原先以卡片形式存在；正文若之後有完整稿可再貼上補充。）
`);

writeMd("psychology.md", {
  title: "普通心理學筆記",
  slug: "psychology",
  category: "人文",
  summary: "修習普通心理學課程的學習筆記，涵蓋感知、記憶、情緒、發展心理學等核心理論。",
  cover: "images/pic_note6.jpg",
  status: "published",
  published: today,
}, `# 普通心理學筆記

修習普通心理學課程的學習筆記，涵蓋感知、記憶、情緒、發展心理學等核心理論。

（此篇原先以卡片形式存在；若你之後有完整筆記檔可再匯入覆寫。）
`);

// 7–8: PDF-only
writeMd("advanced-programming-g3.md", {
  title: "高三進階程式設計課程學習成果",
  slug: "advanced-programming-g3",
  category: "程式語言",
  summary: "高三時期進階程式設計課程的學習成果簡報，涵蓋各項程式專題與實作紀錄。",
  cover: "images/pic_note1.jpg",
  pdf: "pdfs/31711高三進階程式設計課程學習成果.pdf",
  status: "published",
  published: today,
}, `# 高三進階程式設計課程學習成果

高三時期進階程式設計課程的學習成果簡報，涵蓋各項程式專題與實作紀錄。

請點卡片上的「檢視 PDF」開啟完整簡報。
`);

writeMd("learning-portfolio-117-11.md", {
  title: "學習歷程 117-11",
  slug: "learning-portfolio-117-11",
  category: "人文",
  summary: "高中階段的學習歷程檔案，記錄學科成就、課外參與及個人成長軌跡。",
  cover: "images/pic_note6.jpg",
  pdf: "pdfs/學習歷程117-11.pdf",
  status: "published",
  published: today,
}, `# 學習歷程 117-11

高中階段的學習歷程檔案，記錄學科成就、課外參與及個人成長軌跡。

請點卡片上的「檢視 PDF」開啟完整檔案。
`);

console.log("\nReady. Import with --publish.");
