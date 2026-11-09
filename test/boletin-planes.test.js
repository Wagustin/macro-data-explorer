import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// The generated pages break some sentences in several lines: compare without line breaks
const plano = (html) => html.replace(/\s+/g, " ");

const INVITE = "Recibe gratis cada mañana el correo del dólar para el próximo día hábil: su rango probable, tres noticias y una lectura de qué podría moverlo. El plan Boletín (US$ 1.99 al mes o 15 al año) trae el resto del día y tus empresas.";

test("/boletin explica que el correo gratis es el dólar del próximo día hábil y que el plan añade tus empresas", () => {
  const html = read("boletin.html");
  // El correo gratis se ofrece gratis, sin plan de pago por medio
  assert.match(html, /El correo de cada mañana, de lunes a sábado\./);
  assert.match(html, /El correo de cada mañana/);
  // El plan de pago es el correo completo mas tus empresas
  assert.match(html, /Boletín \+ tus empresas/);
  assert.match(html, /Tus empresas \(hasta 15\)/);
  // Comparacion de los dos caminos, en dos columnas
  assert.match(html, /pd-plans--2/);
  assert.match(html, /<h3 class="pd-plan-name">Gratis<\/h3>/);
  // Ya no se presenta el correo general como si fuera de pago
  assert.doesNotMatch(html, /Gratis: el cierre y el rango del dólar para mañana/);
  assert.doesNotMatch(html, /Boletín diario general/);
  assert.doesNotMatch(html, /correo general/i);
  assert.doesNotMatch(html, /solo el dólar/i);
});

test("/precios separa el correo gratuito del plan con empresas", () => {
  const html = read("precios.html");
  assert.match(html, /El correo gratis llega cada mañana/);
  assert.match(html, /Boletín \+ tus empresas/);
  assert.match(html, /Recibir el boletín gratis/);
  // La descripcion vieja (correo gratis solo del dolar) ya no esta
  assert.doesNotMatch(html, /Boletín diario: el dólar y su rango para mañana/);
  assert.doesNotMatch(html, /correo general/i);
});

test("the newsletter invite offers the dollar for free", () => {
  const text = plano(read("index.html"));
  assert.ok(text.includes("Recibe gratis cada mañana el correo del dólar"), "index.html must offer the free dollar email");
  assert.ok(text.includes("El plan Boletín"), "index.html must mention the plan");
  assert.ok(plano(read("dolar.html")).includes("Recibe gratis cada mañana el correo del dólar"), "dolar.html miss the invite");
  assert.match(read("dolar.html"), /<p class="micro-label text-ink-soft">Boletín diario<\/p>/);
  assert.doesNotMatch(read("dolar.html"), /Boletín diario · gratis/);
});
