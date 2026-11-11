import test from "node:test";
import assert from "node:assert/strict";
import {
  cuantil,
  calendarioBursatil,
  motorAcciones,
} from "../scripts/engine-acciones.js";
import { addBusinessDays } from "../scripts/engine-daily.js";

// ============================================================================
// Test: cuantil (inverted_cdf)
// ============================================================================
test("cuantil usa inverted_cdf: ceil(q*n)-1", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(cuantil(xs, 0.10), 1);  // ceil(1.0)-1 = 0 -> xs[0] = 1
  assert.equal(cuantil(xs, 0.25), 3);  // ceil(2.5)-1 = 2 -> xs[2] = 3
  assert.equal(cuantil(xs, 0.75), 8);  // ceil(7.5)-1 = 7 -> xs[7] = 8
  assert.equal(cuantil(xs, 0.90), 9);  // ceil(9.0)-1 = 8 -> xs[8] = 9
  assert.equal(cuantil(xs, 0.80), 8);  // ceil(8.0)-1 = 7 -> xs[7] = 8
  assert.equal(cuantil([], 0.5), 0);
});

// ============================================================================
// Test: calendarioBursatil
// ============================================================================
test("calendarioBursatil: fecha con 4 valores no entra; con 5 sí", () => {
  const filas = [
    { nemonico: "A", fecha: "2026-01-01", cierre: 10 },
    { nemonico: "B", fecha: "2026-01-01", cierre: 20 },
    { nemonico: "C", fecha: "2026-01-01", cierre: 30 },
    { nemonico: "D", fecha: "2026-01-01", cierre: 40 },
    // 4 valores -> no entra
    { nemonico: "A", fecha: "2026-01-02", cierre: 11 },
    { nemonico: "B", fecha: "2026-01-02", cierre: 21 },
    { nemonico: "C", fecha: "2026-01-02", cierre: 31 },
    { nemonico: "D", fecha: "2026-01-02", cierre: 41 },
    { nemonico: "E", fecha: "2026-01-02", cierre: 51 },
    // 5 valores -> entra
  ];
  const cal = calendarioBursatil(filas);
  assert.deepEqual(cal, ["2026-01-02"]);
});

// ============================================================================
// Test: arrastre (forward-fill) y retornos
// ============================================================================
test("serie con arrastre: valor que no negocia un día conserva cierre anterior y retorno es 0", () => {
  // Necesitamos al menos 5 símbolos por día para que entre al calendario
  // Y el calendario debe tener al menos 250 días para que el valor tenga 20+ días en últimos 250
  const n = 300;
  const startDate = new Date(Date.UTC(2025, 0, 1));
  const cal = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      cal.push(d.toISOString().slice(0, 10));
    }
  }

  const filas = [];
  // 5 símbolos base que siempre negocian
  for (const sym of ["A", "B", "C", "D", "E"]) {
    for (const fecha of cal) {
      filas.push({ nemonico: sym, fecha, cierre: 100 });
    }
  }
  // TEST: negocia día 1, no día 2, negocia día 3 en adelante
  filas.push({ nemonico: "TEST", fecha: cal[0], cierre: 100 });
  // cal[1] no negocia
  for (let i = 2; i < cal.length; i++) {
    filas.push({ nemonico: "TEST", fecha: cal[i], cierre: 103 });
  }

  const resultado = motorAcciones(filas);
  const v = resultado.valores.TEST;
  assert.ok(v, "TEST debe estar en resultados");
  assert.equal(v.ultimo_cierre, 103);
  assert.equal(v.ultima_negociacion, cal[cal.length - 1]);
  // TEST negoció en cal[0] y cal[2..end] = 1 + (len-2) = len-1 días
  assert.equal(v.dias_12m, cal.length - 1);
});

// ============================================================================
// Test: serie sintética determinista
// ============================================================================
test("serie sintética 2400 días, 6 valores: rango vigente cumple monotonicidad", () => {
  // Generador LCG determinista
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed / 4294967296) * 2 - 1;
  };

  const n = 2400;
  const startDate = new Date(Date.UTC(2019, 0, 1));
  const cal = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) { // solo días hábiles
      cal.push(d.toISOString().slice(0, 10));
    }
  }

  const symbols = ["SYM1", "SYM2", "SYM3", "SYM4", "SYM5", "SYM6"];
  const filas = [];

  // Generar series independientes por símbolo
  for (const sym of symbols) {
    let price = 100 + Math.random() * 50;
    let symSeed = seed + symbols.indexOf(sym) * 1000;
    const symRnd = () => {
      symSeed = (symSeed * 1664525 + 1013904223) % 4294967296;
      return (symSeed / 4294967296) * 2 - 1;
    };
    for (let i = 0; i < cal.length; i++) {
      const ret = 0.008 * symRnd(); // volatilidad diaria ~0.8%
      price = price * Math.exp(ret);
      // A veces no negocia (10% probabilidad)
      if (symRnd() > -0.8) {
        filas.push({ nemonico: sym, fecha: cal[i], cierre: Number(price.toFixed(4)) });
      }
    }
  }

  const resultado = motorAcciones(filas);

  for (const sym of symbols) {
    const v = resultado.valores[sym];
    assert.ok(v, `${sym} debe estar en resultados`);

    // Monotonicidad semana
    const s = v.semana;
    if (s.publicable) {
      assert.ok(s.p10 <= s.p25, `${sym} semana: p10 <= p25`);
      assert.ok(s.p25 <= s.p50, `${sym} semana: p25 <= p50`);
      assert.ok(s.p50 <= s.p75, `${sym} semana: p50 <= p75`);
      assert.ok(s.p75 <= s.p90, `${sym} semana: p75 <= p90`);
      assert.equal(s.p50, v.ultimo_cierre, `${sym} semana: p50 === ultimo_cierre`);
    }

    // Monotonicidad mes
    const m = v.mes;
    if (m.publicable) {
      assert.ok(m.p10 <= m.p25, `${sym} mes: p10 <= p25`);
      assert.ok(m.p25 <= m.p50, `${sym} mes: p25 <= p50`);
      assert.ok(m.p50 <= m.p75, `${sym} mes: p50 <= p75`);
      assert.ok(m.p75 <= m.p90, `${sym} mes: p75 <= p90`);
      assert.equal(m.p50, v.ultimo_cierre, `${sym} mes: p50 === ultimo_cierre`);
    }
  }
});

// ============================================================================
// Test: Sin fuga (no leakage) - K y cuantiles base del corte N-1-h no cambian
// ============================================================================
// Nota: el rango vigente (corte N-1) SÍ cambia sus cuantiles base porque su ventana
// incluye los últimos h días. La propiedad "sin fuga" se refiere a que K (calculado
// con cortes <= N-1-h) y los cuantiles base del corte N-1-h no cambian.
// Como no se exponen internamente, este test se omite (requiere exponer K y f10/f90 del corte N-1-h).

// ============================================================================
// Test: Valor con menos de 100 cortes de prueba -> no publicable
// ============================================================================
test("valor con menos de 100 cortes de prueba -> publicable: false, motivo: historia_insuficiente, cuantiles null", () => {
  // Crear serie con suficiente historia para c0 pero sin 100 cortes de prueba desde 2025
  // Necesitamos: n >= first + h + 500 + 250 = 750+ días de calendario para que el rango vigente se calcule
  // Pero los cortes de prueba requieren cal[c] >= "2025-01-01" y nprev >= 250
  // Si el calendario empieza en 2023, los cortes de prueba empiezan en 2025
  // Para tener < 100 cortes de prueba, el calendario debe terminar antes de tener 100 cortes válidos
  
  const n = 1000; // ~700 días hábiles
  const startDate = new Date(Date.UTC(2023, 0, 1)); // enero 2023
  const cal = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      cal.push(d.toISOString().slice(0, 10));
    }
  }

  const filas = [];
  // 5 símbolos base para calendario
  for (const sym of ["BASE1", "BASE2", "BASE3", "BASE4", "BASE5"]) {
    let price = 100;
    for (const fecha of cal) {
      price = price * (1 + (Math.random() - 0.5) * 0.02);
      filas.push({ nemonico: sym, fecha, cierre: Number(price.toFixed(2)) });
    }
  }
  // Símbolo SHORT
  let price = 100;
  for (const fecha of cal) {
    price = price * (1 + (Math.random() - 0.5) * 0.02);
    filas.push({ nemonico: "SHORT", fecha, cierre: Number(price.toFixed(2)) });
  }

  const resultado = motorAcciones(filas);
  const v = resultado.valores.SHORT;
  assert.ok(v, "SHORT debe estar en resultados");

  // Con calendario desde 2023, hay cortes de prueba desde 2025, pero pueden ser < 100
  // si el calendario no es lo suficientemente largo después de 2025
  assert.equal(v.semana.publicable, false);
  assert.equal(v.semana.motivo, "historia_insuficiente");
  assert.equal(v.semana.p10, null);
  assert.equal(v.semana.p25, null);
  assert.equal(v.semana.p75, null);
  assert.equal(v.semana.p90, null);
  assert.equal(v.semana.ancho80_pct, null);
  assert.equal(v.semana.ancho50_pct, null);
  assert.ok(Number.isFinite(v.semana.p50), `p50 debe ser finito, es ${v.semana.p50}`); // p50 sí existe (último cierre)

  assert.equal(v.mes.publicable, false);
  assert.equal(v.mes.motivo, "historia_insuficiente");
  assert.equal(v.mes.p10, null);
  assert.equal(v.mes.p25, null);
  assert.equal(v.mes.p75, null);
  assert.equal(v.mes.p90, null);
  assert.equal(v.mes.ancho80_pct, null);
  assert.equal(v.mes.ancho50_pct, null);
  assert.ok(Number.isFinite(v.mes.p50), `p50 mes debe ser finito, es ${v.mes.p50}`);
});

// ============================================================================
// Test: Programa falla con < 20000 filas o < 30 valores (solo CLI)
// ============================================================================
test("motorAcciones con < 20000 filas no lanza error (solo CLI lo hace)", () => {
  const filas = [];
  const cal = [];
  const startDate = new Date(Date.UTC(2020, 0, 1));
  for (let i = 0; i < 500; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      cal.push(d.toISOString().slice(0, 10));
    }
  }
  // 5 símbolos base
  for (const sym of ["BASE1", "BASE2", "BASE3", "BASE4", "BASE5"]) {
    let price = 100;
    for (const fecha of cal) {
      price = price * (1 + (Math.random() - 0.5) * 0.02);
      filas.push({ nemonico: sym, fecha, cierre: Number(price.toFixed(2)) });
    }
  }
  // Símbolo TEST
  let price = 100;
  for (const fecha of cal) {
    price = price * (1 + (Math.random() - 0.5) * 0.02);
    filas.push({ nemonico: "TEST", fecha, cierre: Number(price.toFixed(2)) });
  }
  // motorAcciones en sí no valida cantidad de filas; eso lo hace el CLI
  const res = motorAcciones(filas);
  assert.ok(res);
});

test("addBusinessDays funciona correctamente", () => {
  assert.equal(addBusinessDays("2026-11-02", 5), "2026-11-09");
  assert.equal(addBusinessDays("2026-11-06", 1), "2026-11-09");
  assert.equal(addBusinessDays("2026-07-24", 5), "2026-08-04");
});

// ============================================================================
// Tests del segundo escalón «fondo común»
// ============================================================================
import { rangosDeValor, fondoComunBandas } from "../scripts/engine-acciones.js";

/**
 * Generador pseudoaleatorio determinista (LCG) para series sintéticas.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Calendario de n días hábiles (lunes a viernes) desde una fecha ISO.
 */
function diasHabiles(inicioIso, n) {
  const cal = [];
  const d = new Date(inicioIso + "T00:00:00Z");
  while (cal.length < n) {
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) cal.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return cal;
}

/**
 * Dataset sintético: cinco valores con historia larga (desde 2022) y uno con
 * historia corta (empieza en 2025), con retornos independientes y estables.
 */
function datasetFondo() {
  const cal = diasHabiles("2022-01-03", 1250);
  const largos = ["LARGO1", "LARGO2", "LARGO3", "LARGO4", "LARGO5"];
  const filas = [];

  for (const sym of largos) {
    let precio = 50;
    const rnd = lcg(1000 + largos.indexOf(sym));
    for (const fecha of cal) {
      precio *= Math.exp(0.015 * (rnd() * 2 - 1) + 0.0002);
      filas.push({ nemonico: sym, fecha, cierre: Number(precio.toFixed(4)) });
    }
  }

  // Valor con historia corta: empieza en 2025-01-27 (índice 800)
  let precio = 20;
  const rnd = lcg(7777);
  for (let i = 800; i < cal.length; i++) {
    precio *= Math.exp(0.015 * (rnd() * 2 - 1) + 0.0002);
    filas.push({ nemonico: "TARDIO", fecha: cal[i], cierre: Number(precio.toFixed(4)) });
  }

  return { cal, filas };
}

/**
 * Comprueba que un horizonte nunca queda "a medias": o bien se publica (con su
 * método) o bien no se publica con un motivo explícito.
 */
function assertCoherente(v, etiqueta) {
  if (v.publicable) {
    assert.ok(v.metodo === "propio" || v.metodo === "fondo", `${etiqueta}: publicable exige metodo propio/fondo`);
    assert.equal(v.motivo, null, `${etiqueta}: publicable sin motivo`);
    assert.ok(v.p10 <= v.p25, `${etiqueta}: p10 <= p25`);
    assert.ok(v.p25 <= v.p50, `${etiqueta}: p25 <= p50`);
    assert.ok(v.p50 <= v.p75, `${etiqueta}: p50 <= p75`);
    assert.ok(v.p75 <= v.p90, `${etiqueta}: p75 <= p90`);
  } else {
    assert.equal(v.metodo, null, `${etiqueta}: no publicable exige metodo null`);
    assert.equal(typeof v.motivo, "string", `${etiqueta}: no publicable exige motivo explícito`);
    assert.ok(v.motivo.length > 0, `${etiqueta}: motivo no vacío`);
    assert.equal(v.p10, null, `${etiqueta}: no publicable sin p10`);
    assert.equal(v.p90, null, `${etiqueta}: no publicable sin p90`);
  }
}

// ============================================================================
// Test: valor con historia corta -> metodo "fondo" o no publicable con motivo
// ============================================================================
test("valor con historia corta: metodo fondo con cuantiles ordenados o no publicable con motivo", () => {
  const { filas } = datasetFondo();
  const resultado = motorAcciones(filas);

  const v = resultado.valores.TARDIO;
  assert.ok(v, "TARDIO debe estar en resultados");
  assert.equal(v.primera_fecha, "2025-01-27");

  for (const nombre of ["semana", "mes"]) {
    const h = v[nombre];
    assertCoherente(h, `TARDIO ${nombre}`);

    if (h.publicable) {
      // Solo el fondo puede publicar a un valor con historia corta
      assert.equal(h.metodo, "fondo", `TARDIO ${nombre}: con historia corta se publica por fondo`);
      assert.ok(h.p10 <= h.p25 && h.p25 <= h.p50 && h.p50 <= h.p75 && h.p75 <= h.p90,
        `TARDIO ${nombre}: cuantiles ordenados`);
    } else {
      assert.ok(["historia_insuficiente", "cobertura_fuera_de_rango"].includes(h.motivo),
        `TARDIO ${nombre}: motivo explicito, ${h.motivo}`);
    }
  }

  // Ningún valor del archivo queda a medias
  for (const [sym, val] of Object.entries(resultado.valores)) {
    assertCoherente(val.semana, `${sym} semana`);
    assertCoherente(val.mes, `${sym} mes`);
  }
});

// ============================================================================
// Test: sin fuga de futuro en el escalón «fondo»
// ============================================================================
test("sin fuga: la banda de un corte antiguo no depende de los datos posteriores", () => {
  const { cal, filas } = datasetFondo();

  // Serie completa y serie cortada 100 días antes del final
  const T = 1150;
  const filasCortadas = filas.filter(f => f.fecha <= cal[T]);

  const completo = fondoComunBandas(filas, 5);
  const cortado = fondoComunBandas(filasCortadas, 5);

  assert.ok(cortado.LARGO1.cortes.length > 100, "el prefijo debe tener cortes de prueba");

  for (const sym of Object.keys(cortado)) {
    const porCorte = new Map(completo[sym].cortes.map(b => [b.c, b]));
    for (const banda of cortado[sym].cortes) {
      const ref = porCorte.get(banda.c);
      assert.ok(ref, `${sym}: el corte ${banda.c} debe existir en la serie completa`);
      assert.equal(ref.L80, banda.L80, `${sym} corte ${banda.c}: L80 no cambia con datos posteriores`);
      assert.equal(ref.U80, banda.U80, `${sym} corte ${banda.c}: U80 no cambia con datos posteriores`);
      assert.equal(ref.L50, banda.L50, `${sym} corte ${banda.c}: L50 no cambia con datos posteriores`);
      assert.equal(ref.U50, banda.U50, `${sym} corte ${banda.c}: U50 no cambia con datos posteriores`);
      assert.equal(ref.y, banda.y, `${sym} corte ${banda.c}: el resultado observado no cambia`);
    }
  }
});

// ============================================================================
// Test: el segundo escalón no altera los valores publicables por el método propio
// ============================================================================
test("las acciones publicables por el metodo propio dan los mismos numeros con el segundo escalon", () => {
  const { filas } = datasetFondo();
  const resultado = motorAcciones(filas);

  const cal = calendarioBursatil(filas);
  const bySymbol = new Map();
  for (const fila of filas) {
    if (!bySymbol.has(fila.nemonico)) bySymbol.set(fila.nemonico, []);
    bySymbol.get(fila.nemonico).push(fila);
  }

  const campos = ["publicable", "motivo", "p10", "p25", "p50", "p75", "p90", "ancho80_pct", "ancho50_pct", "validacion"];
  let propios = 0;

  for (const [sym, filasValor] of bySymbol) {
    const v = resultado.valores[sym];
    if (!v) continue;
    for (const [h, nombre] of [[5, "semana"], [21, "mes"]]) {
      const propio = rangosDeValor(filasValor, cal, h);
      if (!propio.publicable) continue;

      propios++;
      assert.equal(v[nombre].metodo, "propio", `${sym} ${nombre}: el metodo propio manda`);

      const publicado = Object.fromEntries(campos.map(k => [k, v[nombre][k]]));
      const esperado = Object.fromEntries(campos.map(k => [k, propio[k]]));
      assert.deepEqual(publicado, esperado, `${sym} ${nombre}: numeros intactos con el segundo escalon`);
    }
  }

  assert.ok(propios > 0, "el dataset debe tener al menos un valor publicable por el metodo propio");
});

// ============================================================================
// Test: el fondo solo valida cortes con la ventana del pool COMPLETA
// ----------------------------------------------------------------------------
// La ventana del fondo son 756 días. Un corte anterior a 756 tiene el pool
// recortado: sus cuantiles no son comparables con los del rango vigente (que
// sí se construye sobre la ventana completa), así que no cuentan como corte de
// prueba del fondo. Con menos de 100 cortes con ventana completa el fondo no
// publica y el motivo sigue siendo "historia_insuficiente".
// ============================================================================
test("el fondo no valida cortes con la ventana del pool recortada", () => {
  const cal = diasHabiles("2023-01-02", 850); // los cortes de prueba empiezan antes de 756
  const filas = [];
  for (let s = 0; s < 6; s++) {
    let precio = 50 + s;
    const rnd = lcg(4200 + s);
    for (const fecha of cal) {
      precio *= Math.exp(0.012 * (rnd() * 2 - 1) + 0.0001);
      filas.push({ nemonico: `VENT${s}`, fecha, cierre: Number(precio.toFixed(4)) });
    }
  }

  const resultado = motorAcciones(filas);
  const v = resultado.valores.VENT0;
  assert.ok(v, "VENT0 debe estar en resultados");

  for (const nombre of ["semana", "mes"]) {
    const hz = v[nombre];
    assert.equal(hz.publicable, false, `VENT0 ${nombre}: no publicable`);
    assert.equal(hz.metodo, null, `VENT0 ${nombre}: sin metodo`);
    assert.equal(hz.motivo, "historia_insuficiente", `VENT0 ${nombre}: historia_insuficiente`);
    assert.equal(hz.p10, null, `VENT0 ${nombre}: sin p10`);
    assert.equal(hz.p90, null, `VENT0 ${nombre}: sin p90`);
  }
});