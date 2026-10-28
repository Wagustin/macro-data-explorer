import test from "node:test";
import assert from "node:assert/strict";
import { buildIssuerStatuses, classifySecurity } from "../api/_lib/empresas-estado.js";

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
