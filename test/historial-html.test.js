import test from "node:test";
import assert from "node:assert/strict";
import { renderHistorial } from "../scripts/lib/historial-html.js";

function makeAciertos(overrides = {}) {
  const base = {
    actualizado: "2026-11-09",
    horizontes: {
      manana: {
        desde: "2026-11-03",
        n: 3,
        dentro: 2,
        cobertura: 66.7,
        error_medio_centro: 0.0157,
        error_medio_paseo_aleatorio: 0.0157,
        casos: [
          {
            fecha_publicacion: "2026-11-05",
            fecha_base: "2026-11-04",
            fecha_objetivo: "2026-11-06",
            p10: 3.4346,
            p50: 3.452,
            p90: 3.4684,
            cierre: 3.433,
            dentro: false,
          },
          {
            fecha_publicacion: "2026-11-04",
            fecha_base: "2026-11-02",
            fecha_objetivo: "2026-11-05",
            p10: 3.4428,
            p50: 3.466,
            p90: 3.4866,
            cierre: 3.452,
            dentro: true,
          },
          {
            fecha_publicacion: "2026-11-03",
            fecha_base: "2026-11-02",
            fecha_objetivo: "2026-11-04",
            p10: 3.4488,
            p50: 3.466,
            p90: 3.4822,
            cierre: 3.452,
            dentro: true,
          },
        ],
      },
      semana: {
        desde: null,
        n: 0,
        dentro: 0,
        cobertura: null,
        error_medio_centro: null,
        error_medio_paseo_aleatorio: null,
        casos: [],
      },
    },
    prueba_historica: {
      asset: "USD/PEN",
      horizonte: "1 día hábil (siguiente cierre)",
      periodo: "2019-01-02–2026-11-05",
      metodo: "FHS + EWMA(0.94), P50 = paseo aleatorio, K recalibrado con historia hasta cada corte",
      k_recalculo_dias_habiles: 5,
      min_cortes_calibracion: 60,
      cortes: 1958,
      cortes_estables: 1898,
      cobertura_fuera_muestra: 80.59,
      ancho_medio_pct_fuera_muestra: 0.897,
      por_anio: [
        { anio: 2019, n: 249, cobertura: 79.12, ancho_pct: 0.608 },
        { anio: 2020, n: 254, cobertura: 82.68, ancho_pct: 0.965 },
        { anio: 2021, n: 251, cobertura: 82.87, ancho_pct: 1.176 },
        { anio: 2022, n: 251, cobertura: 78.09, ancho_pct: 1.146 },
        { anio: 2023, n: 250, cobertura: 80, ancho_pct: 0.773 },
        { anio: 2024, n: 246, cobertura: 78.46, ancho_pct: 0.855 },
        { anio: 2025, n: 248, cobertura: 80.65, ancho_pct: 0.698 },
        { anio: 2026, n: 209, cobertura: 83.25, ancho_pct: 0.961 },
      ],
    },
    backtest_motor: {
      manana: {
        cobertura_80_k_expansivo: 81.2,
        cortes_evaluados: 1957,
      },
      semana: {
        cobertura_80_k_expansivo: 84.67,
        cortes_evaluados: 1953,
      },
    },
  };
  return { ...base, ...overrides };
}

test("renderHistorial returns HTML string", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(typeof html === "string");
  assert.ok(html.length > 0);
});

test("renderHistorial includes header with correct h2 and paragraph", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Rangos publicados desde el 4 de noviembre de 2026"));
  assert.ok(html.includes("Prueba histórica (no son rangos publicados)"));
});

test("renderHistorial part (a) with n=3 shows no percentage sign", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  // Part (a) for manana with n=3 should NOT contain "%"
  const partAStart = html.indexOf("Rangos publicados desde el 4 de noviembre de 2026");
  const partBStart = html.indexOf("Prueba histórica (no son rangos publicados)");
  const partA = html.slice(partAStart, partBStart);
  assert.ok(!partA.includes("%"), "Part (a) should not contain % when n < 20");
  assert.ok(partA.includes("2 de 3 cierres cayeron dentro del rango publicado"));
  assert.ok(partA.includes("Todavía hay pocos casos (3); el porcentaje se mostrará a partir de 20"));
});

test("renderHistorial part (a) manana table has correct columns and data", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Cierre del"));
  assert.ok(html.includes("Rango publicado"));
  assert.ok(html.includes("Cierre real"));
  assert.ok(html.includes("Resultado"));
  assert.ok(html.includes("6 nov"));
  assert.ok(html.includes("3.435 – 3.468"));
  assert.ok(html.includes("3.433"));
  assert.ok(html.includes("fuera"));
  assert.ok(html.includes("dentro"));
  assert.ok(html.includes("en soles por dólar"));
});

test("renderHistorial part (a) semana shows correct message when n=0", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Rango para la semana"));
  assert.ok(html.includes("Aún no ha vencido ningún rango semanal"));
  // Should not have table for semana when n=0
  const semanaStart = html.indexOf("Rango para la semana");
  const partBStart = html.indexOf("Prueba histórica (no son rangos publicados)");
  const semanaSection = html.slice(semanaStart, partBStart);
  assert.ok(!semanaSection.includes("<table"));
});

test("renderHistorial part (b) includes correct intro paragraph", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Entre enero de 2019 y noviembre de 2026"));
  assert.ok(html.includes("80.59%"));
  assert.ok(html.includes("1 958 días"));
});

test("renderHistorial part (b) yearly table has correct columns", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Año"));
  assert.ok(html.includes("Días"));
  assert.ok(html.includes("Dentro del rango"));
  assert.ok(html.includes("2019"));
  assert.ok(html.includes("249"));
  assert.ok(html.includes("79.12%"));
  assert.ok(html.includes("80.00%")); // 2023 should show 80.00% with 2 decimals
});

test("renderHistorial part (b) includes backtest_motor paragraph", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Hasta el 9 de noviembre de 2026 el rango del día siguiente partía de un cierre de dos días hábiles atrás"));
  assert.ok(html.includes("que SUNAT difunde de madrugada"));
  assert.ok(!html.includes("SUNAT pública"));
  assert.ok(html.includes("81.2 %"));
  assert.ok(html.includes("desde 2024"));
  assert.ok(!html.includes("1 957"));
  assert.ok(html.includes("84.7 %"));
  assert.ok(!html.includes("1 953"));
});

test("renderHistorial includes footer with update date", () => {
  const aciertos = makeAciertos();
  const html = renderHistorial(aciertos);
  assert.ok(html.includes("Actualizado el 9 nov de 2026"));
  assert.ok(html.includes("Cierres: tipo de cambio venta SBS, publicado por el BCRP y por SUNAT"));
});

test("renderHistorial handles missing aciertos gracefully", () => {
  const html = renderHistorial(null);
  assert.ok(html.includes("Historial no disponible"));
});

test("renderHistorial part (a) with n>=20 shows percentage", () => {
  const aciertos = makeAciertos({
    horizontes: {
      manana: {
        desde: "2026-01-01",
        n: 25,
        dentro: 20,
        cobertura: 80.0,
        error_medio_centro: 0.0157,
        error_medio_paseo_aleatorio: 0.0157,
        casos: [],
      },
      semana: {
        desde: null,
        n: 0,
        dentro: 0,
        cobertura: null,
        error_medio_centro: null,
        error_medio_paseo_aleatorio: null,
        casos: [],
      },
    },
  });
  const html = renderHistorial(aciertos);
  const partAStart = html.indexOf("Rangos publicados desde el 4 de noviembre de 2026");
  const partBStart = html.indexOf("Prueba histórica (no son rangos publicados)");
  const partA = html.slice(partAStart, partBStart);
  assert.ok(partA.includes("20 de 25 cierres cayeron dentro del rango publicado (80.00%)"));
  assert.ok(partA.includes("El rango promete 8 de cada 10"));
});