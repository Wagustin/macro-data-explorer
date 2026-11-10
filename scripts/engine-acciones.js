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
function rangosDeValor(filasValor, cal, h) {
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
// Motor principal
// ============================================================================

/**
 * Motor principal que toma filas { nemonico, fecha, cierre } y devuelve el JSON de rangos.
 */
export function motorAcciones(filas) {
  // Filtrar filas válidas
  const validRows = filas.filter(f => Number.isFinite(f.cierre) && f.cierre > 0 && f.fecha && f.nemonico);

  // Calendario bursátil
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
  const resultados = {};

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

    // Calcular rangos para semana (h=5) y mes (h=21)
    const semana = rangosDeValor(filasValor, cal, 5);
    const mes = rangosDeValor(filasValor, cal, 21);

    // Fecha objetivo usando addBusinessDays de engine-daily.js
    const ultimaFecha = cal[N - 1];
    const fechaObjetivoSemana = addBusinessDays(ultimaFecha, 5);
    const fechaObjetivoMes = addBusinessDays(ultimaFecha, 21);

    resultados[nemonico] = {
      grupo,
      dias_12m: dias12m,
      ultimo_cierre: Number(ultimoCierre.toFixed(2)),
      ultima_negociacion: ultimaNegociacion,
      semana: {
        h: 5,
        fecha_objetivo: fechaObjetivoSemana,
        ...semana,
      },
      mes: {
        h: 21,
        fecha_objetivo: fechaObjetivoMes,
        ...mes,
      },
    };
  }

  // Ordenar por nemonico
  const sorted = Object.keys(resultados).sort().reduce((acc, k) => {
    acc[k] = resultados[k];
    return acc;
  }, {});

  const publicablesSemana = Object.values(sorted).filter(v => v.semana.publicable).length;
  const publicablesMes = Object.values(sorted).filter(v => v.mes.publicable).length;

  return {
    version: 1,
    actualizado: new Date().toISOString(),
    ultimo_dia: cal[N - 1],
    metodo: "FHS diario con EWMA 0.97 y calibracion expansiva; validacion 2025-2026 fuera de muestra",
    valores: sorted,
    resumen: {
      valores: Object.keys(sorted).length,
      publicables_semana: publicablesSemana,
      publicables_mes: publicablesMes,
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