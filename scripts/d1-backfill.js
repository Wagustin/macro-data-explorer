// One-time (or repair) copy of Supabase into the Worker's D1 database (d1-backfill.yml): today's
// PerData Engine forecasts, every month-end close and the daily closes of the last two years
// (what the site reads; the full daily history stays in Supabase).
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ENGINE } from "../api/_lib/engine.js";
import { syncD1 } from "./d1-sync.js";

async function fetchAll(base, key, query, fetchImpl = fetch) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetchImpl(`${base}/rest/v1/${query}&limit=1000&offset=${from}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function backfillD1({ env = process.env, fetchImpl = fetch, sync = syncD1, now = Date.now() } = {}) {
  const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key || !env.SYNC_SECRET) throw new Error("Faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o SYNC_SECRET");

  const since = new Date(now - 2 * 365 * 864e5).toISOString().slice(0, 10);
  const quotes = await fetchAll(base, key, `cotizaciones_smv?or=(fecha.gte.${since},fin_de_mes.is.true)&select=*&order=nemonico,fecha`, fetchImpl);
  console.log(`Cotizaciones a copiar: ${quotes.length}`);
  await sync("cotizaciones_smv", quotes, 500, { strict: true, fetchImpl });
  const forecasts = await fetchAll(base, key, `forecasts?model=eq.${ENGINE.id}&select=*&order=symbol,horizon`, fetchImpl);
  console.log(`Proyecciones a copiar: ${forecasts.length}`);
  await sync("forecasts", forecasts, 100, { strict: true, fetchImpl });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  backfillD1().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
