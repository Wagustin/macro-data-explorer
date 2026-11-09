import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

const crons = () =>
  read(".github/workflows/boletin.yml")
    .split("\n")
    .filter((l) => /cron:/.test(l))
    .map((l) => l.match(/cron:\s*"([^"]+)"/)[1]);

test("boletin.yml programa lunes a sábado", () => {
  const list = crons();
  assert.equal(list.length, 3, "boletin.yml debe tener 3 crons");
  for (const c of list) {
    // El último campo es el día de la semana: lunes a sábado
    const fields = c.trim().split(/\s+/);
    assert.equal(fields.length, 5, `cron inválido: ${c}`);
    assert.equal(fields[4], "1-6", `el cron ${c} no cubre lunes a sábado`);
    // Domingo (0) y viernes solo (5) no valen: el día no puede contener 0 ni 7
    assert.ok(!fields[4].includes("0") && !fields[4].includes("7"), `el cron ${c} incluye domingo`);
  }
});

test("worker.js dispara el boletín también el sábado", () => {
  const worker = read("worker.js");
  assert.match(worker, /boletin\.yml[\s\S]*?lima\.getUTCDay\(\) >= 1 && lima\.getUTCDay\(\) <= 6/);
});

test("los textos del boletín dicen lunes a sábado", () => {
  for (const rel of ["boletin.html", "index.html", "precios.html", "api/boletin.js"]) {
    assert.doesNotMatch(read(rel), /lunes a viernes/i, `${rel} aún dice lunes a viernes`);
  }
  assert.match(read("boletin.html"), /lunes a sábado/);
});

test("la nota de transparencia aparece junto a las lecturas", () => {
  const nota = "Las lecturas las redacta un modelo de lenguaje a partir de datos oficiales y noticias, y las revisa un segundo modelo. El rango es estadístico: las noticias no entran en su cálculo. No es una recomendación de inversión.";
  assert.match(read("boletin.html"), /Cómo se lee/);
  assert.ok(read("boletin.html").includes(nota), "boletin.html debe traer la nota de transparencia");
  assert.ok(read("precios.html").includes("El rango es estadístico: las noticias no entran en su cálculo. No es una recomendación de inversión."), "precios.html debe traer la nota de transparencia");
});
