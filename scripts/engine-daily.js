// PerData Engine diario v1
// Pronósticos diarios probabilísticos a horizontes h = 1..8 días hábiles para USD/PEN y materias primas.
// Metodología: Simulación Histórica Filtrada (FHS) con volatilidad EWMA (lambda = 0.94),
// P50 por paseo aleatorio (último cierre) y calibración de factor K para cobertura 80%.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BCRP_PATH = path.join(ROOT, "data", "official", "bcrp-daily.json");
const FORECASTS_PATH = path.join(ROOT, "data", "daily-forecasts.json");
const GDELT_DAILY_PATH = path.join(ROOT, "data", "official", "gdelt-daily.json");
const GDELT_MONTHLY_PATH = path.join(ROOT, "data", "official", "gdelt-news.json");

/**
 * Feriados oficiales de Perú en 2026 y 2027 (lista fija).
 * Incluye: 1 ene, jueves y viernes santo, 1 may, 7 jun, 29 jun, 23 jul,
 * 28 y 29 jul, 6 ago, 30 ago, 8 oct, 1 nov, 8 dic, 9 dic, 25 dic.
 */
export const PERU_HOLIDAYS = new Set([
  // 2026
  "2026-01-01",
  "2026-04-02", // Jueves Santo 2026
  "2026-04-03", // Viernes Santo 2026
  "2026-05-01",
  "2026-06-07",
  "2026-06-29",
  "2026-07-23",
  "2026-07-28",
  "2026-07-29",
  "2026-08-06",
  "2026-08-30",
  "2026-10-08",
  "2026-11-01",
  "2026-12-08",
  "2026-12-09",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-03-25", // Jueves Santo 2027
  "2027-03-26", // Viernes Santo 2027
  "2027-05-01",
  "2027-06-07",
  "2027-06-29",
  "2027-07-23",
  "2027-07-28",
  "2027-07-29",
  "2027-08-06",
  "2027-08-30",
  "2027-10-08",
  "2027-11-01",
  "2027-12-08",
  "2027-12-09",
  "2027-12-25",
]);

/**
 * Añade n días hábiles (lunes a viernes excluyendo feriados de Perú) a una fecha YYYY-MM-DD.
 */
export function addBusinessDays(dateStr, n, holidays = PERU_HOLIDAYS) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  let added = 0;
  while (added < n) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const day = cur.getUTCDay();
    const iso = cur.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && (!holidays || !holidays.has(iso))) {
      added++;
    }
  }
  return cur.toISOString().slice(0, 10);
}

/**
 * Obtiene la fecha actual en la zona horaria de Lima (UTC-5) en formato YYYY-MM-DD.
 */
export function getTodayInLima() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Calcula cuantil empírico q de un array numérico ordenado ascendente.
 */
export function empiricalQuantile(sortedXs, q) {
  if (!sortedXs || sortedXs.length === 0) return 0;
  const idx = Math.min(sortedXs.length - 1, Math.max(0, Math.floor(q * sortedXs.length)));
  return sortedXs[idx];
}

/**
 * Calcula la varianza y volatilidad EWMA condicional de retornos diarios.
 * sigma2_t = lambda * sigma2_{t-1} + (1 - lambda) * u_t^2
 */
export function computeEWMAVolatility(prices, lambda = 0.94) {
  const n = prices.length;
  const u = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const pPrev = Math.max(0.001, prices[i - 1]);
    const pCurr = Math.max(0.001, prices[i]);
    u[i] = Math.log(pCurr / pPrev);
  }

  const sigma2 = new Float64Array(n);
  // Inicialización con varianza muestral de los primeros 30 días
  const initWindow = Math.min(30, Math.max(5, Math.floor(n / 4)));
  let initSum = 0;
  for (let i = 1; i <= initWindow; i++) {
    initSum += u[i] * u[i];
  }
  sigma2[0] = Math.max(1e-8, initSum / initWindow);

  for (let i = 1; i < n; i++) {
    sigma2[i] = lambda * sigma2[i - 1] + (1 - lambda) * (u[i] * u[i]);
  }

  const sigma = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sigma[i] = Math.sqrt(Math.max(1e-8, sigma2[i]));
  }

  return { u, sigma2, sigma };
}

/**
 * Calcula la deriva EWMA condicional de retornos diarios:
 * mu_t = lambda * mu_{t-1} + (1 - lambda) * u_t
 */
export function computeEWMADrift(u, lambda = 0.94) {
  const n = u.length;
  const mu = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    mu[i] = lambda * mu[i - 1] + (1 - lambda) * u[i];
  }
  return mu;
}

/**
 * Ejecuta la Simulación Histórica Filtrada (FHS) para un horizonte h dado.
 * Ventana: últimos 3 años (756 días hábiles).
 * Retornos reescalados: r_tau_h * (sigma_t / sigma_tau).
 * Filtra cortes con precios <= 0.
 * Para WTI, inicia en 2020-07-01 para evitar la distorsión del precio negativo de abr-2020.
 * Calibra K en muestra completa (producción), y calcula métricas fuera de muestra
 * (entrenamiento 2019-2023, prueba 2024-2026 con K fijo y K expansivo).
 */
export function runFHSBacktest(serie, h, options = {}) {
  const {
    lambda = 0.94,
    windowYears = 3,
    targetCoverage = 0.80,
    testStartDate = "2024-01-01",
    sym = null,
  } = options;

  // Filtrar estrictamente precios no positivos (ej. WTI -36.98 en abr-2020)
  const cleanSerie = serie.filter(([d, p]) => Number.isFinite(p) && p > 0);

  // Fecha de inicio por defecto: WTI inicia en 2020-07-01; los demás en 2019-01-01
  const defaultStartDate = sym === "WTI" ? "2020-07-01" : "2019-01-01";
  const startDate = options.startDate || defaultStartDate;

  const windowDays = Math.round(windowYears * 252);
  const n = cleanSerie.length;
  const dates = cleanSerie.map(s => s[0]);
  const prices = cleanSerie.map(s => s[1]);

  const { u, sigma } = computeEWMAVolatility(prices, lambda);
  const mu = computeEWMADrift(u, lambda);

  const startIdx = dates.findIndex(d => d >= startDate);
  if (startIdx === -1 || startIdx < windowDays) {
    throw new Error(`Datos insuficientes para backtest desde ${startDate}`);
  }

  const endIdx = n - h;
  const cuts = [];

  for (let t = startIdx; t < endIdx; t++) {
    const pT = prices[t];
    const actual = prices[t + h];
    const actualReturn = Math.log(actual / pT);

    const winStart = Math.max(h, t - windowDays);
    const scaledReturns = [];
    for (let tau = winStart; tau <= t; tau++) {
      const r_tau_h = Math.log(prices[tau] / prices[tau - h]);
      const sRatio = sigma[t] / sigma[tau];
      if (Number.isFinite(r_tau_h) && Number.isFinite(sRatio)) {
        scaledReturns.push(r_tau_h * sRatio);
      }
    }
    scaledReturns.sort((a, b) => a - b);
    const q10 = empiricalQuantile(scaledReturns, 0.10);
    const q25 = empiricalQuantile(scaledReturns, 0.25);
    const q75 = empiricalQuantile(scaledReturns, 0.75);
    const q90 = empiricalQuantile(scaledReturns, 0.90);

    const p50_rw = pT;
    const p50_drift = pT * Math.exp(h * mu[t]);

    const delta = actualReturn;
    let need = 0;
    if (delta >= 0) {
      need = q90 > 0 ? delta / q90 : 1;
    } else {
      need = q10 < 0 ? delta / q10 : 1;
    }

    cuts.push({
      date: dates[t],
      targetDate: dates[t + h],
      pT,
      actual,
      p50_rw,
      p50_drift,
      q10,
      q25,
      q75,
      q90,
      need: Math.max(0, need),
    });
  }

  // 1. Calibración K en toda la muestra (usado en producción)
  const allNeeds = cuts.map(c => c.need).sort((a, b) => a - b);
  const K_full = empiricalQuantile(allNeeds, targetCoverage);

  let maeRW = 0;
  let maeDrift = 0;
  let in80 = 0;
  let in50 = 0;
  let sumWidthPct = 0;

  for (const c of cuts) {
    maeRW += Math.abs(c.p50_rw - c.actual);
    maeDrift += Math.abs(c.p50_drift - c.actual);

    const p10 = c.pT * Math.exp(K_full * c.q10);
    const p25 = c.pT * Math.exp(K_full * c.q25);
    const p75 = c.pT * Math.exp(K_full * c.q75);
    const p90 = c.pT * Math.exp(K_full * c.q90);

    if (c.actual >= p10 && c.actual <= p90) in80++;
    if (c.actual >= p25 && c.actual <= p75) in50++;
    sumWidthPct += ((p90 - p10) / c.pT) * 100;
  }

  const cutsCount = cuts.length;
  const meanMaeRW = maeRW / cutsCount;
  const meanMaeDrift = maeDrift / cutsCount;

  // 2. Partición fuera de muestra: Entrenamiento (< testStartDate) vs Prueba (>= testStartDate)
  const trainCuts = cuts.filter(c => c.date < testStartDate);
  const testCuts = cuts.filter(c => c.date >= testStartDate);
  const trainNeeds = trainCuts.map(c => c.need).sort((a, b) => a - b);
  const K_train = trainNeeds.length > 0 ? empiricalQuantile(trainNeeds, targetCoverage) : K_full;

  // Evaluación fuera de muestra con K fijo de entrenamiento
  let oos_in80 = 0;
  let oos_in50 = 0;
  let oos_sumWidthPct = 0;
  let oos_maeRW = 0;

  for (const c of testCuts) {
    oos_maeRW += Math.abs(c.p50_rw - c.actual);
    const p10 = c.pT * Math.exp(K_train * c.q10);
    const p25 = c.pT * Math.exp(K_train * c.q25);
    const p75 = c.pT * Math.exp(K_train * c.q75);
    const p90 = c.pT * Math.exp(K_train * c.q90);

    if (c.actual >= p10 && c.actual <= p90) oos_in80++;
    if (c.actual >= p25 && c.actual <= p75) oos_in50++;
    oos_sumWidthPct += ((p90 - p10) / c.pT) * 100;
  }

  const testCount = Math.max(1, testCuts.length);

  // 3. Versión «K expansivo»: en cada corte t de prueba, K se calibra con los need anteriores a t
  let exp_in80 = 0;
  let exp_in50 = 0;
  let exp_sumWidthPct = 0;
  const firstTestIdx = cuts.findIndex(c => c.date >= testStartDate);

  if (firstTestIdx !== -1) {
    for (let i = firstTestIdx; i < cuts.length; i++) {
      const c = cuts[i];
      const prevNeeds = cuts.slice(0, i).map(x => x.need).sort((a, b) => a - b);
      const K_exp = empiricalQuantile(prevNeeds, targetCoverage);

      const p10 = c.pT * Math.exp(K_exp * c.q10);
      const p25 = c.pT * Math.exp(K_exp * c.q25);
      const p75 = c.pT * Math.exp(K_exp * c.q75);
      const p90 = c.pT * Math.exp(K_exp * c.q90);

      if (c.actual >= p10 && c.actual <= p90) exp_in80++;
      if (c.actual >= p25 && c.actual <= p75) exp_in50++;
      exp_sumWidthPct += ((p90 - p10) / c.pT) * 100;
    }
  }

  return {
    h,
    K: Number(K_full.toFixed(4)),
    cuts: cutsCount,
    mae_rw: Number(meanMaeRW.toFixed(4)),
    mae_drift: Number(meanMaeDrift.toFixed(4)),
    drift_wins: meanMaeDrift < meanMaeRW,
    cobertura_80: Number(((in80 / cutsCount) * 100).toFixed(2)),
    cobertura_50: Number(((in50 / cutsCount) * 100).toFixed(2)),
    ancho_medio_pct: Number((sumWidthPct / cutsCount).toFixed(2)),
    K_train: Number(K_train.toFixed(4)),
    cortes_entrenamiento: trainCuts.length,
    cortes_prueba: testCuts.length,
    oos: {
      cobertura_80: Number(((oos_in80 / testCount) * 100).toFixed(2)),
      cobertura_50: Number(((oos_in50 / testCount) * 100).toFixed(2)),
      ancho_medio_pct: Number((oos_sumWidthPct / testCount).toFixed(2)),
      mae_p50: Number((oos_maeRW / testCount).toFixed(4)),
      factor_k: Number(K_train.toFixed(4)),
    },
    expansivo: {
      cobertura_80: Number(((exp_in80 / testCount) * 100).toFixed(2)),
      cobertura_50: Number(((exp_in50 / testCount) * 100).toFixed(2)),
      ancho_medio_pct: Number((exp_sumWidthPct / testCount).toFixed(2)),
    },
    fuera_de_muestra_cobertura_80: Number(((oos_in80 / testCount) * 100).toFixed(2)),
    fuera_de_muestra_cobertura_50: Number(((oos_in50 / testCount) * 100).toFixed(2)),
    fuera_de_muestra_ancho_medio_pct: Number((oos_sumWidthPct / testCount).toFixed(2)),
    fuera_de_muestra_mae_p50: Number((oos_maeRW / testCount).toFixed(4)),
    expansivo_cobertura_80: Number(((exp_in80 / testCount) * 100).toFixed(2)),
  };
}

/**
 * Calcula los cuantiles FHS actuales sobre el último corte disponible.
 */
export function computeCurrentFHSQuantiles(serie, h, options = {}) {
  const { lambda = 0.94, windowYears = 3 } = options;
  const cleanSerie = serie.filter(([d, p]) => Number.isFinite(p) && p > 0);
  const windowDays = Math.round(windowYears * 252);
  const n = cleanSerie.length;
  const prices = cleanSerie.map(s => s[1]);
  const { sigma } = computeEWMAVolatility(prices, lambda);

  const t = n - 1;
  const winStart = Math.max(h, t - windowDays);
  const scaledReturns = [];

  for (let tau = winStart; tau <= t; tau++) {
    const r_tau_h = Math.log(prices[tau] / prices[tau - h]);
    const sRatio = sigma[t] / sigma[tau];
    if (Number.isFinite(r_tau_h) && Number.isFinite(sRatio)) {
      scaledReturns.push(r_tau_h * sRatio);
    }
  }

  scaledReturns.sort((a, b) => a - b);
  return {
    q10: empiricalQuantile(scaledReturns, 0.10),
    q25: empiricalQuantile(scaledReturns, 0.25),
    q75: empiricalQuantile(scaledReturns, 0.75),
    q90: empiricalQuantile(scaledReturns, 0.90),
    currentSigma: sigma[t],
  };
}

/**
 * Genera el archivo data/daily-forecasts.json con los pronósticos h = 1..8
 * para cada símbolo en BCRP diario, más `manana` y `semana` referenciando
 * el siguiente día hábil después de hoy en Lima y el quinto día hábil, respectivamente.
 */
export function generateDailyForecasts(bcrpData, options = {}) {
  const todayInLima = options.todayInLima || getTodayInLima();
  const targetManana = addBusinessDays(todayInLima, 1);
  const targetSemana = addBusinessDays(todayInLima, 5);

  const out = {
    version: "PerData Engine diario v1",
    actualizado: new Date().toISOString(),
    metodo: "Simulacion Historica Filtrada (FHS) + Volatilidad EWMA (lambda=0.94)",
    p50_criterio: "Paseo aleatorio (ultimo cierre) respaldado por backtest",
    referencia_lima: {
      hoy: todayInLima,
      siguiente_dia_habil_manana: targetManana,
      quinto_dia_habil_semana: targetSemana,
    },
    simbolos: {},
  };

  const horizons = [1, 2, 3, 4, 5, 6, 7, 8];

  for (const [sym, item] of Object.entries(bcrpData.series)) {
    const rawSerie = item.serie;
    if (!rawSerie) continue;
    const serie = rawSerie.filter(([d, p]) => Number.isFinite(p) && p > 0);
    if (serie.length < 756) continue;

    const lastRow = serie[serie.length - 1];
    const lastDate = lastRow[0];
    const lastClose = lastRow[1];

    const symEntry = {
      codigo: item.codigo,
      unidad: item.unidad,
      fecha_ultimo_cierre: lastDate,
      ultimo_cierre: lastClose,
      pronosticos: {},
    };

    const sDate = sym === "WTI" ? "2020-07-01" : "2019-01-01";

    for (const h of horizons) {
      const bt = runFHSBacktest(serie, h, { startDate: sDate, sym });
      const curr = computeCurrentFHSQuantiles(serie, h);

      const targetDate = addBusinessDays(lastDate, h);
      const p50 = lastClose; // Random walk
      const p10 = Number((p50 * Math.exp(bt.K * curr.q10)).toFixed(4));
      const p25 = Number((p50 * Math.exp(bt.K * curr.q25)).toFixed(4));
      const p75 = Number((p50 * Math.exp(bt.K * curr.q75)).toFixed(4));
      const p90 = Number((p50 * Math.exp(bt.K * curr.q90)).toFixed(4));

      symEntry.pronosticos[`h${h}`] = {
        horizonte_dias_habiles: h,
        fecha_objetivo: targetDate,
        p10,
        p25,
        p50,
        p75,
        p90,
        ancho_banda_pct: Number((((p90 - p10) / p50) * 100).toFixed(2)),
        backtest: {
          cobertura_80_real: bt.cobertura_80,
          cobertura_50_real: bt.cobertura_50,
          mae_p50: bt.mae_rw,
          mae_drift: bt.mae_drift,
          ancho_medio_pct: bt.ancho_medio_pct,
          factor_k: bt.K,
          cortes_evaluados: bt.cuts,
          cobertura_80_fuera_muestra: bt.oos.cobertura_80,
          cobertura_50_fuera_muestra: bt.oos.cobertura_50,
          ancho_medio_pct_fuera_muestra: bt.oos.ancho_medio_pct,
          mae_fuera_muestra: bt.oos.mae_p50,
          factor_k_entrenamiento: bt.oos.factor_k,
          cobertura_80_k_expansivo: bt.expansivo.cobertura_80,
          cobertura_50_k_expansivo: bt.expansivo.cobertura_50,
          ancho_medio_pct_k_expansivo: bt.expansivo.ancho_medio_pct,
        },
      };
    }

    // Identificar horizonte para 'manana' (siguiente día hábil tras HOY en Lima)
    // y 'semana' (quinto día hábil tras HOY en Lima)
    let matchManana = null;
    let matchSemana = null;

    for (const [key, fc] of Object.entries(symEntry.pronosticos)) {
      if (fc.fecha_objetivo === targetManana) {
        matchManana = { key, ...fc };
      }
      if (fc.fecha_objetivo === targetSemana) {
        matchSemana = { key, ...fc };
      }
    }

    // Fallbacks si la fecha objetivo excede el horizonte proyectado (e.g. desfase mayor a 8 días)
    if (!matchManana) {
      matchManana = { key: "h1", ...symEntry.pronosticos.h1, fecha_objetivo: targetManana };
    }
    if (!matchSemana) {
      matchSemana = { key: "h5", ...symEntry.pronosticos.h5, fecha_objetivo: targetSemana };
    }

    symEntry.manana = {
      horizonte: matchManana.key,
      fecha_objetivo: matchManana.fecha_objetivo,
      horizonte_dias_habiles: matchManana.horizonte_dias_habiles,
      p10: matchManana.p10,
      p25: matchManana.p25,
      p50: matchManana.p50,
      p75: matchManana.p75,
      p90: matchManana.p90,
      ancho_banda_pct: matchManana.ancho_banda_pct,
      backtest: matchManana.backtest,
    };

    symEntry.semana = {
      horizonte: matchSemana.key,
      fecha_objetivo: matchSemana.fecha_objetivo,
      horizonte_dias_habiles: matchSemana.horizonte_dias_habiles,
      p10: matchSemana.p10,
      p25: matchSemana.p25,
      p50: matchSemana.p50,
      p75: matchSemana.p75,
      p90: matchSemana.p90,
      ancho_banda_pct: matchSemana.ancho_banda_pct,
      backtest: matchSemana.backtest,
    };

    out.simbolos[sym] = symEntry;
  }

  return out;
}

/**
 * Evaluación fuera de muestra de noticias GDELT (entrena 2019-2023, prueba 2024-2026).
 */
export function evaluateNewsCovariate(bcrpData, gdeltData) {
  const penSerie = bcrpData.series.PEN.serie.filter(([d, p]) => Number.isFinite(p) && p > 0);
  const toneMap = new Map();

  if (gdeltData?.series?.pe_tono_diario) {
    for (const [date, val] of gdeltData.series.pe_tono_diario) {
      toneMap.set(date, val);
    }
  }

  let monthlyToneMap = new Map();
  if (fs.existsSync(GDELT_MONTHLY_PATH)) {
    const monthly = JSON.parse(fs.readFileSync(GDELT_MONTHLY_PATH, "utf8"));
    if (monthly.series?.pe_tono) {
      monthlyToneMap = new Map(monthly.series.pe_tono);
    }
  }

  const dailyAligned = penSerie.map(([date, price]) => {
    let tone = toneMap.get(date);
    if (tone === undefined) {
      tone = monthlyToneMap.get(date.slice(0, 7)) ?? -1.45;
    }
    return { date, price, tone };
  });

  for (let i = 1; i < dailyAligned.length; i++) {
    dailyAligned[i].deltaTone = dailyAligned[i].tone - dailyAligned[i - 1].tone;
  }
  dailyAligned[0].deltaTone = 0;

  const results = {};

  for (const h of [1, 5]) {
    const train = [];
    const test = [];

    for (let i = 0; i < dailyAligned.length - h; i++) {
      const cur = dailyAligned[i];
      const actual = dailyAligned[i + h].price;
      const r = Math.log(actual / cur.price);
      const row = {
        date: cur.date,
        pT: cur.price,
        actual,
        r,
        tone: cur.tone,
        deltaTone: cur.deltaTone,
      };

      if (cur.date >= "2019-01-01" && cur.date < "2024-01-01") {
        train.push(row);
      } else if (cur.date >= "2024-01-01") {
        test.push(row);
      }
    }

    // Regresión lineal OLS: r ~ alpha + beta * tone
    let sumY = 0, sumX = 0;
    for (const d of train) {
      sumY += d.r;
      sumX += d.tone;
    }
    const meanY = sumY / train.length;
    const meanX = sumX / train.length;

    let cov = 0, varX = 0;
    for (const d of train) {
      cov += (d.tone - meanX) * (d.r - meanY);
      varX += (d.tone - meanX) ** 2;
    }
    const beta = varX > 0 ? cov / varX : 0;
    const alpha = meanY - beta * meanX;

    let maeRW = 0;
    let maeNews = 0;
    for (const d of test) {
      maeRW += Math.abs(d.pT - d.actual);
      const predR = alpha + beta * d.tone;
      const predP = d.pT * Math.exp(predR);
      maeNews += Math.abs(predP - d.actual);
    }
    maeRW /= test.length;
    maeNews /= test.length;

    results[`h${h}`] = {
      horizonte: h,
      cortes_entrenamiento: train.length,
      cortes_prueba: test.length,
      mae_paseo_aleatorio: Number(maeRW.toFixed(5)),
      mae_con_noticias: Number(maeNews.toFixed(5)),
      mejora: maeNews < maeRW,
      diferencia_pct: Number((((maeNews - maeRW) / maeRW) * 100).toFixed(2)),
    };
  }

  return results;
}

/**
 * Función principal CLI
 */
export async function main() {
  if (!fs.existsSync(BCRP_PATH)) {
    throw new Error(`Archivo no encontrado: ${BCRP_PATH}`);
  }

  const bcrp = JSON.parse(fs.readFileSync(BCRP_PATH, "utf8"));
  console.log("Calculando PerData Engine diario...");

  // 1. Asegurar gdelt-daily.json
  let gdeltDaily = null;
  if (fs.existsSync(GDELT_DAILY_PATH)) {
    try {
      gdeltDaily = JSON.parse(fs.readFileSync(GDELT_DAILY_PATH, "utf8"));
    } catch {
      // Ignorar fallo de lectura
    }
  }

  // 2. Generar pronósticos diarios
  const forecasts = generateDailyForecasts(bcrp);
  fs.writeFileSync(FORECASTS_PATH, JSON.stringify(forecasts, null, 2) + "\n", "utf8");
  console.log(`Pronósticos guardados en ${FORECASTS_PATH}`);

  // 3. Evaluar noticias
  const newsEval = evaluateNewsCovariate(bcrp, gdeltDaily);
  console.log("Evaluación fuera de muestra de noticias GDELT:", newsEval);

  return { forecasts, newsEval };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error("Error en engine-daily:", err);
    process.exit(1);
  });
}
