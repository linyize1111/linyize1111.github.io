import fs from "node:fs";
import pg from "pg";

const file = process.argv[2];
const sql = fs.readFileSync(file, "utf8");
const ref = process.env.MAIN_SUPABASE_REF;
const password = process.env.MAIN_SUPABASE_DB_PASSWORD;
const regions = [
  "ap-northeast-1","ap-northeast-2","ap-southeast-1","ap-southeast-2","ap-south-1",
  "us-east-1","us-east-2","us-west-1","us-west-2",
  "eu-west-1","eu-west-2","eu-central-1","eu-north-1","sa-east-1","ca-central-1"
];

async function tryClient(opts, label) {
  const client = new pg.Client({ ...opts, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    console.log("CONNECTED", label);
    await client.query(sql);
    console.log("APPLIED", file);
    const { rows } = await client.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='articles' order by 1"
    );
    console.log("COLS", rows.map(r => r.column_name).join(","));
    await client.end();
    return true;
  } catch (e) {
    console.log("fail", label, String(e.message).slice(0, 100));
    try { await client.end(); } catch {}
    return false;
  }
}

if (await tryClient({ host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password, database: "postgres" }, "direct")) process.exit(0);
for (const region of regions) {
  for (const port of [5432, 6543]) {
    const ok = await tryClient({
      host: `aws-0-${region}.pooler.supabase.com`,
      port,
      user: `postgres.${ref}`,
      password,
      database: "postgres",
    }, `pooler ${region}:${port}`);
    if (ok) process.exit(0);
  }
}
console.error("NO_CONNECTION");
process.exit(2);
