import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3456";
const OUT_FILE = process.env.OUT_FILE || "/home/wagustin/kathy_workspace/handoff/peso/inventario.md";

const ROUTES = [
  { name: "Inicio", path: "/" },
  { name: "Terminal / Explorer", path: "/explorer" },
  { name: "Directorio Empresas", path: "/empresas" },
  { name: "Autenticación / Entrar", path: "/entrar" }
];

function formatBytes(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function analyzeRoute(browser, route) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await client.send("Network.enable");
  await client.send("Network.clearBrowserCache");
  await client.send("Network.clearBrowserCookies");

  const resources = new Map();

  client.on("Network.responseReceived", (params) => {
    const reqId = params.requestId;
    const url = params.response.url;
    const mime = params.response.mimeType || "";
    const type = params.type || "Other";
    const headers = params.response.headers || {};
    const contentLength = parseInt(headers["content-length"] || "0", 10);

    resources.set(reqId, {
      url,
      type,
      mime,
      contentLength,
      encodedLength: 0,
      status: params.response.status
    });
  });

  client.on("Network.loadingFinished", (params) => {
    const reqId = params.requestId;
    if (resources.has(reqId)) {
      const res = resources.get(reqId);
      res.encodedLength = params.encodedDataLength || res.contentLength || 0;
    }
  });

  await page.coverage.startJSCoverage();
  await page.coverage.startCSSCoverage();

  const targetUrl = `${BASE_URL}${route.path}`;
  await page.goto(targetUrl, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2000);

  const jsCoverage = await page.coverage.stopJSCoverage();
  const cssCoverage = await page.coverage.stopCSSCoverage();

  // Evaluate which fonts are used
  const usedFonts = await page.evaluate(async () => {
    const fonts = [];
    if (document.fonts) {
      for (const font of document.fonts) {
        if (font.status === "loaded") {
          fonts.push(font.family);
        }
      }
    }
    return fonts;
  });

  // Calculate coverage for JS & CSS
  const coverageMap = new Map();
  for (const entry of jsCoverage) {
    const text = entry.text || "";
    let totalBytes = text.length;
    let usedBytes = 0;
    for (const range of (entry.ranges || [])) {
      usedBytes += range.end - range.start;
    }
    coverageMap.set(entry.url, { totalBytes, usedBytes, pct: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0 });
  }

  for (const entry of cssCoverage) {
    const text = entry.text || "";
    let totalBytes = text.length;
    let usedBytes = 0;
    for (const range of (entry.ranges || [])) {
      usedBytes += range.end - range.start;
    }
    coverageMap.set(entry.url, { totalBytes, usedBytes, pct: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0 });
  }

  // Aggregate resource list
  const list = [];
  let totalTransferred = 0;

  for (const [_, res] of resources) {
    totalTransferred += res.encodedLength;

    let cleanUrl = res.url;
    try {
      const parsed = new URL(res.url);
      cleanUrl = parsed.pathname + parsed.search;
    } catch (e) {}

    let usage = "Desconocido";
    if (res.type === "Document") {
      usage = "Sí (HTML principal)";
    } else if (res.type === "Script") {
      const cov = coverageMap.get(res.url);
      if (cov) {
        if (cov.usedBytes === 0) {
          usage = "NO (0% ejecutado)";
        } else {
          usage = `Sí (${cov.pct.toFixed(0)}% ejecutado: ${formatBytes(cov.usedBytes)}/${formatBytes(cov.totalBytes)})`;
        }
      } else {
        usage = "No rastreado / No ejecutado";
      }
    } else if (res.type === "Stylesheet") {
      const cov = coverageMap.get(res.url);
      if (cov) {
        usage = `Sí (${cov.pct.toFixed(0)}% reglas usadas: ${formatBytes(cov.usedBytes)}/${formatBytes(cov.totalBytes)})`;
      } else {
        usage = "Cargado";
      }
    } else if (res.type === "Font") {
      usage = "Cargado / Fuente";
    } else if (res.type === "Image") {
      usage = "Cargado / Imagen";
    } else if (res.type === "Fetch" || res.type === "XHR") {
      usage = "Sí (Llamada API / Datos)";
    }

    list.push({
      path: cleanUrl,
      type: res.type,
      size: res.encodedLength,
      usage
    });
  }

  // Sort descending by size
  list.sort((a, b) => b.size - a.size);

  await context.close();
  return { route, totalTransferred, list };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const route of ROUTES) {
    console.log(`Analizando ${route.name} (${route.path})...`);
    const res = await analyzeRoute(browser, route);
    results.push(res);
  }

  await browser.close();

  // Generate Markdown
  let md = `# Inventario de Recursos por Página (T83)\n\n`;
  md += `Fecha: ${new Date().toISOString()}\n`;
  md += `Base URL: ${BASE_URL}\n\n`;

  md += `## Resumen Global\n\n`;
  md += `| Página | Ruta | Total Transferido |\n`;
  md += `| :--- | :--- | :--- |\n`;
  for (const r of results) {
    md += `| ${r.route.name} | \`${r.route.path}\` | **${formatBytes(r.totalTransferred)}** |\n`;
  }
  md += `\n---\n\n`;

  for (const r of results) {
    md += `## Página: ${r.route.name} (\`${r.route.path}\`)\n\n`;
    md += `**Total Transferido:** ${formatBytes(r.totalTransferred)} (${r.totalTransferred} bytes)\n\n`;
    md += `| Recurso | Tipo | Tamaño Transferido | ¿Se usa en la página? |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;

    for (const item of r.list) {
      md += `| \`${item.path}\` | ${item.type} | ${formatBytes(item.size)} | ${item.usage} |\n`;
    }
    md += `\n`;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, md, "utf8");
  console.log(`✓ Inventario guardado en: ${OUT_FILE}`);
}

main().catch(console.error);
