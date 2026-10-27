// Scores the rolling-origin backtest (backtest.yml). Reads the raw model paths written by
// scripts/backtest_models.py, runs Engine v3 on the same cuts, and for each horizon reports:
//  - MAPE of the P50 against the real close,
//  - k80: how much the P10-P90 log-distance must be stretched to hold 80 % of real closes,
//    fitted on half of the assets and checked on the other half (out-of-sample coverage),
//  - the best blend weight w of each model with v3 (P50 = w·model + (1-w)·v3), cross-validated
//    the same way, and the error of today's v4 weights.
// A "no change" forecast (P50 = last close) is the baseline every model has to beat.
// Writes data/backtest/results.json and data/backtest/INFORME.md.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildForecast } from "../api/forecast.js";
import { v4Weight } from "../api/_lib/v4.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "data", "backtest");
const HS = [1, 3, 6, 12, 24, 36, 48];
const history = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "history-120.json"), "utf8"));

const models = {};
for (const name of ["timesfm", "chronos2", "tirex"]) {
  const f = path.join(DIR, `${name}.json`);
  if (fs.existsSync(f)) models[name] = JSON.parse(fs.readFileSync(f, "utf8")).forecasts;
  else console.log(`Sin resultados de ${name}`);
}
// Ensembles: each quantile is the geometric mean of the members' quantiles
function ensemble(names) {
  const srcs = names.map((n) => models[n]);
  if (srcs.some((s) => !s)) return;
  const out = {};
  for (const key of Object.keys(srcs[0])) {
    if (srcs.some((s) => !s[key])) continue;
    out[key] = srcs[0][key].map((row, i) => row.map((_, j) => Math.exp(srcs.reduce((a, s) => a + Math.log(Math.max(s[key][i][j], 1e-9)), 0) / srcs.length)));
  }
  models[names.join("+")] = out;
}
ensemble(["tirex", "chronos2"]);
ensemble(["tirex", "chronos2", "timesfm"]);
const keys = Object.keys(models.timesfm || Object.values(models)[0] || {});

// Engine v3 on every cut (same series the Python side used: last, still open month dropped)
const v3 = {};
for (const key of keys) {
  const [sym, t] = key.split("|");
  const series = history[sym].slice(0, -1).slice(0, Number(t));
  try {
    const F = buildForecast(series, 48);
    v3[key] = F.forecastPoints.map((p) => [p.p10, p.p25, p.p50, p.p75, p.p90]);
  } catch (e) { /* too short for v3 */ }
}

// One evaluation = a cut with a real close h months later
function evals(h) {
  const out = [];
  for (const key of keys) {
    const [sym, t] = key.split("|");
    const closes = history[sym].slice(0, -1).map((x) => x.close);
    const T = Number(t);
    if (T + h - 1 >= closes.length) continue;
    out.push({ key, sym, last: closes[T - 1], actual: closes[T + h - 1] });
  }
  return out;
}

const half = (sym) => [...sym].reduce((a, c) => a + c.charCodeAt(0), 0) % 2;
const mape = (rows) => rows.reduce((a, r) => a + Math.abs(r.p50 / r.actual - 1), 0) / rows.length * 100;
// stretch needed for the real close to fall inside the band
const need = (r) => {
  const d = Math.log(r.actual / r.p50);
  const side = d >= 0 ? Math.log(r.p90 / r.p50) : Math.log(r.p10 / r.p50);
  return side ? d / side : Infinity;
};
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
function calib(rows) {
  const A = rows.filter((r) => half(r.sym) === 0), B = rows.filter((r) => half(r.sym) === 1);
  const kA = quantile(A.map(need), 0.8), kB = quantile(B.map(need), 0.8);
  const inside = [...A.map((r) => need(r) <= kB), ...B.map((r) => need(r) <= kA)].filter(Boolean).length;
  const k = quantile(rows.map(need), 0.8);
  const width = quantile(rows.map((r) => (r.p90 / r.p50) ** k - (r.p10 / r.p50) ** k), 0.5) * 100;
  return { k80: Number(k.toFixed(2)), coverageOut: Number((inside / rows.length * 100).toFixed(1)),
    coverageRaw: Number((rows.filter((r) => need(r) <= 1).length / rows.length * 100).toFixed(1)), medianWidthPct: Number(width.toFixed(1)) };
}
function rowsFor(src, h, list) {
  return list.filter((e) => src[e.key] && src[e.key][h - 1]).map((e) => {
    const [p10, , p50, , p90] = src[e.key][h - 1];
    return { ...e, p10, p50, p90 };
  }).filter((r) => r.p10 > 0 && r.p50 > 0 && r.p90 > 0);
}
function blendRows(src, h, list, w) {
  return list.filter((e) => src[e.key] && v3[e.key]).map((e) => {
    const m = src[e.key][h - 1], v = v3[e.key][h - 1];
    const p50 = w * m[2] + (1 - w) * v[2];
    const q = (i) => p50 * Math.exp(w * Math.log(m[i] / m[2]) + (1 - w) * Math.log(v[i] / v[2]));
    return { ...e, p10: q(0), p50, p90: q(4) };
  }).filter((r) => r.p10 > 0 && r.p50 > 0 && r.p90 > 0);
}
// best weight, picked on one half of the assets and scored on the other
function bestWeight(src, h, list) {
  const grid = Array.from({ length: 21 }, (_, i) => i / 20);
  const pick = (part) => grid.reduce((b, w) => { const m = mape(blendRows(src, h, part, w)); return m < b.m ? { w, m } : b; }, { w: 0, m: Infinity }).w;
  const A = list.filter((e) => half(e.sym) === 0), B = list.filter((e) => half(e.sym) === 1);
  const wA = pick(A), wB = pick(B);
  const outRows = [...blendRows(src, h, B, wA), ...blendRows(src, h, A, wB)];
  const all = pick(list);
  return { w: all, mapeOut: Number(mape(outRows).toFixed(2)) };
}

const results = {};
for (const h of HS) {
  const list = evals(h).filter((e) => v3[e.key]);
  if (!list.length) continue;
  const r = { n: list.length };
  r.naive = { mape: Number(mape(list.map((e) => ({ ...e, p50: e.last }))).toFixed(2)) };
  const v3rows = rowsFor(v3, h, list);
  r.v3 = { mape: Number(mape(v3rows).toFixed(2)), ...calib(v3rows) };
  for (const [name, src] of Object.entries(models)) {
    const rows = rowsFor(src, h, list);
    if (!rows.length) continue;
    r[name] = { mape: Number(mape(rows).toFixed(2)), ...calib(rows), blendWithV3: bestWeight(src, h, list) };
  }
  if (models.timesfm) {
    const cur = blendRows(models.timesfm, h, list, v4Weight(h));
    r.v4Today = { w: Number(v4Weight(h).toFixed(2)), mape: Number(mape(cur).toFixed(2)), ...calib(cur) };
  }
  results[h] = r;
  console.log(`h=${h}`, JSON.stringify(r));
}

fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify({ generated: new Date().toISOString(), results }, null, 1));
const names = ["naive", "v3", ...Object.keys(models), "v4Today"];
let md = `# Backtest de modelos (${new Date().toISOString().slice(0, 10)})\n\n` +
  `Cortes cada 6 meses con al menos 36 meses de historia, ${Object.keys(history).length} activos. ` +
  `MAPE del P50 (menor es mejor). Cobertura fuera de muestra del rango P10-P90 tras calibrar con k80 ajustado en la otra mitad de los activos.\n\n` +
  `| Meses | n | ${names.join(" | ")} |\n|---|---|${names.map(() => "---").join("|")}|\n`;
for (const [h, r] of Object.entries(results)) md += `| ${h} | ${r.n} | ${names.map((m) => (r[m] ? r[m].mape.toFixed(1) : "-")).join(" | ")} |\n`;
md += `\n## Calibración (k80, cobertura fuera de muestra, ancho mediano del rango)\n\n| Meses | ${names.slice(1).join(" | ")} |\n|---|${names.slice(1).map(() => "---").join("|")}|\n`;
for (const [h, r] of Object.entries(results)) md += `| ${h} | ${names.slice(1).map((m) => (r[m] && r[m].k80 ? `${r[m].k80} / ${r[m].coverageOut} % / ${r[m].medianWidthPct} %` : "-")).join(" | ")} |\n`;
md += `\n## Mejor mezcla con v3 (peso del modelo, MAPE fuera de muestra)\n\n| Meses | ${Object.keys(models).join(" | ")} |\n|---|${Object.keys(models).map(() => "---").join("|")}|\n`;
for (const [h, r] of Object.entries(results)) md += `| ${h} | ${Object.keys(models).map((m) => (r[m] ? `${r[m].blendWithV3.w} / ${r[m].blendWithV3.mapeOut}` : "-")).join(" | ")} |\n`;
fs.writeFileSync(path.join(DIR, "INFORME.md"), md);
console.log(md);
