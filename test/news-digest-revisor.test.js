import test from "node:test";
import assert from "node:assert/strict";
import { construirHistoria } from "../scripts/news-digest.js";

const RECENTES = [
  { id: "n1", titulo: "El BCRP vendió 120 millones de dólares en la mesa cambiaria", fuente: "Reuters", categoria: "Dólar y BCRP", url: "https://example.com/n1", fecha_iso: "2026-11-06T14:00:00Z" },
  { id: "n2", titulo: "El tipo de cambio cerró en S/ 3,42 en la jornada de hoy", fuente: "Gestión", categoria: "Dólar y BCRP", url: "https://example.com/n2", fecha_iso: "2026-11-06T15:00:00Z" },
];
const TITULO = "El BCRP vendió dólares y el dólar cerró en S/ 3,42";
const NOTA_FIEL = "El Banco Central de Reserva vendió 120 millones de dólares en la mesa cambiaria y el tipo de cambio cerró en S/ 3,42.";

test("un bloque fiel pasa el revisor y se publica sin reescribir", async () => {
  let intentos = 0;
  let visto = null;
  const story = await construirHistoria(
    { titulo: TITULO, nota: NOTA_FIEL, indices: [0, 1], tema: "Dólar y BCRP" },
    RECENTES,
    {},
    async () => { intentos++; return null; },
    async (titulo, nota, used) => { visto = { titulo, nota, used }; return { modelo: "revisor-test", ok: true, motivo: "" }; },
  );
  assert.equal(intentos, 0);
  assert.equal(story.titulo, TITULO);
  assert.equal(story.nota, NOTA_FIEL);
  assert.deepEqual(story.revision, { modelo: "revisor-test", ok: true, motivo: "" });
  assert.equal(story.fuentes.length, 2);
  // El revisor recibe el título y la nota redactados y los índices de sus fuentes
  assert.equal(visto.titulo, TITULO);
  assert.equal(visto.nota, NOTA_FIEL);
  assert.deepEqual(visto.used, [0, 1]);
});

test("un bloque con una cifra inventada se reescribe una vez con el motivo del revisor y se publica si pasa", async () => {
  const motivos = [];
  let revisiones = 0;
  const story = await construirHistoria(
    { titulo: TITULO, nota: "El BCRP vendió 120 millones de dólares el 6 de noviembre y el dólar cerró en S/ 3,42, según las fuentes.", indices: [0, 1], tema: "Dólar y BCRP" },
    RECENTES,
    {},
    async (h, used, recent, motivo) => { motivos.push(motivo); return { titulo: TITULO, nota: NOTA_FIEL }; },
    async (titulo, nota) => { revisiones++; return { modelo: "revisor-test", ok: nota === NOTA_FIEL, motivo: nota === NOTA_FIEL ? "" : "la nota añade una fecha que no está en las fuentes" }; },
  );
  assert.equal(motivos.length, 1);
  assert.match(motivos[0], /fecha/);
  assert.equal(revisiones, 2);
  assert.equal(story.nota, NOTA_FIEL);
  assert.deepEqual(story.revision, { modelo: "revisor-test", ok: true, motivo: "" });
});

test("si tras la reescritura el revisor sigue rechazando, se publica el titular de la primera fuente sin nota", async () => {
  let intentos = 0;
  const story = await construirHistoria(
    { titulo: TITULO, nota: NOTA_FIEL, indices: [0, 1], tema: "Dólar y BCRP" },
    RECENTES,
    {},
    async () => { intentos++; return { titulo: TITULO, nota: "La nota sigue atribuyendo la venta de dólares a una causa que no está en las fuentes." }; },
    async () => ({ modelo: "revisor-test", ok: false, motivo: "añade una causa que no está en las fuentes" }),
  );
  assert.equal(intentos, 1);
  assert.equal(story.titulo, RECENTES[0].titulo);
  assert.equal(story.nota, undefined);
  assert.equal(story.fuentes.length, 2);
  assert.equal(story.revision.modelo, "revisor-test");
  assert.equal(story.revision.ok, false);
  assert.match(story.revision.motivo, /causa/);
});

test("con el revisor caído, un bloque que pasa textoValido se publica igual", async () => {
  let intentos = 0;
  const story = await construirHistoria(
    { titulo: TITULO, nota: NOTA_FIEL, indices: [0], tema: "Dólar y BCRP" },
    RECENTES,
    {},
    async () => { intentos++; return null; },
    async () => null,
  );
  assert.equal(intentos, 0);
  assert.equal(story.titulo, TITULO);
  assert.equal(story.nota, NOTA_FIEL);
  assert.deepEqual(story.revision, { modelo: null, ok: null, motivo: "revisor no disponible" });
});

test("con el revisor caído, un bloque que falla textoValido solo llega al titular de la fuente", async () => {
  let intentos = 0;
  const story = await construirHistoria(
    { titulo: "El BCRP vendió dólares threaten la liquidez del mercado", nota: "El dólar cerró por|ja.", indices: [0], tema: "Dólar y BCRP" },
    RECENTES,
    {},
    async () => { intentos++; return null; },
    async () => null,
  );
  assert.equal(intentos, 1);
  assert.equal(story.titulo, RECENTES[0].titulo);
  assert.equal(story.nota, undefined);
  assert.equal(story.revision.ok, null);
  assert.equal(story.revision.motivo, "revisor no disponible");
});
