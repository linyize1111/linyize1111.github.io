/**
 * Strip static note-item fallbacks from list pages (V3 P0 privacy / source-of-truth).
 */
import fs from "node:fs";

const files = ["directory.html", "literature.html", "academic.html"];

for (const f of files) {
  let html = fs.readFileSync(f, "utf8");
  const re =
    /(<section[^>]*id="posts-container"[^>]*>)([\s\S]*?)(<\/section>)/i;
  const m = html.match(re);
  if (!m) {
    console.warn("no posts-container", f);
    continue;
  }
  const before = (m[2].match(/<article[\s\S]*?<\/article>/gi) || []).length;
  const cleaned =
    m[1] +
    "\n                <!-- CMS-only: no static article fallback (V3) -->\n            " +
    m[3];
  html = html.replace(re, cleaned);
  // Soften academic page copy that leaks purpose to guests before JS — keep title minimal
  if (f === "academic.html") {
    html = html.replace(
      /資安、機器學習、程式語言與人文等課程／自學筆記。<br \/><br \/>\s*此區僅管理員登入後才會出現在導覽；訪客無法從選單進入。/,
      "管理員專用區。"
    );
  }
  fs.writeFileSync(f, html);
  console.log(f, "removed articles", before);
}
