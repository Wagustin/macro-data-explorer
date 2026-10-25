// PerData daily newsletter (Mon-Fri 07:00 Lima, GitHub Actions).
// 1. Gathers facts: BCRP/EIA daily prices, SMV material facts of the last day, the 1-month
//    USD/PEN projection and news headlines from allowed sources (title + link only).
// 2. NVIDIA NIM writes short plain-Spanish blocks using ONLY those facts; any sentence with a
//    number that is not in the facts is dropped, and if NIM fails the email goes out without it.
// 3. Renders an editorial HTML email and sends it with Resend.
// Env: RESEND_API_KEY, BOLETIN_TO (comma list), NVIDIA_API_KEY (optional), NIM_MODEL (optional)
// Usage: node scripts/boletin.js [--dry-run] (writes boletin-preview.html, sends nothing)
import fs from "fs";

const DRY = process.argv.includes("--dry-run");
const SITE = "https://perdata.site";
const RAW = "https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data";
const FROM = process.env.BOLETIN_FROM || "PerData <boletin@perdata.site>";
// NIM models that answered in seconds in the probe of 25-Oct-2026 (node scripts/boletin.js --probe),
// in order; each available one is tried until one answers
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
// Sources we cite (headline + link). Aggregators, social networks and unknown sites are left out.
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
// SMV subjects often come in capitals: "INFORMACIÓN FINANCIERA" -> "Información financiera"
// "GRUPO BVL S.A.A." -> "Grupo BVL S.A.A." (same rules as the Empresas directory)
const KEEP = new Set(["BBVA", "AFP", "BVL", "FTE", "IDE", "SEAL", "AIB", "XP", "OH!"]);
const SMALL = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
const prettyName = (raw) => String(raw || "").trim().split(/\s+/).map((w, i) => {
  if (KEEP.has(w.toUpperCase()) || /^\(?([A-Za-z]\.){2,}[-)]*$/.test(w)) return w.toUpperCase();
  const lw = w.toLowerCase();
  return i > 0 && SMALL.has(lw) ? lw : lw.replace(/(^|[-(«"])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}).join(" ");
const sentence = (t) => { const x = String(t || "").trim(); return x && x === x.toUpperCase() ? x.charAt(0) + x.slice(1).toLowerCase() : x; };

async function facts() {
  const [bcrp, eia, smv, news, fx, empresas] = await Promise.all([
    getJson(`${RAW}/official/bcrp-daily.json`),
    getJson(`${RAW}/official/eia-oil.json`).catch(() => null),
    getJson(`${RAW}/smv-hechos.json`).catch(() => ({ hechos: {} })),
    getJson(`${SITE}/api/news`).catch(() => ({ news: [] })),
    getJson(`${SITE}/api/forecast?symbol=PEN%3DX&horizon=1`).catch(() => null),
    getJson(`${RAW}/empresas.json`).catch(() => ({ emisores: [] })),
  ]);
  const nameOf = {};
  for (const e of empresas.emisores || []) for (const v of e.valores) nameOf[v.nemonico] = e.razonSocial;

  const markets = [];
  const add = (name, unit, points, dec = 2) => {
    if (!points || points.length < 2) return;
    const [d1, v1] = points[points.length - 1];
    const [, v0] = points[points.length - 2];
    markets.push({ name, unit, date: d1, value: v1, change: pct(v1, v0), dec });
  };
  const s = bcrp.series;
  add("Dólar (USD/PEN)", "S/", s.PEN?.serie, 3);
  add("Cobre", "US$/lb", s.COBRE?.serie);
  add("Oro", "US$/oz", s.ORO?.serie, 0);
  add("Plata", "US$/oz", s.PLATA?.serie);
  add("Zinc", "US$/lb", s.ZINC?.serie);
  add("Petróleo WTI", "US$/barril", s.WTI?.serie);
  if (eia) add("Petróleo Brent", "US$/barril", eia.series.BRENT);

  // SMV facts published in the last 2 days (covers the evening and night before)
  const since = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const smvFacts = [];
  for (const [nemo, list] of Object.entries(smv.hechos || {})) {
    for (const h of list) if (h.fecha >= since) smvFacts.push({ nemo, empresa: prettyName(nameOf[nemo] || nemo), ...h, titulo: sentence(h.titulo), tipo: sentence(h.tipo) });
  }
  smvFacts.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const headlines = (news.news || [])
    .filter((n) => SOURCES.some((src) => (n.source || "").toLowerCase().includes(src.toLowerCase())))
    .slice(0, 8)
    .map((n) => ({ title: n.title, source: n.source, url: n.url, tema: n.impact }));

  const forecast = fx && fx.quantiles ? {
    horizon: fx.horizonDate, p50: fx.predictedPrice, p10: fx.quantiles.p10 ?? fx.quantiles.P10,
    p90: fx.quantiles.p90 ?? fx.quantiles.P90, probRise: fx.probabilityOfRise, model: fx.architecture?.split(" (")[0],
  } : null;

  return { markets, smvFacts: smvFacts.slice(0, 8), headlines, forecast };
}

// Numbers in the model's text must exist in the facts; otherwise the sentence is dropped.
function grounded(text, factsText) {
  const known = new Set((factsText.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const nums = (sentence.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."));
    return nums.every((n) => known.has(n) || known.has(String(Number(n))) || Number(n) < 32); // days of month
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
  // The whole interpretation gets at most 6 minutes, so the email always goes out on time
  const deadline = Date.now() + 6 * 60 * 1000;
  for (const model of await availableModels(process.env.NVIDIA_API_KEY)) {
    const left = deadline - Date.now();
    if (left < 30000) break;
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        // Ask reasoning models to answer directly (each family reads its own flag; others ignore it)
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 8000, thinking: { type: "disabled" },
          messages: [{ role: "system", content: "Respondes solo con el JSON pedido, sin análisis previo ni texto adicional." }, { role: "user", content: prompt }],
          chat_template_kwargs: { thinking: false, enable_thinking: false } }),
        signal: AbortSignal.timeout(Math.min(150000, left)),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const msg = (await r.json()).choices?.[0]?.message || {};
      // Reasoning models may leave the answer after their thinking, or only in reasoning_content
      const text = String(msg.content || msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
      const start = text.lastIndexOf("{\"entradilla\"") > -1 ? text.lastIndexOf("{\"entradilla\"") : text.indexOf("{");
      if (start < 0) throw new Error(`respuesta sin JSON: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      const out = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
      for (const k of Object.keys(out)) out[k] = grounded(String(out[k] || ""), factsText);
      console.log(`Interpretación: ${model}`);
      return out;
    } catch (e) {
      console.error(`NIM ${model}: ${e.message}`);
    }
  }
  // Fallback: Google Gemini (AI Studio), if a key is configured
  if (process.env.GEMINI_API_KEY && deadline - Date.now() > 20000) {
    try {
      const key = process.env.GEMINI_API_KEY;
      const list = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(15000) })).json();
      const model = (list.models || []).map((m) => m.name).filter((n) => /flash/i.test(n) && !/image|tts|audio|live|embedding/i.test(n)).sort().pop();
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
      console.error(`Gemini: ${e.message}`);
    }
  }
  console.error("Interpretación omitida: ningún modelo respondió");
  return null;
}

function render(f, ai, dateLabel) {
  const C = { paper: "#F5F1E8", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318" };
  const serif = "'Source Serif 4',Georgia,'Times New Roman',serif";
  const ui = "'Libre Franklin',Helvetica,Arial,sans-serif";
  const mono = "'IBM Plex Mono',Menlo,Consolas,monospace";
  const p = (t) => t ? `<p style="margin:0 0 14px;font:17px/1.55 ${serif};color:${C.ink}">${esc(t)}</p>` : "";
  const h2 = (t) => `<h2 style="margin:28px 0 10px;padding-top:18px;border-top:1px solid ${C.rule};font:600 20px/1.25 ${serif};color:${C.ink}">${t}</h2>`;
  const rows = f.markets.map((m) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${C.rule};font:14px ${ui};color:${C.ink}">${esc(m.name)}</td>
    <td style="padding:8px 0;border-bottom:1px solid ${C.rule};font:14px ${mono};color:${C.ink};text-align:right">${fmt(m.value, m.dec)} <span style="color:${C.soft};font-size:12px">${esc(m.unit)}</span></td>
    <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${C.rule};font:14px ${mono};text-align:right;color:${m.change >= 0 ? C.pos : C.neg}">${m.change >= 0 ? "+" : ""}${fmt(m.change)} %</td></tr>`).join("");
  const fc = f.forecast ? `<p style="margin:12px 0 0;font:14px/1.5 ${ui};color:${C.soft}">Proyección del dólar al ${esc(f.forecast.horizon)} (${esc(f.forecast.model)}): lo más probable <b style="color:${C.ink}">S/ ${fmt(f.forecast.p50, 3)}</b>${f.forecast.p10 ? `, entre S/ ${fmt(f.forecast.p10, 3)} y S/ ${fmt(f.forecast.p90, 3)} (8 de cada 10 veces)` : ""}. <a href="${SITE}/explorer?symbol=PEN%3DX" style="color:${C.ink}">Ver en la terminal</a></p>` : "";
  const smv = f.smvFacts.map((h) => `<li style="margin:0 0 10px;font:15px/1.45 ${ui};color:${C.ink}"><a href="${esc(h.url_oficial)}" style="color:${C.ink}">${esc(h.titulo || h.tipo)}</a> <span style="color:${C.soft};font-size:12px">· ${esc(h.empresa)} · ${esc(h.fecha)}</span></li>`).join("");
  const news = f.headlines.map((n) => `<li style="margin:0 0 10px;font:15px/1.45 ${ui};color:${C.ink}"><a href="${esc(n.url)}" style="color:${C.ink}">${esc(n.title)}</a> <span style="color:${C.soft};font-size:12px">· ${esc(n.source)}</span></li>`).join("");
  const dates = [...new Set(f.markets.map((m) => m.date))].join(", ");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Boletín PerData</title></head>
<body style="margin:0;background:${C.paper}">
<div style="max-width:620px;margin:0 auto;padding:28px 20px 40px;background:${C.paper}">
  <div style="border-bottom:3px double ${C.ink};padding-bottom:12px;margin-bottom:20px">
    <span style="font:italic 600 26px ${serif};color:${C.ink}">PerData</span>
    <span style="display:inline-block;width:14px;height:10px;margin-left:6px;vertical-align:middle;border:1px solid ${C.ink};background:linear-gradient(90deg,#D91023 33%,#fff 33% 66%,#D91023 66%)"></span>
    <div style="font:12px ${ui};color:${C.soft};margin-top:4px">Boletín del ${esc(dateLabel)}</div>
  </div>
  ${ai?.entradilla ? p(ai.entradilla) : ""}
  ${h2("Mercados")}
  ${ai?.mercados ? p(ai.mercados) : ""}
  <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${C.rule}">${rows}</table>
  <p style="margin:6px 0 0;font:11px ${ui};color:${C.soft}">Fuente: BCRP${f.markets.some((m) => m.name.includes("Brent")) ? " y EIA" : ""}. Último dato publicado: ${esc(dates)}. Variación frente al dato anterior.</p>
  ${fc}
  ${f.smvFacts.length ? h2("Hechos de importancia") + (ai?.empresas ? p(ai.empresas) : "") + `<ul style="padding-left:18px;margin:0">${smv}</ul><p style="margin:6px 0 0;font:11px ${ui};color:${C.soft}">Fuente: Superintendencia del Mercado de Valores (SMV).</p>` : ""}
  ${f.headlines.length ? h2("Titulares") + `<ul style="padding-left:18px;margin:0">${news}</ul>` : ""}
  <div style="margin-top:32px;padding-top:14px;border-top:1px solid ${C.rule};font:12px/1.5 ${ui};color:${C.soft}">
    ${ai ? "Los textos de interpretación los redacta un modelo de IA a partir de los datos de arriba; las cifras se comprueban contra la fuente." : ""}
    Información con fines informativos; no es una recomendación de inversión.<br>
    <a href="${SITE}" style="color:${C.ink}">perdata.site</a> · Equipo de PerData
  </div>
</div></body></html>`;
}

// Tries every chat model of the catalog in parallel with a tiny prompt and reports status and time
if (process.argv.includes("--probe")) {
  const key = process.env.NVIDIA_API_KEY;
  const r = await fetch("https://integrate.api.nvidia.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  const ids = ((await r.json()).data || []).map((m) => m.id)
    .filter((id) => !/embed|guard|safety|reward|parse|retriever|vlm|vision|code|diffusion|clip|nemoretriever|reranker|deplot|kosmos|neva|fuyu|paligemma|recurrent|whisper|asr|tts/i.test(id));
  const results = await Promise.all(ids.map(async (model) => {
    const t0 = Date.now();
    try {
      const q = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 40, temperature: 0, messages: [{ role: "user", content: 'Responde solo con este JSON: {"ok":true}' }] }),
        signal: AbortSignal.timeout(90000),
      });
      const j = await q.json().catch(() => ({}));
      const c = j.choices?.[0]?.message?.content || "";
      return `${q.status} ${String(Date.now() - t0).padStart(6)} ms  ${model}  ${q.ok ? JSON.stringify(c.slice(0, 40)) : ""}`;
    } catch (e) {
      return `ERR ${String(Date.now() - t0).padStart(6)} ms  ${model}  ${e.name}`;
    }
  }));
  console.log(results.sort().join("\n"));
  process.exit(0);
}

if (process.argv.includes("--list-models")) {
  const r = await fetch("https://integrate.api.nvidia.com/v1/models", { headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` } });
  console.log(((await r.json()).data || []).map((m) => m.id).filter((id) => /deepseek|qwen|llama|mistral|nemotron|gemma|kimi|glm|gpt-oss/i.test(id)).join("\n"));
  process.exit(0);
}

const f = await facts();
const ai = await interpret(f);
const lima = new Date(Date.now() - 5 * 36e5);
const dateLabel = lima.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const html = render(f, ai, dateLabel);
fs.writeFileSync("boletin-preview.html", html);
console.log(`Mercados: ${f.markets.length} · SMV: ${f.smvFacts.length} · titulares: ${f.headlines.length} · IA: ${ai ? "sí" : "no"}`);

if (!DRY) {
  const to = (process.env.BOLETIN_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!process.env.RESEND_API_KEY || !to.length) throw new Error("Faltan RESEND_API_KEY o BOLETIN_TO");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: `PerData · ${dateLabel}`, html }),
  });
  if (!r.ok) throw new Error(`Resend: HTTP ${r.status} ${await r.text()}`);
  console.log(`Enviado a ${to.length} destinatario(s)`);
}
