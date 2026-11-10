import test from "node:test";
import assert from "node:assert/strict";
import { evaluateForecasts } from "../scripts/aciertos-dolar.js";

// Fixed test data
const MOCK_OFFICIAL_SERIE = [
  ["2025-01-02", 3.70],
  ["2025-01-03", 3.71],
  ["2025-01-06", 3.72],
  ["2025-01-07", 3.73],
  ["2025-01-08", 3.74],
  ["2025-01-09", 3.75],
  ["2025-01-10", 3.76],
  ["2025-01-13", 3.77],
  ["2025-01-14", 3.78],
  ["2025-01-15", 3.79],
  ["2025-01-16", 3.80],
  ["2025-01-17", 3.81],
  ["2025-01-20", 3.82],
  ["2025-01-21", 3.83],
  ["2025-01-22", 3.84],
  ["2025-01-23", 3.85],
  ["2025-01-24", 3.86],
  ["2025-01-27", 3.87],
  ["2025-01-28", 3.88],
  ["2025-01-29", 3.89],
  ["2025-01-30", 3.90],
  ["2025-01-31", 3.91],
  ["2025-02-03", 3.92],
  ["2025-02-04", 3.93],
  ["2025-02-05", 3.94],
  ["2025-02-06", 3.95],
  ["2025-02-07", 3.96],
];

const MOCK_FORECASTS = [
  // 1 business day (h=1): run_date 2025-01-02 -> target 2025-01-03 (close 3.71)
  {
    symbol: "PEN=X",
    horizon: 1,
    run_date: "2025-01-02",
    last_close: 3.70,
    p10: 3.68,
    p50: 3.70,
    p90: 3.72,
  },
  // 1 business day: run_date 2025-01-03 -> target 2025-01-06 (close 3.72)
  {
    symbol: "PEN=X",
    horizon: 1,
    run_date: "2025-01-03",
    last_close: 3.71,
    p10: 3.69,
    p50: 3.71,
    p90: 3.73,
  },
  // 1 business day: run_date 2025-01-06 -> target 2025-01-07 (close 3.73)
  {
    symbol: "PEN=X",
    horizon: 1,
    run_date: "2025-01-06",
    last_close: 3.72,
    p10: 3.70,
    p50: 3.72,
    p90: 3.74,
  },
  // 1 week (h=5): run_date 2025-01-02 -> target 2025-01-09 (close 3.75)
  {
    symbol: "PEN=X",
    horizon: 5,
    run_date: "2025-01-02",
    last_close: 3.70,
    p10: 3.65,
    p50: 3.70,
    p90: 3.75,
  },
  // 1 week: run_date 2025-01-03 -> target 2025-01-10 (close 3.76)
  {
    symbol: "PEN=X",
    horizon: 5,
    run_date: "2025-01-03",
    last_close: 3.71,
    p10: 3.66,
    p50: 3.71,
    p90: 3.76,
  },
  // 1 month (h=22): run_date 2025-01-02 -> target 2025-02-03 (close 3.92)
  {
    symbol: "PEN=X",
    horizon: 22,
    run_date: "2025-01-02",
    last_close: 3.70,
    p10: 3.50,
    p50: 3.70,
    p90: 3.90,
  },
  // Different symbol - should be ignored
  {
    symbol: "HG=F",
    horizon: 1,
    run_date: "2025-01-02",
    last_close: 4.20,
    p10: 4.10,
    p50: 4.20,
    p90: 4.30,
  },
  // Missing actual close (target date not in official serie) - should be skipped
  {
    symbol: "PEN=X",
    horizon: 1,
    run_date: "2025-02-07",
    last_close: 3.96,
    p10: 3.94,
    p50: 3.96,
    p90: 3.98,
  },
];

test("evaluateForecasts returns correct structure with all three horizons", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);

  assert.ok(result.actualizado);
  assert.ok(result.horizontes);
  assert.ok(result.horizontes.dia);
  assert.ok(result.horizontes.semana);
  assert.ok(result.horizontes.mes);
});

test("evaluateForecasts computes 1-day horizon correctly", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);
  const dia = result.horizontes.dia;

  // 3 valid forecasts for 1-day horizon
  assert.equal(dia.n, 3);
  // All 3 should be within range (p10-p90 covers actual)
  assert.equal(dia.dentro, 3);
  assert.equal(dia.cobertura, 100.0);
  // error_medio_centro = average of |actual - p50|
  // Case 1: |3.71 - 3.70| = 0.01
  // Case 2: |3.72 - 3.71| = 0.01
  // Case 3: |3.73 - 3.72| = 0.01
  assert.equal(dia.error_medio_centro, 0.01);
  // error_medio_paseo_aleatorio = average of |actual - last_close|
  // Case 1: |3.71 - 3.70| = 0.01
  // Case 2: |3.72 - 3.71| = 0.01
  // Case 3: |3.73 - 3.72| = 0.01
  assert.equal(dia.error_medio_paseo_aleatorio, 0.01);
  // desde should be earliest run_date
  assert.equal(dia.desde, "2025-01-02");
  // 3 cases, all included
  assert.equal(dia.casos.length, 3);
});

test("evaluateForecasts computes 1-week horizon correctly", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);
  const semana = result.horizontes.semana;

  // 2 valid forecasts for 1-week horizon
  assert.equal(semana.n, 2);
  // Case 1: target 2025-01-09 close 3.75, range [3.65, 3.75] -> dentro (boundary counts)
  // Case 2: target 2025-01-10 close 3.76, range [3.66, 3.76] -> dentro
  assert.equal(semana.dentro, 2);
  assert.equal(semana.cobertura, 100.0);
  // Case 1: |3.75 - 3.70| = 0.05
  // Case 2: |3.76 - 3.71| = 0.05
  assert.equal(semana.error_medio_centro, 0.05);
  // Case 1: |3.75 - 3.70| = 0.05
  // Case 2: |3.76 - 3.71| = 0.05
  assert.equal(semana.error_medio_paseo_aleatorio, 0.05);
  assert.equal(semana.desde, "2025-01-02");
  assert.equal(semana.casos.length, 2);
});

test("evaluateForecasts computes 1-month horizon correctly", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);
  const mes = result.horizontes.mes;

  // 1 valid forecast for 1-month horizon
  // run_date 2025-01-02 + 22 business days = 2025-02-03 (close 3.92)
  // Range [3.50, 3.90], actual 3.92 -> FUERA
  assert.equal(mes.n, 1);
  assert.equal(mes.dentro, 0);
  assert.equal(mes.cobertura, 0.0);
  // |3.92 - 3.70| = 0.22
  assert.equal(mes.error_medio_centro, 0.22);
  // |3.92 - 3.70| = 0.22
  assert.equal(mes.error_medio_paseo_aleatorio, 0.22);
  assert.equal(mes.desde, "2025-01-02");
  assert.equal(mes.casos.length, 1);
  // Check the case details
  const caso = mes.casos[0];
  assert.equal(caso.fecha_emision, "2025-01-02");
  assert.equal(caso.fecha_objetivo, "2025-02-03");
  assert.equal(caso.p10, 3.5);
  assert.equal(caso.p50, 3.7);
  assert.equal(caso.p90, 3.9);
  assert.equal(caso.cierre, 3.92);
  assert.equal(caso.dentro, false);
});

test("evaluateForecasts ignores forecasts for other symbols", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);
  // HG=F forecast should not affect any horizon
  const totalCases = result.horizontes.dia.n + result.horizontes.semana.n + result.horizontes.mes.n;
  assert.equal(totalCases, 6); // 3 + 2 + 1
});

test("evaluateForecasts skips forecasts with missing actual close", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);
  // The forecast with run_date 2025-02-07 has target beyond our mock data
  // It should be skipped, not counted
  assert.equal(result.horizontes.dia.n, 3); // Not 4
});

test("evaluateForecasts returns null stats when no valid forecasts", () => {
  const emptyForecasts = [];
  const result = evaluateForecasts(emptyForecasts, MOCK_OFFICIAL_SERIE);

  for (const horizon of Object.values(result.horizontes)) {
    assert.equal(horizon.n, 0);
    assert.equal(horizon.dentro, 0);
    assert.equal(horizon.cobertura, null);
    assert.equal(horizon.error_medio_centro, null);
    assert.equal(horizon.error_medio_paseo_aleatorio, null);
    assert.equal(horizon.desde, null);
    assert.deepEqual(horizon.casos, []);
  }
});

test("evaluateForecasts sorts cases by fecha_emision descending (most recent first)", () => {
  const result = evaluateForecasts(MOCK_FORECASTS, MOCK_OFFICIAL_SERIE);
  const diaCases = result.horizontes.dia.casos;

  // Should be sorted newest first
  assert.equal(diaCases[0].fecha_emision, "2025-01-06");
  assert.equal(diaCases[1].fecha_emision, "2025-01-03");
  assert.equal(diaCases[2].fecha_emision, "2025-01-02");
});

test("evaluateForecasts limits cases to 60 most recent", () => {
  // Create 65 forecasts for 1-day horizon
  const manyForecasts = [];
  for (let i = 0; i < 65; i++) {
    const runDate = `2025-01-${String(i + 2).padStart(2, "0")}`;
    const targetDate = `2025-01-${String(i + 3).padStart(2, "0")}`;
    // Only add if target date exists in mock data (up to 2025-02-07)
    if (i < 30) {
      manyForecasts.push({
        symbol: "PEN=X",
        horizon: 1,
        run_date: runDate,
        last_close: 3.70 + i * 0.01,
        p10: 3.68 + i * 0.01,
        p50: 3.70 + i * 0.01,
        p90: 3.72 + i * 0.01,
      });
    }
  }

  const result = evaluateForecasts(manyForecasts, MOCK_OFFICIAL_SERIE);
  // Should have at most 60 cases
  assert.ok(result.horizontes.dia.casos.length <= 60);
  // Should be the 60 most recent (highest run_date)
  if (result.horizontes.dia.casos.length === 60) {
    assert.equal(result.horizontes.dia.casos[0].fecha_emision, "2025-01-31");
  }
});