const ACG_WORKER_URL = window.location.protocol === "file:"
  ? "http://127.0.0.1:8000"
  : "";

window.ACG_CONFIG = Object.freeze({
  supabaseUrl: "https://xpztpetskjohuxrpgmcm.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwenRwZXRza2pvaHV4cnBnbWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzkxNjUsImV4cCI6MjA5ODc1NTE2NX0.c_hrG4w-u1swTVpp1yYnFJNVErhyplryiEF_8P-qCJA",
  workerUrl: ACG_WORKER_URL,
  manualSyncUrl: "https://github.com/linyize1111/acg-portal/actions/workflows/scheduled-sync.yml",
  googleProviderEnabled: "auto",
  platforms: ["nhentai", "18comic"],
  version: "2.0.2",
  githubRepoUrl: "https://github.com/linyize1111/acg-portal"
});
