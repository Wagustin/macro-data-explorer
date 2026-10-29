import test from "node:test";
import assert from "node:assert/strict";
import {
  isPositiveFinite,
  maxLogReturnThreshold,
  validateRow,
  validateForecasts,
} from "../scripts/validate-forecasts.js";

function makePath(price = 100, length = 48) {
  return Array.from({ length }, (_, i) => ({
    step: i + 1,
    date: `2026-${String(((i % 12) + 1)).padStart(2, "0")}-01`,
    p10: price * 0.85,
    p25: price * 0.92,
    p50: price,
    p75: price * 1.08,
    p90: price * 1.25,
  }));
}

function makeRow(symbol = "PEN=X", horizon = 12, price = 100, overrides = {}) {
  const p10 = overrides.p10 ?? price * 0.85;
  const p25 = overrides.p25 ?? price * 0.92;
  const p50 = overrides.p50 ?? price;
  const p75 = overrides.p75 ?? price * 1.08;
  const p90 = overrides.p90 ?? price * 1.25;
  const path = overrides.path ?? makePath(price, horizon);

  return {
    symbol,
    horizon,
    model: "perdata-engine-v5",
    run_at: "2026-10-28T10:00:00.000Z",
    last_close: overrides.last_close ?? price,
    p10,
    p25,
    p50,
    p75,
    p90,
    path,
    ...overrides,
  };
}

test("isPositiveFinite valida estrictamente números positivos finitos", () => {
  assert.equal(isPositiveFinite(10), true);
  assert.equal(isPositiveFinite(0.0001), true);
  assert.equal(isPositiveFinite(0), false);
  assert.equal(isPositiveFinite(-1), false);
  assert.equal(isPositiveFinite(NaN), false);
  assert.equal(isPositiveFinite(Infinity), false);
  assert.equal(isPositiveFinite(-Infinity), false);
  assert.equal(isPositiveFinite("10"), false);
  assert.equal(isPositiveFinite(null), false);
});

test("maxLogReturnThreshold interpola monótonamente entre 0.35 y 1.8", () => {
  assert.equal(Number(maxLogReturnThreshold(1).toFixed(4)), 0.35);
  assert.equal(Number(maxLogReturnThreshold(48).toFixed(4)), 1.8);
  assert.ok(maxLogReturnThreshold(12) > maxLogReturnThreshold(1));
  assert.ok(maxLogReturnThreshold(24) > maxLogReturnThreshold(12));
});

test("validateRow aprueba una fila normal válida", () => {
  const row = makeRow("PEN=X", 6, 3.75);
  const res = validateRow(row);
  assert.equal(res.valid, true);
  assert.equal(res.suspicious, false);
});

test("validateRow rechaza filas con NaN o valores no positivos", () => {
  const rowNanLastClose = makeRow("PEN=X", 6, 3.75, { last_close: NaN });
  assert.equal(validateRow(rowNanLastClose).valid, false);

  const rowNegative = makeRow("PEN=X", 6, 3.75, { p10: -0.5 });
  assert.equal(validateRow(rowNegative).valid, false);

  const rowZero = makeRow("PEN=X", 6, 3.75, { p50: 0 });
  assert.equal(validateRow(rowZero).valid, false);

  const rowInfinity = makeRow("PEN=X", 6, 3.75, { p90: Infinity });
  assert.equal(validateRow(rowInfinity).valid, false);

  const pathWithNan = makePath(3.75, 6);
  pathWithNan[2].p50 = NaN;
  const rowPathNan = makeRow("PEN=X", 6, 3.75, { path: pathWithNan });
  assert.equal(validateRow(rowPathNan).valid, false);
});

test("validateRow rechaza cuantiles cruzados en la fila y en el path", () => {
  // Cuantiles cruzados en fila: p10 > p25
  const rowCrossedRow = makeRow("PEN=X", 6, 100, { p10: 95, p25: 90 });
  const res1 = validateRow(rowCrossedRow);
  assert.equal(res1.valid, false);
  assert.equal(res1.reason, "crossed_quantiles");

  // Cuantiles cruzados en fila: p75 > p90
  const rowCrossedRow2 = makeRow("PEN=X", 6, 100, { p75: 120, p90: 110 });
  assert.equal(validateRow(rowCrossedRow2).valid, false);

  // Cuantiles cruzados en el path: p25 > p50 en un paso
  const badPath = makePath(100, 6);
  badPath[1].p25 = 105;
  badPath[1].p50 = 100;
  const rowCrossedPath = makeRow("PEN=X", 6, 100, { path: badPath });
  const res2 = validateRow(rowCrossedPath);
  assert.equal(res2.valid, false);
  assert.equal(res2.reason, "crossed_path_quantiles");
});

test("validateRow rechaza anchos absurdos (p90/p10 < 1.0 o > 40.0)", () => {
  // p90/p10 < 1.0
  const narrowRow = makeRow("PEN=X", 6, 100, { p10: 100, p25: 100, p50: 100, p75: 100, p90: 90 });
  assert.equal(validateRow(narrowRow).valid, false);

  // p90/p10 > 40.0
  const wideRow = makeRow("PEN=X", 6, 100, { p10: 2, p25: 10, p50: 50, p75: 80, p90: 90 }); // width = 45
  const res = validateRow(wideRow);
  assert.equal(res.valid, false);
  assert.equal(res.reason, "absurd_width");
});

test("validateRow detecta filas sospechosas sin descartarlas si cumplen (a)-(c)", () => {
  // En H=1, umbral es 0.35. Si last_close=100 y p50=150, log(1.5)=0.405 > 0.35
  const rowSuspicious = makeRow("PEN=X", 1, 100, {
    last_close: 100,
    p10: 120,
    p25: 135,
    p50: 150,
    p75: 170,
    p90: 190,
    path: [{ step: 1, date: "2026-11-01", p10: 120, p25: 135, p50: 150, p75: 170, p90: 190 }],
  });
  const res = validateRow(rowSuspicious);
  assert.equal(res.valid, true);
  assert.equal(res.suspicious, true);
});

test("validateForecasts aprueba un lote completo válido", () => {
  const rows = [];
  const history = {
    "PEN=X": Array.from({ length: 30 }, (_, i) => ({ date: `2024-${String((i % 12) + 1).padStart(2, "0")}-01`, close: 3.75 })),
    "HG=F": Array.from({ length: 30 }, (_, i) => ({ date: `2024-${String((i % 12) + 1).padStart(2, "0")}-01`, close: 4.2 })),
  };
  // Marcar última fecha fresca (hace 5 días)
  const recentDate = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  history["PEN=X"][29].date = recentDate;
  history["HG=F"][29].date = recentDate;

  for (const sym of ["PEN=X", "HG=F"]) {
    for (let h = 1; h <= 48; h++) {
      rows.push(makeRow(sym, h, sym === "PEN=X" ? 3.75 : 4.2));
    }
  }

  const { validRows, report, exito } = validateForecasts({ rows, history, previousCount: 96 });
  assert.equal(exito, true);
  assert.equal(validRows.length, 96);
  assert.equal(report.descartadas, 0);
  assert.equal(report.cobertura_ok, true);
  assert.equal(report.frescura_ok, true);
});

test("validateForecasts falla cuando más del 5% de filas son defectuosas", () => {
  const rows = [];
  const history = {
    "PEN=X": Array.from({ length: 30 }, () => ({ date: new Date().toISOString().slice(0, 10), close: 100 })),
  };

  // 100 filas: 6 defectuosas (6%), 94 válidas
  for (let i = 1; i <= 94; i++) {
    rows.push(makeRow("PEN=X", (i % 48) + 1, 100));
  }
  for (let i = 95; i <= 100; i++) {
    rows.push(makeRow("PEN=X", (i % 48) + 1, 100, { p50: NaN }));
  }

  const { report, exito } = validateForecasts({ rows, history, previousCount: 100 });
  assert.equal(exito, false);
  assert.equal(report.descartadas, 6);
  assert.equal(report.pct_descartadas, 6);
});

test("validateForecasts excluye filas defectuosas si son <= 5% conservando las válidas", () => {
  const rows = [];
  const recentDate = new Date().toISOString().slice(0, 10);
  const history = {
    "PEN=X": Array.from({ length: 30 }, () => ({ date: recentDate, close: 100 })),
  };

  // 100 filas: 2 defectuosas (2%), 98 válidas
  for (let i = 1; i <= 98; i++) {
    rows.push(makeRow("PEN=X", (i % 48) + 1, 100));
  }
  for (let i = 99; i <= 100; i++) {
    rows.push(makeRow("PEN=X", (i % 48) + 1, 100, { p10: NaN }));
  }

  const { validRows, report, exito } = validateForecasts({ rows, history, previousCount: 100 });
  assert.equal(exito, true);
  assert.equal(report.descartadas, 2);
  assert.equal(report.pct_descartadas, 2);
  assert.equal(validRows.length, 98);
});

test("validateForecasts falla por baja cobertura (<90% del día anterior)", () => {
  const rows = [];
  const recentDate = new Date().toISOString().slice(0, 10);
  const history = {
    "PEN=X": Array.from({ length: 30 }, () => ({ date: recentDate, close: 100 })),
  };

  // 80 filas válidas con anterior de 100 -> cobertura = 80% (< 90%)
  for (let i = 1; i <= 80; i++) {
    rows.push(makeRow("PEN=X", (i % 48) + 1, 100));
  }

  const { report, exito } = validateForecasts({ rows, history, previousCount: 100 });
  assert.equal(exito, false);
  assert.equal(report.cobertura_ok, false);
});

test("validateForecasts falla si un símbolo con historia suficiente pierde todos sus plazos", () => {
  const recentDate = new Date().toISOString().slice(0, 10);
  const history = {
    "PEN=X": Array.from({ length: 30 }, () => ({ date: recentDate, close: 100 })),
    "BAP.LM": Array.from({ length: 30 }, () => ({ date: recentDate, close: 150 })),
  };

  // Solo rows para PEN=X, BAP.LM pierde todos sus plazos
  const rows = [];
  for (let h = 1; h <= 48; h++) {
    rows.push(makeRow("PEN=X", h, 100));
  }

  const { report, exito } = validateForecasts({ rows, history, previousCount: 48 });
  assert.equal(exito, false);
  assert.equal(report.cobertura_ok, false);
  assert.ok(report.simbolos_faltantes.includes("BAP.LM"));
});

test("validateForecasts falla por frescura si el último cierre tiene más de 40 días", () => {
  const oldDate = new Date(Date.now() - 50 * 864e5).toISOString().slice(0, 10);
  const history = {
    "PEN=X": Array.from({ length: 30 }, () => ({ date: oldDate, close: 100 })),
  };

  const rows = [];
  for (let h = 1; h <= 48; h++) {
    rows.push(makeRow("PEN=X", h, 100));
  }

  const { report, exito } = validateForecasts({ rows, history, previousCount: 48 });
  assert.equal(exito, false);
  assert.equal(report.frescura_ok, false);
  assert.equal(report.simbolos_viejos.length, 1);
});
