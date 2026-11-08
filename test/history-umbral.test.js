import test from "node:test";
import assert from "node:assert/strict";
import { debeFallar } from "../scripts/history-umbral.js";

const simbolos = (prefijo, n) => new Set(Array.from({ length: n }, (_, i) => `${prefijo}${i}`));

test("updated previos ignore new failures without official source", () => {
  const previos = simbolos("P", 62);
  const actualizados = new Set(previos);
  assert.equal(debeFallar({ previos, actualizados, ok: 158 }), false);
});

test("fails when most previos stop updating", () => {
  const previos = simbolos("P", 62);
  const actualizados = simbolos("P", 30);
  assert.equal(debeFallar({ previos, actualizados, ok: 30 }), true);
});

test("cold cache does not fail with a healthy total", () => {
  assert.equal(debeFallar({ previos: new Set(), actualizados: new Set(), ok: 158 }), false);
});

test("cold cache fails with almost nothing fetched", () => {
  assert.equal(debeFallar({ previos: new Set(), actualizados: new Set(), ok: 10 }), true);
});

test("76% of previos updated does not fail", () => {
  const previos = simbolos("P", 62);
  assert.equal(debeFallar({ previos, actualizados: simbolos("P", 47), ok: 47 }), false);
});

test("74% of previos updated fails", () => {
  const previos = simbolos("P", 62);
  assert.equal(debeFallar({ previos, actualizados: simbolos("P", 46), ok: 46 }), true);
});

test("caché fría: con la SMV caída (pocas series de la SMV) falla aunque haya otras series", () => {
  assert.equal(debeFallar({ previos: new Set(), actualizados: new Set(), ok: 80, smv: 20 }), true);
});

test("caché fría: con la SMV respondiendo (125 series) no falla", () => {
  assert.equal(debeFallar({ previos: new Set(), actualizados: new Set(), ok: 158, smv: 125 }), false);
});
