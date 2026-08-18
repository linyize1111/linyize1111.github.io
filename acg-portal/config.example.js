const ACG_WORKER_URL = window.location.protocol === "file:"
  ? "http://127.0.0.1:8000"
  : "";

// Copy to config.js and fill in your own project values.
// supabaseAnonKey is the browser publishable/anon key (client-side configuration).
// Never put privileged service credentials, database passwords, or JWTs in this file.
window.ACG_CONFIG = Object.freeze({
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_ANON_KEY",
  workerUrl: ACG_WORKER_URL,
  manualSyncUrl: "",
  googleProviderEnabled: "auto",
  platforms: ["nhentai", "18comic"],
  version: "2.1.1",
  githubRepoUrl: "https://github.com/linyize1111/yoru-archive"
});
