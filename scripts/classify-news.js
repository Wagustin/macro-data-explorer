// Classifies the new headlines of data/noticias.json with the language model of scripts/llm.js
// (NVIDIA NIM, Gemini as fallback): whether it can move Peruvian or world markets, topic, sentiment
// for those markets and the listed companies it is about (by nemónico). Replaces the Laya model,
// which marked most headlines as positive and missed the companies.
// Headlines judged irrelevant (processions, sports, crime...) are dropped from noticias.json.
// Writes data/noticias-laya.json (same format the digest, newsletter, notes and sentiment read).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON } from "./llm.js";
import { classifyBatch } from "./news-classification.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEED = path.join(ROOT, "data", "noticias.json");
const OUT = path.join(ROOT, "data", "noticias-laya.json");
const TEMAS = ["Dólar y BCRP", "Economía y fiscal", "Minería y metales", "Bolsa y empresas", "Energía", "Mundo"];
const SENT = ["POSITIVO", "NEGATIVO", "NEUTRO"];
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// Headlines with these words are never dropped, whatever the model says
const MARKET_TERMS = /\b(d[oó]lar|tipo\s+de\s+cambio|bolsa|bvl|mercados?|acciones|bonos|pbi|inflaci[oó]n|bcrp?|reserva\s+federal|fed|aranceles?|presupuesto|subsidios?|impuestos?|exportaciones|cobre|oro|petr[oó]leo|elecciones|wall\s+street|nasdaq|ee\.?\s?uu\.?|china)\b/i;

const feed = JSON.parse(fs.readFileSync(FEED, "utf8"));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { items: {} };
// First run after Laya: classify everything again
const items = /laya/i.test(prev.modelo || "") ? {} : prev.items || {};
// Headlines already judged irrelevant (they come back with every fetch of the feeds)
const dropped = new Set(prev.descartados || []);

// One main security per issuer, as the company pages use
const { emisores } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "empresas.json"), "utf8"));
const mainNemo = (vals) => (vals.find((v) => ["BAP", "BVN", "SCCO", "IFS", "CPAC", "AUNA"].includes(v.nemonico))
  || vals.find((v) => v.nemonico.endsWith("C1")) || vals.find((v) => v.nemonico.endsWith("I1")) || vals[0])?.nemonico;
const companies = emisores.map((e) => [mainNemo(e.valores || []), e.razonSocial]).filter(([n]) => n);
const known = new Set(companies.map(([n]) => n));

async function saveLabels(rows) {
  if (!rows.length) return;
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("faltan SUPABASE_URL o SUPABASE_SERVICE_KEY");
    const base = SUPABASE_URL.replace(/\/$/, "");
    const response = await fetch(`${base}/rest/v1/etiquetas_noticias?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.warn(`No se pudieron guardar etiquetas en Supabase: ${error.message}`);
  }
}

function labelRow(n, x, modelName) {
  const relevancia = ["ALTA", "MEDIA", "BAJA"].includes(x?.relevancia) ? x.relevancia : "NINGUNA";
  return {
    id: n.id,
    fecha: n.fecha_iso || new Date().toISOString(),
    titulo: n.titulo,
    fuente: n.fuente || null,
    relevante: relevancia !== "NINGUNA",
    relevancia,
    tema: TEMAS.includes(x?.tema) ? x.tema : (n.categoria || null),
    sentimiento: SENT.includes(x?.sentimiento) ? x.sentimiento : null,
    empresas: (Array.isArray(x?.empresas) ? x.empresas : []).filter((e) => known.has(e)),
    modelo: modelName || null,
  };
}

const pending = (feed.noticias || []).filter((n) => n.id && !items[n.id] && !dropped.has(n.id));
console.log(`Titulares nuevos: ${pending.length}`);
let model = prev.modelo && !/laya/i.test(prev.modelo) ? prev.modelo : null;
const drop = new Set([...dropped].filter((id) => (feed.noticias || []).some((n) => n.id === id)));

let failedBatches = 0;
for (let i = 0; i < pending.length; i += 40) {
  const batch = pending.slice(i, i + 40);
  const prompt = `Clasifica titulares de noticias para PerData, un sitio sobre la economía y la bolsa del Perú.
Para cada titular decide:
- "relevante": "ALTA", "MEDIA" o "BAJA" si puede influir en los mercados peruanos (dólar, tasas, bolsa de Lima, metales, petróleo, empresas, finanzas públicas) o en los mercados mundiales (guerras, EE. UU., China, la Reserva Federal, aranceles, OPEP, inteligencia artificial y grandes tecnológicas, elecciones importantes). Son relevantes también: datos económicos de cualquier país grande (empleo, inflación, pedidos, PBI), presupuesto, subsidios e impuestos, resúmenes de mercados, salidas a bolsa e inversiones de empresas. "NINGUNA" SOLO para sucesos sin efecto económico: procesiones, deportes, espectáculos, crimen, clima del día, curiosidades, trámites personales. Si dudas, "BAJA".
- "tema": uno de ${TEMAS.join(", ")}.
- "sentimiento": POSITIVO, NEGATIVO o NEUTRO para la economía y los mercados peruanos (no para las personas de la noticia). Si es solo informativo, NEUTRO.
- "empresas": nemónicos de esta lista SOLO si el titular trata de esa empresa (no por mencionar su sector). Lista: ${companies.map(([n, r]) => `${n}=${r}`).join("; ")}
Titulares:
${batch.map((n, j) => `${j}|${n.titulo}`).join("\n")}
Devuelve SOLO este JSON: {"r":[{"i":0,"relevante":"ALTA","tema":"...","sentimiento":"...","empresas":[]}, ...]} con un elemento por titular.`;
  // Two attempts; entries with a bad index or label are skipped and retried in the next run
  let res = null;
  for (let attempt = 0; attempt < 2 && !Array.isArray(res?.out?.r); attempt++) {
    try { res = await askJSON(prompt, { budgetMs: 3 * 60 * 1000 }); } catch (error) { res = null; }
  }
  if (!Array.isArray(res?.out?.r)) { failedBatches++; console.error(`Lote ${i / 40 + 1}: sin respuesta válida`); continue; }
  model = res.model;
  const labelRows = [];
  const result = classifyBatch(batch, res.out.r, { knownCompanies: known, marketTerms: MARKET_TERMS });
  for (const id of result.discarded) {
    drop.add(id);
    const n = batch.find((item) => item.id === id);
    const x = res.out.r.find((label) => label.i === batch.indexOf(n));
    labelRows.push(labelRow(n, { ...x, relevancia: "NINGUNA" }, model));
  }
  for (const { id, item } of result.classified) {
    const news = batch.find((entry) => entry.id === id);
    items[id] = {
      ...item,
      tema: TEMAS.includes(item.tema) ? item.tema : news.categoria,
      sentimiento: SENT.includes(item.sentimiento) ? item.sentimiento : "NEUTRO",
    };
    const n = batch.find((item) => item.id === id);
    const x = res.out.r.find((label) => label.i === batch.indexOf(n));
    labelRows.push(labelRow(n, x, model));
  }
  await saveLabels(labelRows);
  if (result.seen.size < batch.length) console.error(`Lote ${i / 40 + 1}: ${batch.length - result.seen.size} titulares sin clasificar, se reintentan en la próxima pasada`);
}

if (process.argv.includes("--sync-all")) {
  const laya = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const allNews = new Map();
  for (const n of [...(feed.noticias || []), ...(laya.noticias || [])]) if (n?.id) allNews.set(n.id, n);
  const discarded = new Set(laya.descartados || []);
  const rows = [...allNews.values()].map((n) => labelRow(
    n,
    discarded.has(n.id) ? { relevancia: "NINGUNA" } : (laya.items || {})[n.id] || {},
    laya.modelo || model,
  ));
  for (let i = 0; i < rows.length; i += 500) await saveLabels(rows.slice(i, i + 500));
  console.log(`Sincronizadas ${rows.length} noticias históricas con Supabase`);
}
// With the model down there is nothing to publish: fail and keep the previous feed
if (pending.length && failedBatches * 40 >= pending.length) throw new Error("ningún lote clasificado: se mantiene el feed anterior");

// Keep only the classifications of headlines still in the feed
const ids = new Set((feed.noticias || []).map((n) => n.id));
for (const id of Object.keys(items)) if (!ids.has(id) || drop.has(id)) delete items[id];
// Publish only classified headlines; the rest come back with the next fetch and are retried
const before = (feed.noticias || []).length;
feed.noticias = (feed.noticias || []).filter((n) => items[n.id]);
if (feed.noticias.length !== before) fs.writeFileSync(FEED, JSON.stringify(feed, null, 2) + "\n");
const descartados = [...new Set([...dropped, ...drop])].slice(-1000);
fs.writeFileSync(OUT, JSON.stringify({ actualizado: new Date().toISOString(), modelo: model, items, descartados }, null, 1) + "\n");
console.log(`Clasificados: ${Object.keys(items).length} · descartados por irrelevantes: ${drop.size} (${model})`);
