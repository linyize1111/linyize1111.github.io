const ACG_WORKER_URL = window.location.protocol === "file:"
  ? "http://127.0.0.1:8000"
  : "";

// Do not Object.freeze — localhost may overlay config.local.js (flavor: local).
// Deployed Pages never ships config.local.js; resolveSiteFlavor also force-public off localhost.
window.ACG_CONFIG = {
  supabaseUrl: "https://xpztpetskjohuxrpgmcm.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwenRwZXRza2pvaHV4cnBnbWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzkxNjUsImV4cCI6MjA5ODc1NTE2NX0.c_hrG4w-u1swTVpp1yYnFJNVErhyplryiEF_8P-qCJA",
  workerUrl: ACG_WORKER_URL,
  localApiUrl: "",
  manualSyncUrl: "https://github.com/linyize1111/acg-portal/actions/workflows/scheduled-sync.yml",
  googleProviderEnabled: "auto",
  platforms: ["nhentai", "18comic"],
  version: "2.2.3",
  flavor: "public",
  githubRepoUrl: "https://github.com/linyize1111/yoru-archive",
  // Voluntary tip jar. Official HTTPS URL only (Portaly / ECPay / O'Pay / BMC). Empty hides the button.
  // Buy Me a Coffee cannot pay out to Taiwan; do not use it until that changes.
  supportTipUrl: "https://portaly.cc/yoruarchive/support"
};
