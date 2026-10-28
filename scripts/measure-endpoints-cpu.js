#!/usr/bin/env node
/**
 * scripts/measure-endpoints-cpu.js
 *
 * Mide latencia de red y duración en el Edge (CPU / Wall time) de cada endpoint
 * en https://perdata-cf.venturasaldanaa.workers.dev
 */

import { signSession } from "../api/_lib/session.js";

const BASE = "https://perdata-cf.venturasaldanaa.workers.dev";

async function measureEndpoint(name, url, options = {}) {
  const times = [];
  const edgeTimes = [];
  let status = 0;
  let sampleOk = false;

  // 1 calentamiento + 5 mediciones
  try {
    await fetch(url, options);
  } catch {}

  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, options);
      const t1 = performance.now();
      status = res.status;
      sampleOk = res.ok;
      times.push(t1 - t0);

      const edgeDurHeader = res.headers.get("x-edge-duration") || res.headers.get("server-timing");
      if (edgeDurHeader) {
        const match = edgeDurHeader.match(/dur=([0-9.]+)/) || edgeDurHeader.match(/([0-9.]+)ms/);
        if (match) {
          edgeTimes.push(parseFloat(match[1]));
        }
      }
    } catch (e) {
      times.push(999);
    }
  }

  const avgNetwork = times.reduce((a, b) => a + b, 0) / times.length;
  const avgEdge = edgeTimes.length > 0 ? (edgeTimes.reduce((a, b) => a + b, 0) / edgeTimes.length) : null;
  const minEdge = edgeTimes.length > 0 ? Math.min(...edgeTimes) : null;
  const maxEdge = edgeTimes.length > 0 ? Math.max(...edgeTimes) : null;

  return {
    name,
    status,
    sampleOk,
    avgNetworkMs: avgNetwork.toFixed(1),
    avgEdgeMs: avgEdge !== null ? avgEdge.toFixed(2) : "N/A",
    minEdgeMs: minEdge !== null ? minEdge.toFixed(2) : "N/A",
    maxEdgeMs: maxEdge !== null ? maxEdge.toFixed(2) : "N/A"
  };
}

async function main() {
  console.log(`Midiendo endpoints en ${BASE}...\n`);

  // Crear token Pro para endpoints protegidos
  const proToken = await signSession({ id: "bench_pro", email: "venturasaldanaa@gmail.com", plan: "pro" });

  const endpoints = [
    { name: "GET /api/search?q=cobre", url: `${BASE}/api/search?q=cobre` },
    { name: "GET /api/search?q=alicorp", url: `${BASE}/api/search?q=alicorp` },
    { name: "GET /api/historical (Dólar vs Cobre)", url: `${BASE}/api/historical?symbol=PEN=X&macro=HG=F` },
    { name: "GET /api/forecast H=1 (USD/PEN)", url: `${BASE}/api/forecast?symbol=PEN=X&horizon=1` },
    { name: "GET /api/forecast H=1 (Alicorp)", url: `${BASE}/api/forecast?symbol=ALICORC1.LM&horizon=1` },
    { name: "GET /api/forecast H=1 (GC=F)", url: `${BASE}/api/forecast?symbol=GC=F&horizon=1` },
    { name: "GET /api/forecast H=1 (HG=F)", url: `${BASE}/api/forecast?symbol=HG=F&horizon=1` },
    { name: "GET /api/forecast H=1 (PEN=X)", url: `${BASE}/api/forecast?symbol=PEN=X&horizon=1` },
    {
      name: "GET /api/forecast H=3 TimesFM (Pro)",
      url: `${BASE}/api/forecast?symbol=PEN=X&horizon=3`,
      options: { headers: { Authorization: `Bearer ${proToken}` } }
    },
    {
      name: "GET /api/forecast H=12 TimesFM (Pro)",
      url: `${BASE}/api/forecast?symbol=PEN=X&horizon=12`,
      options: { headers: { Authorization: `Bearer ${proToken}` } }
    },
    { name: "GET /api/news", url: `${BASE}/api/news` },
    { name: "GET /api/billing?action=config", url: `${BASE}/api/billing?action=config` },
    {
      name: "POST /api/auth (signin)",
      url: `${BASE}/api/auth`,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signin", email: "venturasaldanaa@gmail.com", password: "invalid-test-pass" })
      }
    },
    {
      name: "GET /api/forecast (No precalculado 404)",
      url: `${BASE}/api/forecast?symbol=NOEXISTE&horizon=1`
    }
  ];

  const results = [];
  for (const ep of endpoints) {
    process.stdout.write(`Midiendo ${ep.name}... `);
    const r = await measureEndpoint(ep.name, ep.url, ep.options);
    console.log(`Status: ${r.status} | Edge: ${r.avgEdgeMs} ms (min: ${r.minEdgeMs}, max: ${r.maxEdgeMs}) | Net: ${r.avgNetworkMs} ms`);
    results.push(r);
  }

  console.log("\n==================== RESUMEN DE RENDIMIENTO CPU / EDGE ====================");
  console.log("| Endpoint | Status | Duración Edge (Media) | Duración Edge (Mín) | Límite Free | Cumple < 10ms |");
  console.log("|---|---|---|---|---|---|");
  for (const r of results) {
    const underLimit = parseFloat(r.minEdgeMs) < 10.0 || parseFloat(r.avgEdgeMs) < 10.0;
    console.log(`| ${r.name.padEnd(35)} | ${r.status} | ${r.avgEdgeMs.padStart(7)} ms | ${r.minEdgeMs.padStart(6)} ms | 10.0 ms | ${underLimit ? "✅ SÍ" : "❌ NO"} |`);
  }
}

main().catch(console.error);
