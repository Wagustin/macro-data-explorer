#!/usr/bin/env node
/**
 * PerData Production & Local Data Sanity Smoke Test
 * Zero dependencies. Run with:
 *   node scripts/smoke.js
 *   node scripts/smoke.js --base https://perdata.site
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
let base = "http://localhost:4321";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base" && args[i + 1]) {
    base = args[i + 1];
    i++;
  } else if (args[i].startsWith("--base=")) {
    base = args[i].split("=")[1];
  }
}
base = base.replace(/\/+$/, "");

const PAGES = [
  "/",
  "/explorer",
  "/noticias",
  "/metodologia",
  "/guia",
  "/precios",
  "/terms",
  "/privacidad",
  "/nosotros",
  "/cuenta",
  "/estado",
  "/mercado",
  "/resumenes",
  "/empresas"
];

const REQUIRED_PAGE_TITLES = new Map([
  ["/estado", "Estado de los datos"],
  ["/mercado", "Hoy en la Bolsa de Lima"],
  ["/resumenes", "Resumen del día"],
  ["/empresas", "Empresas de la Bolsa de Valores de Lima"]
]);

const STATIC_FILES = ["/robots.txt", "/sitemap.xml"];

const ASSETS = ["HG=F", "GC=F", "ALICORC1.LM", "PEN=X"];

const FORBIDDEN_PATTERNS = [
  { label: "Jev", regex: /\bJev\b/ },
  { label: "TypeSafe", regex: /TypeSafe/i },
  { label: "Nombre fundador", regex: /(agust[ií]n\s+ventura|ventura\s+salda[nñ]a)/i },
  { label: "S.A. ficticia", regex: /\bS\.A\./ },
  { label: "IFRS", regex: /\bIFRS\b/i },
  { label: "SHA-256", regex: /SHA-256/i },
  { label: "Whitepaper", regex: /Whitepaper/i },
  { label: "Bayesian", regex: /Bayesian/i }
];

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Visible text of a served page without executing JavaScript: scripts, styles, comments and tags
// are dropped. A word is a token carrying at least one letter, the same rule as verify-dolar.js.
function visibleWords(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter((word) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(word));
}

async function testPages() {
  const htmlMap = new Map();

  for (const page of PAGES) {
    try {
      const res = await fetchWithTimeout(`${base}${page}`);
      const text = await res.text();
      htmlMap.set(page, text);
      const pass = res.status === 200;
      record(`Página ${page}`, pass, `HTTP ${res.status}`);
      const expectedTitle = REQUIRED_PAGE_TITLES.get(page);
      if (expectedTitle) {
        record(`Título ${page}`, text.includes(expectedTitle), text.includes(expectedTitle) ? expectedTitle : `No aparece "${expectedTitle}"`);
      }
    } catch (err) {
      record(`Página ${page}`, false, `Error: ${err.message}`);
    }
  }

  for (const file of STATIC_FILES) {
    try {
      const res = await fetchWithTimeout(`${base}${file}`);
      const pass = res.status === 200;
      record(`Archivo ${file}`, pass, `HTTP ${res.status}`);
    } catch (err) {
      record(`Archivo ${file}`, false, `Error: ${err.message}`);
    }
  }

  // Forbidden text search in served HTML
  for (const [page, html] of htmlMap.entries()) {
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.label === "S.A. ficticia" && /^\/empresas?\b/.test(page)) continue;
      const match = pat.regex.exec(html);
      if (match) {
        record(`Texto prohibido en ${page} [${pat.label}]`, false, `Encontrado: "${match[0]}"`);
      } else {
        record(`Texto limpio en ${page} [${pat.label}]`, true, "0 coincidencias");
      }
    }
  }
}

async function testIssuerData() {
  for (const [file, count] of [["empresas-estado.json", 150], ["smv-accionistas.json", 150]]) {
    try {
      const res = await fetchWithTimeout(`${base}/data/${file}`);
      if (res.status !== 200) {
        record(`Datos ${file}`, false, `HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const issuers = data.emisores && typeof data.emisores === "object" ? Object.keys(data.emisores).length : 0;
      record(`Datos ${file}`, issuers >= count, `emisores: ${issuers} (mínimo ${count})`);
    } catch (err) {
      record(`Datos ${file}`, false, `Error: ${err.message}`);
    }
  }

  try {
    const res = await fetchWithTimeout(`${base}/empresa/INTEGRC1`);
    const html = await res.text();
    record("Ficha /empresa/INTEGRC1", res.status === 200, `HTTP ${res.status}`);
  } catch (err) {
    record("Ficha /empresa/INTEGRC1", false, `Error: ${err.message}`);
  }
}

async function testHistorical() {
  for (const symbol of ASSETS) {
    try {
      const url = `${base}/api/historical?symbol=${encodeURIComponent(symbol)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        record(`Historical ${symbol}`, false, `HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const livePrice = data.live?.price;
      const series = data.series || [];
      const hasPrice = typeof livePrice === "number" && livePrice > 0;
      const hasLength = series.length >= 12;

      let notTooOld = false;
      let lastDateStr = "N/A";
      let daysDiff = -1;
      if (series.length > 0) {
        lastDateStr = series[series.length - 1].date;
        const lastDate = new Date(lastDateStr);
        daysDiff = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        notTooOld = daysDiff <= 40;
      }

      const pass = hasPrice && hasLength && notTooOld;
      record(
        `Historical ${symbol}`,
        pass,
        `price: ${livePrice}, series: ${series.length}m, last: ${lastDateStr} (${daysDiff.toFixed(1)}d)`
      );
    } catch (err) {
      record(`Historical ${symbol}`, false, `Error: ${err.message}`);
    }
  }
}

async function testForecast() {
  for (const symbol of ASSETS) {
    try {
      const url = `${base}/api/forecast?symbol=${encodeURIComponent(symbol)}&horizon=1`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        record(`Forecast H=1 ${symbol}`, false, `HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const f = data.forecastSeries?.[0];
      if (!f) {
        record(`Forecast H=1 ${symbol}`, false, "Sin forecastSeries");
        continue;
      }

      const monotone = f.p10 <= f.p25 && f.p25 <= f.p50 && f.p50 <= f.p75 && f.p75 <= f.p90;
      const positive = f.p10 > 0 && f.p25 > 0 && f.p50 > 0 && f.p75 > 0 && f.p90 > 0;
      const isEngineV3 = data.model === "engine-v3" || /^perdata-engine-v\d/.test(data.model || "") || /engine v[345]/i.test(data.architecture || "");

      const pass = monotone && positive && isEngineV3;
      record(
        `Forecast H=1 ${symbol}`,
        pass,
        `monótono: ${monotone}, positivo: ${positive}, model: "${data.model || 'engine-v3'}"`
      );
    } catch (err) {
      record(`Forecast H=1 ${symbol}`, false, `Error: ${err.message}`);
    }
  }
}

async function testRemovedAssets() {
  for (const [label, url, expectedStatus, sourceLabel] of [
    ["Historical AAPL retirado", "/api/historical?symbol=AAPL", 404],
    ["Forecast ^GSPC retirado", "/api/forecast?symbol=%5EGSPC", 404],
    ["Historical NG=F", "/api/historical?symbol=NG%3DF", 200, "Banco Mundial"],
    ["Historical EURUSD=X", "/api/historical?symbol=EURUSD%3DX", 200, "Reserva Federal"]
  ]) {
    try {
      const res = await fetchWithTimeout(`${base}${url}`);
      const data = await res.json();
      const statusMatches = res.status === expectedStatus;
      const sourceMatches = !sourceLabel || (typeof data.dailySource === "string" && data.dailySource.includes(sourceLabel));
      record(label, statusMatches && sourceMatches, `HTTP ${res.status}${sourceLabel ? ` · dailySource: ${data.dailySource || "ausente"}` : ""}`);
    } catch (err) {
      record(label, false, `Error: ${err.message}`);
    }
  }
}

async function testNews() {
  try {
    const res = await fetchWithTimeout(`${base}/api/news`);
    if (!res.ok) {
      record("API News", false, `HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const items = data.news || data.articles || (Array.isArray(data) ? data : []);
    const hasCount = items.length >= 5;

    let allValid = true;
    let invalidReason = "";

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title || typeof item.title !== "string" || item.title.trim().length === 0) {
        allValid = false;
        invalidReason = `Item #${i} sin título`;
        break;
      }
      if (!item.source || typeof item.source !== "string" || item.source.trim().length === 0) {
        allValid = false;
        invalidReason = `Item #${i} sin medio/fuente`;
        break;
      }
      if (!item.time && !item.timestamp && !item.date) {
        allValid = false;
        invalidReason = `Item #${i} sin fecha/hora`;
        break;
      }
      if (!item.url || typeof item.url !== "string") {
        allValid = false;
        invalidReason = `Item #${i} sin URL`;
        break;
      }
      try {
        const u = new URL(item.url);
        if (u.pathname === "/" || u.pathname.length <= 1) {
          allValid = false;
          invalidReason = `Item #${i} URL es solo dominio raíz: ${item.url}`;
          break;
        }
      } catch (e) {
        allValid = false;
        invalidReason = `Item #${i} URL malformada: ${item.url}`;
        break;
      }
    }

    const pass = hasCount && allValid;
    record("API News", pass, `titulares: ${items.length}, válidos: ${allValid}${invalidReason ? ` (${invalidReason})` : ""}`);
    const hasSentiment = items.length > 0 && items.every((item) => Object.hasOwn(item, "sentimiento"));
    record("API News sentimiento", hasSentiment, `titulares con campo sentimiento: ${items.filter((item) => Object.hasOwn(item, "sentimiento")).length}/${items.length}`);
  } catch (err) {
    record("API News", false, `Error: ${err.message}`);
  }
}

async function testMarketAndStatus() {
  try {
    const res = await fetchWithTimeout(`${base}/api/mercado`);
    if (!res.ok) {
      record("API Mercado", false, `HTTP ${res.status}`);
    } else {
      const data = await res.json();
      const lengths = ["subidas", "bajadas", "negociadas"].map((key) => Array.isArray(data[key]) ? data[key].length : 0);
      const pass = lengths.every((length) => length > 0);
      record("API Mercado", pass, `subidas: ${lengths[0]}, bajadas: ${lengths[1]}, negociadas: ${lengths[2]}`);
    }
  } catch (err) {
    record("API Mercado", false, `Error: ${err.message}`);
  }

  try {
    const res = await fetchWithTimeout(`${base}/api/status`);
    if (!res.ok) {
      record("API Status", false, `HTTP ${res.status}`);
    } else {
      const data = await res.json();
      const keys = ["forecasts", "news", "smv", "d1Sync"];
      const missing = keys.filter((key) => !Object.hasOwn(data, key));
      record("API Status", missing.length === 0, missing.length ? `Faltan claves: ${missing.join(", ")}` : `Claves presentes: ${keys.join(", ")}`);
    }
  } catch (err) {
    record("API Status", false, `Error: ${err.message}`);
  }
}

async function testBilling() {
  try {
    const res = await fetchWithTimeout(`${base}/api/billing?action=config`);
    if (!res.ok) {
      record("API Billing", false, `HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const isProd = base.includes("perdata.site");
    const enabled = isProd ? data.enabled === true : typeof data.enabled === "boolean";
    const hasPrices = Array.isArray(data.prices) && (!isProd || data.prices.length > 0);

    const pass = enabled && hasPrices;
    record(
      "API Billing Config",
      pass,
      `enabled: ${data.enabled}, prices: ${data.prices ? data.prices.length : 0}`
    );
  } catch (err) {
    record("API Billing Config", false, `Error: ${err.message}`);
  }
}

async function testSeguimiento() {
  try {
    const res = await fetchWithTimeout(`${base}/api/seguimiento`);
    const pass = res.status === 401;
    record("API Seguimiento (sin auth)", pass, `HTTP ${res.status}`);
  } catch (err) {
    record("API Seguimiento (sin auth)", false, `Error: ${err.message}`);
  }
}

async function testCalibration() {
  const calibPath = path.join(__dirname, "..", "api", "_lib", "calibration.json");
  if (!fs.existsSync(calibPath)) {
    record("Archivo calibration.json", false, "No existe api/_lib/calibration.json");
    return;
  }
  record("Archivo calibration.json", true, "Existe en api/_lib/calibration.json");

  try {
    const data = JSON.parse(fs.readFileSync(calibPath, "utf-8"));
    const horizons = [1, 3, 6, 12, 24, 36];
    let allOk = true;
    const details = [];
    for (const h of horizons) {
      const entry = data.horizons?.[h];
      const cov = entry?.coverageAfter80;
      if (typeof cov !== "number" || cov < 75 || cov > 85) {
        allOk = false;
        details.push(`H=${h}: ${cov}% (fuera de [75%, 85%])`);
      } else {
        details.push(`H=${h}: ${cov}%`);
      }
    }
    record("Cobertura empírica en [75%, 85%]", allOk, details.join(", "));
  } catch (e) {
    record("Cobertura empírica en [75%, 85%]", false, e.message);
  }
}

// A refresh must never get a 304 for HTML: the cached page keeps its old CSP nonce, the new policy
// blocks every script and the site looks broken (happened on 31-oct-2026). Only the Worker adds nonces.
async function testRefresh() {
  if (/localhost|127\.0\.0\.1/.test(base)) return;
  for (const page of ["/", "/noticias", "/explorer"]) {
    const res = await fetchWithTimeout(`${base}${page}`, { headers: { "If-None-Match": '"x"', "If-Modified-Since": new Date().toUTCString() } });
    const html = await res.text();
    const csp = res.headers.get("content-security-policy") || "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const pass = res.status === 200 && !res.headers.get("etag") && Boolean(nonce) && html.includes(`nonce="${nonce}"`);
    record(`Refresco ${page}`, pass, `HTTP ${res.status}, nonce ${nonce ? "coincide" : "ausente"}`);
  }
}

// AdSense phase: only pages with content of their own reach search engines, the rest are noindex
// and stay out of the sitemap. The local dev server never sets X-Robots-Tag and answers every
// /empresa/* with the same shell, so these checks only make sense against a deployment.
async function testIndexability() {
  if (/localhost|127\.0\.0\.1/.test(base)) return;

  for (const check of [
    { page: "/dolar", minWords: 800, needle: "S/" },
    { page: "/contacto" },
    { page: "/politica-editorial" }
  ]) {
    try {
      const res = await fetchWithTimeout(`${base}${check.page}`);
      const html = await res.text();
      const words = visibleWords(html).length;
      const robots = res.headers.get("X-Robots-Tag");
      const enoughWords = !check.minWords || words >= check.minWords;
      const hasNeedle = !check.needle || html.includes(check.needle);
      const pass = res.status === 200 && !robots && enoughWords && hasNeedle;
      record(
        `Indexable ${check.page}`,
        pass,
        `HTTP ${res.status} · X-Robots-Tag: ${robots || "ausente"} · ${words} palabras` +
        `${check.minWords ? ` (mínimo ${check.minWords})` : ""}` +
        `${check.needle ? ` · «${check.needle}»: ${hasNeedle ? "sí" : "no"}` : ""}`
      );
    } catch (err) {
      record(`Indexable ${check.page}`, false, `Error: ${err.message}`);
    }
  }

  // The ficha rule lives in the body attribute: a rich ficha keeps it, a thin one loses it.
  // AENZA S.A.A. (AENZAC1) is indexable; AGROINDUSTRIAS AIB S.A. (AIBC1) shows no trades in the
  // last 12 months (data/empresas-estado.json), so the Worker keeps it out of the index.
  for (const check of [
    { page: "/empresa/AENZAC1", indexable: true, needle: 'data-indexable="1"' },
    { page: "/empresa/AIBC1", indexable: false }
  ]) {
    try {
      const res = await fetchWithTimeout(`${base}${check.page}`);
      const html = await res.text();
      const robots = res.headers.get("X-Robots-Tag");
      const hasNeedle = !check.needle || html.includes(check.needle);
      const pass = res.status === 200 && (robots === "noindex, follow") === !check.indexable && hasNeedle;
      record(
        `Ficha ${check.indexable ? "indexable" : "noindex"} ${check.page}`,
        pass,
        `HTTP ${res.status} · X-Robots-Tag: ${robots || "ausente"}` +
        `${check.needle ? ` · ${check.needle}: ${hasNeedle ? "sí" : "no"}` : ""}`
      );
    } catch (err) {
      record(`Ficha ${check.indexable ? "indexable" : "noindex"} ${check.page}`, false, `Error: ${err.message}`);
    }
  }

  try {
    const res = await fetchWithTimeout(`${base}/noticias`);
    const robots = res.headers.get("X-Robots-Tag");
    record(
      "Noindex /noticias",
      res.status === 200 && robots === "noindex, follow",
      `HTTP ${res.status} · X-Robots-Tag: ${robots || "ausente"}`
    );
  } catch (err) {
    record("Noindex /noticias", false, `Error: ${err.message}`);
  }

  try {
    const res = await fetchWithTimeout(`${base}/sitemap.xml`);
    const xml = await res.text();
    const locs = (xml.match(/<loc>/g) || []).length;
    const leaked = ["/resumen/", "/noticias"].filter((path) => xml.includes(path));
    record(
      "Sitemap solo indexables",
      res.status === 200 && locs >= 60 && locs <= 200 && leaked.length === 0,
      `HTTP ${res.status} · <loc>: ${locs} (entre 60 y 200)` +
      `${leaked.length ? ` · coladas: ${leaked.join(", ")}` : ""}`
    );
  } catch (err) {
    record("Sitemap solo indexables", false, `Error: ${err.message}`);
  }

  // The Worker writes the dollar range into the homepage, so it is readable without JavaScript.
  // When the forecast is not vigente (a holiday with no data) the slot may stay empty.
  try {
    const res = await fetchWithTimeout(`${base}/`);
    const html = (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, " ");
    const m = html.match(/id="pdCardDailyP10"[^>]*>\s*(\d\.\d{3})\s*</);
    const hay = /id="pdCardDailyP10"/.test(html);

    let vigente = false;
    try {
      const diarioRes = await fetchWithTimeout(`${base}/api/diario`);
      if (diarioRes.ok) {
        const diario = await diarioRes.json();
        vigente = diario.vigente === true;
      }
    } catch {
      vigente = false;
    }

    record(
      "Portada con el rango sin JS",
      res.status === 200 && hay && (m || !vigente),
      `HTTP ${res.status} · rango escrito: ${m ? m[1] : "no"} · vigente: ${vigente ? "sí" : "no"}`
    );
  } catch (err) {
    record("Portada con el rango sin JS", false, `Error: ${err.message}`);
  }
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`  PERDATA SANITY SMOKE TEST — Target: ${base}`);
  console.log(`======================================================\n`);

  await testCalibration();
  await testPages();
  await testRefresh();
  await testIndexability();
  await testIssuerData();
  await testHistorical();
  await testForecast();
  await testRemovedAssets();
  await testNews();
  await testMarketAndStatus();
  await testBilling();
  await testSeguimiento();

  let passCount = 0;
  let failCount = 0;

  console.log(`${"ESTADO".padEnd(8)} | ${"PRUEBA".padEnd(42)} | ${"DETALLE"}`);
  console.log("-".repeat(80));

  for (const r of results) {
    if (r.pass) {
      passCount++;
      console.log(`\x1b[32mOK\x1b[0m      | ${r.name.padEnd(42)} | ${r.detail}`);
    } else {
      failCount++;
      console.log(`\x1b[31mFAIL\x1b[0m    | ${r.name.padEnd(42)} | \x1b[31m${r.detail}\x1b[0m`);
    }
  }

  console.log("-".repeat(80));
  console.log(`TOTAL: ${results.length} pruebas | \x1b[32m${passCount} OK\x1b[0m | \x1b[${failCount > 0 ? "31" : "32"}m${failCount} FAIL\x1b[0m\n`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Error fatal en smoke test:", err);
  process.exit(1);
});
