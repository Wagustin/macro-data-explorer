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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEED = path.join(ROOT, "data", "noticias.json");
const OUT = path.join(ROOT, "data", "noticias-laya.json");
const TEMAS = ["Dólar y BCRP", "Economía y fiscal", "Minería y metales", "Bolsa y empresas", "Energía", "Mundo"];
const SENT = ["POSITIVO", "NEGATIVO", "NEUTRO"];
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

const pending = (feed.noticias || []).filter((n) => n.id && !items[n.id] && !dropped.has(n.id));
console.log(`Titulares nuevos: ${pending.length}`);
let model = prev.modelo && !/laya/i.test(prev.modelo) ? prev.modelo : null;
const drop = new Set([...dropped].filter((id) => (feed.noticias || []).some((n) => n.id === id)));

function failBatch(batchNumber, reason) {
  throw new Error(`Lote ${batchNumber}: ${reason}; no se guardaron clasificaciones incompletas`);
}

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
  let res;
  try {
    res = await askJSON(prompt, { budgetMs: 4 * 60 * 1000 });
  } catch (error) {
    failBatch(i / 40 + 1, `falló la llamada al modelo (${error.message})`);
  }
  if (!res || !Array.isArray(res.out?.r)) failBatch(i / 40 + 1, "respuesta del modelo ausente o inválida");
  model = res.model;
  const classified = new Set();
  for (const x of res.out.r || []) {
    if (!Number.isInteger(x?.i) || x.i < 0 || x.i >= batch.length || classified.has(x.i)
      || !["ALTA", "MEDIA", "BAJA", "NINGUNA"].includes(x.relevante)) {
      failBatch(i / 40 + 1, "respuesta con índices inválidos o duplicados");
    }
    classified.add(x.i);
    const n = batch[x.i];
    if (x.relevante === "NINGUNA" && !MARKET_TERMS.test(n.titulo)) { drop.add(n.id); continue; }
    items[n.id] = {
      relevancia: ["ALTA", "MEDIA", "BAJA"].includes(x.relevante) ? x.relevante : "MEDIA",
      tema: TEMAS.includes(x.tema) ? x.tema : n.categoria,
      sentimiento: SENT.includes(x.sentimiento) ? x.sentimiento : "NEUTRO",
      empresas: (x.empresas || []).filter((e) => known.has(e)),
    };
  }
  if (classified.size !== batch.length) failBatch(i / 40 + 1, "faltan titulares por clasificar");
}

// Keep only the classifications of headlines still in the feed
const ids = new Set((feed.noticias || []).map((n) => n.id));
for (const id of Object.keys(items)) if (!ids.has(id) || drop.has(id)) delete items[id];
if (drop.size) {
  feed.noticias = feed.noticias.filter((n) => !drop.has(n.id));
  fs.writeFileSync(FEED, JSON.stringify(feed, null, 2) + "\n");
}
const descartados = [...new Set([...dropped, ...drop])].slice(-1000);
fs.writeFileSync(OUT, JSON.stringify({ actualizado: new Date().toISOString(), modelo: model, items, descartados }, null, 1) + "\n");
console.log(`Clasificados: ${Object.keys(items).length} · descartados por irrelevantes: ${drop.size} (${model})`);
