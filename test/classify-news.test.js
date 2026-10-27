import test from "node:test";
import assert from "node:assert/strict";
import { classifyBatch } from "../scripts/news-classification.js";

test("invalid and duplicate indices cannot classify or publish unrelated headlines", () => {
  const batch = [{ id: "first", titulo: "Empresa crece", categoria: "Bolsa" }, { id: "second", titulo: "Otra noticia" }];
  const result = classifyBatch(batch, [
    { i: -1, relevante: "ALTA", empresas: [] },
    { i: 2, relevante: "ALTA", empresas: [] },
    { i: "0", relevante: "ALTA", empresas: [] },
    { i: 0, relevante: "MEDIA", empresas: ["KNOWN", "UNKNOWN"] },
    { i: 0, relevante: "ALTA", empresas: [] },
    { i: 1, relevante: "NINGUNA", empresas: [] },
  ], { knownCompanies: new Set(["KNOWN"]), marketTerms: /bolsa/i });

  assert.deepEqual(result.classified, [{
    id: "first",
    item: { relevancia: "MEDIA", tema: undefined, sentimiento: undefined, empresas: ["KNOWN"] },
  }]);
  assert.deepEqual(result.discarded, ["second"]);
  assert.deepEqual([...result.seen], [0, 1]);
});
