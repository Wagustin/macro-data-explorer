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
// Preferred NIM models, in order (catalog checked 25-Oct-2026); each available one is tried until one answers
const NIM_PREFERRED = (process.env.NIM_MODEL ? [process.env.NIM_MODEL] : []).concat([
  "deepseek-ai/deepseek-v4.1-flash", "moonshotai/kimi-k2.6", "z-ai/glm-5.3", "google/gemma-4-31b-it",
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

async function interpret(f) {
  if (!process.env.NVIDIA_API_KEY) return null;
  const factsText = JSON.stringify(f);
  const prompt = `Eres el redactor del boletín de PerData, sobre economía y mercados del Perú. Escribe en español neutro, claro, para principiantes y expertos.
Usa SOLO estos datos (no añadas cifras, fechas, causas ni hechos que no estén aquí; no des recomendaciones de inversión):
${factsText}

Devuelve SOLO un JSON con:
{"entradilla": "2 frases: lo más importante de hoy",
 "mercados": "3 o 4 frases sobre los precios (dólar, cobre, oro, petróleo) y qué significa para el Perú, sin inventar causas",
 "empresas": "1 o 2 frases sobre los hechos de importancia de la SMV, o cadena vacía si no hay"}`;
  for (const model of await availableModels(process.env.NVIDIA_API_KEY)) {
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = (await r.json()).choices?.[0]?.message?.content || "";
      const out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      for (const k of Object.keys(out)) out[k] = grounded(String(out[k] || ""), factsText);
      console.log(`Interpretación: ${model}`);
      return out;
    } catch (e) {
      console.error(`NIM ${model}: ${e.message}`);
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
