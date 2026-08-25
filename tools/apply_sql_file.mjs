/**
 * Apply SQL migration via direct Postgres connection.
 * Usage: node tools/apply_sql_file.mjs supabase/migrations/0006_academic_privacy_rls.sql
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node tools/apply_sql_file.mjs <sql-file>");
  process.exit(1);
}

const ref = process.env.MAIN_SUPABASE_REF || process.env.SUPABASE_REF;
const password = process.env.MAIN_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD;
if (!ref || !password) {
  console.error("Need MAIN_SUPABASE_REF and MAIN_SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");
const hosts = [
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`,
];

let lastErr;
for (const conn of hosts) {
  const client = new pg.Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  });
  try {
    console.log("try", conn.replace(password, "***").replace(encodeURIComponent(password), "***"));
    await client.connect();
    await client.query(sql);
    console.log("✔ applied", file);
    await client.end();
    process.exit(0);
  } catch (e) {
    lastErr = e;
    console.warn("fail:", e.message);
    try { await client.end(); } catch (_) {}
  }
}
console.error("All hosts failed:", lastErr && lastErr.message);
process.exit(1);
