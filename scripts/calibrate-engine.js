// Calibrate the Chronos-2 + TimesFM + v3 + no-change P50 on the saved rolling-origin backtest.
// Usage: node scripts/calibrate-engine.js [artifact-directory]
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
const prior = JSON.parse(fs.readFileSync(path.join(DIR, "backtest-informe", "results.json"), "utf8")).results;

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
const params = {};
for (const h of HS) {
  const rows = rowsAt(h);
  const grid = [];
  for (let ai = 0; ai <= 20; ai++) for (let ci = 0; ci + ai <= 20; ci++) {
    for (let bi = 0; bi + ci + ai <= 20; bi++) grid.push([ai / 20, bi / 20, ci / 20]);
  }
  const A = rows.filter((r) => half(r.sym) === 0), B = rows.filter((r) => half(r.sym) === 1);
  const choose = (part) => grid.reduce((best, [a, b, c]) => {
    const value = mape(part.map((r) => blended(r, a, b, c)));
    return value < best.value ? { a, b, c, value } : best;
  }, { a: 0, b: 0, c: 0, value: Infinity });
  const ab = choose(A), ba = choose(B);
  const trainA = A.map((r) => blended(r, ab.a, ab.b, ab.c));
  const trainB = B.map((r) => blended(r, ba.a, ba.b, ba.c));
  const testA = A.map((r) => blended(r, ba.a, ba.b, ba.c));
  const testB = B.map((r) => blended(r, ab.a, ab.b, ab.c));
  const out = [...testA, ...testB];
  const kA = quantile(trainA.map(need), .8), kB = quantile(trainB.map(need), .8);
  const coverageOut = Number(([...testB.filter((r) => need(r) <= kA), ...testA.filter((r) => need(r) <= kB)].length
    / rows.length * 100).toFixed(1));
  const full = choose(rows);
  const k80 = quantile(rows.map((r) => need(blended(r, full.a, full.b, full.c))), .8);
  const naiveMape = mape(rows.map((r) => ({ ...r, p50: r.last })));
  const v5Mape = prior[h].engine.mape;
  params[h] = { a: full.a, b: full.b, c: full.c,
    mapeOut: Number(mape(out).toFixed(2)), naiveMape: Number(naiveMape.toFixed(2)), v5Mape,
    K80: Number.isFinite(k80) ? Number(k80.toFixed(2)) : null,
    coverageOut: Number(coverageOut.toFixed(1)) };
}
const adoptar = Object.values(params).every((p) => p.mapeOut <= p.v5Mape
  && p.coverageOut >= 78 && p.coverageOut <= 82)
  && Object.values(params).filter((p) => p.mapeOut <= p.naiveMape).length >= 4;
const output = { version: 6, generated: new Date().toISOString(), horizons: params, adoptar };
const outPath = path.join(ROOT, "api", "_lib", "engine-params.json");
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
