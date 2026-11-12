// PerData Engine Acciones - Rangos semanales y mensuales para acciones de la BVL
// Metodología: FHS diaria con EWMA λ=0.97 y calibración expansiva; validación 2025-2026 fuera de muestra

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { addBusinessDays } from "./engine-daily.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "data", "acciones-rangos.json");

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Cuantil empírico "inverted_cdf" (numpy): xs ordenado ascendente,
 * devuelve xs[ceil(q * n) - 1] con índice mínimo 0.
 */
export function cuantil(xs, q) {
  if (!xs || xs.length === 0) return 0;
  const n = xs.length;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
  return xs[idx];
}

/**
 * Clampa un valor entre min y max.
 */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Calcula el calendario bursátil: fechas ordenadas donde cotizaron >= 5 valores distintos.
 * Entrada: filas { nemonico, fecha, cierre } con cierre > 0.
 */
export function calendarioBursatil(filas) {
  const counts = new Map();
  for (const { nemonico, fecha, cierre } of filas) {
    if (cierre > 0) {
      const set = counts.get(fecha);
      if (!set) {
        counts.set(fecha, new Set([nemonico]));
      } else {
        set.add(nemonico);
      }
    }
  }
  const cal = [];
  for (const [fecha, set] of counts) {
    if (set.size >= 5) cal.push(fecha);
  }
  cal.sort();
  return cal;
}

/**
 * Construye la serie con arrastre (forward-fill) para un valor en el calendario.
 * Devuelve { p: Float64Array, first: number, lp: Float64Array }
 * p[i] = cierre en cal[i] (arrastrado), first = índice de primera negociación real.
 */
function serieConArraste(filasValor, cal) {
  const n = cal.length;
  const p = new Float64Array(n);
  const calIndex = new Map(cal.map((d, i) => [d, i]));
  let first = -1;
  let lastClose = NaN;

  // Mapa de cierres reales por fecha
  const reales = new Map();
  for (const { fecha, cierre } of filasValor) {
    if (cierre > 0) reales.set(fecha, cierre);
  }

  for (let i = 0; i < n; i++) {
    const fecha = cal[i];
    const cierre = reales.get(fecha);
    if (cierre !== undefined) {
      lastClose = cierre;
      if (first === -1) first = i;
    }
    p[i] = lastClose;
  }

  const lp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lp[i] = Math.log(Math.max(1e-8, p[i]));
  }

  return { p, first, lp };
}

/**
 * Calcula volatilidad EWMA λ=0.97 para una serie.
 * s2[first] = max(1e-8, media(u[first+1 .. first+30]^2)) (los que existan)
 * s2[i] = 0.97*s2[i-1] + 0.03*u[i]^2
 * sig[i] = sqrt(max(s2[i], 1e-8))
 */
function ewmaVolatility(lp, first) {
  const n = lp.length;
  const u = new Float64Array(n);
  for (let i = first + 1; i < n; i++) {
    u[i] = lp[i] - lp[i - 1];
  }

  const s2 = new Float64Array(n);
  const sig = new Float64Array(n);

  // Inicialización: media de u^2 en [first+1 .. first+30]
  let sumSq = 0;
  let count = 0;
  const endInit = Math.min(first + 30, n - 1);
  for (let i = first + 1; i <= endInit; i++) {
    sumSq += u[i] * u[i];
    count++;
  }
  s2[first] = Math.max(1e-8, count > 0 ? sumSq / count : 1e-8);
  sig[first] = Math.sqrt(s2[first]);

  // Rellenar antes de first con el mismo valor
  for (let i = 0; i < first; i++) {
    s2[i] = s2[first];
    sig[i] = sig[first];
  }

  // EWMA hacia adelante
  for (let i = first + 1; i < n; i++) {
    s2[i] = 0.97 * s2[i - 1] + 0.03 * (u[i] * u[i]);
    sig[i] = Math.sqrt(Math.max(1e-8, s2[i]));
  }

  return { u, s2, sig };
}

/**
 * Calcula retornos a h días: rh[i] = lp[i] - lp[i-h] para i >= first + h.
 */
function retornosH(lp, first, h) {
  const n = lp.length;
  const rh = new Float64Array(n);
  for (let i = first + h; i < n; i++) {
    rh[i] = lp[i] - lp[i - h];
  }
  return rh;
}

/**
 * Crea resultado para valor no publicable con estructura completa.
 */
function resultadoNoPublicable(motivo, validacion, base = null) {
  const fmt = (v) => v !== null && v < 1 ? Number(v.toFixed(4)) : (v !== null ? Number(v.toFixed(2)) : null);
  return {
    publicable: false,
    motivo,
    p10: null,
    p25: null,
    p50: base !== null ? fmt(base) : null,
    p75: null,
    p90: null,
    ancho80_pct: null,
    ancho50_pct: null,
    validacion,
  };
}

/**
 * Calcula los rangos para un valor en un horizonte h.
 * Devuelve { publicable, motivo, p10, p25, p50, p75, p90, ancho80_pct, ancho50_pct, validacion }
 */
export function rangosDeValor(filasValor, cal, h) {
  const n = cal.length;
  const { p, first, lp } = serieConArraste(filasValor, cal);

  // Validación por defecto (ceros) para retornos tempranos
  const validacionVacia = {
    cortes: 0,
    cobertura80: 0,
    cobertura50: 0,
    ancho80_mediano_pct: 0,
    ancho50_mediano_pct: 0,
    score80: 0,
    score80_referencia: 0,
    cobertura80_referencia: 0,
    sin_operar_pct: 0,
  };

  if (first === -1) {
    return resultadoNoPublicable("sin_datos", validacionVacia);
  }

  const { sig } = ewmaVolatility(lp, first);
  const rh = retornosH(lp, first, h);

  // --- Preparar necesidades por corte ---
  const c0 = first + h + 500;
  if (c0 >= n) {
    return resultadoNoPublicable("historia_insuficiente", validacionVacia);
  }

  // Arrays para almacenar necesidades y cuantiles base por corte
  const necesidades80 = new Float64Array(n);
  const necesidades50 = new Float64Array(n);
  const f10_arr = new Float64Array(n);
  const f25_arr = new Float64Array(n);
  const f75_arr = new Float64Array(n);
  const f90_arr = new Float64Array(n);
  const rh_real = new Float64Array(n); // y = lp[c+h] - lp[c] para cortes válidos

  // Calcular cuantiles base y necesidades para cada corte c >= c0
  for (let c = c0; c < n; c++) {
    // Ventana win = [max(first+h, c-756) .. c] inclusive
    const winStart = Math.max(first + h, c - 756);
    const winEnd = c;
    const winLen = winEnd - winStart + 1;
    if (winLen < 2) continue;

    const sc = new Float64Array(winLen);
    let idx = 0;
    const sig_c = sig[c];

    for (let tau = winStart; tau <= winEnd; tau++) {
      const sig_tau = sig[tau];
      if (sig_tau <= 0) continue;
      const ratio = clamp(sig_c / sig_tau, 0.2, 5);
      const r = rh[tau];
      if (Number.isFinite(r)) {
        sc[idx++] = r * ratio;
      }
    }

    if (idx < 4) continue; // necesitamos al menos 4 puntos para cuantiles

    const scValid = sc.subarray(0, idx);
    scValid.sort((a, b) => a - b);

    const f10 = cuantil(scValid, 0.10);
    const f25 = cuantil(scValid, 0.25);
    const f75 = cuantil(scValid, 0.75);
    const f90 = cuantil(scValid, 0.90);

    f10_arr[c] = f10;
    f25_arr[c] = f25;
    f75_arr[c] = f75;
    f90_arr[c] = f90;

    // Retorno real futuro para este corte (necesario para necesidad)
    if (c + h < n) {
      const y = lp[c + h] - lp[c];
      rh_real[c] = y;

      // Necesidad n80
      let n80;
      if (y >= 0) {
        n80 = f90 > 0 ? y / f90 : 1;
      } else {
        n80 = f10 < 0 ? y / f10 : 1;
      }
      necesidades80[c] = Math.max(0, n80);

      // Necesidad n50
      let n50;
      if (y >= 0) {
        n50 = f75 > 0 ? y / f75 : 1;
      } else {
        n50 = f25 < 0 ? y / f25 : 1;
      }
      necesidades50[c] = Math.max(0, n50);
    }
  }

  // --- Validación fuera de muestra (cortes con cal[c] >= "2025-01-01", c+h <= N-1, nprev >= 250) ---
  const testCuts = [];
  for (let c = c0; c < n; c++) {
    if (cal[c] >= "2025-01-01" && c + h < n) {
      const nprev = c - h - c0 + 1;
      if (nprev >= 250) {
        testCuts.push(c);
      }
    }
  }

  // Métricas de validación
  let cobertura80 = 0;
  let cobertura50 = 0;
  const anchos80 = [];
  const anchos50 = [];
  let score80_sum = 0;
  let score80_ref_sum = 0;
  let cobertura80_ref = 0;
  let sinOperar = 0;

  // Para referencia (caminata aleatoria): cuantiles de TODOS los rh[first+h .. c] sin escalar y sin K
  for (const c of testCuts) {
    const y = rh_real[c];
    const base = p[c];
    const nprev = c - h - c0 + 1;

    // K expansivo sin fuga: solo necesidades de cortes <= c - h
    const maxIdx = c - h;
    const needs80Slice = necesidades80.subarray(c0, maxIdx + 1);
    const needs50Slice = necesidades50.subarray(c0, maxIdx + 1);

    const needs80Sorted = Array.from(needs80Slice).sort((a, b) => a - b);
    const needs50Sorted = Array.from(needs50Slice).sort((a, b) => a - b);

    const K80 = cuantil(needs80Sorted, 0.80);
    const K50 = cuantil(needs50Sorted, 0.50);

    // Banda en retorno logarítmico
    const L80 = K80 * f10_arr[c];
    const U80 = K80 * f90_arr[c];
    const L50 = K50 * f25_arr[c];
    const U50 = K50 * f75_arr[c];

    // En precio
    const p10 = base * Math.exp(L80);
    const p90 = base * Math.exp(U80);
    const p25 = base * Math.exp(L50);
    const p75 = base * Math.exp(U50);

    // Coberturas
    const actualPrice = p[c + h];
    if (actualPrice >= p10 && actualPrice <= p90) cobertura80++;
    if (actualPrice >= p25 && actualPrice <= p75) cobertura50++;

    // Anchos
    anchos80.push(100 * (Math.exp(U80) - Math.exp(L80)));
    anchos50.push(100 * (Math.exp(U50) - Math.exp(L50)));

    // Score80 = media de (U-L) + 10*max(0, L-y) + 10*max(0, y-U)
    const width = U80 - L80;
    const penaltyLow = Math.max(0, L80 - y) * 10;
    const penaltyHigh = Math.max(0, y - U80) * 10;
    score80_sum += width + penaltyLow + penaltyHigh;

    // Referencia: cuantiles de TODOS los rh[first+h .. c] sin escalar
    const rhAll = [];
    for (let i = first + h; i <= c; i++) {
      const r = rh[i];
      if (Number.isFinite(r)) rhAll.push(r);
    }
    if (rhAll.length >= 4) {
      rhAll.sort((a, b) => a - b);
      const q10r = cuantil(rhAll, 0.10);
      const q90r = cuantil(rhAll, 0.90);
      if (y >= q10r && y <= q90r) cobertura80_ref++;
      score80_ref_sum += (q90r - q10r) + 10 * Math.max(0, q10r - y) + 10 * Math.max(0, y - q90r);
    }

    // Sin operar: % de cortes donde el valor no negoció ningún día de (c, c+h]
    let negoEnPeriodo = false;
    for (let i = c + 1; i <= c + h; i++) {
      if (i < n && p[i] !== p[i - 1]) { // precio cambió = negoció
        negoEnPeriodo = true;
        break;
      }
    }
    if (!negoEnPeriodo) sinOperar++;
  }

  const testCount = testCuts.length;
  const validacion = {
    cortes: testCount,
    cobertura80: testCount > 0 ? Number(((cobertura80 / testCount) * 100).toFixed(2)) : 0,
    cobertura50: testCount > 0 ? Number(((cobertura50 / testCount) * 100).toFixed(2)) : 0,
    ancho80_mediano_pct: anchos80.length > 0 ? Number(mediana(anchos80).toFixed(2)) : 0,
    ancho50_mediano_pct: anchos50.length > 0 ? Number(mediana(anchos50).toFixed(2)) : 0,
    score80: testCount > 0 ? Number((score80_sum / testCount).toFixed(4)) : 0,
    score80_referencia: testCount > 0 ? Number((score80_ref_sum / testCount).toFixed(4)) : 0,
    cobertura80_referencia: testCount > 0 ? Number(((cobertura80_ref / testCount) * 100).toFixed(2)) : 0,
    sin_operar_pct: testCount > 0 ? Number(((sinOperar / testCount) * 100).toFixed(2)) : 0,
  };

  // --- Rango vigente: corte c = N-1 ---
  const c = n - 1;
  if (c < c0) {
    return resultadoNoPublicable("historia_insuficiente", validacion, p[c]);
  }

  const nprev = c - h - c0 + 1;
  if (nprev < 250) {
    return resultadoNoPublicable("historia_insuficiente", validacion, p[c]);
  }

  // K expansivo para el corte actual
  const maxIdx = c - h;
  const needs80Slice = necesidades80.subarray(c0, maxIdx + 1);
  const needs50Slice = necesidades50.subarray(c0, maxIdx + 1);

  const needs80Sorted = Array.from(needs80Slice).sort((a, b) => a - b);
  const needs50Sorted = Array.from(needs50Slice).sort((a, b) => a - b);

  const K80 = cuantil(needs80Sorted, 0.80);
  const K50 = cuantil(needs50Sorted, 0.50);

  // Cuantiles base del corte actual
  const f10 = f10_arr[c];
  const f25 = f25_arr[c];
  const f75 = f75_arr[c];
  const f90 = f90_arr[c];

  // Banda en retorno logarítmico
  const L80 = K80 * f10;
  const U80 = K80 * f90;
  const L50 = K50 * f25;
  const U50 = K50 * f75;

  const base = p[c]; // último cierre

  // Regla de publicación
  const publicable = testCount >= 100 && validacion.cobertura80 >= 74 && validacion.cobertura80 <= 86;
  let motivo = null;
  if (!publicable) {
    if (testCount < 100) motivo = "historia_insuficiente";
    else motivo = "cobertura_fuera_de_rango";
  }

  // Precios con 4 decimales si < 1, 2 decimales si >= 1
  const fmt = (v) => v < 1 ? Number(v.toFixed(4)) : Number(v.toFixed(2));

  if (!publicable) {
    return {
      publicable: false,
      motivo,
      p10: null,
      p25: null,
      p50: fmt(base),
      p75: null,
      p90: null,
      ancho80_pct: null,
      ancho50_pct: null,
      validacion,
    };
  }

  const p10 = fmt(base * Math.exp(L80));
  const p25 = fmt(base * Math.exp(L50));
  const p50 = fmt(base);
  const p75 = fmt(base * Math.exp(U50));
  const p90 = fmt(base * Math.exp(U80));

  const ancho80_pct = Number((100 * (Math.exp(U80) - Math.exp(L80))).toFixed(2));
  const ancho50_pct = Number((100 * (Math.exp(U50) - Math.exp(L50))).toFixed(2));

  return {
    publicable: true,
    motivo: null,
    p10,
    p25,
    p50,
    p75,
    p90,
    ancho80_pct,
    ancho50_pct,
    validacion,
  };
}

function mediana(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ============================================================================
// Escalón 2: rango por fondo común
// ----------------------------------------------------------------------------
// Cuando el método propio de un valor no es publicable se prueba un segundo
// escalón: los cuantiles de un fondo común de retornos estandarizados de TODAS
// las acciones, escalados por la volatilidad propia del valor, con K propio
// (a partir de 60 necesidades realizadas) y corrección en línea (gamma 0.02).
// ============================================================================

const FONDO = {
  W: 756,         // ventana del pool (días)
  GAMMA: 0.02,    // corrección en línea
  KMIN: 60,       // necesidades realizadas mínimas para calibrar K
  MINP: 60,       // precalentamiento mínimo por valor (días)
  MIN_POOL: 2000, // tamaño mínimo del pool para que un corte tenga rango
};

/**
 * Necesidad de una predicción: cuánto se excede el rango frente al valor real.
 * max(0, y/hi) si y >= 0; max(0, y/lo) si y < 0; 1.0 si el rango no tiene el
 * signo esperado.
 */
function necesidad(y, lo, hi) {
  if (y >= 0) return Math.max(0, hi > 0 ? y / hi : 1.0);
  return Math.max(0, lo < 0 ? y / lo : 1.0);
}

/**
 * Inserta un valor en un array ordenado ascendente (búsqueda binaria + memmove).
 * Devuelve el nuevo tamaño.
 */
function insertarOrdenado(arr, m, v) {
  let lo = 0;
  let hi = m;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  arr.copyWithin(lo + 1, lo, m);
  arr[lo] = v;
  return m + 1;
}

/**
 * Retornos estandarizados z[j] = (lp[j] - lp[j-h]) / sig[j] de un valor,
 * disponibles desde j = first + h + FONDO.MINP (precalentamiento).
 */
function zEstandarizados(datos, h) {
  const { lp, sig, first } = datos;
  const n = lp.length;
  const inicio = first + h + FONDO.MINP;
  const largo = Math.max(0, n - inicio);
  const z = new Float64Array(largo);
  for (let i = 0; i < largo; i++) {
    const j = inicio + i;
    z[i] = (lp[j] - lp[j - h]) / sig[j];
  }
  return { z, inicio };
}

/**
 * Cuantililes del fondo común por corte c: sobre el pool de retornos
 * estandarizados de TODAS las acciones en la ventana [c-W, c] (si c < W la
 * ventana se recorta a [0, c], igual que la referencia).
 * Devuelve un Float64Array de 4*N con (p10, p25, p75, p90) por corte
 * (NaN cuando el pool tiene menos de MIN_POOL valores).
 */
function cuantilesFondoComun(seriesZ, n) {
  const FQ = new Float64Array(4 * n).fill(NaN);
  const pool = new Float64Array(seriesZ.length * (FONDO.W + 1));
  for (let c = 0; c < n; c++) {
    const winStart = Math.max(0, c - FONDO.W);
    let m = 0;
    for (const s of seriesZ) {
      const jStart = Math.max(s.inicio, winStart);
      if (jStart > c) continue;
      const desde = jStart - s.inicio;
      const len = c - jStart + 1;
      pool.set(s.z.subarray(desde, desde + len), m);
      m += len;
    }
    if (m < FONDO.MIN_POOL) continue;
    const vals = pool.subarray(0, m);
    vals.sort();
    FQ[4 * c] = cuantil(vals, 0.10);
    FQ[4 * c + 1] = cuantil(vals, 0.25);
    FQ[4 * c + 2] = cuantil(vals, 0.75);
    FQ[4 * c + 3] = cuantil(vals, 0.90);
  }
  return FQ;
}

/**
 * Rango de un valor por el escalón «fondo»: cuantiles del fondo común escalados
 * por su volatilidad, K propio con las necesidades ya realizadas y corrección en
 * línea (gamma 0.02). Devuelve { publicable, motivo, p10..p90, ancho80_pct,
 * ancho50_pct, validacion } con la misma forma que el método propio.
 */
function rangosDeValorFondo(datos, cal, h, FQ, testStart) {
  const { p, first, lp, sig } = datos;
  const n = cal.length;
  const c0 = first + h + FONDO.MINP;

  const validacionVacia = {
    cortes: 0,
    cobertura80: 0,
    cobertura50: 0,
    ancho80_mediano_pct: 0,
    ancho50_mediano_pct: 0,
    score80: 0,
    score80_referencia: 0,
    cobertura80_referencia: 0,
    sin_operar_pct: 0,
  };

  if (c0 >= n) {
    return { publicable: false, motivo: "historia_insuficiente", validacion: validacionVacia, bandas: [], vigente: null };
  }

  const rh = retornosH(lp, first, h);
  // Los cortes que miden el método son los de prueba (fecha >= 2025-01-01) con la
  // ventana del pool COMPLETA (c >= W=756). Con la ventana recortada (c < W) los
  // cuantiles del fondo de ese corte no son comparables con los del rango
  // vigente, que sí se construye sobre la ventana completa.
  const validacionDesde = Math.max(testStart, FONDO.W);
  const needs80 = new Float64Array(n);
  const needs50 = new Float64Array(n);
  const fallos80 = new Float64Array(n);
  const fallos50 = new Float64Array(n);
  const orden80 = new Float64Array(n); // necesidades80 ordenadas (para el cuantil de K)
  const orden50 = new Float64Array(n); // necesidades50 ordenadas
  const ordenRh = new Float64Array(n); // retornos propios ordenados (referencia)
  let m80 = 0;
  let m50 = 0;
  let mRh = 0;

  // Retornos ya disponibles para la referencia (sin escalar)
  for (let i = first + h; i < c0; i++) mRh = insertarOrdenado(ordenRh, mRh, rh[i]);

  let a80 = 0;
  let a50 = 0;
  let vigente = null;
  let cortes = 0;
  let cobertura80 = 0;
  let cobertura50 = 0;
  let cobertura80Ref = 0;
  let score80Sum = 0;
  let score80RefSum = 0;
  let sinOperar = 0;
  const anchos80 = [];
  const anchos50 = [];
  const bandas = []; // bandas de los cortes de prueba (para pruebas de no-fuga)
  for (let c = c0; c < n; c++) {
    mRh = insertarOrdenado(ordenRh, mRh, rh[c]);

    // Necesidades ya realizadas: las de los cortes <= c-h
    if (c - h >= c0) {
      m80 = insertarOrdenado(orden80, m80, needs80[c - h]);
      m50 = insertarOrdenado(orden50, m50, needs50[c - h]);
      // Corrección en línea: en c ya se conoce el fallo de la predicción de c-h
      a80 += FONDO.GAMMA * (fallos80[c - h] - 0.20);
      a50 += FONDO.GAMMA * (fallos50[c - h] - 0.50);
    }

    const nprev = c - c0 - h + 1;
    let k80;
    let k50;
    if (nprev >= FONDO.KMIN) {
      k80 = cuantil(orden80.subarray(0, m80), 0.80);
      k50 = cuantil(orden50.subarray(0, m50), 0.50);
    } else {
      k80 = 1.0;
      k50 = 1.0;
    }

    const q10 = FQ[4 * c];
    const q25 = FQ[4 * c + 1];
    const q75 = FQ[4 * c + 2];
    const q90 = FQ[4 * c + 3];
    const hayFondo = Number.isFinite(q10);
    // Los cuantiles del fondo se escalan por la volatilidad propia del valor
    const f10 = q10 * sig[c];
    const f25 = q25 * sig[c];
    const f75 = q75 * sig[c];
    const f90 = q90 * sig[c];
    const y = c + h < n ? lp[c + h] - lp[c] : null;

    let fallo80 = 0.2;
    let fallo50 = 0.5;
    let L80 = null;
    let U80 = null;
    let L50 = null;
    let U50 = null;

    if (hayFondo) {
      const K80 = k80 * Math.exp(a80);
      const K50 = k50 * Math.exp(a50);
      L80 = K80 * f10;
      L50 = K50 * f25;
      U50 = K50 * f75;
      U80 = K80 * f90;
      if (y !== null) {
        fallo80 = (L80 <= y && y <= U80) ? 0.0 : 1.0;
        fallo50 = (L50 <= y && y <= U50) ? 0.0 : 1.0;
        if (c >= validacionDesde) {
          cortes++;
          bandas.push({ c, y, L80, U80, L50, U50 });
          const base = p[c];
          const precio10 = base * Math.exp(L80);
          const precio90 = base * Math.exp(U80);
          const precio25 = base * Math.exp(L50);
          const precio75 = base * Math.exp(U50);
          const actualPrice = p[c + h];
          if (actualPrice >= precio10 && actualPrice <= precio90) cobertura80++;
          if (actualPrice >= precio25 && actualPrice <= precio75) cobertura50++;
          anchos80.push(100 * (Math.exp(U80) - Math.exp(L80)));
          anchos50.push(100 * (Math.exp(U50) - Math.exp(L50)));
          // Score80 = media de (U-L) + 10*max(0, L-y) + 10*max(0, y-U)
          score80Sum += (U80 - L80) + 10 * Math.max(0, L80 - y) + 10 * Math.max(0, y - U80);
          // Referencia: cuantiles de TODOS los rh[first+h .. c] sin escalar
          const q10r = cuantil(ordenRh.subarray(0, mRh), 0.10);
          const q90r = cuantil(ordenRh.subarray(0, mRh), 0.90);
          if (y >= q10r && y <= q90r) cobertura80Ref++;
          score80RefSum += (q90r - q10r) + 10 * Math.max(0, q10r - y) + 10 * Math.max(0, y - q90r);
          // Sin operar: el valor no negoció ningún día de (c, c+h]
          let negoEnPeriodo = false;
          for (let i = c + 1; i <= c + h; i++) {
            if (p[i] !== p[i - 1]) {
              negoEnPeriodo = true;
              break;
            }
          }
          if (!negoEnPeriodo) sinOperar++;
        }
      } else if (c === n - 1) {
        vigente = { L80, U80, L50, U50 };
      }
    }
    fallos80[c] = fallo80;
    fallos50[c] = fallo50;

    if (hayFondo && y !== null) {
      needs80[c] = necesidad(y, f10, f90);
      needs50[c] = necesidad(y, f25, f75);
    } else {
      needs80[c] = 1.0;
      needs50[c] = 1.0;
    }
  }

  const validacion = {
    cortes,
    cobertura80: cortes > 0 ? Number(((cobertura80 / cortes) * 100).toFixed(2)) : 0,
    cobertura50: cortes > 0 ? Number(((cobertura50 / cortes) * 100).toFixed(2)) : 0,
    ancho80_mediano_pct: anchos80.length > 0 ? Number(mediana(anchos80).toFixed(2)) : 0,
    ancho50_mediano_pct: anchos50.length > 0 ? Number(mediana(anchos50).toFixed(2)) : 0,
    score80: cortes > 0 ? Number((score80Sum / cortes).toFixed(4)) : 0,
    score80_referencia: cortes > 0 ? Number((score80RefSum / cortes).toFixed(4)) : 0,
    cobertura80_referencia: cortes > 0 ? Number(((cobertura80Ref / cortes) * 100).toFixed(2)) : 0,
    sin_operar_pct: cortes > 0 ? Number(((sinOperar / cortes) * 100).toFixed(2)) : 0,
  };

  // Regla de publicación del fondo: cortes, cobertura80, cobertura50 y rango vigente
  const publicable = cortes >= 100 &&
    validacion.cobertura80 >= 74 && validacion.cobertura80 <= 86 &&
    validacion.cobertura50 >= 40 && validacion.cobertura50 <= 60 &&
    vigente !== null;

  if (!publicable) {
    const motivo = cortes < 100 ? "historia_insuficiente" : "cobertura_fuera_de_rango";
    return { publicable: false, motivo, validacion, bandas, vigente };
  }

  const base = p[n - 1];
  const fmt = (v) => v < 1 ? Number(v.toFixed(4)) : Number(v.toFixed(2));

  return {
    publicable: true,
    motivo: null,
    p10: fmt(base * Math.exp(vigente.L80)),
    p25: fmt(base * Math.exp(vigente.L50)),
    p50: fmt(base),
    p75: fmt(base * Math.exp(vigente.U50)),
    p90: fmt(base * Math.exp(vigente.U80)),
    ancho80_pct: Number((100 * (Math.exp(vigente.U80) - Math.exp(vigente.L80))).toFixed(2)),
    ancho50_pct: Number((100 * (Math.exp(vigente.U50) - Math.exp(vigente.L50))).toFixed(2)),
    validacion,
    bandas,
    vigente,
  };
}

// ============================================================================
// Motor principal
// ============================================================================

/**
 * Prepara el universo de valores: filas válidas, calendario bursátil y metadatos
 * de los valores que entran al archivo (dias_12m, grupo, último cierre).
 */
function prepararValores(filas) {
  const validRows = filas.filter(f => Number.isFinite(f.cierre) && f.cierre > 0 && f.fecha && f.nemonico);
  const cal = calendarioBursatil(validRows);
  const N = cal.length;

  if (N === 0) {
    throw new Error("Calendario bursátil vacío");
  }

  // Agrupar por nemonico
  const bySymbol = new Map();
  for (const row of validRows) {
    if (!bySymbol.has(row.nemonico)) bySymbol.set(row.nemonico, []);
    bySymbol.get(row.nemonico).push(row);
  }

  // Para cada valor, contar días negociados en últimos 250 días del calendario
  const last250Start = Math.max(0, N - 250);
  const metaPorValor = [];

  for (const [nemonico, filasValor] of bySymbol) {
    // Contar días negociados reales en últimos 250 días de calendario
    const reales = new Set(filasValor.filter(f => f.cierre > 0).map(f => f.fecha));
    let dias12m = 0;
    let ultimaNegociacion = null;
    for (let i = last250Start; i < N; i++) {
      if (reales.has(cal[i])) {
        dias12m++;
        ultimaNegociacion = cal[i];
      }
    }

    if (dias12m < 20) continue; // No entra al archivo

    // Determinar grupo
    let grupo;
    if (dias12m >= 150) grupo = "A";
    else if (dias12m >= 60) grupo = "B";
    else grupo = "C";

    // Último cierre
    const ultimoCierre = filasValor[filasValor.length - 1].cierre;

    metaPorValor.push({ nemonico, filasValor, dias12m, grupo, ultimoCierre, ultimaNegociacion });
  }

  return { validRows, cal, N, bySymbol, metaPorValor };
}

/**
 * Series de cada valor (precalentamiento y volatilidad EWMA) para el pool del fondo.
 */
function seriesPorValor(metaPorValor, cal) {
  const datosPorValor = new Map();
  for (const meta of metaPorValor) {
    const { p, first, lp } = serieConArraste(meta.filasValor, cal);
    const { sig } = ewmaVolatility(lp, first);
    datosPorValor.set(meta.nemonico, { p, first, lp, sig });
  }
  return datosPorValor;
}

/**
 * Primer corte de prueba (validación fuera de muestra desde 2025-01-01).
 */
function primerCorteDePrueba(cal) {
  return Math.max(0, cal.findIndex(d => d >= "2025-01-01"));
}

/**
 * Bandas del escalón «fondo» por corte, para todos los valores (función pura).
 * Sirve para comprobar que un corte antiguo no depende de los datos posteriores.
 * Devuelve { nemonico: { cortes: [{ c, y, L80, U80, L50, U50 }], vigente } }.
 */
export function fondoComunBandas(filas, h) {
  const { cal, metaPorValor } = prepararValores(filas);
  const datosPorValor = seriesPorValor(metaPorValor, cal);
  const seriesZ = metaPorValor.map(m => zEstandarizados(datosPorValor.get(m.nemonico), h));
  const FQ = cuantilesFondoComun(seriesZ, cal.length);
  const testStart = primerCorteDePrueba(cal);

  const salida = {};
  for (const meta of metaPorValor) {
    const r = rangosDeValorFondo(datosPorValor.get(meta.nemonico), cal, h, FQ, testStart);
    salida[meta.nemonico] = { cortes: r.bandas, vigente: r.vigente };
  }
  return salida;
}

/**
 * Motor principal que toma filas { nemonico, fecha, cierre } y devuelve el JSON de rangos.
 */
export function motorAcciones(filas) {
  const { cal, N, metaPorValor } = prepararValores(filas);
  const resultados = {};

  // --- Escalón 2: fondo común ---
  const datosPorValor = seriesPorValor(metaPorValor, cal);

  // Cuantililes del fondo común por horizonte (semana y mes)
  const FQ = {};
  for (const h of [5, 21]) {
    const seriesZ = metaPorValor.map(m => zEstandarizados(datosPorValor.get(m.nemonico), h));
    FQ[h] = cuantilesFondoComun(seriesZ, N);
  }

  // Primer corte de prueba (validación fuera de muestra desde 2025-01-01)
  const testStart = primerCorteDePrueba(cal);

  // Fechas objetivo usando addBusinessDays de engine-daily.js
  const ultimaFecha = cal[N - 1];
  const fechaObjetivo = {
    5: addBusinessDays(ultimaFecha, 5),
    21: addBusinessDays(ultimaFecha, 21),
  };

  for (const meta of metaPorValor) {
    const { nemonico, filasValor, dias12m, grupo, ultimoCierre, ultimaNegociacion } = meta;
    const datos = datosPorValor.get(nemonico);

    // Calcular rangos para semana (h=5) y mes (h=21)
    const horizontes = {};
    for (const [h, nombre] of [[5, "semana"], [21, "mes"]]) {
      const propio = rangosDeValor(filasValor, cal, h);
      let final;
      if (propio.publicable) {
        // El método propio manda: sus números se dejan TAL CUAL
        final = { ...propio, metodo: "propio" };
      } else {
        // Segundo escalón: rango por fondo común
        const fondo = rangosDeValorFondo(datos, cal, h, FQ[h], testStart);
        if (fondo.publicable) {
          final = {
            publicable: fondo.publicable,
            motivo: fondo.motivo,
            p10: fondo.p10,
            p25: fondo.p25,
            p50: fondo.p50,
            p75: fondo.p75,
            p90: fondo.p90,
            ancho80_pct: fondo.ancho80_pct,
            ancho50_pct: fondo.ancho50_pct,
            validacion: fondo.validacion,
            metodo: "fondo",
          };
        } else if (propio.motivo === "historia_insuficiente" && fondo.validacion.cortes >= 100) {
          // El fondo sí alcanza 100 cortes de prueba: el motivo real es la cobertura
          final = { ...propio, motivo: "cobertura_fuera_de_rango", validacion: fondo.validacion, metodo: null };
        } else {
          final = { ...propio, metodo: null };
        }
      }
      horizontes[nombre] = {
        h,
        fecha_objetivo: fechaObjetivo[h],
        ...final,
      };
    }

    resultados[nemonico] = {
      grupo,
      dias_12m: dias12m,
      ultimo_cierre: Number(ultimoCierre.toFixed(2)),
      ultima_negociacion: ultimaNegociacion,
      primera_fecha: datos.first >= 0 ? cal[datos.first] : null,
      ...horizontes,
    };
  }

  // Ordenar por nemonico
  const sorted = Object.keys(resultados).sort().reduce((acc, k) => {
    acc[k] = resultados[k];
    return acc;
  }, {});

  const publicablesSemana = Object.values(sorted).filter(v => v.semana.publicable).length;
  const publicablesMes = Object.values(sorted).filter(v => v.mes.publicable).length;
  const porFondoSemana = Object.values(sorted).filter(v => v.semana.metodo === "fondo").length;
  const porFondoMes = Object.values(sorted).filter(v => v.mes.metodo === "fondo").length;

  return {
    version: 1,
    actualizado: new Date().toISOString(),
    ultimo_dia: cal[N - 1],
    metodo: "FHS diario con EWMA 0.97 y calibracion expansiva; validacion 2025-2026 fuera de muestra; segundo escalon con fondo comun y correccion en linea",
    valores: sorted,
    resumen: {
      valores: Object.keys(sorted).length,
      publicables_semana: publicablesSemana,
      publicables_mes: publicablesMes,
      por_fondo_semana: porFondoSemana,
      por_fondo_mes: porFondoMes,
    },
  };
}

// ============================================================================
// CLI
// ============================================================================

async function leerCSV(ruta) {
  const contenido = fs.readFileSync(ruta, "utf8");
  const lineas = contenido.trim().split("\n");
  if (lineas.length < 2) throw new Error("CSV vacío o solo cabecera");
  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    const [nemonico, fecha, cierre, monto] = lineas[i].split(",");
    const c = parseFloat(cierre);
    if (Number.isFinite(c) && c > 0) {
      filas.push({ nemonico, fecha, cierre: c });
    }
  }
  return filas;
}

async function leerSupabase() {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY");

  const filas = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`${base}/rest/v1/cotizaciones_smv`);
    url.searchParams.set("select", "nemonico,fecha,cierre");
    url.searchParams.set("order", "nemonico.asc,fecha.asc");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Supabase cotizaciones_smv HTTP ${r.status}: ${txt.slice(0, 200)}`);
    }
    const page = await r.json();
    for (const q of page) {
      const c = Number(q.cierre);
      if (Number.isFinite(c) && c > 0) {
        filas.push({ nemonico: q.nemonico, fecha: q.fecha, cierre: c });
      }
    }
    if (page.length < 1000) break;
  }
  return filas;
}

async function main() {
  const args = process.argv.slice(2);
  let csvPath = null;
  let outPath = DEFAULT_OUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--csv" && i + 1 < args.length) {
      csvPath = args[++i];
    } else if (args[i] === "--out" && i + 1 < args.length) {
      outPath = args[++i];
    }
  }

  let filas;
  if (csvPath) {
    filas = await leerCSV(csvPath);
  } else {
    filas = await leerSupabase();
  }

  if (filas.length < 20000) {
    throw new Error(`Pocas filas (${filas.length} < 20000): posible descarga a medias`);
  }

  const unicos = new Set(filas.map(f => f.nemonico));
  if (unicos.size < 30) {
    throw new Error(`Pocos valores (${unicos.size} < 30): posible descarga a medias`);
  }

  const resultado = motorAcciones(filas);
  if (Object.keys(resultado.valores).length < 30) {
    throw new Error(`Pocos valores en resultado (${Object.keys(resultado.valores).length} < 30)`);
  }

  fs.writeFileSync(outPath, JSON.stringify(resultado, null, 2) + "\n", "utf8");
  console.log(`Rangos guardados en ${outPath}`);
  console.log(`Valores: ${resultado.resumen.valores}, Publicables semana: ${resultado.resumen.publicables_semana}, Publicables mes: ${resultado.resumen.publicables_mes}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error("Error en engine-acciones:", err);
    process.exit(1);
  });
}