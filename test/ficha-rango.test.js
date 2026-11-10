import test from "node:test";
import assert from "node:assert/strict";
import { bloqueRango } from "../scripts/ficha-rango.js";

// ============================================================================
// Test: bloqueRango (scripts/ficha-rango.js)
// Objetos escritos a mano: el bloque de la ficha con el rango de la semana y del mes,
// o el motivo exacto por el que no se publica.
// ============================================================================

const HOY = "2026-11-10";
const ULTIMO_DIA = "2026-11-09";

function horizonte(extra = {}) {
  return {
    fecha_objetivo: "2026-11-16",
    publicable: true,
    motivo: null,
    p10: 12.99,
    p25: 13.17,
    p50: 13.24,
    p75: 13.4,
    p90: 13.65,
    validacion: { cortes: 439, cobertura80: 82.46 },
    ...extra,
  };
}

function valor(extra = {}) {
  return {
    dias_12m: 245,
    ultimo_cierre: 13.24,
    ultima_negociacion: "2026-11-09",
    semana: horizonte(),
    mes: horizonte({ fecha_objetivo: "2026-12-10", p25: 13.13, p75: 13.81, p10: 12.78, p90: 14.29 }),
    ...extra,
  };
}

test("bloqueRango: sin valor explica que no hay base para calcularlo", () => {
  const html = bloqueRango(undefined, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes("Rango esperado de PerData Engine"));
  assert.ok(
    html.includes(
      "Sin rango: esta acción casi no se negocia (menos de 20 días con operaciones en los últimos 12 meses), así que no hay base para calcularlo."
    )
  );
});

test("bloqueRango: con ultimoDia viejo no devuelve nada", () => {
  const html = bloqueRango(valor(), { moneda: "S/", hoy: "2026-11-20", ultimoDia: ULTIMO_DIA });
  assert.equal(html, "");
  // Con 7 días de diferencia todavía se muestra
  const vigente = bloqueRango(valor(), { moneda: "S/", hoy: "2026-11-16", ultimoDia: ULTIMO_DIA });
  assert.notEqual(vigente, "");
});

test("bloqueRango: muestra el rango central antes que el amplio", () => {
  const html = bloqueRango(valor(), { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes("Esta semana, al lun 16 nov"));
  assert.ok(html.includes("Este mes, al jue 10 dic"));
  assert.ok(html.includes('<span class="mono">S/ 13.17 – 13.40</span>'));
  assert.ok(html.includes('<span class="mono">S/ 12.99 – 13.65</span>'));
  assert.ok(html.includes("la mitad de las veces"));
  assert.ok(html.includes("8 de cada 10 veces"));
  assert.ok(html.indexOf("13.17") < html.indexOf("12.99"), "el rango central va antes del amplio");
  assert.ok(html.indexOf("13.13") < html.indexOf("12.78"), "el rango central del mes va antes del amplio");
});

test("bloqueRango: pie con la cobertura de la prueba y el aviso final", () => {
  const html = bloqueRango(valor(), { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes("En la prueba de 2025-2026 el rango amplio de la semana contuvo el precio 82 de cada 100 veces (439 días de prueba)."));
  assert.ok(html.includes("Es un rango estadístico, no una recomendación de compra o venta."));
});

test("bloqueRango: historia insuficiente explica que la prueba es corta", () => {
  const conFecha = valor({
    primera_fecha: "2024-03-04",
    semana: horizonte({ publicable: false, motivo: "historia_insuficiente" }),
  });
  const html = bloqueRango(conFecha, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes("Aún sin rango: cotiza desde marzo de 2024 y la prueba todavía es corta."));
  assert.ok(html.includes("Se publicará cuando haya al menos 100 semanas de prueba."));

  const sinFecha = valor({
    semana: horizonte({ publicable: false, motivo: "historia_insuficiente" }),
  });
  const html2 = bloqueRango(sinFecha, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html2.includes("Aún sin rango: la prueba todavía es corta."));
  assert.ok(!html2.includes("cotiza desde"));
});

test("bloqueRango: cobertura fuera de rango muestra los aciertos", () => {
  const v = valor({
    semana: horizonte({ publicable: false, motivo: "cobertura_fuera_de_rango" }),
    mes: horizonte({ publicable: false, motivo: "cobertura_fuera_de_rango", validacion: { cortes: 423, cobertura80: 68.79 } }),
  });
  const html = bloqueRango(v, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes("Sin rango publicado: en la prueba acertó 82 de cada 100 veces y exigimos entre 74 y 86, así que preferimos no mostrarlo."));
  assert.ok(html.includes("acertó 69 de cada 100 veces"));
  assert.ok(!html.includes("rango amplio de la semana contuvo"), "sin rango publicable no hay pie de cobertura");
  assert.ok(html.includes("Es un rango estadístico, no una recomendación de compra o venta."));
});

test("bloqueRango: cualquier otro motivo dice que no hay rango por ahora", () => {
  const v = valor({ semana: horizonte({ publicable: false, motivo: "sin_datos" }) });
  const html = bloqueRango(v, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes("Sin rango por ahora."));
});

test("bloqueRango: no escribe fechas ISO, ni «subirá» o «bajará», ni undefined/null/NaN", () => {
  const v = valor({
    primera_fecha: "2024-03-04",
    semana: horizonte(),
    mes: horizonte({ publicable: false, motivo: "cobertura_fuera_de_rango" }),
  });
  const html = bloqueRango(v, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html), "no debe haber fechas ISO visibles");
  assert.ok(!html.includes("subirá"));
  assert.ok(!html.includes("bajará"));
  assert.ok(!html.includes("predicción"));
  assert.ok(!html.includes("pronóstico garantizado"));
  assert.ok(!html.includes("undefined"));
  assert.ok(!html.includes("null"));
  assert.ok(!html.includes("NaN"));
});

test("bloqueRango: escapa el texto que viene del JSON", () => {
  const ENT = String.fromCharCode(38); // ampersand de las entidades HTML
  const v = valor({ semana: horizonte() });
  const html = bloqueRango(v, { moneda: 'S/<script>alert("x")</script>', hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes(`${ENT}lt;script${ENT}gt;`), "la etiqueta del JSON tiene que llegar escapada");

  const conFecha = valor({
    primera_fecha: '2024-03-04" onmouseover="x',
    semana: horizonte({ publicable: false, motivo: "historia_insuficiente" }),
  });
  const html2 = bloqueRango(conFecha, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(!html2.includes("onmouseover"));
});

test("bloqueRango: metodo «fondo» añade cómo se calculó el rango", () => {
  const propio = bloqueRango(valor(), { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(!propio.includes("Calculado con el comportamiento conjunto"));

  const fondo = bloqueRango(
    valor({ semana: horizonte({ metodo: "fondo" }) }),
    { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA }
  );
  assert.ok(fondo.includes("Calculado con el comportamiento conjunto de las acciones de la Bolsa de Lima, ajustado a esta acción."));
  assert.ok(fondo.trim().endsWith("Es un rango estadístico, no una recomendación de compra o venta.</p>"));
});

test("bloqueRango: precios con dos decimales si son 1 o más y cuatro si son menores", () => {
  const v = valor({
    semana: horizonte({ p10: 0.3278, p25: 0.3394, p75: 0.35, p90: 0.3684 }),
  });
  const html = bloqueRango(v, { moneda: "S/", hoy: HOY, ultimoDia: ULTIMO_DIA });
  assert.ok(html.includes('<span class="mono">S/ 0.3394 – 0.3500</span>'));
  assert.ok(html.includes('<span class="mono">S/ 0.3278 – 0.3684</span>'));
  assert.ok(html.includes('<span class="mono">S/ 13.13 – 13.81</span>'));
});
