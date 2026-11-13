import test from "node:test";
import assert from "node:assert/strict";
import { decodeHtml, parseItems } from "../api/news.js";

test("una entidad que esconde una etiqueta no llega como HTML real", () => {
  const out = decodeHtml("PBI &lt;img src=x onerror=alert(1)&gt; crece");
  assert.equal(out, "PBI crece");
  assert.doesNotMatch(out, /<[a-zA-Z\/!]/);
});

test("una doble codificación tampoco deja etiquetas", () => {
  assert.doesNotMatch(decodeHtml("x &amp;lt;b&amp;gt; y"), /<[a-zA-Z\/!]/);
});

test("el contenido CDATA se conserva sin sus etiquetas", () => {
  assert.equal(decodeHtml("<![CDATA[Cobre <b>sube</b> hoy]]>"), "Cobre sube hoy");
});

test("un '<' suelto en el texto se conserva", () => {
  assert.equal(decodeHtml("PBI < 3 % este año"), "PBI < 3 % este año");
  assert.equal(decodeHtml("inflación &lt; 3 %"), "inflación < 3 %");
});

test("&amp; y las comillas se decodifican", () => {
  assert.equal(decodeHtml("Oro &amp; plata: &quot;récord&quot; &#39;hoy&#39;"), "Oro & plata: \"récord\" 'hoy'");
});

function feedXml(link) {
  return `<rss><channel><item><title>Titular - Fuente</title><link>${link}</link><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
}

test("una url http(s) se conserva en la noticia", () => {
  const [item] = parseItems(feedXml("https://ejemplo.pe/nota?id=1&amp;x=2"), { symbol: "PEN=X", category: "BCRP" });
  assert.equal(item.url, "https://ejemplo.pe/nota?id=1&x=2");
});

test("una url que no es http(s) no se usa en la noticia", () => {
  const [item] = parseItems(feedXml("javascript:alert(1)"), { symbol: "PEN=X", category: "BCRP" });
  assert.notEqual(item.url, "javascript:alert(1)");
  assert.match(item.url, /^https:\/\//);
});
