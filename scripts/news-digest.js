// «Lo importante de hoy»: picks the stories that matter for someone following Peru's economy and
// stock market, groups headlines about the same event and writes a short note of our own for each,
// using only the facts in the headlines (we never copy articles) and listing every source link.
// Classifier labels go in as a hint; the language model makes the final choice.
// Every title and note goes through textoValido() before it is published: if a block fails, the
// model rewrites that block once; if it fails again, the story keeps only the headline of its
// first source, with no note of our own.
// A second model (another NVIDIA NIM model, NIM_REVIEW_MODEL) then reviews each drafted block
// against the headlines of its sources; a rejected block is rewritten once with the reason and
// reviewed again. The verdict is kept in each block's "revision" field for auditing (not shown
// in the email). If the reviewer is unavailable, a block is published only if it passes
// textoValido() and the figure check (grounded).
// Writes data/noticias-resumen.json and the dated public archive. Runs after fetch-news.js and classify-news.js (news.yml).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON, askNIM, grounded } from "./llm.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return fallback; } };

export const MIN_PALABRAS_TITULO = 4;
export const MIN_PALABRAS_NOTA = 12;

// Palabras inglesas que el modelo se cuela al redactar, sueltas y no como parte de un nombre propio.
const PALABRAS_INGLESES = new Set(["the", "and", "of", "with", "threaten", "threatens", "rises", "falls", "says", "amid", "after", "before", "over", "under", "for", "from", "to"]);

// Abreviaturas que terminan en punto y no son una palabra cortada.
const ABREVIATURAS = new Set(["sr", "sra", "srta", "dr", "dra", "ing", "lic", "msc"]);

const palabras = (texto) => String(texto).trim().split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));

// Un token de una o dos letras pegado al punto: la palabra quedó cortada («por|ja.»).
function palabraCortada(texto) {
  const re = /(?:^|[\s(«"“])([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,2})\.(?=\s|$|[»"”)])/gu;
  for (const m of String(texto).matchAll(re)) {
    const token = m[1];
    if (token === token.toUpperCase()) continue; // sigla: «U.S.»
    if (ABREVIATURAS.has(token.toLowerCase())) continue;
    return true;
  }
  return false;
}

// Palabras inglesas sueltas. Se ignoran las siglas y los nombres propios («Niño», «Wall Street»).
function tieneIngles(texto) {
  const t = String(texto);
  for (const m of t.matchAll(/[\p{L}][\p{L}\p{N}'’.-]*/gu)) {
    const token = m[0];
    if (/[\p{N}]/u.test(token)) continue; // cifras: 49,99%
    if (token === token.toUpperCase() && token.length > 1) continue; // sigla: USD, IA, OPA, BCRP
    const antes = t.slice(0, m.index);
    const inicio = antes.length === 0 || /[.!?:;]\s*$/.test(antes);
    if (!inicio && /^\p{Lu}/u.test(token)) continue; // nombre propio
    if (PALABRAS_INGLESES.has(token.toLowerCase())) return true;
  }
  return false;
}

// Control de calidad de un texto publicado: nada de caracteres rotos, frases completas, palabras
// enteras en español y un mínimo de palabras (4 en el título, 12 en la nota, que además termina
// en punto, interrogación o exclamación).
export function textoValido(texto, { minPalabras = MIN_PALABRAS_TITULO, esNota = minPalabras >= MIN_PALABRAS_NOTA } = {}) {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  if (/[|�<>]/.test(t)) return false;
  if (palabras(t).length < minPalabras) return false;
  if (esNota && !/[.?!][»"”')\]]?$/.test(t)) return false;
  if (palabraCortada(t)) return false;
  if (tieneIngles(t)) return false;
  return true;
}

// Recorta un título largo por una frontera de palabra, para no dejar una palabra a medias.
function recortarTitulo(titulo) {
  const t = String(titulo || "").trim();
  if (t.length <= 120) return t;
  const corto = t.slice(0, 120);
  const corte = corto.lastIndexOf(" ");
  return `${(corte > 80 ? corto.slice(0, corte) : corto).trimEnd()}…`;
}

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

const bloqueValido = (titulo, nota) => textoValido(titulo, { minPalabras: MIN_PALABRAS_TITULO }) && textoValido(nota, { minPalabras: MIN_PALABRAS_NOTA });

// Un reintento por bloque: el modelo vuelve a redactar ese título y esa nota, con las reglas claras.
// Si hay motivo, es el rechazo del revisor y se le pasa al redactor.
function promptReintento(h, used, recent, motivo) {
  const titulares = used.map((i) => `${i}|${recent[i].fuente}|${recent[i].titulo}`).join("\n");
  const rechazo = motivo
    ? `Un segundo modelo revisó el texto y lo rechazó por esto: ${motivo}`
    : "El texto anterior quedó mal y no se puede publicar:";
  return `Eres el editor de PerData, un medio sobre economía y bolsa del Perú. Vuelve a redactar UNA historia (un título y una nota) a partir de estos titulares (formato: índice|fuente|titular):
${titulares}

${rechazo}
título: ${String(h.titulo || "").slice(0, 200)}
nota: ${String(h.nota || "").slice(0, 400)}

Reglas obligatorias: todo en español, ni una palabra en inglés; frases completas terminadas en punto; sin caracteres especiales como |; ninguna palabra cortada a media; el título tiene al menos 4 palabras y la nota al menos 12; usa SOLO los hechos de esos titulares y no inventes cifras, causas ni consecuencias; no copies frases enteras de los titulares.

Devuelve SOLO este JSON:
{"titulo":"titular propio de máximo 12 palabras","nota":"1 a 3 frases completas"}`;
}

// Si el modelo no lo consigue, la historia conserva el titular de su primera fuente y se queda
// sin nota: publicamos el dato de la fuente, nunca un texto que no pasó el control.
function historiaDeFuente(used, recent, clasif, tema) {
  const titular = String(recent[used[0]].titulo || "").trim();
  if (!titular || !textoValido(titular, { minPalabras: 1 })) return null;
  const empresas = [...new Set(used.flatMap((i) => clasif[recent[i].id]?.empresas || []))];
  return {
    titulo: titular,
    tema,
    empresas,
    fuentes: used.map((i) => ({ titulo: recent[i].titulo, fuente: recent[i].fuente, url: recent[i].url, fecha: recent[i].fecha_iso })),
  };
}

// El modelo vuelve a redactar ese bloque una sola vez. El presupuesto es corto: si el modelo no
// responde a tiempo, la historia conserva el titular de su fuente.
async function redactarConModelo(h, used, recent, motivo) {
  const otra = await askJSON(promptReintento(h, used, recent, motivo), { budgetMs: 90 * 1000 });
  if (!otra?.out) return null;
  return { titulo: otra.out.titulo, nota: otra.out.nota };
}

// Segundo control: tras redactar cada bloque, OTRO modelo de NVIDIA NIM (distinto del redactor)
// compara el título y la nota con los titulares de sus fuentes. 30 s por modelo; si el primero no
// responde, el respaldo. Sin clave o si ambos fallan devuelve null (revisor no disponible).
const REVISOR_RESPALDO = "minimaxai/minimax-m3.1-flash";

function modelosRevisor() {
  const primero = process.env.NIM_REVIEW_MODEL || "mistralai/mistral-large-4-1t-a52b";
  return [...new Set([primero, REVISOR_RESPALDO])];
}

function promptRevision(titulo, nota, used, recent) {
  const titulares = used.map((i) => `${i}|${recent[i].fuente}|${recent[i].titulo}`).join("\n");
  return `Eres el revisor de PerData, un medio sobre economía y bolsa del Perú. Otro modelo redactó la historia de abajo a partir de los titulares de las fuentes; tú no redactas, solo compruebas.

Titulares de las fuentes (formato: índice|fuente|titular):
${titulares}

Historia redactada:
título: ${String(titulo || "").slice(0, 200)}
nota: ${String(nota || "").slice(0, 400)}

Evalúa solo estos tres puntos:
(a) Fidelidad: la nota no añade hechos, cifras, causas ni nombres que no estén en los titulares de las fuentes.
(b) El título dice lo mismo que esas fuentes.
(c) El español es correcto y completo, sin palabras en otro idioma ni frases cortadas a media.

Devuelve SOLO este JSON:
{"ok": true|false, "motivo": "si ok es false, una frase con lo que falla; si es true, cadena vacía"}`;
}

async function revisorNIM(titulo, nota, used, recent) {
  if (!process.env.NVIDIA_API_KEY) return null;
  for (const model of modelosRevisor()) {
    const res = await askNIM(model, promptRevision(titulo, nota, used, recent), { timeoutMs: 30000, maxTokens: 1000 });
    if (typeof res?.out?.ok === "boolean") return { modelo: res.model, ok: res.out.ok, motivo: String(res.out.motivo || "") };
  }
  return null;
}

export async function construirHistoria(h, recent, clasif, redactar = redactarConModelo, revisar = revisorNIM) {
  const used = (h.indices || []).map(Number).filter((i) => recent[i]);
  if (!used.length) return null;
  const src = used.map((i) => recent[i].titulo).join(" ");
  const tema = h.tema || recent[used[0]].categoria;
  const fuentes = used.map((i) => ({ titulo: recent[i].titulo, fuente: recent[i].fuente, url: recent[i].url, fecha: recent[i].fecha_iso }));
  const empresas = [...new Set(used.flatMap((i) => clasif[recent[i].id]?.empresas || []))];
  const base = { tema, empresas, fuentes };

  let titulo = recortarTitulo(h.titulo);
  let nota = grounded(String(h.nota || "").trim(), src);
  if (!bloqueValido(titulo, nota)) {
    console.error(`Bloque incompleto, se reescribe: ${titulo.slice(0, 80)}`);
    const otro = await redactar(h, used, recent);
    if (otro) {
      titulo = recortarTitulo(otro.titulo);
      nota = grounded(String(otro.nota || "").trim(), src);
    }
  }

  // Segundo control: otro modelo revisa el bloque redactado contra los titulares de sus fuentes.
  const rev = await revisar(titulo, nota, used, recent);
  if (!rev) {
    // Revisor no disponible: solo se publica si pasa textoValido() y el control de cifras.
    console.error("revisor no disponible");
    const revision = { modelo: null, ok: null, motivo: "revisor no disponible" };
    if (bloqueValido(titulo, nota)) return { titulo, nota, ...base, revision };
    console.error(`Bloque descartado, se publica el titular de la fuente: ${titulo.slice(0, 80)}`);
    const deFuente = historiaDeFuente(used, recent, clasif, tema);
    return deFuente ? { ...deFuente, revision } : null;
  }
  if (rev.ok && bloqueValido(titulo, nota)) {
    return { titulo, nota, ...base, revision: { modelo: rev.modelo, ok: true, motivo: rev.motivo } };
  }

  // El revisor rechazó el bloque: el redactor lo reescribe UNA vez recibiendo el motivo, y se
  // vuelve a pasar por el revisor y por textoValido. Si sigue fallando, titular de la fuente.
  console.error(`Revisor rechaza el bloque (${rev.motivo || "sin motivo"}), se reescribe: ${titulo.slice(0, 80)}`);
  const otro = await redactar(h, used, recent, rev.motivo);
  if (otro) {
    titulo = recortarTitulo(otro.titulo);
    nota = grounded(String(otro.nota || "").trim(), src);
  }
  const rev2 = await revisar(titulo, nota, used, recent);
  if (!rev2) console.error("revisor no disponible");
  if (rev2?.ok && bloqueValido(titulo, nota)) {
    return { titulo, nota, ...base, revision: { modelo: rev2.modelo, ok: true, motivo: rev2.motivo } };
  }

  console.error(`Bloque descartado, se publica el titular de la fuente: ${titulo.slice(0, 80)}`);
  const deFuente = historiaDeFuente(used, recent, clasif, tema);
  if (!deFuente) return null;
  return { ...deFuente, revision: { modelo: rev2?.modelo ?? rev.modelo, ok: false, motivo: rev2?.motivo || rev.motivo } };
}

async function main() {
  const feed = read("noticias.json", { noticias: [] });
  const clasif = read("noticias-clasificadas.json", { items: {} }).items || {};
  const since = Date.now() - 36 * 36e5;
  const recent = (feed.noticias || []).filter((n) => Date.parse(n.fecha_iso) >= since).slice(0, 90);
  if (recent.length < 5) {
    console.log(`Solo ${recent.length} titulares recientes: no se genera resumen`);
    process.exit(0);
  }

  const lines = recent.map((n, i) => {
    const c = clasif[n.id] || {};
    return `${i}|${n.fuente}|${n.categoria}|clasif:${c.relevancia || "-"}|${n.titulo}`;
  }).join("\n");

  const prompt = `Eres el editor de PerData, un medio sobre economía y bolsa del Perú. Tienes estos titulares de las últimas 36 horas (formato: índice|fuente|categoría|relevancia según un clasificador automático|titular):
${lines}

Elige de 3 a 6 historias importantes para alguien que sigue la economía y la bolsa del Perú: BCRP y tipo de cambio, inflación, PBI y finanzas públicas, minería y metales, energía, empresas listadas (resultados, dividendos, inversiones, emisiones, sanciones), regulación que afecte a empresas, y hechos internacionales que muevan esos mercados (guerras, EE. UU. y China, Reserva Federal, aranceles, petróleo, inteligencia artificial). Descarta sucesos policiales, consejos de consumo, horóscopos y notas de servicio («precio del dólar hoy: consulta…») salvo que traigan un dato nuevo. La relevancia del clasificador es solo una pista: decide tú.
Agrupa en una misma historia SOLO los titulares que cuenten exactamente el mismo hecho (misma entidad y mismo acontecimiento). Dos hechos distintos van en historias distintas aunque sean del mismo sector; si no caben, elige el más importante.
Para cada historia escribe una nota PROPIA de 1 a 3 frases en español claro, usando SOLO los hechos de esos titulares (no inventes cifras, causas ni consecuencias; no copies frases enteras de los titulares).

Escribe en español y solo en español: ni una palabra en inglés. Cada frase va terminada en punto y ninguna palabra queda cortada a media. Sin barras, sin etiquetas y sin caracteres rotos. El título tiene al menos 4 palabras y la nota al menos 12.

Devuelve SOLO este JSON:
{"historias":[{"titulo":"titular propio de máximo 12 palabras","nota":"1 a 3 frases","indices":[números de los titulares usados],"tema":"una de: Dólar y BCRP, Economía y fiscal, Bolsa y empresas, Minería y metales, Energía, Mundo"}]}`;

  const res = await askJSON(prompt, { budgetMs: 6 * 60 * 1000 });
  if (!res) {
    console.error("Sin resumen: ningún modelo respondió");
    process.exit(0); // keep the previous file; the watchdog checks its age
  }

  const stories = [];
  for (const h of res.out.historias || []) {
    const story = await construirHistoria(h, recent, clasif);
    if (story) stories.push(story);
  }

  const summary = {
    actualizado: new Date().toISOString(),
    modelo: res.model,
    nota: "Notas redactadas por PerData Engine con ayuda de IA a partir de titulares públicos",
    historias: stories.slice(0, 6),
  };
  fs.writeFileSync(path.join(ROOT, "data", "noticias-resumen.json"), JSON.stringify(summary, null, 1) + "\n");
  updateArchive(summary);
  console.log(`Historias: ${summary.historias.length} (${res.model})`);
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) await main();
