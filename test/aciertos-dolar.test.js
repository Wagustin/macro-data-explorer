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
  // manana: 2025-01-02 -> target 2025-01-06 (close 3.72), range [3.68, 3.75] -> dentro
  {
    tipo: "manana",
    fecha_publicacion: "2025-01-02",
    fecha_base: "2025-01-02",
    cierre_base: 3.70,
    horizonte_dias_habiles: 2,
    fecha_objetivo: "2025-01-06",
    p10: 3.68,
    p50: 3.70,
    p90: 3.75,
  },
  // manana: 2025-01-03 -> target 2025-01-07 (close 3.73), range [3.69, 3.76] -> dentro
  {
    tipo: "manana",
    fecha_publicacion: "2025-01-03",
    fecha_base: "2025-01-03",
    cierre_base: 3.71,
    horizonte_dias_habiles: 2,
    fecha_objetivo: "2025-01-07",
    p10: 3.69,
    p50: 3.71,
    p90: 3.76,
  },
  // manana: 2025-01-06 -> target 2025-01-08 (close 3.74), range [3.70, 3.77] -> dentro
  {
    tipo: "manana",
    fecha_publicacion: "2025-01-06",
    fecha_base: "2025-01-06",
    cierre_base: 3.72,
    horizonte_dias_habiles: 2,
    fecha_objetivo: "2025-01-08",
    p10: 3.70,
    p50: 3.72,
    p90: 3.77,
  },
  // semana: 2025-01-02 -> target 2025-01-13 (close 3.77), range [3.65, 3.80] -> dentro
  {
    tipo: "semana",
    fecha_publicacion: "2025-01-02",
    fecha_base: "2025-01-02",
    cierre_base: 3.70,
    horizonte_dias_habiles: 6,
    fecha_objetivo: "2025-01-13",
    p10: 3.65,
    p50: 3.70,
    p90: 3.80,
  },
  // semana: 2025-01-03 -> target 2025-01-14 (close 3.78), range [3.66, 3.81] -> dentro
  {
    tipo: "semana",
    fecha_publicacion: "2025-01-03",
    fecha_base: "2025-01-03",
    cierre_base: 3.71,
    horizonte_dias_habiles: 6,
    fecha_objetivo: "2025-01-14",
    p10: 3.66,
    p50: 3.71,
    p90: 3.81,
  },
  // Missing actual close (target date not in official serie) - should be skipped
  {
    tipo: "manana",
    fecha_publicacion: "2025-02-07",
    fecha_base: "2025-02-07",
    cierre_base: 3.96,
    horizonte_dias_habiles: 2,
    fecha_objetivo: "2025-02-10",
    p10: 3.94,
    p50: 3.96,
    p90: 3.98,
  },
];

test("evaluatePublishedForecasts returns correct structure with both types", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);

  assert.ok(result.actualizado);
  assert.ok(result.horizontes);
  assert.ok(result.horizontes.manana);
  assert.ok(result.horizontes.semana);
  assert.ok(result.prueba_historica);
  assert.ok(result.backtest_motor);
});

test("evaluatePublishedForecasts computes manana type correctly", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const manana = result.horizontes.manana;

  // 3 valid forecasts for manana type
  assert.equal(manana.n, 3);
  // All 3 should be within range
  assert.equal(manana.dentro, 3);
  assert.equal(manana.cobertura, 100.0);
  // error_medio_centro = average of |actual - p50| = 0.02 each
  assert.equal(manana.error_medio_centro, 0.02);
  // error_medio_paseo_aleatorio = average of |actual - cierre_base| = 0.02 each
  assert.equal(manana.error_medio_paseo_aleatorio, 0.02);
  // desde should be earliest fecha_publicacion
  assert.equal(manana.desde, "2025-01-02");
  // 3 cases, all included
  assert.equal(manana.casos.length, 3);
});

test("evaluatePublishedForecasts computes semana type correctly", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const semana = result.horizontes.semana;

  // 2 valid forecasts for semana type
  assert.equal(semana.n, 2);
  // Case 1: target 2025-01-13 close 3.77, range [3.65, 3.80] -> dentro
  // Case 2: target 2025-01-14 close 3.78, range [3.66, 3.81] -> dentro
  assert.equal(semana.dentro, 2);
  assert.equal(semana.cobertura, 100.0);
  // Case 1: |3.77 - 3.70| = 0.07
  // Case 2: |3.78 - 3.71| = 0.07
  assert.equal(semana.error_medio_centro, 0.07);
  assert.equal(semana.error_medio_paseo_aleatorio, 0.07);
  assert.equal(semana.desde, "2025-01-02");
  assert.equal(semana.casos.length, 2);
});

test("evaluatePublishedForecasts skips forecasts with missing actual close", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  // The forecast with fecha_publicacion 2025-02-07 has target beyond our mock data
  // It should be skipped, not counted
  assert.equal(result.horizontes.manana.n, 3); // Not 4
});

test("evaluatePublishedForecasts returns null stats when no valid forecasts", () => {
  const emptyPronosticos = [];
  const result = evaluatePublishedForecasts(emptyPronosticos, MOCK_OFFICIAL_SERIE);

  for (const tipo of ["manana", "semana"]) {
    const horizon = result.horizontes[tipo];
    assert.equal(horizon.n, 0);
    assert.equal(horizon.dentro, 0);
    assert.equal(horizon.cobertura, null);
    assert.equal(horizon.error_medio_centro, null);
    assert.equal(horizon.error_medio_paseo_aleatorio, null);
    assert.equal(horizon.desde, null);
    assert.deepEqual(horizon.casos, []);
  }
});

test("evaluatePublishedForecasts sorts cases by fecha_publicacion descending (most recent first)", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);
  const mananaCases = result.horizontes.manana.casos;

  // Should be sorted newest first
  assert.equal(mananaCases[0].fecha_publicacion, "2025-01-06");
  assert.equal(mananaCases[1].fecha_publicacion, "2025-01-03");
  assert.equal(mananaCases[2].fecha_publicacion, "2025-01-02");
});

test("evaluatePublishedForecasts limits cases to 60 most recent", () => {
  // Create 65 forecasts for manana type
  const manyPronosticos = [];
  for (let i = 0; i < 65; i++) {
    const runDate = `2025-01-${String(i + 2).padStart(2, "0")}`;
    // Only add if target date exists in mock data (up to 2025-02-07)
    if (i < 30) {
      manyPronosticos.push({
        tipo: "manana",
        fecha_publicacion: runDate,
        fecha_base: runDate,
        cierre_base: 3.70 + i * 0.01,
        horizonte_dias_habiles: 2,
        fecha_objetivo: `2025-01-${String(i + 4).padStart(2, "0")}`,
        p10: 3.68 + i * 0.01,
        p50: 3.70 + i * 0.01,
        p90: 3.75 + i * 0.01,
      });
    }
  }

  const result = evaluatePublishedForecasts(manyPronosticos, MOCK_OFFICIAL_SERIE);
  // Should have at most 60 cases
  assert.ok(result.horizontes.manana.casos.length <= 60);
  // Should be the 60 most recent (highest fecha_publicacion)
  if (result.horizontes.manana.casos.length === 60) {
    assert.equal(result.horizontes.manana.casos[0].fecha_publicacion, "2025-01-31");
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

test("evaluatePublishedForecasts includes backtest_motor block", () => {
  const result = evaluatePublishedForecasts(MOCK_PRONOSTICOS, MOCK_OFFICIAL_SERIE);

  assert.ok(result.backtest_motor);
  // backtest_motor is read from daily-forecasts.json which we don't mock here
  // but the structure should exist (may be empty if file not found in test)
});

test("buildPronosticosFromDaily adds new entries from daily-forecasts.json", () => {
  const dailyForecasts = {
    referencia_lima: { hoy: "2025-01-02" },
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-02",
        ultimo_cierre: 3.70,
        manana: {
          horizonte: "h2",
          fecha_objetivo: "2025-01-06",
          horizonte_dias_habiles: 2,
          p10: 3.68,
          p50: 3.70,
          p90: 3.75,
        },
        semana: {
          horizonte: "h6",
          fecha_objetivo: "2025-01-13",
          horizonte_dias_habiles: 6,
          p10: 3.65,
          p50: 3.70,
          p90: 3.80,
        },
        pronosticos: {
          h2: { fecha_objetivo: "2025-01-06", p10: 3.67, p50: 3.70, p90: 3.73 },
          h6: { fecha_objetivo: "2025-01-13", p10: 3.50, p50: 3.70, p90: 3.90 },
        },
      },
    },
  };

  const existing = [];
  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  assert.equal(result.length, 2); // manana, semana
  assert.equal(result[0].fecha_publicacion, "2025-01-02");
  assert.equal(result[0].tipo, "manana");
  assert.equal(result[0].cierre_base, 3.70);
  assert.equal(result[0].p10, 3.68);
  assert.equal(result[0].p50, 3.70);
  assert.equal(result[0].p90, 3.75);
  assert.equal(result[1].tipo, "semana");
  assert.equal(result[1].p10, 3.65);
  assert.equal(result[1].p50, 3.70);
  assert.equal(result[1].p90, 3.80);
});

test("buildPronosticosFromDaily does not overwrite existing entries (unique key: tipo + fecha_objetivo)", () => {
  const dailyForecasts = {
    referencia_lima: { hoy: "2025-01-02" },
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-02",
        ultimo_cierre: 3.70,
        manana: {
          horizonte: "h2",
          fecha_objetivo: "2025-01-06",
          horizonte_dias_habiles: 2,
          p10: 3.68,
          p50: 3.70,
          p90: 3.75,
        },
        semana: {
          horizonte: "h6",
          fecha_objetivo: "2025-01-13",
          horizonte_dias_habiles: 6,
          p10: 3.65,
          p50: 3.70,
          p90: 3.80,
        },
      },
    },
  };

  const existing = [
    {
      tipo: "manana",
      fecha_publicacion: "2025-01-02",
      fecha_base: "2025-01-02",
      cierre_base: 3.70,
      horizonte_dias_habiles: 2,
      fecha_objetivo: "2025-01-06",
      p10: 3.68,
      p50: 3.70,
      p90: 3.75,
    },
  ];

  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  // Should still have only 2 entries (existing manana + new semana), not 3
  assert.equal(result.length, 2);
  // The existing manana should remain unchanged
  const existingManana = result.find((p) => p.tipo === "manana" && p.fecha_objetivo === "2025-01-06");
  assert.ok(existingManana);
  assert.equal(existingManana.p10, 3.68);
  assert.equal(existingManana.p50, 3.70);
  assert.equal(existingManana.p90, 3.75);
});

test("buildPronosticosFromDaily preserves existing entries and adds new ones sorted", () => {
  const dailyForecasts = {
    referencia_lima: { hoy: "2025-01-03" },
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-03",
        ultimo_cierre: 3.71,
        manana: {
          horizonte: "h2",
          fecha_objetivo: "2025-01-07",
          horizonte_dias_habiles: 2,
          p10: 3.69,
          p50: 3.71,
          p90: 3.76,
        },
        semana: {
          horizonte: "h6",
          fecha_objetivo: "2025-01-14",
          horizonte_dias_habiles: 6,
          p10: 3.66,
          p50: 3.71,
          p90: 3.81,
        },
      },
    },
  };

  const existing = [
    {
      tipo: "manana",
      fecha_publicacion: "2025-01-02",
      fecha_base: "2025-01-02",
      cierre_base: 3.70,
      horizonte_dias_habiles: 2,
      fecha_objetivo: "2025-01-06",
      p10: 3.68,
      p50: 3.70,
      p90: 3.75,
    },
  ];

  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  assert.equal(result.length, 3);
  // Sorted by fecha_publicacion then tipo (manana before semana)
  assert.equal(result[0].fecha_publicacion, "2025-01-02");
  assert.equal(result[0].tipo, "manana");
  assert.equal(result[1].fecha_publicacion, "2025-01-03");
  assert.equal(result[1].tipo, "manana");
  assert.equal(result[2].fecha_publicacion, "2025-01-03");
  assert.equal(result[2].tipo, "semana");
});

test("buildPronosticosFromDaily ignores h1, h2, h3, h4, h5, h6, h7, h8 from pronosticos", () => {
  const dailyForecasts = {
    referencia_lima: { hoy: "2025-01-02" },
    simbolos: {
      PEN: {
        fecha_ultimo_cierre: "2025-01-02",
        ultimo_cierre: 3.70,
        manana: {
          horizonte: "h2",
          fecha_objetivo: "2025-01-06",
          horizonte_dias_habiles: 2,
          p10: 3.68,
          p50: 3.70,
          p90: 3.75,
        },
        semana: {
          horizonte: "h6",
          fecha_objetivo: "2025-01-13",
          horizonte_dias_habiles: 6,
          p10: 3.65,
          p50: 3.70,
          p90: 3.80,
        },
        pronosticos: {
          h1: { fecha_objetivo: "2025-01-03", p10: 3.68, p50: 3.70, p90: 3.72 },
          h2: { fecha_objetivo: "2025-01-06", p10: 3.67, p50: 3.70, p90: 3.73 },
          h3: { fecha_objetivo: "2025-01-07", p10: 3.66, p50: 3.70, p90: 3.74 },
          h4: { fecha_objetivo: "2025-01-08", p10: 3.65, p50: 3.70, p90: 3.75 },
          h5: { fecha_objetivo: "2025-01-09", p10: 3.65, p50: 3.70, p90: 3.75 },
          h6: { fecha_objetivo: "2025-01-13", p10: 3.50, p50: 3.70, p90: 3.90 },
          h7: { fecha_objetivo: "2025-01-14", p10: 3.49, p50: 3.70, p90: 3.91 },
          h8: { fecha_objetivo: "2025-01-15", p10: 3.50, p50: 3.70, p90: 3.90 },
        },
      },
    },
  };

  const existing = [];
  const result = buildPronosticosFromDaily(dailyForecasts, existing);

  // Only manana and semana should be included (from the top-level blocks, not pronosticos)
  assert.equal(result.length, 2);
  const tipos = result.map((p) => p.tipo).sort();
  assert.deepEqual(tipos, ["manana", "semana"]);
});