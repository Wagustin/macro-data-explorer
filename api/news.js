import fs from "fs";
import path from "path";
import dns from "node:dns";
import { fileURLToPath } from "url";
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";

// Prioritize IPv4 for DNS resolution in Node to prevent RSS fetch timeouts
try {
  if (dns && typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }
} catch {
  // Ignore in environments where node:dns is unavailable or restricted
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, "../data/news-cache.json");

// Cache TTL: 20 minutes (within 15-30 min range)
export const CACHE_TTL_MS = 20 * 60 * 1000;

// Sin titulares de relleno: si no hay feed ni caché, se devuelve una lista vacía
// (la página muestra su estado vacío). Nunca inventar titulares atribuidos a medios reales.
export const FALLBACK_NEWS = [];

export const FEEDS = [
  {
    name: "BCRP / Política Monetaria",
    category: "Política Monetaria",
    symbol: "PEN=X",
    impact: "BCRP",
    impactColor: "blue",
    query: "BCRP OR \"Banco Central de Reserva\" OR \"Julio Velarde\""
  },
  {
    name: "LME / COMEX Cobre",
    category: "Commodities",
    symbol: "HG=F",
    impact: "COBRE",
    impactColor: "amber",
    query: "\"precio del cobre\" OR \"LME copper\" OR \"COMEX copper\""
  },
  {
    name: "Minería Peruana BVN/SCCO",
    category: "Minería",
    symbol: "BVN",
    impact: "MINERÍA",
    impactColor: "amber",
    query: "Buenaventura OR \"Southern Copper\" OR \"Cerro Verde\" OR \"mineria Peru\""
  },
  {
    name: "Volcan / Antamina / Chinalco",
    category: "Minería",
    symbol: "VOLCABC1.LM",
    impact: "MINERÍA",
    impactColor: "amber",
    query: "Volcan minera OR Antamina OR Toromocho OR Shougang OR \"Nexa Resources\""
  },
  {
    name: "Banca & Finanzas Perú",
    category: "Banca",
    symbol: "BAP",
    impact: "BANCA",
    impactColor: "emerald",
    query: "Credicorp OR Interbank OR \"BCP Peru\" OR \"BBVA Peru\" OR Scotiabank Peru"
  },
  {
    name: "Consumo & Retail Perú",
    category: "Consumo",
    symbol: "ALICORC1.LM",
    impact: "CONSUMO",
    impactColor: "emerald",
    query: "Alicorp OR Backus OR \"Gloria Peru\" OR Lucchetti OR Ferreycorp OR \"Cementos Pacasmayo\""
  },
  {
    name: "Tipo de Cambio USD/PEN",
    category: "Forex",
    symbol: "PEN=X",
    impact: "DIVISAS",
    impactColor: "emerald",
    query: "\"tipo de cambio\" dolar sol peru OR \"USD PEN\""
  },
  {
    name: "Petróleo WTI / Energía",
    category: "Commodities",
    symbol: "CL=F",
    impact: "WTI",
    impactColor: "purple",
    query: "\"petroleo WTI\" OR \"precio del crudo\" OR \"barril de petroleo\""
  },
  {
    name: "Oro / Metales Preciosos",
    category: "Commodities",
    symbol: "GC=F",
    impact: "ORO",
    impactColor: "amber",
    query: "\"precio del oro\" OR \"cotizacion oro\" OR \"COMEX gold\""
  },
  {
    name: "BVL / Mercado de Capitales",
    category: "Mercado de Capitales",
    symbol: "PERU_IGBVL",
    impact: "BVL",
    impactColor: "blue",
    query: "\"Bolsa de Valores de Lima\" OR IGBVL OR \"BVL Peru\" OR \"SMV Peru\""
  },
  {
    name: "Macroeconomía Perú (PBI/Inflación)",
    category: "Macroeconomía",
    symbol: "PERU_GDP",
    impact: "MACRO",
    impactColor: "blue",
    query: "\"PBI Peru\" OR \"inflacion Peru\" OR \"economia peruana\" OR \"MEF Peru\""
  },
  {
    name: "Fed / Tasas Globales",
    category: "Tasas Globales",
    symbol: "^TNX",
    impact: "FED",
    impactColor: "purple",
    query: "\"Federal Reserve\" OR \"Fed interest rate\" OR \"Treasury yield\" OR Powell"
  }
];

// In-memory cache for serverless execution
let inMemoryCache = {
  news: null,
  updatedAt: null,
  timestamp: 0
};

// Singleton promise to coalesce concurrent incoming requests
let activeFetchPromise = null;

export function decodeHtml(html) {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2018;|&#x2019;/g, "'")
    .replace(/&#x201c;|&#x201d;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSymbol(title, defaultSymbol) {
  const upper = (title || "").toUpperCase();
  if (upper.includes("BUENAVENTURA") || upper.includes("BVN")) return "BVN";
  if (upper.includes("SOUTHERN COPPER") || upper.includes("SCCO")) return "SCCO";
  if (upper.includes("CERRO VERDE") || upper.includes("FCX")) return "FCX";
  if (upper.includes("COBRE") || upper.includes("COPPER")) return "HG=F";
  if (upper.includes("ORO") || upper.includes("GOLD")) return "GC=F";
  if (upper.includes("PETROLEO") || upper.includes("PETRÓLEO") || upper.includes("CRUDO") || upper.includes("WTI")) return "CL=F";
  if (upper.includes("TIPO DE CAMBIO") || upper.includes("DÓLAR") || upper.includes("DOLAR") || upper.includes("USD") || upper.includes("BCRP") || upper.includes("VELARDE")) return "PEN=X";
  if (upper.includes("BONO") || upper.includes("FED") || upper.includes("TREASURY")) return "^TNX";
  return defaultSymbol || "PEN=X";
}

export function detectImpact(title, feed) {
  const upper = (title || "").toUpperCase();
  if (upper.includes("BCRP") || upper.includes("VELARDE") || upper.includes("BANCO CENTRAL")) return { impact: "BCRP", impactColor: "blue" };
  if (upper.includes("TIPO DE CAMBIO") || upper.includes("DÓLAR") || upper.includes("DOLAR") || upper.includes("USD")) return { impact: "DIVISAS", impactColor: "emerald" };
  if (upper.includes("COBRE") || upper.includes("COPPER")) return { impact: "COBRE", impactColor: "amber" };
  if (upper.includes("ORO") || upper.includes("GOLD")) return { impact: "ORO", impactColor: "amber" };
  if (upper.includes("MINERÍA") || upper.includes("MINERIA") || upper.includes("BUENAVENTURA") || upper.includes("SOUTHERN COPPER")) return { impact: "MINERÍA", impactColor: "amber" };
  if (upper.includes("PETROLEO") || upper.includes("PETRÓLEO") || upper.includes("WTI")) return { impact: "WTI", impactColor: "purple" };
  if (upper.includes("FED") || upper.includes("BONO")) return { impact: "FED", impactColor: "purple" };
  if (upper.includes("ALTO IMPACTO") || upper.includes("URGENTE") || upper.includes("RECORD") || upper.includes("HISTÓRICO")) return { impact: "ALTO IMPACTO", impactColor: "red" };
  return { impact: feed.impact || "MACRO", impactColor: feed.impactColor || "blue" };
}

export function formatTimeAgo(timestamp) {
  const diffMs = Date.now() - timestamp;
  const ageMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (ageMinutes < 60) return `hace ${ageMinutes}m`;
  const hours = Math.round(ageMinutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  return `hace ${days}d`;
}

export function parseItems(xmlText, feed) {
  const rawItems = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
  return rawItems.slice(0, 5).map((it, idx) => {
    let headline = decodeHtml((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const url = decodeHtml((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    const rawPubDate = decodeHtml((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "");
    let source = decodeHtml((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "");

    const lastDash = headline.lastIndexOf(" - ");
    if (lastDash > 0) {
      if (!source) source = headline.slice(lastDash + 3).trim();
      headline = headline.slice(0, lastDash).trim();
    }

    const timestamp = Date.parse(rawPubDate) || Date.now();
    const symbol = detectSymbol(headline, feed.symbol);
    const { impact, impactColor } = detectImpact(headline, feed);

    return {
      id: `live-${symbol}-${timestamp}-${idx}`,
      impact,
      impactColor,
      title: headline,
      source: source || "Agencia Oficial",
      url: url || "https://www.bcrp.gob.pe",
      time: formatTimeAgo(timestamp),
      timestamp,
      symbol,
      category: feed.category
    };
  });
}

export async function fetchMacroNews() {
  const results = [];
  const fetchPromises = FEEDS.map(async (feed) => {
    try {
      const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(feed.query) + "&hl=es-419&gl=PE&ceid=PE:es-419";
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PerDataExplorer/2.5" },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) return [];
      const text = await res.text();
      return parseItems(text, feed);
    } catch {
      return [];
    }
  });

  const settled = await Promise.allSettled(fetchPromises);
  for (const s of settled) {
    if (s.status === "fulfilled" && Array.isArray(s.value)) {
      results.push(...s.value);
    }
  }

  // Deduplicate and sort by most recent timestamp
  const seenTitles = new Set();
  const deduped = [];
  results.sort((a, b) => b.timestamp - a.timestamp);

  for (const item of results) {
    if (!item.title) continue;
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 35);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      deduped.push(item);
    }
  }

  return deduped.slice(0, 20);
}

function readDiskCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.news) && parsed.news.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Silently ignore disk read errors
  }
  return null;
}

function writeDiskCache(payload) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    // In read-only serverless filesystems (e.g. AWS Lambda / Vercel), catch write errors
  }
}

async function performNewsIngestion() {
  try {
    const freshNews = await fetchMacroNews();
    if (freshNews && freshNews.length > 0) {
      const nowIso = new Date().toISOString();
      inMemoryCache = {
        news: freshNews,
        updatedAt: nowIso,
        timestamp: Date.now()
      };
      writeDiskCache({
        updatedAt: nowIso,
        count: freshNews.length,
        news: freshNews
      });
      return inMemoryCache;
    }
  } catch (err) {
    console.warn("Fallo en ingesta de noticias en tiempo real:", err?.message || err);
  } finally {
    activeFetchPromise = null;
  }
  return null;
}

export async function refreshNewsCache() {
  console.log("Iniciando actualización de noticias macroeconómicas...");
  const res = await performNewsIngestion();
  if (res && res.news) {
    console.log(`Cache guardada exitosamente en ${CACHE_PATH} con ${res.news.length} sucesos.`);
    return {
      updatedAt: res.updatedAt,
      count: res.news.length,
      news: res.news
    };
  }

  const disk = readDiskCache();
  const fallbackPayload = {
    updatedAt: disk?.updatedAt || new Date().toISOString(),
    count: disk?.news?.length || FALLBACK_NEWS.length,
    news: disk?.news || FALLBACK_NEWS
  };
  writeDiskCache(fallbackPayload);
  return fallbackPayload;
}

export async function getMacroNews(force = false) {
  const now = Date.now();

  // 0. Forced refresh (cron / manual)
  if (force) {
    if (!activeFetchPromise) {
      activeFetchPromise = performNewsIngestion();
    }
    try {
      const result = await Promise.race([
        activeFetchPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 9000))
      ]);
      if (result && result.news && result.news.length > 0) {
        return {
          news: result.news,
          updatedAt: result.updatedAt,
          cached: false,
          refreshed: true
        };
      }
    } catch {
      // fall through to cache
    }
  }

  // 1. In-memory cache hit (fresh within TTL)
  if (inMemoryCache.news && inMemoryCache.news.length > 0 && (now - inMemoryCache.timestamp < CACHE_TTL_MS)) {
    return {
      news: inMemoryCache.news,
      updatedAt: inMemoryCache.updatedAt,
      cached: true
    };
  }

  // 2. Check disk cache if in-memory cache is empty (cold start)
  let diskData = null;
  if (!inMemoryCache.news) {
    diskData = readDiskCache();
    if (diskData && diskData.news && diskData.news.length > 0) {
      const diskTime = diskData.updatedAt ? Date.parse(diskData.updatedAt) : 0;
      const diskFresh = (now - diskTime < CACHE_TTL_MS);
      inMemoryCache = {
        news: diskData.news,
        updatedAt: diskData.updatedAt || new Date().toISOString(),
        timestamp: diskTime || now
      };
      if (diskFresh) {
        return {
          news: inMemoryCache.news,
          updatedAt: inMemoryCache.updatedAt,
          cached: true
        };
      }
    }
  }

  // 3. Stale cache or cold start: trigger automated ingestion
  if (!activeFetchPromise) {
    activeFetchPromise = performNewsIngestion();
  }

  // If we already have cached news (in memory or from disk), give fetch up to 2.5s;
  // if slow, gracefully return the existing cache while fetch finishes in background
  const hasExistingData = Boolean(inMemoryCache.news && inMemoryCache.news.length > 0);
  const waitTimeout = hasExistingData ? 2500 : 4500;

  try {
    const fetchWithTimeout = Promise.race([
      activeFetchPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), waitTimeout))
    ]);
    const result = await fetchWithTimeout;
    if (result && result.news && result.news.length > 0) {
      return {
        news: result.news,
        updatedAt: result.updatedAt,
        cached: false
      };
    }
  } catch {
    // Ingestion timed out or threw; fall back smoothly
  }

  // 4. Smooth fallback hierarchy
  if (inMemoryCache.news && inMemoryCache.news.length > 0) {
    return {
      news: inMemoryCache.news,
      updatedAt: inMemoryCache.updatedAt,
      cached: true
    };
  }

  if (diskData && diskData.news && diskData.news.length > 0) {
    return {
      news: diskData.news,
      updatedAt: diskData.updatedAt,
      cached: true
    };
  }

  return {
    news: FALLBACK_NEWS,
    updatedAt: new Date().toISOString(),
    cached: false
  };
}

const FEED_URL = "https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/noticias.json";
let feedCache = null; // { at, value }

function agoLabel(ms) {
  const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h}h` : `hace ${Math.round(h / 24)} d`;
}

async function ownFeed() {
  if (feedCache && Date.now() - feedCache.at < 10 * 60 * 1000) return feedCache.value;
  try {
    const r = await fetch(FEED_URL, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    // A feed older than a day means the job stopped: fall back to the live pipeline
    if (!d.actualizado || Date.now() - Date.parse(d.actualizado) > 24 * 36e5) throw new Error("feed antiguo");
    const news = (d.noticias || []).slice(0, 80).map((n) => {
      const ts = Date.parse(n.fecha_iso) || Date.now();
      return { id: n.id, title: n.titulo, source: n.fuente, url: n.url, timestamp: ts, time: agoLabel(ts), category: n.categoria, impact: n.categoria, impactColor: "emerald" };
    });
    const value = news.length ? { news, updatedAt: d.actualizado } : null;
    feedCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    return feedCache?.value || null;
  }
}

export default async function handler(req, res) {
  // CORS and Security Headers
  applyCors(req, res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    if (typeof res.status === "function") {
      return res.status(200).end();
    }
    res.statusCode = 200;
    return res.end();
  }

  if (handleRateLimit(req, res)) {
    return;
  }

  const hasAuth = Boolean(req.headers?.authorization);
  setCdnCache(res, hasAuth);

  // Primary: our own feed (scripts/fetch-news.js on GitHub Actions, approved sources only).
  // Fallback: the older Google News pipeline below.
  const feed = await ownFeed();
  if (feed) {
    const body = { status: "ok", source: "PerData (fuentes aprobadas)", updatedAt: feed.updatedAt, cached: true, refreshed: false, count: feed.news.length, news: feed.news };
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify(body));
  }

  const forceRefresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");
  const { news, updatedAt, cached, refreshed } = await getMacroNews(forceRefresh);

  const responseBody = {
    status: "ok",
    source: "PerData Intelligence Feed Pipeline",
    updatedAt,
    cached: Boolean(cached),
    refreshed: Boolean(refreshed),
    count: news.length,
    news
  };

  if (typeof res.status === "function") {
    const s = res.status(200);
    if (s && typeof s.json === "function") {
      return s.json(responseBody);
    }
  }
  if (typeof res.json === "function") {
    res.statusCode = 200;
    return res.json(responseBody);
  }

  res.statusCode = 200;
  if (typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  if (typeof res.end === "function") {
    return res.end(JSON.stringify(responseBody));
  }
}
