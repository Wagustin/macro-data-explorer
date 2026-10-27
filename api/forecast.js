/**
 * PerData Forecast Engine v3 — damped momentum + anchor reversion + OU fan.
 *
 * Why v3: v2's P50 decayed its drift with half-life ~2.4 months and had no
 * long-horizon structure, so 24-36m forecasts collapsed into a flat line,
 * and the cone grew as sqrt(t) forever (pure random walk).
 *
 * v3 decomposes the point forecast (the P50 "skeleton") into:
 *   1. Local momentum  — dual EWMA trend, geometrically damped (half-life 6m).
 *   2. Anchor reversion — OLS anchor line over up to 120 months in log domain;
 *      the current gap to that line closes with half-life 15m, so the path
 *      bends back toward fair value instead of freezing.
 *   3. Structural drift — the anchor line's own slope (capped ±0.6%/mo), which
 *      is what a 3-year point forecast legitimately follows at long horizons.
 *   4. Seasonality — Fourier harmonics on the detrended window, soft
 *      significance shrinkage (no binary on/off jumps).
 *
 * The uncertainty cone is an OU process on deviations from the skeleton:
 * variance grows early then plateaus toward a stationary level (half-life
 * of the deviation decay is a model constant) — the classic central-bank
 * fan shape, instead of an ever-widening sqrt(t) wedge.
 * Zero dependencies.
 */

import fs from "fs";
import defaultCalibration from "./_lib/calibration.json" with { type: "json" };
import { PLANS, planForUser, canUseHorizon, upgradeRequired } from "./_lib/plans.js";
import { getAuthUserOrNull } from "./_lib/session.js";
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";
import { ENGINE } from "./_lib/engine.js";

// ---------- calibration loader (empirically calibrated quantile bands) ----------
let _calibration = defaultCalibration;
export function getCalibration() {
  return _calibration;
}

export function getFactorsForHorizon(H, calib) {
  if (!calib || !calib.horizons) return null;
  const known = [1, 3, 6, 12, 24, 36];
  if (H <= known[0]) return calib.horizons[known[0]];
  if (H >= known[known.length - 1]) return calib.horizons[known[known.length - 1]];
  if (calib.horizons[H]) return calib.horizons[H];

  let h0 = known[0], h1 = known[known.length - 1];
  for (let i = 0; i < known.length - 1; i++) {
    if (known[i] <= H && H <= known[i + 1]) {
      h0 = known[i];
      h1 = known[i + 1];
      break;
    }
  }
  const f0 = calib.horizons[h0];
  const f1 = calib.horizons[h1];
  if (!f0 || !f1) return f0 || f1;
  const t = (H - h0) / (h1 - h0);
  return {
    k80: Number((f0.k80 + t * (f1.k80 - f0.k80)).toFixed(3)),
    k50: Number((f0.k50 + t * (f1.k50 - f0.k50)).toFixed(3)),
    coverageAfter80: Number((f0.coverageAfter80 + t * (f1.coverageAfter80 - f0.coverageAfter80)).toFixed(1)),
    n: Math.round(f0.n + t * (f1.n - f0.n))
  };
}

// ---------- core engine (shared) ----------
export function buildForecast(series, H, opts = {}) {
  const closes = series.map(it => it.close);
  const N = closes.length;
  if (N < 5) throw new Error("insufficient");

  const lastClose = closes[N - 1];
  const lastDateStr = series[N - 1].date;

  // ---- 1. Log domain (prices are positive, multiplicative dynamics) ----
  const logs = closes.map(v => Math.log(v));
  const L = logs.length;

  // ---- 2. Local momentum: dual EWMA on log-diffs (fast + slow) ----
  const diffs = [];
  for (let i = 1; i < L; i++) diffs.push(logs[i] - logs[i - 1]);
  const ewma = (arr, lambda) => {
    let w = null;
    for (const x of arr) w = w === null ? x : lambda * x + (1 - lambda) * w;
    return w;
  };
  const trendFast = diffs.length >= 2 ? (ewma(diffs.slice(-6), 0.5) || 0) : 0;
  const trendSlow = diffs.length >= 4 ? (ewma(diffs.slice(-24), 0.25) || 0) : 0;
  let trendBlend = 0.6 * trendSlow + 0.4 * trendFast;
  // cap: beyond ±0.8%/mo the "trend" is a regime spike, not drift
  trendBlend = Math.max(-0.008, Math.min(0.008, trendBlend));

  // ---- 3. Long-run anchor: OLS on up to 120 months, log domain ----
  const windowLen = Math.min(L, 120);
  const winLogs = logs.slice(L - windowLen);
  const wMean = winLogs.reduce((a, b) => a + b, 0) / windowLen;
  let sT = 0, sY = 0, sTY = 0, sT2 = 0;
  for (let t = 0; t < windowLen; t++) {
    sT += t; sY += winLogs[t]; sTY += t * winLogs[t]; sT2 += t * t;
  }
  const denom = windowLen * sT2 - sT * sT;
  let wSlope = denom !== 0 ? (windowLen * sTY - sT * sY) / denom : 0;
  if (!isFinite(wSlope)) wSlope = 0;
  const wIntercept = (sY - wSlope * sT) / windowLen;
  // structural drift cap: ±0.6%/mo (≈ ±7.4%/yr) — a fitted 10y slope above
  // that is a regime artifact, not a sustainable structural trend
  const longRunSlope = Math.max(-0.006, Math.min(0.006, wSlope));
  const anchorLog = wIntercept + wSlope * (windowLen - 1);
  const anchorValid = L >= 24;
  const gap = anchorValid ? logs[L - 1] - anchorLog : 0; // >0: above fair value

  // Lo-MacKinlay variance ratio, k=12, on the estimation window:
  //   VR ~ 1 -> random walk; VR < 1 -> mean reversion; VR > 1 -> momentum.
  // Reversion toward the anchor is only applied when the data itself shows it.
  const K = 12;
  let vrNum = 0, vrDen = 0, n1 = 0, nK = 0;
  for (let t = 1; t < winLogs.length; t++) {
    const r1 = winLogs[t] - winLogs[t - 1];
    vrDen += r1 * r1; n1++;
  }
  for (let t = K; t < winLogs.length; t++) {
    const rK = winLogs[t] - winLogs[t - K];
    vrNum += rK * rK; nK++;
  }
  const var1 = vrDen / Math.max(1, n1);
  const varK = vrNum / Math.max(1, nK);
  let varianceRatio = var1 > 0 ? (varK / K) / var1 : 1;
  if (!isFinite(varianceRatio)) varianceRatio = 1;
  // reversion weight: full for VR<=0.55, zero for VR>=0.9, linear between
  const revWeight = anchorValid ? Math.max(0, Math.min(1, (0.9 - varianceRatio) / 0.35)) : 0;

  // ---- 4. Fourier seasonality on the detrended window (soft shrinkage) ----
  const detrended = winLogs.map((v, t) => v - (wIntercept + wSlope * t));
  const harmonics = [];
  if (windowLen >= 24) {
    const residVar = detrended.reduce((a, v) => a + v * v, 0) / windowLen || 1e-9;
    for (let k = 1; k <= 2; k++) {
      let sc = 0, ss = 0;
      for (let t = 0; t < windowLen; t++) {
        const ang = 2 * Math.PI * k * (t % 12) / 12;
        sc += detrended[t] * Math.cos(ang);
        ss += detrended[t] * Math.sin(ang);
      }
      sc *= 2 / windowLen; ss *= 2 / windowLen;
      const amp = Math.sqrt(sc * sc + ss * ss);
      const fStat = (windowLen * amp * amp / 4) / residVar;
      // soft gate: full weight at F>=6, linear shrink 3..6, zero below 3
      let weight = 0;
      if (fStat >= 6) weight = 1;
      else if (fStat > 3) weight = (fStat - 3) / 3;
      if (weight > 0) harmonics.push({ k, sc: sc * weight, ss: ss * weight, amp: amp * weight, fStat: Number(fStat.toFixed(2)) });
    }
  }
  const seasonalAt = (tAhead) => {
    let s = 0;
    const phase = (windowLen - 1 + tAhead) % 12;
    for (const h of harmonics) {
      const ang = 2 * Math.PI * h.k * phase / 12;
      s += h.sc * Math.cos(ang) + h.ss * Math.sin(ang);
    }
    return Math.max(-0.05, Math.min(0.05, s));
  };

  // ---- 5. Innovation vol + AR(1) clustering on monthly log RETURNS ----
  const retWin = Math.min(diffs.length, 36);
  const rets = diffs.slice(diffs.length - retWin);
  const retMean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const retVar = rets.reduce((a, v) => a + Math.pow(v - retMean, 2), 0) / ((rets.length - 1) || 1);
  const residVol = Math.sqrt(retVar) || 1e-6;
  const rC = rets.map(r => r - retMean);
  let num = 0, den = 0;
  for (let t = 1; t < rC.length; t++) { num += rC[t] * rC[t - 1]; }
  for (let t = 0; t < rC.length - 1; t++) { den += rC[t] * rC[t]; }
  const phi = Math.max(-0.3, Math.min(0.5, den > 0 ? num / den : 0));

  // ---- 6. Deterministic skeleton = the model's point forecast ----
  // Multi-scale damped trend (Gardner-McKenzie): fast momentum decays with
  // half-life ~2.4m, slow momentum with ~11m. Two time constants bend the
  // path continuously instead of freezing into a straight line; each scale
  // hands over to the structural drift as it expires.
  //   dampF = 0.75^(step-1) on the fast trend, dampS = 0.94^(step-1) on slow
  // reversion: only when the variance ratio says the series is mean-reverting.
  const DAMP_F = 0.75, DAMP_S = 0.94;
  const W_FAST = 0.4, W_SLOW = 0.6; // same blend weights as estimation
  const KAPPA = Math.log(2) / 15 * revWeight; // zero when not mean-reverting
  const skeletonLog = new Array(H + 1);
  const seasonalLog = new Array(H + 1);
  skeletonLog[0] = logs[L - 1]; seasonalLog[0] = 0;
  let momF = 0, momS = 0, powF = 1, powS = 1;
  for (let step = 1; step <= H; step++) {
    momF += trendFast * powF; powF *= DAMP_F;
    momS += trendSlow * powS; powS *= DAMP_S;
    let reversion = 0;
    if (anchorValid) {
      const anchorTarget = anchorLog + longRunSlope * step;
      reversion = (anchorTarget - logs[L - 1]) * (1 - Math.exp(-KAPPA * step));
    }
    skeletonLog[step] = logs[L - 1] + W_FAST * momF + W_SLOW * momS + reversion;
    seasonalLog[step] = seasonalAt(step);
  }

  // ---- 7. Fan: OU deviations around the skeleton ----
  // u_t = a*u_{t-1} + residVol*innov ; a = exp(-ln2/OU_HL)
  // Var(u_t) rises toward residVol^2/(1-a^2): the cone widens fast early,
  // then decelerates and plateaus — central-bank fan shape, not sqrt(t).
  const OU_HL = 40; // deviation half-life, months (calibrated via backtest)
  const aOu = Math.exp(-Math.log(2) / OU_HL);
  const SIMS = 400;
  let seed = 987654321;
  const nextU = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const rand = () => {
    const u1 = Math.max(1e-12, nextU());
    const u2 = nextU();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const paths = [];
  for (let s = 0; s < SIMS; s++) {
    let u = 0, zPrev = 0;
    const path = [];
    for (let step = 1; step <= H; step++) {
      const z = rand();
      const innov = phi * zPrev + Math.sqrt(Math.max(0, 1 - phi * phi)) * z;
      zPrev = innov;
      u = aOu * u + residVol * innov;
      path.push(Math.exp(skeletonLog[step] + seasonalLog[step] + u));
    }
    paths.push(path);
  }

  // ---- 8. Quantiles per step; P50 = skeleton + seasonality (point forecast) ----
  const calib = opts.calibrated === false ? null : getCalibration();
  const forecastPoints = [];
  const [lastY, lastM] = lastDateStr.split("-").map(v => parseInt(v, 10));
  let curY = lastY, curM = lastM;
  for (let step = 1; step <= H; step++) {
    curM += 1;
    if (curM > 12) { curM = 1; curY += 1; }
    const stepVals = paths.map(p => p[step - 1]).sort((a, b) => a - b);
    const q = (p) => stepVals[Math.min(stepVals.length - 1, Math.max(0, Math.floor(p * stepVals.length)))];
    let p50 = Number(Math.exp(skeletonLog[step] + seasonalLog[step]).toFixed(2));
    let p10 = Number(q(0.10).toFixed(2));
    let p25 = Number(q(0.25).toFixed(2));
    let p75 = Number(q(0.75).toFixed(2));
    let p90 = Number(q(0.90).toFixed(2));

    const factors = calib ? getFactorsForHorizon(step, calib) : null;
    if (factors && p50 > 0 && p10 > 0 && p25 > 0 && p75 > 0 && p90 > 0) {
      p10 = Number((p50 * Math.pow(p10 / p50, factors.k80)).toFixed(2));
      p90 = Number((p50 * Math.pow(p90 / p50, factors.k80)).toFixed(2));
      p25 = Number((p50 * Math.pow(p25 / p50, factors.k50)).toFixed(2));
      p75 = Number((p50 * Math.pow(p75 / p50, factors.k50)).toFixed(2));

      // Monotonía estricta
      p25 = Math.max(p10, p25);
      p50 = Math.max(p25, p50);
      p75 = Math.max(p50, p75);
      p90 = Math.max(p75, p90);
    }

    forecastPoints.push({
      step,
      date: `${curY}-${String(curM).padStart(2, "0")}-01`,
      p10,
      p25,
      p50,
      p75,
      p90,
      uncertaintyPct: Number(((p90 - p10) / p50 * 100).toFixed(1))
    });
  }

  // Probability of rising at horizon: fraction of simulated paths above last close
  const probabilityOfRise = paths.filter(p => p[H - 1] > lastClose).length / SIMS;

  const finalForecast = forecastPoints[forecastPoints.length - 1];
  const predictedPrice = finalForecast.p50;
  const expectedReturnPct = ((predictedPrice - lastClose) / lastClose) * 100;
  const annualizedVol = residVol * Math.sqrt(12);

  return {
    forecastPoints,
    predictedPrice,
    expectedReturnPct,
    lastClose,
    annualizedVol,
    trendBlend,
    longRunSlope,
    gap,
    varianceRatio,
    revWeight,
    harmonics,
    phi,
    residVol,
    probabilityOfRise
  };
}

// ---------- in-memory cache for batch forecasts (10 min per symbol/horizon) ----------
const memoryForecastCache = new Map();
const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;

function getCachedMemoryForecast(symbol, H) {
  const key = `${symbol}:${H}`;
  const item = memoryForecastCache.get(key);
  if (!item) return null;
  if (Date.now() - item.cachedAt > MEMORY_CACHE_TTL_MS) {
    memoryForecastCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedMemoryForecast(symbol, H, data) {
  const key = `${symbol}:${H}`;
  memoryForecastCache.set(key, { data, cachedAt: Date.now() });
}

// Normal approximation in log space from P10-P90 (same as the Vercel API)
function probRise(last, p) {
  const sigma = (Math.log(p.p90) - Math.log(p.p10)) / (2 * 1.2816);
  if (!(sigma > 0)) return p.p50 >= last ? 100 : 0;
  const z = (Math.log(p.p50) - Math.log(last)) / sigma;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Number(((z >= 0 ? 1 - tail : tail) * 100).toFixed(1));
}

export function formatForecastPayload(row, symbol, H) {
  if (!row) return null;
  // If row is already formatted (e.g. from KV)
  if (row.forecastSeries && row.quantiles) return row;

  const finalPoint = Array.isArray(row.path) && row.path.length > 0 ? row.path[row.path.length - 1] : null;
  const lastClose = Number(row.last_close);
  const predictedPrice = Number(row.p50);
  const expectedReturnPct = Number((((predictedPrice - lastClose) / lastClose) * 100).toFixed(2));
  const calib = getCalibration();
  const factors = calib ? getFactorsForHorizon(H, calib) : null;
  const calibrationPayload = factors ? {
    coverage80: factors.coverageAfter80,
    n: factors.n
  } : {
    calibrated: true
  };

  const isTfm = row.model === "timesfm-2.5";
  const isV4 = row.model === "perdata-engine-v4";
  const label = row.model === ENGINE.id ? ENGINE.label : isV4 || isTfm ? "PerData Engine v4" : null;

  return {
    symbol,
    model: row.model || (isTfm ? "timesfm-2.5" : "engine-v3"),
    architecture: label || "PerData Engine v3 (tendencia amortiguada + reversión al ancla + abanico OU)",
    runAt: row.run_at,
    calibration: calibrationPayload,
    horizonMonths: H,
    horizonLabel: `${H} Meses`,
    horizonDate: finalPoint ? finalPoint.date : null,
    lastObservedPrice: lastClose,
    lastObservedDate: row.path?.[0]?.date || null,
    predictedPrice,
    expectedReturnPct,
    trend: expectedReturnPct >= 0 ? "Alcista (Bullish)" : "Bajista / Lateral (Bearish)",
    volatilityAnnualized: Number(((Math.abs(expectedReturnPct) / Math.sqrt(H / 12))).toFixed(1)),
    probabilityOfRise: probRise(lastClose, { p10: Number(row.p10), p50: predictedPrice, p90: Number(row.p90) }),
    quantiles: {
      p10: Number(row.p10),
      p25: Number(row.p25),
      p50: Number(row.p50),
      p75: Number(row.p75),
      p90: Number(row.p90)
    },
    metrics: {
      confidenceLevel: "80% (P10 - P90)",
      driftDirection: expectedReturnPct >= 0 ? "Alcista (Bullish)" : "Bajista / Lateral (Bearish)",
      modelArchitecture: label || "PerData Engine v3",
      batchRunAt: row.run_at
    },
    forecastSeries: row.path
  };
}

export async function fetchPrecomputedForecast(symbol, H) {
  // 1. Memoria en el isolate
  const mem = getCachedMemoryForecast(symbol, H);
  if (mem) return mem;

  // 2. Today's PerData Engine (Supabase, written by precompute-engine.js after the daily batch)
  const sbUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const sbKey = process.env.SUPABASE_SERVICE_KEY || "";
  if (sbUrl && sbKey) {
    try {
      const r = await fetch(`${sbUrl}/rest/v1/forecasts?symbol=eq.${encodeURIComponent(symbol)}&horizon=eq.${H}&model=eq.${ENGINE.id}&select=*&limit=1`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        signal: AbortSignal.timeout(2000)
      });
      const rows = r.ok ? await r.json() : [];
      if (rows[0] && (Date.now() - Date.parse(rows[0].run_at)) < 48 * 36e5) {
        const payload = formatForecastPayload(rows[0], symbol, H);
        setCachedMemoryForecast(symbol, H, payload);
        return payload;
      }
    } catch (e) {
      // Continuar con KV
    }
  }

  // 3. Cloudflare KV (PERDATA_KV)
  const kv = globalThis.PERDATA_KV || globalThis.__PERDATA_KV__;
  if (kv && typeof kv.get === "function") {
    try {
      const kvKey = `forecast:${symbol}:${H}`;
      const kvData = await kv.get(kvKey, "json");
      if (kvData) {
        setCachedMemoryForecast(symbol, H, kvData);
        return kvData;
      }
    } catch (e) {
      // Continuar con Supabase
    }
  }

  // 3. Supabase REST API (tabla 'forecasts' con service_role)
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";

  if (supabaseUrl && serviceKey) {
    try {
      const url = `${supabaseUrl}/rest/v1/forecasts?symbol=eq.${encodeURIComponent(symbol)}&horizon=eq.${H}&select=*&order=run_at.desc&limit=1`;
      const res = await fetch(url, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        },
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const formatted = formatForecastPayload(rows[0], symbol, H);
          setCachedMemoryForecast(symbol, H, formatted);
          return formatted;
        }
      }
    } catch (e) {
      // Timeout o fallo de red
    }
  }

  // 4. Caché local en disco (en entornos Node.js locales o pruebas)
  try {
    if (typeof import.meta?.url === "string") {
      const localCachePath = new URL("../data/timesfm-forecasts-cache.json", import.meta.url);
      if (typeof fs?.existsSync === "function" && fs.existsSync(localCachePath)) {
        const allRows = JSON.parse(fs.readFileSync(localCachePath, "utf-8"));
        const match = allRows.find(r => r.symbol === symbol && r.horizon === H);
        if (match) {
          const formatted = formatForecastPayload(match, symbol, H);
          setCachedMemoryForecast(symbol, H, formatted);
          return formatted;
        }
      }
    }
  } catch (e) {}

  return null;
}

// ---------- express-style handler ----------
const SYMBOL_REGEX = /^[A-Za-z0-9=.\-^]{1,20}$/;

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (handleRateLimit(req, res)) {
    return;
  }

  let body = {};
  if (req.method === "POST") {
    if (typeof req.body === "string") { try { body = JSON.parse(req.body); } catch (e) { body = {}; } }
    else if (req.body) body = req.body;
  }
  const query = req.query || {};
  const rawSymbol = String(body.symbol || query.symbol || "BVN").trim();
  if (!SYMBOL_REGEX.test(rawSymbol)) {
    return res.status(400).json({ error: "Símbolo de activo no válido." });
  }
  const symbol = rawSymbol;
  const rawHorizon = parseInt(body.horizon || query.horizon || "1", 10);
  const H = Math.max(1, Math.min(48, isNaN(rawHorizon) ? 1 : rawHorizon));

  const hasAuth = Boolean(req.headers?.authorization);

  // The homepage chart draws the 3-month path of USD/PEN for everyone (real monthly points)
  const showcase = symbol === "PEN=X" && H <= 3;
  if (!showcase && !canUseHorizon(PLANS.anon, H)) {
    const plan = planForUser(await getAuthUserOrNull(req));
    setCdnCache(res, true);
    if (!canUseHorizon(plan, H)) {
      return res.status(403).json(upgradeRequired(plan, "horizon"));
    }
  } else {
    setCdnCache(res, hasAuth);
  }

  // Lectura directa de proyecciones precalculadas (KV / Supabase)
  // El Worker NO ejecuta Monte Carlo ni 400 trayectorias bajo ninguna circunstancia.
  try {
    const forecast = await fetchPrecomputedForecast(symbol, H);
    if (forecast) {
      return res.status(200).json(forecast);
    }

    // Si falta la combinación en el lote precalculado, responder con error claro y nunca con datos inventados
    return res.status(404).json({
      success: false,
      error: `Proyección no disponible en el lote diario para el activo ${symbol} y horizonte ${H} meses.`,
      code: "forecast_not_precomputed",
      symbol,
      horizon: H
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "Error interno al recuperar la proyección precalculada.",
      details: e.message
    });
  }
}
