import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// The generated pages break some sentences in several lines: compare without line breaks
const plano = (html) => html.replace(/\s+/g, " ");

const INVITE = "Recibe gratis cada mañana el dólar y su rango para el próximo día hábil. Con el plan Boletín, todo el mercado y tus empresas.";

test("/boletin says what is free and what is in the Boletín plan", () => {
  const html = read("boletin.html");
  assert.match(html, /Gratis: el cierre y el rango del dólar para mañana/);
  assert.match(html, /Plan Boletín \(US\$ 1\.99\/mes\)/);
  // Comparison of the two plans, in two columns
  assert.match(html, /pd-plans--2/);
  assert.match(html, /<h3 class="pd-plan-name">Gratis<\/h3>/);
  assert.match(html, /<h3 class="pd-plan-name">Boletín<\/h3>/);
  // The complete newsletter is not sold as free
  assert.doesNotMatch(html, /Boletín diario general/);
  assert.doesNotMatch(html, /boletín general/);
});

test("/precios separates the free newsletter from the complete one", () => {
  const html = read("precios.html");
  assert.match(html, /Boletín diario: el dólar y su rango para mañana/);
  assert.match(html, /Boletín completo: dólar a un día, una semana y un mes; cobre, oro y petróleo; hechos de la SMV; lo importante del día/);
  assert.doesNotMatch(html, /Boletín diario general/);
});

test("the newsletter invite offers the dollar for free", () => {
  assert.ok(plano(read("index.html")).includes(INVITE), "index.html miss the invite");
  assert.ok(plano(read("dolar.html")).includes(INVITE), "dolar.html miss the invite");
  assert.match(read("dolar.html"), /<p class="micro-label text-ink-soft">Boletín diario<\/p>/);
  assert.doesNotMatch(read("dolar.html"), /Boletín diario · gratis/);
});
