// Daily AI note per asset for the terminal (runs after precompute-engine.js in timesfm.yml).
// For each asset: today's PerData Engine projection at 1 month, its change over the last
// 3 months, and the headlines or SMV facts that mention it. The language model writes two short
// plain-Spanish sentences from those facts only; sentences with numbers that aren't in the facts
// are dropped. Writes data/interpretaciones.json, read by /api/interpret.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATALOG } from "../api/search.js";
import { askJSON, grounded } from "./llm.js";
import { ENGINE } from "../api/_lib/engine.js";
import { syncD1 } from "./d1-sync.js";
import { selectHeadlines, sentimentAverage, validCitations, topicsForAsset } from "./interpretation-utils.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return d; } };

const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) { console.log("Sin Supabase: no hay proyecciones que leer"); process.exit(0); }

const r = await fetch(`${base}/rest/v1/forecasts?model=eq.${ENGINE.id}&horizon=in.(1,3)&select=symbol,horizon,last_close,p10,p50,p90,run_at`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
const rows = await r.json();

const news = read("noticias.json", { noticias: [] }).noticias || [];
const laya = read("noticias-laya.json", { items: {} }).items || {};
const nameOf = Object.fromEntries(CATALOG.map((a) => [a.symbol, a.name]));
const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const forecasts = new Map(rows.map((row) => [`${row.symbol}|${row.horizon}`, row]));
const averageAll = (items) => sentimentAverage(items.map((item) => ({ sentimiento: laya[item.id]?.sentimiento })));

const facts = rows.filter((row) => Number(row.horizon) === 1).map((row) => {
  const sym = row.symbol;
  const asset = CATALOG.find((a) => a.symbol === sym) || { symbol: sym, name: nameOf[sym] || sym, tags: [] };
  const threeMonth = forecasts.get(`${sym}|3`);
  const last = Number(row.last_close);
  const headlines = selectHeadlines({ asset, news, labels: laya, since });
  const today = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
  const todayHeadlines = headlines.filter((item) => new Date(Date.parse(item.fecha) - 5 * 36e5).toISOString().slice(0, 10) === today);
  const p50 = Number(row.p50);
  return {
    simbolo: sym, nombre: asset.name, ultimo: last,
    direccion: p50 > last ? "sube" : p50 < last ? "baja" : "estable",
    proyeccion_1m: { p10: Number(row.p10), p50, p90: Number(row.p90) },
    proyeccion_3m: threeMonth ? { p10: Number(threeMonth.p10), p50: Number(threeMonth.p50), p90: Number(threeMonth.p90) } : null,
    titulares: headlines,
    sentimiento_medio: averageAll(headlines), sentimiento_hoy: averageAll(todayHeadlines),
    temas_sin_titulares: topicsForAsset(asset),
  };
});

const notes = {};
const fmt = (value) => Number(value).toLocaleString("es-PE", { maximumFractionDigits: 8 });
for (const fact of facts.filter((item) => !item.titulares.length)) {
  const one = fact.proyeccion_1m;
  const three = fact.proyeccion_3m;
  const direction = fact.direccion === "estable" ? "se mantenga estable" : fact.direccion === "sube" ? "suba" : "baje";
  const monthThree = three ? ` A 3 meses, el rango proyectado es P10 ${fmt(three.p10)}, P50 ${fmt(three.p50)} y P90 ${fmt(three.p90)}.` : " No hay una proyección disponible a 3 meses.";
  notes[fact.simbolo] = {
    texto: `Proyectamos que ${fact.nombre} ${direction} en 1 mes, con P10 ${fmt(one.p10)}, P50 ${fmt(one.p50)} y P90 ${fmt(one.p90)}.${monthThree} Sin noticias recientes relevantes.`,
    noticias: [],
  };
}
let model = null;
const factsWithNews = facts.filter((item) => item.titulares.length);
for (let i = 0; i < factsWithNews.length; i += 15) {
  const batch = factsWithNews.slice(i, i + 15);
  const prompt = `Eres el analista de PerData. Para cada activo escribe 3 o 4 frases en español claro.
Usa SOLO el contexto proporcionado: no inventes hechos ni cifras, no atribuyas cifras a las noticias y no recomiendes comprar o vender. Usa lenguaje prudente («podría», «sería»). No digas que el modelo usó noticias: la proyección sale de los modelos y los titulares solo explican riesgos actuales.
${JSON.stringify(batch)}

Frase 1: qué proyectamos a 1 y 3 meses, con los rangos P10-P90 y el valor central P50 exactos del contexto; indica la dirección.
Frases 2 y 3: hechos actuales de los titulares que podrían empujar al alza o a la baja y el mecanismo económico breve. Cita solo lo que dicen los titulares.
Frase 4: qué vigilar. Si no hay titulares, escribe solo la proyección y «Sin noticias recientes relevantes».
Devuelve SOLO JSON: {"notas":{"SIMBOLO":{"texto":"3-4 frases", "noticias":[{"id":"id del titular"}]}}}. Incluye de 1 a 3 titulares citados, solo si hay titulares; sus ids deben estar en el contexto.`;
  const res = await askJSON(prompt, { budgetMs: 4 * 60 * 1000 });
  if (!res) { console.error(`Lote ${i / 15 + 1}: sin respuesta`); continue; }
  model = model || res.model;
  for (const f of batch) {
    const result = res.out.notas?.[f.simbolo];
    if (!result || typeof result.texto !== "string") continue;
    const clean = grounded(result.texto, JSON.stringify(f));
    if (clean) notes[f.simbolo] = { texto: clean, noticias: validCitations(result.noticias, f.titulares) };
  }
}

const actualizado = new Date().toISOString();
fs.writeFileSync(path.join(ROOT, "data", "interpretaciones.json"), JSON.stringify({
  actualizado,
  modelo: model,
  nota: `Notas redactadas con IA a partir de la proyección de ${ENGINE.label} y noticias económicas recientes.`,
  notas: notes,
}) + "\n");
await syncD1("interpretaciones", Object.entries(notes).map(([symbol, note]) => ({ symbol, texto: JSON.stringify(note), actualizado })), 200);
console.log(`Notas: ${Object.keys(notes).length}/${facts.length} (${model})`);
