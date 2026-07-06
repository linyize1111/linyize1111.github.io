const ACG_WORKER_URL = window.location.hostname.endsWith("github.io")
  ? "https://acg-portal.onrender.com"
  : window.location.protocol === "file:"
    ? "http://127.0.0.1:8000"
    : window.location.origin;

window.ACG_CONFIG = Object.freeze({
  supabaseUrl: "https://xpztpetskjohuxrpgmcm.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwenRwZXRza2pvaHV4cnBnbWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzkxNjUsImV4cCI6MjA5ODc1NTE2NX0.c_hrG4w-u1swTVpp1yYnFJNVErhyplryiEF_8P-qCJA",
  workerUrl: ACG_WORKER_URL,
  // "auto" makes the frontend read Supabase Auth settings at runtime. Once
  // the provider is enabled in Supabase, Google login becomes available
  // without another frontend deployment.
  googleProviderEnabled: "auto",
  platforms: ["nhentai", "18comic", "hanime", "pixiv"]
});
