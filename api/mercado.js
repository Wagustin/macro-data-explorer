import EMPRESAS from "../data/empresas.json" with { type: "json" };
import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";
import { d1 } from "./_lib/d1.js";

const COMPANY_NAMES = new Map((EMPRESAS.emisores || []).flatMap((issuer) =>
  (issuer.valores || []).map((value) => [value.nemonico, issuer.razonSocial])
));

function thirtyDaysAgo() {
  const limaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  limaNow.setUTCDate(limaNow.getUTCDate() - 30);
  return limaNow.toISOString().slice(0, 10);
}

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

  const securities = [];
  for (const [nemonico, entries] of bySymbol) {
    entries.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const unique = entries.filter((row, i) => i === 0 || row.fecha !== entries[i - 1].fecha);
    if (unique.length < 5 || !(unique[0].monto > 0) || !(unique[0].cierre > 0)) continue;
    const previous = unique[1];
    const changePct = previous?.cierre > 0 ? (unique[0].cierre / previous.cierre - 1) * 100 : null;
    securities.push({
      nemonico,
      nombre: COMPANY_NAMES.get(nemonico) || nemonico,
      cierre: unique[0].cierre,
      variacion: changePct === null ? null : Number(changePct.toFixed(2)),
      monto: unique[0].monto,
      fecha: unique[0].fecha,
    });
  }

  const session = rows.reduce((latest, row) => row.fecha > latest ? row.fecha : latest, "");
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

  try {
    const desde = thirtyDaysAgo();
    let rows = await readD1(desde);
    if (!rows?.length) rows = await readSupabase(desde);
    return res.status(200).json(summarize(rows));
  } catch (error) {
    console.error("Market data unavailable:", error.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "No fue posible cargar los datos del mercado." });
  }
}
