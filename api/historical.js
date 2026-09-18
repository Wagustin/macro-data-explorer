import { CATALOG } from "./search.js";

export default async function handler(req, res) {
  const symbol = (req.query.symbol || "BVN").trim();
  const range = (req.query.range || "10y").toLowerCase(); // 1y, 3y, 5y, 10y
  const interval = (req.query.interval || "1mo").toLowerCase(); // 1d, 1wk, 1mo

  // Special handler for macroeconomic indicators (World Bank)
  if (symbol === "PERU_CPI" || symbol === "PERU_GDP") {
    try {
      const indicator = symbol === "PERU_CPI" ? "FP.CPI.TOTL.ZG" : "NY.GDP.MKTP.KD.ZG";
      const wbUrl = `https://api.worldbank.org/v2/country/PER/indicator/${indicator}?format=json&date=2014:2026&per_page=50`;
      const wbRes = await fetch(wbUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const wbData = await wbRes.json();
      
      const records = (wbData[1] || [])
        .filter(it => it.value !== null)
        .reverse()
        .map(it => ({
          date: `${it.date}-12-31`,
          year: it.date,
          open: Number(it.value.toFixed(2)),
          high: Number(it.value.toFixed(2)),
          low: Number(it.value.toFixed(2)),
          close: Number(it.value.toFixed(2)),
          volume: 0
        }));

      const catMeta = CATALOG.find(c => c.symbol === symbol) || {};
      return res.status(200).json({
        symbol,
        name: catMeta.name || (symbol === "PERU_CPI" ? "Inflación Anual Perú (%)" : "PBI Crecimiento Anual Perú (%)"),
        currency: "%",
        range,
        interval: "1y",
        source: "World Bank Open Data / BCRP",
        count: records.length,
        series: records
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch macro data: " + err.message });
    }
  }

  // Standard Market Quotes (Yahoo Finance v8 API)
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const yfRes = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      }
    });

    if (!yfRes.ok) {
      return res.status(yfRes.status).json({ error: `Yahoo Finance API error: ${yfRes.statusText}` });
    }

    const data = await yfRes.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: "No chart data found for symbol: " + symbol });
    }

    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];

    const series = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c !== null && c !== undefined && !isNaN(c)) {
        const dateObj = new Date(timestamps[i] * 1000);
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
        const d = String(dateObj.getUTCDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;

        series.push({
          date: dateStr,
          timestamp: timestamps[i],
          open: opens[i] !== null && !isNaN(opens[i]) ? Number(opens[i].toFixed(4)) : Number(c.toFixed(4)),
          high: highs[i] !== null && !isNaN(highs[i]) ? Number(highs[i].toFixed(4)) : Number(c.toFixed(4)),
          low: lows[i] !== null && !isNaN(lows[i]) ? Number(lows[i].toFixed(4)) : Number(c.toFixed(4)),
          close: Number(c.toFixed(4)),
          volume: volumes[i] ? Math.round(volumes[i]) : 0
        });
      }
    }

    const catMeta = CATALOG.find(c => c.symbol === symbol) || {};

    return res.status(200).json({
      symbol: meta.symbol || symbol,
      name: catMeta.name || meta.longName || meta.shortName || symbol,
      sector: catMeta.sector || "Renta Variable",
      country: catMeta.country || "Global",
      currency: meta.currency || (symbol.endsWith(".LM") ? "PEN" : "USD"),
      exchange: meta.exchangeName || "Market",
      range,
      interval,
      count: series.length,
      series
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal error: " + err.message });
  }
}
