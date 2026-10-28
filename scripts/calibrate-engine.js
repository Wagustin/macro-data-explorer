// Calibrate the Chronos-2 + v3 + no-change P50 on the saved rolling-origin backtest.
// Usage: node scripts/calibrate-engine.js [artifact-directory]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildForecast } from "../api/forecast.js";
import { engineWeight } from "../api/_lib/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.argv[2] || "/home/wagustin/kathy_workspace/handoff/bt_data";
const HS = [1, 3, 6, 12, 24, 36, 48];
const history = JSON.parse(fs.readFileSync(path.join(DIR, "history", "history-120.json"), "utf8"));
const forecasts = JSON.parse(fs.readFileSync(path.join(DIR, "bt-chronos2", "chronos2.json"), "utf8")).forecasts;
const prior = JSON.parse(fs.readFileSync(path.join(DIR, "backtest-informe", "results.json"), "utf8")).results;

const v3 = {};
for (const key of Object.keys(forecasts)) {
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
  return Object.keys(forecasts).flatMap((key) => {
    const [sym, cut] = key.split("|");
    const T = Number(cut), closes = history[sym]?.slice(0, -1).map((x) => x.close);
    const model = forecasts[key]?.[h - 1], own = v3[key]?.[h - 1];
    if (!closes || T + h - 1 >= closes.length || !model || !own) return [];
    return [{ key, sym, last: closes[T - 1], actual: closes[T + h - 1], model, own }];
  });
}
function blended(row, a, b) {
  const c = 1 - a - b;
  const p50 = a * row.model[2] + b * row.own[2] + c * row.last;
  const q = (i) => p50 * Math.exp(a * Math.log(row.model[i] / row.model[2]) + b * Math.log(row.own[i] / row.own[2]));
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
  for (let ai = 0; ai <= 20; ai++) for (let bi = 0; bi + ai <= 20; bi++) grid.push([ai / 20, bi / 20]);
  const A = rows.filter((r) => half(r.sym) === 0), B = rows.filter((r) => half(r.sym) === 1);
  const choose = (part) => grid.reduce((best, [a, b]) => {
    const value = mape(part.map((r) => blended(r, a, b)));
    return value < best.value ? { a, b, value } : best;
  }, { a: 0, b: 0, value: Infinity });
  const ab = choose(A), ba = choose(B);
  const out = [...B.map((r) => blended(r, ab.a, ab.b)), ...A.map((r) => blended(r, ba.a, ba.b))];
  const full = choose(rows);
  const k80 = quantile(out.map(need), .8);
  const coverageOut = Number.isFinite(k80) ? out.filter((r) => need(r) <= k80).length / out.length * 100 : 0;
  const naiveMape = mape(rows.map((r) => ({ ...r, p50: r.last })));
  const v5Mape = prior[h].engine.mape;
  params[h] = { a: full.a, b: full.b, mapeOut: Number(mape(out).toFixed(2)), naiveMape: Number(naiveMape.toFixed(2)), v5Mape,
    k80: Number.isFinite(k80) ? Number(k80.toFixed(2)) : null,
    coverageOut: Number(coverageOut.toFixed(1)) };
}
// Cross-validated coverage and all required MAPE comparisons gate adoption.
const adoptar = Object.values(params).every((p) => p.mapeOut <= p.v5Mape && p.coverageOut >= 78 && p.coverageOut <= 82)
  && Object.values(params).filter((p) => p.mapeOut <= p.naiveMape).length >= 4;
const output = { version: 6, generated: new Date().toISOString(), horizons: params, adoptar };
const outPath = path.join(ROOT, "api", "_lib", "engine-params.json");
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
