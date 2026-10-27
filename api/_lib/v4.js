/**
 * PerData Engine v4 blend (TimesFM 2.5 + Engine v3), shared by the daily precompute
 * (scripts/precompute-v4.js) and the API.
 */
// Weights from the rolling backtest of 22-Oct-2026 (118 assets, 826 evaluations per horizon;
// ~/kathy_workspace/timesfm-backtest/INFORME_V4.md), linearly interpolated, flat after 12 months.
// P50 = w·TimesFM + (1-w)·v3; each quantile's log-distance to the P50 is blended the same way
// (both inputs are already calibrated to ~80 % coverage).
export const V4_WEIGHTS = [[1, 0.48], [3, 0.30], [6, 0.43], [12, 0.58]];
export const TFM_BATCH_HORIZONS = [3, 6, 12, 24, 36, 48];

export function v4Weight(h) {
  if (h <= V4_WEIGHTS[0][0]) return V4_WEIGHTS[0][1];
  for (let i = 1; i < V4_WEIGHTS.length; i++) {
    const [h1, w1] = V4_WEIGHTS[i];
    const [h0, w0] = V4_WEIGHTS[i - 1];
    if (h <= h1) return w0 + (w1 - w0) * (h - h0) / (h1 - h0);
  }
  return V4_WEIGHTS[V4_WEIGHTS.length - 1][1];
}

export function blendV4(tfmPath, v3Points, H) {
  const out = [];
  for (let i = 0; i < H; i++) {
    const t = tfmPath[i];
    const v = v3Points[i];
    if (!t || !v || !(t.p50 > 0) || !(v.p50 > 0)) return null;
    const w = v4Weight(i + 1);
    const p50 = w * t.p50 + (1 - w) * v.p50;
    const q = (k) => p50 * Math.exp(w * Math.log(t[k] / t.p50) + (1 - w) * Math.log(v[k] / v.p50));
    const p10 = q("p10"), p25 = Math.max(p10, q("p25")), p75 = Math.max(p50, q("p75")), p90 = Math.max(p75, q("p90"));
    const r = (x) => Number(x.toFixed(x < 10 ? 4 : 2));
    out.push({ step: i + 1, date: v.date, p10: r(Math.min(p10, p25)), p25: r(Math.min(p25, p50)), p50: r(p50), p75: r(p75), p90: r(p90),
      uncertaintyPct: Number(((p90 - p10) / p50 * 100).toFixed(1)) });
  }
  return out;
}

// Normal approximation in log space from the blended P10-P90
export function probRise(last, p) {
  const sigma = (Math.log(p.p90) - Math.log(p.p10)) / (2 * 1.2816);
  if (!(sigma > 0)) return p.p50 >= last ? 100 : 0;
  const z = (Math.log(p.p50) - Math.log(last)) / sigma;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Number(((z >= 0 ? 1 - tail : tail) * 100).toFixed(1));
}

