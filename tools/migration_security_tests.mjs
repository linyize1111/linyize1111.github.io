#!/usr/bin/env node
/**
 * migration_security_tests.mjs — static security / dual-source guardrails
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
let failed = 0;

function ok(name, cond, detail) {
  if (cond) console.log("PASS", name);
  else {
    failed++;
    console.error("FAIL", name, detail || "");
  }
}

const cfg = fs.readFileSync(path.join(ROOT, "assets", "js", "data-source-config.js"), "utf8");
ok("prod_default_supabase", /source:\s*"supabase"/.test(cfg));

const ds = fs.readFileSync(path.join(ROOT, "assets", "js", "cms-data.js"), "utf8");
ok("no_service_role_in_cms_data", !/service_role|SERVICE_ROLE|DATABASE_URL|neon\.tech/i.test(ds));

const pages = ["index.html", "about.html", "literature.html", "directory.html", "note.html"];
for (const p of pages) {
  const html = fs.readFileSync(path.join(ROOT, p), "utf8");
  ok(p + "_loads_data_source_config", html.includes("data-source-config.js"));
  ok(p + "_loads_cms_data", html.includes("cms-data.js"));
}

const supabaseCfg = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-config.js"), "utf8");
ok(
  "no_service_role_key_assigned_in_frontend",
  !/service[_-]?role[_-]?key\s*[:=]\s*["']eyJ/i.test(supabaseCfg) &&
    !/service_role["']\s*:\s*["']eyJ/i.test(supabaseCfg)
);
ok("anon_key_present_public", /anonKey:\s*"eyJ/.test(supabaseCfg));

// content/cms must not contain obvious secrets
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const cmsFiles = walk(path.join(ROOT, "content", "cms"));
for (const f of cmsFiles) {
  if (!/\.(json|md|txt)$/i.test(f)) continue;
  const t = fs.readFileSync(f, "utf8");
  ok(
    "no_secret_markers:" + path.relative(ROOT, f),
    !/service_role|BEGIN PRIVATE KEY|DATABASE_URL\s*=\s*postgres/i.test(t)
  );
}

const analytics = fs.readFileSync(path.join(ROOT, "assets", "js", "analytics.js"), "utf8");
ok("static_mode_skips_rpc_write", /source\(\) === "static"\) return/.test(analytics) || /dataSource\(\) === "static"\) return/.test(analytics));

ok("gitignore_exists", fs.existsSync(path.join(ROOT, ".gitignore")));
ok(
  "gitignore_blocks_env",
  /\.env/.test(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"))
);

process.exit(failed ? 1 : 0);
