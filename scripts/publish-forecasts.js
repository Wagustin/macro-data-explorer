// Publishes validated PerData Engine forecasts from data/engine-rows.json to Supabase and Cloudflare D1.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pruneD1, syncD1 } from "./d1-sync.js";
import { ENGINE, ENGINE_FALLBACKS } from "../api/_lib/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_HORIZONS = new Set([1, 3, 6, 12]);

const reportPath = path.join(ROOT, "data", "engine-report.json");
if (fs.existsSync(reportPath)) {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report && report.exito === false) {
      console.error("No se puede publicar: la validación en data/engine-report.json no fue aprobada.");
      process.exit(1);
    }
  } catch (err) {
    console.warn("Aviso: no se pudo leer engine-report.json:", err.message);
  }
}

const rowsPath = path.join(ROOT, "data", "engine-rows.json");
if (!fs.existsSync(rowsPath)) {
  console.error("No se encontró data/engine-rows.json");
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(rowsPath, "utf8"));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("data/engine-rows.json está vacío o no contiene un arreglo de proyecciones.");
  process.exit(1);
}

const runDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) {
  console.log("Sin credenciales de Supabase: omitiendo subida a base de datos");
  process.exit(0);
}

for (let i = 0; i < rows.length; i += 200) {
  const r = await fetch(`${base}/rest/v1/forecasts?on_conflict=symbol,horizon,model`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows.slice(i, i + 200)),
  });
  if (!r.ok) {
    throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}
console.log(`Guardadas ${rows.length} filas en Supabase`);

// Rows from earlier runs that this run did not rewrite would keep serving old numbers
const runAt = rows[0].run_at;
const models = [ENGINE.id, ...ENGINE_FALLBACKS];
const stale = await fetch(`${base}/rest/v1/forecasts?model=in.(${models.join(",")})&run_at=lt.${encodeURIComponent(runAt)}`, {
  method: "DELETE",
  headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" },
});
if (!stale.ok) console.warn(`Aviso: no se limpiaron filas antiguas en Supabase: HTTP ${stale.status}`);
await pruneD1("forecasts", { models, before: runAt });

const historyRows = rows
  .filter((row) => HISTORY_HORIZONS.has(row.horizon))
  .map(({ symbol, horizon, last_close, p10, p50, p90 }) => ({
    symbol,
    horizon,
    run_date: runDate,
    last_close,
    p10,
    p50,
    p90,
  }));

let historySaved = true;
for (let i = 0; i < historyRows.length; i += 200) {
  const r = await fetch(`${base}/rest/v1/forecast_history?on_conflict=symbol,horizon,run_date`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(historyRows.slice(i, i + 200)),
  });
  if (!r.ok) {
    const detail = await r.text();
    if (r.status === 404 || /relation .* does not exist|could not find the table/i.test(detail)) {
      console.warn(`Aviso: no se guardó forecast_history (tabla aún no disponible): HTTP ${r.status}`);
      historySaved = false;
      break;
    }
    throw new Error(`Supabase forecast_history HTTP ${r.status}: ${detail.slice(0, 200)}`);
  }
}
if (historyRows.length && historySaved) {
  console.log(`Guardadas ${historyRows.length} instantáneas en forecast_history`);
}

await syncD1("forecasts", rows, 100);
console.log("Sincronización con Cloudflare D1 completada");
