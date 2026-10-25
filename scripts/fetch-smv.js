// SMV "hechos de importancia" for the company pages.
// Reads the public daily page of the SMV (SIMV), keeps only facts (date, type, subject, link to the
// official document) for the issuers in data/empresas.json, and accumulates the last 10 per issuer
// in data/smv-hechos.json. One request to the landing page and one to the daily page, identified
// User-Agent, no login, nothing copied but the subject line. Runs on GitHub Actions twice a day.
// Usage: node scripts/fetch-smv.js [--html saved.html]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "data", "smv-hechos.json");
const UA = "PerDataBot/1.0 (+https://perdata.site)";
const SIMV = "https://www.smv.gob.pe/simv/";
const KEEP = 10;

const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
// "COMPAÑIA DE MINAS BUENAVENTURA S.A.A." -> "COMPANIA DE MINAS BUENAVENTURA"
const key = (t) => fold(t)
  .replace(/\(.*?\)/g, " ")
  .replace(/\b(S\.?\s?A\.?\s?A\.?|S\.?\s?A\.?\s?C\.?|S\.?\s?A\.?|LTD\.?|INC\.?|CORP\.?)(?=\s|$|-)/g, " ")
  .replace(/[^A-Z0-9 ]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

export function parseDay(html) {
  const facts = [];
  // Each issuer: <span class="titulo-empresa-azul">NAME</span> followed by its cards
  const blocks = html.split('class="titulo-empresa-azul">').slice(1);
  for (const block of blocks) {
    const emisor = text(block.slice(0, block.indexOf("<")));
    for (const card of block.split("card card-custom").slice(1)) {
      const exp = card.match(/EXP\.\s*(\d+)\s*DEL\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2})?/);
      const tipo = card.match(/class="card-title">([\s\S]*?)<\/h5>/);
      const titulo = card.match(/class="card-text">([\s\S]*?)<\/p>/);
      const doc = card.match(/href="(https:\/\/www\.smv\.gob\.pe\/ConsultasP8\/documento\.aspx\?vidDoc=\{[0-9A-F-]+\})"/i);
      if (!exp || !doc) continue;
      facts.push({
        emisor,
        expediente: exp[1],
        fecha: `${exp[4]}-${exp[3]}-${exp[2]}${exp[5] ? " " + exp[5] : ""}`,
        tipo: tipo ? text(tipo[1]).replace(/^\d+\.\s*/, "") : "",
        titulo: titulo ? text(titulo[1]) : "",
        url_oficial: doc[1],
        fuente: "SMV",
      });
    }
  }
  return facts;
}

async function main() {
  const args = process.argv.slice(2);
  const hi = args.indexOf("--html");
  let html;
  if (hi > -1) {
    html = fs.readFileSync(args[hi + 1], "utf8");
  } else {
    const landing = await get(SIMV);
    const link = landing.match(/Frm_hechosdeImportanciaDia\?data=[A-F0-9]+/i);
    if (!link) throw new Error("No se encontró el enlace de «Hechos de importancia del día» en la portada del SIMV (¿cambió la web?)");
    await new Promise((r) => setTimeout(r, 3000));
    html = await get(SIMV + link[0]);
  }

  const facts = parseDay(html);
  if (!facts.length && !/titulo-empresa-azul/.test(html)) {
    throw new Error("La página del día no tiene el formato esperado (¿cambió la web de la SMV?)");
  }

  // Issuers we list: match by normalized company name
  const { emisores } = JSON.parse(fs.readFileSync(path.join(root, "data", "empresas.json"), "utf8"));
  const byKey = new Map();
  for (const e of emisores) {
    const primary = (e.valores.find((v) => v.yahoo) || e.valores[0] || {}).nemonico;
    if (primary) byKey.set(key(e.razonSocial), primary);
  }

  const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { hechos: {} };
  let added = 0;
  const unmatched = new Set();
  for (const f of facts) {
    const nemo = byKey.get(key(f.emisor));
    if (!nemo) { unmatched.add(f.emisor); continue; }
    const list = store.hechos[nemo] || [];
    if (list.some((x) => x.expediente === f.expediente && x.url_oficial === f.url_oficial)) continue;
    const { emisor, ...rest } = f;
    list.push(rest);
    list.sort((a, b) => b.fecha.localeCompare(a.fecha));
    store.hechos[nemo] = list.slice(0, KEEP);
    added++;
  }
  store.actualizado = new Date().toISOString();
  store.fuente = "Superintendencia del Mercado de Valores (SMV), https://www.smv.gob.pe/simv/";
  fs.writeFileSync(OUT, JSON.stringify(store, null, 1) + "\n");

  console.log(`Hechos del día: ${facts.length} · nuevos para empresas listadas: ${added} · emisores sin ficha: ${unmatched.size}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
