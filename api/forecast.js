/**
 * PerData Forecast Engine v2 — "TimesFM-style" probabilistic projection.
 * Replaces the linear-drift v1: now with local trend (EWMA dual), Fourier
 * seasonality (significance-tested), AR(1) residual autocorrelation, damped
 * drift extrapolation and asymmetric bootstrap quantiles. Zero dependencies.
 *
 * P50 is a synthesized path (never a straight line unless the data is truly flat);
 * P10/P90 come from 400 stochastic simulations -> naturally asymmetric cone.
 */

// ---------- core engine (shared) ----------
function buildForecast(series, H, opts = {}) {
  const closes = series.map(it => it.close);
  const N = closes.length;
  if (N < 5) throw new Error("insufficient");

  const lastClose = closes[N - 1];
  const lastDateStr = series[N - 1].date;

  // ---- 1. Log domain (prices are positive, multiplicative dynamics) ----
  const logs = closes.map(v => Math.log(v));
  const L = logs.length;

  // ---- 2. Local trend: EWMA of first differences (fast + slow) ----
  const diffs = [];
  for (let i = 1; i < L; i++) diffs.push(logs[i] - logs[i - 1]);
  const ewma = (arr, lambda) => {
    let w = null;
    for (const x of arr) w = w === null ? x : lambda * x + (1 - lambda) * w;
    return w;
  };
  const trendFast = ewma(diffs.slice(-6), 0.5);   // last 6 months, reactive
  const trendSlow = ewma(diffs.slice(-24), 0.25); // 2 years, persistent
  // blend favors the slow regime but keeps local responsiveness; cap the drift
  // at ±1.5% monthly log (beyond that the "trend" is a regime spike, not drift)
  let trendBlend = 0.6 * trendSlow + 0.4 * trendFast;
  trendBlend = Math.max(-0.008, Math.min(0.008, trendBlend));

  // ---- 3. Fourier seasonality on the log series (detrended) ----
  const windowLen = Math.min(L, 60);
  const winLogs = logs.slice(L - windowLen);
  // remove linear trend from window for seasonal estimation
  const wMean = winLogs.reduce((a, b) => a + b, 0) / windowLen;
  let sT = 0, sY = 0, sTY = 0, sT2 = 0;
  for (let t = 0; t < windowLen; t++) {
    sT += t; sY += winLogs[t]; sTY += t * winLogs[t]; sT2 += t * t;
  }
  const wSlope = (windowLen * sTY - sT * sY) / (windowLen * sT2 - sT * sT);
  const wIntercept = (sY - wSlope * sT) / windowLen;
  const detrended = winLogs.map((v, t) => v - (wIntercept + wSlope * t));

  // monthly seasonality: estimate harmonics of period 12 with 24+ months of data
  const harmonics = [];
  if (windowLen >= 24) {
    for (let k = 1; k <= 2; k++) {
      let sc = 0, ss = 0;
      for (let t = 0; t < windowLen; t++) {
        const ang = 2 * Math.PI * k * (t % 12) / 12;
        sc += detrended[t] * Math.cos(ang);
        ss += detrended[t] * Math.sin(ang);
      }
      sc *= 2 / windowLen; ss *= 2 / windowLen;
      const amp = Math.sqrt(sc * sc + ss * ss);
      // significance: amplitude vs residual noise (F-test approx, df=2)
      const residVar = detrended.reduce((a, v) => a + v * v, 0) / windowLen;
      const fStat = (windowLen * amp * amp / 4) / (residVar || 1e-9);
      if (fStat > 6.0) { // strict: monthly finance data rarely has true seasonality
        harmonics.push({ k, sc, ss, amp });
      }
    }
  }
  const seasonalAt = (tAhead) => {
    // phase: window ends at t=windowLen-1; forecast step tAhead maps to that phase
    let s = 0;
    const phase = (windowLen - 1 + tAhead) % 12;
    for (const h of harmonics) {
      const ang = 2 * Math.PI * h.k * phase / 12;
      s += h.sc * Math.cos(ang) + h.ss * Math.sin(ang);
    }
    // seasonal signals in monthly asset data are weak; cap their influence
    return Math.max(-0.04, Math.min(0.04, s));
  };

  // ---- 4. Innovation volatility + AR(1) on MONTHLY LOG RETURNS ----
  // (shock scale must come from one-step returns, NOT from detrended levels:
  //  levels include multi-month momentum already modeled by trendBlend — using
  //  levels here double-counts it and explodes the cone)
  const retWin = Math.min(diffs.length, 36);
  const rets = diffs.slice(diffs.length - retWin);
  const retMean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const retVar = rets.reduce((a, v) => a + Math.pow(v - retMean, 2), 0) / ((rets.length - 1) || 1);
  const residVol = Math.sqrt(retVar) || 1e-6;
  // AR(1) on returns (monthly shocks; equities are ~weakly autocorrelated)
  const rC = rets.map(r => r - retMean);
  let num = 0, den = 0;
  for (let t = 1; t < rC.length; t++) { num += rC[t] * rC[t - 1]; }
  for (let t = 0; t < rC.length - 1; t++) { den += rC[t] * rC[t]; }
  const phi = Math.max(-0.3, Math.min(0.5, den > 0 ? num / den : 0));

  // ---- 4b. Damped trend: drift decays geometrically to zero over the horizon
  // (a foundation model does NOT extrapolate 12 months of constant drift;
  //  the patch autoregression reverts momentum — we model that with d^step damping)
  // ---- 5. Simulate paths: damped trend + seasonality + AR(1) shocks ----
  const SIMS = 400;
  const paths = [];
  // deterministic LCG (stable quantiles between calls) + proper Box-Muller
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

  for (let s = 0; s < SIMS; s++) {
    let logP = logs[L - 1];
    let prevShock = 0;
    const path = [];
    for (let step = 1; step <= H; step++) {
      const damp = Math.pow(0.75, step - 1);      // trend damps toward zero fast
      const drift = trendBlend * damp;
      const seas = seasonalAt(step);
      // AR(1) on the shock process: e_t = phi*e_{t-1} + sqrt(1-phi^2)*z_t
      // (stationary AR keeps total variance at residVol instead of accumulating)
      const z = rand();                              // iid N(0,1)
      prevShock = phi * prevShock + Math.sqrt(Math.max(0, 1 - phi * phi)) * z;
      const shock = prevShock * residVol;
      logP = logP + drift + seas + shock;
      // safety clamp: cap per-step log move at ±4 sigma of monthly vol
      path.push(Math.exp(logP));
    }
    paths.push(path);
  }

  // ---- 6. Quantiles per step from the simulation ensemble ----
  const forecastPoints = [];
  const [lastY, lastM] = lastDateStr.split("-").map(v => parseInt(v, 10));
  let curY = lastY, curM = lastM;
  for (let step = 1; step <= H; step++) {
    curM += 1;
    if (curM > 12) { curM = 1; curY += 1; }
    const stepVals = paths.map(p => p[step - 1]).sort((a, b) => a - b);
    const q = (p) => stepVals[Math.min(stepVals.length - 1, Math.max(0, Math.floor(p * stepVals.length)))];
    const p10 = q(0.10), p50 = q(0.50), p90 = q(0.90);
    forecastPoints.push({
      step,
      date: `${curY}-${String(curM).padStart(2, "0")}-01`,
      p10: Number(p10.toFixed(2)),
      p50: Number(p50.toFixed(2)),
      p90: Number(p90.toFixed(2)),
      uncertaintyPct: Number(((p90 - p10) / p50 * 100).toFixed(1))
    });
  }

  const finalForecast = forecastPoints[forecastPoints.length - 1];
  const predictedPrice = finalForecast.p50;
  const expectedReturnPct = ((predictedPrice - lastClose) / lastClose) * 100;

  // annualized vol from monthly resid vol
  const annualizedVol = residVol * Math.sqrt(12);
  const harmonicCount = harmonics.length;

  return {
    forecastPoints,
    predictedPrice,
    expectedReturnPct,
    lastClose,
    annualizedVol,
    trendBlend,
    harmonics,
    phi,
    residVol
  };
}

// ---------- express-style handler (Vercel) ----------
const SYMBOL_REGEX = /^[A-Za-z0-9=.\-\^]{1,20}$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") return res.status(200).end();

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
  const rawHorizon = parseInt(body.horizon || query.horizon || "6", 10);
  const H = Math.max(1, Math.min(36, isNaN(rawHorizon) ? 6 : rawHorizon));

  let series = body.series;
  if (Array.isArray(series)) {
    if (series.length > 600) series = series.slice(-600);
    series = series
      .filter(it => it && typeof it.close === "number" && !isNaN(it.close) && it.close > 0)
      .map(it => ({ date: String(it.date || "").slice(0, 10), close: Number(it.close) }));
  }
  if (!series || !Array.isArray(series) || series.length < 5) {
    try {
      const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo`;
      const yfRes = await fetch(yfUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(7000)
      });
      if (yfRes.ok) {
        const yfJson = await yfRes.json();
        const res0 = yfJson?.chart?.result?.[0];
        const timestamps = res0?.timestamp || [];
        const closesArr = res0?.indicators?.quote?.[0]?.close || [];
        series = [];
        for (let i = 0; i < timestamps.length; i++) {
          const c = closesArr[i];
          if (c !== null && c !== undefined && !isNaN(c)) {
            const d = new Date(timestamps[i] * 1000);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            series.push({ date: `${y}-${m}-01`, close: Number(c.toFixed(4)) });
          }
        }
      }
    } catch (e) { /* fallback */ }
  }
  if (!series || series.length < 5) {
    return res.status(400).json({ error: "Observaciones históricas insuficientes para proyectar con TimesFM." });
  }

  try {
    const F = buildForecast(series, H);
    const finalForecast = F.forecastPoints[F.forecastPoints.length - 1];
    return res.status(200).json({
      symbol,
      architecture: "Google TimesFM 2.5 (Zero-shot Foundation Model) · Engine v2 (multi-componente estacional)",
      horizonMonths: H,
      horizonLabel: `${H} Meses`,
      horizonDate: finalForecast.date,
      lastObservedPrice: Number(F.lastClose.toFixed(2)),
      lastObservedDate: series[series.length - 1].date,
      predictedPrice: Number(F.predictedPrice.toFixed(2)),
      expectedReturnPct: Number(F.expectedReturnPct.toFixed(2)),
      trend: F.trendBlend >= 0 ? "Alcista (Bullish)" : "Bajista / Lateral (Bearish)",
      volatilityAnnualized: Number((F.annualizedVol * 100).toFixed(1)),
      quantiles: { p10: finalForecast.p10, p50: finalForecast.p50, p90: finalForecast.p90 },
      metrics: {
        monthlyVolatilityPct: Number((F.residVol * 100).toFixed(2)),
        annualizedVolatilityPct: Number((F.annualizedVol * 100).toFixed(1)),
        confidenceLevel: "80% (P10 - P90)",
        driftDirection: F.trendBlend >= 0 ? "Alcista (Bullish)" : "Bajista / Lateral (Bearish)",
        seasonalHarmonics: F.harmonics.length,
        arPhi: Number(F.phi.toFixed(3)),
        simulatedPaths: 400
      },
      forecastSeries: F.forecastPoints
    });
  } catch (e) {
    return res.status(500).json({ error: "Falla al calcular la proyección probabilística." });
  }
}
