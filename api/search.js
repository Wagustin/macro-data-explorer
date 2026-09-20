export const CATALOG = [
  // Minería Perú & Global
  { symbol: "BVN", name: "Compañía de Minas Buenaventura", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["oro", "plata", "cobre", "zinc", "bvl", "nyse", "minas"] },
  { symbol: "SCCO", name: "Southern Copper Corporation", sector: "Minería", country: "Perú / México", category: "mining_pe", tags: ["cobre", "toquepala", "cuajone", "nyse", "bvl"] },
  { symbol: "VOLCABC1.LM", name: "Volcan Compañía Minera", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["zinc", "plata", "plomo", "bvl"] },
  { symbol: "MINSURI1.LM", name: "Minsur S.A.", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["estaño", "oro", "san rafael", "bvl"] },
  { symbol: "NEXAPEC1.LM", name: "Nexa Resources Perú", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["zinc", "plomo", "cerro lindo", "bvl"] },
  { symbol: "FCX", name: "Freeport-McMoRan (Cerro Verde)", sector: "Minería", country: "Global / Perú", category: "mining_global", tags: ["cobre", "oro", "cerro verde", "nyse"] },
  { symbol: "BHP", name: "BHP Group (Antamina)", sector: "Minería", country: "Global", category: "mining_global", tags: ["cobre", "hierro", "antamina", "nyse"] },
  { symbol: "RIO", name: "Rio Tinto plc", sector: "Minería", country: "Global", category: "mining_global", tags: ["mineral de hierro", "aluminio", "cobre", "nyse"] },
  { symbol: "VALE", name: "Vale S.A.", sector: "Minería", country: "Brasil / Latam", category: "mining_global", tags: ["hierro", "niquel", "cobre", "nyse"] },

  // Empresas Corporativas & Financieras Perú
  { symbol: "BAP", name: "Credicorp Ltd. (BCP)", sector: "Banca & Finanzas", country: "Perú", category: "corporate_pe", tags: ["banco de credito", "pacifico", "prima afp", "nyse", "bvl"] },
  { symbol: "IFS", name: "Intercorp Financial Services", sector: "Banca & Finanzas", country: "Perú", category: "corporate_pe", tags: ["interbank", "interseguro", "inteligo", "nyse", "bvl"] },
  { symbol: "ALICORC1.LM", name: "Alicorp S.A.A.", sector: "Consumo Masivo", country: "Perú", category: "corporate_pe", tags: ["alimentos", "primor", "don vittorio", "bvl"] },
  { symbol: "FERREYC1.LM", name: "Ferreycorp S.A.A.", sector: "Bienes de Capital / Maquinaria", country: "Perú", category: "corporate_pe", tags: ["caterpillar", "maquinaria minera", "bvl"] },
  { symbol: "CPACASC1.LM", name: "Cementos Pacasmayo", sector: "Construcción / Cemento", country: "Perú", category: "corporate_pe", tags: ["cemento", "concreto", "norte", "bvl", "nyse"] },

  // Commodities & Metales
  { symbol: "HG=F", name: "Cobre Futuros (COMEX Copper)", sector: "Commodity Metales", country: "Global", category: "commodity", tags: ["cobre", "copper", "metal industrial"] },
  { symbol: "GC=F", name: "Oro Futuros (COMEX Gold)", sector: "Commodity Metales", country: "Global", category: "commodity", tags: ["oro", "gold", "reserva"] },
  { symbol: "SI=F", name: "Plata Futuros (COMEX Silver)", sector: "Commodity Metales", country: "Global", category: "commodity", tags: ["plata", "silver"] },
  { symbol: "CL=F", name: "Petróleo Crudo WTI", sector: "Commodity Energía", country: "Global", category: "commodity", tags: ["petroleo", "oil", "energia"] },

  // Variables Macroeconómicas & Divisas
  { symbol: "PEN=X", name: "Tipo de Cambio USD / PEN", sector: "Divisas (Forex)", country: "Perú", category: "macro", tags: ["dolar", "sol", "tipo de cambio", "fx"] },
  { symbol: "^TNX", name: "Rendimiento Bonos Tesoro EE.UU. 10Y", sector: "Tasas de Interés", country: "EE.UU.", category: "macro", tags: ["bonos", "tasa libre de riesgo", "fed"] },
  { symbol: "^SPX", name: "S&P 500 Index", sector: "Renta Variable", country: "EE.UU.", category: "macro", tags: ["sp500", "bolsa"] },
  { symbol: "PERU_CPI", name: "Inflación Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro", tags: ["inflacion", "cpi", "ipc", "bcrp", "banco mundial"] },
  { symbol: "PERU_GDP", name: "Crecimiento PBI Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro", tags: ["pbi", "gdp", "crecimiento economico", "banco mundial"] }
];

export default async function handler(req, res) {
  // CORS and Security Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1200");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let q = String(req.query.q || "").trim().toLowerCase();
  if (q.length > 50) {
    q = q.slice(0, 50);
  }
  
  if (!q) {
    return res.status(200).json({ results: CATALOG.slice(0, 15) });
  }

  // Filter local catalog first
  const localMatches = CATALOG.filter(item => {
    return item.symbol.toLowerCase().includes(q) ||
           item.name.toLowerCase().includes(q) ||
           item.sector.toLowerCase().includes(q) ||
           item.country.toLowerCase().includes(q) ||
           item.tags.some(t => t.toLowerCase().includes(q));
  });

  if (localMatches.length >= 6) {
    return res.status(200).json({ results: localMatches });
  }

  // Complement with Yahoo Finance dynamic lookup if needed
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    const yfRes = await fetch(yfUrl, {
      headers: { "User-Agent": "PerDataExplorer/2.5" },
      signal: AbortSignal.timeout(5000)
    });
    
    if (yfRes.ok) {
      const yfData = await yfRes.json();
      const yfQuotes = (yfData.quotes || [])
        .filter(it => it.symbol && (it.shortname || it.longname))
        .map(it => ({
          symbol: String(it.symbol).slice(0, 20),
          name: String(it.shortname || it.longname).slice(0, 100),
          sector: String(it.sector || it.quoteType || "Global Stock").slice(0, 50),
          country: String(it.exchange || "Global").slice(0, 50),
          category: "global_stock",
          tags: [String(it.symbol).toLowerCase()]
        }));

      // Merge and deduplicate by symbol
      const seen = new Set(localMatches.map(m => m.symbol));
      for (const item of yfQuotes) {
        if (!seen.has(item.symbol)) {
          seen.add(item.symbol);
          localMatches.push(item);
        }
      }
    }
  } catch (err) {
    // Non-blocking fallback to local matches
  }

  return res.status(200).json({ results: localMatches.slice(0, 15) });
}
