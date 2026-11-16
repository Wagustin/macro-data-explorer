import test from "node:test";
import assert from "node:assert/strict";
import { formatearResumen } from "../scripts/interes-resumen.mjs";

test("interes-resumen: formatearResumen con todos los datos", () => {
  const datos = {
    suscriptores: {
      "acceso-anticipado": { total: 7, confirmados: 6, pendientes: 1 },
      "interes-boletin": { total: 3, confirmados: 2, pendientes: 1 },
      "interes-pro": { total: 5, confirmados: 4, pendientes: 1 },
    },
    votos: { alertas: 4, excel: 2, mas_empresas: 1, whatsapp: 0, api: 3 },
  };
  const resultado = formatearResumen(datos);
  assert.equal(
    resultado,
    "Interés: Boletín 3 (2 confirmados), Pro 5 (4 confirmados), sin plan 7 (6 confirmados). Votos: alertas 4, api 3, excel 2, mas_empresas 1, whatsapp 0."
  );
});

test("interes-resumen: formatearResumen solo con boletín y pro", () => {
  const datos = {
    suscriptores: {
      "interes-boletin": { total: 10, confirmados: 8, pendientes: 2 },
      "interes-pro": { total: 5, confirmados: 5, pendientes: 0 },
    },
    votos: { alertas: 3, api: 2 },
  };
  const resultado = formatearResumen(datos);
  assert.equal(
    resultado,
    "Interés: Boletín 10 (8 confirmados), Pro 5 (5 confirmados). Votos: alertas 3, api 2."
  );
});

test("interes-resumen: formatearResumen solo con acceso-anticipado", () => {
  const datos = {
    suscriptores: {
      "acceso-anticipado": { total: 12, confirmados: 10, pendientes: 2 },
    },
    votos: { alertas: 5 },
  };
  const resultado = formatearResumen(datos);
  assert.equal(
    resultado,
    "Interés: sin plan 12 (10 confirmados). Votos: alertas 5."
  );
});

test("interes-resumen: formatearResumen sin votos", () => {
  const datos = {
    suscriptores: {
      "interes-boletin": { total: 3, confirmados: 2, pendientes: 1 },
      "interes-pro": { total: 5, confirmados: 4, pendientes: 1 },
    },
    votos: {},
  };
  const resultado = formatearResumen(datos);
  assert.equal(
    resultado,
    "Interés: Boletín 3 (2 confirmados), Pro 5 (4 confirmados)."
  );
});

test("interes-resumen: formatearResumen con error en votos", () => {
  const datos = {
    suscriptores: {
      "interes-boletin": { total: 3, confirmados: 2, pendientes: 1 },
      "interes-pro": { total: 5, confirmados: 4, pendientes: 1 },
    },
    votos: { error: "connection refused" },
  };
  const resultado = formatearResumen(datos);
  assert.equal(
    resultado,
    "Interés: Boletín 3 (2 confirmados), Pro 5 (4 confirmados). Votos: error al consultar D1 (connection refused)."
  );
});

test("interes-resumen: formatearResumen sin suscriptores", () => {
  const datos = { votos: { alertas: 1 } };
  const resultado = formatearResumen(datos);
  assert.equal(resultado, "Sin datos de suscriptores");
});

test("interes-resumen: formatearResumen null", () => {
  const resultado = formatearResumen(null);
  assert.equal(resultado, "Sin datos");
});

test("interes-resumen: formatearResumen undefined", () => {
  const resultado = formatearResumen(undefined);
  assert.equal(resultado, "Sin datos");
});

test("interes-resumen: votos ordenados por cantidad descendente", () => {
  const datos = {
    suscriptores: {
      "interes-boletin": { total: 1, confirmados: 1, pendientes: 0 },
    },
    votos: { a: 1, b: 5, c: 3 },
  };
  const resultado = formatearResumen(datos);
  assert.equal(
    resultado,
    "Interés: Boletín 1 (1 confirmados). Votos: b 5, c 3, a 1."
  );
});