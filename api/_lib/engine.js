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
  for (let i = 0; i < H; i++) {
    const t = modelPath[i];
    const v = v3Points[i];
    if (!t || !v || !(t.p50 > 0) || !(v.p50 > 0)) return null;
    const w = engineWeight(i + 1);
    const k = calibrate ? bandFactor(i + 1) : 1;
    const p50 = w * t.p50 + (1 - w) * v.p50;
    const q = (key) => p50 * Math.exp(k * (w * Math.log(t[key] / t.p50) + (1 - w) * Math.log(v[key] / v.p50)));
    const p10 = q("p10"), p25 = Math.max(p10, q("p25")), p75 = Math.max(p50, q("p75")), p90 = Math.max(p75, q("p90"));
    const r = (x) => Number(x.toFixed(x < 10 ? 4 : 2));
    out.push({ step: i + 1, date: v.date, p10: r(Math.min(p10, p25)), p25: r(Math.min(p25, p50)), p50: r(p50), p75: r(p75), p90: r(p90),
      uncertaintyPct: Number(((p90 - p10) / p50 * 100).toFixed(1)) });
  }
  return out;
}
