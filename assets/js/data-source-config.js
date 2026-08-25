/**
 * data-source-config.js
 *
 * Dual-source switch for personal-site CMS reads.
 * Production default is "static" after cutover (2026-08-25).
 *
 * Values:
 *   supabase — live reads from Supabase (rollback path)
 *   static   — reads JSON under content/cms/ (Plan A production)
 *
 * Never put Neon / DB / service_role credentials here.
 */
window.CMS_DATA_CONFIG = {
  source: "static",
  staticBase: "content/cms",
};
