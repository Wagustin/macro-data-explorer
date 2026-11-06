import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compararConRango, paginaIndice, paginaNota } from "../scripts/build-semana-dolar.js";
import worker from "../worker.js";

// Mock HTMLRewriter si no existe en Node
if (typeof globalThis.HTMLRewriter === "undefined") {
  globalThis.HTMLRewriter = class {
    on() { return this; }
    transform(response) { return response; }
  };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTAS_DIR = path.join(ROOT, "data", "semana-dolar");
const PAGINAS_DIR = path.join(ROOT, "semana");

const notas = fs.readdirSync(NOTAS_DIR)
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
  .sort()
  .map((file) => JSON.parse(fs.readFileSync(path.join(NOTAS_DIR, file), "utf8")));

const bcrpDaily = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "official", "bcrp-daily.json"), "utf8"));
const seriePen = bcrpDaily.series.PEN.serie;

const textoVisible = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const palabras = (html) => textoVisible(html).split(" ").filter((palabra) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(palabra)).length;

test("el archivo semanal tiene una nota y una página por semana", () => {
  assert.ok(notas.length > 0, "hay al menos una nota semanal");
  for (const nota of notas) {
    assert.match(nota.semana, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(fs.existsSync(path.join(PAGINAS_DIR, nota.semana, "index.html")), `${nota.semana} tiene pagina`);
    assert.equal(fs.existsSync(path.join(NOTAS_DIR, `${nota.semana}.json`)), true);
  }
  assert.ok(fs.existsSync(path.join(PAGINAS_DIR, "index.html")), "el indice semanal existe");
});

test("las cifras de la nota salen de la serie del BCRP", () => {
  for (const nota of notas) {
    const cierres = seriePen.filter(([fecha]) => fecha >= nota.mercado.inicio.fecha && fecha <= nota.mercado.fin.fecha);
    assert.equal(cierres.length, nota.mercado.cierres.length, `${nota.semana} tiene los cierres de la semana`);
    assert.equal(nota.mercado.inicio.cierre, cierres[0][1]);
    assert.equal(nota.mercado.fin.cierre, cierres[cierres.length - 1][1]);
    const maximo = Math.max(...cierres.map(([, valor]) => valor));
    const minimo = Math.min(...cierres.map(([, valor]) => valor));
    assert.equal(nota.mercado.maximo.cierre, maximo);
    assert.equal(nota.mercado.minimo.cierre, minimo);
    const variacion = cierres[cierres.length - 1][1] - cierres[0][1];
    assert.ok(Math.abs(nota.mercado.variacion_sol - variacion) < 1e-9);
    // La semana va de lunes a viernes y el cierre del viernes es el de la serie
    const dia = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
    assert.equal(dia(nota.mercado.inicio.fecha), 1, "la semana empieza en lunes");
    assert.equal(dia(nota.mercado.fin.fecha), 5, "la semana cierra el viernes");
  }
});

test("cada pagina nueva se lee sin JavaScript y tiene al menos 400 palabras", () => {
  for (const nota of notas) {
    const html = fs.readFileSync(path.join(PAGINAS_DIR, nota.semana, "index.html"), "utf8");
    assert.ok(palabras(html) >= 400, `${nota.semana} tiene 400 palabras visibles`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://perdata\\.site/semana/${nota.semana}">`));
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.equal(/[\u{1F000}-\u{1FAFF}]/u.test(html), false, "sin emojis");
  }
  const indice = fs.readFileSync(path.join(PAGINAS_DIR, "index.html"), "utf8");
  assert.ok(palabras(indice) >= 400, "el indice tiene 400 palabras visibles");
  for (const nota of notas) {
    assert.ok(indice.includes(`/semana/${nota.semana}`), `el indice enlaza ${nota.semana}`);
  }
});

test("las cifras visibles de la pagina salen de la nota, no estan escritas a mano", () => {
  for (const nota of notas) {
    const html = fs.readFileSync(path.join(PAGINAS_DIR, nota.semana, "index.html"), "utf8");
    const valores = new Set([
      ...nota.mercado.cierres.map(([, valor]) => valor),
      nota.mercado.maximo.cierre,
      nota.mercado.minimo.cierre,
      nota.mercado.inicio.cierre,
      nota.mercado.fin.cierre,
      nota.bcrp.intervencion.total,
      nota.bcrp.swaps_netos.total,
      ...(nota.rango_publicado ? [nota.rango_publicado.p10, nota.rango_publicado.p50, nota.rango_publicado.p90] : []),
    ]);
    const permitidos = new Set([...valores].map((valor) => valor.toFixed(4)));
    for (const coincide of textoVisible(html).matchAll(/S\/ (\d+\.\d{4})/g)) {
      assert.ok(permitidos.has(coincide[1]), `S/ ${coincide[1]} viene de los datos`);
    }
  }
});

test("el rango anterior solo se compara cuando su ventana cubre el cierre", () => {
  const rango = { p10: 3.4, p90: 3.5, referencia_cierre: "2026-11-04", fecha_objetivo: "2026-11-12" };
  const dentro = compararConRango(rango, 3.42, "2026-11-06");
  assert.equal(dentro.cubre, true);
  assert.equal(dentro.dentro, true);
  assert.equal(dentro.borde, "inferior");

  const fuera = compararConRango(rango, 3.6, "2026-11-06");
  assert.equal(fuera.cubre, true);
  assert.equal(fuera.dentro, false);
  assert.equal(fuera.borde, "superior");

  const otroDia = compararConRango(rango, 3.45, "2026-10-30");
  assert.equal(otroDia.cubre, false);
  assert.equal(otroDia.dentro, null);
  assert.equal(otroDia.distancia, null);
});

test("la pagina y el indice se vuelven a pintar desde la nota, sin cambiar el contenido", () => {
  for (const nota of notas) {
    const html = fs.readFileSync(path.join(PAGINAS_DIR, nota.semana, "index.html"), "utf8");
    assert.equal(html, paginaNota(nota), `${nota.semana} coincide con su JSON`);
  }
  const indice = fs.readFileSync(path.join(PAGINAS_DIR, "index.html"), "utf8");
  assert.equal(indice, paginaIndice(notas));
});

test("el Worker y el servidor local sirven las rutas de las notas semanales", () => {
  const worker = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");
  assert.ok(worker.includes('pathname === "/semana"'), "el Worker sirve /semana");
  assert.ok(worker.includes("semanaMatch"), "el Worker sirve /semana/AAAA-MM-DD");
  assert.ok(worker.includes('"/semana/index.html"'), "el indice semanal se pide desde el Worker");
  assert.ok(worker.includes("/semana/${semanaMatch[1]}/index.html"), "la nota semanal se pide desde el Worker");

  const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.ok(server.includes('"/semana": "semana/index.html"'), "el servidor local sirve /semana");
  assert.ok(server.includes("semanaPage"), "el servidor local sirve /semana/AAAA-MM-DD");
});

test("el Worker responde las notas semanales con su pagina y sin marcarla como noindex", async () => {
  const htmlNota = fs.readFileSync(path.join(PAGINAS_DIR, notas[0].semana, "index.html"), "utf8");
  const htmlIndice = fs.readFileSync(path.join(PAGINAS_DIR, "index.html"), "utf8");
  const env = {
    ASSETS: {
      async fetch(req) {
        const ruta = new URL(req.url).pathname;
        if (ruta === "/404.html") {
          return new Response("<html><body>404</body></html>", { status: 200, headers: { "Content-Type": "text/html" } });
        }
        if (ruta === "/semana/index.html") {
          return new Response(htmlIndice, { status: 200, headers: { "Content-Type": "text/html" } });
        }
        if (ruta === `/semana/${notas[0].semana}/index.html`) {
          return new Response(htmlNota, { status: 200, headers: { "Content-Type": "text/html" } });
        }
        return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
      }
    }
  };
  const ctx = { waitUntil() {} };

  const indice = await worker.fetch(new Request("https://perdata.site/semana"), env, ctx);
  assert.equal(indice.status, 200);
  assert.equal(indice.headers.get("X-Robots-Tag"), null, "el indice semanal es indexable");
  assert.match(await indice.text(), /Notas semanales del dólar/);

  const nota = await worker.fetch(new Request(`https://perdata.site/semana/${notas[0].semana}`), env, ctx);
  assert.equal(nota.status, 200);
  assert.equal(nota.headers.get("X-Robots-Tag"), null, "la nota semanal es indexable");
  assert.match(await nota.text(), /El dólar esta semana/);

  const inexistente = await worker.fetch(new Request("https://perdata.site/semana/2000-01-01"), env, ctx);
  assert.equal(inexistente.status, 404);
  assert.equal(inexistente.headers.get("X-Robots-Tag"), "noindex, follow");
});
