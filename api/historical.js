import { CATALOG } from "./search.js";
import { PLANS, planForUser, canUseRange, upgradeRequired } from "./_lib/plans.js";
import { getAuthUserOrNull } from "./_lib/session.js";
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";

const SYMBOL_REGEX = /^[A-Za-z0-9=._\-\^]{1,20}$/;
const ALLOWED_RANGES = new Set(["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "10y", "max"]);
const ALLOWED_INTERVALS = new Set(["1d", "1wk", "1mo", "1y"]);

// Offline static dataset (annual, 2014-2025) used when the World Bank API is
// unavailable, errors, or times out, so macro charts degrade instead of 500/502.
const MACRO_FALLBACK_START_YEAR = 2014;
const MACRO_FALLBACK = {
  PERU_CPI: {
    name: "Inflación Anual Perú (%)",
    values: [3.41, 3.40, 3.56, 2.99, 1.51, 2.25, 2.00, 4.27, 8.33, 6.46, 2.01, 1.53]
  },
  PERU_GDP: {
    name: "PBI Crecimiento Anual Perú (%)",
    values: [2.38, 3.25, 3.95, 2.52, 3.97, 2.24, -10.93, 13.42, 2.82, -0.35, 3.52, 3.43]
  }
};

function toMacroRecord(year, value) {
  const v = Number(Number(value).toFixed(2));
  return {
    date: `${year}-12-31`,
    year: String(year),
    open: v,
    high: v,
    low: v,
    close: v,
    volume: 0
  };
}

function fallbackMacroRecords(symbol) {
  const fb = MACRO_FALLBACK[symbol];
  if (!fb) return [];
  return fb.values.map((value, i) => toMacroRecord(MACRO_FALLBACK_START_YEAR + i, value));
}

export default async function handler(req, res) {
  // Security & CORS Headers
  applyCors(req, res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (handleRateLimit(req, res)) {
    return;
  }

  const rawSymbol = (req.query.symbol || "BVN").trim();
  const rawRange = (req.query.range || "5y").toLowerCase().trim();
  const rawInterval = (req.query.interval || "1mo").toLowerCase().trim();

  // Validate inputs
  if (!SYMBOL_REGEX.test(rawSymbol)) {
    return res.status(400).json({ error: "Símbolo de activo no válido." });
  }

  const symbol = rawSymbol;
  const range = ALLOWED_RANGES.has(rawRange) ? rawRange : "5y";

  const hasAuth = Boolean(req.headers?.authorization);

  // Long ranges are a paid feature; only hit the user store when they're requested.
  if (!canUseRange(PLANS.anon, range)) {
    const plan = planForUser(await getAuthUserOrNull(req));
    setCdnCache(res, true);
    if (!canUseRange(plan, range)) {
      return res.status(403).json(upgradeRequired(plan, "range"));
    }
  } else {
    setCdnCache(res, hasAuth);
  }
  const interval = ALLOWED_INTERVALS.has(rawInterval) ? rawInterval : "1mo";

  // Special handler for macroeconomic indicators (World Bank, with offline fallback)
  if (symbol === "PERU_CPI" || symbol === "PERU_GDP") {
    const catMeta = CATALOG.find(c => c.symbol === symbol) || {};
    const fallbackName = MACRO_FALLBACK[symbol].name;
    let records = [];
    let stale = false;

    try {
      const indicator = symbol === "PERU_CPI" ? "FP.CPI.TOTL.ZG" : "NY.GDP.MKTP.KD.ZG";
      const wbUrl = `https://api.worldbank.org/v2/country/PER/indicator/${indicator}?format=json&date=2014:2026&per_page=50`;
      const wbRes = await fetch(wbUrl, { 
        headers: { "User-Agent": "PerDataExplorer/2.5" },
        signal: AbortSignal.timeout(6000)
      });

      if (wbRes.ok) {
        const wbData = await wbRes.json();
        const wbRecords = (wbData?.[1] || [])
          .filter(it => it.value !== null && it.value !== undefined)
          .reverse()
          .map(it => toMacroRecord(it.date, it.value));
        // An empty/garbled upstream payload is treated the same as a failed fetch.
        if (wbRecords.length > 0) records = wbRecords;
      }
    } catch (err) {
      // Network error, abort/timeout, or malformed JSON: fall through to static data.
      records = [];
    }

    if (records.length === 0) {
      records = fallbackMacroRecords(symbol);
      stale = true;
    }

    return res.status(200).json({
      symbol,
      name: catMeta.name || fallbackName,
      currency: "%",
      range,
      interval: "1y",
      source: stale ? "Banco Mundial (copia guardada)" : "Banco Mundial",
      stale,
      count: records.length,
      series: records
    });
  }

  // Standard Market Quotes (Yahoo Finance v8 API)
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const yfRes = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      },
      signal: AbortSignal.timeout(7000)
    });

    if (!yfRes.ok) {
      return res.status(yfRes.status).json({ error: "Error de consulta en el proveedor financiero." });
    }

    const data = await yfRes.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: "No se encontraron datos para el símbolo solicitado." });
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

    // Live market signal from meta (regular market quote, may be intraday)
    const live = {
      price: typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null,
      changePct: typeof meta.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent : null,
      time: typeof meta.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
      state: meta.marketState || null
    };

    // 1-year DAILY sessions for high-resolution chart rendering (independent of selected interval)
    let daily = [];
    try {
      const dUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
      const dRes = await fetch(dUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (dRes.ok) {
        const dData = await dRes.json();
        const dRes0 = dData?.chart?.result?.[0];
        const dTs = dRes0?.timestamp || [];
        const dQ = dRes0?.indicators?.quote?.[0] || {};
        const dC = dQ.close || [];
        for (let i = 0; i < dTs.length; i++) {
          if (dC[i] !== null && dC[i] !== undefined && !isNaN(dC[i])) {
            const dt = new Date(dTs[i] * 1000);
            daily.push({
              date: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`,
              close: Number(dC[i].toFixed(4))
            });
          }
        }
      }
    } catch (e) { /* daily context is best-effort */ }

    // USD/PEN: la serie diaria de Yahoo mezcla dos cotizaciones y salta a diario entre ellas.
    // Se usa el tipo de cambio oficial del BCRP (TC sistema bancario SBS, venta, PD04640PD).
    let dailySource = "Yahoo Finance";
    if (symbol === "PEN=X") {
      try {
        const MES = { Ene: "01", Feb: "02", Mar: "03", Abr: "04", May: "05", Jun: "06", Jul: "07", Ago: "08", Set: "09", Sep: "09", Oct: "10", Nov: "11", Dic: "12" };
        const end = new Date();
        const start = new Date(end.getTime() - 400 * 864e5);
        const iso = (d) => d.toISOString().slice(0, 10);
        const bRes = await fetch(`https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/${iso(start)}/${iso(end)}`, { signal: AbortSignal.timeout(6000) });
        if (bRes.ok) {
          // Con rangos largos el BCRP añade un aviso HTML detrás del JSON: se corta en el último «}» antes del HTML
          const raw = await bRes.text();
          const cut = raw.indexOf("<") > 0 ? raw.slice(0, raw.indexOf("<")) : raw;
          const bData = JSON.parse(cut.slice(0, cut.lastIndexOf("}") + 1));
          const pts = [];
          for (const per of (bData.periods || [])) {
            const m = /^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/.exec(per.name || "");
            const v = parseFloat((per.values || [])[0]);
            if (m && MES[m[2]] && isFinite(v)) pts.push({ date: `20${m[3]}-${MES[m[2]]}-${m[1]}`, close: v });
          }
          if (pts.length > 20) { daily = pts; dailySource = "BCRP (tipo de cambio SBS, venta)"; }
        }
      } catch (e) { /* si el BCRP no responde, se queda la serie de Yahoo */ }
    }

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
      series,
      live,
      daily,
      dailySource
    });
  } catch (err) {
    return res.status(500).json({ error: "Falla temporal al procesar la cotización histórica." });
  }
}
