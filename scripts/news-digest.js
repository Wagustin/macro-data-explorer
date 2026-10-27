// «Lo importante de hoy»: picks the stories that matter for someone following Peru's economy and
// stock market, groups headlines about the same event and writes a short note of our own for each,
// using only the facts in the headlines (we never copy articles) and listing every source link.
// Laya's labels go in as a hint; the language model makes the final choice.
// Writes data/noticias-resumen.json and the dated public archive. Runs after fetch-news.js and classify-news.js (news.yml).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON, grounded } from "./llm.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return fallback; } };

function limaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function updateArchive(summary) {
  const archiveDir = path.join(ROOT, "data", "resumenes");
  fs.mkdirSync(archiveDir, { recursive: true });
  const dates = fs.readdirSync(archiveDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map((name) => name.slice(0, 10));
  const date = limaDate(new Date(summary.actualizado));
  fs.writeFileSync(path.join(archiveDir, `${date}.json`), JSON.stringify({ ...summary, fecha: date }, null, 1) + "\n");
  const allDates = [...new Set([...dates, date])].sort().reverse();
  fs.writeFileSync(path.join(archiveDir, "index.json"), JSON.stringify({ fechas: allDates }, null, 1) + "\n");

  const sitemapPath = path.join(ROOT, "sitemap.xml");
  let sitemap = fs.readFileSync(sitemapPath, "utf8").replace(/\s*<url><loc>https:\/\/perdata\.site\/resumen(?:es|\/\d{4}-\d{2}-\d{2})<\/loc>[\s\S]*?<\/url>/g, "");
  const entries = ["/resumenes", ...allDates.map((day) => `/resumen/${day}`)]
    .map((url) => `  <url><loc>https://perdata.site${url}</loc><lastmod>${url === "/resumenes" ? date : url.slice(-10)}</lastmod><changefreq>daily</changefreq></url>`).join("\n");
  sitemap = sitemap.replace("</urlset>", `${entries}\n</urlset>`);
  fs.writeFileSync(sitemapPath, sitemap);
}

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

Elige de 3 a 6 historias importantes para alguien que sigue la economía y la bolsa del Perú: BCRP y tipo de cambio, inflación, PBI y finanzas públicas, minería y metales, energía, empresas listadas (resultados, dividendos, inversiones, emisiones, sanciones), regulación que afecte a empresas, y hechos internacionales que muevan esos mercados (guerras, EE. UU. y China, Reserva Federal, aranceles, petróleo, inteligencia artificial). Descarta sucesos policiales, consejos de consumo, horóscopos y notas de servicio («precio del dólar hoy: consulta…») salvo que traigan un dato nuevo. La relevancia del clasificador es solo una pista: decide tú.
Agrupa en una misma historia SOLO los titulares que cuenten exactamente el mismo hecho (misma entidad y mismo acontecimiento). Dos hechos distintos van en historias distintas aunque sean del mismo sector; si no caben, elige el más importante.
Para cada historia escribe una nota PROPIA de 1 a 3 frases en español claro, usando SOLO los hechos de esos titulares (no inventes cifras, causas ni consecuencias; no copies frases enteras de los titulares).

Devuelve SOLO este JSON:
{"historias":[{"titulo":"titular propio de máximo 12 palabras","nota":"1 a 3 frases","indices":[números de los titulares usados],"tema":"una de: Dólar y BCRP, Economía y fiscal, Bolsa y empresas, Minería y metales, Energía, Mundo"}]}`;

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

const summary = {
  actualizado: new Date().toISOString(),
  modelo: res.model,
  nota: "Notas redactadas por PerData Engine con ayuda de IA a partir de titulares públicos",
  historias: stories,
};
fs.writeFileSync(path.join(ROOT, "data", "noticias-resumen.json"), JSON.stringify(summary, null, 1) + "\n");
updateArchive(summary);
console.log(`Historias: ${stories.length} (${res.model})`);
