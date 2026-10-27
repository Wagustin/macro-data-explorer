/**
 * PerData - Plain-language reading of a projection for the terminal.
 * Uses only the numbers the page already shows (projection, P10-P90 range, correlation with the
 * chosen comparison) and the coverage we actually measured in the backtest. No invented
 * "regimes", betas or confidence scores, and no investment advice.
 * When the daily AI note for the asset exists (data/interpretaciones.json, written by
 * scripts/interpretations.js), it is added as `aiNote`.
 */

import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";

const NOTES_URL = "https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/interpretaciones.json";
let notesCache = null; // { at, data }

async function dailyNote(symbol) {
  if (!notesCache || Date.now() - notesCache.at > 30 * 60 * 1000) {
    try {
      const r = await fetch(NOTES_URL, { signal: AbortSignal.timeout(3000) });
      notesCache = { at: Date.now(), data: r.ok ? await r.json() : null };
    } catch (e) {
      notesCache = { at: Date.now(), data: notesCache?.data || null };
    }
  }
  const d = notesCache.data;
  if (!d || Date.now() - Date.parse(d.actualizado) > 48 * 36e5) return null;
  return d.notas?.[symbol] ? { text: d.notas[symbol], model: d.modelo, date: d.actualizado } : null;
}

const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(2) : v.toFixed(3));

export default async function handler(req, res) {
  applyCors(req, res, "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (handleRateLimit(req, res)) return;
  res.setHeader("Cache-Control", "private, no-store");

  let body = {};
  if (req.method === "POST") {
    if (typeof req.body === "string") {
      try { body = JSON.parse(req.body); } catch (e) { body = {}; }
    } else if (req.body) {
      body = req.body;
    }
  } else {
    body = req.query || {};
  }

  const symbol = String(body.symbol || "BVN").slice(0, 20).toUpperCase();
  const assetName = String(body.name || body.historical?.name || symbol).slice(0, 100);
  const macroSymbol = String(body.macroSymbol || "none").slice(0, 20);
  const macroName = String(body.macroName || macroSymbol).slice(0, 100);
  const horizon = Math.max(1, Math.min(48, parseInt(body.horizon || 1, 10) || 1));
  const corrRaw = typeof body.correlation === "number" ? body.correlation : parseFloat(String(body.correlation || "").replace(",", "."));
  const correlation = Number.isFinite(corrRaw) ? corrRaw : null;
  const f = body.forecast || {};
  const q = f.quantiles || {};
  const expectedReturnPct = Number.isFinite(f.expectedReturnPct) ? f.expectedReturnPct : null;
  const p10 = Number(q.p10) || null;
  const p50 = Number(q.p50 || f.predictedPrice) || null;
  const p90 = Number(q.p90) || null;
  const probRise = Number.isFinite(f.probabilityOfRise) ? f.probabilityOfRise : null;
  const plazo = horizon === 1 ? "1 mes" : horizon === 12 ? "1 año" : `${horizon} meses`;

  // Direction, said plainly (a small expected change is "sin una dirección clara")
  let direction = "sin una dirección clara";
  if (expectedReturnPct !== null && expectedReturnPct >= 1) direction = "al alza";
  else if (expectedReturnPct !== null && expectedReturnPct <= -1) direction = "a la baja";

  const parts = [];
  if (p50) {
    parts.push(`Para dentro de ${plazo}, el valor más probable de ${assetName} según PerData Engine es ${fmt(p50)}` +
      (expectedReturnPct !== null ? ` (${expectedReturnPct >= 0 ? "+" : ""}${expectedReturnPct.toFixed(1)} % frente a hoy), una proyección ${direction}.` : "."));
  }
  if (p10 && p90) {
    parts.push(`Con los mismos datos, el precio estaría entre ${fmt(p10)} y ${fmt(p90)} en 8 de cada 10 casos; un rango ancho significa que el activo se mueve mucho, no que el modelo falle.`);
  }
  if (probRise !== null) parts.push(`De cada 10 escenarios simulados, unos ${Math.round(probRise / 10)} terminan por encima del precio de hoy.`);

  let macroSensitivity = "Sin comparación elegida";
  if (correlation !== null && macroSymbol !== "none") {
    const a = Math.abs(correlation);
    const strength = a >= 0.7 ? "fuerte" : a >= 0.4 ? "moderada" : a >= 0.2 ? "débil" : "casi nula";
    const sense = correlation >= 0 ? "suelen moverse en la misma dirección" : "suelen moverse en direcciones opuestas";
    macroSensitivity = `Relación ${strength} con ${macroName} (${correlation >= 0 ? "+" : ""}${correlation.toFixed(2)})`;
    if (a >= 0.2) parts.push(`En el periodo del gráfico, ${assetName} y ${macroName} ${sense} (correlación ${correlation.toFixed(2)}); eso no significa que uno cause al otro.`);
  }
  parts.push("Es una proyección estadística, no una recomendación de inversión: no anticipa noticias, crisis ni cambios de reglas.");

  const note = await dailyNote(symbol);

  return res.status(200).json({
    source: "Interpretado por PerData Engine v4",
    model: note ? "perdata-v4+ai-note" : "perdata-plain-1",
    // The one confidence figure we can stand behind: measured P10-P90 coverage in the backtest
    calibratedConfidence: 0.8,
    confidencePercentage: "80 % (cobertura medida del rango P10–P90)",
    regime: expectedReturnPct === null ? "Sin proyección" : `Proyección ${direction}`,
    macroSensitivity,
    executiveTakeaway: parts.join(" "),
    aiNote: note ? note.text : null,
    riskFactors: [
      "El modelo aprende del pasado: no anticipa noticias, elecciones ni cambios regulatorios.",
      `A ${plazo} la incertidumbre es la del rango P10–P90; a más plazo, rango más ancho.`,
      "Las acciones con poca negociación pueden tener saltos que el modelo no recoge bien."
    ],
    calibrationMethod: "Backtest de PerData Engine v4: 826 evaluaciones por horizonte, cobertura P10–P90 ≈ 80 %",
    timestamp: new Date().toISOString()
  });
}
