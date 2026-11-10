// Evaluates historical accuracy of PEN=X (USD/PEN) daily forecasts against official BCRP closes.
// Horizons: 1 business day, 1 week (5 business days), 1 month (~22 business days).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchT } from "./http.js";
import { addBusinessDays, PERU_HOLIDAYS } from "./engine-daily.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BCRP_PATH = path.join(ROOT, "data", "official", "bcrp-daily.json");
const OUTPUT_PATH = path.join(ROOT, "data", "official", "aciertos-dolar.json");

const HORIZONS = {
  dia: 1,
  semana: 5,
  mes: 22,
};

/**
 * Pure function: compares forecasts against actual closes.
 * @param {Array<Object>} forecasts - Array of {symbol, horizon, run_date, last_close, p10, p50, p90}
 * @param {Array<[string, number]>} officialSerie - BCRP daily series [[date, close], ...]
 * @returns {Object} Result per horizon with stats and last 60 cases
 */
export function evaluateForecasts(forecasts, officialSerie) {
  // Build a map for fast lookup: date -> close
  const officialMap = new Map(officialSerie.map(([d, c]) => [d, c]));

  const result = {};
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  for (const [label, h] of Object.entries(HORIZONS)) {
    // Filter forecasts for this symbol and horizon (daily forecasts use h1/h2/h6 in forecast_history)
    // But the brief says: 1 business day, 1 week (5 business days), 1 month (~22 business days)
    // The forecast_history stores daily forecasts with horizons 1..8 (h1..h8)
    const relevant = forecasts.filter((f) => f.symbol === "PEN=X" && Number(f.horizon) === h);

    const cases = [];
    let n = 0;
    let dentro = 0;
    let errorMedioCentro = 0;
    let errorMedioPaseoAleatorio = 0;

    for (const f of relevant) {
      const runDate = f.run_date;
      const targetDate = addBusinessDays(runDate, h, PERU_HOLIDAYS);
      const actualClose = officialMap.get(targetDate);

      if (!Number.isFinite(actualClose) || !Number.isFinite(Number(f.p50))) {
        continue;
      }

      n++;
      const p10 = Number(f.p10);
      const p50 = Number(f.p50);
      const p90 = Number(f.p90);
      const lastClose = Number(f.last_close);

      const estaDentro = actualClose >= p10 && actualClose <= p90;
      if (estaDentro) dentro++;

      const errorCentro = Math.abs(actualClose - p50);
      const errorRW = Math.abs(actualClose - lastClose);

      errorMedioCentro += errorCentro;
      errorMedioPaseoAleatorio += errorRW;

      cases.push({
        fecha_emision: runDate,
        fecha_objetivo: targetDate,
        p10: Number(p10.toFixed(4)),
        p50: Number(p50.toFixed(4)),
        p90: Number(p90.toFixed(4)),
        cierre: Number(actualClose.toFixed(4)),
        dentro: estaDentro,
      });
    }

    // Sort cases by fecha_emision descending (most recent first), take last 60
    cases.sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision));
    const last60 = cases.slice(0, 60);

    result[label] = {
      desde: cases.length > 0 ? cases[cases.length - 1].fecha_emision : null,
      n,
      dentro,
      cobertura: n > 0 ? Number(((dentro / n) * 100).toFixed(1)) : null,
      error_medio_centro: n > 0 ? Number((errorMedioCentro / n).toFixed(4)) : null,
      error_medio_paseo_aleatorio: n > 0 ? Number((errorMedioPaseoAleatorio / n).toFixed(4)) : null,
      casos: last60,
    };
  }

  return {
    actualizado: today,
    horizontes: result,
  };
}

async function main() {
  // Load official BCRP series
  if (!fs.existsSync(BCRP_PATH)) {
    console.error(`Archivo no encontrado: ${BCRP_PATH}`);
    process.exit(1);
  }
  const bcrp = JSON.parse(fs.readFileSync(BCRP_PATH, "utf8"));
  const officialSerie = bcrp.series?.PEN?.serie || [];

  // Load forecasts from Supabase forecast_history
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";

  if (!base || !key) {
    console.log("Sin credenciales de Supabase: omitiendo evaluación (SUPABASE_URL y SUPABASE_SERVICE_KEY requeridos)");
    process.exit(0);
  }

  const forecasts = [];
  for (let offset = 0; ; offset += 1000) {
    const url = `${base}/rest/v1/forecast_history?select=symbol,horizon,run_date,last_close,p10,p50,p90&symbol=eq.PEN=X&order=run_date.asc&limit=1000&offset=${offset}`;
    const response = await fetchT(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      throw new Error(`Supabase forecast_history HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const page = await response.json();
    forecasts.push(...page);
    if (page.length < 1000) break;
  }

  const result = evaluateForecasts(forecasts, officialSerie);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Aciertos dólar guardados en ${OUTPUT_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Error en aciertos-dolar:", err);
    process.exit(1);
  });
}