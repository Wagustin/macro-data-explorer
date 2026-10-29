/**
 * PerData Engine v5 blend (Chronos-2 + Engine v3), shared by the daily precompute
 * (scripts/precompute-engine.js) and the backtest (scripts/backtest-evaluate.js).
 * Weights and band factors come from the rolling backtest of 27-Oct-2026 (118 assets,
 * 763 to 1617 evaluations per horizon; backtest.yml): Chronos-2 carries most of the weight,
 * v3 adds a little at short horizons.
 * P50 = w·Chronos-2 + (1-w)·v3; each quantile's log-distance to the P50 is blended the same way
 * and then stretched by K80 so the P10-P90 band holds ~80 % of real closes at that horizon.
 */
export const ENGINE = { id: "perdata-engine-v5", label: "PerData Engine v5" };
// Ordered newest-to-oldest. The active engine is filtered out by readers.
export const ENGINE_FALLBACKS = ["perdata-engine-v5", "perdata-engine-v4"];

// [months, weight of Chronos-2], linearly interpolated, flat after the last point
export const WEIGHTS = [[1, 0.75], [6, 0.8], [12, 0.9], [48, 0.95]];
// [months, band factor], measured on the blend above (out-of-sample coverage ~80 %)
export const K80 = [[1, 1.04], [3, 1.18], [6, 1.21], [12, 1.4], [24, 1.41], [36, 1.5], [48, 1.72]];

function interp(table, h) {
  if (h <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [h1, v1] = table[i];
    const [h0, v0] = table[i - 1];
    if (h <= h1) return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return table[table.length - 1][1];
}
export const engineWeight = (h) => interp(WEIGHTS, h);
export const bandFactor = (h) => interp(K80, h);

// modelPath / v3Points: [{p10, p25, p50, p75, p90, date?}] per month. calibrate=false is for the backtest.
export function blendEngine(modelPath, v3Points, H, { calibrate = true } = {}) {
  const out = [];
  const positiveFinite = (x, fallback = 0.0001) => Number.isFinite(x) && x > 0 ? Math.max(0.0001, x) : fallback;
  const roundedPositive = (x) => {
    const safe = positiveFinite(x);
    const rounded = Number(safe.toFixed(safe < 10 ? 4 : 2));
    return positiveFinite(rounded);
  };
  for (let i = 0; i < H; i++) {
    const t = modelPath[i];
    const v = v3Points[i];
    if (!t || !v || !Number.isFinite(t.p50) || !(t.p50 > 0) || !Number.isFinite(v.p50) || !(v.p50 > 0)) return null;
    const w = engineWeight(i + 1);
    const k = calibrate ? bandFactor(i + 1) : 1;
    const p50 = positiveFinite(w * t.p50 + (1 - w) * v.p50);
    const q = (key) => {
      const tv = positiveFinite(t[key], t.p50), vv = positiveFinite(v[key], v.p50);
      const logDistance = k * (w * Math.log(tv / t.p50) + (1 - w) * Math.log(vv / v.p50));
      return positiveFinite(p50 * Math.exp(Math.max(-700, Math.min(700, logDistance))));
    };
    const p10 = q("p10"), p25 = Math.max(p10, q("p25")), p75 = Math.max(p50, q("p75")), p90 = Math.max(p75, q("p90"));
    const q10 = roundedPositive(Math.min(p10, p25));
    const q25 = roundedPositive(Math.min(p25, p50));
    const q50 = roundedPositive(p50);
    const q75 = roundedPositive(p75);
    const q90 = roundedPositive(p90);
    const out10 = Math.min(q10, q50);
    const out25 = Math.min(q50, Math.max(out10, q25));
    const out75 = Math.max(q50, q75);
    const out90 = Math.max(out75, q90);
    out.push({ step: i + 1, date: v.date, p10: out10, p25: out25, p50: q50, p75: out75, p90: out90,
      uncertaintyPct: Number((((out90 - out10) / q50) * 100).toFixed(1)) });
  }
  return out;
}
