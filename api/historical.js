import { CATALOG } from "./search.js";
import { PLANS, planForUser, canUseRange, upgradeRequired } from "./_lib/plans.js";
import { getAuthUserOrNull } from "./_lib/session.js";
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";
import { nemonicoOf, smvRows } from "./_lib/smv.js";
import { SOURCES, sourcePoints, monthlyPoints } from "./_lib/sources.js";
import EMPRESAS from "../data/empresas.json" with { type: "json" };

const MONEDA = new Map(EMPRESAS.emisores.flatMap((e) => e.valores.map((v) => [v.nemonico, v.moneda === "US$" ? "USD" : "PEN"])));

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

const RANGE_MONTHS = { "1mo": 1, "3mo": 3, "6mo": 6, "1y": 12, "2y": 24, "3y": 36, "5y": 60, "10y": 120, max: 400 };
const isoMonthsAgo = (n) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
export function monthlyPointsInRange(points, method, cutoff) {
  const cutoffMonth = cutoff.slice(0, 7);
  return monthlyPoints(points, method).filter(([month]) => month >= cutoffMonth);
}
const point = (r, date) => ({ date, timestamp: Math.floor(Date.parse(r.fecha) / 1000), open: r.apertura ?? r.cierre, high: r.maximo ?? r.cierre,
  low: r.minimo ?? r.cierre, close: r.cierre, volume: Math.round(r.monto || 0) });

// Lima stocks: daily closes from the SMV registry (Supabase). null when there are no rows yet.
async function smvPayload(symbol, nemo, range, interval) {
  const monthly = interval === "1mo" || interval === "1y";
  const [main, daily] = await Promise.all([
    smvRows(nemo, isoMonthsAgo(RANGE_MONTHS[range] || 60), { monthly }),
    monthly ? smvRows(nemo, isoMonthsAgo(12)) : null,
  ]);
  const dailyRows = (daily || main).slice().reverse();
  if (main.length < 3 || dailyRows.length < 2) return null;
  const series = main.slice().reverse().map((r) => point(r, monthly ? r.fecha.slice(0, 8) + "01" : r.fecha));
  const last = dailyRows[dailyRows.length - 1], prev = dailyRows[dailyRows.length - 2];
  const catMeta = CATALOG.find((c) => c.symbol === symbol) || {};
  return {
    symbol, name: catMeta.name || nemo, sector: catMeta.sector || "Renta Variable", country: catMeta.country || "Perú",
    currency: MONEDA.get(nemo) || "PEN", exchange: "Bolsa de Valores de Lima", range, interval, count: series.length, series,
    live: { price: last.cierre, changePct: Number(((last.cierre / prev.cierre - 1) * 100).toFixed(2)), time: `${last.fecha}T21:00:00.000Z`, state: "CLOSED" },
    daily: dailyRows.map((r) => ({ date: r.fecha, close: r.cierre })),
    dailySource: "SMV (cierres de la Bolsa de Valores de Lima)",
  };
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

  const rawSymbol = (req.query.symbol || "PEN=X").trim();
  const rawRange = (req.query.range || "5y").toLowerCase().trim();
  const rawInterval = (req.query.interval || "1mo").toLowerCase().trim();

  // Validate inputs
  if (!SYMBOL_REGEX.test(rawSymbol)) {
    return res.status(400).json({ error: "Símbolo de activo no válido." });
  }

  const symbol = rawSymbol.toUpperCase();
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
    setCdnCache(res, hasAuth, 300);
  }
  const interval = ALLOWED_INTERVALS.has(rawInterval) ? rawInterval : "1mo";

  const official = SOURCES[symbol];
  if (official) {
    const points = sourcePoints(symbol) || [];
    const cutoff = isoMonthsAgo(RANGE_MONTHS[range] || 60);
    const monthRows = monthlyPointsInRange(points, official.mensual, cutoff);
    const catMeta = CATALOG.find((item) => item.symbol === symbol) || {};
    const series = monthRows.map(([month, close]) => ({
      date: `${month}-01`, year: month.slice(0, 4), open: close, high: close,
      low: close, close, volume: 0,
    }));
    const last = points.at(-1);
    const prev = points.at(-2);
    const daily = official.fuente === "worldBank"
      ? undefined
      : points.filter(([date]) => date >= isoMonthsAgo(12)).map(([date, close]) => ({ date, close }));
    return res.status(200).json({
      symbol, name: catMeta.name || symbol, sector: catMeta.sector || "Materias primas",
      country: catMeta.country || "Global", currency: official.unidad, exchange: official.etiqueta,
      range, interval: "1mo", count: series.length, series,
      live: last ? { price: last[1], changePct: prev ? Number(((last[1] / prev[1] - 1) * 100).toFixed(2)) : 0, time: `${last[0]}T00:00:00.000Z`, state: "CLOSED" } : null,
      ...(daily ? { daily } : {}), dailySource: official.etiqueta,
    });
  }

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

  const nemo = nemonicoOf(symbol);
  if (nemo) {
    try {
      const smv = await smvPayload(symbol, nemo, range, interval);
      if (smv) return res.status(200).json(smv);
    } catch (e) { /* not loaded yet: market data below */ }
  }

  return res.status(404).json({ error: "Activo no disponible." });
}
