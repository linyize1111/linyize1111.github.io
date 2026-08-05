/**
 * Site section model (UI):
 *   notes + essay mode     → 隨筆（隨想／日記／心得／隨筆〔UI：散文〕）
 *   literature             → 文學創作（創作／長文）
 *   notes + academic mode  → 學科筆記（僅 admin 導覽；分類：資安／ML／程式／人文）
 *
 * 「感想」已退場：讀取時 alias 成隨想；後台不再提供新建。
 * DB 值「隨筆」保留；UI 顯示為「散文」。
 */
(function () {
  "use strict";

  var ACADEMIC_CATEGORIES = ["資訊安全", "機器學習", "程式語言", "人文"];
  var ESSAY_CATEGORIES = ["隨想", "日記", "心得", "隨筆"];
  var LITERATURE_CATEGORIES = ["創作", "長文"];

  function normalizeCategory(cat) {
    var c = String(cat || "").trim();
    if (c === "短思" || c === "碎念" || c === "短文") return "隨想";
    if (c === "生活札記" || c === "札記" || c === "日常") return "日記";
    if (c === "短感想" || c === "隨感" || c === "感想") return "隨想";
    if (c === "閱讀心得" || c === "讀後感" || c === "心得感想") return "心得";
    if (c === "文學創作" || c === "小說" || c === "詩") return "創作";
    if (c === "散文" || c === "長隨筆") return "隨筆";
    return c;
  }

  /** UI label：DB「隨筆」→「散文」；其餘原樣 */
  function displayCategory(cat) {
    var n = normalizeCategory(cat);
    if (n === "隨筆") return "散文";
    return n;
  }

  function isAcademicCategory(cat) {
    return ACADEMIC_CATEGORIES.indexOf(normalizeCategory(cat)) !== -1;
  }

  function isThoughtCategory(cat) {
    var n = normalizeCategory(cat);
    return n === "隨想" || n === "日記";
  }

  function filterByListMode(rows, mode) {
    rows = rows || [];
    if (mode === "academic") {
      return rows.filter(function (a) {
        return isAcademicCategory(a.category);
      });
    }
    if (mode === "essay") {
      return rows.filter(function (a) {
        return !isAcademicCategory(a.category);
      });
    }
    return rows;
  }

  function categoriesForUiSection(uiSection) {
    if (uiSection === "academic") return ACADEMIC_CATEGORIES.slice();
    if (uiSection === "notes") return ESSAY_CATEGORIES.slice();
    return LITERATURE_CATEGORIES.slice();
  }

  window.SBSections = {
    ACADEMIC_CATEGORIES: ACADEMIC_CATEGORIES,
    ESSAY_CATEGORIES: ESSAY_CATEGORIES,
    LITERATURE_CATEGORIES: LITERATURE_CATEGORIES,
    normalizeCategory: normalizeCategory,
    displayCategory: displayCategory,
    isAcademicCategory: isAcademicCategory,
    isThoughtCategory: isThoughtCategory,
    filterByListMode: filterByListMode,
    categoriesForUiSection: categoriesForUiSection,
  };
})();
