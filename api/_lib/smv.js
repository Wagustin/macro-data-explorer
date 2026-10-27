/**
 * Lima stock exchange closes from the SMV public registry, stored in Supabase (cotizaciones_smv)
 * by scripts/fetch-smv-precios.js. Used by /api/historical and scripts/refresh-history.js for the
 * ".LM" symbols; both fall back to the previous source when there are no rows yet.
 */
const base = () => (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SERVICE_KEY || "";

export const nemonicoOf = (symbol) => (/\.LM$/i.test(symbol) ? symbol.replace(/\.LM$/i, "").toUpperCase() : null);

// Rows of one security, newest first, from `desde` (YYYY-MM-DD). monthly=true keeps one row per month
// (the last trading day; for the current month, the latest close).
export async function smvRows(nemonico, desde, { monthly = false, limit = 1000, timeoutMs = 3000 } = {}) {
  if (!base() || !key()) return [];
  const url = `${base()}/rest/v1/cotizaciones_smv?nemonico=eq.${encodeURIComponent(nemonico)}&fecha=gte.${desde}` +
    `${monthly ? "&fin_de_mes=is.true" : ""}&select=fecha,cierre,apertura,maximo,minimo,monto&order=fecha.desc&limit=${limit}`;
  const r = await fetch(url, { headers: { apikey: key(), Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
  return (await r.json()).map((x) => ({
    fecha: x.fecha, cierre: Number(x.cierre), apertura: x.apertura == null ? null : Number(x.apertura),
    maximo: x.maximo == null ? null : Number(x.maximo), minimo: x.minimo == null ? null : Number(x.minimo),
    monto: x.monto == null ? 0 : Number(x.monto),
  }));
}

// Marks the last trading day of each month in a set of rows of one security (in place)
export function markMonthEnds(rows) {
  const last = new Map();
  for (const r of rows) {
    const m = r.fecha.slice(0, 7);
    if (!last.has(m) || r.fecha > last.get(m)) last.set(m, r.fecha);
  }
  for (const r of rows) r.fin_de_mes = last.get(r.fecha.slice(0, 7)) === r.fecha;
  return rows;
}
