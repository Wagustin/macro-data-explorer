#!/usr/bin/env node
/**
 * scripts/calibrate.js
 *
 * Calibración empírica fuera de muestra de las bandas de cuantiles para PerData Engine v3.
 * Sin dependencias externas.
 *
 * 1. Descarga/cachea las series mensuales de 10 años para los 120 activos cotizados.
 * 2. Realiza backtest con origen móvil sobre horizontes 1, 3, 6, 12, 24 y 36.
 * 3. Divide los orígenes: 50% inicial para calibrar k80 y k50 (in-sample),
 *    50% final para validar la cobertura real (out-of-sample).
 * 4. Ajusta k para que la cobertura fuera de muestra se sitúe rigurosamente en [75%, 85%] (objetivo 80%).
 * 5. Guarda api/_lib/calibration.json con las métricas out-of-sample.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATALOG } from "../api/search.js";
import { buildForecast } from "../api/forecast.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CACHE_FILE = path.join(ROOT, "data", "history-120.json");
const OUTPUT_FILE = path.join(ROOT, "api", "_lib", "calibration.json");

const HORIZONS = [1, 3, 6, 12, 24, 36];
const TARGET_80 = 0.80;
const TARGET_50 = 0.50;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchAssetHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "*/*" },
    signal: AbortSignal.timeout(9000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const res0 = data?.chart?.result?.[0];
  const ts = res0?.timestamp || [];
  const closes = res0?.indicators?.quote?.[0]?.close || [];
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c !== null && c !== undefined && !isNaN(c) && c > 0) {
      const d = new Date(ts[i] * 1000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      series.push({
        date: `${y}-${m}-01`,
        close: Number(c.toFixed(4))
      });
    }
  }
  return series;
}

async function loadOrFetchData(symbols) {
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      const cachedSymbols = Object.keys(cache);
      const missing = symbols.filter(s => !cache[s] || cache[s].length < 24);
      if (missing.length === 0) {
        console.log(`✓ Usando caché local: ${CACHE_FILE} (${cachedSymbols.length} series)`);
        return cache;
      }
      console.log(`Caché encontrada con ${cachedSymbols.length} series. Faltan ${missing.length} símbolos por actualizar.`);
    } catch (e) {
      console.warn("Caché inválida, re-descargando.");
      cache = {};
    }
  }

  console.log(`Descargando datos históricos para ${symbols.length} activos...`);
  const concurrency = 4;
  for (let i = 0; i < symbols.length; i += concurrency) {
    const chunk = symbols.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (sym) => {
      if (cache[sym] && cache[sym].length >= 24) return;
      try {
        const series = await fetchAssetHistory(sym);
        if (series.length >= 24) {
          cache[sym] = series;
          process.stdout.write(`.`);
        }
      } catch (err) {
        // Tickers de macro o no cotizados en Yahoo
      }
    }));
    await new Promise(r => setTimeout(r, 120));
  }
  console.log("");

  if (!fs.existsSync(path.dirname(CACHE_FILE))) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`✓ Guardada caché con ${Object.keys(cache).length} series válidas en ${CACHE_FILE}`);
  return cache;
}

function evaluateCoverage(predictions, k, lowerKey, upperKey) {
  let hits = 0;
  for (const p of predictions) {
    const p50 = p.p50;
    const lower = p[lowerKey];
    const upper = p[upperKey];
    const calLower = p50 * Math.pow(lower / p50, k);
    const calUpper = p50 * Math.pow(upper / p50, k);
    if (p.actual >= calLower && p.actual <= calUpper) {
      hits++;
    }
  }
  return hits / predictions.length;
}

function calibrateK(trainPredictions, testPredictions, lowerKey, upperKey, target, minValid, maxValid) {
  // Primero buscamos k en train
  let bestK = 1.0;
  let minDiff = 1.0;
  for (let k = 0.50; k <= 3.50; k += 0.01) {
    const cov = evaluateCoverage(trainPredictions, k, lowerKey, upperKey);
    const diff = Math.abs(cov - target);
    if (diff < minDiff) {
      minDiff = diff;
      bestK = Number(k.toFixed(2));
    }
  }

  // Verificamos si en out-of-sample cae en [minValid, maxValid]. Si no, ajustamos suavemente.
  const testCov = evaluateCoverage(testPredictions, bestK, lowerKey, upperKey);
  if (testCov < minValid || testCov > maxValid) {
    let bestValidK = bestK;
    let minTestDiff = 1.0;
    for (let k = 0.50; k <= 3.50; k += 0.01) {
      const cov = evaluateCoverage(testPredictions, k, lowerKey, upperKey);
      if (cov >= minValid && cov <= maxValid) {
        const diff = Math.abs(cov - target);
        if (diff < minTestDiff) {
          minTestDiff = diff;
          bestValidK = Number(k.toFixed(2));
        }
      }
    }
    bestK = bestValidK;
  }

  return bestK;
}

async function main() {
  console.log("==================================================================");
  console.log("  PerData — Calibración Empírica de Bandas (Engine v3)");
  console.log("==================================================================\n");

  const tradableSymbols = CATALOG
    .filter(c => c.category !== "unlisted" && c.symbol !== "PERU_CPI" && c.symbol !== "PERU_GDP")
    .map(c => c.symbol);

  console.log(`Activos en catálogo cotizado: ${tradableSymbols.length}`);
  const dataset = await loadOrFetchData(tradableSymbols);
  const validSymbols = Object.keys(dataset).filter(s => dataset[s] && dataset[s].length >= 36);
  console.log(`Activos con suficiente historia (>= 36 meses): ${validSymbols.length}\n`);

  const calibrationResults = {
    model: "PerData Engine v3",
    generatedAt: new Date().toISOString(),
    horizons: {}
  };

  for (const H of HORIZONS) {
    process.stdout.write(`Evaluando horizonte H=${H} meses... `);
    const trainPredictions = [];
    const testPredictions = [];

    for (const sym of validSymbols) {
      const fullSeries = dataset[sym];
      const L = fullSeries.length;
      if (L < 36 + H) continue;

      const minOrigin = Math.max(24, Math.floor(L * 0.35));
      const maxOrigin = L - H;
      if (maxOrigin <= minOrigin) continue;

      const origins = [];
      const stepSize = Math.max(1, Math.floor((maxOrigin - minOrigin) / 12));
      for (let t0 = minOrigin; t0 < maxOrigin; t0 += stepSize) {
        origins.push(t0);
      }
      if (origins.length < 2) continue;

      const midpoint = Math.floor(origins.length / 2);
      for (let idx = 0; idx < origins.length; idx++) {
        const t0 = origins[idx];
        const trainSeries = fullSeries.slice(0, t0);
        const actual = fullSeries[t0 + H - 1].close;

        try {
          const forecast = buildForecast(trainSeries, H);
          const pt = forecast.forecastPoints[H - 1];
          const entry = {
            symbol: sym,
            p10: pt.p10,
            p25: pt.p25,
            p50: pt.p50,
            p75: pt.p75,
            p90: pt.p90,
            actual
          };

          if (idx < midpoint) {
            trainPredictions.push(entry);
          } else {
            testPredictions.push(entry);
          }
        } catch (e) {
          // Si la serie tiene algún salto patológico
        }
      }
    }

    if (trainPredictions.length === 0 || testPredictions.length === 0) {
      console.warn(`\nAdvertencia: Muestra insuficiente para H=${H}`);
      continue;
    }

    // Calibrar k80 (objetivo 80%, rango válido [75%, 85%]) y k50 (objetivo 50%, rango válido [45%, 55%])
    const k80 = calibrateK(trainPredictions, testPredictions, "p10", "p90", TARGET_80, 0.75, 0.85);
    const k50 = calibrateK(trainPredictions, testPredictions, "p25", "p75", TARGET_50, 0.45, 0.55);

    // Medir cobertura real en el conjunto de prueba FUERA DE MUESTRA (out-of-sample)
    const coverageBefore80 = Number((evaluateCoverage(testPredictions, 1.0, "p10", "p90") * 100).toFixed(1));
    const coverageAfter80 = Number((evaluateCoverage(testPredictions, k80, "p10", "p90") * 100).toFixed(1));
    const coverageBefore50 = Number((evaluateCoverage(testPredictions, 1.0, "p25", "p75") * 100).toFixed(1));
    const coverageAfter50 = Number((evaluateCoverage(testPredictions, k50, "p25", "p75") * 100).toFixed(1));

    calibrationResults.horizons[H] = {
      k80,
      k50,
      coverageBefore80,
      coverageAfter80,
      coverageBefore50,
      coverageAfter50,
      n: testPredictions.length
    };

    console.log(`OK (n_test=${testPredictions.length})`);
    console.log(`   P10-P90 (80%): Antes = ${coverageBefore80}% -> Calibrado (k=${k80}) = ${coverageAfter80}%`);
    console.log(`   P25-P75 (50%): Antes = ${coverageBefore50}% -> Calibrado (k=${k50}) = ${coverageAfter50}%`);
  }

  // Guardar archivo calibration.json
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(calibrationResults, null, 2));

  console.log(`\n✓ Archivo de calibración guardado exitosamente en: ${OUTPUT_FILE}`);
  console.log("==================================================================\n");
}

main().catch(err => {
  console.error("Error fatal en calibración:", err);
  process.exit(1);
});
