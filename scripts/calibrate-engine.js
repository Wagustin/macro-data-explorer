// Calibrate PerData Engine v6 simplified K tables from the saved rolling-origin backtest.
// Usage: node scripts/calibrate-engine.js [artifact-directory]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.argv[2] || "/home/wagustin/kathy_workspace/handoff/bt_data";
const HS = [1, 3, 6, 12, 24, 36, 48];

const history = JSON.parse(fs.readFileSync(path.join(DIR, "history", "history-120.json"), "utf8"));
const timesfm = JSON.parse(fs.readFileSync(path.join(DIR, "bt-timesfm", "timesfm.json"), "utf8")).forecasts;

const quantile = (xs, q) => {
  const sorted = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const mape = (rows) => rows.length ? rows.reduce((n, r) => n + Math.abs(r.p50 / r.actual - 1), 0) / rows.length * 100 : 0;

function rowsAt(h, group) {
  const out = [];
  for (const key of Object.keys(timesfm)) {
    const [sym, cut] = key.split("|");
    const isLima = sym.endsWith(".LM");
    if (group === "lima" && !isLima) continue;
    if (group === "resto" && isLima) continue;
    const T = Number(cut);
    const closes = history[sym]?.slice(0, -1).map((x) => x.close);
    const tf = timesfm[key]?.[h - 1];
    if (!closes || T + h - 1 >= closes.length || !tf || tf[2] <= 0) continue;
    const last = closes[T - 1];
    const actual = closes[T + h - 1];
    const w = isLima ? 0 : Math.min(1, h / 36);
    const p50 = Math.pow(last, 1 - w) * Math.pow(tf[2], w);
    const delta = Math.log(actual / p50);
    const side = delta >= 0 ? Math.log(tf[4] / tf[2]) : Math.log(tf[0] / tf[2]);
    const need = side ? delta / side : Infinity;
    out.push({ sym, last, actual, p50, tf, need });
  }
  return out;
}

const K = { lima: {}, resto: {} };

for (const group of ["lima", "resto"]) {
  let prevK = 0;
  for (const h of HS) {
    const rows = rowsAt(h, group);
    const rawK = quantile(rows.map((r) => r.need), 0.8);
    // Keep K monotonically non-decreasing with horizon
    const fitted = Number(Math.max(rawK, prevK).toFixed(2));
    // Hard floor 1.20 at h=3 if needed per T60 spec
    const val = (group === "resto" && h === 3) ? Math.max(fitted, 1.20) : fitted;
    prevK = val;
    K[group][String(h)] = val;
  }
}

console.log("Calibrated K tables:", JSON.stringify(K, null, 2));

console.log("\nHorizon evaluation (MAPE & 80% coverage):");
for (const h of HS) {
  const limaRows = rowsAt(h, "lima");
  const restoRows = rowsAt(h, "resto");
  const checkGroup = (rows, group) => {
    const kVal = K[group][String(h)];
    let covered = 0;
    for (const r of rows) {
      const p10 = r.p50 * Math.exp(kVal * Math.log(r.tf[0] / r.tf[2]));
      const p90 = r.p50 * Math.exp(kVal * Math.log(r.tf[4] / r.tf[2]));
      if (r.actual >= p10 && r.actual <= p90) covered++;
    }
    const cov = rows.length ? (covered / rows.length * 100).toFixed(1) : "0.0";
    return { mape: mape(rows).toFixed(2), cov, n: rows.length };
  };
  const lRes = checkGroup(limaRows, "lima");
  const rRes = checkGroup(restoRows, "resto");
  const allRows = [...limaRows, ...restoRows];
  const pooledMape = mape(allRows).toFixed(2);
  let totalCovered = 0;
  for (const r of limaRows) {
    const kVal = K.lima[String(h)];
    if (r.actual >= r.p50 * Math.exp(kVal * Math.log(r.tf[0] / r.tf[2])) &&
        r.actual <= r.p50 * Math.exp(kVal * Math.log(r.tf[4] / r.tf[2]))) totalCovered++;
  }
  for (const r of restoRows) {
    const kVal = K.resto[String(h)];
    if (r.actual >= r.p50 * Math.exp(kVal * Math.log(r.tf[0] / r.tf[2])) &&
        r.actual <= r.p50 * Math.exp(kVal * Math.log(r.tf[4] / r.tf[2]))) totalCovered++;
  }
  const pooledCov = (totalCovered / allRows.length * 100).toFixed(1);
  console.log(`h=${h}: MAPE=${pooledMape}% (Lima ${lRes.mape}%, Resto ${rRes.mape}%) | Cov=${pooledCov}% (Lima ${lRes.cov}%, Resto ${rRes.cov}%)`);
}

const out = {
  version: 6,
  generated: new Date().toISOString(),
  regla: "w = sym.endsWith('.LM') ? 0 : min(1, h / 36); P50 = last^(1-w) * tf50^w; q = P50 * exp(K * ln(tf_q / tf50))",
  K,
};

const outPath = path.join(ROOT, "api", "_lib", "engine-params.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`\nUpdated ${outPath}`);
