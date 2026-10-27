// Evaluates stored forecasts once their target month has matured.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const horizons = [1, 3, 6, 12];
const history = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "history-120.json"), "utf8"));
const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function addMonths(date, months) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

const snapshots = [];
if (base && key) {
  for (let offset = 0; ; offset += 1000) {
    const url = `${base}/rest/v1/forecast_history?select=symbol,horizon,run_date,last_close,p10,p50,p90&order=run_date.asc&limit=1000&offset=${offset}`;
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Supabase forecast_history HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const page = await response.json();
    snapshots.push(...page);
    if (page.length < 1000) break;
  }
}

const matured = snapshots.filter((row) => horizons.includes(Number(row.horizon)) && addMonths(row.run_date, Number(row.horizon)) <= today);
const needed = new Map();
for (const row of matured) {
  const date = addMonths(row.run_date, Number(row.horizon));
  const month = date.slice(0, 7);
  if (!needed.has(row.symbol)) needed.set(row.symbol, new Set());
  needed.get(row.symbol).add(month);
}

const actual = new Map();
for (const [symbol, series] of Object.entries(history)) {
  if (!Array.isArray(series)) continue;
  for (const point of series) {
    const month = String(point.date || "").slice(0, 7);
    if (needed.get(symbol)?.has(month) && Number.isFinite(Number(point.close))) actual.set(`${symbol}:${month}`, Number(point.close));
  }
}

if (base && key && needed.size) {
  const smvSymbols = [...needed.keys()].filter((symbol) => symbol.endsWith(".LM"));
  const nemos = smvSymbols.map((symbol) => symbol.slice(0, -3));
  if (nemos.length) {
    const months = [...needed.values()].flatMap((set) => [...set]).sort();
    const inFilter = `(${nemos.map((nemo) => `"${nemo.replaceAll('"', '')}"`).join(",")})`;
    for (let offset = 0; ; offset += 1000) {
      const url = new URL(`${base}/rest/v1/cotizaciones_smv`);
      url.searchParams.set("select", "nemonico,fecha,cierre");
      url.searchParams.set("fin_de_mes", "eq.true");
      url.searchParams.set("nemonico", `in.${inFilter}`);
      url.searchParams.set("fecha", `gte.${months[0]}-01`);
      const [lastYear, lastMonth] = months.at(-1).split("-").map(Number);
      const lastDay = new Date(Date.UTC(lastYear, lastMonth, 0)).getUTCDate();
      url.searchParams.append("fecha", `lte.${months.at(-1)}-${String(lastDay).padStart(2, "0")}`);
      url.searchParams.set("order", "fecha.asc");
      url.searchParams.set("limit", "1000");
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!response.ok) throw new Error(`Supabase cotizaciones_smv HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const page = await response.json();
      for (const quote of page) {
        const symbol = `${quote.nemonico}.LM`;
        const month = String(quote.fecha).slice(0, 7);
        if (needed.get(symbol)?.has(month) && Number.isFinite(Number(quote.cierre))) actual.set(`${symbol}:${month}`, Number(quote.cierre));
      }
      if (page.length < 1000) break;
    }
  }
}

const stats = Object.fromEntries(horizons.map((horizon) => [horizon, { n: 0, absolute_error_sum: 0, covered: 0 }]));
for (const row of matured) {
  const month = addMonths(row.run_date, Number(row.horizon)).slice(0, 7);
  const close = actual.get(`${row.symbol}:${month}`);
  if (!Number.isFinite(close) || !Number.isFinite(Number(row.p50))) continue;
  const stat = stats[row.horizon];
  stat.n++;
  stat.absolute_error_sum += Math.abs(close - Number(row.p50));
  if (close >= Number(row.p10) && close <= Number(row.p90)) stat.covered++;
}

const result = Object.fromEntries(horizons.map((horizon) => {
  const { n, absolute_error_sum, covered } = stats[horizon];
  return [horizon, { n, mae_p50: n ? absolute_error_sum / n : null, coverage_pct: n ? (covered / n) * 100 : null }];
}));
fs.writeFileSync(path.join(ROOT, "data", "aciertos.json"), `${JSON.stringify({ updated_at: today, horizons: result }, null, 2)}\n`);
console.log(`Aciertos guardados en data/aciertos.json (${matured.length} proyecciones maduras, ${Object.values(result).reduce((sum, row) => sum + row.n, 0)} evaluadas)`);
