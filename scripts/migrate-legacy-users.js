/**
 * One-off: copies accounts from the old bundled data/users.json into Supabase so
 * they keep signing in after the file stops being deployed. Existing emails are
 * left untouched. Passwords keep working (same salt/hash/iterations).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrate-legacy-users.js [--dry-run]
 */

import fs from "fs";

const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
const dryRun = process.argv.includes("--dry-run");
if (!url || !key) {
  console.error("Define SUPABASE_URL y SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const file = new URL("../data/users.json", import.meta.url);
const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
const users = (Array.isArray(parsed) ? parsed : parsed.users || []).filter(u => u.email && u.salt && u.hash && !String(u.id).startsWith("sso_"));

const rows = users.map(u => ({
  id: u.id,
  email: u.email.toLowerCase(),
  name: u.name || u.email.split("@")[0],
  role: "user",
  salt: u.salt,
  hash: u.hash,
  iterations: u.iterations || 100000,
  provider: u.provider || null,
  created_at: u.created_at || new Date().toISOString()
}));

console.log(`${rows.length} cuentas en data/users.json:`, rows.map(r => r.email).join(", "));
if (dryRun) process.exit(0);

const res = await fetch(`${url}/rest/v1/users?on_conflict=email`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=ignore-duplicates,return=representation"
  },
  body: JSON.stringify(rows)
});
const body = await res.text();
if (!res.ok) {
  console.error("Error:", res.status, body);
  process.exit(1);
}
console.log(`Insertadas ${JSON.parse(body).length} cuentas nuevas (las existentes se dejaron igual).`);
