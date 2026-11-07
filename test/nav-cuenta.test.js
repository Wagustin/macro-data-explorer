import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Páginas propias (no las fichas generadas, que son 221 y comparten plantilla)
const paginas = fs
  .readdirSync(rootDir)
  .filter((f) => f.endsWith(".html") && !f.endsWith("-preview.html"));

const navRegex = /<nav\b[^>]*aria-label="[^"]*"[^>]*>([\s\S]*?)<\/nav>/g;

test("ninguna barra de navegación repite un destino", () => {
  const fallos = [];
  for (const pagina of paginas) {
    const html = fs.readFileSync(path.join(rootDir, pagina), "utf8");
    let m;
    navRegex.lastIndex = 0;
    while ((m = navRegex.exec(html))) {
      const hrefs = [...m[1].matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
      const repetidos = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
      if (repetidos.length) fallos.push(`${pagina}: ${[...new Set(repetidos)].join(", ")}`);
    }
  }
  assert.deepEqual(fallos, [], `enlaces repetidos en la nav:\n${fallos.join("\n")}`);
});

test("la nav de escritorio de las páginas de marketing lleva Boletín antes que Precios y una sola vez", () => {
  for (const pagina of ["index.html", "precios.html", "boletin.html", "cuenta.html", "mercado.html"]) {
    const html = fs.readFileSync(path.join(rootDir, pagina), "utf8");
    navRegex.lastIndex = 0;
    const bloque = [...html.matchAll(navRegex)]
      .map((m) => m[1])
      .find((n) => n.includes('href="/explorer"') && n.includes('href="/precios"'));
    assert.ok(bloque, `${pagina}: no encontré la nav principal`);
    const hrefs = [...bloque.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    assert.equal(hrefs.filter((h) => h === "/boletin").length, 1, `${pagina}: Boletín repetido o ausente`);
    assert.ok(hrefs.indexOf("/boletin") < hrefs.indexOf("/precios"), `${pagina}: Boletín debe ir antes de Precios`);
  }
});

test("la cuenta no ofrece comprar un plan que ya está activo", () => {
  const html = fs.readFileSync(path.join(rootDir, "cuenta.html"), "utf8");
  assert.doesNotMatch(html, /if \(u\.hasBillingAccount && \(isPro \|\| u\.subscriptionStatus\)\)/);
  assert.match(html, /if \(isPro && u\.hasBillingAccount\)/);
  assert.match(html, /Tu plan está activo/);
});

test("la cuenta ya no tiene el formulario viejo de alta de empresas", () => {
  const html = fs.readFileSync(path.join(rootDir, "cuenta.html"), "utf8");
  assert.doesNotMatch(html, /id="pdSegForm"/);
  assert.doesNotMatch(html, /id="pdSegBuscar"/);
  assert.match(html, /Buscar empresas y marcarlas con la campana/);
});
