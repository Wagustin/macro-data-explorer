// One-time (or repair) copy of Supabase into the Worker's D1 database (d1-backfill.yml): today's
// PerData Engine forecasts, every month-end close and the daily closes of the last two years
// (what the site reads; the full daily history stays in Supabase).
import { ENGINE } from "../api/_lib/engine.js";
import { syncD1 } from "./d1-sync.js";

const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key || !process.env.SYNC_SECRET) { console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o SYNC_SECRET"); process.exit(1); }

async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/rest/v1/${query}&limit=1000&offset=${from}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const since = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
const quotes = await all(`cotizaciones_smv?or=(fecha.gte.${since},fin_de_mes.is.true)&select=*&order=nemonico,fecha`);
console.log(`Cotizaciones a copiar: ${quotes.length}`);
await syncD1("cotizaciones_smv", quotes, 500);
const forecasts = await all(`forecasts?model=eq.${ENGINE.id}&select=*&order=symbol,horizon`);
console.log(`Proyecciones a copiar: ${forecasts.length}`);
await syncD1("forecasts", forecasts, 100);
