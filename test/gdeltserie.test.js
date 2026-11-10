import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The V7 gdeltserie loader is Python (research/v7/gdeltserie/download_gdeltserie.py);
// this test guards the module contract the loader relies on: eight queries in
// both modes, monthly windowing, daily granularity, and the CSV column layout.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "research", "v7", "gdeltserie");
const LOADER = path.join(MODULE_DIR, "download_gdeltserie.py");
const README = path.join(MODULE_DIR, "README.md");

test("loader module exists with the eight brief queries and both modes", () => {
  assert.ok(fs.existsSync(LOADER), "download_gdeltserie.py missing");
  const src = fs.readFileSync(LOADER, "utf8");
  for (const id of [
    "peru_economia", "dolar_tipo_cambio", "bcrp", "mineria_cobre",
    "elecciones_politica", "fed_tasas", "aranceles_eeuu_china", "riesgo_global",
  ]) {
    assert.ok(src.includes(`"${id}"`), `query id ${id} not in loader`);
  }
  assert.ok(src.includes('"timelinetone"'));
  assert.ok(src.includes('"timelinevol"'));
  assert.ok(src.includes("sourcecountry:PE"));
  // Polite cadence: at least 5 s between requests (brief/CONVENCIONES).
  assert.ok(/max\(float\(args\.delay\), 5\.0\)/.test(src), "5 s floor not enforced");
});

test("CSV contract: fecha,tono,volumen,fecha_disponible (next day)", () => {
  const src = fs.readFileSync(LOADER, "utf8");
  assert.ok(src.includes('["fecha", "tono", "volumen", "fecha_disponible"]'));
  // disponibilidad = día siguiente (brief), not 45 days / monthly.
  assert.ok(src.includes("dt.timedelta(days=1)"));
});

test("hourly responses are re-sliced to daily (brief rule)", () => {
  const src = fs.readFileSync(LOADER, "utf8");
  assert.ok(src.includes("date_resolution"));
  assert.ok(src.includes("HOURLY"), "hourly branch not logged/documented");
  assert.ok(src.includes("month_windows"), "monthly windowing missing");
});

test("README documents queries, gaps and licencias pointer", () => {
  assert.ok(fs.existsSync(README), "README.md missing");
  const md = fs.readFileSync(README, "utf8");
  for (const id of ["peru_economia", "dolar_tipo_cambio", "bcrp", "riesgo_global"]) {
    assert.ok(md.includes(id), `README missing ${id}`);
  }
  assert.ok(md.includes("sourcecountry:PE"));
  assert.ok(md.includes("_licencias.md"));
});
