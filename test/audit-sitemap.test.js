import test from "node:test";
import assert from "node:assert/strict";
import {
  extraerLocs,
  extraerCanonical,
  extraerTitulo,
  contarH1,
  palabrasVisibles,
  revisarPagina,
} from "../scripts/audit-sitemap.js";

test("extracción de locs de un sitemap de ejemplo", () => {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '<url><loc>https://perdata.site/</loc><lastmod>2026-11-09</lastmod></url>',
    '  <url><loc>https://perdata.site/dolar</loc></url>',
    '<url><loc>https://perdata.site/empresa/AENZAC1</loc><changefreq>weekly</changefreq></url>',
    "</urlset>",
  ].join("\n");
  assert.deepEqual(extraerLocs(xml), [
    "https://perdata.site/",
    "https://perdata.site/dolar",
    "https://perdata.site/empresa/AENZAC1",
  ]);
  assert.deepEqual(extraerLocs(""), []);
});

test("canonical con y sin barra final apunta a la misma URL", () => {
  const sinBarra = '<link rel="canonical" href="https://perdata.site/guia">';
  const conBarra = '<link rel="canonical" href="https://perdata.site/guia/">';
  const ordenInvertido = '<link href="https://perdata.site/guia" rel="canonical">';
  assert.equal(extraerCanonical(sinBarra), "https://perdata.site/guia");
  assert.equal(extraerCanonical(conBarra), "https://perdata.site/guia/");
  assert.equal(extraerCanonical(ordenInvertido), "https://perdata.site/guia");
  assert.equal(extraerCanonical("<html></html>"), null);
});

test("recuento de palabras ignorando script, style, noscript y svg", () => {
  const html = [
    "<html><head><style>.a { color: red; } oculto estilo</style>",
    "<script>var palabra = 'oculta guion';</script></head>",
    "<body><noscript>texto no visible palabras</noscript>",
    "<svg><text>etiqueta invisible</text></svg>",
    "<h1>Hola mundo</h1><p>tres palabras acá</p>",
    "<!-- comentario con palabras -->",
    "<p>cuatro</p></body></html>",
  ].join("");
  // Hola mundo + tres palabras acá + cuatro = 6 palabras.
  assert.equal(palabrasVisibles(html), 6);
  assert.equal(palabrasVisibles(""), 0);
});

test("detección de dos h1 (y de uno solo)", () => {
  assert.equal(contarH1("<h1>Uno</h1><p>x</p>"), 1);
  assert.equal(contarH1('<h1 class="a">Uno</h1><h1>Dos</h1>'), 2);
  assert.equal(contarH1("<p>sin titulares</p>"), 0);
});

test("extraerTitulo lee el primer título", () => {
  assert.equal(extraerTitulo("<title>Guía del dólar · PerData</title>"), "Guía del dólar · PerData");
  assert.equal(extraerTitulo("<html></html>"), null);
});

test("revisarPagina acepta una página buena e ignora la barra final del canonical", () => {
  const texto = "palabra ".repeat(320);
  const html = [
    "<html><head>",
    "<title>Guía del dólar · PerData</title>",
    '<meta name="description" content="Guía completa del tipo de cambio en el Perú con series oficiales.">',
    '<meta name="robots" content="index, follow">',
    '<link rel="canonical" href="https://perdata.site/guia/">',
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>',
    "</head><body>",
    "<h1>Guía del dólar</h1>",
    `<p>${texto}</p>`,
    "</body></html>",
  ].join("");
  const r = revisarPagina({ url: "https://perdata.site/guia", codigo: 200, headers: new Headers(), html });
  assert.deepEqual(r.problemas, []);
});

test("revisarPagina marca redirecciones y páginas pobres", () => {
  const headers = new Headers();
  headers.set("location", "https://perdata.site/dolar");
  const redirige = revisarPagina({ url: "https://perdata.site/dolar.html", codigo: 301, headers, html: "" });
  assert.equal(redirige.codigo, 301);
  assert.ok(redirige.problemas.some((p) => p.startsWith("redirige a https://perdata.site/dolar")));

  const pobre = revisarPagina({
    url: "https://perdata.site/explorer",
    codigo: 200,
    headers: new Headers(),
    html: "<html><head><title>Explorador</title></head><body><h1>Explorador</h1><p>corta</p></body></html>",
  });
  assert.ok(pobre.problemas.includes("pocas palabras: 3"));
  assert.ok(pobre.problemas.includes("sin canonical"));
  assert.ok(pobre.problemas.includes("sin meta description"));

  const exenta = revisarPagina({
    url: "https://perdata.site/semana/2026-11-09",
    codigo: 200,
    headers: new Headers(),
    html: "<html><head><title>Resumen semanal</title></head><body><h1>Semana</h1><p>corta</p></body></html>",
  });
  assert.ok(!exenta.problemas.some((p) => p.startsWith("pocas palabras")));
});
