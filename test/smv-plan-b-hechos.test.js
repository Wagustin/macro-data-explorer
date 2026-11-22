import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(ROOT, "scripts/smv-plan-b-hechos.sh");
const src = fs.readFileSync(script, "utf8");

test("scripts/smv-plan-b-hechos.sh existe, es ejecutable y pasa bash -n", () => {
  assert.ok(fs.statSync(script).mode & 0o111, "no es ejecutable");
  execFileSync("bash", ["-n", script]);
});

test("el script soporta PLANB_SECO y PLANB_FORZAR", () => {
  assert.match(src, /PLANB_SECO/);
  assert.match(src, /PLANB_FORZAR/);
});

test("el script escribe solo en su worktree propio, nunca en el clon principal", () => {
  assert.match(src, /DATA_WT="\$\{DATA_WT:-\/home\/wagustin\/kathy_workspace\/wt-planb-data\}"/);
  // Única orden permitida contra REPO: crear el worktree propio (worktree add)
  const sobreRepo = src.split("\n").filter((l) => /git -C "?\$\{?REPO\}?"? /.test(l) && !/worktree add/.test(l));
  const escritura = sobreRepo.filter((l) => /\b(add|commit|push|reset|checkout|rebase|pull)\b/.test(l));
  assert.deepEqual(escritura, [], "hay una orden de escritura contra REPO");
  assert.doesNotMatch(src, /cd "?\$\{?REPO/, "hace cd al clon principal");
});

test("el script usa el lock propio y el log compartido con prefijo hechos:", () => {
  assert.match(src, /smv-plan-b-hechos\.lock/);
  assert.match(src, /smv-plan-b\.log/);
  assert.match(src, /hechos: /);
});
