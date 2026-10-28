/**
 * Cloudflare D1 (binding PERDATA_DB, database perdata-data): the Worker's own copy of the public data
 * (forecasts and Lima closes). Reads try D1 first (same network as the Worker) and fall back to
 * Supabase; the pipelines write to both (api/sync.js). Accounts and payments stay in Supabase only.
 * Outside the Worker (Node, GitHub Actions) there is no binding and every helper returns null.
 */
export const d1 = () => globalThis.PERDATA_DB || null;

export const SCHEMA = [
  `create table if not exists sync_meta (table_name text primary key, synced_at text not null)`,
  `create table if not exists forecasts (symbol text not null, horizon integer not null, model text not null, run_at text not null,
    last_close real, p10 real, p25 real, p50 real, p75 real, p90 real, path text, primary key (symbol, horizon, model))`,
  `create table if not exists cotizaciones_smv (nemonico text not null, fecha text not null, cierre real not null, apertura real,
    maximo real, minimo real, monto real, fin_de_mes integer not null default 0, primary key (nemonico, fecha))`,
  `create index if not exists cotizaciones_smv_fecha on cotizaciones_smv (fecha)`,
  `create table if not exists interpretaciones (symbol text primary key, texto text not null, actualizado text not null)`,
];

let ready = null;
export function ensureSchema(db) {
  ready = ready || db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; });
  return ready;
}

// Rows of a query, or null when there is no D1 or it fails (the caller falls back to Supabase)
export async function d1Rows(sql, ...params) {
  const db = d1();
  if (!db) return null;
  try {
    return (await db.prepare(sql).bind(...params).all()).results || [];
  } catch (e) {
    return null;
  }
}
