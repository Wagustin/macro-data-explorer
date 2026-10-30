/** PerData Engine v6 simplified, shared by daily precompute and API consumers. */
import params from "./engine-params.json" with { type: "json" };

export const ENGINE = { id: "perdata-engine-v6", label: "PerData Engine v6" };
export const ENGINE_FALLBACKS = ["perdata-engine-v5"];
export const w = (h, symbol = "") => symbol.endsWith(".LM") ? 0 : Math.min(1, h / 36);

export function interpK(table, h) {
  const pts = Object.entries(table).map(([k, v]) => [Number(k), v]);
  if (h <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [h1, v1] = pts[i], [h0, v0] = pts[i - 1];
    if (h <= h1) return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return pts.at(-1)[1];
}
export const K = (h, symbol = "") => interpK(symbol.endsWith(".LM") ? params.K.lima : params.K.resto, h);

const positive = (x, fallback = 0.0001) => Number.isFinite(x) && x > 0 ? Math.max(0.0001, x) : fallback;
const roundPositive = (x) => positive(Number(positive(x).toFixed(x < 10 ? 4 : 2)));

export function blendEngine(modelPath, v3Points, H, { calibrate = true, timesfmPath = modelPath?.timesfm, symbol = modelPath?.symbol || "" } = {}) {
  const out = [];
  const last = Number(modelPath?.last_close) || Number(timesfmPath?.last_close);
  if (!(last > 0)) return null;
  for (let step = 1; step <= H; step++) {
    const tf = timesfmPath?.[step - 1], ch = modelPath?.[step - 1];
    const hasTf = tf && Number.isFinite(tf.p50) && tf.p50 > 0;
    const hasCh = ch && Number.isFinite(ch.p50) && ch.p50 > 0;
    if (!hasTf && !hasCh) return null;
    const src = hasTf ? tf : ch;
    const weight = hasTf ? w(step, symbol) : 0;
    const center = positive(hasTf ? Math.pow(last, 1 - weight) * Math.pow(src.p50, weight) : last);
    const kVal = calibrate ? K(step, symbol) : 1;
    const q = (key) => positive(center * Math.exp(Math.max(-700, Math.min(700, kVal * Math.log(positive(src[key], src.p50) / src.p50)))));
    const p10 = Math.min(q("p10"), q("p25"), center), p25 = Math.min(center, Math.max(p10, q("p25")));
    const p50 = center, p75 = Math.max(p50, q("p75")), p90 = Math.max(p75, q("p90"));
    const vals = [p10, p25, p50, p75, p90].map(roundPositive);
    vals[1] = Math.min(vals[2], Math.max(vals[0], vals[1])); vals[3] = Math.max(vals[2], Math.min(vals[4], vals[3]));
    vals[0] = Math.min(vals[0], vals[1]); vals[4] = Math.max(vals[4], vals[3]);
    out.push({ step, date: v3Points?.[step - 1]?.date, p10: vals[0], p25: vals[1], p50: vals[2], p75: vals[3], p90: vals[4],
      uncertaintyPct: Number((((vals[4] - vals[0]) / vals[2]) * 100).toFixed(1)) });
  }
  return out;
}
