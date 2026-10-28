const STATUS_RANK = {
  sin_negociacion: 0,
  dormida: 1,
  parada: 2,
  poca_liquidez: 3,
  con_proyeccion: 4,
};

const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export function classifySecurity(value, rows, { now = new Date(), projected = false } = {}) {
  const quotes = (rows || [])
    .filter((row) => isoDate(row.fecha))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const operations = quotes.filter((row) => Number(row.monto) > 0);
  const cutoff365 = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const cutoff36m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 36, now.getUTCDate())).toISOString().slice(0, 10);
  const operations12m = operations.filter((row) => row.fecha >= cutoff365);
  const months36m = new Set(operations.filter((row) => row.fecha >= cutoff36m).map((row) => row.fecha.slice(0, 7)));
  const first = quotes[0] || null;
  const last = operations.at(-1) || null;
  const ageDays = last ? Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.parse(`${last.fecha}T00:00:00Z`)) / 86400000) : Infinity;

  let estado = "sin_negociacion";
  if (projected) estado = "con_proyeccion";
  else if (!last) estado = "sin_negociacion";
  else if (ageDays > 365) estado = "dormida";
  else if (ageDays > 40) estado = "parada";
  else estado = "poca_liquidez";

  return {
    estado,
    nemonico: value.nemonico,
    primera_fecha: first?.fecha || null,
    ultima_fecha: last?.fecha || null,
    ultimo_cierre: last && Number.isFinite(Number(last.cierre)) ? Number(last.cierre) : null,
    moneda: value.moneda || null,
    operaciones_12m: operations12m.length,
    meses_con_operaciones_36m: months36m.size,
  };
}

export function buildIssuerStatuses(issuers, rows, projectedSymbols, { now = new Date() } = {}) {
  const bySymbol = new Map();
  for (const row of rows || []) {
    if (!row.nemonico) continue;
    const list = bySymbol.get(row.nemonico) || [];
    list.push(row);
    bySymbol.set(row.nemonico, list);
  }

  const result = {};
  for (const issuer of issuers || []) {
    const securities = (issuer.valores || []).map((value) => classifySecurity(value, bySymbol.get(value.nemonico), {
      now,
      projected: projectedSymbols.has(value.simbolo_proyeccion || `${value.nemonico}.LM`),
    }));
    securities.sort((a, b) => STATUS_RANK[b.estado] - STATUS_RANK[a.estado] || (b.ultima_fecha || "").localeCompare(a.ultima_fecha || ""));
    const best = securities[0];
    if (!best) continue;
    result[issuer.codigoBVL] = {
      estado: best.estado,
      nemonico: best.nemonico,
      ultima_fecha: best.ultima_fecha,
      ultimo_cierre: best.ultimo_cierre,
      moneda: best.moneda,
      operaciones_12m: best.operaciones_12m,
    };
  }
  return result;
}
