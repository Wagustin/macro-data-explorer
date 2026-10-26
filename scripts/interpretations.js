// Daily AI note per asset for the terminal (runs after precompute-v4.js in timesfm.yml).
// For each asset: today's PerData Engine v4 projection at 1 month, its change over the last
// 3 months, and the headlines or SMV facts that mention it. The language model writes two short
// plain-Spanish sentences from those facts only; sentences with numbers that aren't in the facts
// are dropped. Writes data/interpretaciones.json, read by /api/interpret.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATALOG } from "../api/search.js";
import { askJSON, grounded } from "./llm.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return d; } };

const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) { console.log("Sin Supabase: no hay proyecciones que leer"); process.exit(0); }

const r = await fetch(`${base}/rest/v1/forecasts?model=eq.perdata-engine-v4&horizon=eq.1&select=symbol,last_close,p10,p50,p90,run_at`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
const rows = await r.json();

const history = read("history-120.json", {});
const news = read("noticias.json", { noticias: [] }).noticias || [];
const laya = read("noticias-laya.json", { items: {} }).items || {};
const smv = read("smv-hechos.json", { hechos: {} }).hechos || {};
const nameOf = Object.fromEntries(CATALOG.map((a) => [a.symbol, a.name]));
const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

const facts = rows.map((row) => {
  const sym = row.symbol;
  const nemo = sym.replace(/\.LM$/, "");
  const h = history[sym] || [];
  const past = h.length > 3 ? h[h.length - 4].close : null;
  const last = Number(row.last_close);
  const chg3m = past ? Number(((last / past - 1) * 100).toFixed(1)) : null;
  const mentions = news.filter((n) => (laya[n.id]?.empresas || []).includes(nemo)).slice(0, 2).map((n) => n.titulo);
  const hechos = (smv[nemo] || []).filter((x) => x.fecha >= since).slice(0, 2).map((x) => x.titulo || x.tipo);
  return {
    simbolo: sym, nombre: nameOf[sym] || sym, ultimo: last,
    p50_1m: Number(row.p50), p10_1m: Number(row.p10), p90_1m: Number(row.p90),
    variacion_proyectada_pct: Number(((Number(row.p50) / last - 1) * 100).toFixed(1)),
    variacion_3m_pct: chg3m, titulares: mentions, hechos_smv: hechos,
  };
});

const notes = {};
let model = null;
for (let i = 0; i < facts.length; i += 15) {
  const batch = facts.slice(i, i + 15);
  const prompt = `Eres el analista de PerData. Para cada activo de esta lista escribe una nota de 2 frases cortas en español claro, para principiantes y expertos.
Usa SOLO estos datos (no inventes cifras, causas, noticias ni recomendaciones; no digas «comprar» ni «vender»):
${JSON.stringify(batch)}

Frase 1: qué espera el modelo a 1 mes (valor más probable y rango), en lenguaje llano.
Frase 2: contexto con los datos disponibles: cómo le fue en los últimos 3 meses y, si hay titulares o hechos de la SMV, menciona el más relevante tal cual sin inventar su efecto.
Devuelve SOLO este JSON: {"notas":{"SIMBOLO":"nota", ...}} con un elemento por cada simbolo.`;
  const res = await askJSON(prompt, { budgetMs: 4 * 60 * 1000 });
  if (!res) { console.error(`Lote ${i / 15 + 1}: sin respuesta`); continue; }
  model = model || res.model;
  for (const f of batch) {
    const text = res.out.notas?.[f.simbolo];
    if (!text) continue;
    const clean = grounded(text, JSON.stringify(f));
    if (clean) notes[f.simbolo] = clean;
  }
}

fs.writeFileSync(path.join(ROOT, "data", "interpretaciones.json"), JSON.stringify({
  actualizado: new Date().toISOString(),
  modelo: model,
  nota: "Notas redactadas con IA a partir de la proyección de PerData Engine v4, la evolución reciente y titulares o hechos de la SMV que mencionan al activo.",
  notas: notes,
}) + "\n");
console.log(`Notas: ${Object.keys(notes).length}/${facts.length} (${model})`);
