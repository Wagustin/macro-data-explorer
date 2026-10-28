// Linearity evaluation of the forecast P50: a straight line has zero second differences.
const { default: forecast } = await import("../api/forecast.js");

function linearityMetrics(points) {
  const p50 = points.map(p => p.p50);
  // second differences of the P50 path
  let maxD2 = 0, sumD2 = 0;
  for (let i = 2; i < p50.length; i++) {
    const d2 = Math.abs(p50[i] - 2 * p50[i - 1] + p50[i - 2]);
    maxD2 = Math.max(maxD2, d2);
    sumD2 += d2;
  }
  const last = points[points.length - 1];
  const asym = (last.p90 - last.p50) - (last.p50 - last.p10); // >0 = upside wider (realistic)
  const spreadUp = (last.p90 - last.p50) / last.p50 * 100;
  const spreadDn = (last.p50 - last.p10) / last.p50 * 100;
  return { maxD2: +maxD2.toFixed(3), avgD2: +(sumD2 / (p50.length - 2)).toFixed(3), asym: +asym.toFixed(2), spreadUp: +spreadUp.toFixed(1), spreadDn: +spreadDn.toFixed(1) };
}

(async () => {
  for (const sym of ["PEN=X", "HG=F", "ALICORC1.LM", "EURUSD=X"]) {
    const res = { status: (c) => res, json: (d) => { out = d; }, setHeader: () => {}, end: () => {} };
    let out;
    await forecast({ query: { symbol: sym, horizon: 12 }, method: "GET" }, res);
    if (out.error) { console.log(sym, "ERR", out.error); continue; }
    const m = linearityMetrics(out.forecastSeries);
    console.log(`${sym.padEnd(8)} P50-12m: ${out.predictedPrice} | max|2nd diff|: ${m.maxD2} (0=recta) | avg: ${m.avgD2} | asimetria banda: ${m.asym} | up ${m.spreadUp}% vs dn ${m.spreadDn}%`);
  }
})();
