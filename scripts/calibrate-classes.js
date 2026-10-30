// Per asset class calibration of the P50 mix (Chronos-2, TimesFM, no change) on the saved backtest.
// Reports the cross-validated gain over the single pooled mix and never writes engine-params.json.
// Usage: node scripts/calibrate-classes.js [artifact-directory]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildForecast } from "../api/forecast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.argv[2] || "/home/wagustin/kathy_workspace/handoff/bt_data";
const HS = [1, 3, 6, 12, 24, 36, 48];
const history = JSON.parse(fs.readFileSync(path.join(DIR, "history", "history-120.json"), "utf8"));
const chronos = JSON.parse(fs.readFileSync(path.join(DIR, "bt-chronos2", "chronos2.json"), "utf8")).forecasts;
const timesfm = JSON.parse(fs.readFileSync(path.join(DIR, "bt-timesfm", "timesfm.json"), "utf8")).forecasts;

const v3 = {};
for (const key of Object.keys(chronos)) {
  const [sym, cut] = key.split("|");
  try {
    const points = buildForecast(history[sym].slice(0, -1).slice(0, Number(cut)), 48).forecastPoints;
    v3[key] = points.map((p) => [p.p10, p.p25, p.p50, p.p75, p.p90]);
  } catch { /* insufficient history */ }
}
const half = (sym) => [...sym].reduce((n, c) => n + c.charCodeAt(0), 0) % 2;
const mape = (rows) => rows.length ? rows.reduce((n, r) => n + Math.abs(r.p50 / r.actual - 1), 0) / rows.length * 100 : Infinity;
const quantile = (xs, q) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
function rowsAt(h) {
  return Object.keys(chronos).flatMap((key) => {
    const [sym, cut] = key.split("|");
    const T = Number(cut), closes = history[sym]?.slice(0, -1).map((x) => x.close);
    const ch = chronos[key]?.[h - 1], tf = timesfm[key]?.[h - 1], own = v3[key]?.[h - 1];
    if (!closes || T + h - 1 >= closes.length || !ch || !tf || !own || ch[2] <= 0 || tf[2] <= 0) return [];
    return [{ key, sym, last: closes[T - 1], actual: closes[T + h - 1], chronos: ch, timesfm: tf, own }];
  });
}
function blended(row, a, b, c) {
  const d = 1 - a - b - c;
  const p50 = a * row.chronos[2] + c * row.timesfm[2] + b * row.own[2] + d * row.last;
  const modelWeight = a + c;
  const chWeight = modelWeight ? a / modelWeight : 1;
  const tfWeight = modelWeight ? c / modelWeight : 0;
  const q = (i) => p50 * Math.exp(chWeight * Math.log(row.chronos[i] / row.chronos[2])
    + tfWeight * Math.log(row.timesfm[i] / row.timesfm[2]));
  return { ...row, p10: q(0), p50, p90: q(4) };
}
const need = (r) => {
  const delta = Math.log(r.actual / r.p50);
  const side = delta >= 0 ? Math.log(r.p90 / r.p50) : Math.log(r.p10 / r.p50);
  return side ? delta / side : Infinity;
};

export const classOf = (sym) => sym.endsWith(".LM") ? "acciones_lima" : sym.endsWith("=X") ? "divisas"
  : sym.endsWith("=F") ? "materias_primas" : sym.startsWith("^") ? "tasas_indices" : "series_oficiales";
const pooled = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "_lib", "engine-params.json"), "utf8")).horizons;
const pooledAt = (h) => {
  const hs = Object.keys(pooled).map(Number).sort((x, y) => x - y);
  const hit = hs.find((k) => k >= h) ?? hs.at(-1), p = pooled[hit];
  return h > 24 ? { a: 0, b: 0, c: 0 } : p; // beyond 24 months the engine keeps the v5 blend, not scored here
};
const grid = [];
for (let ai = 0; ai <= 10; ai++) for (let ci = 0; ci + ai <= 10; ci++) grid.push([ai / 10, ci / 10]);
const mix = (r, a, c) => blended(r, a, 0, c);
const choose = (part) => grid.reduce((best, [a, c]) => {
  const value = mape(part.map((r) => mix(r, a, c)));
  return value < best.value ? { a, c, value } : best;
}, { a: 0, c: 0, value: Infinity });

const report = {};
for (const h of [1, 3, 6, 12, 24]) {
  const rows = rowsAt(h);
  for (const cls of [...new Set(rows.map((r) => classOf(r.sym)))]) {
    const part = rows.filter((r) => classOf(r.sym) === cls);
    const syms = new Set(part.map((r) => r.sym));
    if (syms.size < 4) continue;
    const A = part.filter((r) => half(r.sym) === 0), B = part.filter((r) => half(r.sym) === 1);
    if (!A.length || !B.length) continue;
    const ab = choose(A), ba = choose(B), full = choose(part);
    const out = [...B.map((r) => mix(r, ab.a, ab.c)), ...A.map((r) => mix(r, ba.a, ba.c))];
    const p = pooledAt(h);
    const pooledOut = part.map((r) => blended(r, p.a, p.b, p.c));
    const naive = mape(part.map((r) => ({ ...r, p50: r.last })));
    const k80 = quantile(part.map((r) => need(mix(r, full.a, full.c))), .8);
    const cover = part.filter((r) => need(mix(r, full.a, full.c)) <= k80).length / part.length * 100;
    (report[cls] ||= {})[h] = { n: part.length, activos: syms.size, a: full.a, c: full.c,
      mapeClaseCV: Number(mape(out).toFixed(2)), mapeMezclaGlobal: Number(mape(pooledOut).toFixed(2)),
      naive: Number(naive.toFixed(2)), K80: Number(k80.toFixed(2)), cobertura: Number(cover.toFixed(1)) };
  }
}
console.log(JSON.stringify(report, null, 1));
