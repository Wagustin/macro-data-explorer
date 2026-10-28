/** Public freshness information for the data sources used by PerData. */
import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";
import { d1 } from "./_lib/d1.js";
import { backupStatus } from "./_lib/backup.js";

const hoursSince = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, Math.round(((Date.now() - time) / 36e5) * 10) / 10) : null;
};

function source(updatedAt, staleAfterHours, extra = {}) {
  return { updatedAt: updatedAt || null, ageHours: hoursSince(updatedAt), staleAfterHours, ...extra };
}

async function latestForecastRun() {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return source(null, 30, { error: "supabase_not_configured" });
  try {
    const r = await fetch(`${base}/rest/v1/forecasts?select=run_at&order=run_at.desc&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return source(null, 30, { error: `supabase_${r.status}` });
    const rows = await r.json();
    return source(rows[0]?.run_at, 30, { runAt: rows[0]?.run_at || null });
  } catch {
    return source(null, 30, { error: "supabase_unreachable" });
  }
}

async function latestSmvClose() {
  const smvSource = (fecha) => source(fecha ? `${fecha}T23:59:59Z` : null, 96, {
    fecha: fecha || null,
    observationDate: fecha || null,
    ageDays: fecha ? Math.max(0, Math.floor((Date.now() - Date.parse(fecha)) / 864e5)) : null,
  });
  const db = d1();
  if (db) {
    try {
      const row = await db.prepare("select fecha from cotizaciones_smv order by fecha desc limit 1").first();
      if (row?.fecha) return smvSource(row.fecha);
    } catch { /* Try Supabase when D1 is unavailable or empty. */ }
  }
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return source(null, 96, { error: "supabase_not_configured" });
  try {
    const r = await fetch(`${base}/rest/v1/cotizaciones_smv?select=fecha&order=fecha.desc&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return source(null, 96, { error: `supabase_${r.status}` });
    const fecha = (await r.json())[0]?.fecha || null;
    return smvSource(fecha);
  } catch {
    return source(null, 96, { error: "supabase_unreachable" });
  }
}

async function latestNews() {
  try {
    const r = await fetch("https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/noticias.json", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error("news unavailable");
    const d = await r.json();
    return source(d.actualizado, 6, { count: (d.noticias || []).length });
  } catch {
    return source(null, 6, { error: "news_unreachable" });
  }
}

async function latestOfficial(file, staleAfterHours) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/official/${file}.json`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error("official data unavailable");
    const data = await r.json();
    const dates = Object.values(data.series || {}).flatMap((item) => {
      const rows = Array.isArray(item) ? item : item.serie;
      return Array.isArray(rows) ? rows.map((row) => row?.[0]).filter(Boolean) : [];
    }).sort();
    return source(dates.at(-1) ? `${dates.at(-1)}T23:59:59Z` : null, staleAfterHours, { observationDate: dates.at(-1) || null });
  } catch {
    return source(null, staleAfterHours, { error: "official_data_unreachable" });
  }
}

async function latestD1Sync() {
  const db = d1();
  if (!db) return source(null, 30, { error: "d1_unavailable" });
  try {
    const row = await db.prepare("select max(synced_at) as synced_at from sync_meta").first();
    return source(row?.synced_at, 30);
  } catch {
    return source(null, 30, { error: "d1_sync_time_unavailable" });
  }
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  if (handleRateLimit(req, res)) return;
  const [forecasts, news, smv, bcrp, eia, d1Sync, backup] = await Promise.all([
    latestForecastRun(), latestNews(), latestSmvClose(), latestOfficial("bcrp-daily", 96), latestOfficial("eia-oil", 96), latestD1Sync(), backupStatus(globalThis.PERDATA_BACKUPS ? { BACKUPS: globalThis.PERDATA_BACKUPS } : null),
  ]);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, now: new Date().toISOString(), forecasts, news, smv, bcrp, eia, d1Sync, backup }));
}
