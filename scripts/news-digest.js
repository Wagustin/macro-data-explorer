// «Lo importante de hoy»: picks the stories that matter for someone following Peru's economy and
// stock market, groups headlines about the same event and writes a short note of our own for each,
// using only the facts in the headlines (we never copy articles) and listing every source link.
// Laya's labels go in as a hint; the language model makes the final choice.
// Writes data/noticias-resumen.json. Runs after fetch-news.js and classify_news.py (news.yml).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON, grounded } from "./llm.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return fallback; } };

const feed = read("noticias.json", { noticias: [] });
const laya = read("noticias-laya.json", { items: {} }).items || {};
const since = Date.now() - 36 * 36e5;
const recent = (feed.noticias || []).filter((n) => Date.parse(n.fecha_iso) >= since).slice(0, 90);
if (recent.length < 5) {
  console.log(`Solo ${recent.length} titulares recientes: no se genera resumen`);
  process.exit(0);
}

const lines = recent.map((n, i) => {
  const c = laya[n.id] || {};
  return `${i}|${n.fuente}|${n.categoria}|laya:${c.relevancia || "-"}|${n.titulo}`;
}).join("\n");

const prompt = `Eres el editor de PerData, un medio sobre economía y bolsa del Perú. Tienes estos titulares de las últimas 36 horas (formato: índice|fuente|categoría|relevancia según un clasificador automático|titular):
${lines}

Elige de 3 a 6 historias importantes para alguien que sigue la economía y la bolsa del Perú: BCRP y tipo de cambio, inflación, PBI y finanzas públicas, minería y metales, energía, empresas listadas (resultados, dividendos, inversiones, emisiones, sanciones), regulación que afecte a empresas. Descarta sucesos policiales, consejos de consumo, horóscopos y notas de servicio («precio del dólar hoy: consulta…») salvo que traigan un dato nuevo. La relevancia del clasificador es solo una pista: decide tú.
Agrupa en una misma historia los titulares que hablen del mismo hecho.
Para cada historia escribe una nota PROPIA de 1 a 3 frases en español claro, usando SOLO los hechos de esos titulares (no inventes cifras, causas ni consecuencias; no copies frases enteras de los titulares).

Devuelve SOLO este JSON:
{"historias":[{"titulo":"titular propio de máximo 12 palabras","nota":"1 a 3 frases","indices":[números de los titulares usados],"tema":"una de: Dólar y BCRP, Economía y fiscal, Bolsa y empresas, Minería y metales, Energía"}]}`;

const res = await askJSON(prompt, { budgetMs: 6 * 60 * 1000 });
if (!res) {
  console.error("Sin resumen: ningún modelo respondió");
  process.exit(0); // keep the previous file; the watchdog checks its age
}

const stories = (res.out.historias || []).map((h) => {
  const used = (h.indices || []).map(Number).filter((i) => recent[i]);
  if (!used.length) return null;
  const src = used.map((i) => recent[i].titulo).join(" ");
  const nota = grounded(h.nota, src);
  if (!nota) return null;
  const empresas = [...new Set(used.flatMap((i) => laya[recent[i].id]?.empresas || []))];
  return {
    titulo: String(h.titulo || "").slice(0, 120),
    nota,
    tema: h.tema || recent[used[0]].categoria,
    empresas,
    fuentes: used.map((i) => ({ titulo: recent[i].titulo, fuente: recent[i].fuente, url: recent[i].url, fecha: recent[i].fecha_iso })),
  };
}).filter(Boolean).slice(0, 6);

fs.writeFileSync(path.join(ROOT, "data", "noticias-resumen.json"), JSON.stringify({
  actualizado: new Date().toISOString(),
  modelo: res.model,
  nota: "Notas redactadas por PerData a partir de titulares de varias fuentes; cada historia enlaza a los medios originales.",
  historias: stories,
}, null, 1) + "\n");
console.log(`Historias: ${stories.length} (${res.model})`);
