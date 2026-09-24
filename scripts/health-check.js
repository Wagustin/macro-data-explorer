// CATALOG HEALTH SWEEP: test EVERY catalog symbol against the real API pipeline
// (search findability + historical data availability + forecast viability).
// Usage: node scripts/health-check.js [--base http://localhost:4567]
const args = process.argv.slice(2);
let BASE = "http://localhost:4567";
const bi = args.indexOf("--base");
if (bi > -1 && args[bi + 1]) BASE = args[bi + 1];

const { CATALOG } = await import("../api/search.js");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function apiSearch(q) {
  const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
  const d = await r.json().catch(() => null);
  return d?.results || [];
}
async function apiHistorical(sym) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/historical?symbol=${encodeURIComponent(sym)}&range=3y&interval=1mo`, { signal: AbortSignal.timeout(20000) });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, ms, err: `HTTP ${r.status}` };
    const d = await r.json();
    if (d.error) return { ok: false, ms, err: d.error };
    return { ok: true, ms, count: d.count, last: d.series?.[d.series.length - 1]?.date, live: d.live?.price ?? null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e.message };
  }
}

(async () => {
  const tradable = CATALOG.filter(c => c.category !== "unlisted" && !c.symbol.startsWith("COSAPI") && !c.symbol.endsWith("-PRIV"));
  const unlisted = CATALOG.filter(c => c.category === "unlisted" || c.symbol.endsWith("-PRIV"));
  console.log(`catalog: ${CATALOG.length} total | ${tradable.length} tradable | ${unlisted.length} unlisted`);

  // 1) HISTORICAL sweep for every tradable symbol
  const bad = [], slow = [];
  for (const c of tradable) {
    const h = await apiHistorical(c.symbol);
    if (!h.ok) bad.push({ sym: c.symbol, err: h.err });
    else if (h.count === 0) bad.push({ sym: c.symbol, err: "0 observations" });
    else if (h.ms > 4000) slow.push({ sym: c.symbol, ms: h.ms });
    process.stdout.write(`  ${h.ok ? "OK " : "ERR"} ${c.symbol.padEnd(14)} ${String(h.count ?? "-").padStart(3)}obs ${h.ms}ms${h.live ? " live:" + h.live : ""}${h.ok ? "" : " -> " + h.err}\n`);
    await new Promise(r => setTimeout(r, 120));
  }

  // 2) SEARCH findability for a sample of user queries (tradable + unlisted)
  const queries = ["cosapi", "backus", "volcan", "buenaventura", "gloria", "lucchetti", "caja arequipa", "antamina", "cerro verde", "yanacocha", "camposol", "siderperu", "unacem", "ferreyros", "alicorp", "cobre", "oro", "petroleo", "nasdaq", "tesla", "apple", "dolar", "inflacion"];
  const findFails = [];
  console.log("\nsearch findability:");
  for (const q of queries) {
    const r = await apiSearch(q);
    const ok = r.length > 0;
    if (!ok) findFails.push(q);
    console.log(`  ${ok ? "OK " : "MISS"} "${q}" -> ${r.length} results | first: ${r[0]?.symbol || "-"}`);
  }

  // 3) UNLISTED must NOT be silently clickable into a dead chart: report their historical result
  console.log("\nunlisted click-through (expected: clean error, not hang):");
  for (const c of unlisted.slice(0, 6)) {
    const h = await apiHistorical(c.symbol);
    console.log(`  ${c.symbol.padEnd(16)} -> ${h.ok ? "UNEXPECTED OK" : "clean error (" + h.err.slice(0, 50) + ")"} ${h.ms}ms`);
  }

  console.log("\n==== SUMMARY ====");
  console.log("historical failures:", bad.length, bad.map(b => b.sym).join(", ") || "none");
  console.log("slow (>4s):", slow.length, slow.map(s => `${s.sym}(${s.ms}ms)`).join(", ") || "none");
  console.log("search misses:", findFails.length, findFails.join(", ") || "none");

  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/health-report.json", JSON.stringify({ bad, slow, findFails, tested: tradable.length }, null, 1));
  process.exit(bad.length === 0 && findFails.length === 0 ? 0 : 1);
})();
