/**
 * Auditoría del motor mensual real (api/forecast.js) — walk-forward mensual.
 * Inicio: 1 activo (PEN=X), 1 horizonte (1 mes).
 * Datos: series mensuales de data/official/bcrp-daily.json (vía sources.js monthlyPoints).
 */

import { buildForecast, getCalibration } from "../../../api/forecast.js";
import { sourcePoints, monthlyPoints } from "../../../api/_lib/sources.js";
import fs from "fs";
import path from "path";

// ---------- Config ----------
const SYMBOL = "PEN=X";
const HORIZONS = [1]; // meses
const START_YEAR = 2013;
const MIN_POINTS = 60; // mínimo 5 años de historia mensual

// ---------- Utilidades ----------
function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  let mm = m - 1 + n;
  let yy = y + Math.floor(mm / 12);
  mm = (mm % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

function monthEndDate(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // último día del mes
  return d.toISOString().slice(0, 10);
}

function loadMonthlySeries(symbol) {
  const points = sourcePoints(symbol);
  if (!points || points.length < 2) throw new Error(`No hay datos para ${symbol}`);
  return monthlyPoints(points, "ultimo"); // [[YYYY-MM, close], ...]
}

function filterSeriesUpTo(series, cutoffYm) {
  // series: [[YYYY-MM, close], ...] ordenado asc
  return series.filter(([ym]) => ym <= cutoffYm);
}

function seriesToEngineFormat(monthlySeries) {
  // buildForecast espera [{date: "YYYY-MM-DD", close: number}, ...]
  return monthlySeries.map(([ym, close]) => ({
    date: `${ym}-01`,
    close: Number(close)
  }));
}

function getActualAtHorizon(fullSeries, originYm, h) {
  const targetYm = addMonths(originYm, h);
  const found = fullSeries.find(([ym]) => ym === targetYm);
  return found ? found[1] : null;
}

// ---------- Bootstrap CI ----------
function bootstrapCI(values, nBoot = 1000, alpha = 0.05) {
  if (!values.length) return { lo: NaN, hi: NaN };
  const n = values.length;
  const stats = [];
  for (let b = 0; b < nBoot; b++) {
    const sample = Array.from({ length: n }, () => values[Math.floor(Math.random() * n)]);
    stats.push(sample.reduce((a, v) => a + v, 0) / n);
  }
  stats.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * nBoot);
  const hiIdx = Math.floor((1 - alpha / 2) * nBoot);
  return { lo: stats[loIdx], hi: stats[hiIdx] };
}

// ---------- Main ----------
async function main() {
  console.log(`Cargando serie mensual para ${SYMBOL}...`);
  const fullMonthly = loadMonthlySeries(SYMBOL);
  console.log(`Puntos mensuales totales: ${fullMonthly.length} (${fullMonthly[0][0]} a ${fullMonthly[fullMonthly.length - 1][0]})`);

  // Generar cortes: fin de mes desde START_YEAR
  const cutoffs = [];
  for (const [ym] of fullMonthly) {
    const yr = parseInt(ym.split("-")[0], 10);
    if (yr >= START_YEAR) cutoffs.push(ym);
  }
  console.log(`Cortes de evaluación (${START_YEAR}+): ${cutoffs.length}`);

  const results = [];

  for (const cutoff of cutoffs) {
    const histMonthly = filterSeriesUpTo(fullMonthly, cutoff);
    if (histMonthly.length < MIN_POINTS) continue;

    const engineSeries = seriesToEngineFormat(histMonthly);

    for (const H of HORIZONS) {
      try {
        const forecast = buildForecast(engineSeries, H, { calibrated: true });
        const lastClose = engineSeries[engineSeries.length - 1].close;
        const actual = getActualAtHorizon(fullMonthly, cutoff, H);
        if (actual === null) continue;

        const fp = forecast.forecastPoints[0]; // step 1
        const p10 = fp.p10;
        const p25 = fp.p25;
        const p50 = fp.p50;
        const p75 = fp.p75;
        const p90 = fp.p90;

        const in80 = actual >= p10 && actual <= p90 ? 1 : 0;
        const in50 = actual >= p25 && actual <= p75 ? 1 : 0;
        const maeP50 = Math.abs(p50 - actual);
        const maeRW = Math.abs(lastClose - actual); // random walk = último cierre
        const bias = p50 - actual; // positivo = sobrepredice
        const width80 = (p90 - p10) / p50 * 100;
        const width50 = (p75 - p25) / p50 * 100;

        // Factor K que daría 80% real: K tal que p10*K, p90*K cubran
        // K = log(actual/p50) / log(p90/p50)  (aprox)
        let kNeeded = null;
        if (actual > p50 && p90 > p50) {
          kNeeded = Math.log(actual / p50) / Math.log(p90 / p50);
        } else if (actual < p50 && p10 < p50) {
          kNeeded = Math.log(actual / p50) / Math.log(p10 / p50);
        }

        results.push({
          cutoff,
          H,
          lastClose,
          actual,
          p10, p25, p50, p75, p90,
          in80, in50,
          maeP50, maeRW,
          bias,
          width80, width50,
          kNeeded
        });
      } catch (e) {
        console.warn(`Error en ${cutoff} H=${H}: ${e.message}`);
      }
    }
  }

  if (!results.length) {
    console.error("Sin resultados.");
    return;
  }

  // ---------- Agregados ----------
  const n = results.length;
  const cov80 = results.filter(r => r.in80).length / n * 100;
  const cov50 = results.filter(r => r.in50).length / n * 100;
  const meanMaeP50 = results.reduce((s, r) => s + r.maeP50, 0) / n;
  const meanMaeRW = results.reduce((s, r) => s + r.maeRW, 0) / n;
  const meanBias = results.reduce((s, r) => s + r.bias, 0) / n;
  const meanWidth80 = results.reduce((s, r) => s + r.width80, 0) / n;
  const meanWidth50 = results.reduce((s, r) => s + r.width50, 0) / n;
  const kNeededVals = results.filter(r => r.kNeeded !== null).map(r => r.kNeeded);
  const k80median = kNeededVals.length ? kNeededVals.sort((a, b) => a - b)[Math.floor(kNeededVals.length / 2)] : null;

  // Bootstrap CIs
  const in80Arr = results.map(r => r.in80);
  const in50Arr = results.map(r => r.in50);
  const maeP50Arr = results.map(r => r.maeP50);
  const maeRWArr = results.map(r => r.maeRW);
  const ci80 = bootstrapCI(in80Arr);
  const ci50 = bootstrapCI(in50Arr);
  const ciMaeP50 = bootstrapCI(maeP50Arr);
  const ciMaeRW = bootstrapCI(maeRWArr);

  // Calibración actual
  const calib = getCalibration();
  const calibH1 = calib?.horizons?.[1] || {};

  // ---------- Output ----------
  console.log("\n=== RESULTADOS ===");
  console.log(`Activo: ${SYMBOL} | Horizonte: 1 mes | Período: ${results[0].cutoff} – ${results[n-1].cutoff} | Cortes: ${n}`);
  console.log(`Cobertura P10-P90 (nominal 80%): ${cov80.toFixed(2)}%  [IC95: ${(ci80.lo*100).toFixed(1)}–${(ci80.hi*100).toFixed(1)}]`);
  console.log(`Cobertura P25-P75 (nominal 50%): ${cov50.toFixed(2)}%  [IC95: ${(ci50.lo*100).toFixed(1)}–${(ci50.hi*100).toFixed(1)}]`);
  console.log(`MAE P50: ${meanMaeP50.toFixed(4)}  [IC95: ${ciMaeP50.lo.toFixed(4)}–${ciMaeP50.hi.toFixed(4)}]`);
  console.log(`MAE Paseo Aleatorio: ${meanMaeRW.toFixed(4)}  [IC95: ${ciMaeRW.lo.toFixed(4)}–${ciMaeRW.hi.toFixed(4)}]`);
  console.log(`Sesgo medio (P50 - real): ${meanBias.toFixed(4)}`);
  console.log(`Ancho medio banda 80%: ${meanWidth80.toFixed(2)}%`);
  console.log(`Ancho medio banda 50%: ${meanWidth50.toFixed(2)}%`);
  console.log(`K80 mediano necesario: ${k80median !== null ? k80median.toFixed(3) : "N/A"}`);
  console.log(`Calibración actual k80: ${calibH1.k80 ?? "N/A"}, coverageAfter80: ${calibH1.coverageAfter80 ?? "N/A"}`);

  // Guardar resultados detallados
  const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  fs.writeFileSync(path.join(outDir, "resultados.json"), JSON.stringify({ results, summary: {
    symbol: SYMBOL,
    horizon: 1,
    period: `${results[0].cutoff}–${results[n-1].cutoff}`,
    n,
    coverage80: cov80,
    coverage50: cov50,
    maeP50: meanMaeP50,
    maeRW: meanMaeRW,
    bias: meanBias,
    width80: meanWidth80,
    width50: meanWidth50,
    k80median,
    calibK80: calibH1.k80,
    calibCoverage: calibH1.coverageAfter80
  }}, null, 2));
  console.log(`\nDetalle guardado en ${outDir}/resultados.json`);
}

main().catch(e => { console.error(e); process.exit(1); });