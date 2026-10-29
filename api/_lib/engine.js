/** PerData Engine v6 hybrid, shared by the daily precompute and API consumers. */
import params from "./engine-params.json" with { type: "json" };

export const ENGINE = { id: "perdata-engine-v6", label: "PerData Engine v6" };
// Ordered newest-to-oldest. The active engine is filtered out by readers.
export const ENGINE_FALLBACKS = ["perdata-engine-v5"];
export const WEIGHTS = [[1, 0.75], [6, 0.8], [12, 0.9], [48, 0.95]];
export const K80 = [[1, 1.04], [3, 1.18], [6, 1.21], [12, 1.4], [24, 1.41], [36, 1.5], [48, 1.72]];

function interp(table, h) {
  if (h <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [h1, v1] = table[i], [h0, v0] = table[i - 1];
    if (h <= h1) return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return table.at(-1)[1];
}
function paramsAt(h) {
  const table = Object.entries(params.horizons).map(([month, value]) => [Number(month), value]);
  if (h <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [h1, p1] = table[i], [h0, p0] = table[i - 1];
    if (h <= h1) {
      const r = (h - h0) / (h1 - h0);
      return Object.fromEntries(["a", "b", "c", "K80"].map((key) => [key, p0[key] + (p1[key] - p0[key]) * r]));
    }
  }
  return table.at(-1)[1];
}
export const engineWeight = (h) => interp(WEIGHTS, h);
export const bandFactor = (h) => h <= 24 ? paramsAt(h).K80 : interp(K80, h);

const positive = (x, fallback = 0.0001) => Number.isFinite(x) && x > 0 ? Math.max(0.0001, x) : fallback;
const roundPositive = (x) => positive(Number(positive(x).toFixed(x < 10 ? 4 : 2)));

function pointFor(modelPath, timesfmPath, v3, step, calibrate) {
  const cfg = paramsAt(step);
  const t = modelPath[step - 1], v = v3[step - 1], tf = timesfmPath?.[step - 1];
  if (!t || !v || !(t.p50 > 0) || !(v.p50 > 0)) return null;
  const last = positive(Number(modelPath.last_close) || Number(t.last_close) || Number(v.last_close));
  let a, b, c, k, center, spreads;
  if (step <= 24) {
    a = cfg.a; b = cfg.b; c = tf && Number.isFinite(tf.p50) && tf.p50 > 0 ? cfg.c : 0;
    k = calibrate ? cfg.K80 : 1;
    center = a * t.p50 + b * v.p50 + c * (tf?.p50 || 0) + (1 - a - b - c) * last;
    const modelWeight = a + c;
    spreads = (key) => {
      const tv = positive(t[key], t.p50);
      if (modelWeight === 0) return Math.log(tv / t.p50);
      const f = tf && c > 0 ? positive(tf[key], tf.p50) : tv;
      return (a * Math.log(tv / t.p50) + c * Math.log(f / (tf && c > 0 ? tf.p50 : t.p50))) / modelWeight;
    };
  } else {
    a = engineWeight(step); b = 1 - a; c = 0; k = calibrate ? bandFactor(step) : 1;
    center = a * t.p50 + b * v.p50;
    spreads = (key) => a * Math.log(positive(t[key], t.p50) / t.p50) + b * Math.log(positive(v[key], v.p50) / v.p50);
  }
  const q = (key) => positive(center * Math.exp(Math.max(-700, Math.min(700, k * spreads(key)))));
  const p10 = Math.min(q("p10"), q("p25"), center), p25 = Math.min(center, Math.max(p10, q("p25")));
  const p50 = positive(center), p75 = Math.max(p50, q("p75")), p90 = Math.max(p75, q("p90"));
  return { p10: roundPositive(p10), p25: roundPositive(p25), p50: roundPositive(p50), p75: roundPositive(p75), p90: roundPositive(p90) };
}

// modelPath and timesfmPath are arrays of monthly quantiles; v3Points is the local model path.
export function blendEngine(modelPath, v3Points, H, { calibrate = true, timesfmPath = modelPath.timesfm } = {}) {
  const out = [];
  for (let i = 0; i < H; i++) {
    const q = pointFor(modelPath, timesfmPath, v3Points, i + 1, calibrate);
    if (!q) return null;
    // Interpolate the two calibrated endpoint distributions through the 24–36 month transition.
    if (i + 1 > 24 && i + 1 < 36) {
      const ratio = (i + 1 - 24) / 12;
      const left = pointFor(modelPath, timesfmPath, v3Points, 24, calibrate);
      const right = pointFor(modelPath, timesfmPath, v3Points, 36, calibrate);
      // Shorter paths (backtest cuts near the end of the history) have no 36-month point to blend toward
      if (left && right) {
        for (const key of ["p10", "p25", "p50", "p75", "p90"]) q[key] = positive(left[key] + (right[key] - left[key]) * ratio);
        q.p25 = Math.min(q.p50, Math.max(q.p10, q.p25)); q.p75 = Math.max(q.p50, q.p75);
        q.p10 = Math.min(q.p10, q.p25); q.p90 = Math.max(q.p75, q.p90);
      }
    }
    const vals = [q.p10, q.p25, q.p50, q.p75, q.p90].map(roundPositive);
    out.push({ step: i + 1, date: v3Points[i].date, p10: vals[0], p25: vals[1], p50: vals[2], p75: vals[3], p90: vals[4],
      uncertaintyPct: Number((((vals[4] - vals[0]) / vals[2]) * 100).toFixed(1)) });
  }
  return out;
}
