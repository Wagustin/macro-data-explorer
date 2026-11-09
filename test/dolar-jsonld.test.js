import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const dolarHtml = () => fs.readFileSync(path.join(rootDir, "dolar.html"), "utf8");

function ldJsonBlocks(html) {
  return [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1]);
}

test("los bloques JSON-LD de dolar.html son JSON válido", () => {
  const bloques = ldJsonBlocks(dolarHtml());
  assert.ok(bloques.length > 0, "dolar.html no tiene bloques JSON-LD");
  for (const raw of bloques) {
    assert.doesNotThrow(() => JSON.parse(raw), "bloque JSON-LD inválido");
  }
});

test("el Dataset de dolar.html declara la licencia como objeto CreativeWork con URL https", () => {
  const bloques = ldJsonBlocks(dolarHtml()).map((b) => JSON.parse(b));

  const dataset = bloques.find((b) => b["@type"] === "Dataset");
  assert.ok(dataset, "dolar.html no tiene bloque Dataset");
  assert.equal(typeof dataset.license, "object", "la licencia del Dataset debe ser un objeto");
  assert.ok(!Array.isArray(dataset.license), "la licencia del Dataset no debe ser un arreglo");
  assert.equal(dataset.license["@type"], "CreativeWork");
  assert.ok(typeof dataset.license.url === "string" && dataset.license.url.startsWith("https://"), "la licencia debe traer una url https");
});
