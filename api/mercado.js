import EMPRESAS from "../data/empresas.json" with { type: "json" };
import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";
import { d1 } from "./_lib/d1.js";

const COMPANY_NAMES = new Map((EMPRESAS.emisores || []).flatMap((issuer) =>
  (issuer.valores || []).map((value) => [value.nemonico, issuer.razonSocial])
));

function twentyOneDaysAgo() {
  const limaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  limaNow.setUTCDate(limaNow.getUTCDate() - 21);
  return limaNow.toISOString().slice(0, 10);
}

let marketCache = { data: null, at: 0 };

async function readD1(desde) {
  const db = d1();
  if (!db) return null;
  try {
    return (await db.prepare(`select nemonico, fecha, cierre, monto from cotizaciones_smv
      where fecha >= ? order by fecha desc`).bind(desde).all()).results || [];
  } catch {
    return null;
  }
}

async function readSupabase(desde) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return [];
  const url = `${base}/rest/v1/cotizaciones_smv?fecha=gte.${desde}&select=nemonico,fecha,cierre,monto&order=fecha.desc&limit=10000`;
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return (await response.json()).map((row) => ({
    nemonico: row.nemonico,
    fecha: row.fecha,
    cierre: Number(row.cierre),
    monto: Number(row.monto || 0),
  }));
}

function summarize(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    if (!row.nemonico || !row.fecha) continue;
    const entries = bySymbol.get(row.nemonico) || [];
    entries.push({ fecha: row.fecha, cierre: Number(row.cierre), monto: Number(row.monto || 0) });
    bySymbol.set(row.nemonico, entries);
  }

  const histories = new Map();
  const countsByDate = new Map();
  for (const [nemonico, entries] of bySymbol) {
    entries.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const unique = entries.filter((row, i) => i === 0 || row.fecha !== entries[i - 1].fecha);
    histories.set(nemonico, unique);
    for (const row of unique) {
      if (row.monto > 0) countsByDate.set(row.fecha, (countsByDate.get(row.fecha) || 0) + 1);
    }
  }

  const session = [...countsByDate].filter(([, count]) => count >= 10).map(([date]) => date).sort().at(-1) || "";
  const securities = [];
  for (const [nemonico, unique] of histories) {
    const current = unique.find((row) => row.fecha === session && row.monto > 0 && row.cierre > 0);
    if (!current) continue;
    const previous = unique.find((row) => row.fecha < session && row.monto > 0 && row.cierre > 0);
    const changePct = previous ? (current.cierre / previous.cierre - 1) * 100 : null;
    securities.push({
      nemonico,
      nombre: COMPANY_NAMES.get(nemonico) || nemonico,
      cierre: current.cierre,
      variacion: changePct === null ? null : Number(changePct.toFixed(2)),
      monto: current.monto,
      fecha: current.fecha,
    });
  }

  const current = securities.filter((row) => row.fecha === session);
  const gainers = current.filter((row) => row.variacion !== null).sort((a, b) => b.variacion - a.variacion).slice(0, 5);
  const losers = current.filter((row) => row.variacion !== null).sort((a, b) => a.variacion - b.variacion).slice(0, 5);
  const traded = current.sort((a, b) => b.monto - a.monto).slice(0, 5);
  return { fecha: session || null, subidas: gainers, bajadas: losers, negociadas: traded };
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  if (handleRateLimit(req, res)) return;
  const hasAuth = Boolean(req.headers?.authorization);
  res.setHeader("Cache-Control", hasAuth ? "private, no-store" : "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
  if (marketCache.data && Date.now() - marketCache.at < 10 * 60 * 1000) {
    return res.status(200).json(marketCache.data);
  }

  try {
    const desde = twentyOneDaysAgo();
    let rows = await readD1(desde);
    if (!rows?.length) rows = await readSupabase(desde);
    const data = summarize(rows);
    marketCache = { data, at: Date.now() };
    return res.status(200).json(data);
  } catch (error) {
    console.error("Market data unavailable:", error.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "No fue posible cargar los datos del mercado." });
  }
}
