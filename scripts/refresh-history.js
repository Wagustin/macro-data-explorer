// Refreshes data/history-120.json (10 years of monthly closes per asset) before the daily
// TimesFM run, so the model sees this month's data instead of a frozen file.
// Keeps the previous series for any symbol that fails, drops symbols that have none,
// and fails only if most of them fail.
// Usage: node scripts/refresh-history.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "history-120.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function monthly(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const closes = r?.indicators?.quote?.[0]?.close || [];
  const out = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (c > 0) {
      const d = new Date(t * 1000);
      out.push({ date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`, close: Number(c.toFixed(4)) });
    }
  });
  if (out.length < 24) throw new Error(`solo ${out.length} meses`);
  return out;
}

// The file is not in git (it's regenerated): on a fresh checkout start from the catalog
const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
if (!Object.keys(cache).length) {
  const { CATALOG } = await import("../api/search.js");
  CATALOG.forEach((a) => { cache[a.symbol] = []; });
}
const symbols = Object.keys(cache);
let ok = 0;
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
for (const s of symbols) if (!cache[s]?.length) delete cache[s];
fs.writeFileSync(FILE, JSON.stringify(cache));
console.log(`Historial actualizado: ${ok}/${symbols.length}${failed.length ? ` · sin actualizar: ${failed.join(", ")}` : ""}`);
// The catalog also lists private companies and macro series without a market ticker (~25)
if (ok < symbols.length * 0.75) process.exit(1);
