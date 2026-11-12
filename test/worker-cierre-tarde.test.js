import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sunatNuevo } from "../worker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");

// JOBS no está exportada: se evalúa la tabla tal cual está en worker.js para probar su lógica.
const jobs = (() => {
  const start = source.indexOf("const JOBS = [");
  assert.notEqual(start, -1, "worker.js debe tener la tabla JOBS");
  const end = source.indexOf("\n];", start);
  assert.notEqual(end, -1, "no se encontró el final de la tabla JOBS");
  const repo = /const REPO = "([^"]+)"/.exec(source);
  assert.ok(repo, "worker.js debe declarar REPO");
  const tabla = source.slice(start + "const JOBS = ".length, end + 2);
  return new Function("REPO", "sunatNuevo", `return ${tabla}`)(repo[1], sunatNuevo);
})();

const job = jobs.find((j) => j.file === "cierre-tarde.yml");
assert.ok(job, "worker.js debe incluir el job de cierre-tarde.yml");

// Lima es UTC-5: una hora de Lima son UTC + 5.
const lima = (y, m, d, hh, mm) => new Date(Date.UTC(y, m - 1, d, hh + 5, mm));

test("cierre-tarde: los días hábiles a media tarde el job está debido", () => {
  // martes 10 de noviembre de 2026, 14:20 Lima
  assert.equal(job.due(lima(2026, 11, 10, 14, 20)), true);
});

test("cierre-tarde: antes de las 14:15 Lima el job aún no está debido", () => {
  // martes 10 de noviembre de 2026, 13:00 Lima
  assert.equal(job.due(lima(2026, 11, 10, 13, 0)), false);
});

test("cierre-tarde: el sábado no hay cierre y el job no está debido", () => {
  // sábado 14 de noviembre de 2026, 14:20 Lima
  assert.equal(job.due(lima(2026, 11, 14, 14, 20)), false);
});

test("cierre-tarde: solo se lanza mientras falte el provisional de hoy", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ provisional: { fecha: "2026-11-10" } }) });
    assert.equal(await job.check(lima(2026, 11, 10, 14, 20)), false, "con el provisional de hoy no debe lanzarse");

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ provisional: { fecha: "2026-11-09" } }) });
    assert.equal(await job.check(lima(2026, 11, 10, 14, 20)), true, "sin el provisional de hoy debe lanzarse");

    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    assert.equal(await job.check(lima(2026, 11, 10, 14, 20)), true, "si no se puede leer el archivo, debe lanzarse");
  } finally {
    globalThis.fetch = original;
  }
});
