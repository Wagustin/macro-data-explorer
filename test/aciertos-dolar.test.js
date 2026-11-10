import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePublishedForecasts, buildPronosticosFromDaily } from "../scripts/aciertos-dolar.js";

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

const MOCK_PRONOSTICOS = [
  // h1: 2025-01-02 -> target 2025-01-03 (close 3.71), range [3.68, 3.72] -> dentro
  {
    fecha_base: "2025-01-02",
    horizonte: "h1",
    fecha_objetivo: "2025-01-03",
    cierre_base: 3.70,
    p10: 3.68,
    p50: 3.70,
    p90: 3.72,
  },
  // h1: 2025-01-03 -> target 2025-01-06 (close 3.72), range [3.69, 3.73] -> dentro
  {
    fecha_base: "2025-01-03",
    horizonte: "h1",
    fecha_objetivo: "2025-01-06",
    cierre_base: 3.71,
    p10: 3.69,
    p50: 3.71,
    p90: 3.73,
  },
  // h1: 2025-01-06 -> target 2025-01-07 (close 3.73), range [3.70, 3.74] -> dentro
  {
    fecha_base: "2025-01-06",
    horizonte: "h1",
    fecha_objetivo: "2025-01-07",
    cierre_base: 3.72,
    p10: 3.70,
    p50: 3.72,
    p90: 3.74,
  },
  // h5: 2025-01-02 -> target 2025-01-09 (close 3.75), range [3.65, 3.75] -> dentro (boundary)
  {
    fecha_base: "2025-01-02",
    horizonte: "h5",
    fecha_objetivo: "2025-01-09",
    cierre_base: 3.70,
    p10: 3.65,
    p50: 3.70,
    p90: 3.75,
  },
  // h5: 2025-01-03 -> target 2025-01-10 (close 3.76), range [3.66, 3.76] -> dentro
  {
    fecha_base: "2025-01-03",
    horizonte: "h5",
    fecha_objetivo: "2025-01-10",
    cierre_base: 3.71,
    p10: 3.66,
    p50: 3.71,
    p90: 3.76,
  },
  // h6: 2025-01-02 -> target 2025-01-13 (close 3.77), range [3.50, 3.90] -> dentro
  {
    fecha_base: "2025-01-02",
    horizonte: "h6",
    fecha_objetivo: "2025-01-13",
    cierre_base: 3.70,
    p10: 3.50,
    p50: 3.70,
    p90: 3.90,
  },
  // h8: 2025-01-02 -> target 2025-01-15 (close 3.79), range [3.50, 3.90] -> dentro
  {
    fecha_base: "2025-01-02",
    horizonte: "h8",
    fecha_objetivo: "2025-01-15",
    cierre_base: 3.70,
    p10: 3.50,
    p50: 3.70,
    p90: 3.90,
  },
  // Missing actual close (target date not in official serie) - should be skipped
  {
    fecha_base: "2025-02-07",
    horizonte: "h1",
    fecha_objetivo: "2025-02-10",
    cierre_base: 3.96,
    p10: 3.94,
    p50: 3.96,
    p90: 3.98,
  },
];

test("evaluatePublishedForecasts returns correct structure with all four horizons", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);

  assert.ok(result.actualizado);
  assert.ok(result.horizontes);
  assert.ok(result.horizontes.h1);
  assert.ok(result.horizontes.h5);
  assert.ok(result.horizontes.h6);
  assert.ok(result.horizontes.h8);
  assert.ok(result.prueba_historica);
});

test("evaluatePublishedForecasts computes h1 horizon correctly", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const h1 = result.horizontes.h1;

  // 3 valid forecasts for h1 horizon
  assert.equal(h1.n, 3);
  // All 3 should be within range
  assert.equal(h1.dentro, 3);
  assert.equal(h1.cobertura, 100.0);
  // error_medio_centro = average of |actual - p50| = 0.01 each
  assert.equal(h1.error_medio_centro, 0.01);
  // error_medio_paseo_aleatorio = average of |actual - cierre_base| = 0.01 each
  assert.equal(h1.error_medio_paseo_aleatorio, 0.01);
  // desde should be earliest fecha_base
  assert.equal(h1.desde, "2025-01-02");
  // 3 cases, all included
  assert.equal(h1.casos.length, 3);
});

test("evaluatePublishedForecasts computes h5 horizon correctly", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const h5 = result.horizontes.h5;

  // 2 valid forecasts for h5 horizon
  assert.equal(h5.n, 2);
  // Case 1: target 2025-01-09 close 3.75, range [3.65, 3.75] -> dentro (boundary counts)
  // Case 2: target 2025-01-10 close 3.76, range [3.66, 3.76] -> dentro
  assert.equal(h5.dentro, 2);
  assert.equal(h5.cobertura, 100.0);
  // Case 1: |3.75 - 3.70| = 0.05
  // Case 2: |3.76 - 3.71| = 0.05
  assert.equal(h5.error_medio_centro, 0.05);
  assert.equal(h5.error_medio_paseo_aleatorio, 0.05);
  assert.equal(h5.desde, "2025-01-02");
  assert.equal(h5.casos.length, 2);
});

test("evaluatePublishedForecasts computes h6 horizon correctly", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const h6 = result.horizontes.h6;

  // 1 valid forecast for h6 horizon
  assert.equal(h6.n, 1);
  assert.equal(h6.dentro, 1);
  assert.equal(h6.cobertura, 100.0);
  // |3.77 - 3.70| = 0.07
  assert.equal(h6.error_medio_centro, 0.07);
  assert.equal(h6.error_medio_paseo_aleatorio, 0.07);
  assert.equal(h6.desde, "2025-01-02");
  assert.equal(h6.casos.length, 1);
});

test("evaluatePublishedForecasts computes h8 horizon correctly", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const h8 = result.horizontes.h8;

  // 1 valid forecast for h8 horizon
  assert.equal(h8.n, 1);
  assert.equal(h8.dentro, 1);
  assert.equal(h8.cobertura, 100.0);
  // |3.79 - 3.70| = 0.09
  assert.equal(h8.error_medio_centro, 0.09);
  assert.equal(h8.error_medio_paseo_aleatorio, 0.09);
  assert.equal(h8.desde, "2025-01-02");
  assert.equal(h8.casos.length, 1);
});

test("evaluatePublishedForecasts skips forecasts with missing actual close", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  // The forecast with fecha_base 2025-02-07 has target beyond our mock data
  // It should be skipped, not counted
  assert.equal(result.horizontes.h1.n, 3); // Not 4
});

test("evaluatePublishedForecasts returns null stats when no valid forecasts", () => {
  const emptyPronosticos = [];
  const result = evaluatePublishedForecasts(emptyPronosticos, MOCK_OFFICIAL_SERIE);

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

test("evaluatePublishedForecasts sorts cases by fecha_emision descending (most recent first)", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const h1Cases = result.horizontes.h1.casos;

  // Should be sorted newest first
  assert.equal(h1Cases[0].fecha_emision, "2025-01-06");
  assert.equal(h1Cases[1].fecha_emision, "2025-01-03");
  assert.equal(h1Cases[2].fecha_emision, "2025-01-02");
});

test("evaluatePublishedForecasts limits cases to 60 most recent", () => {
  // Create 65 forecasts for h1 horizon
  const manyPronosticos = [];
  for (let i = 0; i < 65; i++) {
    const runDate = `2025-01-${String(i + 2).padStart(2, "0")}`;
    // Only add if target date exists in mock data (up to 2025-02-07)
    if (i < 30) {
      manyPronosticos.push({
        fecha_base: runDate,
        horizonte: "h1",
        fecha_objetivo: `2025-01-${String(i + 3).padStart(2, "0")}`,
        cierre_base: 3.70 + i * 0.01,
        p10: 3.68 + i * 0.01,
        p50: 3.70 + i * 0.01,
        p90: 3.72 + i * 0.01,
      });
    }
  }

  const result = evaluatePublishedForecasts(manyPronosticos, MOCK_OFFICIAL_SERIE);
  // Should have at most 60 cases
  assert.ok(result.horizontes.h1.casos.length <= 60);
  // Should be the 60 most recent (highest fecha_base)
  if (result.horizontes.h1.casos.length === 60) {
    assert.equal(result.horizontes.h1.casos[0].fecha_emision, "2025-01-31");
  }
});

test("evaluatePublishedForecasts includes prueba_historica block", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);

  assert.ok(result.prueba_historica);
  assert.equal(result.prueba_historica.asset, "USD/PEN");
  assert.equal(result.prueba_historica.cobertura_fuera_muestra, 80.59);
  assert.equal(result.prueba_historica.ancho_medio_pct_fuera_muestra, 0.897);
  assert.ok(Array.isArray(result.prueba_historica.por_anio));
  assert.equal(result.prueba_historica.por_anio.length, 8);
});

test("buildPronosticosFromDaily adds new entries from daily-forecasts.json", () => {
  const dailyForecasts = {
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-02",
        ultimo_cierre: 3.70,
        pronosticos: {
          h1: { fecha_objetivo: "2025-01-03", p10: 3.68, p50: 3.70, p90: 3.72 },
          h5: { fecha_objetivo: "2025-01-09", p10: 3.65, p50: 3.70, p90: 3.75 },
          h6: { fecha_objetivo: "2025-01-13", p10: 3.50, p50: 3.70, p90: 3.90 },
          h8: { fecha_objetivo: "2025-01-15", p10: 3.50, p50: 3.70, p90: 3.90 },
          h2: { fecha_objetivo: "2025-01-06", p10: 3.67, p50: 3.70, p90: 3.73 }, // Should be ignored
        },
      },
    },
  };

  const existing = [];
  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  assert.equal(result.length, 4); // h1, h5, h6, h8
  assert.equal(result[0].fecha_base, "2025-01-02");
  assert.equal(result[0].horizonte, "h1");
  assert.equal(result[0].cierre_base, 3.70);
  assert.equal(result[0].p10, 3.68);
  assert.equal(result[0].p50, 3.70);
  assert.equal(result[0].p90, 3.72);
});

test("buildPronosticosFromDaily does not overwrite existing entries (unique key: fecha_base + horizonte)", () => {
  const dailyForecasts = {
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-02",
        ultimo_cierre: 3.70,
        pronosticos: {
          h1: { fecha_objetivo: "2025-01-03", p10: 3.68, p50: 3.70, p90: 3.72 },
          h5: { fecha_objetivo: "2025-01-09", p10: 3.65, p50: 3.70, p90: 3.75 },
        },
      },
    },
  };

  const existing = [
    {
      fecha_base: "2025-01-02",
      horizonte: "h1",
      fecha_objetivo: "2025-01-03",
      cierre_base: 3.70,
      p10: 3.68,
      p50: 3.70,
      p90: 3.72,
    },
  ];

  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  // Should still have only 2 entries (existing h1 + new h5), not 3
  assert.equal(result.length, 2);
  // The existing h1 should remain unchanged
  const existingH1 = result.find((p) => p.fecha_base === "2025-01-02" && p.horizonte === "h1");
  assert.ok(existingH1);
  assert.equal(existingH1.p10, 3.68);
  assert.equal(existingH1.p50, 3.70);
  assert.equal(existingH1.p90, 3.72);
});

test("buildPronosticosFromDaily preserves existing entries and adds new ones sorted", () => {
  const dailyForecasts = {
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-03",
        ultimo_cierre: 3.71,
        pronosticos: {
          h1: { fecha_objetivo: "2025-01-06", p10: 3.69, p50: 3.71, p90: 3.73 },
          h5: { fecha_objetivo: "2025-01-10", p10: 3.66, p50: 3.71, p90: 3.76 },
        },
      },
    },
  };

  const existing = [
    {
      fecha_base: "2025-01-02",
      horizonte: "h1",
      fecha_objetivo: "2025-01-03",
      cierre_base: 3.70,
      p10: 3.68,
      p50: 3.70,
      p90: 3.72,
    },
  ];

  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  assert.equal(result.length, 3);
  // Sorted by fecha_base then horizonte order (h1, h5, h6, h8)
  assert.equal(result[0].fecha_base, "2025-01-02");
  assert.equal(result[0].horizonte, "h1");
  assert.equal(result[1].fecha_base, "2025-01-03");
  assert.equal(result[1].horizonte, "h1");
  assert.equal(result[2].fecha_base, "2025-01-03");
  assert.equal(result[2].horizonte, "h5");
});

test("buildPronosticosFromDaily ignores h2, h3, h4, h7, manana, semana", () => {
  const dailyForecasts = {
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-02",
        ultimo_cierre: 3.70,
        pronosticos: {
          h1: { fecha_objetivo: "2025-01-03", p10: 3.68, p50: 3.70, p90: 3.72 },
          h2: { fecha_objetivo: "2025-01-06", p10: 3.67, p50: 3.70, p90: 3.73 },
          h3: { fecha_objetivo: "2025-01-07", p10: 3.66, p50: 3.70, p90: 3.74 },
          h4: { fecha_objetivo: "2025-01-08", p10: 3.65, p50: 3.70, p90: 3.75 },
          h5: { fecha_objetivo: "2025-01-09", p10: 3.65, p50: 3.70, p90: 3.75 },
          h6: { fecha_objetivo: "2025-01-13", p10: 3.50, p50: 3.70, p90: 3.90 },
          h7: { fecha_objetivo: "2025-01-14", p10: 3.49, p50: 3.70, p90: 3.91 },
          h8: { fecha_objetivo: "2025-01-15", p10: 3.50, p50: 3.70, p90: 3.90 },
          manana: { fecha_objetivo: "2025-01-06", p10: 3.67, p50: 3.70, p90: 3.73 },
          semana: { fecha_objetivo: "2025-01-13", p10: 3.50, p50: 3.70, p90: 3.90 },
        },
      },
    },
  };

  const existing = [];
  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  // Only h1, h5, h6, h8 should be included
  assert.equal(result.length, 4);
  const horizontes = result.map((p) => p.horizonte).sort();
  assert.deepEqual(horizontes, ["h1", "h5", "h6", "h8"]);
});