import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("assets/js/supabase-client.js", "utf8");
assert.ok(src.includes("stripYamlFrontmatter"));
assert.ok(src.includes("yamlLines"));
assert.ok(src.includes("sentenceMarks"));

function stripYamlFrontmatter(md) {
  var text = String(md == null ? "" : md);
  var trimmed = text.trim();
  if (trimmed.indexOf("---") !== 0) return text;
  var close = trimmed.search(/\r?\n---\s*(?:\r?\n|$)/);
  if (close === -1) return text;
  var between = trimmed.slice(3, close);
  var yamlLines = between.split(/\r?\n/).filter(function (line) {
    return /^\s*[A-Za-z0-9_\u4e00-\u9fff][\w\u4e00-\u9fff.-]*\s*:/.test(line);
  });
  if (!yamlLines.length) return text;
  var sentenceMarks = (between.match(/[。！？]/g) || []).length;
  if (sentenceMarks >= 2 && yamlLines.length < 2) return text;
  var rest = trimmed.slice(close).replace(/^\r?\n---\s*/, "");
  return rest.replace(/^\r?\n/, "");
}

const fiction = `---

「該死的咖啡因！」

興許是今日的熱美式在作祟，總之我失眠了。

---

走進超商後
`;

const kept = stripYamlFrontmatter(fiction);
assert.ok(kept.includes("「該死的咖啡因！」"), "must keep opening scene");
assert.ok(kept.includes("走進超商後"), "must keep later scene");

const fictionNoLeading = `「該死的咖啡因！」

興許是今日的熱美式在作祟，總之我失眠了。

---

走進超商後
`;
assert.equal(stripYamlFrontmatter(fictionNoLeading), fictionNoLeading);

const yaml = `---
title: 該死的咖啡因
tags: 創作
---

正文開始
`;
const stripped = stripYamlFrontmatter(yaml);
assert.ok(!/title\s*:/.test(stripped), "must strip yaml keys");
assert.ok(stripped.includes("正文開始"));

console.log("frontmatter strip tests passed");
