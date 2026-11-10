// PerData daily newsletter (Mon-Sat 06:00 Lima, GitHub Actions).
// 1. Gathers facts: BCRP/EIA daily prices, SMV material facts of the last day, the 1-month
//    USD/PEN projection and news headlines from allowed sources (title + link only).
// 2. NVIDIA NIM writes short plain-Spanish blocks using ONLY those facts; any sentence with a
//    number that is not in the facts is dropped, and if NIM fails the email goes out without it.
// 3. Renders an editorial HTML email and sends it with Resend. Two versions:
//    - Gratis (Mon-Sat 06:00 Lima): dollar for the next business day with its range, the previous
//      close, the 3 best digest stories already redacted (double-checked by news-digest.js), the
//      «Qué podría presionar al dólar» reading for the `manana` horizon from
//      scripts/dolar-lectura.js (lecturaDolar), a one-line transparency note and a brief
//      invitation to the Boletín plan (US$ 1.99/month, 7-day trial with card), without promising
//      anything the paid email does not bring.
//    - Pagado (Boletín y Pro): dollar for tomorrow, week and month, each with its range and its
//      reading (lecturaDolar), copper, gold and oil with variation and date, the SMV facts of the
//      day, ALL the digest stories (the full digest as today), «Tus empresas» (≤15 from the
//      seguimiento table) with price, variation, range, SMV facts, news and the company reading
//      from scripts/empresa-lectura.js (lecturasEmpresas, only the news that companyCard already
//      filtered by real mention), and the transparency note plus the existing unsubscribe /
//      preferences links ({{BAJA}}, {{EMPRESAS}}). Without chosen companies: an invitation to
//      choose them in /cuenta.
//    Fallbacks: if lecturaDolar/lecturasEmpresas fail or take too long (> 90 s total) the email
//    still goes out with the deterministic version or without that section, never crashing the
//    send. The console records which sections used LLM and which were deterministic. The free
//    user never receives paid sections.
// Env: RESEND_API_KEY, BOLETIN_TO (comma list), SUPABASE_URL + SUPABASE_SERVICE_KEY (subscribers),
//      NVIDIA_API_KEY and GEMINI_API_KEY (optional), NIM_MODEL (optional)
// Usage: node scripts/boletin.js [--dry-run] (writes the preview, sends nothing)
// Preview: PREVIEW_PLAN=gratis|boletin (default boletin), PREVIEW_EMPRESAS="ALICORC1" (sample
//          personal section), BOLETIN_PREVIEW_PATH=path/to/preview.html
import fs from "fs";
import path from "path";
import { smvRows } from "../api/_lib/smv.js";
import { mencionaEmpresa } from "./empresa-mencion.js";
import { formatFechaObjetivo, formatSemanaFecha, formatCierreFecha } from "../api/diario.js";
import { lecturaDolar, hechosDolar } from "./dolar-lectura.js";
import { lecturasEmpresas } from "./empresa-lectura.js";

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatSMVFecha(fechaStr) {
  // Convert "2026-11-09 14:36" -> "9 nov, 14:36"
  const dt = new Date(`${String(fechaStr).slice(0, 10)}T${String(fechaStr).slice(11, 16)}:00Z`);
  if (isNaN(dt.getTime())) return String(fechaStr);
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  const hour = String(dt.getUTCHours()).padStart(2, "0");
  const min = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hour}:${min}`;
}

const DRY = process.argv.includes("--dry-run");
const PREVIEW = Boolean(process.env.PREVIEW_EMPRESAS);
const PREVIEW_PLAN = (process.env.PREVIEW_PLAN || "boletin").toLowerCase() === "gratis" ? "gratis" : "boletin";

const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
const MONO_F = "IBM Plex Mono,Menlo,Consolas,monospace";
const UI_F = "Libre Franklin,Helvetica,Arial,sans-serif";
const NUM = ' style="font-variant-numeric:tabular-nums"';

// Table-based range bar (works in Gmail, Outlook, Yahoo — no SVG)
function barraRango({ min, max, centro, ultimo, prefijo = "S/", fechaUltimo, decimales = 3 }) {
  // Scale: lo = min(min, ultimo) - 15% of range, hi = max(max, ultimo) + 15% of range
  const range = max - min;
  const lo = Math.min(min, ultimo) - range * 0.15;
  const hi = Math.max(max, ultimo) + range * 0.15;
  const total = hi - lo;

  // Track: three cells with integer percentages summing to 100
  // Band goes from min to max, so leftPct uses min, rightPct uses max
  const leftPct = Math.round(((min - lo) / total) * 100);
  const rightPct = Math.round(((hi - max) / total) * 100);
  const midPct = 100 - leftPct - rightPct;

  // Last close position as percentage
  const ultimoPct = Math.round(((ultimo - lo) / total) * 100);

  // Use same formatter as "Rango:" line for consistency
  const fmt = (v) => `${prefijo} ${Number(v).toLocaleString("es-PE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

  // Band color: soft green #cfdccb, track #e4dfd6
  const bandColor = "#cfdccb";
  const trackColor = "#e4dfd6";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${MONO_F};font-size:12px;color:${C.ink};font-variant-numeric:tabular-nums">
<tr>
  <td colspan="3" style="padding:0 0 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="${leftPct}%" style="font-size:0;line-height:0">&nbsp;</td>
        <td width="${midPct}%" style="font-size:0;line-height:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:left;font-size:11px;white-space:nowrap">${esc(fmt(min))}</td>
              <td style="text-align:right;font-size:11px;white-space:nowrap">${esc(fmt(max))}</td>
            </tr>
          </table>
        </td>
        <td width="${rightPct}%" style="font-size:0;line-height:0">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td colspan="3" style="padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:8px;background:${trackColor}">
      <tr>
        <td width="${leftPct}%" style="background:${trackColor};height:8px;font-size:0;line-height:0">&nbsp;</td>
        <td width="${midPct}%" style="background:${bandColor};height:8px;font-size:0;line-height:0">&nbsp;</td>
        <td width="${rightPct}%" style="background:${trackColor};height:8px;font-size:0;line-height:0">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td colspan="3" style="padding:4px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:8px">
      <tr>
        <td width="${ultimoPct}%" style="background:${C.paper};height:8px;font-size:0;line-height:0">&nbsp;</td>
        <td width="3" style="background:${C.ink};height:8px;font-size:0;line-height:0">&nbsp;</td>
        <td style="background:${C.paper};height:8px;font-size:0;line-height:0">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td colspan="3" style="font-family:${UI_F};font-size:12px;color:${C.soft};padding-top:2px">último cierre ${esc(fmt(ultimo))} (${esc(fechaUltimo)})</td>
</tr>
</table>`;
}

const SITE = "https://perdata.site";
const RAW = "https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data";
const FROM = process.env.BOLETIN_FROM || "PerData <boletin@perdata.site>";
const NIM_PREFERRED = (process.env.NIM_MODEL ? [process.env.NIM_MODEL] : []).concat([
  "nvidia/nemotron-3-ultra-550b-a55b", "minimaxai/minimax-m3.1-flash", "openai/gpt-oss-20b", "meta/muse-glimmer-30b", "z-ai/glm-5.3",
  "mistralai/mistral-large-2-instruct", "nvidia/nemotron-3-super-120b-a12b",
]);

async function availableModels(key) {
  try {
    const r = await fetch("https://integrate.api.nvidia.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const ids = new Set(((await r.json()).data || []).map((m) => m.id));
    return NIM_PREFERRED.filter((m) => ids.has(m));
  } catch (e) {
    return NIM_PREFERRED;
  }
}
const SOURCES = ["Agencia Andina", "Andina", "Gestión", "El Comercio", "RPP", "La República", "Infobae",
  "Semana Económica", "Bloomberg Línea", "Energiminas", "Rumbo Minero", "Mining.com", "Reuters", "BCRP", "SMV", "MEF", "INEI"];

const getJson = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "PerDataBot/1.0 (+https://perdata.site)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (v, d = 2) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (a, b) => ((a / b - 1) * 100);
const KEEP = new Set(["BBVA", "AFP", "BVL", "FTE", "IDE", "SEAL", "AIB", "XP", "OH!"]);
const SMALL = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
const prettyName = (raw) => String(raw || "").trim().split(/\s+/).map((w, i) => {
  if (KEEP.has(w.toUpperCase()) || /^\(?([A-Za-z]\.){2,}[-)]*$/.test(w)) return w.toUpperCase();
  const lw = w.toLowerCase();
  return i > 0 && SMALL.has(lw) ? lw : lw.replace(/(^|[-(«"])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}).join(" ");
const sentence = (t) => { const x = String(t || "").trim(); return x && x === x.toUpperCase() ? x.charAt(0) + x.slice(1).toLowerCase() : x; };
const flagHtml = (C) => `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-left:8px;border:1px solid ${C.ink}"><tr><td width="5" height="12" style="background:${C.peru}"></td><td width="5" style="background:#ffffff"></td><td width="5" style="background:${C.peru}"></td></tr></table>`;

// ---------------------------------------------------------------------------
// Local snapshots of the public data (data/). The preview must agree with
// data/ even when the network or the production API is unavailable, so the
// main facts, the company state and the daily ranges are read from the repo
// first and the API endpoints are only a fallback.
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const readLocal = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch (e) { return fallback; }
};
// Same rule as the digest: only stories with an approved second-model review are
// «best written». A story without a note, or rejected, is never shown in the email.
export const historiaPublicable = (h) => Boolean(h?.nota && h?.revision?.ok !== false);
const filtrarHistorias = (list, n) => (Array.isArray(list) ? list : [])
  .filter((h) => h && h.titulo && historiaPublicable(h))
  .slice(0, n);

async function facts() {
  const bcrp = readLocal("data/official/bcrp-daily.json", null) || await getJson(`${RAW}/official/bcrp-daily.json`).catch(() => ({ series: {} }));
  const ctx = readLocal("data/official/bcrp-contexto.json", null) || await getJson(`${RAW}/official/bcrp-contexto.json`).catch(() => ({ series: {} }));
  const eia = await getJson(`${RAW}/official/eia-oil.json`).catch(() => readLocal("data/official/eia-oil.json", null));
  const smv = readLocal("data/smv-hechos.json", null) || await getJson(`${RAW}/smv-hechos.json`).catch(() => ({ hechos: {} }));
  const news = await getJson(`${SITE}/api/news`).catch(() => readLocal("data/news-cache.json", { news: [] }));
  const fx = await getJson(`${SITE}/api/forecast?symbol=PEN%3DX&horizon=1`).catch(() => null);
  const empresas = readLocal("data/empresas.json", null) || await getJson(`${RAW}/empresas.json`).catch(() => ({ emisores: [] }));
  const digest = readLocal("data/noticias-resumen.json", null) || await getJson(`${RAW}/noticias-resumen.json`).catch(() => null);
  const dailyRaw = readLocal("data/daily-forecasts.json", null) || await getJson(`${RAW}/daily-forecasts.json`).catch(() => null);
  const nameOf = {};
  for (const e of empresas.emisores || []) for (const v of e.valores) nameOf[v.nemonico] = e.razonSocial;

  const markets = [];
  const add = (name, unit, points, dec = 2) => {
    if (!points || points.length < 2) return;
    const [d1, v1] = points[points.length - 1];
    const [, v0] = points[points.length - 2];
    markets.push({ name, unit, date: d1, value: v1, change: pct(v1, v0), dec });
  };
  const s = bcrp.series || {};
  add("Dólar (USD/PEN)", "S/", s.PEN?.serie, 3);
  add("Cobre", "US$/lb", s.COBRE?.serie);
  add("Oro", "US$/oz", s.ORO?.serie, 0);
  add("Plata", "US$/oz", s.PLATA?.serie);
  add("Zinc", "US$/lb", s.ZINC?.serie);
  add("Petróleo WTI", "US$/barril", s.WTI?.serie);
  if (eia) add("Petróleo Brent", "US$/barril", eia.series.BRENT);

  const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const smvFacts = [];
  for (const [nemo, list] of Object.entries(smv.hechos || {})) {
    for (const h of list) if (h.fecha >= since) smvFacts.push({ nemo, empresa: prettyName(nameOf[nemo] || nemo), ...h, titulo: sentence(h.titulo), tipo: sentence(h.tipo) });
  }
  smvFacts.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const seenFacts = new Set();
  const uniqueFacts = smvFacts.filter((h) => {
    const k = `${h.empresa} ${String(h.fecha).slice(0, 10)} ${String(h.titulo).toLowerCase()}`;
    return seenFacts.has(k) ? false : seenFacts.add(k);
  });

  const headlines = (news.news || [])
    .filter((n) => SOURCES.some((src) => (n.source || "").toLowerCase().includes(src.toLowerCase())))
    .slice(0, 8)
    .map((n) => ({ title: n.title, source: n.source, url: n.url, tema: n.impact }));

  // Month range: the public /api/forecast endpoint is the single source used by the modules'
  // demos; when the network fails the month horizon already comes with a deterministic reading.
  const forecast = fx && fx.quantiles ? {
    horizon: fx.horizonDate, p50: fx.predictedPrice, p10: fx.quantiles.p10 ?? fx.quantiles.P10,
    p90: fx.quantiles.p90 ?? fx.quantiles.P90, probRise: fx.probabilityOfRise, model: fx.architecture?.split(" (")[0],
  } : null;

  const dailyData = dailyRaw;
  const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const penDaily = dailyData?.simbolos?.PEN;
  const dailyVigente = Boolean(penDaily?.manana?.fecha_objetivo && penDaily.manana.fecha_objetivo >= todayLima);
  const penSerie = s.PEN?.serie || [];
  const penUltimo = penSerie.length ? { fecha: penSerie[penSerie.length - 1][0], valor: penSerie[penSerie.length - 1][1] } : null;
  const cierre = penDaily?.ultimo_cierre != null
    ? { valor: penDaily.ultimo_cierre, fecha: penDaily.fecha_ultimo_cierre, fuente: "BCRP" }
    : (penUltimo ? { ...penUltimo, fuente: "BCRP" } : null);

  const fresh = digest && Date.now() - Date.parse(digest.actualizado) < 30 * 36e5;
  // Paid: every publishable story of the digest (as today, with the double
  // control already done by news-digest.js). Free: the best written 3.
  const historiasTodas = fresh ? filtrarHistorias(digest.historias) : [];
  const historiasTop3 = historiasTodas.slice(0, 3);
  const stories = historiasTodas.slice(0, 5);
  const used = new Set(stories.flatMap((h) => (h.fuentes || []).map((x) => x.url)));
  return { markets, smvFacts: uniqueFacts.slice(0, 8), headlines: headlines.filter((h) => !used.has(h.url)).slice(0, 6), forecast, stories, historiasTodas, historiasTop3, daily: penDaily, dailyVigente, cierre, todayLima, bcrp, ctx };
}

// Headline from the data only: no model, no claims about trends or records
function entradillaDeterminista(f) {
  const partes = [];
  if (f.cierre?.valor != null) partes.push(`El dólar cerró en S/ ${fmt(f.cierre.valor, 3)}`);
  const cobre = (f.markets || []).find((m) => /cobre/i.test(m.name));
  if (cobre) partes.push(`el cobre en US$ ${fmt(cobre.value, 2)} la libra`);
  return partes.length ? `${partes.join(" y ")}.` : "";
}

function grounded(text, factsText) {
  const known = new Set((factsText.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));
  // Claims about records or periods ("mayor nivel del año") are not in the facts we pass: drop them
  const UNSUPPORTED = /\b(mayor|menor|más alto|más bajo|máximo|mínimo|récord|record|histórico|histórica|en lo que va|en el año|del año|desde 20\d\d|nivel más)\b/i;
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    if (UNSUPPORTED.test(sentence)) return false;
    const nums = (sentence.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."));
    return nums.every((n) => known.has(n) || known.has(String(Number(n))) || Number(n) < 32);
  }).join(" ");
}

async function interpret(f) {
  if (!process.env.NVIDIA_API_KEY && !process.env.GEMINI_API_KEY) return null;
  const factsText = JSON.stringify(f);
  const prompt = `Eres el redactor del boletín de PerData, sobre economía y mercados del Perú. Escribe en español neutro, claro, para principiantes y expertos.
Usa SOLO estos datos (no añadas cifras, fechas, causas ni hechos que no estén aquí; no des recomendaciones de inversión):
${factsText}

Reglas:
- La tabla de precios ya va en el correo: no repitas todas las cifras; cita como mucho dos y explica qué significan.
- Si el dólar (USD/PEN) sube, el sol se deprecia; si baja, el sol se aprecia. No digas «el dólar se aprecia frente al sol».
- No atribuyas causas que no estén en los datos. Puedes explicar relaciones generales (por ejemplo, el cobre es la principal exportación del Perú).
- Frases cortas. Sin adjetivos de marketing.

Devuelve SOLO un JSON con:
{"entradilla": "1 o 2 frases: lo más importante de hoy, sin repetir lo que dirá «mercados»",
 "mercados": "2 o 3 frases: qué movimiento importa más hoy y qué significa para el Perú",
 "empresas": "1 frase que destaque el hecho de importancia más relevante para un inversionista (dividendos, resultados, emisiones), o cadena vacía si no hay"}`;
  const deadline = Date.now() + 6 * 60 * 1000;
  for (const model of await availableModels(process.env.NVIDIA_API_KEY)) {
    const left = deadline - Date.now();
    if (left < 30000) break;
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 8000, thinking: { type: "disabled" },
          messages: [{ role: "system", content: "Respondes solo con el JSON pedido, sin análisis previo ni texto adicional." }, { role: "user", content: prompt }],
          chat_template_kwargs: { thinking: false, enable_thinking: false } }),
        signal: AbortSignal.timeout(Math.min(150000, left)),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const msg = (await r.json()).choices?.[0]?.message || {};
      const text = String(msg.content || msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
      const start = text.lastIndexOf("{\"entradilla\"") > -1 ? text.lastIndexOf("{\"entradilla\"") : text.indexOf("{");
      if (start < 0) throw new Error(`respuesta sin JSON: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      const out = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
      for (const k of Object.keys(out)) out[k] = grounded(String(out[k] || ""), factsText);
      out.entradilla = ""; // the headline is built from the data (see entradillaDeterminista)
      console.log(`Interpretación: ${model}`);
      return out;
    } catch (e) {
      console.error(`NIM ${model}: ${e.message}`);
    }
  }
  if (process.env.GEMINI_API_KEY) {
    const key = process.env.GEMINI_API_KEY;
    let names = [];
    try {
      const list = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(15000) })).json();
      names = (list.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name)
        .filter((n) => /flash/i.test(n) && !/image|tts|audio|live|embedding|thinking/i.test(n));
    } catch (e) {}
    const OLD = ["models/gemini-2.5-flash", "models/gemini-2.5-flash-lite", "models/gemini-2.0-flash", "models/gemini-2.0-flash-lite"];
    const rank = (n) => (OLD.includes(n) ? -10 + OLD.indexOf(n) : 0) + (/preview|exp/i.test(n) ? 2 : 0) + (/lite/i.test(n) ? 1 : 0);
    names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    for (const model of names.slice(0, 8)) {
      if (deadline - Date.now() < 15000) break;
      try {
        const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
          signal: AbortSignal.timeout(Math.min(60000, deadline - Date.now())),
        });
        if (!g.ok) throw new Error(`HTTP ${g.status}`);
        const text = (await g.json()).candidates?.[0]?.content?.parts?.map((x) => x.text).join("") || "";
        const out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        for (const k of Object.keys(out)) out[k] = grounded(String(out[k] || ""), factsText);
        console.log(`Interpretación: Gemini ${model}`);
        return out;
      } catch (e) {
        console.error(`Gemini ${model}: ${e.message}`);
      }
    }
  }
  console.error("Interpretación omitida: ningún modelo respondió");
  return null;
}

// ---------------------------------------------------------------------------
// Dollar reading (lecturaDolar). Builds `datos` exactly like
// `node scripts/dolar-lectura.js --demo`: series and contexto from data/ and
// the month range from the public endpoint (facts()). On failure or timeout
// (> 90 s for both modules) the email goes out without the section, never
// crashing the send.
// ---------------------------------------------------------------------------
const serieOk = (serie) => Array.isArray(serie) && serie.length >= 1 && serie.every((p) => Array.isArray(p) && p[0] && Number.isFinite(Number(p[1])));
const varPct = (actual, anterior) => (Number(actual) / Number(anterior) - 1) * 100;
const round2 = (v) => Math.round(Number(v) * 100) / 100;

function armaDatosDolar(f, clasif, newsById) {
  const series = {};
  for (const k of ["PEN", "COBRE", "ORO", "WTI"]) if (f.bcrp?.series?.[k]?.serie) series[k] = { serie: f.bcrp.series[k].serie };
  const contexto = {};
  for (const k of ["INTERVENCION_BCRP", "TASA_REFERENCIA", "RIN"]) if (f.ctx?.series?.[k]?.serie) contexto[k] = { serie: f.ctx.series[k].serie };
  const pen = f.daily || {};
  const rangos = {
    manana: pen.manana ? { p10: pen.manana.p10, p50: pen.manana.p50, p90: pen.manana.p90, fecha: pen.manana.fecha_objetivo } : null,
    semana: pen.semana ? { p10: pen.semana.p10, p50: pen.semana.p50, p90: pen.semana.p90, fecha: pen.semana.fecha_objetivo } : null,
    mes: f.forecast ? { p10: f.forecast.p10, p50: f.forecast.p50, p90: f.forecast.p90, fecha: f.forecast.horizon } : null,
  };
  const since = Date.now() - 36 * 36e5;
  const TEMAS = new Set(["Dólar y BCRP", "Minería y metales", "Economía y fiscal"]);
  const noticias = Object.entries(clasif || {})
    .filter(([, v]) => TEMAS.has(v.tema))
    .map(([id]) => newsById?.[id])
    .filter((n) => n && Date.parse(n.fecha_iso) >= since)
    .sort((a, b) => String(b.fecha_iso).localeCompare(String(a.fecha_iso)))
    .slice(0, 12)
    .map((n) => ({ titulo: n.titulo, fuente: n.fuente, fecha_iso: n.fecha_iso }));
  return { series, contexto, rangos, noticias };
}

async function lecturaDolarSegura(f, clasif, newsById, deadline) {
  try {
    const datos = armaDatosDolar(f, clasif, newsById);
    const hechos = hechosDolar(datos);
    const left = deadline - Date.now();
    if (left <= 5000) return { dolar: null, determinista: true, fuente: "sin tiempo", hechos };
    let out = null;
    try {
      out = await Promise.race([
        lecturaDolar(datos),
        new Promise((_, rej) => { const t = setTimeout(() => rej(new Error("tiempo agotado")), Math.max(5000, left)); t.unref?.(); }),
      ]);
    } catch (e) {
      console.log(`Lectura del dólar no disponible: ${e.message} (se envía sin la sección)`);
      return { dolar: null, determinista: true, fuente: "sin lectura", hechos };
    }
    const todosDet = ["manana", "semana", "mes"].every((h) => out?.horizontes?.[h]?.determinista);
    console.log(`Lectura del dólar: ${todosDet ? "determinista (sin LLM)" : `LLM (${out.modelo || "modelo no registrado"})`}`);
    return { dolar: out, determinista: todosDet, fuente: todosDet ? "determinista" : "llm", hechos };
  } catch (e) {
    console.log(`Lectura del dólar no disponible: ${e.message} (se envía sin la sección)`);
    return { dolar: null, determinista: true, fuente: "sin lectura", hechos: [] };
  }
}

  // Deterministic fallback rendered when lecturaDolar itself is unavailable: the
  // same figures the module computes internally, recomputed from the same input
  // (`datos`) through hechosDolar. Callers render it only when the reading is
  // present; the numbers always match data/.
function lecturaDolarDeterminista(f, clasif, newsById) {
  try {
    const datos = armaDatosDolar(f, clasif, newsById);
    return { datos };
  } catch { return null; }
}

function render(f, ai, dateLabel, lectura) {
  const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
  const serif = "'Source Serif 4',Georgia,'Times New Roman',serif";
  const ui = "'Libre Franklin',Helvetica,Arial,sans-serif";
  const mono = "'IBM Plex Mono',Menlo,Consolas,monospace";
  const edition = Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - Date.UTC(2026, 9, 26)) / 864e5) + 1;
  
  const texto = (t, size = 15, lh = 1.5, clr = C.ink, weight = 400, mgb = 14) => 
    t ? `<p style="margin:0 0 ${mgb}px;font-family:${serif};font-size:${size}px;line-height:${lh};color:${clr};font-weight:${weight}">${esc(t)}</p>` : "";
  
  const tituloSeccion = (title, numero) => 
    `<tr><td style="padding:24px 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${ui};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">${numero ? `${numero}. ` : ''}${title}</td></tr></table></td></tr>`;
  
  const regla = () => `<tr><td style="padding:0"><hr style="border:none;border-top:1px solid ${C.rule};margin:0"/></td></tr>`;

  // Dollar range bar (replaces SVG line chart)
  const rangoManana = f.daily?.manana;
  const etiquetaManana = rangoManana ? formatFechaObjetivo(rangoManana.fecha_objetivo, f.todayLima) : "";
  const dollarBarHtml = rangoManana && f.cierre?.valor != null ? `<tr><td style="padding:16px 0 8px">${barraRango({ min: rangoManana.p10, max: rangoManana.p90, centro: rangoManana.p50, ultimo: f.cierre.valor, prefijo: "S/", fechaUltimo: formatCierreFecha(f.cierre.fecha), decimales: 3 })}</td></tr>` : "";

  // Dollar headline with close - fix subtitle: "Rango Mañana" -> "rango para mañana"
  const cierre = f.cierre;
  const dollarHeadline = cierre ? `<tr><td style="padding:16px 0 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${serif};font-size:24px;font-weight:600;color:${C.ink}">Dólar interbancario (USD/PEN)</td>
      <td align="right" style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;color:${C.ink};white-space:nowrap">S/ ${fmt(cierre.valor, 3)}</td>
    </tr></table>
    <p style="margin:4px 0 0;font-family:${ui};font-size:13px;color:${C.soft}">Último cierre oficial (BCRP) · cierre del ${esc(formatCierreFecha(cierre.fecha))}${rangoManana ? ` · rango para ${esc(etiquetaManana.toLowerCase())}` : ''}</p>
  </td></tr>` : "";

  // Dollar reading for mañana/horizonte
  const punto = (p) => `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink};margin:0 0 8px;padding-left:12px;border-left:2px solid ${p.tipo === 'al_alza' ? C.pos : p.tipo === 'a_la_baja' ? C.neg : C.soft};opacity:${p.tipo === 'contexto' ? '0.7' : '1'}">${esc(p.texto)}</div>`;
  
  const vistos = new Set();
  const nuevos = (h, lado) => (h?.[lado] || []).filter((p) => !vistos.has(p.texto) && vistos.add(p.texto));
  
  const labelAlAlza = (puntos) => puntos.length ? `<div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin:12px 0 4px">Podría presionar al dólar al alza</div>` : "";
  const labelALaBaja = (puntos) => puntos.length ? `<div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin:12px 0 4px">Podría presionar al dólar a la baja</div>` : "";
  
  const tituloInline = (title, numero) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${ui};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">${numero ? `${numero}. ` : ''}${title}</td></tr></table>`;

  const lecturaHorizonte = (h, titulo, rango, numero, conContexto = true) => {
    if (!h) return "";
    const rangoTxt = rango ? `<div style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:14px;color:${C.ink};margin:4px 0 8px">Rango: S/ ${fmt(rango.p10, 3)} – S/ ${fmt(rango.p90, 3)} <span style="color:${C.soft}">(centro S/ ${fmt(rango.p50, 3)}, 8 de cada 10 veces)</span></div>` : "";
    const resumenHtml = h.resumen && !h.determinista ? `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink};margin:8px 0">${esc(h.resumen)}</div>` : "";
    const alAlzaPoints = nuevos(h, "al_alza").map(p => ({...p, tipo: 'al_alza'}));
    const aLaBajaPoints = nuevos(h, "a_la_baja").map(p => ({...p, tipo: 'a_la_baja'}));
    const alAlza = labelAlAlza(alAlzaPoints) + alAlzaPoints.map(punto).join("");
    const aLaBaja = labelALaBaja(aLaBajaPoints) + aLaBajaPoints.map(punto).join("");
    const contexto = conContexto ? nuevos(h, "contexto").map(p => ({...p, tipo: 'contexto'})).map(punto).join("") : "";
    return `<tr><td style="padding:16px 0 8px">
      <div style="margin:0 0 8px">${tituloInline(titulo, numero)}</div>
      ${rangoTxt}${resumenHtml}${alAlza}${aLaBaja}${contexto}
    </td></tr>`;
  };
  
  const lect = lectura?.horizontes || {};
  const dolarRows = [];
  let horizonteNum = 1;
  if (f.dailyVigente && f.daily) {
    if (f.daily.manana) dolarRows.push({ key: "manana", titulo: formatFechaObjetivo(f.daily.manana.fecha_objetivo, f.todayLima), rango: f.daily.manana, num: horizonteNum++ });
    if (f.daily.semana) dolarRows.push({ key: "semana", titulo: `Próxima semana, ${formatSemanaFecha(f.daily.semana.fecha_objetivo)}`, rango: f.daily.semana, num: horizonteNum++ });
  }
  if (f.forecast) {
    const mesFecha = f.forecast.horizon;
    const mesDt = new Date(`${mesFecha}T12:00:00Z`);
    const mesLabel = `${mesDt.getUTCDate()} ${MONTHS_ES[mesDt.getUTCMonth()].slice(0, 3)}`;
    dolarRows.push({ key: "mes", titulo: `Próximo mes, ${mesLabel}`, rango: f.forecast, num: horizonteNum++ });
  }
  
  const fc = dolarRows.length ? 
    dolarRows.map(r => lecturaHorizonte(lect[r.key], r.titulo, r.rango, r.num, r.num === 1)).join(regla()) 
    : "";

  // Markets (copper, gold, oil) — clean two-column rows, no SVG
  const metales = f.markets.filter((m) => ["Cobre", "Oro", "Petróleo WTI", "Petróleo Brent"].includes(m.name));
  const shortDate = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
  const fmtPct = (v) => {
    const s = v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
    return `${s} %`;
  };

  const mercadoCards = metales.map((m) => {
    const up = m.change >= 0;
    const pctColor = up ? C.pos : C.neg;
    const pctStr = fmtPct(m.change);
    return `<tr><td style="padding:12px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;padding-right:16px;width:1px;white-space:nowrap">
          <div style="font-family:${ui};font-size:14px;font-weight:600;color:${C.ink};margin-bottom:2px">${esc(m.name)}</div>
          <div style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:13px;color:${C.soft}">${esc(m.unit)}</div>
        </td>
        <td style="vertical-align:top;text-align:right">
          <div style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:20px;color:${C.ink};white-space:nowrap">${fmt(m.value, m.dec)}</div>
          <div style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:13px;color:${pctColor};margin-top:2px">${pctStr} · ${esc(shortDate(m.date))}</div>
        </td>
      </tr></table>
    </td></tr>`;
  }).join(regla());

  // SMV facts
  const smv = f.smvFacts.map((h) => `<tr><td style="padding:16px 0">
    <div style="font-family:${ui};font-size:13px;font-weight:600;color:${C.ink};margin-bottom:4px">${esc(h.empresa)}</div>
    <a href="${esc(h.url_oficial)}" style="font-family:${serif};font-size:15px;line-height:1.45;color:${C.ink};text-decoration:underline;text-decoration-color:${C.rule}">${esc(h.titulo || h.tipo)}</a>
    <div style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:11px;color:${C.soft};margin-top:4px">${esc(formatSMVFecha(h.fecha))}</div>
  </td></tr>`).join(regla());

  // Headlines
  const news = f.headlines.map((n) => `<tr><td style="padding:16px 0">
    <a href="${esc(n.url)}" style="font-family:${serif};font-size:15px;line-height:1.45;color:${C.ink};text-decoration:underline;text-decoration-color:${C.rule}">${esc(n.title)}</a>
    <div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:4px">${esc(n.source)}</div>
  </td></tr>`).join(regla());

  // All stories (paid)
  const historiaHtml = (h) => `<tr><td style="padding:20px 0">
    <div style="font-family:${ui};font-size:11px;color:${C.soft};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${esc(h.tema)}</div>
    <div style="font-family:${serif};font-size:18px;font-weight:600;line-height:1.3;color:${C.ink};margin-bottom:8px">${esc(h.titulo)}</div>
    ${h.nota ? `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink}">${esc(h.nota)}</div>` : ""}
    <div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:8px">${(h.fuentes || []).filter((x, i, a) => a.findIndex((y) => y.fuente === x.fuente) === i).map((x) => `<a href="${esc(x.url)}" style="color:${C.soft}">${esc(x.fuente)}</a>`).join(" · ")}</div>
  </td></tr>`;

  const preheader = esc(entradillaDeterminista(f) || `Dólar, cobre, oro y petróleo; hechos de importancia de la SMV y titulares del ${dateLabel}.`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>Boletín PerData</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:28px 0 12px;border-bottom:4px double ${C.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${serif};font-size:32px;font-style:italic;font-weight:600;color:${C.ink};white-space:nowrap">PerData${flagHtml(C)}</td>
      <td align="right" style="font-family:${ui};font-size:12px;line-height:1.5;color:${C.soft}">Boletín diario<br>Edición ${edition > 0 ? edition : 1}</td>
    </tr></table>
    <div style="font-family:${ui};font-size:13px;color:${C.soft};margin-top:6px">${esc(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1))} · Lima</div>
  </td></tr>
  
  ${dollarHeadline}
  ${dollarBarHtml}
  ${fc}
  {{PERSONAL}}
  
  ${f.historiasTodas?.length ? tituloSeccion("Lo importante de hoy", 0) + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${f.historiasTodas.map(historiaHtml).join(regla())}</table><div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:16px">Notas de PerData redactadas con IA a partir de los titulares de varias fuentes; cada enlace lleva al medio original.</div></td></tr>` : ""}
  
  ${tituloSeccion("Mercados", 0)}
  ${ai?.mercados ? `<tr><td style="padding:12px 0 16px">${texto(ai.mercados, 15, 1.5, C.ink, 400, 0)}</td></tr>` : ""}
  ${metales.length ? `<tr><td style="padding:8px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${mercadoCards}</table></td></tr>` : ""}
  <tr><td style="padding:12px 0 0"><div style="font-family:${ui};font-size:11px;color:${C.soft}">Fuente: BCRP${f.markets.some((m) => m.name.includes("Brent")) ? " y EIA" : ""}. Variación frente al dato anterior.</div></td></tr>
  
  ${f.smvFacts.length ? tituloSeccion("Hechos de importancia", 0) + (ai?.empresas ? `<tr><td style="padding:12px 0 16px">${texto(ai.empresas, 15, 1.5, C.ink, 400, 0)}</td></tr>` : "") + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${smv}</table><div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:12px">Fuente: Superintendencia del Mercado de Valores (SMV).</div></td></tr>` : ""}
  
  ${f.headlines.length ? tituloSeccion("Titulares", 0) + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${news}</table></td></tr>` : ""}
  
  <tr><td align="center" style="padding:32px 0 8px">
    <a href="${SITE}/explorer" style="display:inline-block;background:${C.ink};color:${C.paper};font-family:${ui};font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:4px">Abrir la terminal</a>
  </td></tr>

  <tr><td style="padding:16px 0 8px;font-family:${ui};font-size:13px;color:${C.soft};text-align:center">
    ¿Te sirvió? Reenvía este correo. Quien lo reciba puede suscribirse gratis en <a href="${SITE}/boletin?utm_source=correo&amp;utm_medium=reenvio" style="color:${C.ink};text-decoration:underline">perdata.site/boletin</a>
  </td></tr>
  
  <tr><td style="padding:24px 0 36px;border-top:1px solid ${C.rule};font-family:${ui};font-size:12px;line-height:1.6;color:${C.soft}">
    El rango es estadístico; los factores son contexto, no una predicción de dirección.<br>
    ${ai ? "La interpretación la redacta un modelo de IA a partir de los datos de este correo; las cifras se comprueban contra la fuente.<br>" : ""}
    Información con fines informativos; no es una recomendación de inversión.<br>
    <a href="${SITE}" style="color:${C.ink}">perdata.site</a> · Equipo de PerData<br>
    Recibes este correo porque te suscribiste al boletín. <a href="{{EMPRESAS}}" style="color:${C.soft}">Elegir mis empresas</a> · <a href="{{BAJA}}" style="color:${C.soft}">Darme de baja</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function renderGratis(f, dateLabel, lectura) {
  const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
  const serif = "'Source Serif 4',Georgia,'Times New Roman',serif";
  const ui = "'Libre Franklin',Helvetica,Arial,sans-serif";
  const mono = "'IBM Plex Mono',Menlo,Consolas,monospace";
  const edition = Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - Date.UTC(2026, 9, 26)) / 864e5) + 1;
  
  const texto = (t, size = 15, lh = 1.5, clr = C.ink, weight = 400, mgb = 14) => 
    t ? `<p style="margin:0 0 ${mgb}px;font-family:${serif};font-size:${size}px;line-height:${lh};color:${clr};font-weight:${weight}">${esc(t)}</p>` : "";
  
  const tituloSeccion = (title, numero) => 
    `<tr><td style="padding:24px 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${ui};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">${numero ? `${numero}. ` : ''}${title}</td></tr></table></td></tr>`;
  
  const regla = () => `<tr><td style="padding:0"><hr style="border:none;border-top:1px solid ${C.rule};margin:0"/></td></tr>`;

  // Dollar range bar (replaces SVG line chart)
  const rangoManana = f.daily?.manana;
  const etiquetaManana = rangoManana ? formatFechaObjetivo(rangoManana.fecha_objetivo, f.todayLima) : "";
  const dollarBarHtml = rangoManana && f.cierre?.valor != null ? `<tr><td style="padding:16px 0 8px">${barraRango({ min: rangoManana.p10, max: rangoManana.p90, centro: rangoManana.p50, ultimo: f.cierre.valor, prefijo: "S/", fechaUltimo: formatCierreFecha(f.cierre.fecha), decimales: 3 })}</td></tr>` : "";

  // Dollar headline with close - fix subtitle: "Rango Mañana" -> "rango para mañana"
  const cierre = f.cierre;
  const dollarHeadline = cierre ? `<tr><td style="padding:16px 0 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${serif};font-size:24px;font-weight:600;color:${C.ink}">Dólar interbancario (USD/PEN)</td>
      <td align="right" style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;color:${C.ink};white-space:nowrap">S/ ${fmt(cierre.valor, 3)}</td>
    </tr></table>
    <p style="margin:4px 0 0;font-family:${ui};font-size:13px;color:${C.soft}">Último cierre oficial (BCRP) · cierre del ${esc(formatCierreFecha(cierre.fecha))}${rangoManana ? ` · rango para ${esc(etiquetaManana.toLowerCase())}` : ''}</p>
  </td></tr>` : "";

  // Dollar reading for mañana/horizonte (only mañana for free)
  const punto = (p) => `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink};margin:0 0 8px;padding-left:12px;border-left:2px solid ${p.tipo === 'al_alza' ? C.pos : p.tipo === 'a_la_baja' ? C.neg : C.soft};opacity:${p.tipo === 'contexto' ? '0.7' : '1'}">${esc(p.texto)}</div>`;
  
  const vistos = new Set();
  const nuevos = (h, lado) => (h?.[lado] || []).filter((p) => !vistos.has(p.texto) && vistos.add(p.texto));
  
  const labelAlAlza = (puntos) => puntos.length ? `<div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin:12px 0 4px">Podría presionar al dólar al alza</div>` : "";
  const labelALaBaja = (puntos) => puntos.length ? `<div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin:12px 0 4px">Podría presionar al dólar a la baja</div>` : "";
  const labelContexto = (puntos) => puntos.length ? `<div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin:12px 0 4px">Contexto</div>` : "";
  
  const mananaLec = lectura?.horizontes?.manana || lectura?.manana || null;
  const rangoMananaLec = f.daily?.manana;
  const rangoTxt = rangoMananaLec ? `<div style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:14px;color:${C.ink};margin:4px 0 8px">Rango: S/ ${fmt(rangoMananaLec.p10, 3)} – S/ ${fmt(rangoMananaLec.p90, 3)} <span style="color:${C.soft}">(centro S/ ${fmt(rangoMananaLec.p50, 3)}, 8 de cada 10 veces)</span></div>` : "";
  const tituloInline = (title, numero) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${ui};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">${numero ? `${numero}. ` : ''}${title}</td></tr></table>`;

  const alAlzaPoints = nuevos(mananaLec, "al_alza").map(p => ({...p, tipo: 'al_alza'}));
  const aLaBajaPoints = nuevos(mananaLec, "a_la_baja").map(p => ({...p, tipo: 'a_la_baja'}));
  const contextoPoints = nuevos(mananaLec, "contexto").map(p => ({...p, tipo: 'contexto'}));
  
  const presionaHtml = mananaLec ? `<tr><td style="padding:16px 0 8px">
      <div style="margin:0 0 8px">${tituloInline("Qué podría presionar al dólar", 0)}</div>
      ${rangoTxt}
      ${mananaLec.resumen && !mananaLec.determinista ? `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink};margin:8px 0">${esc(mananaLec.resumen)}</div>` : ""}
      ${labelAlAlza(alAlzaPoints)}${alAlzaPoints.map(punto).join("")}
      ${labelALaBaja(aLaBajaPoints)}${aLaBajaPoints.map(punto).join("")}
      ${labelContexto(contextoPoints)}${contextoPoints.map(punto).join("")}
    </td></tr>` : "";

  // Top 3 stories
  const historiaHtml = (h) => `<tr><td style="padding:20px 0">
    <div style="font-family:${ui};font-size:11px;color:${C.soft};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${esc(h.tema)}</div>
    <div style="font-family:${serif};font-size:18px;font-weight:600;line-height:1.3;color:${C.ink};margin-bottom:8px">${esc(h.titulo)}</div>
    ${h.nota ? `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink}">${esc(h.nota)}</div>` : ""}
    <div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:8px">${(h.fuentes || []).filter((x, i, a) => a.findIndex((y) => y.fuente === x.fuente) === i).map((x) => `<a href="${esc(x.url)}" style="color:${C.soft}">${esc(x.fuente)}</a>`).join(" · ")}</div>
  </td></tr>`;

  // Plan Boletín invitation - 3 bullets
  const plan = `<!-- plan-boletin -->
  <tr><td style="padding:24px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-top:1px solid ${C.rule};border-bottom:1px solid ${C.rule}"><tr><td style="padding:20px 4px">
      <div style="font-family:${ui};font-size:14px;line-height:1.55;color:${C.ink};margin-bottom:12px">Con el plan Boletín (US$&nbsp;1.99 al mes, 7 días de prueba con tarjeta) recibes:</div>
      <ul style="margin:0;padding-left:20px;font-family:${serif};font-size:15px;line-height:1.6;color:${C.ink}">
        <li style="margin-bottom:8px">Dólar a una semana y a un mes, cada uno con su rango y lectura</li>
        <li style="margin-bottom:8px">Cobre, oro y petróleo con variación y gráficos</li>
        <li>Tus empresas (hasta 15) con precio, proyección, hechos y noticias</li>
      </ul>
      <div style="margin-top:16px"><a href="${SITE}/precios" style="display:inline-block;background:${C.ink};color:${C.paper};font-family:${ui};font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:4px">Ver los planes</a></div>
    </td></tr></table>
  </td></tr>
  <!-- /plan-boletin -->`;

  const preheader = esc(`Cierre oficial del dólar y rango probable (${etiquetaManana ? etiquetaManana.charAt(0).toLowerCase() + etiquetaManana.slice(1) : "del próximo día hábil"}).`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>Boletín PerData</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:28px 0 12px;border-bottom:4px double ${C.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${serif};font-size:32px;font-style:italic;font-weight:600;color:${C.ink};white-space:nowrap">PerData${flagHtml(C)}</td>
      <td align="right" style="font-family:${ui};font-size:12px;line-height:1.5;color:${C.soft}">Boletín diario<br>Edición ${edition > 0 ? edition : 1}</td>
    </tr></table>
    <div style="font-family:${ui};font-size:13px;color:${C.soft};margin-top:6px">${esc(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1))} · Lima</div>
  </td></tr>
  
  ${dollarHeadline}
  ${dollarBarHtml}
  ${presionaHtml}
  {{PERSONAL}}
  
  ${f.historiasTop3?.length ? tituloSeccion("Lo importante de hoy", 0) + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${f.historiasTop3.map(historiaHtml).join(regla())}</table><div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:16px">Notas de PerData redactadas con IA a partir de los titulares de varias fuentes; cada enlace lleva al medio original.</div></td></tr>` : ""}
  
  ${plan}
  
  <tr><td style="padding:16px 0 8px;font-family:${ui};font-size:13px;color:${C.soft};text-align:center">
    ¿Te sirvió? Reenvía este correo. Quien lo reciba puede suscribirse gratis en <a href="${SITE}/boletin?utm_source=correo&amp;utm_medium=reenvio" style="color:${C.ink};text-decoration:underline">perdata.site/boletin</a>
  </td></tr>
  
  <tr><td style="padding:24px 0 36px;border-top:1px solid ${C.rule};font-family:${ui};font-size:12px;line-height:1.6;color:${C.soft}">
    El rango es estadístico; los factores son contexto, no una predicción de dirección.<br>
    Información con fines informativos; no es una recomendación de inversión.<br>
    <a href="${SITE}" style="color:${C.ink}">perdata.site</a> · Equipo de PerData<br>
    Recibes este correo porque te suscribiste al boletín. <a href="{{EMPRESAS}}" style="color:${C.soft}">Elegir mis empresas</a> · <a href="{{BAJA}}" style="color:${C.soft}">Darme de baja</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---- Personal section: the companies each subscriber follows ----
const empresasLocal = readLocal("data/empresas.json", { emisores: [] });
const estadoLocal = readLocal("data/empresas-estado.json", { emisores: {} });
// Live issuers are loaded at module level like before (one fetch, reused by
// every subscriber); when the network is down the repo copy above keeps the
// preview working with the same figures.
let issuers = empresasLocal.emisores || [];
try { const live = (await getJson(`${RAW}/empresas.json`).catch(() => null))?.emisores; if (live?.length) issuers = live; } catch {}
const issuerOf = (nemo) => issuers.find((e) => e.valores.some((v) => v.nemonico === nemo));

async function companyCard(nemo, smvAll, clasif, newsById) {
  const e = issuerOf(nemo);
  if (!e) return null;
  const nemos = e.valores.map((v) => v.nemonico);
  // Only the requested security's own projection symbol counts. The old
  // fallback (`|| e.valores.find(...)`) borrowed BUENAVI1.LM for BVN and
  // priced the US$ foreign share in soles with the Lima share's figure.
  const simbolo_proyeccion = e.valores.find((v) => v.nemonico === nemo && v.simbolo_proyeccion)?.simbolo_proyeccion || null;
  const v = e.valores.find((x) => x.nemonico === nemo) || e.valores[0];
  const st = (Object.values(estadoLocal.emisores || {}).find((x) => x.nemonico === nemo)) || {};
  // `lima` is true only when THE requested security itself is the Lima one.
  // BVN (US$, foreign segment) shares an issuer with BUENAVI1 (S/, .LM):
  // the old rule (`some` value is .LM) leaked BUENAVI1.LM's price into BVN,
  // a currency it never had in data/. The brief asks for BVN's own price.
  const lima = Boolean(v && /\.LM$/i.test(v.simbolo_proyeccion || ""));
  const card = {
    nemo, name: prettyName(e.razonSocial), sector: e.sector || null, simbolo_proyeccion,
    price: null, change: null, currency: st.moneda || v?.moneda || "S/", forecast: null,
    smv: [], news: [], sentiment: null,
  };
  // Lima prices: data/empresas-estado.json (the table /empresas and the module
  // demos read) with the SMV table as the live fallback. The figure shown is
  // the one in data/, so the preview agrees with the site without keys.
  if (numOk(st.ultimo_cierre)) {
    card.price = Number(st.ultimo_cierre);
    card.priceDate = st.ultima_fecha;
    card.priceSource = "empresas-estado";
  }
  if (lima) {
    try {
      const rows = await smvRows(nemo, "2000-01-01", { limit: 2 });
      if (rows.length) {
        card.price = Number(rows[0].cierre);
        card.currency = "S/";
        card.priceDate = rows[0].fecha;
        card.priceSource = "smv";
        if (rows[1] && Number(rows[1].cierre) !== 0) card.change = pct(Number(rows[0].cierre), Number(rows[1].cierre));
      }
    } catch (e2) {
      console.error(`SMV ${nemo}: ${e2.message}`);
    }
  } else if (simbolo_proyeccion) {
    const h = await getJson(`${SITE}/api/historical?symbol=${encodeURIComponent(simbolo_proyeccion)}&range=1y`).catch(() => null);
    if (h?.live?.price) { card.price = h.live.price; card.change = h.live.changePct ?? null; card.priceDate = h.live.time; }
    else if (h?.series?.length) { card.price = h.series[h.series.length - 1].close; card.priceDate = h.series[h.series.length - 1].date; }
    card.currency = h?.currency === "USD" ? "US$" : "S/";
    const fc = await getJson(`${SITE}/api/forecast?symbol=${encodeURIComponent(simbolo_proyeccion)}&horizon=1`).catch(() => null);
    if (fc?.quantiles) card.forecast = { p50: fc.predictedPrice, p10: fc.quantiles.p10 ?? fc.quantiles.P10, p90: fc.quantiles.p90 ?? fc.quantiles.P90, date: fc.horizonDate, prob: fc.probabilityOfRise };
  }
  // Lima securities get their projection range from the same public endpoint.
  if (card.price == null && st.ultimo_cierre != null) { card.price = Number(st.ultimo_cierre); card.priceDate = st.ultima_fecha; }
  if (lima && simbolo_proyeccion && !card.forecast) {
    const fc = await getJson(`${SITE}/api/forecast?symbol=${encodeURIComponent(simbolo_proyeccion)}&horizon=1`).catch(() => null);
    if (fc?.quantiles) card.forecast = { p50: fc.predictedPrice, p10: fc.quantiles.p10 ?? fc.quantiles.P10, p90: fc.quantiles.p90 ?? fc.quantiles.P90, date: fc.horizonDate, prob: fc.probabilityOfRise };
  }
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  for (const n of nemos) for (const h of smvAll[n] || []) if (h.fecha >= since) card.smv.push({ ...h, titulo: sentence(h.titulo) || sentence(h.tipo) });
  const seen = new Set();
  card.smv = card.smv.filter((h) => {
    const k = `${String(h.fecha).slice(0, 10)} ${String(h.titulo).toLowerCase().replace(/\s+/g, " ").trim()}`;
    return seen.has(k) ? false : seen.add(k);
  }).slice(0, 3);
  // Brief: pass ONLY the news companyCard already filtered by real mention
  // (clasificador tag + mencionaEmpresa), never the demo ones.
  for (const [id, c] of Object.entries(clasif)) {
    const story = newsById[id];
    const recent = story?.fecha_iso && Date.parse(story.fecha_iso) >= Date.now() - 7 * 864e5;
    if (recent && (c.empresas || []).some((x) => nemos.includes(x)) && mencionaEmpresa(`${story.titulo} ${story.resumen || ""}`, e)) card.news.push({ ...story, sentimiento: c.sentimiento });
  }
  card.news.sort((a, b) => String(b.fecha_iso).localeCompare(String(a.fecha_iso)));
  card.news = card.news.slice(0, 3);
  if (card.news.length) {
    const counts = { POSITIVO: 0, NEGATIVO: 0, NEUTRO: 0 };
    for (const n of card.news) if (counts[n.sentimiento] != null) counts[n.sentimiento]++;
    const parts = [["POSITIVO", "positiva"], ["NEGATIVO", "negativa"], ["NEUTRO", "neutra"]]
      .filter(([key]) => counts[key]).map(([key, label]) => `${counts[key]} ${label}${counts[key] === 1 ? "" : "s"}`);
    card.sentiment = `Tono de las noticias: ${parts.join(", ")}.`;
  }
  return card;
}
const numOk = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

const shortDay = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/\./g, "");

function macroEmpresa(f) {
  const macroDeSerie = (serie) => {
    if (!serieOk(serie)) return null;
    const [f0, v0] = serie[serie.length - 1];
    const f5 = serie[Math.max(0, serie.length - 6)];
    return { valor: Math.round(Number(v0) * 10000) / 10000, variacion_5: round2(varPct(v0, f5[1])), fecha: String(f0).slice(0, 10) };
  };
  const macro = {};
  for (const [clave, nombre] of [["cobre", "COBRE"], ["oro", "ORO"], ["wti", "WTI"], ["dolar", "PEN"]]) {
    const m = macroDeSerie(f.bcrp?.series?.[nombre]?.serie);
    if (m) macro[clave] = m;
  }
  const tasaSerie = f.ctx?.series?.TASA_REFERENCIA?.serie;
  if (serieOk(tasaSerie)) {
    const [ft, vt] = tasaSerie[tasaSerie.length - 1];
    macro.tasa_referencia = { valor: round2(vt), fecha: String(ft).slice(0, 10) };
  }
  return macro;
}

function renderPersonal(cards, lecturas) {
  const C = { ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", card: "#FBF9F4" };
  const serif = "'Source Serif 4',Georgia,'Times New Roman',serif";
  const ui = "'Libre Franklin',Helvetica,Arial,sans-serif";
  const mono = "'IBM Plex Mono',Menlo,Consolas,monospace";
  
  const texto = (t, size = 15, lh = 1.5, clr = C.ink, weight = 400, mgb = 14) => 
    t ? `<p style="margin:0 0 ${mgb}px;font-family:${serif};font-size:${size}px;line-height:${lh};color:${clr};font-weight:${weight}">${esc(t)}</p>` : "";
  
  const punto = (p) => `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink};margin:0 0 8px;padding-left:12px;border-left:2px solid ${p.tipo === 'al_alza' ? C.pos : p.tipo === 'a_la_baja' ? C.neg : C.soft};opacity:${p.tipo === 'contexto' ? '0.7' : '1'}">${esc(p.texto)}</div>`;
  
  const regla = () => `<tr><td style="padding:0"><hr style="border:none;border-top:1px solid ${C.rule};margin:0"/></td></tr>`;

  const body = cards.map((c) => {
    const ch = c.change == null ? "" : `<span style="color:${c.change >= 0 ? C.pos : C.neg}">${c.change >= 0 ? "▲" : "▼"} ${fmt(Math.abs(c.change))}%</span>`;
    
    // Range bar (table-based, works in Gmail/Outlook/Yahoo)
    const rangeBarHtml = (c.forecast && c.forecast.p10 != null && c.forecast.p50 != null && c.forecast.p90 != null && c.price != null)
      ? `<div style="margin:8px 0 0">${barraRango({ min: c.forecast.p10, max: c.forecast.p90, centro: c.forecast.p50, ultimo: c.price, prefijo: c.currency, fechaUltimo: c.priceDate ? shortDay(c.priceDate) : "", decimales: 2 })}</div>`
      : "";
    
    const fc = c.forecast ? `
      <div style="font-family:${ui};font-size:13px;color:${C.soft};margin:8px 0 0">
        Proyección al ${esc(shortDay(c.forecast.date))}: ${c.currency} ${fmt(c.forecast.p50)}
        ${c.forecast.p10 ? ` (${fmt(c.forecast.p10)} — ${fmt(c.forecast.p90)}, 8 de cada 10 veces)` : ''}
      </div>` : "";
    
    const item = (html) => `<tr><td valign="top" style="width:16px;padding:5px 0 0;font-family:${ui};font-size:13px;color:${C.soft}">–</td><td style="padding:5px 0 0;font-family:${ui};font-size:13px;line-height:1.45">${html}</td></tr>`;
    const smv = c.smv.map((h) => item(`<span style="color:${C.soft}">SMV, ${esc(shortDay(h.fecha))}:</span> <a href="${esc(h.url_oficial)}" style="color:${C.ink}">${esc(h.titulo)}</a>`)).join("");
    const news = c.news.map((n) => item(`<a href="${esc(n.url)}" style="color:${C.ink}">${esc(n.titulo)}</a> <span style="color:${C.soft}">· ${esc(n.fuente)}</span>`)).join("");
    const quiet = !c.smv.length && !c.news.length ? `<div style="margin-top:6px;font-family:${ui};font-size:13px;color:${C.soft}">Sin hechos de importancia ni noticias en los últimos días.</div>` : "";
    const sentiment = c.sentiment ? `<div style="margin-top:6px;font-family:${ui};font-size:13px;color:${C.soft}">${esc(c.sentiment)}</div>` : (quiet ? "" : `<div style="margin-top:6px;font-family:${ui};font-size:13px;color:${C.soft}">Sin noticias recientes de esta empresa.</div>`);
    
    // Company reading
    const l = lecturas?.[c.nemo];
    const bloqueLectura = (lista, label, tipo) => (lista || []).length
      ? `<div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin:12px 0 4px">${label}</div>${lista.map(p => ({...p, tipo})).map(punto).join("")}` : "";
    
    const lecturaHtml = l ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed ${C.rule}">
        <div style="font-family:${ui};font-size:12px;font-weight:600;color:${C.ink};margin-bottom:8px">Lectura de ${esc(c.name)}</div>
        ${l.resumen && l.resumen !== l.que_hay?.[0]?.texto && !(l.que_hay?.[0]?.texto || "").startsWith(l.resumen.replace(/\.$/, "")) ? `<div style="font-family:${serif};font-size:15px;line-height:1.5;color:${C.ink};margin-bottom:8px">${esc(l.resumen)}</div>` : ""}
        ${bloqueLectura(l.que_hay, "Qué hay", "contexto")}
        ${bloqueLectura(l.podria_mover?.al_alza, "Podría mover al alza", "al_alza")}
        ${bloqueLectura(l.podria_mover?.a_la_baja, "Podría mover a la baja", "a_la_baja")}
        ${bloqueLectura(l.contexto, "Contexto", "contexto")}
      </div>` : "";
    
    return `<tr><td style="padding:20px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${ui};font-size:15px;font-weight:600;color:${C.ink};vertical-align:top">${esc(c.name)} <span style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:11px;font-weight:400;color:${C.soft}">${esc(c.nemo)}</span></td>
        <td align="right" style="font-family:${mono};font-variant-numeric:tabular-nums;font-size:15px;color:${C.ink};white-space:nowrap;vertical-align:top">${c.price != null ? `${c.currency} ${fmt(c.price)}` : `<a href="${SITE}/empresa/${encodeURIComponent(c.nemo)}" style="color:${C.soft};font-family:${ui};font-size:12px">Ver ficha</a>`}<br><span style="font-size:13px">${ch}</span>${c.price != null ? `<br><span style="font-size:11px;color:${C.soft}">${c.priceDate ? `cierre del ${esc(shortDay(c.priceDate))}` : "último cierre disponible"}</span>` : ""}</td>
      </tr></table>
      ${rangeBarHtml}
      ${fc}
      ${sentiment}${smv || news ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${smv}${news}</table>` : ""}${quiet}${lecturaHtml}
    </td></tr>`;
  }).join(regla());
  
  return `<tr><td style="padding:24px 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${ui};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">Tus empresas</td></tr></table></td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
  <div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:16px">Precios: datos de mercado de cierre. Hechos: SMV. La proyección es estadística y no incorpora las noticias.</div></td></tr>`;
}

const f = await facts();
const ai = await interpret(f);
const lima = new Date(Date.now() - 5 * 36e5);
const dateLabel = lima.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Charts are inline SVG inside the renderers, so the send needs no attachments.
const upsell = `<tr><td style="padding:24px 0 0;font-family:'Libre Franklin',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5E584E">Elegiste empresas para seguir. La sección «Tus empresas» (precio, proyección, hechos y noticias de cada una) llega con el plan Boletín.</td></tr>`;
const fill = (html, personal, baja = `${SITE}/boletin`, prefs = `${SITE}/boletin`) => html
  .replace("{{BAJA}}", () => baja)
  .replace("{{EMPRESAS}}", () => prefs)
  .replace("{{PERSONAL}}", () => personal);

// Shared news sources for the two readings: the classifier and the raw feed,
// read from data/ (the modules' demos read them the same way). Any failure
// simply leaves both readings deterministic, never a crash.
const clasifLocal = readLocal("data/noticias-clasificadas.json", { items: {} }).items || {};
const newsLocal = readLocal("data/noticias.json", { noticias: [] }).noticias || [];
let clasif = clasifLocal;
let newsById = Object.fromEntries(newsLocal.map((n) => [n.id, n]));
if (!Object.keys(clasif).length || !Object.keys(newsById).length) {
  clasif = (await getJson(`${RAW}/noticias-clasificadas.json`).catch(() => ({ items: {} }))).items || clasif;
  newsById = Object.fromEntries(((await getJson(`${RAW}/noticias.json`).catch(() => ({ noticias: [] }))).noticias || []).map((n) => [n.id, n]));
  if (!Object.keys(newsById).length) newsById = Object.fromEntries(newsLocal.map((n) => [n.id, n]));
}

// Both readings share one 90 s budget (brief): lecturaDolar first, then
// lecturasEmpresas over the preview/paid companies. The deterministic
// versions are instant, so without an LLM key this is negligible.
// The free email never contains company readings: its preview is built from
// the dollar/historias/presiona pieces only, and the paid preview only adds
// «Tus empresas».
const lecturaDeadline = Date.now() + 90 * 1000;
const { dolar: lecturaDolarOut } = await lecturaDolarSegura(f, clasif, newsById, lecturaDeadline);

let previewPersonal = "";
let lecturasPreview = {};
if (process.env.PREVIEW_EMPRESAS) {
  const want = process.env.PREVIEW_EMPRESAS.split(",").map((x) => x.trim()).filter(Boolean);
  const smvAll = readLocal("data/smv-hechos.json", { hechos: {} }).hechos || {};
  const smvLive = (await getJson(`${RAW}/smv-hechos.json`).catch(() => null))?.hechos;
  const cards = [];
  for (const n of want) { const c = await companyCard(n, smvLive || smvAll, clasif, newsById); if (c) cards.push(c); }
  // Brief: lecturasEmpresas over `datos` built from the cards (only the news
  // companyCard already filtered → card.news), with the same macro and the
  // forecast range. No card → no reading, never a crash.
  if (PREVIEW_PLAN !== "gratis" && cards.length) {
    const macro = macroEmpresa(f);
    const listaDatos = cards.map((c) => ({
      nemo: c.nemo, nombre: c.name, sector: c.sector,
      precio: c.price, moneda: c.currency, fecha_precio: c.priceDate ? String(c.priceDate).slice(0, 10) : null,
      variacion_dia: c.change ?? null,
      rango: c.forecast ? { p10: c.forecast.p10, p50: c.forecast.p50, p90: c.forecast.p90, fecha: c.forecast.date } : null,
      hechos_smv: (c.smv || []).map((h) => ({ fecha: String(h.fecha).slice(0, 10), titulo: h.titulo })),
      noticias: (c.news || []).map((n) => ({ titular: n.titulo, fuente: n.fuente, fecha: String(n.fecha_iso || "").slice(0, 10), sentimiento: n.sentimiento })),
      macro,
    }));
    try {
      const left = lecturaDeadline - Date.now();
      if (left > 5000) {
        const lecturas = await Promise.race([
          lecturasEmpresas(listaDatos),
          new Promise((_, rej) => { const t = setTimeout(() => rej(new Error("tiempo agotado")), Math.max(5000, left)); t.unref?.(); }),
        ]);
        for (const [nemo, lec] of lecturas) lecturasPreview[nemo] = lec;
        const todosDet = listaDatos.every((d) => lecturas.get(d.nemo)?.determinista);
        console.log(`Lecturas de empresa: ${todosDet ? "determinista (sin LLM)" : "LLM"}`);
      } else {
        console.log("Lecturas de empresa omitidas: sin tiempo (se envía sin la sección)");
      }
    } catch (e) {
      console.log(`Lecturas de empresa no disponibles: ${e.message} (se envía sin la sección)`);
    }
  }
  previewPersonal = PREVIEW_PLAN === "gratis" ? upsell : renderPersonal(cards, lecturasPreview);
}

const htmlCompleto = render(f, ai, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null);
const htmlGratis = renderGratis(f, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null);
const cliPreviewPath = process.argv.find((a) => a.startsWith("--preview-path="))?.slice("--preview-path=".length);
const previewPath = process.env.BOLETIN_PREVIEW_PATH || cliPreviewPath || path.join(ROOT, "..", "handoff", "qa", process.env.PREVIEW_PLAN === "gratis" ? "correo-gratis.html" : "correo-pagado.html");
fs.mkdirSync(path.dirname(path.resolve(previewPath)), { recursive: true });
fs.writeFileSync(previewPath, fill(PREVIEW_PLAN === "gratis" ? htmlGratis : htmlCompleto, previewPersonal));
console.log(`Vista previa: ${PREVIEW_PLAN} · mercados: ${f.markets.length} · SMV: ${f.smvFacts.length} · titulares: ${f.headlines.length} · historias: ${f.historiasTodas?.length || 0} · IA: ${ai ? "sí" : "no"}`);

async function seguimientoDe(email) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return [];
  try {
    const u = await fetch(`${base}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!u.ok) return [];
    const rows = await u.json();
    const id = rows && rows[0] && rows[0].id;
    if (!id) return [];
    const s = await fetch(`${base}/rest/v1/seguimiento?user_id=eq.${encodeURIComponent(id)}&select=simbolo&order=creado.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!s.ok) return [];
    const list = await s.json();
    return Array.isArray(list) ? list.map((r) => r.simbolo).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

if (!DRY && !PREVIEW) {
  if (!process.env.RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY");
  const today = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
  const LAST = new URL("../data/boletin-last.json", import.meta.url);
  if (process.env.FORCE !== "true" && fs.existsSync(LAST)) {
    const last = JSON.parse(fs.readFileSync(LAST, "utf8"));
    if (last.date === today) {
      console.log(`Ya se envió hoy (${last.sentAt}); no se repite`);
      process.exit(0);
    }
  }
  const list = [];
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (base && process.env.SUPABASE_SERVICE_KEY) {
    const r = await fetch(`${base}/rest/v1/boletin_suscriptores?estado=eq.activo&select=email,token,empresas`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) list.push(...(await r.json()));
    else console.error(`Suscriptores no disponibles (HTTP ${r.status}); se envía solo a BOLETIN_TO`);
  }
  for (const email of (process.env.BOLETIN_TO || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!list.some((x) => x.email === email)) list.push({ email, token: null, empresas: [] });
  }
  if (!list.length) throw new Error("Sin destinatarios");

  const paid = new Set();
  if (base && process.env.SUPABASE_SERVICE_KEY && list.length) {
    const emails = list.map((x) => `"${x.email}"`).join(",");
    const r = await fetch(`${base}/rest/v1/users?select=email,plan&plan=in.(boletin,pro)&email=in.(${encodeURIComponent(emails)})`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) for (const u of await r.json()) paid.add(String(u.email).toLowerCase());
  }
  const owners = new Set((process.env.BOLETIN_TO || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  for (const x of list) x.plan = paid.has(x.email) || owners.has(x.email) ? "boletin" : "gratis";

  for (const x of list) {
    if (x.plan !== "boletin") continue;
    const seguidos = await seguimientoDe(x.email);
    if (seguidos.length) x.empresas = seguidos;
  }

  const wanted = [...new Set(list.filter((x) => x.plan === "boletin").flatMap((x) => x.empresas || []))].slice(0, 15);
  const smvLive = (await getJson(`${RAW}/smv-hechos.json`).catch(() => null))?.hechos;
  const smvAll = smvLive || readLocal("data/smv-hechos.json", { hechos: {} }).hechos || {};
  const cards = {};
  for (const nemo of wanted) cards[nemo] = await companyCard(nemo, smvAll, clasif, newsById);
  console.log(`Empresas seguidas: ${wanted.length}`);

  // Company readings for the paid send (same builders as the preview, over
  // the cards the subscribers actually see). Shared budget, never a crash.
  let lecturas = {};
  const paidCards = wanted.map((n) => cards[n]).filter(Boolean);
  if (paidCards.length) {
    const macro = macroEmpresa(f);
    const listaDatos = paidCards.map((c) => ({
      nemo: c.nemo, nombre: c.name, sector: c.sector,
      precio: c.price, moneda: c.currency, fecha_precio: c.priceDate ? String(c.priceDate).slice(0, 10) : null,
      variacion_dia: c.change ?? null,
      rango: c.forecast ? { p10: c.forecast.p10, p50: c.forecast.p50, p90: c.forecast.p90, fecha: c.forecast.date } : null,
      hechos_smv: (c.smv || []).map((h) => ({ fecha: String(h.fecha).slice(0, 10), titulo: h.titulo })),
      noticias: (c.news || []).map((n) => ({ titular: n.titulo, fuente: n.fuente, fecha: String(n.fecha_iso || "").slice(0, 10), sentimiento: n.sentimiento })),
      macro,
    }));
    try {
      const left = lecturaDeadline - Date.now();
      if (left > 5000) {
        const map = await Promise.race([
          lecturasEmpresas(listaDatos),
          new Promise((_, rej) => { const t = setTimeout(() => rej(new Error("tiempo agotado")), Math.max(5000, left)); t.unref?.(); }),
        ]);
        for (const [nemo, lec] of map) lecturas[nemo] = lec;
        const todosDet = listaDatos.every((d) => map.get(d.nemo)?.determinista);
        console.log(`Lecturas de empresa: ${todosDet ? "determinista (sin LLM)" : "LLM"}`);
      } else {
        console.log("Lecturas de empresa omitidas: sin tiempo (se envía sin la sección)");
      }
    } catch (e) {
      console.log(`Lecturas de empresa no disponibles: ${e.message} (se envía sin la sección)`);
    }
  }

  const emails = list.map(({ email, token, empresas, plan }) => {
    const baja = token ? `${SITE}/api/boletin?accion=baja&t=${token}` : `${SITE}/boletin`;
    const prefs = token ? `${SITE}/boletin?t=${token}#empresas` : `${SITE}/boletin`;
    const mine = (empresas || []).map((n) => cards[n]).filter(Boolean);
    // Free version: no «Tus empresas» section, only the note about the plan
    const personal = plan === "gratis" ? ((empresas || []).length ? upsell : "") : (mine.length ? renderPersonal(mine, lecturas) : `<tr><td style="padding:24px 0 0;font-family:'Libre Franklin',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5E584E">Aún no elegiste empresas. Elige hasta 15 en <a href="${SITE}/cuenta" style="color:#1B1916">/cuenta</a> y cada mañana llegará tu sección «Tus empresas».</td></tr>`);
    const baseHtml = plan === "gratis" ? htmlGratis : htmlCompleto;
    const msg = { 
      from: FROM, 
      to: [email], 
      subject: `PerData · ${dateLabel}`, 
      html: fill(baseHtml, personal, baja, prefs) 
    };
    
    if (token) msg.headers = { "List-Unsubscribe": `<${baja}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    return msg;
  });
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(emails.slice(i, i + 100)),
    });
    if (!r.ok) throw new Error(`Resend: HTTP ${r.status} ${await r.text()}`);
    sent += emails.slice(i, i + 100).length;
  }
  console.log(`Enviado a ${sent} destinatario(s)`);
  if (process.env.FORCE !== "true") fs.writeFileSync(LAST, JSON.stringify({ date: today, sentAt: new Date().toISOString(), recipients: sent }) + "\n");
}

// Self-contained smoke used in tests: no fetch, same renderers as the previews.
export function renderForTests(f, dateLabel, opts = {}) {
  return {
    gratis: renderGratis(f, dateLabel, opts.lecturaDolar),
    pagado: render(f, null, dateLabel, opts.lecturaDolar),
  };
}
