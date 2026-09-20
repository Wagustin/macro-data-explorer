import fs from "fs";
import path from "path";
import dns from "node:dns";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const CACHE_FILE = path.join(DATA_DIR, "news-cache.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FEEDS = [
  {
    name: "BCRP / Política Monetaria",
    category: "Política Monetaria",
    symbol: "PEN=X",
    impact: "BCRP",
    impactColor: "blue",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("BCRP OR Banco Central de Reserva OR Julio Velarde") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "LME / COMEX Cobre",
    category: "Commodities",
    symbol: "HG=F",
    impact: "COBRE",
    impactColor: "amber",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("precio del cobre OR LME copper OR COMEX copper") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Minería Peruana BVN/SCCO",
    category: "Minería",
    symbol: "BVN",
    impact: "MINERÍA",
    impactColor: "amber",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("Buenaventura OR Southern Copper OR Cerro Verde OR mineria Peru") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Tipo de Cambio USD/PEN",
    category: "Forex",
    symbol: "PEN=X",
    impact: "DIVISAS",
    impactColor: "emerald",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("tipo de cambio dolar sol peru OR USD PEN") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Petróleo WTI",
    category: "Commodities",
    symbol: "CL=F",
    impact: "WTI",
    impactColor: "purple",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("petroleo WTI OR precio del crudo OR barril de petroleo") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  }
];

function decodeHtml(html) {
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

function parseItems(xmlText, feed) {
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
    const ageMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
    const timeAgo = ageMinutes < 60 ? `hace ${ageMinutes}m` : `hace ${Math.round(ageMinutes / 60)}h`;

    return {
      id: `live-${feed.symbol}-${timestamp}-${idx}`,
      impact: feed.impact,
      impactColor: feed.impactColor,
      title: headline,
      source: source || "Agencia Oficial",
      url,
      time: timeAgo,
      timestamp,
      symbol: feed.symbol,
      category: feed.category
    };
  });
}

export async function refreshNewsCache() {
  console.log("Iniciando actualización de noticias macroeconómicas...");
  const results = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MacroDataExplorer/2.5" },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const text = await res.text();
        const items = parseItems(text, feed);
        results.push(...items);
      }
    } catch (e) {
      console.warn("Fallo al actualizar feed:", feed.name, e.message);
    }
  }

  // Deduplicate and sort by most recent timestamp
  const seenTitles = new Set();
  const deduped = [];
  for (const item of results.sort((a, b) => b.timestamp - a.timestamp)) {
    const key = item.title.toLowerCase().slice(0, 40);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      deduped.push(item);
    }
  }

  const finalNews = deduped.slice(0, 20);
  const cachePayload = {
    updatedAt: new Date().toISOString(),
    count: finalNews.length,
    news: finalNews
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload, null, 2), "utf-8");
  console.log(`Cache guardada exitosamente en ${CACHE_FILE} con ${finalNews.length} sucesos.`);
  return cachePayload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refreshNewsCache();
}
