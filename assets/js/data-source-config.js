/**
 * data-source-config.js
 *
 * Dual-source switch for personal-site CMS reads.
 * Production default MUST remain "supabase" until an explicit cutover task.
 *
 * Values:
 *   supabase — live reads from existing Supabase (OLD, current production)
 *   static   — reads JSON under content/cms/ (Plan A durable exit target)
 *
 * Never put Neon / DB / service_role credentials here.
 */
window.CMS_DATA_CONFIG = {
  source: "supabase",
  staticBase: "content/cms",
};
