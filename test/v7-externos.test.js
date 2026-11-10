// V7 externos module: offline tests for research/v7/externos/download_externos.py.
// No network access allowed in tests; data files are checked if present.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = path.join(ROOT, "research", "v7", "externos", "download_externos.py");
const README = path.join(ROOT, "research", "v7", "externos", "README.md");
const DATA = "/home/wagustin/v7/data/externos";

const BRIEF_IDS = ["DTWEXBGS","DGS10","DGS2","T10Y2Y","DFF","VIXCLS","DCOILWTICO","DCOILBRENTEU","PCOPPUSDM","DEXBZUS","DEXMXUS"];

function nextBusinessDay(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test("module files exist", () => {
  assert.ok(fs.existsSync(MODULE), "download_externos.py");
  assert.ok(fs.existsSync(README), "README.md");
});

test("download_externos.py parses (py_compile via python3)", () => {
  const cmd = process.env.PYTHON || "python3";
  execFileSync(cmd, ["-m", "py_compile", MODULE], { stdio: "pipe" });
});

test("README documents probe, full run, licence, limitations", () => {
  const text = fs.readFileSync(README, "utf8");
  assert.match(text, /--probe/);
  assert.match(text, /fecha_disponible/);
  for (const id of BRIEF_IDS) assert.ok(text.includes(id), `README mentions ${id}`);
  assert.match(text, /BAMLC0A0CM/);
  assert.match(text, /treasury\.gov|Tesoro/);
  assert.match(text, /externos\.log/);
});

test("data outputs well-formed when present", (t) => {
  if (!fs.existsSync(DATA)) {
    t.skip("no data dir yet (run the downloader first)");
    return;
  }
  const indicePath = path.join(DATA, "_indice.csv");
  assert.ok(fs.existsSync(indicePath), "_indice.csv");
  assert.ok(fs.existsSync(path.join(DATA, "_licencias.md")), "_licencias.md");
  const indice = fs.readFileSync(indicePath, "utf8").split("\n").filter(Boolean);
  assert.match(indice[0], /^id,nombre,unidad,fuente,frecuencia,primera_fecha/);
  for (const id of BRIEF_IDS) {
    const f = path.join(DATA, id + ".csv");
    assert.ok(fs.existsSync(f), `${id}.csv`);
    const lines = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
    assert.match(lines[0], /^fecha,valor,fecha_disponible\r?$/);
    assert.ok(lines.length > 2, `${id} has rows`);
    const fechas = lines.slice(1).map((l) => l.split(",")[0].trim());
    assert.equal(new Set(fechas).size, fechas.length, `${id} no duplicate fechas`);
    for (const line of lines.slice(1)) {
      const parts = line.split(",");
      const fecha = parts[0].trim();
      const valor = parts[1].trim();
      const disponible = parts[2].trim();
      assert.ok(!Number.isNaN(parseFloat(valor)), `${id} numeric value ${valor}`);
      assert.ok(disponible >= fecha, `${id} disponible >= fecha`);
      if (id !== "PCOPPUSDM") {
        assert.equal(disponible, nextBusinessDay(fecha), `${id} disponible = dia habil siguiente`);
      }
    }
  }
});
