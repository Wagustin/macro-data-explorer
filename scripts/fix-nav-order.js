#!/usr/bin/env node
/**
 * Un solo orden de navegación en todo el sitio.
 *
 * Reordena los enlaces de la barra principal (escritorio) y del menú móvil según el orden canónico,
 * dejando el marcado de página activa sólo en el enlace que corresponde al archivo.
 * No toca la barra inferior de móvil (`nav.mobile-nav`, con iconos) ni la navegación del pie.
 *
 * Uso: node scripts/fix-nav-order.js [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

const ORDEN = [
  ["/dolar", "Dólar"],
  ["/explorer", "Terminal"],
  ["/empresas", "Empresas"],
  ["/mercado", "Mercado"],
  ["/noticias", "Noticias"],
  ["/metodologia", "Metodología"],
  ["/guia", "Guía"],
  ["/boletin", "Boletín"],
  ["/precios", "Precios"],
];

// Ruta activa según el archivo
const ACTIVA = {
  "index.html": "/",
  "dolar.html": "/dolar",
  "explorer.html": "/explorer",
  "empresas.html": "/empresas",
  "mercado.html": "/mercado",
  "news.html": "/noticias",
  "metodologia.html": "/metodologia",
  "guia.html": "/guia",
  "boletin.html": "/boletin",
  "precios.html": "/precios",
  "aprende.html": "/aprende",
};

const CLASE_NORMAL = {
  escritorio: "hover:text-ink transition no-underline",
  movil: "hover:text-ink py-1 no-underline",
};
const CLASE_ACTIVA = {
  escritorio: "text-ink font-semibold border-b border-ink pb-0.5 no-underline",
  movil: "text-ink font-semibold py-1 no-underline",
};

const NAV = /(<nav\b[^>]*>)([\s\S]*?)(<\/nav>)/g;
const ENLACE = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g;

function tipoDeNav(apertura) {
  const label = (apertura.match(/aria-label="([^"]*)"/) || [])[1] || "";
  if (/mobile-nav/.test(apertura)) return null; // barra inferior con iconos: no se toca
  if (/secundaria/i.test(label)) return null; // pie: no se toca
  if (/principal/i.test(label)) return "escritorio";
  if (/m[oó]vil/i.test(label)) return "movil";
  return null;
}

function procesaNav(apertura, interior, cierre, tipo, activa) {
  const enlaces = [...interior.matchAll(ENLACE)];
  if (!enlaces.length) return null;

  const porHref = new Map();
  for (const m of enlaces) porHref.set(m[1], m[0]);

  // Sangría del primer enlace
  const primera = interior.indexOf(enlaces[0][0]);
  const linea = interior.lastIndexOf("\n", primera) + 1;
  const sangria = linea <= primera ? interior.slice(linea, primera) : "  ";

  const nuevos = ORDEN.map(([href, texto]) => {
    const esActiva = activa === href;
    const clase = esActiva ? CLASE_ACTIVA[tipo] : CLASE_NORMAL[tipo];
    const aria = esActiva ? ' aria-current="page"' : "";
    return `<a href="${href}" class="${clase}"${aria}>${texto}</a>`;
  });

  const cuerpo = nuevos.map((l) => "\n" + sangria + l).join("");
  const nuevo = apertura + cuerpo + "\n" + cierre;
  return nuevo === apertura + interior + cierre ? null : nuevo;
}

let leidos = 0;
let tocados = 0;
let bloques = 0;

const archivos = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && !f.includes("preview")),
  ...fs
    .readdirSync(path.join(ROOT, "empresa"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join("empresa", f)),
];

for (const rel of archivos) {
  const abs = path.join(ROOT, rel);
  const original = fs.readFileSync(abs, "utf8");
  leidos++;

  const activa = ACTIVA[path.basename(rel)] || null;
  let cambios = 0;

  const nuevo = original.replace(NAV, (todo, apertura, interior, cierre) => {
    const tipo = tipoDeNav(apertura);
    if (!tipo) return todo;
    const hecho = procesaNav(apertura, interior, cierre, tipo, activa);
    if (hecho === null) return todo;
    cambios++;
    return hecho;
  });

  if (nuevo !== original) {
    tocados++;
    bloques += cambios;
    if (!DRY) fs.writeFileSync(abs, nuevo, "utf8");
  }
}

console.log(
  `${DRY ? "[simulación] " : ""}leídos ${leidos} archivos · ${tocados} modificados · ${bloques} bloques de navegación reordenados`,
);
