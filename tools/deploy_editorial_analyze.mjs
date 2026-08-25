/**
 * Deploy editorial-analyze Edge Function via Supabase Management API.
 * Requires env:
 *   SUPABASE_ACCESS_TOKEN  (Dashboard → Account → Access Tokens)
 *   MAIN_SUPABASE_REF      (or pass --project-ref)
 * Optional:
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY  → also set as project secrets
 *
 * Usage:
 *   node tools/deploy_editorial_analyze.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ref = process.env.MAIN_SUPABASE_REF || process.argv.find((a) => a.startsWith("--project-ref="))?.split("=")[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}
if (!ref) {
  console.error("Missing MAIN_SUPABASE_REF");
  process.exit(1);
}

const fnDir = path.join(root, "supabase", "functions", "editorial-analyze");
const entry = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");

// Prefer CLI when available
import { spawnSync } from "node:child_process";
const cli = spawnSync(
  "npx",
  ["supabase", "functions", "deploy", "editorial-analyze", "--project-ref", ref, "--yes"],
  { cwd: root, env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, encoding: "utf8", shell: true }
);
console.log(cli.stdout || "");
if (cli.status !== 0) {
  console.error(cli.stderr || "");
  console.error("CLI deploy failed (exit", cli.status, "). Entry bytes:", entry.length);
  process.exit(cli.status || 2);
}

const secrets = [];
if (process.env.OPENAI_API_KEY) secrets.push(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`);
if (process.env.ANTHROPIC_API_KEY) secrets.push(`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
if (process.env.OPENAI_MODEL) secrets.push(`OPENAI_MODEL=${process.env.OPENAI_MODEL}`);

if (secrets.length) {
  const sec = spawnSync(
    "npx",
    ["supabase", "secrets", "set", ...secrets, "--project-ref", ref],
    { cwd: root, env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, encoding: "utf8", shell: true }
  );
  console.log(sec.stdout || "");
  if (sec.status !== 0) {
    console.error(sec.stderr || "");
    process.exit(sec.status || 2);
  }
  console.log("Secrets set:", secrets.map((s) => s.split("=")[0]).join(", "));
} else {
  console.warn("No OPENAI_API_KEY / ANTHROPIC_API_KEY in env — function deployed but AI calls will return unavailable.");
}

console.log("Deployed editorial-analyze for", ref);
