import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { candidatosComercio, candidatosAndina, actualizarEstado } from "../scripts/cierre-1330.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMERCIO = fs.readFileSync(path.join(ROOT, "test", "fixtures", "cierre-1330-comercio.xml"), "utf8");
const COMERCIO_12NOV = fs.readFileSync(path.join(ROOT, "test", "fixtures", "cierre-1330-comercio-12nov.xml"), "utf8");
const ANDINA = fs.readFileSync(path.join(ROOT, "test", "fixtures", "cierre-1330-andina.xml"), "utf8");

const clave = (lista) => [...new Set(lista.map((c) => `${c.fecha}|${c.tipo}|${c.valor}`))].sort();

const CANDIDATOS_ESPERADOS = [
  "2026-11-09|envivo|3.409",
  "2026-11-10|envivo|3.413",
  "2026-11-10|nota|3.413",
  "2026-11-11|andina|3.409",
  "2026-11-11|envivo|3.409",
  "2026-11-11|nota|3.409",
];

test("candidatos: las dos muestras dan exactamente los candidatos esperados", () => {
  const comercio = candidatosComercio(COMERCIO);
  const andina = candidatosAndina(ANDINA);
  assert.deepEqual(clave([...comercio, ...andina]), CANDIDATOS_ESPERADOS);
  assert.ok(comercio.every((c) => c.tipo !== "andina"));
  assert.ok(andina.every((c) => c.tipo === "andina"));
  assert.ok([...comercio, ...andina].every((c) => typeof c.valor === "number" && c.url.startsWith("https://")));
});

test("candidatos: texto vacío o que no es RSS devuelve un arreglo vacío", () => {
  assert.deepEqual(candidatosComercio(""), []);
  assert.deepEqual(candidatosAndina("<html>no es rss</html>"), []);
});

test("candidatos: el cierre del 12-nov sale de la nota y del en vivo (4 decimales y título con espacio)", () => {
  const comercio = candidatosComercio(COMERCIO_12NOV);
  assert.deepEqual(clave(comercio), ["2026-11-12|envivo|3.404", "2026-11-12|nota|3.404"]);
  assert.ok(comercio.every((c) => c.url.startsWith("https://")));
});

// --- actualizarEstado -------------------------------------------------------

const C = (fecha, tipo, valor) => ({ fecha, tipo, valor, url: "https://ejemplo.pe/" + tipo });
const BASE = [
  C("2026-11-11", "envivo", 3.409),
  C("2026-11-11", "nota", 3.409),
  C("2026-11-11", "andina", 3.409),
  C("2026-11-10", "envivo", 3.413),
  C("2026-11-10", "nota", 3.413),
  C("2026-11-09", "envivo", 3.409),
];
const OFICIALES = { "2026-11-06": 3.425, "2026-11-09": 3.409, "2026-11-10": 3.413 };
const SBS = { "2026-11-09": 3.418, "2026-11-10": 3.421, "2026-11-11": 3.414 };
const A1 = "2026-11-11T22:50:00.000Z";
const A2 = "2026-11-12T08:40:00.000Z";

const corre = (estado, candidatos, extra = {}) =>
  actualizarEstado(estado, {
    candidatos,
    oficiales: OFICIALES,
    sbs: SBS,
    hoyLima: "2026-11-11",
    ahora: A1,
    ...extra,
  });

const fila = (estado, fecha) => (estado.bitacora || []).find((f) => f.fecha === fecha);

test("actualizarEstado: caso base, hay provisional con las tres fuentes", () => {
  const e = corre(null, BASE);
  assert.deepEqual(e.provisional, {
    fecha: "2026-11-11",
    valor: 3.409,
    fuentes: ["envivo", "nota", "andina"],
    capturado: A1,
  });
  assert.deepEqual(Object.keys(e), ["provisional", "bitacora"]);
  assert.deepEqual(e.bitacora, [
    { fecha: "2026-11-09", envivo: 3.409, nota: null, andina: null, usado: null, oficial: 3.409 },
    { fecha: "2026-11-10", envivo: 3.413, nota: 3.413, andina: null, usado: null, oficial: 3.413 },
    { fecha: "2026-11-11", envivo: 3.409, nota: 3.409, andina: 3.409, usado: 3.409, oficial: null },
  ]);
});

test("actualizarEstado: solo «envivo» no hay provisional", () => {
  const e = corre(null, BASE.filter((c) => !(c.fecha === "2026-11-11" && c.tipo !== "envivo")));
  assert.equal(e.provisional, null);
  assert.deepEqual(fila(e, "2026-11-11"), {
    fecha: "2026-11-11",
    envivo: 3.409,
    nota: null,
    andina: null,
    usado: null,
    oficial: null,
  });
});

test("actualizarEstado: nota que discrepa y no hay andina, no hay provisional", () => {
  const candidatos = BASE.filter((c) => c.tipo !== "andina").map((c) =>
    c.fecha === "2026-11-11" && c.tipo === "nota" ? { ...c, valor: 3.411 } : c
  );
  const e = corre(null, candidatos);
  assert.equal(e.provisional, null);
  assert.equal(fila(e, "2026-11-11").nota, 3.411);
  assert.equal(fila(e, "2026-11-11").envivo, 3.409);
});

test("actualizarEstado: valor fuera del control de cordura, no hay provisional", () => {
  const e = corre(null, BASE.map((c) => (c.fecha === "2026-11-11" ? { ...c, valor: 3.609 } : c)));
  assert.equal(e.provisional, null);
});

test("actualizarEstado: llega el oficial, provisional null y la fila conserva «usado»", () => {
  const previo = corre(null, BASE);
  const e = corre(previo, BASE, {
    oficiales: { ...OFICIALES, "2026-11-11": 3.409 },
    hoyLima: "2026-11-12",
    ahora: A2,
  });
  assert.equal(e.provisional, null);
  assert.deepEqual(fila(e, "2026-11-11"), {
    fecha: "2026-11-11",
    envivo: 3.409,
    nota: 3.409,
    andina: 3.409,
    usado: 3.409,
    oficial: 3.409,
  });
});

test("actualizarEstado: corrida sin candidatos conserva todo", () => {
  const previo = corre(null, BASE);
  const e = corre(previo, [], { hoyLima: "2026-11-12", ahora: A2 });
  assert.deepEqual(e, previo);
});

test("actualizarEstado: es pura y determinista (no muta sus argumentos)", () => {
  const antes = JSON.stringify(BASE);
  const e1 = corre(null, BASE);
  const e2 = corre(null, BASE);
  assert.deepEqual(e1, e2);
  assert.equal(JSON.stringify(BASE), antes);
});



