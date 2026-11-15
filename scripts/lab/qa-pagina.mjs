// QA de PerData en la caja InstaBox: sirve public/ en local, recorre las páginas y mide
// desborde horizontal, errores de consola, CLS, imágenes rotas y enlaces internos rotos.
// Uso (lo lanza scripts/lab/qa-completo.sh):
//   node qa-pagina.mjs <public> <salida> <AAAA-MM-DD> [commit]
// Produce <salida>/informe-<fecha>.md y <salida>/resultados-<fecha>.json. Sin datos personales ni titulares.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [, , RAIZ_ARG, SALIDA, FECHA, COMMIT = "desconocido"] = process.argv;
if (!RAIZ_ARG || !SALIDA || !FECHA) {
  console.error("uso: node qa-pagina.mjs <public> <salida> <AAAA-MM-DD> [commit]");
  process.exit(2);
}
const RAIZ = path.resolve(RAIZ_ARG);
const FICHAS_MUESTRA = 8;
const VISTAS = [
  { nombre: "escritorio 1440", ancho: 1440, alto: 900 },
  { nombre: "movil 390", ancho: 390, alto: 844 },
];
// Mismas rutas limpias que worker.js (las que no coinciden con el nombre del archivo)
const ALIAS = {
  "/noticias": "news.html", "/news": "news.html", "/terminos": "terms.html",
  "/cookies": "privacidad.html", "/resumenes": "resumen.html",
};
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
};

function resolverArchivo(rutaPedida) {
  let p;
  try { p = decodeURIComponent(rutaPedida.split("?")[0]); } catch { return null; }
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (ALIAS[p]) return path.join(RAIZ, ALIAS[p]);
  if (/^\/empresa\/[^/]+$/.test(p)) return path.join(RAIZ, "empresa.html"); // ficha: shell del Worker
  const base = path.normalize(path.join(RAIZ, p));
  if (!base.startsWith(RAIZ)) return null;
  for (const c of [base, `${base}.html`, path.join(base, "index.html")]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* sigue */ }
  }
  return null;
}

const servidor = http.createServer((req, res) => {
  const p = req.url.split("?")[0];
  if (p.startsWith("/api/")) { // la API no está en la caja: 404 esperado y se informa aparte
    res.writeHead(404, { "content-type": "application/json" });
    res.end('{"error":"api no servida en la caja"}');
    return;
  }
  const f = resolverArchivo(req.url);
  if (!f) {
    res.writeHead(404, { "content-type": TIPOS[".html"] });
    res.end(fs.readFileSync(path.join(RAIZ, "404.html")));
    return;
  }
  res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

// Páginas del sitemap (sin fichas) más una muestra repartida de 8 fichas
const sitemap = fs.readFileSync(path.join(RAIZ, "sitemap.xml"), "utf8");
const todas = [...sitemap.matchAll(/<loc>https:\/\/perdata\.site([^<]*)<\/loc>/g)].map((m) => m[1]);
const fichas = todas.filter((u) => u.startsWith("/empresa/"));
const paginas = todas.filter((u) => !u.startsWith("/empresa/"));
if (fichas.length < FICHAS_MUESTRA) throw new Error(`solo ${fichas.length} fichas en el sitemap`);
const muestra = Array.from({ length: FICHAS_MUESTRA }, (_, i) => fichas[Math.floor((i * fichas.length) / FICHAS_MUESTRA)]);
const rutas = [...paginas, ...muestra];

// Enlace a perdata.site se trata como interno y se pide al servidor local
function rutaInterna(href, origen) {
  let u;
  try { u = new URL(href, origen); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.hostname !== "perdata.site" && u.hostname !== "www.perdata.site" && u.origin !== origen) return null;
  u.hash = "";
  return u.pathname + u.search;
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const version = browser.version();
const resultados = [];
const enlacesVistos = new Map(); // ruta -> páginas donde aparece

async function revisar(vista, ruta) {
  const contexto = await browser.newContext({
    viewport: { width: vista.ancho, height: vista.alto }, locale: "es-PE", timezoneId: "America/Lima",
  });
  const pagina = await contexto.newPage();
  const consola = [];
  const terceros = [];
  const respuestasMal = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") consola.push({ texto: m.text().slice(0, 240), url: m.location().url || "" });
  });
  pagina.on("pageerror", (e) => consola.push({ texto: `excepcion: ${e.message.slice(0, 240)}`, url: "" }));
  pagina.on("requestfailed", (r) => { if (!r.url().startsWith(BASE)) terceros.push(r.url().slice(0, 160)); });
  pagina.on("response", (r) => {
    if (r.status() < 400) return;
    if (r.url().startsWith(BASE)) respuestasMal.push({ url: r.url().replace(BASE, ""), estado: r.status() });
    else terceros.push(`${r.status()} ${r.url().slice(0, 160)}`);
  });
  await pagina.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch { /* navegador sin layout-shift */ }
  });
  const respuesta = await pagina.goto(BASE + ruta, { waitUntil: "load", timeout: 30000 });
  await pagina.waitForTimeout(1500);
  // Recorre el scroll para cargar lo diferido y medir el CLS de la lectura completa
  const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < alto; y += vista.alto) {
    await pagina.evaluate((v) => window.scrollTo(0, v), y);
    await pagina.waitForTimeout(120);
  }
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.waitForTimeout(1200);

  const medidas = await pagina.evaluate(() => {
    const de = document.documentElement;
    const ancho = window.innerWidth;
    const culpables = [];
    for (const el of document.body ? document.body.querySelectorAll("*") : []) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > ancho + 1 && getComputedStyle(el).position !== "fixed") {
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        culpables.push(el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : ""));
        if (culpables.length >= 5) break;
      }
    }
    const imgRotas = Array.from(document.images)
      .filter((i) => i.getAttribute("src") && i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute("src").slice(0, 160));
    const hrefs = Array.from(new Set(Array.from(document.querySelectorAll("a[href]")).map((a) => a.href)));
    return { desborde: de.scrollWidth - de.clientWidth, culpables, imgRotas, hrefs, cls: window.__cls, titulo: document.title };
  });

  for (const h of medidas.hrefs) {
    const p = rutaInterna(h, BASE);
    if (p) {
      if (!enlacesVistos.has(p)) enlacesVistos.set(p, new Set());
      enlacesVistos.get(p).add(`${ruta} (${vista.nombre})`);
    }
  }
  const esApi = (c) => c.url.includes("/api/") || c.texto.includes("/api/");
  // Error de un recurso de otro origen (p. ej. beacon de Cloudflare bloqueado por CORS desde 127.0.0.1): no es de PerData
  // El mensaje CORS del beacon lleva como origen la página propia, así que también se mira el dominio que cita el texto
  const esTercero = (c) => !esApi(c) && ((c.url !== "" && !c.url.startsWith(BASE)) || /https?:\/\/(?!127\.0\.0\.1)/.test(c.texto));
  resultados.push({
    vista: vista.nombre, ruta, estado: respuesta ? respuesta.status() : null, titulo: medidas.titulo,
    desborde: medidas.desborde, culpables: medidas.culpables, cls: Number(medidas.cls.toFixed(4)),
    imgRotas: medidas.imgRotas,
    consolaReal: consola.filter((c) => !esApi(c) && !esTercero(c)),
    consolaApi: consola.filter(esApi).length,
    consolaTerceros: consola.filter(esTercero).length,
    respuestasMalReal: respuestasMal.filter((r) => !r.url.startsWith("/api/")),
    respuestasApi: respuestasMal.filter((r) => r.url.startsWith("/api/")).length,
    terceros: [...new Set(terceros)],
  });
  await contexto.close();
}

for (const vista of VISTAS) {
  for (const ruta of rutas) {
    process.stdout.write(`${vista.nombre} ${ruta}\n`);
    try { await revisar(vista, ruta); }
    catch (e) { resultados.push({ vista: vista.nombre, ruta, error: String(e.message).slice(0, 300) }); }
  }
}

// Enlaces internos únicos: se pide cada uno al servidor local
const contextoEnlaces = await browser.newContext();
const enlacesRotos = [];
let apiEnlaces = 0;
for (const [ruta, origenes] of enlacesVistos) {
  if (ruta.startsWith("/api/")) { apiEnlaces++; continue; }
  const r = await contextoEnlaces.request.get(BASE + ruta, { failOnStatusCode: false, timeout: 20000 })
    .catch((e) => ({ status: () => `error: ${String(e.message).slice(0, 80)}` }));
  const estado = r.status();
  if (typeof estado !== "number" || estado >= 400) enlacesRotos.push({ ruta, estado, enlazadoDesde: [...origenes].slice(0, 3) });
}
await contextoEnlaces.close();
await browser.close();
servidor.close();

// ---------- informe ----------
const porVista = (nombre) => resultados.filter((r) => r.vista === nombre && !r.error);
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("es-PE") : n);
const cabecera = "| Página | Estado | Desborde (px) | CLS | Errores consola | Imágenes rotas | Respuestas >= 400 |";
function filas(nombre) {
  return porVista(nombre).map((r) => {
    const marca = (cond, txt) => (cond ? `**${txt}**` : txt);
    return `| \`${r.ruta}\` | ${r.estado} | ${marca(r.desborde > 0, fmt(r.desborde))} | ${marca(r.cls > 0.1, r.cls.toFixed(3))} | ${marca(r.consolaReal.length > 0, r.consolaReal.length)} | ${marca(r.imgRotas.length > 0, r.imgRotas.length)} | ${marca(r.respuestasMalReal.length > 0, r.respuestasMalReal.length)} |`;
  });
}
const totales = (nombre) => {
  const v = porVista(nombre);
  return {
    paginas: v.length,
    desborde: v.filter((r) => r.desborde > 0).length,
    consola: v.filter((r) => r.consolaReal.length > 0).length,
    cls: Math.max(0, ...v.map((r) => r.cls)).toFixed(3),
    cls01: v.filter((r) => r.cls > 0.1).length,
    imgs: v.reduce((a, r) => a + r.imgRotas.length, 0),
    resp: v.reduce((a, r) => a + r.respuestasMalReal.length, 0),
    errores: resultados.filter((r) => r.vista === nombre && r.error).length,
  };
};
const tE = totales("escritorio 1440"), tM = totales("movil 390");

const L = [];
L.push(`# Informe QA de PerData (laboratorio InstaBox)`, "");
L.push(`- Fecha: ${FECHA}`, `- Commit del build: \`${COMMIT}\``, `- Chromium ${version} (Playwright 1.64.1) en la caja`);
L.push(`- Alcance: ${paginas.length} páginas del sitemap + ${muestra.length} fichas de empresa (de ${fichas.length}), a 1440 y 390 px.`);
L.push(`- Servidor local estático sobre public/ (no es producción). Las llamadas a /api/ dan 404 a propósito y se cuentan aparte.`, "");
L.push(`## Resumen`, "");
L.push(`| Métrica | Escritorio 1440 | Móvil 390 |`, `|---|---|---|`);
L.push(`| Páginas revisadas | ${tE.paginas} | ${tM.paginas} |`);
L.push(`| Con desborde horizontal | ${tE.desborde} | ${tM.desborde} |`);
L.push(`| Con errores de consola (sin API) | ${tE.consola} | ${tM.consola} |`);
L.push(`| CLS máximo (umbral bueno 0,1) | ${tE.cls} | ${tM.cls} |`);
L.push(`| Páginas con CLS > 0,1 | ${tE.cls01} | ${tM.cls01} |`);
L.push(`| Imágenes rotas (suma) | ${tE.imgs} | ${tM.imgs} |`);
L.push(`| Respuestas >= 400 propias (sin API) | ${tE.resp} | ${tM.resp} |`);
L.push(`| Errores de ejecución del recorrido | ${tE.errores} | ${tM.errores} |`);
L.push(`| Enlaces internos únicos | ${enlacesVistos.size - apiEnlaces} | |`);
L.push(`| Enlaces internos rotos | ${enlacesRotos.length} | |`, "");

L.push(`## Escritorio 1440`, "", cabecera, "|---|---|---|---|---|---|---|", ...filas("escritorio 1440"), "");
L.push(`## Móvil 390`, "", cabecera, "|---|---|---|---|---|---|---|", ...filas("movil 390"), "");

const detalle = resultados.filter((r) => !r.error && (r.desborde > 0 || r.consolaReal.length || r.imgRotas.length || r.respuestasMalReal.length || r.cls > 0.1));
L.push(`## Detalle de incidencias`, "");
if (!detalle.length) L.push("Ninguna incidencia propia.", "");
for (const r of detalle) {
  L.push(`### \`${r.ruta}\` · ${r.vista}`);
  if (r.desborde > 0) L.push(`- Desborde ${r.desborde} px. Elementos que sobresalen: ${r.culpables.map((c) => `\`${c}\``).join(", ") || "no identificados"}`);
  if (r.cls > 0.1) L.push(`- CLS ${r.cls}`);
  for (const c of r.consolaReal) L.push(`- Consola: ${c.texto}${c.url ? ` (${c.url.replace(BASE, "")})` : ""}`);
  for (const i of r.imgRotas) L.push(`- Imagen rota: \`${i}\``);
  for (const x of r.respuestasMalReal) L.push(`- HTTP ${x.estado}: \`${x.url}\``);
  L.push("");
}

L.push(`## Enlaces internos rotos`, "");
if (!enlacesRotos.length) L.push("Ninguno.", "");
else {
  L.push("| Destino | Estado | Enlazado desde |", "|---|---|---|");
  for (const e of enlacesRotos) L.push(`| \`${e.ruta}\` | ${e.estado} | ${e.enlazadoDesde.join("; ")} |`);
  L.push("");
}

const esperados = resultados.filter((r) => !r.error).reduce((a, r) => a + r.consolaApi + r.respuestasApi, 0);
const deTerceros = resultados.filter((r) => !r.error).reduce((a, r) => a + r.consolaTerceros, 0);
L.push(`## Esperado en la caja`, "");
L.push(`- Errores de consola y respuestas de /api/ (la API no está en la caja): ${esperados}.`);
L.push(`- Errores de consola de recursos de otros orígenes (beacons y anuncios bloqueados desde 127.0.0.1): ${deTerceros}.`);
const terc = [...new Set(resultados.flatMap((r) => r.terceros || []))];
L.push(`- Recursos de terceros que no cargaron desde la caja (anuncios, analítica, fuentes externas): ${terc.length} distintos.`);
for (const t of terc.slice(0, 15)) L.push(`  - \`${t}\``);
L.push("");
const errores = resultados.filter((r) => r.error);
if (errores.length) {
  L.push(`## Errores de ejecución`, "");
  for (const e of errores) L.push(`- \`${e.ruta}\` (${e.vista}): ${e.error}`);
  L.push("");
}
L.push(`## Método`, "", "- CLS: suma de layout-shift sin interacción reciente, tras recorrer la página entera con scroll.", "- Desborde: scrollWidth menos clientWidth del documento, y elementos que sobresalen del ancho de la vista.", "- Enlaces: los internos únicos de todas las páginas se piden al servidor local; /api/ se omite.", "");

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, `informe-${FECHA}.md`), L.join("\n"));
fs.writeFileSync(path.join(SALIDA, `resultados-${FECHA}.json`), JSON.stringify({ fecha: FECHA, commit: COMMIT, version, resultados, enlacesRotos }, null, 1));
console.log(`informe: ${path.join(SALIDA, `informe-${FECHA}.md`)}  paginas=${resultados.length} enlacesRotos=${enlacesRotos.length}`);
