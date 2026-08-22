window.ACG_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  workerUrl: "",
  localApiUrl: "",
  manualSyncUrl: "https://github.com/OWNER/REPO/actions/workflows/scheduled-sync.yml",
  googleProviderEnabled: "auto",
  platforms: ["nhentai", "18comic"],
  version: "2.2.0",
  flavor: "public",
  // Local-only override: create config.local.js with flavor:"local" and localApiUrl.
  // Never deploy config.local.js to GitHub Pages.
  githubRepoUrl: "https://github.com/linyize1111/yoru-archive",
  // Voluntary tip jar. Official HTTPS URL only (Portaly / ECPay / O'Pay / BMC). Empty hides the button.
  supportTipUrl: ""
};
