import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// The generated pages break some sentences in several lines: compare without line breaks
const plano = (html) => html.replace(/\s+/g, " ");

const INVITE = "Recibe gratis cada mañana el boletín completo: mercados, la proyección del dólar, los hechos de la SMV y los titulares. El plan Boletín añade tus empresas.";

test("/boletin explica que el correo general es gratis y que el plan añade tus empresas", () => {
  const html = read("boletin.html");
  // El correo general se ofrece gratis, sin plan de pago por medio
  assert.match(html, /El correo general, cada mañana\./);
  assert.match(html, /Es gratis\./);
  // El plan de pago es el correo general mas tus empresas
  assert.match(html, /Boletín \+ tus empresas/);
  assert.match(html, /Hasta 15 empresas de la BVL, con precio, proyección y noticias/);
  // Comparacion de los dos caminos, en dos columnas
  assert.match(html, /pd-plans--2/);
  assert.match(html, /<h3 class="pd-plan-name">Gratis<\/h3>/);
  // Ya no se presenta el correo general como si fuera de pago
  assert.doesNotMatch(html, /Gratis: el cierre y el rango del dólar para mañana/);
  assert.doesNotMatch(html, /Boletín diario general/);
});

test("/precios separa el correo gratuito del plan con empresas", () => {
  const html = read("precios.html");
  assert.match(html, /boletín general es gratis/);
  assert.match(html, /Boletín \+ tus empresas/);
  assert.match(html, /Recibir el boletín gratis/);
  // La descripcion vieja (correo gratis solo del dolar) ya no esta
  assert.doesNotMatch(html, /Boletín diario: el dólar y su rango para mañana/);
});

test("the newsletter invite offers the dollar for free", () => {
  assert.ok(plano(read("index.html")).includes(INVITE), "index.html miss the invite");
  assert.ok(plano(read("dolar.html")).includes(INVITE), "dolar.html miss the invite");
  assert.match(read("dolar.html"), /<p class="micro-label text-ink-soft">Boletín diario<\/p>/);
  assert.doesNotMatch(read("dolar.html"), /Boletín diario · gratis/);
});
