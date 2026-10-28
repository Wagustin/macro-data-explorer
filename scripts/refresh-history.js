// Refreshes data/history-120.json (10 years of monthly closes per asset) before the daily
// model run, so the model sees this month's data instead of a frozen file. Lima stocks (".LM")
// come from the SMV registry in Supabase (api/_lib/smv.js) when it has them, the rest from market data.
// Keeps the previous series for any symbol that fails, leaves new failures absent,
// and fails only if most of them fail.
// Usage: node scripts/refresh-history.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nemonicoOf, smvRows } from "../api/_lib/smv.js";
import { SOURCES, sourcePoints, monthlyPoints } from "../api/_lib/sources.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "history-120.json");

async function smvMonthly(nemo) {
  const from = new Date(); from.setUTCFullYear(from.getUTCFullYear() - 10);
  const rows = await smvRows(nemo, from.toISOString().slice(0, 10), { monthly: true, timeoutMs: 15000 });
  const byMonth = new Map(rows.map((r) => [r.fecha.slice(0, 7), r.cierre]));
  const months = [...byMonth.keys()].sort();
  if (!months.length) return [];
  // Months without trades keep the last close, so the model sees one point per calendar month
  const out = [];
  let [y, m] = months[0].split("-").map(Number);
  const end = new Date().toISOString().slice(0, 7);
  let close = byMonth.get(months[0]);
  for (;;) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > end) break;
    if (byMonth.has(k)) close = byMonth.get(k);
    out.push({ date: `${k}-01`, close });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

async function monthly(symbol) {
  const nemo = nemonicoOf(symbol);
  if (nemo) {
    try {
      const out = await smvMonthly(nemo);
      if (out.length >= 24) { smvCount++; return out; }
    } catch (e) { /* Retain the prior series if the SMV is unavailable. */ }
  }
  const source = SOURCES[symbol];
  if (!source) throw new Error("sin fuente oficial");
  const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 10);
  const cutoffMonth = cutoff.toISOString().slice(0, 7);
  const out = monthlyPoints(sourcePoints(symbol), source.mensual)
    .filter(([month]) => month >= cutoffMonth)
    .map(([month, close]) => ({ date: `${month}-01`, close: Number(close.toFixed(4)) }));
  if (out.length < 24) throw new Error(`solo ${out.length} meses`);
  return out;
}

// The file is not in git (it's regenerated): on a fresh checkout start with no cached series
const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
const { CATALOG } = await import("../api/search.js");
const symbols = [...new Set([...CATALOG.filter((a) => a.symbol.endsWith(".LM")).map((a) => a.symbol), ...Object.keys(SOURCES)])];
let ok = 0;
let smvCount = 0;
const failed = [];
for (const s of symbols) {
  try {
    cache[s] = await monthly(s);
    ok++;
  } catch (e) {
    failed.push(`${s} (${e.message})`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
// Remove only symbols no longer represented by the catalog or an official source.
for (const s of Object.keys(cache)) if (!symbols.includes(s)) delete cache[s];
fs.writeFileSync(FILE, JSON.stringify(cache));
console.log(`Historial actualizado: ${ok}/${symbols.length} (${smvCount} de la SMV)${failed.length ? ` · sin actualizar: ${failed.join(", ")}` : ""}`);
// The catalog also lists private companies and macro series without a market ticker (~25)
if (ok < symbols.length * 0.75) process.exit(1);
