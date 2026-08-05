/**
 * Site section model (UI):
 *   notes + essay mode     → 隨筆（隨想／日記／感想／心得／隨筆）
 *   literature             → 文學創作（創作／長文）
 *   notes + academic mode  → 學科筆記（僅 admin 導覽；分類：資安／ML／程式／人文）
 */
(function () {
  "use strict";

  var ACADEMIC_CATEGORIES = ["資訊安全", "機器學習", "程式語言", "人文"];

  function normalizeCategory(cat) {
    var c = String(cat || "").trim();
    if (c === "短思" || c === "碎念" || c === "短文") return "隨想";
    if (c === "生活札記" || c === "札記" || c === "日常") return "日記";
    if (c === "短感想" || c === "隨感") return "感想";
    if (c === "閱讀心得" || c === "讀後感" || c === "心得感想") return "心得";
    if (c === "文學創作" || c === "小說" || c === "詩") return "創作";
    return c;
  }

  function isAcademicCategory(cat) {
    return ACADEMIC_CATEGORIES.indexOf(normalizeCategory(cat)) !== -1;
  }

  function isThoughtCategory(cat) {
    var n = normalizeCategory(cat);
    return n === "隨想" || n === "日記" || n === "感想";
  }

  function filterByListMode(rows, mode) {
    rows = rows || [];
    if (mode === "academic") {
      return rows.filter(function (a) { return isAcademicCategory(a.category); });
    }
    if (mode === "essay") {
      return rows.filter(function (a) { return !isAcademicCategory(a.category); });
    }
    return rows;
  }

  window.SBSections = {
    ACADEMIC_CATEGORIES: ACADEMIC_CATEGORIES,
    normalizeCategory: normalizeCategory,
    isAcademicCategory: isAcademicCategory,
    isThoughtCategory: isThoughtCategory,
    filterByListMode: filterByListMode,
  };
})();
