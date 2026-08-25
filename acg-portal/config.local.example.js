(() => {
  // Copy to frontend/config.local.js (gitignored). Only loaded on localhost.
  // Never deploy this file to GitHub Pages.
  window.ACG_CONFIG = Object.assign({}, window.ACG_CONFIG || {}, {
    version: "2.2.0",
    flavor: "local",
    // Point at local Postgres / local Supabase if running WP3 full mode.
    // Leave empty to keep using production URL while developing UI only (covers still blocked in public UI).
    localApiUrl: "http://127.0.0.1:54321",
    // Optional: override supabaseUrl / supabaseAnonKey for yoru_personal.
    // supabaseUrl: "http://127.0.0.1:54321",
    // supabaseAnonKey: "local-anon-key"
  });
})();
