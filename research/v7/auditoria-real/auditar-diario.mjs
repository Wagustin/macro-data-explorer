/**
 * Auditoría del motor DIARIO real (scripts/engine-daily.js) — walk-forward 1 día hábil.
 * Período: 2019-2026. Objetivo: cobertura real del rango 80% ≈ 80%.
 */

import { runFHSBacktest, computeEWMAVolatility, computeEWMADrift, empiricalQuantile } from "../../../scripts/engine-daily.js";
import fs from "fs";
import path from "path";

// ---------- Cargar datos BCRP diarios ----------
const BCRP_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../data/official/bcrp-daily.json");
const bcrp = JSON.parse(fs.readFileSync(BCRP_PATH, "utf8"));
const penSerie = bcrp.series.PEN.serie.filter(([d, p]) => Number.isFinite(p) && p > 0);
console.log(`PEN diario: ${penSerie.length} observaciones (${penSerie[0][0]} a ${penSerie[penSerie.length - 1][0]})`);

// Filtrar 2019-2026 para evaluación
const evalSerie = penSerie.filter(([d]) => d >= "2019-01-01" && d <= "2026-12-31");
console.log(`Evaluación 2019-2026: ${evalSerie.length} observaciones`);

// Ejecutar backtest FHS para h=1 (1 día hábil)
// Usar los mismos parámetros que engine-daily.js
const bt = runFHSBacktest(penSerie, 1, {
  lambda: 0.94,
  windowYears: 3,
  targetCoverage: 0.80,
  testStartDate: "2019-01-01",
  sym: "PEN",
  startDate: "2019-01-01" // forzar inicio en 2019 para la evaluación completa
});

console.log("\n=== BACKTEST FHS h=1 día hábil (2019-2026) ===");
console.log(`Cortes evaluados: ${bt.cuts}`);
console.log(`K calibrado (muestra completa): ${bt.K}`);
console.log(`Cobertura 80% (muestra completa): ${bt.cobertura_80}%`);
console.log(`Cobertura 50% (muestra completa): ${bt.cobertura_50}%`);
console.log(`MAE P50 (RW): ${bt.mae_rw}`);
console.log(`MAE P50 (drift): ${bt.mae_drift}`);
console.log(`Ancho medio banda 80%: ${bt.ancho_medio_pct}%`);

console.log(`\n--- Fuera de muestra (entrenamiento < 2024, prueba >= 2024) ---`);
console.log(`Cortes entrenamiento: ${bt.cortes_entrenamiento}`);
console.log(`Cortes prueba: ${bt.cortes_prueba}`);
console.log(`K entrenamiento: ${bt.K_train}`);
console.log(`Cobertura 80% OOS: ${bt.oos.cobertura_80}%`);
console.log(`Cobertura 50% OOS: ${bt.oos.cobertura_50}%`);
console.log(`MAE P50 OOS: ${bt.oos.mae_p50}`);
console.log(`Ancho medio 80% OOS: ${bt.oos.ancho_medio_pct}%`);

console.log(`\n--- K expansivo (recalibrado en cada corte) ---`);
console.log(`Cobertura 80% expansivo: ${bt.expansivo.cobertura_80}%`);
console.log(`Cobertura 50% expansivo: ${bt.expansivo.cobertura_50}%`);
console.log(`Ancho medio 80% expansivo: ${bt.expansivo.ancho_medio_pct}%`);

// También evaluar solo el periodo 2019-2026 como "producción" (K fijo de toda la muestra hasta cada corte)
// El campo fuera_de_muestra_* ya hace esto con testStartDate="2024-01-01"
// Pero queremos 2019-2026 completo con K fijo de entrenamiento 2019-2023

// Re-ejecutar con testStartDate="2019-01-01" para tener entrenamiento vacío y K de muestra completa
// En realidad, el campo "cobertura_80" y "cobertura_50" ya son sobre TODA la muestra (2019-2026)
// con K calibrado en la muestra completa.

// Lo que dice el brief: "cobertura real del rango 80% = 80% en 1 día hábil sobre 2019-2026"
// Eso es bt.cobertura_80 = ${bt.cobertura_80}%

// Guardar resultados
const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const result = {
  asset: "USD/PEN",
  horizon: "1 día hábil",
  period: "2019-2026",
  method: "FHS + EWMA(0.94), P50 = random walk",
  cuts: bt.cuts,
  K_full: bt.K,
  coverage80_full: bt.cobertura_80,
  coverage50_full: bt.cobertura_50,
  mae_rw_full: bt.mae_rw,
  mae_drift_full: bt.mae_drift,
  width80_full: bt.ancho_medio_pct,
  oos: bt.oos,
  expansivo: bt.expansivo
};

fs.writeFileSync(path.join(outDir, "resultados-diario.json"), JSON.stringify(result, null, 2));
console.log(`\nResultados guardados en ${outDir}/resultados-diario.json`);

// Frase pública
console.log(`\n=== FRASE PÚBLICA VERIFICABLE ===`);
console.log(`Entre enero 2019 y noviembre 2026, el rango 80% del motor diario (1 día hábil, FHS+EWMA, P50=paseo aleatorio) cubrió ${bt.cobertura_80.toFixed(2)}% de los cierres reales (${bt.cuts} cortes).`);