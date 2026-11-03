import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "https://perdata.site";
const OUT_FILE = process.env.OUT_FILE || "/home/wagustin/kathy_workspace/handoff/fase-nov/perf-lowend.md";

const ROUTES = [
  { name: "Inicio", path: "/" },
  { name: "Terminal / Explorer", path: "/explorer" },
  { name: "Directorio Empresas", path: "/empresas" },
  { name: "Autenticación / Entrar", path: "/entrar" }
];

const COLD_RUNS = 3;

// CDP network throttling: 1.6 Mbps = 200,000 bytes/sec, 150 ms RTT, 750 kbps upload
const NETWORK_CONFIG = {
  offline: false,
  latency: 150, // ms
  downloadThroughput: Math.round((1.6 * 1000 * 1000) / 8), // 200,000 B/s (1.6 Mbps)
  uploadThroughput: Math.round((750 * 1000) / 8),          // 93,750 B/s (750 kbps)
  connectionType: "cellular3g"
};

const CPU_THROTTLE_RATE = 4; // CPU x4 slowdown

function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms) {
  if (typeof ms !== "number" || isNaN(ms)) return "—";
  return `${Math.round(ms)} ms`;
}

function formatCls(cls) {
  if (typeof cls !== "number" || isNaN(cls)) return "—";
  return cls.toFixed(4);
}

async function measureColdRun(browser, targetUrl) {
  // New isolated browser context for strict cold load
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // Apply CDP throttling
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", NETWORK_CONFIG);
  await client.send("Network.clearBrowserCache");
  await client.send("Network.clearBrowserCookies");

  let transferredBytes = 0;
  client.on("Network.loadingFinished", (e) => {
    if (e && typeof e.encodedDataLength === "number") {
      transferredBytes += e.encodedDataLength;
    }
  });

  // Track LCP and CLS via PerformanceObserver
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0 };

    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          window.__perf.lcp = entries[entries.length - 1].startTime;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}

    try {
      let cls = 0;
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            cls += entry.value;
          }
        }
        window.__perf.cls = cls;
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch (e) {}
  });

  try {
    await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 });
    // Let any trailing layout shift or paints settle under throttled conditions
    await page.waitForTimeout(2500);

    const metrics = await page.evaluate(() => {
      let lcp = window.__perf?.lcp || 0;
      let cls = window.__perf?.cls || 0;

      if (!lcp) {
        try {
          const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
          if (lcpEntries && lcpEntries.length > 0) {
            lcp = lcpEntries[lcpEntries.length - 1].startTime;
          }
        } catch (e) {}
      }

      if (!lcp) {
        try {
          const fcp = performance.getEntriesByName("first-contentful-paint")[0];
          if (fcp) lcp = fcp.startTime;
        } catch (e) {}
      }

      let resTransfer = 0;
      try {
        const nav = performance.getEntriesByType("navigation")[0];
        if (nav && typeof nav.transferSize === "number") resTransfer += nav.transferSize;
        const res = performance.getEntriesByType("resource");
        for (const r of res) {
          if (typeof r.transferSize === "number") resTransfer += r.transferSize;
        }
      } catch (e) {}

      return { lcp, cls, resTransfer };
    });

    const finalBytes = transferredBytes > 0 ? transferredBytes : metrics.resTransfer;

    return {
      lcp: metrics.lcp,
      cls: metrics.cls,
      transferredBytes: finalBytes
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runBenchmark() {
  console.log("=== PerData Low-End Device Performance Benchmark (T76) ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Conditions: CPU x${CPU_THROTTLE_RATE}, Red 1.6 Mbps / 150 ms latencia RTT`);
  console.log(`Sampling: ${COLD_RUNS} cold runs per route\n`);

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const route of ROUTES) {
      const fullUrl = `${BASE_URL.replace(/\/+$/, "")}${route.path}`;
      console.log(`Benchmarking ${route.path} (${route.name})...`);

      const runs = [];
      for (let i = 1; i <= COLD_RUNS; i++) {
        process.stdout.write(`  Run ${i}/${COLD_RUNS}... `);
        const t0 = Date.now();
        const runData = await measureColdRun(browser, fullUrl);
        const duration = Date.now() - t0;
        runs.push(runData);
        console.log(`LCP: ${formatMs(runData.lcp)}, CLS: ${formatCls(runData.cls)}, Bytes: ${formatBytes(runData.transferredBytes)} (${duration}ms)`);
      }

      const medianLcp = calculateMedian(runs.map((r) => r.lcp));
      const medianCls = calculateMedian(runs.map((r) => r.cls));
      const medianBytes = calculateMedian(runs.map((r) => r.transferredBytes));

      console.log(`  -> Mediana: LCP ${formatMs(medianLcp)}, CLS ${formatCls(medianCls)}, Bytes ${formatBytes(medianBytes)}\n`);

      results.push({
        name: route.name,
        path: route.path,
        url: fullUrl,
        runs,
        medianLcp,
        medianCls,
        medianBytes
      });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Generate markdown report
  const now = new Date().toISOString();
  let md = `# Benchmark de Rendimiento en Dispositivos de Gama Baja (T76)

- **Fecha:** ${now}
- **Host evaluado:** \`${BASE_URL}\`
- **Condiciones de emulación CDP:**
  - **CPU Throttling:** 4× slowdown (emulación de SoC móvil de entrada)
  - **Red:** 1.6 Mbps descarga, 750 kbps subida, 150 ms latencia RTT (perfil Fast 3G / Low-End 4G)
  - **Modo:** ${COLD_RUNS} cargas en frío por ruta (contexto aislado, caché y cookies vacías)

## Resumen de Medianas

| Ruta | Nombre | LCP (mediana) | CLS (mediana) | Transferencia (mediana) | Estado LCP | Estado CLS |
|---|---|---:|---:|---:|:---:|:---:|
`;

  for (const r of results) {
    const lcpStatus = r.medianLcp <= 2500 ? "Bueno (<= 2.5s)" : r.medianLcp <= 4000 ? "Mejorable (<= 4.0s)" : "Pobre (> 4.0s)";
    const clsStatus = r.medianCls <= 0.1 ? "Bueno (<= 0.10)" : r.medianCls <= 0.25 ? "Mejorable (<= 0.25)" : "Pobre (> 0.25)";
    md += `| \`${r.path}\` | ${r.name} | ${formatMs(r.medianLcp)} | ${formatCls(r.medianCls)} | ${formatBytes(r.medianBytes)} | ${lcpStatus} | ${clsStatus} |\n`;
  }

  md += `\n## Detalle de Cargas en Frío (${COLD_RUNS} ejecuciones por ruta)\n\n`;

  for (const r of results) {
    md += `### \`${r.path}\` — ${r.name}\n\n`;
    md += `| Ejecución | LCP | CLS | Bytes Transferidos |\n`;
    md += `|:---:|---:|---:|---:|\n`;
    r.runs.forEach((run, idx) => {
      md += `| Carga ${idx + 1} | ${formatMs(run.lcp)} | ${formatCls(run.cls)} | ${formatBytes(run.transferredBytes)} (${run.transferredBytes.toLocaleString()} B) |\n`;
    });
    md += `| **Mediana** | **${formatMs(r.medianLcp)}** | **${formatCls(r.medianCls)}** | **${formatBytes(r.medianBytes)}** |\n\n`;
  }

  md += `---\n*Generado automáticamente por \`test/perf-lowend.mjs\` (PerData Performance Suite)*\n`;

  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, md, "utf8");
  console.log(`✓ Reporte generado exitosamente en: ${OUT_FILE}`);
}

runBenchmark().catch((err) => {
  console.error("Error en benchmark perf-lowend:", err);
  process.exit(1);
});
