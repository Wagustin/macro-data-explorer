import test from "node:test";
import assert from "node:assert/strict";
import { buildIssuerStatuses, classifySecurity } from "../api/_lib/empresas-estado.js";
import fs from "node:fs";

const now = new Date("2026-10-28T00:00:00Z");
const quote = (fecha, monto = 100, cierre = 12.5) => ({ fecha, monto, cierre });

test("security states use recent trading dates and projection membership", () => {
  const value = { nemonico: "TESTC1", moneda: "S/" };
  assert.equal(classifySecurity(value, [quote("2026-10-20")], { now }).estado, "poca_liquidez");
  assert.equal(classifySecurity(value, [quote("2026-09-01")], { now }).estado, "parada");
  assert.equal(classifySecurity(value, [quote("2025-10-01")], { now }).estado, "dormida");
  assert.equal(classifySecurity(value, [], { now }).estado, "sin_negociacion");
  assert.equal(classifySecurity(value, [], { now, projected: true }).estado, "con_proyeccion");
});

test("issuer uses its best security and reports its recent activity", () => {
  const issuers = [{ codigoBVL: "123", valores: [
    { nemonico: "OLD", moneda: "S/" },
    { nemonico: "ACTIVE", moneda: "US$", simbolo_proyeccion: "ACTIVE.LM" },
  ] }];
  const output = buildIssuerStatuses(issuers, [
    { nemonico: "OLD", ...quote("2024-01-01") },
    { nemonico: "ACTIVE", ...quote("2026-10-20") },
  ], new Set(["ACTIVE.LM"]), { now });
  assert.deepEqual(output["123"], {
    estado: "con_proyeccion", nemonico: "ACTIVE", ultima_fecha: "2026-10-20",
    ultimo_cierre: 12.5, moneda: "US$", operaciones_12m: 1,
  });
});

test("solo la lista curada cuenta como «con proyección»: las emisoras añadidas al buscador no", async () => {
  const { CATALOG, SIMBOLOS_CURADOS } = await import("../api/search.js");
  const { emisores } = JSON.parse(fs.readFileSync(new URL("../data/empresas.json", import.meta.url), "utf8"));
  const projected = new Set([...SIMBOLOS_CURADOS].filter((symbol) => symbol.endsWith(".LM")));
  assert.ok(CATALOG.some((item) => item.symbol === "HABITAC1.LM"), "el buscador sí indexa la emisora");
  assert.ok(!projected.has("HABITAC1.LM"), "pero no figura con proyección");
  assert.ok(projected.has("ALICORC1.LM"));
  // Sin cotizaciones, una emisora fuera de la lista curada nunca queda «con proyección».
  const estados = buildIssuerStatuses(emisores, [], projected);
  const conProyeccion = Object.values(estados).filter((e) => e.estado === "con_proyeccion").length;
  assert.ok(conProyeccion > 0 && conProyeccion < 60, `con proyección: ${conProyeccion} de ${Object.keys(estados).length}`);
});
