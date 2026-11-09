#!/usr/bin/env node
/**
 * Auditoría del sitemap de producción: ninguna URL debe redirigir ni ser pobre.
 * Descarga `${base}/sitemap.xml`, extrae los `<loc>` y revisa cada URL:
 *   (a) código 200; un 3xx es problema («redirige a …»);
 *   (b) sin `noindex` ni en la cabecera `X-Robots-Tag` ni en `<meta name="robots">`;
 *   (c) `<link rel="canonical">` igual a la propia URL (ignora barra final);
 *   (d) exactamente un `<h1>`;
 *   (e) `<title>` presente y distinto del de las demás URLs;
 *   (f) `<meta name="description">` presente;
 *   (g) al menos 300 palabras visibles (quita script, style, noscript y svg),
 *       salvo las rutas que empiezan por `/semana/` y `/privacidad` y `/terms`;
 *   (h) cada bloque `application/ld+json` es JSON válido.
 * Uso: `node scripts/audit-sitemap.js [--base https://perdata.site]`
 * Mensajes de consola en español. Código de salida 1 si hay algún problema.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

// Extrae las URLs de un sitemap XML de ejemplo.
export function extraerLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

// Quita la barra final (salvo la raíz) para comparar URLs a efectos de canonical.
function sinBarraFinal(u) {
  const s = String(u || "").trim();
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

// <link rel="canonical" href="..."> del HTML (o null si no hay).
export function extraerCanonical(html) {
  const s = String(html || "");
  const tag = s.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi) || [];
  for (const t of tag) {
    const m = t.match(/\bhref\s*=\s*"([^"]*)"/i) || t.match(/\bhref\s*=\s*'([^']*)'/i);
    if (m) return m[1].trim();
  }
  return null;
}

// <title> ... </title> del HTML (o null si no hay).
export function extraerTitulo(html) {
  const m = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, " ").trim() : null;
}

// Número de <h1>...</h1> del HTML.
export function contarH1(html) {
  return (String(html || "").match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []).length;
}

// Texto visible sin ejecutar JavaScript: se quitan script, style, noscript, svg,
// comentarios y etiquetas. Una palabra es un token con al menos una letra.
export function palabrasVisibles(html) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter((w) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w)).length;
}

// <meta name="description" content="..."> del HTML (o null si no hay).
export function extraerDescripcion(html) {
  const s = String(html || "");
  for (const tag of s.match(/<meta\b[^>]*>/gi) || []) {
    if (/\bname\s*=\s*["']description["']/i.test(tag)) {
      const m = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i);
      if (m) return m[1].trim();
    }
  }
  return null;
}

// Bloques application/ld+json del HTML.
export function bloquesLdJson(html) {
  return [
    ...String(html || "").matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1]);
}

// ¿Tiene noindex la cabecera o el meta robots?
function tieneNoindex(headers, html) {
  const tag = headers?.get?.("X-Robots-Tag") || "";
  if (/noindex/i.test(tag)) return true;
  for (const m of String(html || "").matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0];
    if (/\bname\s*=\s*["']robots["']/i.test(t) && /noindex/i.test(t)) return true;
  }
  return false;
}

function rutaDe(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || "");
  }
}

// Rutas exentas del mínimo de palabras: notas semanales, privacidad y términos.
function exentoDePalabras(url) {
  const ruta = rutaDe(url);
  return ruta.startsWith("/semana/") || ruta === "/privacidad" || ruta.startsWith("/privacidad/") || ruta === "/terms" || ruta.startsWith("/terms/");
}

// Revisa una página ya descargada. `url`, `codigo`, `headers` y `html`.
// Devuelve { url, codigo, palabras, problemas }.
export function revisarPagina({ url, codigo, headers, html }) {
  const problemas = [];
  const palabras = palabrasVisibles(html);

  if (codigo !== 200) {
    if (codigo >= 300 && codigo < 400) {
      const destino = headers?.get?.("location") || "destino desconocido";
      problemas.push(`redirige a ${destino}`);
    } else {
      problemas.push(`código ${codigo}`);
    }
  }
  // Sin código 200 no tiene sentido seguir revisando el cuerpo.
  if (codigo !== 200) return { url, codigo, palabras, problemas };

  if (tieneNoindex(headers, html)) problemas.push("noindex");

  const canonical = extraerCanonical(html);
  if (!canonical) problemas.push("sin canonical");
  else if (sinBarraFinal(canonical) !== sinBarraFinal(url)) problemas.push(`canonical distinto: ${canonical}`);

  const h1 = contarH1(html);
  if (h1 !== 1) problemas.push(`h1: ${h1}`);

  const titulo = extraerTitulo(html);
  if (!titulo) problemas.push("sin título");

  const descripcion = extraerDescripcion(html);
  if (!descripcion) problemas.push("sin meta description");

  if (!exentoDePalabras(url) && palabras < 300) problemas.push(`pocas palabras: ${palabras}`);

  const bloques = bloquesLdJson(html);
  for (let i = 0; i < bloques.length; i++) {
    try {
      JSON.parse(bloques[i]);
    } catch {
      problemas.push(`JSON-LD inválido (bloque ${i + 1})`);
    }
  }

  return { url, codigo, palabras, problemas, titulo: titulo || "" };
}

async function descargarPagina(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { redirect: "manual", signal: ctrl.signal });
    // Solo se lee el cuerpo si es 200: en un 3xx el cuerpo no es la página.
    const html = res.status === 200 ? await res.text() : "";
    return { url, codigo: res.status, headers: res.headers, html };
  } catch (e) {
    return { url, codigo: 0, headers: new Headers(), html: "", error: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let base = "https://perdata.site";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base" && args[i + 1]) {
      base = args[i + 1];
      i++;
    } else if (args[i].startsWith("--base=")) {
      base = args[i].split("=")[1];
    }
  }
  base = String(base || "https://perdata.site").replace(/\/+$/, "");

  const sitemapUrl = `${base}/sitemap.xml`;
  console.log(`Auditoría del sitemap de ${base}`);
  console.log(`Descargando ${sitemapUrl} …`);

  let xml;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(sitemapUrl, { redirect: "manual", signal: ctrl.signal });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    console.error(`No se pudo descargar el sitemap: ${e?.message || e}`);
    process.exit(1);
  }

  const locs = extraerLocs(xml);
  console.log(`URLs en el sitemap: ${locs.length}`);

  const resultados = new Array(locs.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < locs.length) {
      const i = siguiente++;
      const cruda = await descargarPagina(locs[i]);
      const rev = cruda.error
        ? { url: cruda.url, codigo: 0, palabras: 0, problemas: [`error: ${cruda.error}`] }
        : revisarPagina(cruda);
      resultados[i] = rev;
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, locs.length) }, () => trabajador()));

  // Títulos repetidos: mismo <title> en más de una URL.
  const porTitulo = new Map();
  for (const r of resultados) {
    if (!r.titulo) continue;
    if (!porTitulo.has(r.titulo)) porTitulo.set(r.titulo, []);
    porTitulo.get(r.titulo).push(r);
  }
  for (const [titulo, lista] of porTitulo) {
    if (lista.length > 1) {
      for (const r of lista) r.problemas.push(`título duplicado: «${titulo}»`);
    }
  }

  const columnas = ["URL", "CODIGO", "PALABRAS", "PROBLEMAS"];
  const anchos = [0, 0, 0, 0];
  const filas = resultados.map((r) => [
    r.url,
    String(r.codigo || "-"),
    String(r.palabras),
    r.problemas.length ? r.problemas.join("; ") : "sin problemas",
  ]);
  for (const f of filas) for (let i = 0; i < columnas.length; i++) anchos[i] = Math.max(anchos[i], f[i].length);
  for (let i = 0; i < columnas.length; i++) anchos[i] = Math.max(anchos[i], columnas[i].length);

  const linea = (c) => c.map((v, i) => String(v).padEnd(anchos[i])).join(" | ");
  console.log("");
  console.log(linea(columnas));
  console.log(anchos.map((a) => "-".repeat(a)).join("-+-"));
  for (const f of filas) console.log(linea(f));

  const conProblemas = resultados.filter((r) => r.problemas.length > 0);
  console.log("");
  console.log("==== RESUMEN ====");
  console.log(`URLs revisadas: ${resultados.length}`);
  console.log(`Sin problemas: ${resultados.length - conProblemas.length}`);
  console.log(`Con problemas: ${conProblemas.length}`);
  if (conProblemas.length) {
    console.log("URLs con problemas:");
    for (const r of conProblemas) console.log(`- ${r.url} (${r.problemas.join("; ")})`);
  }

  process.exit(conProblemas.length > 0 ? 1 : 0);
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (esPrincipal) {
  main().catch((e) => {
    console.error("Error fatal en la auditoría del sitemap:", e?.message || e);
    process.exit(1);
  });
}
