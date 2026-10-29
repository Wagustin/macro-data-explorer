import test from "node:test";
import assert from "node:assert/strict";
import { selectHeadlines, topicsForAsset, validCitations } from "../scripts/interpretation-utils.js";
import { grounded } from "../scripts/llm.js";

const since = "2026-10-22";
const story = (id, title, date, topic = "Mundo") => ({ id, titulo: title, fecha_iso: `${date}T12:00:00Z`, fuente: "Fuente", url: `https://example.com/${id}`, categoria: topic });

test("headline selection prefers direct mentions, then relevance and recency", () => {
  const asset = { symbol: "SCCO.LM", name: "Southern Copper Corporation", sector: "Minería", category: "bvl_pe", tags: [] };
  const news = [story("theme", "Cobre sube en mercados mundiales", "2026-10-29", "Minería y metales"),
    story("direct-low", "Southern Copper Corporation anuncia resultados", "2026-10-29"), story("direct-high", "SCCO evalúa inversión minera", "2026-10-27")];
  const labels = { theme: { tema: "Minería y metales", relevancia: "ALTA" },
    "direct-low": { empresas: [], relevancia: "MEDIA", sentimiento: "POSITIVO" },
    "direct-high": { empresas: ["SCCO"], relevancia: "ALTA", sentimiento: "NEUTRO" } };
  assert.deepEqual(selectHeadlines({ asset, news, labels, since }).map((item) => item.id), ["direct-high", "direct-low"]);
});

test("topic selection follows asset class and only returns secure citation URLs", () => {
  assert.deepEqual(topicsForAsset({ symbol: "PEN=X", sector: "Divisas" }), ["Dólar y BCRP", "Mundo", "Economía y fiscal"]);
  assert.deepEqual(topicsForAsset({ symbol: "HG=F", sector: "Metales" }), ["Minería y metales", "Mundo"]);
  assert.deepEqual(topicsForAsset({ symbol: "SCCO.LM", name: "Southern Copper", sector: "Minería", category: "bvl_pe" }), ["Southern Copper", "Minería y metales", "Bolsa y empresas"]);
  assert.deepEqual(validCitations([{ id: "ok" }, { id: "bad" }], [
    { id: "ok", titulo: "Titular", fuente: "Fuente", fecha: "2026-10-29", url: "https://example.com" },
    { id: "bad", titulo: "No seguro", url: "http://example.com" },
  ]).map((item) => item.id), ["ok"]);
});

test("topic fallback selects recent asset-class coverage when no direct story exists", () => {
  const asset = { symbol: "PEN=X", name: "Tipo de cambio USD/PEN", sector: "Divisas", category: "fx" };
  const news = [story("fx", "BCRP mantiene su tasa de referencia", "2026-10-28", "Dólar y BCRP"),
    story("old", "Dólar y mercados globales", "2026-10-18", "Mundo")];
  const labels = { fx: { tema: "Dólar y BCRP", relevancia: "MEDIA", sentimiento: "NEUTRO" }, old: { tema: "Mundo", relevancia: "ALTA" } };
  assert.deepEqual(selectHeadlines({ asset, news, labels, since }).map((item) => item.id), ["fx"]);
});

test("grounded drops sentences with figures absent from the context", () => {
  assert.equal(grounded("El dólar marcaría 3.75. La inflación sería 84.6%.", "3.75"), "El dólar marcaría 3.75.");
});
