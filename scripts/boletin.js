// PerData daily newsletter (Mon-Fri 07:00 Lima, GitHub Actions).
// 1. Gathers facts: BCRP/EIA daily prices, SMV material facts of the last day, the 1-month
//    USD/PEN projection and news headlines from allowed sources (title + link only).
// 2. NVIDIA NIM writes short plain-Spanish blocks using ONLY those facts; any sentence with a
//    number that is not in the facts is dropped, and if NIM fails the email goes out without it.
// 3. Renders an editorial HTML email and sends it with Resend.
// Env: RESEND_API_KEY, BOLETIN_TO (comma list), SUPABASE_URL + SUPABASE_SERVICE_KEY (subscribers),
//      NVIDIA_API_KEY and GEMINI_API_KEY (optional), NIM_MODEL (optional)
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
  // Fallback: Google Gemini (AI Studio), if a key is configured. Stable "flash" models first (previews often
  // have no free quota), then the rest, until one answers.
  if (process.env.GEMINI_API_KEY) {
    const key = process.env.GEMINI_API_KEY;
    let names = [];
    try {
      const list = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(15000) })).json();
      names = (list.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name)
        .filter((n) => /flash/i.test(n) && !/image|tts|audio|live|embedding|thinking/i.test(n));
    } catch (e) {}
    // Older stable models (2.5, 2.0) are the least saturated on the free tier: try them first
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

function render(f, ai, dateLabel) {
  const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
  const serif = "'Source Serif 4',Georgia,'Times New Roman',serif";
  const ui = "'Libre Franklin',Helvetica,Arial,sans-serif";
  const mono = "'IBM Plex Mono',Menlo,Consolas,monospace";
  const edition = Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - Date.UTC(2026, 9, 26)) / 864e5) + 1;
  const para = (t, size = 17) => t ? `<p style="margin:0 0 14px;font-family:${serif};font-size:${size}px;line-height:1.55;color:${C.ink}">${esc(t)}</p>` : "";
  const section = (title) => `<tr><td style="padding:30px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:2px solid ${C.ink};padding-top:10px;font-family:${serif};font-size:22px;font-weight:600;color:${C.ink}">${title}</td></tr></table></td></tr>`;
  const flag = `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-left:8px;border:1px solid ${C.ink}"><tr><td width="5" height="12" style="background:${C.peru}"></td><td width="5" style="background:#ffffff"></td><td width="5" style="background:${C.peru}"></td></tr></table>`;

  const rows = f.markets.map((m) => {
    const up = m.change >= 0;
    return `<tr>
      <td style="padding:11px 0;border-bottom:1px solid ${C.rule};font-family:${ui};font-size:15px;color:${C.ink}">${esc(m.name)}<br><span style="font-size:12px;color:${C.soft}">${esc(m.unit)}</span></td>
      <td align="right" style="padding:11px 0;border-bottom:1px solid ${C.rule};font-family:${mono};font-size:16px;color:${C.ink};white-space:nowrap">${fmt(m.value, m.dec)}</td>
      <td align="right" style="padding:11px 0 11px 14px;border-bottom:1px solid ${C.rule};font-family:${mono};font-size:14px;color:${up ? C.pos : C.neg};white-space:nowrap">${up ? "&#9650;" : "&#9660;"} ${fmt(Math.abs(m.change))}&nbsp;%</td></tr>`;
  }).join("");
  const dates = [...new Set(f.markets.map((m) => m.date))].join(", ");

  const fc = f.forecast ? `<tr><td style="padding:18px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-top:1px solid ${C.rule};border-bottom:1px solid ${C.rule}"><tr><td style="padding:16px 4px">
      <div style="font-family:${ui};font-size:13px;color:${C.soft}">Dólar al ${esc(f.forecast.horizon)} · ${esc(f.forecast.model)}</div>
      <div style="font-family:${serif};font-size:30px;line-height:1.2;color:${C.ink};margin-top:4px">S/ ${fmt(f.forecast.p50, 3)}</div>
      ${f.forecast.p10 ? `<div style="font-family:${ui};font-size:14px;color:${C.soft};margin-top:4px">Entre S/ ${fmt(f.forecast.p10, 3)} y S/ ${fmt(f.forecast.p90, 3)}, 8 de cada 10 veces · probabilidad de alza ${esc(f.forecast.probRise)} %</div>` : ""}
    </td></tr></table></td></tr>` : "";

  const smv = f.smvFacts.map((h) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.rule}">
      <div style="font-family:${ui};font-size:14px;font-weight:600;color:${C.ink}">${esc(h.empresa)}</div>
      <a href="${esc(h.url_oficial)}" style="font-family:${serif};font-size:16px;line-height:1.45;color:${C.ink};text-decoration:underline;text-decoration-color:${C.rule}">${esc(h.titulo || h.tipo)}</a>
      <div style="font-family:${mono};font-size:11px;color:${C.soft};margin-top:3px">${esc(h.fecha)}</div></td></tr>`).join("");
  const news = f.headlines.map((n) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.rule}">
      <a href="${esc(n.url)}" style="font-family:${serif};font-size:16px;line-height:1.45;color:${C.ink};text-decoration:underline;text-decoration-color:${C.rule}">${esc(n.title)}</a>
      <div style="font-family:${ui};font-size:12px;color:${C.soft};margin-top:3px">${esc(n.source)}</div></td></tr>`).join("");
  const preheader = esc(ai?.entradilla || `Dólar, cobre, oro y petróleo; hechos de importancia de la SMV y titulares del ${dateLabel}.`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Libre+Franklin:wght@400;600&family=Source+Serif+4:ital,wght@0,400;0,600;1,600&display=swap" rel="stylesheet">
<title>Boletín PerData</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:28px 0 12px;border-bottom:4px double ${C.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${serif};font-size:32px;font-style:italic;font-weight:600;color:${C.ink};white-space:nowrap">PerData${flag}</td>
      <td align="right" style="font-family:${ui};font-size:12px;line-height:1.5;color:${C.soft}">Boletín diario<br>Edición ${edition > 0 ? edition : 1}</td>
    </tr></table>
    <div style="font-family:${ui};font-size:13px;color:${C.soft};margin-top:6px;text-transform:none">${esc(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1))} · Lima</div>
  </td></tr>
  ${ai?.entradilla ? `<tr><td style="padding:22px 0 4px">${para(ai.entradilla, 20)}</td></tr>` : ""}
  ${section("Mercados")}
  ${ai?.mercados ? `<tr><td style="padding:12px 0 0">${para(ai.mercados)}</td></tr>` : ""}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.rule}">${rows}</table>
    <div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:6px">Fuente: BCRP${f.markets.some((m) => m.name.includes("Brent")) ? " y EIA" : ""}. Último dato publicado: ${esc(dates)}. Variación frente al dato anterior.</div></td></tr>
  ${fc}
  ${f.smvFacts.length ? section("Hechos de importancia") + (ai?.empresas ? `<tr><td style="padding:12px 0 0">${para(ai.empresas)}</td></tr>` : "") + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${smv}</table><div style="font-family:${ui};font-size:11px;color:${C.soft};margin-top:6px">Fuente: Superintendencia del Mercado de Valores (SMV).</div></td></tr>` : ""}
  ${f.headlines.length ? section("Titulares") + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${news}</table></td></tr>` : ""}
  <tr><td align="center" style="padding:32px 0 8px">
    <a href="${SITE}/explorer" style="display:inline-block;background:${C.ink};color:${C.paper};font-family:${ui};font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px">Abrir la terminal</a>
  </td></tr>
  <tr><td style="padding:24px 0 36px;border-top:1px solid ${C.rule};font-family:${ui};font-size:12px;line-height:1.6;color:${C.soft}">
    ${ai ? "La interpretación la redacta un modelo de IA a partir de los datos de este correo; las cifras se comprueban contra la fuente.<br>" : ""}
    Información con fines informativos; no es una recomendación de inversión.<br>
    <a href="${SITE}" style="color:${C.ink}">perdata.site</a> · Equipo de PerData<br>
    Recibes este correo porque te suscribiste al boletín. <a href="{{BAJA}}" style="color:${C.soft}">Darme de baja</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

const f = await facts();
const ai = await interpret(f);
const lima = new Date(Date.now() - 5 * 36e5);
const dateLabel = lima.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const html = render(f, ai, dateLabel);
fs.writeFileSync("boletin-preview.html", html.replace("{{BAJA}}", `${SITE}/boletin`));
console.log(`Mercados: ${f.markets.length} · SMV: ${f.smvFacts.length} · titulares: ${f.headlines.length} · IA: ${ai ? "sí" : "no"}`);

if (!DRY) {
  if (!process.env.RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY");
  // Recipients: confirmed subscribers (Supabase) plus BOLETIN_TO (the owner's copy, no unsubscribe token)
  const list = [];
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (base && process.env.SUPABASE_SERVICE_KEY) {
    const r = await fetch(`${base}/rest/v1/boletin_suscriptores?estado=eq.activo&select=email,token`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) list.push(...(await r.json()));
    else console.error(`Suscriptores no disponibles (HTTP ${r.status}); se envía solo a BOLETIN_TO`);
  }
  for (const email of (process.env.BOLETIN_TO || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!list.some((x) => x.email === email)) list.push({ email, token: null });
  }
  if (!list.length) throw new Error("Sin destinatarios");

  // One personalised email each (own unsubscribe link), sent in batches of 100 (Resend batch API)
  const emails = list.map(({ email, token }) => {
    const baja = token ? `${SITE}/api/boletin?accion=baja&t=${token}` : `${SITE}/boletin`;
    const msg = { from: FROM, to: [email], subject: `PerData · ${dateLabel}`, html: html.replace("{{BAJA}}", baja) };
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
}
