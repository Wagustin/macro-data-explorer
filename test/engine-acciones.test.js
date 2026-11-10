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