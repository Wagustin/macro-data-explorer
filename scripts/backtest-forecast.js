// Backtest: forecast made T-6 months ago vs what actually happened.
// P50 within [P10, P90] = hit; directional accuracy = sign(P50 return) == sign(real return).
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchSeries(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1mo`, { headers: { "User-Agent": ua } });
  const d = await r.json();
  const res0 = d.chart.result[0];
  const ts = res0.timestamp, cl = res0.indicators.quote[0].close;
  const s = [];
  for (let i = 0; i < ts.length; i++) {
    if (cl[i] != null && !isNaN(cl[i])) {
      const dt = new Date(ts[i] * 1000);
      s.push({ date: dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-01", close: cl[i] });
    }
  }
  return s;
}

const { default: forecast } = await import("../api/forecast.js");

async function run(sym, horizon) {
  const series = await fetchSeries(sym);
  const cut = series.length - horizon;
  const train = series.slice(0, cut);
  const actual = series[series.length - 1].close;
  const lastTrain = train[train.length - 1].close;

  let out;
  const res = { status: (c) => res, json: (d) => { out = d; }, setHeader: () => {}, end: () => {} };
  await forecast({ method: "POST", body: { symbol: sym, horizon, series: train } }, res);
  if (out.error) return console.log(sym, "ERR");

  const hit = actual >= out.quantiles.p10 && actual <= out.quantiles.p90;
  const dirOk = Math.sign(out.expectedReturnPct) === Math.sign(((actual - lastTrain) / lastTrain) * 100);
  console.log(
    sym.padEnd(8),
    `h=${horizon}`.padEnd(5),
    `P50 ${String(out.predictedPrice).padStart(8)} | real ${String(actual.toFixed(2)).padStart(8)} |`,
    `P10 ${String(out.quantiles.p10).padStart(7)} P90 ${String(out.quantiles.p90).padStart(8)} |`,
    hit ? "IN-BAND" : "OUT    ", "|",
    dirOk ? "dir OK" : "dir X ", "|",
    `err ${(Math.abs(out.predictedPrice - actual) / actual * 100).toFixed(1)}%`
  );
  return { hit, dirOk };
}

const syms = ["BVN", "HG=F", "GC=F", "PEN=X", "^GSPC", "SCCO", "BAP"];
let hits = 0, dirs = 0, n = 0;
for (const s of syms) {
  for (const h of [3, 6, 12]) {
    const r = await run(s, h);
    if (r) { n++; hits += r.hit ? 1 : 0; dirs += r.dirOk ? 1 : 0; }
  }
}
console.log(`\nCoverage P10-P90: ${hits}/${n} (${(hits / n * 100).toFixed(0)}%) — objetivo 80%`);
console.log(`Directional accuracy: ${dirs}/${n} (${(dirs / n * 100).toFixed(0)}%)`);
