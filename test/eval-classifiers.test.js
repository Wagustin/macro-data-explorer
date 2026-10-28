import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("config/laya-criterios.json conforms to tuning schema", () => {
  const criteriosPath = path.join(ROOT, "config", "laya-criterios.json");
  assert.ok(fs.existsSync(criteriosPath), "config/laya-criterios.json must exist");
  const data = JSON.parse(fs.readFileSync(criteriosPath, "utf8"));

  assert.ok(data.version, "Must declare a version");
  assert.ok(data.relevancia?.criteria?.ALTA, "Must include ALTA criteria");
  assert.ok(data.relevancia?.criteria?.NINGUNA, "Must include NINGUNA criteria");
  assert.ok(data.tema?.criteria?.["Dólar y BCRP"], "Must include Dólar y BCRP criteria");
  assert.ok(data.sentimiento?.criteria?.POSITIVO, "Must include POSITIVO criteria");
  assert.ok(data.sentimiento?.criteria?.NEGATIVO, "Must include NEGATIVO criteria");
  assert.ok(data.empresas?.alias_map?.bcp, "Must include alias_map");
});

test("eval dataset and arbitration files meet T46 specification", () => {
  const histPath = path.join(ROOT, "eval", "clasificador", "historico.jsonl");
  assert.ok(fs.existsSync(histPath), "historico.jsonl must exist");
  const histLines = fs.readFileSync(histPath, "utf8").trim().split("\n");
  assert.ok(histLines.length >= 400, "historico.jsonl must have at least 400 records");

  const clavePath = path.join(ROOT, "eval", "clasificador", "clave.jsonl");
  assert.ok(fs.existsSync(clavePath), "clave.jsonl must exist");
  const claveRecords = fs.readFileSync(clavePath, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(claveRecords.length, 80, "clave.jsonl must have exactly 80 items");

  const disc = claveRecords.filter((r) => r.tipo_muestra === "discrepancia");
  const coinc = claveRecords.filter((r) => r.tipo_muestra === "coincidencia");
  assert.equal(disc.length, 60, "must have 60 discrepancies");
  assert.equal(coinc.length, 20, "must have 20 coincidences");

  const etiquetarPath = path.join(ROOT, "eval", "clasificador", "etiquetar.md");
  assert.ok(fs.existsSync(etiquetarPath), "etiquetar.md must exist");
  const etiquetarContent = fs.readFileSync(etiquetarPath, "utf8");
  const tableRows = etiquetarContent.split("\n").filter((l) => l.startsWith("|") && /\|\s*\d+\s*\|/.test(l));
  assert.equal(tableRows.length, 80, "etiquetar.md must contain 80 table rows for labeling");

  const discrepanciasPath = path.join(ROOT, "eval", "clasificador", "discrepancias.md");
  assert.ok(fs.existsSync(discrepanciasPath), "discrepancias.md must exist");
});
