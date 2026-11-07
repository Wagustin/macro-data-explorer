import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDEN = [
  "Dólar",
  "Terminal",
  "Empresas",
  "Mercado",
  "Noticias",
  "Metodología",
  "Guía",
  "Boletín",
  "Precios",
];

const paginas = [
  ...fs.readdirSync(rootDir).filter((f) => f.endsWith(".html") && !f.includes("preview")),
  ...fs
    .readdirSync(path.join(rootDir, "empresa"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join("empresa", f)),
];

// Barras que comparten orden: la principal de escritorio y el menú móvil desplegable.
// La barra inferior de móvil (nav.mobile-nav, con iconos) es otro componente y va aparte.
function barras(html) {
  return [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)]
    .filter(([, attrs]) => /rincipal|m[oó]vil/i.test(attrs) && !/mobile-nav/.test(attrs))
    .map(([, , interior]) => [...interior.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map((x) => x[1].trim()));
}

test("todas las páginas comparten el mismo orden de navegación", () => {
  const raros = [];
  for (const rel of paginas) {
    const html = fs.readFileSync(path.join(rootDir, rel), "utf8");
    for (const enlaces of barras(html)) {
      if (enlaces.length !== ORDEN.length || enlaces.some((e, i) => e !== ORDEN[i])) {
        raros.push(`${rel}: ${enlaces.join(" | ")}`);
      }
    }
  }
  assert.deepEqual(raros.slice(0, 8), [], `órdenes distintos:\n${raros.slice(0, 8).join("\n")}`);
});

test("sólo hay un enlace activo por barra y corresponde a la página", () => {
  const mapa = { "dolar.html": "Dólar", "mercado.html": "Mercado", "precios.html": "Precios", "guia.html": "Guía" };
  for (const [archivo, esperado] of Object.entries(mapa)) {
    const html = fs.readFileSync(path.join(rootDir, archivo), "utf8");
    const principal = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].filter(([, a]) => /rincipal/i.test(a));
    assert.equal(principal.length, 1, `${archivo}: se esperaba una barra principal`);
    const activos = [...principal[0][2].matchAll(/<a\b[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((x) => x[1].trim());
    assert.deepEqual(activos, [esperado], `${archivo}: activos ${activos.join(", ")}`);
  }
});
