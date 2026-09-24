// Build a VERIFIED catalog: auto-resolve real BVL tickers via Yahoo search,
// then test every symbol against the chart API. Output: JSON with survivors.
const OUT = { resolved: {}, verified: [], failed: [] };

// 1) Peruvian company names to auto-resolve on Yahoo (BVL .LM tickers)
const PE_NAMES = [
  "Buenaventura", "Southern Copper", "Volcan Compania Minera", "Minsur", "Nexa Resources",
  "Minera Corona", "Minera IRL", "Compania Minera Poderosa", "Unacem", "Cementos Pacasmayo",
  "Ferreycorp", "Grana y Montero", "Aenza", "Alicorp", "Backus", "Corporacion Lindley",
  "Gloria", "Lucchetti", "Inretail", "Credicorp", "Intercorp Financial", "Interbank",
  "BBVA Peru", "Scotiabank Peru", "Banco de Comercio", "Caja Arequipa", "Caja Cusco",
  "Caja Huancayo", "Caja Piura", "Caja Sullana", "Caja Trujillo", "Financiera Confianza",
  "Rimac Seguros", "Pacifico Seguros", "Mapfre Peru", "La Positiva", "Enel Distribucion Peru",
  "Luz del Sur", "Enel Generacion Peru", "Engie Energia Peru", "Red de Energia del Peru",
  "Telefonica del Peru", "Andino Investment Holding", "S&P Peru", "iShares S&P Peru",
  "San Miguel Industrias", "Eternit Peru", "Famesa", "Corporacion Aceros Arequipa",
  "Aceros Arequipa", "Siderperu", "Cementos Lima", "UNACEM", "Enaex", "SBS Peru",
  "Polaridad", "Viva Airlines Peru", "Aerolineas Andinas", "Gilat Peru", "Cementos Sol",
  "Quimpac", "Orazul Energy", "Termica", "Hidrandina", "Electroperu", "Pluz Energia",
  "Fibra Pachacamac", "Fibra Immobilien", "Credicorp Capital", "BBVA Fondos"
];

// 2) Global/known candidates to verify directly
const GLOBAL = [
  "^GSPC","^DJI","^IXIC","^STOXX50E","000001.SS","^MXX","^BVSP","^N225","^FTSE","^IBEX",
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","JPM","V","KO","PEP","MCD","XOM","CVX",
  "WMT","PG","JNJ","LLY","MA","COST","HD","ORCL","AMD","QCOM","AVGO","ASML","TSM","BAC","C",
  "GS","BLK","ABEV","PBR","ITUB","BBDO","BBD","MELI","ARCO","GGB","SID","EC","CX","FMX","AMX",
  "FCX","BHP","RIO","NEM","GOLD","AEM","TECK","GFI","AG","PAAS","BTG","SCCO","MPWR",
  "HG=F","GC=F","SI=F","PL=F","PA=F","CL=F","BZ=F","NG=F","ZW=F","ZC=F","ZS=F","SB=F","CC=F","KC=F","LBS=F",
  "PEN=X","EURUSD=X","USDJPY=X","USDMXN=X","USDBRL=X","USDCOP=X","USDCNY=X","DX-Y.NYB",
  "GBPUSD=X","AUDUSD=X","USDCAD=X","USDCHF=X","EURPEN=X",
  "^TNX","^TYX","^FVX","BTC-USD","ETH-USD","GLD","SLV","EEM","ILF","USO"
];

// 3) Curated unlisted Peruvian majors (reference-only entries, no market data)
const UNLISTED = [
  { name: "Cosapi S.A.", sector: "Conglomerado Industrial y Construcción", country: "Perú", tags: ["cosapi","construccion","ingenieria","mineria","privada","real estate","aviacion"] },
  { name: "Danper Trujillo S.A.C.", sector: "Agroindustria", country: "Perú", tags: ["danper","agro","esparragos","palta","exportacion","privada"] },
  { name: "Compania de Minas Casapalca", sector: "Minería", country: "Perú", tags: ["casapalca","plomo","zinc","plata","privada"] },
  { name: "Compania Minera Antamina S.A.", sector: "Minería", country: "Perú", tags: ["antamina","cobre","zinc","privada","joint venture"] },
  { name: "Sociedad Minera Cerro Verde S.A.A.", sector: "Minería", country: "Perú", tags: ["cerro verde","cobre","arequipa","freeport","privada"] },
  { name: "Talma Servicios Aeroportuarios", sector: "Servicios y Logística", country: "Perú", tags: ["talma","aeropuertos","logistica","privada"] }
];

async function ysearch(q) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "*/*" },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.quotes || []).filter(x => x.symbol && (x.shortname || x.longname));
  } catch { return []; }
}

async function verify(sym) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1mo`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "*/*" },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (!res) return null;
    return { symbol: sym, name: res.meta?.longName || res.meta?.shortName || sym, currency: res.meta?.currency || "", exchange: res.meta?.exchangeName || "", hasData: (res.timestamp || []).length > 0 };
  } catch { return null; }
}

(async () => {
  const seen = new Set();
  for (const name of PE_NAMES) {
    const quotes = await ysearch(name);
    const lm = quotes.filter(x => x.symbol.endsWith(".LM") && !seen.has(x.symbol));
    for (const q of lm.slice(0, 3)) {
      seen.add(q.symbol);
      OUT.resolved[name] = OUT.resolved[name] || [];
      OUT.resolved[name].push({ symbol: q.symbol, name: q.shortname || q.longname, type: q.quoteType });
    }
    await new Promise(r => setTimeout(r, 300));
  }
  const toVerify = [...seen, ...GLOBAL];
  for (const sym of toVerify) {
    const v = await verify(sym);
    if (v && v.hasData) OUT.verified.push(v); else OUT.failed.push(sym);
    await new Promise(r => setTimeout(r, 200));
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/catalog-build.json", JSON.stringify(OUT, null, 1));
  console.log("RESOLVED_BVL count:", Object.keys(OUT.resolved).length);
  console.log("VERIFIED:", OUT.verified.length);
  console.log("verified symbols:", OUT.verified.map(v => v.symbol).join(","));
  console.log("FAILED:", OUT.failed.length, OUT.failed.join(","));
})();
