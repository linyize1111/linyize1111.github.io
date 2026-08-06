import assert from "node:assert/strict";
import { detectAnomalies, classify } from "../tools/content_repair/detect.mjs";
import { safeRepairArticle } from "../tools/content_repair/repair.mjs";

function test(name, fn) {
  fn();
  console.log("ok", name);
}

test("title_looks_like_body with missing body text → manual restore", () => {
  const d = detectAnomalies({
    title: "小孩笑得那樣開朗，突然意識到，不願妥協是一種純真，是一種看似頑固的清醒。",
    body: "後續段落。",
    summary: "",
  });
  assert.ok(d.flags.includes("title_looks_like_body"));
  assert.ok(d.flags.includes("content_parked_in_title"));
  assert.equal(classify(d), "needs_manual_restore");
});

test("title_looks_like_body but text still in body → needs_review", () => {
  const title = "小孩笑得那樣開朗，突然意識到，不願妥協是一種純真，是一種看似頑固的清醒。";
  const d = detectAnomalies({
    title,
    body: title + "\n\n後續段落說明成長與妥協。",
    summary: "",
  });
  assert.ok(d.flags.includes("title_looks_like_body"));
  assert.equal(classify(d), "needs_review");
});

test("duplicate title opening is safe_auto_repair", () => {
  const article = {
    title: "海面的霓虹",
    body: "海面的霓虹\n\n內文繼續。\n\n\n\n更多。",
    summary: "",
    presentation: "photo-note",
    cover_display: {},
  };
  const d = detectAnomalies(article);
  assert.ok(d.flags.includes("title_duplicates_body_opening") || d.flags.includes("excess_blank_lines"));
  const { changes, patch } = safeRepairArticle(article, d);
  assert.ok(changes.length >= 1);
  assert.ok(!patch.body.startsWith("海面的霓虹\n\n海面的霓虹"));
});

test("stub marker → needs_manual_restore", () => {
  const d = detectAnomalies({
    title: "普通心理學筆記",
    body: "概要。目前僅保留概要，完整筆記待補。",
    summary: "",
  });
  assert.equal(classify(d), "needs_manual_restore");
});

test("summary truncation flagged for review", () => {
  const body = "甲乙丙丁戊己庚辛壬癸。".repeat(20);
  const d = detectAnomalies({
    title: "測試",
    body,
    summary: body.slice(0, 80),
  });
  assert.ok(d.flags.includes("summary_is_body_truncation"));
  assert.equal(classify(d), "needs_review");
});

test("safe repair never invents prose", () => {
  const article = {
    title: "贖回自由",
    body: "在那之後，一生的庸庸碌碌。",
    summary: "",
    presentation: "fragment",
    cover_display: {},
  };
  const d = detectAnomalies(article);
  const { patch } = safeRepairArticle(article, { ...d, flags: ["excess_blank_lines"] });
  assert.ok(patch.body.includes("在那之後"));
  assert.equal(patch.title, "贖回自由");
});

console.log("all content-repair tests passed");
