import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/smv-precios.yml"), "utf8");
const script = path.join(ROOT, "scripts/smv-plan-b.sh");

test("smv-precios declara el input saltar_descarga en workflow_dispatch", () => {
  assert.match(wf, /workflow_dispatch:\n\s+inputs:\n\s+saltar_descarga:[\s\S]*?type: choice/);
});

test("el paso de descarga solo corre si saltar_descarga no es 1", () => {
  const start = wf.indexOf("- name: Cierres de los últimos dos meses");
  const end = wf.indexOf("- name: Calcular estado de los emisores");
  const step = wf.slice(start, end);
  assert.ok(start > 0 && end > start, "no encuentro el paso");
  assert.match(step, /if: \$\{\{ github\.event\.inputs\.saltar_descarga != '1' \}\}/);
  assert.match(step, /run: node scripts\/fetch-smv-precios\.js/);
});

test("scripts/smv-plan-b.sh existe, es ejecutable y pasa bash -n", () => {
  assert.ok(fs.statSync(script).mode & 0o111, "no es ejecutable");
  execFileSync("bash", ["-n", script]);
});
