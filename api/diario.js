import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";

const FEED_URL = "https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/daily-forecasts.json";
export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min cache

let cache = null; // { at, value }

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_SHORT_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function parseYMD(str) {
  if (!str) return null;
  const parts = String(str).split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
}

export function formatFechaObjetivo(fechaStr, hoyStr) {
  const dt = parseYMD(fechaStr);
  const hdt = parseYMD(hoyStr);
  if (!dt || !hdt) return "";
  const diffDays = Math.round((dt - hdt) / (86400 * 1000));
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  const weekday = WEEKDAYS_ES[dt.getUTCDay()];
  const dateFormatted = `${day} ${month}`;

  if (diffDays === 1) {
    return `Mañana, ${weekday} ${dateFormatted}`;
  }
  if (diffDays === 0) {
    return `Para el cierre de hoy, ${weekday} ${dateFormatted}`;
  }
  return `El ${weekday} ${dateFormatted}`;
}

export function formatPreguntaObjetivo(fechaStr, hoyStr) {
  const dt = parseYMD(fechaStr);
  const hdt = parseYMD(hoyStr);
  if (!dt || !hdt) return "¿A cuánto estará el dólar mañana?";
  const diffDays = Math.round((dt - hdt) / (86400 * 1000));
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  const weekday = WEEKDAYS_ES[dt.getUTCDay()];
  const dateFormatted = `${day} ${month}`;

  if (diffDays === 0) {
    return "¿A cuánto cerrará el dólar hoy?";
  }
  if (diffDays === 1) {
    return "¿A cuánto estará el dólar mañana?";
  }
  return `¿A cuánto cerrará el dólar el ${weekday} ${dateFormatted}?`;
}

export function formatCierreFecha(fechaStr) {
  const dt = parseYMD(fechaStr);
  if (!dt) return "";
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  return `${day} ${month}`;
}

export function formatSemanaFecha(fechaStr) {
  const dt = parseYMD(fechaStr);
  if (!dt) return "";
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  const wk = WEEKDAYS_SHORT_ES[dt.getUTCDay()];
  return `${wk} ${day} ${month}`;
}

function getTodayLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

export async function loadDailyData() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  // 1. Try local file if running in Node.js
  try {
    let localPath = null;
    if (typeof import.meta?.url === "string") {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      localPath = path.join(__dirname, "../data/daily-forecasts.json");
    } else if (typeof process !== "undefined" && process.cwd) {
      localPath = path.resolve(process.cwd(), "data/daily-forecasts.json");
    }

    if (localPath && fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf8");
      const parsed = JSON.parse(content);
      cache = { at: Date.now(), value: parsed };
      return parsed;
    }
  } catch {
    // Ignore and proceed to remote fetch
  }

  // 2. Fetch from GitHub RAW
  try {
    const r = await fetch(FEED_URL, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    cache = { at: Date.now(), value: d };
    return d;
  } catch {
    return cache?.value || null;
  }
}

function parseQuery(req) {
  if (req.query && typeof req.query === "object") return req.query;
  try {
    const u = new URL(req.url, "http://localhost");
    return Object.fromEntries(u.searchParams.entries());
  } catch {
    return {};
  }
}

function sendJson(res, body, status = 200) {
  if (typeof res.status === "function") {
    const s = res.status(status);
    if (s && typeof s.json === "function") return s.json(body);
  }
  if (typeof res.json === "function") {
    res.statusCode = status;
    return res.json(body);
  }
  res.statusCode = status;
  if (typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  if (typeof res.end === "function") {
    return res.end(JSON.stringify(body));
  }
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    if (typeof res.status === "function") return res.status(200).end();
    res.statusCode = 200;
    return res.end();
  }

  if (handleRateLimit(req, res)) {
    return;
  }

  const hasAuth = Boolean(req.headers?.authorization);
  setCdnCache(res, hasAuth, 1800); // 30 min CDN cache

  const query = parseQuery(req);
  const rawSymbol = query.symbol || "PEN";
  const symbol = String(rawSymbol).trim().replace(/=X$/i, "").toUpperCase();

  const data = await loadDailyData();
  if (!data || !data.simbolos) {
    return sendJson(res, { vigente: false, error: "Datos diarios no disponibles" });
  }

  const symbolData = data.simbolos[symbol];
  if (!symbolData) {
    return sendJson(res, { vigente: false, error: `Símbolo no encontrado: ${symbol}` });
  }

  const todayLima = getTodayLima();
  const mananaFecha = symbolData.manana?.fecha_objetivo;

  if (!mananaFecha || mananaFecha < todayLima) {
    return sendJson(res, {
      vigente: false,
      symbol,
      motivo: "Pronóstico anterior a hoy en Lima",
      fecha_objetivo: mananaFecha || null,
      hoy_lima: todayLima
    });
  }

  const etiqueta = formatFechaObjetivo(mananaFecha, todayLima);
  const pregunta = formatPreguntaObjetivo(mananaFecha, todayLima);
  const etiquetaCierre = formatCierreFecha(symbolData.fecha_ultimo_cierre);
  const etiquetaSemana = formatSemanaFecha(symbolData.semana?.fecha_objetivo);

  return sendJson(res, {
    vigente: true,
    symbol,
    actualizado: data.actualizado,
    hoy_lima: todayLima,
    ...symbolData,
    etiqueta,
    pregunta,
    etiqueta_cierre: etiquetaCierre,
    etiqueta_semana: etiquetaSemana
  });
}

export async function getDailyDollarSummary() {
  try {
    const data = await loadDailyData();
    if (!data || !data.simbolos || !data.simbolos.PEN) return null;
    const symbolData = data.simbolos.PEN;
    if (!symbolData.manana) return null;

    const todayLima = getTodayLima();
    const mananaFecha = symbolData.manana?.fecha_objetivo;
    if (!mananaFecha || mananaFecha < todayLima) return null;

    const etiqueta = formatFechaObjetivo(mananaFecha, todayLima);
    const pregunta = formatPreguntaObjetivo(mananaFecha, todayLima);
    const etiquetaCierre = formatCierreFecha(symbolData.fecha_ultimo_cierre);
    const etiquetaSemana = formatSemanaFecha(symbolData.semana?.fecha_objetivo);

    return {
      vigente: true,
      symbol: "PEN",
      actualizado: data.actualizado,
      hoy_lima: todayLima,
      ...symbolData,
      etiqueta,
      pregunta,
      etiqueta_cierre: etiquetaCierre,
      etiqueta_semana: etiquetaSemana
    };
  } catch {
    return null;
  }
}
