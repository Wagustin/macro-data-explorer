import test from "node:test";
import assert from "node:assert/strict";
import { textoValido, construirHistoria } from "../scripts/news-digest.js";

test("un título con una palabra en inglés no pasa el control", () => {
  assert.equal(textoValido("El Niño threaten empleo en agricultura, pesca y minería", { minPalabras: 4 }), false);
});

test("una nota rota o truncada no pasa el control", () => {
  assert.equal(textoValido("El cobre perdió terreno por|ja.", { minPalabras: 12 }), false);
  assert.equal(textoValido("El cobre perdió terreno por ja.", { minPalabras: 12 }), false);
});

test("un titular propio en español pasa el control", () => {
  assert.equal(textoValido("Holcim lanza OPA por el 49,99% de Cementos Pacasmayo", { minPalabras: 4 }), true);
});

test("una nota en español de más de veinte palabras pasa el control", () => {
  const nota = "El Banco Central de Reserva del Perú intervino el mercado cambiario con una venta de dólares, según el reporte diario de operaciones.";
  assert.equal(textoValido(nota, { minPalabras: 12 }), true);
});

test("la nota necesita un mínimo de palabras y terminar en punto", () => {
  const corta = "El Banco Central intervino el mercado con una venta de dólares.";
  assert.equal(textoValido(corta, { minPalabras: 12 }), false);
  const sinPunto = "El Banco Central de Reserva del Perú intervino el mercado cambiario con una venta de dólares";
  assert.equal(textoValido(sinPunto, { minPalabras: 12 }), false);
});

test("las siglas y los nombres propios no cuentan como palabras inglesas", () => {
  assert.equal(textoValido("El BCRP publica el tipo de cambio referencial del USD", { minPalabras: 4 }), true);
});

test("los caracteres rotos invalidan cualquier texto", () => {
  assert.equal(textoValido("El cobre perdió terreno por|ja.", { minPalabras: 1 }), false);
  assert.equal(textoValido("El cobre perdió terreno por ja�.", { minPalabras: 1 }), false);
  assert.equal(textoValido("El cobre <retrocede> por las dudas", { minPalabras: 1 }), false);
});

const TITULARES = [
  { id: "n1", titulo: "El Niño presiona el empleo en agricultura, pesca y minería", fuente: "Prensa", categoria: "Economía", url: "https://example.com/n1", fecha_iso: "2026-11-06T10:00:00Z" },
  { id: "n2", titulo: "Pescadores y acuicultores accederán a créditos por El Niño", fuente: "Prensa", categoria: "Economía", url: "https://example.com/n2", fecha_iso: "2026-11-06T09:00:00Z" },
];
const NOTA_BUENA = "El fenómeno El Niño pondría en riesgo puestos de trabajo en agricultura, pesca y minería, con mayor afectación para los trabajadores independientes.";

test("un bloque que pasa el control se publica sin volver a preguntar al modelo", async () => {
  let intentos = 0;
  const story = await construirHistoria(
    { titulo: "El Niño presiona el empleo en tres sectores", nota: NOTA_BUENA, indices: [0], tema: "Economía y fiscal" },
    TITULARES,
    {},
    async () => { intentos++; return null; },
  );
  assert.equal(intentos, 0);
  assert.equal(story.titulo, "El Niño presiona el empleo en tres sectores");
  assert.equal(story.nota, NOTA_BUENA);
  assert.equal(story.fuentes.length, 1);
});

test("un bloque que falla se reescribe una sola vez", async () => {
  let intentos = 0;
  const story = await construirHistoria(
    { titulo: "El Niño threaten empleo en agricultura, pesca y minería", nota: "El cobre perdió terreno por|ja.", indices: [0], tema: "Economía y fiscal" },
    TITULARES,
    {},
    async () => { intentos++; return { titulo: "El Niño presiona el empleo en tres sectores", nota: NOTA_BUENA }; },
  );
  assert.equal(intentos, 1);
  assert.equal(story.titulo, "El Niño presiona el empleo en tres sectores");
  assert.equal(story.nota, NOTA_BUENA);
});

test("un bloque que vuelve a fallar conserva el titular de la fuente y se queda sin nota", async () => {
  let intentos = 0;
  const story = await construirHistoria(
    { titulo: "El Niño threaten empleo en agricultura, pesca y minería", nota: "El cobre perdió terreno por|ja.", indices: [0, 1], tema: "Economía y fiscal" },
    TITULARES,
    {},
    async () => { intentos++; return { titulo: "El Niño threaten empleo en agricultura, pesca y minería", nota: "El cobre perdió terreno por|ja." }; },
  );
  assert.equal(intentos, 1);
  assert.equal(story.titulo, TITULARES[0].titulo);
  assert.equal(story.nota, undefined);
  assert.equal(story.fuentes.length, 2);
});
