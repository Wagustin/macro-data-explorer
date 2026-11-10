/**
 * Auditoría del motor mensual real (api/forecast.js) — walk-forward mensual.
 * 6 activos (PEN, COBRE, ORO, PLATA, ZINC, WTI), 4 horizontes (1, 3, 6, 12 meses).
 * Datos: series mensuales de data/official/ (vía sources.js monthlyPoints).
 */

import { buildForecast, getCalibration } from "../../../api/forecast.js";
import { sourcePoints, monthlyPoints, SOURCES } from "../../../api/_lib/sources.js";
import fs from "fs";
import path from "path";

// ---------- Config ----------
const ASSETS = [
  { symbol: "PEN=X", sourceKey: "PEN", name: "USD/PEN" },
  { symbol: "HG=F", sourceKey: "COBRE", name: "Cobre" },
  { symbol: "GC=F", sourceKey: "ORO", name: "Oro" },
  { symbol: "SI=F", sourceKey: "PLATA", name: "Plata" },
  { symbol: "ZINC", sourceKey: "ZINC", name: "Zinc" }, // World Bank
  { symbol: "CL=F", sourceKey: "WTI", name: "WTI" },
];
const HORIZONS = [1, 3, 6, 12]; // meses
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

function loadMonthlySeries(sourceKey) {
  // Buscar en SOURCES el símbolo que usa esta clave
  let symbol = null;
  for (const [sym, src] of Object.entries(SOURCES)) {
    if (src.clave === sourceKey) {
      symbol = sym;
      break;
    }
  }
  if (!symbol) throw new Error(`No hay símbolo para sourceKey ${sourceKey}`);
  const points = sourcePoints(symbol);
  if (!points || points.length < 2) throw new Error(`No hay datos para ${symbol} (${sourceKey})`);
  const method = SOURCES[symbol]?.mensual || "ultimo";
  return monthlyPoints(points, method); // [[YYYY-MM, close], ...]
}

function filterSeriesUpTo(series, cutoffYm) {
  return series.filter(([ym]) => ym <= cutoffYm);
}

function seriesToEngineFormat(monthlySeries) {
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

// Percentil empírico
function quantile(sortedArr, q) {
  if (!sortedArr.length) return NaN;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(q * sortedArr.length)));
  return sortedArr[idx];
}

// ---------- Main ----------
async function main() {
  const allResults = [];

  for (const asset of ASSETS) {
    console.log(`\n=== ${asset.name} (${asset.symbol}) ===`);
    let fullMonthly;
    try {
      fullMonthly = loadMonthlySeries(asset.sourceKey);
    } catch (e) {
      console.warn(`  Saltando: ${e.message}`);
      continue;
    }
    console.log(`  Puntos mensuales: ${fullMonthly.length} (${fullMonthly[0][0]} a ${fullMonthly[fullMonthly.length - 1][0]})`);

    // Cortes desde START_YEAR con historia mínima
    const cutoffs = [];
    for (const [ym] of fullMonthly) {
      const yr = parseInt(ym.split("-")[0], 10);
      if (yr >= START_YEAR) cutoffs.push(ym);
    }

    for (const H of HORIZONS) {
      const results = [];

      for (const cutoff of cutoffs) {
        const histMonthly = filterSeriesUpTo(fullMonthly, cutoff);
        if (histMonthly.length < MIN_POINTS) continue;

        const engineSeries = seriesToEngineFormat(histMonthly);

        try {
          const forecast = buildForecast(engineSeries, H, { calibrated: true });
          const lastClose = engineSeries[engineSeries.length - 1].close;
          const actual = getActualAtHorizon(fullMonthly, cutoff, H);
          if (actual === null) continue;

          const fp = forecast.forecastPoints[H - 1]; // step H
          const p10 = fp.p10;
          const p25 = fp.p25;
          const p50 = fp.p50;
          const p75 = fp.p75;
          const p90 = fp.p90;

          const in80 = actual >= p10 && actual <= p90 ? 1 : 0;
          const in50 = actual >= p25 && actual <= p75 ? 1 : 0;
          const maeP50 = Math.abs(p50 - actual);
          const maeRW = Math.abs(lastClose - actual);
          const bias = p50 - actual;
          const width80 = (p90 - p10) / p50 * 100;
          const width50 = (p75 - p25) / p50 * 100;

          // "need" factor: K tal que banda calibrada cubra este punto
          // p10_cal = p50 * (p10_raw/p50)^K, p90_cal = p50 * (p90_raw/p50)^K
          // Si actual > p50: need = log(actual/p50) / log(p90_raw/p50)
          // Si actual < p50: need = log(actual/p50) / log(p10_raw/p50)
          let need = null;
          if (actual > p50 && p90 > p50) {
            need = Math.log(actual / p50) / Math.log(p90 / p50);
          } else if (actual < p50 && p10 < p50) {
            need = Math.log(actual / p50) / Math.log(p10 / p50);
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
            need
          });
        } catch (e) {
          // Silenciar errores individuales
        }
      }

      if (!results.length) {
        console.log(`  H=${H}m: sin datos`);
        continue;
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

      // K80 para 80% cobertura: percentil 80 de "need"
      const needs = results.filter(r => r.need !== null).map(r => r.need).sort((a, b) => a - b);
      const k80_80pct = needs.length ? quantile(needs, 0.80) : null;
      const k80_median = needs.length ? quantile(needs, 0.50) : null;

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
      const calibH = calib?.horizons?.[H] || {};

      const summary = {
        asset: asset.name,
        symbol: asset.symbol,
        sourceKey: asset.sourceKey,
        H,
        period: `${results[0].cutoff}–${results[results.length - 1].cutoff}`,
        n,
        coverage80: cov80,
        coverage50: cov50,
        maeP50: meanMaeP50,
        maeRW: meanMaeRW,
        bias: meanBias,
        width80: meanWidth80,
        width50: meanWidth50,
        k80_80pct,
        k80_median,
        calibK80: calibH.k80,
        calibCoverage: calibH.coverageAfter80,
        ci80: { lo: ci80.lo * 100, hi: ci80.hi * 100 },
        ci50: { lo: ci50.lo * 100, hi: ci50.hi * 100 },
        ciMaeP50,
        ciMaeRW
      };

      allResults.push(summary);

      console.log(`  H=${H}m: n=${n}, cov80=${cov80.toFixed(2)}% [${(ci80.lo*100).toFixed(1)}–${(ci80.hi*100).toFixed(1)}], cov50=${cov50.toFixed(2)}%, MAE_P50=${meanMaeP50.toFixed(4)}, MAE_RW=${meanMaeRW.toFixed(4)}, bias=${meanBias.toFixed(4)}, w80=${meanWidth80.toFixed(2)}%, k80_80pct=${k80_80pct !== null ? k80_80pct.toFixed(3) : "N/A"}, calib_k80=${calibH.k80 ?? "N/A"}`);
    }
  }

  // ---------- Guardar ----------
  const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  fs.writeFileSync(path.join(outDir, "resultados.json"), JSON.stringify({ results: allResults }, null, 2));
  console.log(`\nResultados guardados en ${outDir}/resultados.json`);

  // ---------- Tabla Markdown para informe ----------
  let md = "# Auditoría Motor Mensual Real — Walk-Forward 2013–2026\n\n";
  md += `| Activo | H | Cortes | Cov 80% (nom 80%) | IC95 | Cov 50% (nom 50%) | MAE P50 | MAE RW | Sesgo | Ancho 80% | k80 (p80) | k80 actual |\n`;
  md += `|--------|---|--------|-------------------|------|-------------------|---------|--------|-------|-----------|-----------|------------|\n`;

  for (const r of allResults) {
    md += `| ${r.asset} | ${r.H}m | ${r.n} | ${r.coverage80.toFixed(2)}% | [${r.ci80.lo.toFixed(1)}–${r.ci80.hi.toFixed(1)}] | ${r.coverage50.toFixed(2)}% | ${r.maeP50.toFixed(4)} | ${r.maeRW.toFixed(4)} | ${r.bias.toFixed(4)} | ${r.width80.toFixed(2)}% | ${r.k80_80pct !== null ? r.k80_80pct.toFixed(3) : "—"} | ${r.calibK80 !== undefined ? r.calibK80 : "—"} |\n`;
  }

  fs.writeFileSync(path.join(outDir, "tabla.md"), md);
  console.log(`Tabla guardada en ${outDir}/tabla.md`);
}

main().catch(e => { console.error(e); process.exit(1); });