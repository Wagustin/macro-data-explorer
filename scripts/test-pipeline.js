import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const FEEDS = [
  {
    name: "BCRP",
    category: "Política Monetaria",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("BCRP OR Banco Central de Reserva OR Julio Velarde") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Federal Reserve",
    category: "Política Monetaria",
    url: "https://www.federalreserve.gov/feeds/press_all.xml"
  },
  {
    name: "LME/COMEX Cobre",
    category: "Commodities",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("precio del cobre OR LME copper OR COMEX copper") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Minería Peruana BVN/SCCO",
    category: "Minería",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("Buenaventura OR Southern Copper OR Cerro Verde OR mineria Peru") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Tipo de Cambio USD/PEN",
    category: "Forex",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("tipo de cambio dolar sol peru OR USD PEN") + "&hl=es-419&gl=PE&ceid=PE:es-419"
  },
  {
    name: "Petróleo WTI",
    category: "Commodities",
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
  return rawItems.map((it, idx) => {
    const rawTitle = decodeHtml((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const rawLink = decodeHtml((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    const rawPubDate = decodeHtml((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "");
    const rawSource = decodeHtml((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "");
    const rawDesc = decodeHtml((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "");

    let headline = rawTitle;
    let source = rawSource || feed.name;
    const lastDash = headline.lastIndexOf(" - ");
    if (lastDash > 0) {
      if (!rawSource) source = headline.slice(lastDash + 3).trim();
      headline = headline.slice(0, lastDash).trim();
    }

    const timestamp = Date.parse(rawPubDate) || Date.now();
    return {
      headline,
      source: source || "Agencia Oficial",
      url: rawLink,
      time: new Date(timestamp).toISOString(),
      timestamp,
      category: feed.category,
      desc: rawDesc
    };
  });
}

async function run() {
  const promises = FEEDS.map(async feed => {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MacroDataExplorer/2.5" },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return [];
      const text = await res.text();
      return parseItems(text, feed);
    } catch (e) {
      console.warn("Error fetching", feed.name, e.message);
      return [];
    }
  });

  const results = await Promise.all(promises);
  const allItems = results.flat();
  console.log("Total items parsed:", allItems.length);
  
  const sampleByCategory = {};
  for (const it of allItems) {
    if (!sampleByCategory[it.category]) sampleByCategory[it.category] = [];
    if (sampleByCategory[it.category].length < 2) sampleByCategory[it.category].push(it);
  }
  console.log(JSON.stringify(sampleByCategory, null, 2));
}

run();
