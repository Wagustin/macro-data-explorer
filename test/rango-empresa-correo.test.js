import test from "node:test";
import assert from "node:assert/strict";
import { rangoEmpresaCorreo, lineaRangoCorreo } from "../scripts/lib/rango-empresa-correo.js";

// ============================================================================
// Test: rangoEmpresaCorreo y lineaRangoCorreo (scripts/lib/rango-empresa-correo.js)
// Objetos escritos a mano: el rango semanal calibrado de una acción de Lima
// (data/acciones-rangos.json) traducido a la línea del correo, o el motivo
// exacto por el que no se publica.
// ============================================================================

const HOY = "2026-11-10";

// Los mismos formateadores que usa el correo (scripts/boletin.js).
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmt = (v, d = 2) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaCorta = (fecha) => {
  const d = new Date(`${String(fecha || "").slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return String(fecha || "");
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
};

// Los motivos exactos del módulo (texto que va al correo, sin comillas).
const SIN_NEGOCIAR = "Sin rango: esta acción casi no se negocia.";
const HISTORIA_CORTA = "Aún sin rango: su historia en bolsa es corta para probarlo.";
const NO_CONFIABLE = "Sin rango esta semana: en la prueba no fue lo bastante confiable y preferimos no mostrarlo.";

function semana(extra = {}) {
  return {
    h: 5,
    fecha_objetivo: "2026-11-17",
    publicable: true,
    motivo: null,
    p10: 13,
    p25: 13.17,
    p50: 13.24,
    p75: 13.4,
    p90: 13.65,
    ...extra,
  };
}

function valor(extra = {}) {
  return {
    grupo: "A",
    dias_12m: 244,
    ultimo_cierre: 13.24,
    ultima_negociacion: "2026-11-09",
    semana: semana(),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// rangoEmpresaCorreo: un caso por cada rama.
// ---------------------------------------------------------------------------

test("rangoEmpresaCorreo: sin valor explica que la acción casi no se negocia", () => {
  const r = rangoEmpresaCorreo(undefined, { hoy: HOY });
  assert.equal(r.forecast, null);
  assert.equal(r.motivo, SIN_NEGOCIAR);
});

test("rangoEmpresaCorreo: con rango publicable y vigente devuelve el rango de la semana", () => {
  const r = rangoEmpresaCorreo(valor(), { hoy: HOY });
  assert.equal(r.motivo, null);
  assert.deepEqual(r.forecast, {
    p10: 13, p25: 13.17, p50: 13.24, p75: 13.4, p90: 13.65,
    date: "2026-11-17", horizonte: "semana",
  });
  // El mismo día de la fecha objetivo el rango todavía está vigente.
  const hoyMismo = rangoEmpresaCorreo(valor({ semana: semana({ fecha_objetivo: HOY }) }), { hoy: HOY });
  assert.equal(hoyMismo.motivo, null);
  assert.ok(hoyMismo.forecast, "con fecha objetivo de hoy el rango sigue vigente");
});

test("rangoEmpresaCorreo: un rango vencido no se muestra y no explica nada", () => {
  const r = rangoEmpresaCorreo(valor({ semana: semana({ fecha_objetivo: "2026-11-09" }) }), { hoy: HOY });
  assert.equal(r.forecast, null);
  assert.equal(r.motivo, null);
});

test("rangoEmpresaCorreo: un rango con cifras no finitas no se muestra", () => {
  for (const roto of [null, undefined, NaN, Infinity, "13.24"]) {
    const r = rangoEmpresaCorreo(valor({ semana: semana({ p75: roto }) }), { hoy: HOY });
    assert.equal(r.forecast, null, `con p75 = ${String(roto)} no hay rango`);
    assert.equal(r.motivo, null, `con p75 = ${String(roto)} no hay motivo`);
  }
});

test("rangoEmpresaCorreo: con historia insuficiente explica que la prueba es corta", () => {
  const r = rangoEmpresaCorreo(
    valor({ semana: semana({ publicable: false, motivo: "historia_insuficiente", p10: null, p25: null, p50: null, p75: null, p90: null }) }),
    { hoy: HOY }
  );
  assert.equal(r.forecast, null);
  assert.equal(r.motivo, HISTORIA_CORTA);
});

test("rangoEmpresaCorreo: cualquier otro motivo no publicable dice que no fue bastante confiable", () => {
  const fuera = rangoEmpresaCorreo(
    valor({ semana: semana({ publicable: false, motivo: "cobertura_fuera_de_rango", p10: null, p25: null, p50: 4.1, p75: null, p90: null }) }),
    { hoy: HOY }
  );
  assert.equal(fuera.forecast, null);
  assert.equal(fuera.motivo, NO_CONFIABLE);

  // Sin semana (el motor no calculó nada) es también «no publicable».
  const sinSemana = rangoEmpresaCorreo({ grupo: "A", ultimo_cierre: 4.1 }, { hoy: HOY });
  assert.equal(sinSemana.forecast, null);
  assert.equal(sinSemana.motivo, NO_CONFIABLE);
});

// ---------------------------------------------------------------------------
// lineaRangoCorreo: los tres formatos de la línea.
// ---------------------------------------------------------------------------

test("lineaRangoCorreo: con el rango amplio en un solo precio dice «sin cambio»", () => {
  const fc = { p10: 2.35, p25: 2.35, p50: 2.35, p75: 2.35, p90: 2.35, date: "2026-11-17", horizonte: "semana" };
  assert.equal(lineaRangoCorreo(fc, { fmt, fechaCorta }), "Al 17 nov: 2.35 · sin cambio (8 de cada 10)");
});

test("lineaRangoCorreo: con el rango central en un solo precio lo muestra como un precio", () => {
  const fc = { p10: 2.3, p25: 2.35, p50: 2.35, p75: 2.35, p90: 2.4, date: "2026-11-17", horizonte: "semana" };
  assert.equal(
    lineaRangoCorreo(fc, { fmt, fechaCorta }),
    "Al 17 nov: 2.35 (1 de cada 2) · 2.30 – 2.40 (8 de cada 10)"
  );
});

test("lineaRangoCorreo: con dos rangos muestra el central y el amplio", () => {
  const fc = { p10: 13, p25: 13.17, p50: 13.24, p75: 13.4, p90: 13.65, date: "2026-11-17", horizonte: "semana" };
  assert.equal(
    lineaRangoCorreo(fc, { fmt, fechaCorta }),
    "Al 17 nov: 13.17 – 13.40 (1 de cada 2) · 13.00 – 13.65 (8 de cada 10)"
  );
});

// ---------------------------------------------------------------------------
// Ningún texto dice hacia dónde irá el precio ni enseña cifras inválidas.
// ---------------------------------------------------------------------------

test("rangoEmpresaCorreo y lineaRangoCorreo: ningún texto dice «subirá»/«bajará» ni trae undefined/null/NaN", () => {
  const textos = [
    rangoEmpresaCorreo(undefined, { hoy: HOY }).motivo,
    rangoEmpresaCorreo(valor({ semana: semana({ publicable: false, motivo: "historia_insuficiente" }) }), { hoy: HOY }).motivo,
    rangoEmpresaCorreo(valor({ semana: semana({ publicable: false, motivo: "cobertura_fuera_de_rango" }) }), { hoy: HOY }).motivo,
    lineaRangoCorreo({ p10: 2.35, p25: 2.35, p50: 2.35, p75: 2.35, p90: 2.35, date: "2026-11-17" }, { fmt, fechaCorta }),
    lineaRangoCorreo({ p10: 2.3, p25: 2.35, p50: 2.35, p75: 2.35, p90: 2.4, date: "2026-11-17" }, { fmt, fechaCorta }),
    lineaRangoCorreo({ p10: 13, p25: 13.17, p50: 13.24, p75: 13.4, p90: 13.65, date: "2026-11-17" }, { fmt, fechaCorta }),
  ];
  for (const texto of textos) {
    assert.ok(typeof texto === "string" && texto.length > 0, "todo texto es una cadena");
    assert.ok(!texto.includes("subirá"), `no dice «subirá»: ${texto}`);
    assert.ok(!texto.includes("bajará"), `no dice «bajará»: ${texto}`);
    assert.ok(!texto.includes("predicción"), `no dice «predicción»: ${texto}`);
    assert.ok(!texto.includes("undefined"), `no trae «undefined»: ${texto}`);
    assert.ok(!texto.includes("null"), `no trae «null»: ${texto}`);
    assert.ok(!texto.includes("NaN"), `no trae «NaN»: ${texto}`);
  }
});
