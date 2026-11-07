import test from "node:test";
import assert from "node:assert/strict";

import { umbralPct, evaluarFila } from "../scripts/alertas-reglas.js";

// Fila de seguimiento con valores ausentes (null) por defecto.
function fila(over = {}) {
  return {
    user_id: "u1",
    simbolo: "AAA",
    alerta_arriba: null,
    alerta_abajo: null,
    precio_base: null,
    alerta_pct_arriba: null,
    alerta_pct_abajo: null,
    ...over
  };
}

test("umbralPct derives 5% thresholds and rejects invalid data", () => {
  assert.equal(umbralPct(100, 5, "abajo"), 95);
  assert.equal(umbralPct(100, 5, "arriba"), 105);

  assert.equal(umbralPct(null, 5, "abajo"), null);
  assert.equal(umbralPct(undefined, 5, "abajo"), null);
  assert.equal(umbralPct(100, null, "abajo"), null);
  assert.equal(umbralPct(100, 0, "arriba"), null);
  assert.equal(umbralPct(0, 5, "abajo"), null);
  assert.equal(umbralPct(-10, 5, "abajo"), null);
  assert.equal(umbralPct(NaN, 5, "arriba"), null);
  assert.equal(umbralPct(100, Infinity, "arriba"), null);
  assert.equal(umbralPct("", 5, "arriba"), null);
});

test("pct_abajo fires at the threshold and does not repeat when already sent", () => {
  const row = fila({ precio_base: 100, alerta_pct_abajo: 5 }); // umbral 95

  const cruce = evaluarFila({ fila: row, precio: 94.9, enviadas: new Set() });
  assert.deepEqual(cruce.avisar, [{ tipo: "pct_abajo", nivel: 5, base: 100, precio: 94.9 }]);
  assert.deepEqual(cruce.rearmar, []);

  const justo = evaluarFila({ fila: row, precio: 95, enviadas: new Set() });
  assert.equal(justo.avisar.length, 1);
  assert.equal(justo.avisar[0].tipo, "pct_abajo");

  const repetido = evaluarFila({
    fila: row,
    precio: 90,
    enviadas: new Set(["u1|AAA|pct_abajo|5"])
  });
  assert.deepEqual(repetido.avisar, []);
});

test("pct_arriba fires at the threshold", () => {
  const row = fila({ precio_base: 100, alerta_pct_arriba: 5 }); // umbral 105

  const cruce = evaluarFila({ fila: row, precio: 105.1, enviadas: new Set() });
  assert.deepEqual(cruce.avisar, [{ tipo: "pct_arriba", nivel: 5, base: 100, precio: 105.1 }]);

  const abajo = evaluarFila({ fila: row, precio: 104.9, enviadas: new Set() });
  assert.deepEqual(abajo.avisar, []);
});

test("pct_abajo rearms once the price rises above the threshold plus 0.5%", () => {
  const row = fila({ precio_base: 100, alerta_pct_abajo: 5 }); // umbral 95; rearme > 95.475
  const enviadas = new Set(["u1|AAA|pct_abajo|5"]);

  const cerca = evaluarFila({ fila: row, precio: 95.4, enviadas });
  assert.deepEqual(cerca.rearmar, []);

  const rearma = evaluarFila({ fila: row, precio: 95.5, enviadas });
  assert.deepEqual(rearma.rearmar, [{ tipo: "pct_abajo", nivel: 5, base: 100 }]);

  const sinEnviar = evaluarFila({ fila: row, precio: 96, enviadas: new Set() });
  assert.deepEqual(sinEnviar.rearmar, []);
});

test("a percentage alert without precio_base produces nothing", () => {
  const row = fila({ alerta_pct_abajo: 5, alerta_pct_arriba: 5 });

  const r = evaluarFila({ fila: row, precio: 1, enviadas: new Set() });
  assert.deepEqual(r, { avisar: [], rearmar: [] });
});

test("absolute thresholds keep the previous behaviour", () => {
  const row = fila({ alerta_arriba: 100, alerta_abajo: 90 });

  const arriba = evaluarFila({ fila: row, precio: 100, enviadas: new Set() });
  assert.deepEqual(arriba.avisar, [{ tipo: "arriba", nivel: 100 }]);

  const abajo = evaluarFila({ fila: row, precio: 90, enviadas: new Set() });
  assert.deepEqual(abajo.avisar, [{ tipo: "abajo", nivel: 90 }]);

  const rearmaArriba = evaluarFila({
    fila: row,
    precio: 99.4,
    enviadas: new Set(["u1|AAA|arriba|100"])
  });
  assert.deepEqual(rearmaArriba.rearmar, [{ tipo: "arriba", nivel: 100 }]);

  const rearmaAbajo = evaluarFila({
    fila: row,
    precio: 90.5,
    enviadas: new Set(["u1|AAA|abajo|90"])
  });
  assert.deepEqual(rearmaAbajo.rearmar, [{ tipo: "abajo", nivel: 90 }]);

  const repetido = evaluarFila({
    fila: row,
    precio: 100,
    enviadas: new Set(["u1|AAA|arriba|100"])
  });
  assert.deepEqual(repetido.avisar, []);
});

test("a row without usable data produces nothing and never throws", () => {
  assert.deepEqual(evaluarFila({ fila: fila(), precio: 10, enviadas: new Set() }), { avisar: [], rearmar: [] });
  assert.deepEqual(evaluarFila({ fila: null, precio: 10, enviadas: new Set() }), { avisar: [], rearmar: [] });
  assert.deepEqual(evaluarFila({ fila: fila({ alerta_abajo: 90 }), precio: NaN, enviadas: new Set() }), { avisar: [], rearmar: [] });
});
