// PerData daily newsletter (Mon-Sat 06:00 Lima, GitHub Actions).
// 1. Gathers facts: BCRP/EIA daily prices, SMV material facts of the last day, the 1-month
//    USD/PEN projection and news headlines from allowed sources (title + link only).
// 2. NVIDIA NIM writes short plain-Spanish blocks using ONLY those facts; any sentence with a
//    number that is not in the facts is dropped, and if NIM fails the email goes out without it.
// 3. Renders an editorial HTML email and sends it with Resend. Two versions:
//    - Gratis (Mon-Sat 06:00 Lima): the dollar close with a PNG chart (30 closes + tomorrow's
//      fan), a one-row range table (central p25-p75 and wide p10-p90), the 3 best digest
//      stories already redacted (double-checked by news-digest.js), the «Qué podría presionar
//      al dólar» reading from scripts/dolar-lectura.js (lecturaDolar), a transparency note and a
//      brief invitation to the Boletín plan (US$ 1.99/month, 7-day trial with card).
//    - Pagado (Boletín y Pro): the same dollar block with the week and month rows added to the
//      table and the chart fan, the 4 best digest stories, a 4-row markets table (copper, gold,
//      WTI, Brent), the 3 latest SMV facts, and «Tus empresas» (≤15 from the seguimiento table):
//      price, variation, a PNG chart (60 closes + 1-month fan), one projection line, up to 2
//      SMV/news lines and the directional points of the company reading from
//      scripts/empresa-lectura.js (lecturasEmpresas), plus a «Ver ficha» link. Footer with the
//      unsubscribe / preferences links ({{BAJA}}, {{EMPRESAS}}).
//    Charts are PNGs built in pure JS (scripts/lib/png.js + scripts/lib/grafico-correo.js), no
//    dependencies. Renderers take an `img` param ({ base } or null): previews write the PNGs
//    next to the HTML (<ruta-sin-ext>-img/) and pass that relative folder as base; the real
//    send passes BOLETIN_IMG_BASE, or null when it is not set (the email then has no <img>).
//    Without BOLETIN_IMG_BASE but with BOLETIN_IMG_CMD the PNGs of the day are published first
//    (scripts/publicar-imagenes-correo.sh, through scripts/lib/imagenes-correo.js) and the email
//    points to them; if that fails the email goes out without images, never breaking the send.
//    Fallbacks: if lecturaDolar/lecturasEmpresas fail or take too long (> 90 s total) the email
//    still goes out with the deterministic version or without that section, never crashing the
//    send. The free user never receives paid sections.
// Env: RESEND_API_KEY, BOLETIN_TO (comma list), SUPABASE_URL + SUPABASE_SERVICE_KEY (subscribers),
//      NVIDIA_API_KEY and GEMINI_API_KEY (optional), NIM_MODEL (optional), BOLETIN_IMG_BASE (optional),
//      BOLETIN_IMG_CMD + BOLETIN_IMG_DIR (optional, publish the PNGs before sending)
// Usage: node scripts/boletin.js [--dry-run] (writes the preview, sends nothing)
// Preview: PREVIEW_PLAN=gratis|boletin (default boletin), PREVIEW_EMPRESAS="ALICORC1" (sample
//          personal section), BOLETIN_PREVIEW_PATH=path/to/preview.html
import fs from "fs";
import path from "path";
import { smvRows } from "../api/_lib/smv.js";
import { graficoRango } from "./lib/grafico-correo.js";
import { rangoEmpresaCorreo, lineaRangoCorreo } from "./lib/rango-empresa-correo.js";
import { mencionaEmpresa } from "./empresa-mencion.js";
import { formatCierreFecha } from "../api/diario.js";
import { lecturaDolar, hechosDolar } from "./dolar-lectura.js";
import { lecturasEmpresas } from "./empresa-lectura.js";
import { publicarImagenes } from "./lib/imagenes-correo.js";

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatSMVFecha(fechaStr) {
  // Convert "2026-11-09 14:36" -> "9 nov, 14:36"
  const dt = new Date(`${String(fechaStr).slice(0, 10)}T${String(fechaStr).slice(11, 16)}:00Z`);
  if (isNaN(dt.getTime())) return String(fechaStr);
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  const hour = String(dt.getUTCHours()).padStart(2, "0");
  const min = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hour}:${min}`;
}

const DRY = process.argv.includes("--dry-run");
const PREVIEW = Boolean(process.env.PREVIEW_EMPRESAS);
const PREVIEW_PLAN = (process.env.PREVIEW_PLAN || "boletin").toLowerCase() === "gratis" ? "gratis" : "boletin";

const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
const MONO_F = "'IBM Plex Mono',monospace";
const UI_F = "'Libre Franklin',Arial,sans-serif";
const SERIF_F = "'Source Serif 4',Georgia,serif";
const NUM = ' style="font-variant-numeric:tabular-nums"';

// Structural tags (table/block) that cause adjacent space removal.
const STRUCTURAL_TAGS = new Set([
  "table", "/table", "tr", "/tr", "td", "/td", "tbody", "/tbody",
  "div", "/div", "p", "/p", "ul", "/ul", "li", "/li",
  "html", "/html", "head", "/head", "body", "/body"
]);
// Inline tags where spaces are preserved.
const INLINE_TAGS = new Set([
  "span", "/span", "a", "/a", "b", "/b", "strong", "/strong", "em", "/em"
]);

function tagBaseName(tag) {
  // "<td ...>" -> "td", "</td>" -> "/td"
  const inner = tag.slice(1, -1).trim();
  return inner.split(/\s/)[0].toLowerCase();
}

function isStructural(tag) {
  return STRUCTURAL_TAGS.has(tagBaseName(tag));
}
function isInline(tag) {
  return INLINE_TAGS.has(tagBaseName(tag));
}
function isClosing(tag) {
  return tagBaseName(tag).startsWith("/");
}

// Collapse whitespace in text nodes to a single space.
// Remove spaces adjacent to structural tags (before structural closing, after structural opening).
// Preserve spaces between inline tags.
function compactar(html) {
  // First pass: collapse whitespace in text, trim around structural tags.
  let out = "";
  let i = 0;
  let lastTag = null;

  while (i < html.length) {
    if (html[i] === "<") {
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) {
        out += html.slice(i);
        break;
      }
      const tag = html.slice(i, tagEnd + 1);
      out += tag;
      lastTag = { full: tag, structural: isStructural(tag), inline: isInline(tag), closing: isClosing(tag) };
      i = tagEnd + 1;
    } else {
      // Text content
      let textStart = i;
      while (i < html.length && html[i] !== "<") i++;
      let text = html.slice(textStart, i).replace(/\s+/g, " ");

      // Remove leading space if previous tag was structural opening
      if (lastTag && lastTag.structural && !lastTag.closing && text.startsWith(" ")) {
        text = text.slice(1);
      }

      // Remove trailing space if next tag is structural closing
      if (i < html.length && html[i] === "<") {
        const tagEnd = html.indexOf(">", i);
        if (tagEnd !== -1) {
          const nextTag = html.slice(i, tagEnd + 1);
          if (isStructural(nextTag) && isClosing(nextTag) && text.endsWith(" ")) {
            text = text.slice(0, -1);
          }
        }
      }

      out += text;
    }
  }

  // Second pass: handle spaces between adjacent tags (no text between them).
  return out.replace(/(<[^>]+>)\s+(<[^>]+>)/g, (match, before, after) => {
    const beforeStructural = isStructural(before);
    const afterStructural = isStructural(after);
    const beforeInline = isInline(before);
    const afterInline = isInline(after);
    // Remove space if either side is structural, unless both are inline.
    if ((beforeStructural || afterStructural) && !(beforeInline && afterInline)) {
      return before + after;
    }
    return match;
  });
}

// ---------------------------------------------------------------------------
// Helpers del rediseño v9: gráficos PNG, tabla de rangos y lecturas unificadas.
// ---------------------------------------------------------------------------
const DIAS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Carpeta (relativa al HTML) donde se escriben los PNG de la vista previa.
const carpetaImagen = (rutaHtml) => {
  const base = String(rutaHtml || "").replace(/\.html?$/i, "");
  return base.split(/[\\/]/).pop() + "-img";
};

// Etiqueta <img>: sin imágenes cuando no hay dónde alojarlas (envío real) y
// sin referenciar ningún archivo que no se haya publicado.
const imgTag = (img, archivo, ancho, alto, alt) => {
  const base = img?.base;
  if (!base) return "";
  if (img.archivos && !img.archivos.has(archivo)) return "";
  return `<img src="${esc(`${base}/${archivo}`)}" width="${ancho}" height="${alto}" alt="${esc(alt)}" style="display:block;width:100%;max-width:${ancho}px;height:auto;border:0">`;
};

const escribirImagen = (dir, archivo, bytes) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, archivo), bytes);
};

// "2026-11-10" -> "10 nov"
const fechaCorta = (fecha) => {
  const d = new Date(`${String(fecha || "").slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return String(fecha || "");
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
};

// "2026-11-10" -> "mar 10 nov"
const diaCorta = (fecha) => {
  const d = new Date(`${String(fecha || "").slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return String(fecha || "");
  return `${DIAS_ES[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
};

// Etiqueta del primer horizonte: «Hoy, mar 10 nov» / «Mañana, mar 11 nov».
const etiquetaHoy = (fecha, hoy) => {
  const d = diaCorta(fecha);
  const a = new Date(`${String(fecha || "").slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${String(hoy || "").slice(0, 10)}T12:00:00Z`);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return d;
  const diff = Math.round((a - b) / 864e5);
  if (diff === 0) return `Hoy, ${d}`;
  if (diff === 1) return `Mañana, ${d}`;
  return d.charAt(0).toUpperCase() + d.slice(1);
};

// "3.423 – 3.442" (guion largo, cifras tabulares)
const rangoTexto = (a, b, dec = 3) => (a == null || b == null) ? "—" : `${fmt(a, dec)} – ${fmt(b, dec)}`;

// Días hábiles entre dos fechas (desde exclusive, hasta inclusive).
function diasHabilesHasta(desde, hasta) {
  const d0 = new Date(`${String(desde || "").slice(0, 10)}T12:00:00Z`);
  const d1 = new Date(`${String(hasta || "").slice(0, 10)}T12:00:00Z`);
  if (isNaN(d0.getTime()) || isNaN(d1.getTime())) return 1;
  const paso = d1 > d0 ? 1 : -1;
  let n = 0;
  const cur = new Date(d0.getTime());
  while (cur.getTime() !== d1.getTime()) {
    cur.setUTCDate(cur.getUTCDate() + paso);
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6) n += paso;
  }
  return Math.max(1, n);
}

// Primera frase de un texto largo (para el resumen de cada historia).
const primeraFrase = (t) => {
  const x = String(t || "").trim();
  const m = x.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : x).trim();
};

// Recorta a N caracteres con «…».
const recortar = (t, max) => {
  const x = String(t || "").trim();
  return x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x;
};

// Normaliza una serie de cierres a [{fecha, valor}].
const cierresDeSerie = (lista, campoFecha = "fecha", campoValor = "valor") => (Array.isArray(lista) ? lista : [])
  .map((p) => ({ fecha: String(p?.[campoFecha] ?? "").slice(0, 10), valor: Number(p?.[campoValor]) }))
  .filter((p) => p.fecha && Number.isFinite(p.valor));

// Filas de la tabla de rangos del dólar (central p25–p75, amplio p10–p90).
function filasRangosDolar(f) {
  const filas = [];
  const manana = f.daily?.manana;
  if (manana) filas.push({
    clave: "manana", etiqueta: etiquetaHoy(manana.fecha_objetivo, f.todayLima),
    central: [manana.p25, manana.p75], amplio: [manana.p10, manana.p90],
  });
  const semana = f.daily?.semana;
  if (semana) filas.push({
    clave: "semana", etiqueta: `Semana, ${diaCorta(semana.fecha_objetivo)}`,
    central: [semana.p25, semana.p75], amplio: [semana.p10, semana.p90],
  });
  const mes = f.forecast;
  if (mes?.horizon) filas.push({
    clave: "mes", etiqueta: `Mes, ${fechaCorta(mes.horizon)}`,
    central: [mes.p25, mes.p75], amplio: [mes.p10, mes.p90],
  });
  return filas;
}

// Tabla compacta de rangos: cabe a 390 px (letra 13 px, cifras tabulares).
function tablaRangos(f, soloHoy = false) {
  const filas = filasRangosDolar(f);
  const lista = soloHoy ? filas.slice(0, 1) : filas;
  if (!lista.length) return "";
  const celda = (txt, extra = "") => `<td style="padding:6px 0;font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:13px;${extra}">${txt}</td>`;
  const cuerpo = lista.map((r) => `<tr>
      <td style="padding:6px 8px 6px 0;font-family:${UI_F};font-size:13px;color:${C.ink};white-space:nowrap">${esc(r.etiqueta)}</td>
      ${celda(esc(rangoTexto(r.central[0], r.central[1], 3)), `color:${C.ink};text-align:right;white-space:nowrap`)}
      ${celda(esc(rangoTexto(r.amplio[0], r.amplio[1], 3)), `color:${C.soft};text-align:right;white-space:nowrap`)}
    </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-variant-numeric:tabular-nums">
    <tr>
      <td style="padding:0 0 4px 0;font-family:${UI_F};font-size:11px;color:${C.soft}"></td>
      <td colspan="2" align="right" style="padding:0 0 4px 0;font-family:${UI_F};font-size:11px;color:${C.soft}">S/</td>
    </tr>
    <tr>
      <td style="padding:0 8px 4px 0;font-family:${UI_F};font-size:12px;color:${C.soft}"></td>
      <td style="padding:0 8px 4px 0;font-family:${UI_F};font-size:12px;font-weight:600;color:${C.ink};text-align:right">Rango central (1 de cada 2 veces)</td>
      <td style="padding:0 0 4px 0;font-family:${UI_F};font-size:12px;font-weight:600;color:${C.soft};text-align:right">Rango amplio (8 de cada 10 veces)</td>
    </tr>
    ${cuerpo}
  </table>`;
}

// Bloque completo del dólar: cabecera + gráfico + tabla + nota + lectura.
function bloqueTablaRangos(f, soloHoy = false) {
  const tabla = tablaRangos(f, soloHoy);
  if (!tabla) return "";
  return `<tr><td style="padding:12px 0 4px">
    ${tabla}
    <div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:8px">El rango es estadístico: no dice hacia dónde irá el dólar.</div>
  </td></tr>`;
}

// Lectura unificada del dólar: 1 punto al alza, 1 a la baja y 2 de contexto.
function puntosLecturaDolar(lectura, soloManana = false) {
  const horizontes = lectura?.horizontes || lectura || {};
  const claves = soloManana ? ["manana"] : ["manana", "semana", "mes"];
  const vistos = new Set();
  const toma = (arr) => (Array.isArray(arr) ? arr : []).filter((p) => p && p.texto && !vistos.has(p.texto) && vistos.add(p.texto));
  const alAlza = [];
  const aLaBaja = [];
  const contexto = [];
  for (const k of claves) {
    const h = horizontes[k];
    if (!h) continue;
    for (const p of toma(h.al_alza)) if (alAlza.length < 1) alAlza.push(p);
    for (const p of toma(h.a_la_baja)) if (aLaBaja.length < 1) aLaBaja.push(p);
    for (const p of toma(h.contexto)) if (contexto.length < 2) contexto.push(p);
  }
  return { alAlza, aLaBaja, contexto };
}

// Bloque «Qué podría presionar al dólar» (una sola vez en el correo).
function bloquePresionDolar(lectura, soloManana = false) {
  const { alAlza, aLaBaja, contexto } = puntosLecturaDolar(lectura, soloManana);
  if (!alAlza.length && !aLaBaja.length && !contexto.length) return "";
  const punto = (p, tipo) => `<div style="margin:0 0 6px;padding-left:12px;border-left:2px solid ${tipo === "al_alza" ? C.pos : tipo === "a_la_baja" ? C.neg : C.soft};opacity:${tipo === "contexto" ? "0.7" : "1"};font-family:${SERIF_F};font-size:15px;line-height:1.5;color:${C.ink}">${esc(p.texto)}</div>`;
  const etiqueta = (txt) => `<div style="font-family:${UI_F};font-size:12px;font-weight:600;margin:10px 0 4px">${txt}</div>`;
  const partes = [];
  if (alAlza.length) partes.push(etiqueta("Podría presionar al dólar al alza"), alAlza.map((p) => punto(p, "al_alza")).join(""));
  if (aLaBaja.length) partes.push(etiqueta("Podría presionar al dólar a la baja"), aLaBaja.map((p) => punto(p, "a_la_baja")).join(""));
  if (contexto.length) partes.push(etiqueta("Contexto"), contexto.map((p) => punto(p, "contexto")).join(""));
  return `<tr><td style="padding:12px 0 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${UI_F};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">Qué podría presionar al dólar</td></tr></table>
    ${partes.join("")}
  </td></tr>`;
}

// Gráfico del dólar: 30 cierres + abanico (hoy/mañana, semana y mes; en el
// gratis solo el de mañana, para no filtrar los rangos del plan de pago).
function pngDolar(f, soloManana = false) {
  const serie = cierresDeSerie((f.penSerie30 || []).map((p) => ({ fecha: p[0], valor: p[1] })));
  const fuente = soloManana ? (f.bandasDolar || []).filter((b) => b.clave === "manana") : (f.bandasDolar || []);
  const bandas = fuente.map((b) => ({ pasos: b.pasos, p10: b.p10, p25: b.p25, p75: b.p75, p90: b.p90 }));
  return graficoRango({ serie, bandas, ancho: 560, alto: 150 });
}

// Gráfico de una empresa: 60 cierres + abanico a un mes.
function pngEmpresa(c) {
  const serie = cierresDeSerie(c.serie || []);
  const fc = c.forecast;
  const bandas = [];
  if (fc && serie.length) {
    const ultimo = serie[serie.length - 1];
    bandas.push({
      pasos: diasHabilesHasta(ultimo.fecha, fc.date),
      p10: fc.p10, p25: fc.p25, p75: fc.p75, p90: fc.p90,
    });
  }
  return graficoRango({ serie, bandas, ancho: 560, alto: 110 });
}

const SITE = "https://perdata.site";
const RAW = "https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data";
const FROM = process.env.BOLETIN_FROM || "PerData <boletin@perdata.site>";
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
const KEEP = new Set(["BBVA", "AFP", "BVL", "FTE", "IDE", "SEAL", "AIB", "XP", "OH!"]);
const SMALL = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
const prettyName = (raw) => String(raw || "").trim().split(/\s+/).map((w, i) => {
  if (KEEP.has(w.toUpperCase()) || /^\(?([A-Za-z]\.){2,}[-)]*$/.test(w)) return w.toUpperCase();
  const lw = w.toLowerCase();
  return i > 0 && SMALL.has(lw) ? lw : lw.replace(/(^|[-(«"])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}).join(" ");
const sentence = (t) => { const x = String(t || "").trim(); return x && x === x.toUpperCase() ? x.charAt(0) + x.slice(1).toLowerCase() : x; };
const flagHtml = (C) => `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-left:8px;border:1px solid ${C.ink}"><tr><td width="5" height="12" style="background:${C.peru}"></td><td width="5" style="background:#ffffff"></td><td width="5" style="background:${C.peru}"></td></tr></table>`;

// ---------------------------------------------------------------------------
// Local snapshots of the public data (data/). The preview must agree with
// data/ even when the network or the production API is unavailable, so the
// main facts, the company state and the daily ranges are read from the repo
// first and the API endpoints are only a fallback.
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const readLocal = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch (e) { return fallback; }
};
// Same rule as the digest: only stories with an approved second-model review are
// «best written». A story without a note, or rejected, is never shown in the email.
export const historiaPublicable = (h) => Boolean(h?.nota && h?.revision?.ok !== false);
const filtrarHistorias = (list, n) => (Array.isArray(list) ? list : [])
  .filter((h) => h && h.titulo && historiaPublicable(h))
  .slice(0, n);

async function facts() {
  const bcrp = readLocal("data/official/bcrp-daily.json", null) || await getJson(`${RAW}/official/bcrp-daily.json`).catch(() => ({ series: {} }));
  const ctx = readLocal("data/official/bcrp-contexto.json", null) || await getJson(`${RAW}/official/bcrp-contexto.json`).catch(() => ({ series: {} }));
  const eia = await getJson(`${RAW}/official/eia-oil.json`).catch(() => readLocal("data/official/eia-oil.json", null));
  const smv = readLocal("data/smv-hechos.json", null) || await getJson(`${RAW}/smv-hechos.json`).catch(() => ({ hechos: {} }));
  const news = await getJson(`${SITE}/api/news`).catch(() => readLocal("data/news-cache.json", { news: [] }));
  const fx = await getJson(`${SITE}/api/forecast?symbol=PEN%3DX&horizon=1`).catch(() => null);
  const empresas = readLocal("data/empresas.json", null) || await getJson(`${RAW}/empresas.json`).catch(() => ({ emisores: [] }));
  const digest = readLocal("data/noticias-resumen.json", null) || await getJson(`${RAW}/noticias-resumen.json`).catch(() => null);
  const dailyRaw = readLocal("data/daily-forecasts.json", null) || await getJson(`${RAW}/daily-forecasts.json`).catch(() => null);
  const nameOf = {};
  for (const e of empresas.emisores || []) for (const v of e.valores) nameOf[v.nemonico] = e.razonSocial;

  const markets = [];
  const add = (name, unit, points, dec = 2) => {
    if (!points || points.length < 2) return;
    const [d1, v1] = points[points.length - 1];
    const [, v0] = points[points.length - 2];
    markets.push({ name, unit, date: d1, value: v1, change: pct(v1, v0), dec });
  };
  const s = bcrp.series || {};
  add("Dólar (USD/PEN)", "S/", s.PEN?.serie, 3);
  add("Cobre", "US$/lb", s.COBRE?.serie);
  add("Oro", "US$/oz", s.ORO?.serie, 0);
  add("Plata", "US$/oz", s.PLATA?.serie);
  add("Zinc", "US$/lb", s.ZINC?.serie);
  add("Petróleo WTI", "US$/barril", s.WTI?.serie);
  if (eia) add("Petróleo Brent", "US$/barril", eia.series.BRENT);

  const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const smvFacts = [];
  for (const [nemo, list] of Object.entries(smv.hechos || {})) {
    for (const h of list) if (h.fecha >= since) smvFacts.push({ nemo, empresa: prettyName(nameOf[nemo] || nemo), ...h, titulo: sentence(h.titulo), tipo: sentence(h.tipo) });
  }
  smvFacts.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const seenFacts = new Set();
  const uniqueFacts = smvFacts.filter((h) => {
    const k = `${h.empresa} ${String(h.fecha).slice(0, 10)} ${String(h.titulo).toLowerCase()}`;
    return seenFacts.has(k) ? false : seenFacts.add(k);
  });

  const headlines = (news.news || [])
    .filter((n) => SOURCES.some((src) => (n.source || "").toLowerCase().includes(src.toLowerCase())))
    .slice(0, 8)
    .map((n) => ({ title: n.title, source: n.source, url: n.url, tema: n.impact }));

  // Month range: the public /api/forecast endpoint is the single source used by the modules'
  // demos; when the network fails the month horizon already comes with a deterministic reading.
  const forecast = fx && fx.quantiles ? {
    horizon: fx.horizonDate, p50: fx.predictedPrice, p10: fx.quantiles.p10 ?? fx.quantiles.P10,
    p25: fx.quantiles.p25 ?? fx.quantiles.P25, p75: fx.quantiles.p75 ?? fx.quantiles.P75,
    p90: fx.quantiles.p90 ?? fx.quantiles.P90, probRise: fx.probabilityOfRise, model: fx.architecture?.split(" (")[0],
  } : null;

  const dailyData = dailyRaw;
  const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const penDaily = dailyData?.simbolos?.PEN;
  const dailyVigente = Boolean(penDaily?.manana?.fecha_objetivo && penDaily.manana.fecha_objetivo >= todayLima);
  const penSerie = s.PEN?.serie || [];
  const penUltimo = penSerie.length ? { fecha: penSerie[penSerie.length - 1][0], valor: penSerie[penSerie.length - 1][1] } : null;
  const fuenteCierre = penDaily?.fuente_ultimo_cierre || "BCRP";
  const cierre = penDaily?.ultimo_cierre != null
    ? { valor: penDaily.ultimo_cierre, fecha: penDaily.fecha_ultimo_cierre, fuente: fuenteCierre }
    : (penUltimo ? { ...penUltimo, fuente: fuenteCierre } : null);

  const fresh = digest && Date.now() - Date.parse(digest.actualizado) < 30 * 36e5;
  // Paid: every publishable story of the digest (as today, with the double
  // control already done by news-digest.js). Free: the best written 3.
  const historiasTodas = fresh ? filtrarHistorias(digest.historias) : [];
  const historiasTop3 = historiasTodas.slice(0, 3);
  const stories = historiasTodas.slice(0, 5);
  const used = new Set(stories.flatMap((h) => (h.fuentes || []).map((x) => x.url)));

  // Últimos 30 cierres del dólar y abanicos (hoy/mañana, semana y mes) para el gráfico.
  const penSerie30 = (s.PEN?.serie || []).slice(-30);
  const basePasos = cierre?.fecha || todayLima;
  const bandasDolar = [];
  if (penDaily?.manana) bandasDolar.push({
    clave: "manana", pasos: diasHabilesHasta(basePasos, penDaily.manana.fecha_objetivo),
    p10: penDaily.manana.p10, p25: penDaily.manana.p25, p75: penDaily.manana.p75, p90: penDaily.manana.p90,
  });
  if (penDaily?.semana) bandasDolar.push({
    clave: "semana", pasos: diasHabilesHasta(basePasos, penDaily.semana.fecha_objetivo),
    p10: penDaily.semana.p10, p25: penDaily.semana.p25, p75: penDaily.semana.p75, p90: penDaily.semana.p90,
  });
  if (forecast?.horizon) bandasDolar.push({
    clave: "mes", pasos: diasHabilesHasta(basePasos, forecast.horizon),
    p10: forecast.p10, p25: forecast.p25, p75: forecast.p75, p90: forecast.p90,
  });

  return { markets, smvFacts: uniqueFacts.slice(0, 8), headlines: headlines.filter((h) => !used.has(h.url)).slice(0, 6), forecast, stories, historiasTodas, historiasTop3, daily: penDaily, dailyVigente, cierre, todayLima, bcrp, ctx, penSerie30, bandasDolar };
}

// Headline from the data only: no model, no claims about trends or records
function entradillaDeterminista(f) {
  const partes = [];
  if (f.cierre?.valor != null) partes.push(`El dólar cerró en S/ ${fmt(f.cierre.valor, 3)}`);
  const cobre = (f.markets || []).find((m) => /cobre/i.test(m.name));
  if (cobre) partes.push(`el cobre en US$ ${fmt(cobre.value, 2)} la libra`);
  return partes.length ? `${partes.join(" y ")}.` : "";
}

function grounded(text, factsText) {
  const known = new Set((factsText.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));
  // Claims about records or periods ("mayor nivel del año") are not in the facts we pass: drop them
  const UNSUPPORTED = /\b(mayor|menor|más alto|más bajo|máximo|mínimo|récord|record|histórico|histórica|en lo que va|en el año|del año|desde 20\d\d|nivel más)\b/i;
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    if (UNSUPPORTED.test(sentence)) return false;
    const nums = (sentence.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."));
    return nums.every((n) => known.has(n) || known.has(String(Number(n))) || Number(n) < 32);
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
  const deadline = Date.now() + 6 * 60 * 1000;
  for (const model of await availableModels(process.env.NVIDIA_API_KEY)) {
    const left = deadline - Date.now();
    if (left < 30000) break;
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 8000, thinking: { type: "disabled" },
          messages: [{ role: "system", content: "Respondes solo con el JSON pedido, sin análisis previo ni texto adicional." }, { role: "user", content: prompt }],
          chat_template_kwargs: { thinking: false, enable_thinking: false } }),
        signal: AbortSignal.timeout(Math.min(150000, left)),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const msg = (await r.json()).choices?.[0]?.message || {};
      const text = String(msg.content || msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
      const start = text.lastIndexOf("{\"entradilla\"") > -1 ? text.lastIndexOf("{\"entradilla\"") : text.indexOf("{");
      if (start < 0) throw new Error(`respuesta sin JSON: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      const out = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
      for (const k of Object.keys(out)) out[k] = grounded(String(out[k] || ""), factsText);
      out.entradilla = ""; // the headline is built from the data (see entradillaDeterminista)
      console.log(`Interpretación: ${model}`);
      return out;
    } catch (e) {
      console.error(`NIM ${model}: ${e.message}`);
    }
  }
  if (process.env.GEMINI_API_KEY) {
    const key = process.env.GEMINI_API_KEY;
    let names = [];
    try {
      const list = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(15000) })).json();
      names = (list.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name)
        .filter((n) => /flash/i.test(n) && !/image|tts|audio|live|embedding|thinking/i.test(n));
    } catch (e) {}
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

// ---------------------------------------------------------------------------
// Dollar reading (lecturaDolar). Builds `datos` exactly like
// `node scripts/dolar-lectura.js --demo`: series and contexto from data/ and
// the month range from the public endpoint (facts()). On failure or timeout
// (> 90 s for both modules) the email goes out without the section, never
// crashing the send.
// ---------------------------------------------------------------------------
const serieOk = (serie) => Array.isArray(serie) && serie.length >= 1 && serie.every((p) => Array.isArray(p) && p[0] && Number.isFinite(Number(p[1])));
const varPct = (actual, anterior) => (Number(actual) / Number(anterior) - 1) * 100;
const round2 = (v) => Math.round(Number(v) * 100) / 100;

function armaDatosDolar(f, clasif, newsById) {
  const series = {};
  for (const k of ["PEN", "COBRE", "ORO", "WTI"]) if (f.bcrp?.series?.[k]?.serie) series[k] = { serie: f.bcrp.series[k].serie };
  const contexto = {};
  for (const k of ["INTERVENCION_BCRP", "TASA_REFERENCIA", "RIN"]) if (f.ctx?.series?.[k]?.serie) contexto[k] = { serie: f.ctx.series[k].serie };
  const pen = f.daily || {};
  const rangos = {
    manana: pen.manana ? { p10: pen.manana.p10, p50: pen.manana.p50, p90: pen.manana.p90, fecha: pen.manana.fecha_objetivo } : null,
    semana: pen.semana ? { p10: pen.semana.p10, p50: pen.semana.p50, p90: pen.semana.p90, fecha: pen.semana.fecha_objetivo } : null,
    mes: f.forecast ? { p10: f.forecast.p10, p50: f.forecast.p50, p90: f.forecast.p90, fecha: f.forecast.horizon } : null,
  };
  const since = Date.now() - 36 * 36e5;
  const TEMAS = new Set(["Dólar y BCRP", "Minería y metales", "Economía y fiscal"]);
  const noticias = Object.entries(clasif || {})
    .filter(([, v]) => TEMAS.has(v.tema))
    .map(([id]) => newsById?.[id])
    .filter((n) => n && Date.parse(n.fecha_iso) >= since)
    .sort((a, b) => String(b.fecha_iso).localeCompare(String(a.fecha_iso)))
    .slice(0, 12)
    .map((n) => ({ titulo: n.titulo, fuente: n.fuente, fecha_iso: n.fecha_iso }));
  return { series, contexto, rangos, noticias };
}

async function lecturaDolarSegura(f, clasif, newsById, deadline) {
  try {
    const datos = armaDatosDolar(f, clasif, newsById);
    const hechos = hechosDolar(datos);
    const left = deadline - Date.now();
    if (left <= 5000) return { dolar: null, determinista: true, fuente: "sin tiempo", hechos };
    let out = null;
    try {
      out = await Promise.race([
        lecturaDolar(datos),
        new Promise((_, rej) => { const t = setTimeout(() => rej(new Error("tiempo agotado")), Math.max(5000, left)); t.unref?.(); }),
      ]);
    } catch (e) {
      console.log(`Lectura del dólar no disponible: ${e.message} (se envía sin la sección)`);
      return { dolar: null, determinista: true, fuente: "sin lectura", hechos };
    }
    const todosDet = ["manana", "semana", "mes"].every((h) => out?.horizontes?.[h]?.determinista);
    console.log(`Lectura del dólar: ${todosDet ? "determinista (sin LLM)" : `LLM (${out.modelo || "modelo no registrado"})`}`);
    return { dolar: out, determinista: todosDet, fuente: todosDet ? "determinista" : "llm", hechos };
  } catch (e) {
    console.log(`Lectura del dólar no disponible: ${e.message} (se envía sin la sección)`);
    return { dolar: null, determinista: true, fuente: "sin lectura", hechos: [] };
  }
}

  // Deterministic fallback rendered when lecturaDolar itself is unavailable: the
  // same figures the module computes internally, recomputed from the same input
  // (`datos`) through hechosDolar. Callers render it only when the reading is
  // present; the numbers always match data/.
function lecturaDolarDeterminista(f, clasif, newsById) {
  try {
    const datos = armaDatosDolar(f, clasif, newsById);
    return { datos };
  } catch { return null; }
}

function render(f, ai, dateLabel, lectura, img) {
  const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
  const edition = Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - Date.UTC(2026, 9, 26)) / 864e5) + 1;
  
  const texto = (t, size = 15, lh = 1.5, clr = C.ink, weight = 400, mgb = 14) => 
    t ? `<p style="margin:0 0 ${mgb}px;font-family:${SERIF_F};font-size:${size}px;line-height:${lh};color:${clr};font-weight:${weight}">${esc(t)}</p>` : "";
  
  const tituloSeccion = (title, numero) => 
    `<tr><td style="padding:24px 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${UI_F};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">${numero ? `${numero}. ` : ''}${title}</td></tr></table></td></tr>`;
  
  const regla = () => `<tr><td style="padding:0"><hr style="border:none;border-top:1px solid ${C.rule};margin:0"/></td></tr>`;

  // Bloque del dólar: cabecera, gráfico PNG, tabla de rangos y lectura unificada.
  const cierre = f.cierre;
  const dollarHeadline = cierre ? `<tr><td style="padding:16px 0 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF_F};font-size:24px;font-weight:600;color:${C.ink}">Dólar</td>
      <td align="right" style="font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;color:${C.ink};white-space:nowrap">S/ ${fmt(cierre.valor, 3)}</td>
    </tr></table>
    <p style="margin:4px 0 0;font-family:${UI_F};font-size:13px;color:${C.soft}">Tipo de cambio venta del sistema bancario (SBS), publicado por ${cierre.fuente === "SUNAT" ? "SUNAT" : "el BCRP"} · cierre del ${esc(formatCierreFecha(cierre.fecha))}</p>
  </td></tr>` : "";

  const dollarImg = imgTag(img, "dolar.png", 560, 150, "Dólar: últimos 30 cierres y rango proyectado");
  const dollarGraphHtml = dollarImg ? `<tr><td style="padding:4px 0 0">${dollarImg}</td></tr>` : "";

  // Tabla de rangos (central 1 de cada 2, amplio 8 de cada 10) y lectura única.
  const tablaHtml = bloqueTablaRangos(f, false);
  const lecturaHtml = bloquePresionDolar(lectura, false);

  // Mercados: una sola tabla de 4 filas (cobre, oro, WTI, Brent).
  const metales = f.markets.filter((m) => ["Cobre", "Oro", "Petróleo WTI", "Petróleo Brent"].includes(m.name));
  const fmtPct = (v) => {
    const s = v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
    return `${s} %`;
  };

  const mercadoCards = metales.map((m) => {
    const pctColor = m.change >= 0 ? C.pos : C.neg;
    return `<tr>
      <td style="padding:8px 8px 8px 0;font-family:${UI_F};font-size:14px;color:${C.ink};white-space:nowrap">${esc(m.name)}</td>
      <td align="right" style="padding:8px 8px 8px 0;font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:14px;color:${C.ink};white-space:nowrap">${esc(m.unit)} ${fmt(m.value, m.dec)}</td>
      <td align="right" style="padding:8px 0;font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:13px;color:${pctColor};white-space:nowrap">${fmtPct(m.change)}</td>
    </tr>`;
  }).join("");

  // Hechos de importancia de la SMV (máximo 3, una línea cada uno).
  const smv = f.smvFacts.slice(0, 3).map((h) => `<tr><td style="padding:8px 0;font-family:${UI_F};font-size:13px;line-height:1.45;color:${C.ink}">
    <span style="font-weight:600">${esc(h.empresa)}:</span>
    <a href="${esc(h.url_oficial)}" style="color:${C.ink};text-decoration:underline;text-decoration-color:${C.rule}">${esc(h.titulo || h.tipo)}</a>
    <span style="font-family:${MONO_F};font-size:11px;color:${C.soft}"> · ${esc(formatSMVFecha(h.fecha))}</span>
  </td></tr>`).join("");

  // Historias: título + primera frase + fuente (máximo 4 en el pagado).
  const historiaHtml = (h) => `<tr><td style="padding:16px 0">
    <div style="font-family:${SERIF_F};font-size:17px;font-weight:600;line-height:1.3;color:${C.ink};margin-bottom:4px">${esc(h.titulo)}</div>
    ${h.nota ? `<div style="font-family:${SERIF_F};font-size:15px;line-height:1.45;color:${C.ink}">${esc(primeraFrase(h.nota))}</div>` : ""}
    <div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:6px">${(h.fuentes || []).filter((x, i, a) => a.findIndex((y) => y.fuente === x.fuente) === i).map((x) => `<a href="${esc(x.url)}" style="color:${C.soft}">${esc(x.fuente)}</a>`).join(" · ")}</div>
  </td></tr>`;

  const preheader = esc(entradillaDeterminista(f) || `Dólar, cobre, oro y petróleo; hechos de importancia de la SMV y titulares del ${dateLabel}.`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>Boletín PerData</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:28px 0 12px;border-bottom:4px double ${C.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF_F};font-size:32px;font-style:italic;font-weight:600;color:${C.ink};white-space:nowrap">PerData${flagHtml(C)}</td>
      <td align="right" style="font-family:${UI_F};font-size:12px;line-height:1.5;color:${C.soft}">Boletín diario<br>Edición ${edition > 0 ? edition : 1}</td>
    </tr></table>
    <div style="font-family:${UI_F};font-size:13px;color:${C.soft};margin-top:6px">${esc(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1))} · Lima</div>
  </td></tr>
  
  ${dollarHeadline}
  ${dollarGraphHtml}
  ${tablaHtml}
  ${lecturaHtml}
  {{PERSONAL}}
  
  ${f.historiasTodas?.length ? tituloSeccion("Lo importante de hoy", 0) + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${f.historiasTodas.slice(0, 4).map(historiaHtml).join(regla())}</table><div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:16px">Notas de PerData redactadas con IA a partir de los titulares de varias fuentes; cada enlace lleva al medio original.</div></td></tr>` : ""}
  
  ${tituloSeccion("Mercados", 0)}
  ${metales.length ? `<tr><td style="padding:8px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${mercadoCards}</table></td></tr>` : ""}
  <tr><td style="padding:12px 0 0"><div style="font-family:${UI_F};font-size:11px;color:${C.soft}">Fuente: BCRP${f.markets.some((m) => m.name.includes("Brent")) ? " y EIA" : ""}. Variación frente al dato anterior.</div></td></tr>
  
  ${f.smvFacts.length ? tituloSeccion("Hechos de importancia", 0) + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${smv}</table><div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:12px">Fuente: Superintendencia del Mercado de Valores (SMV).</div></td></tr>` : ""}
  
  <tr><td align="center" style="padding:32px 0 8px">
    <a href="${SITE}/explorer" style="display:inline-block;background:${C.ink};color:${C.paper};font-family:${UI_F};font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:4px">Abrir la terminal</a>
  </td></tr>

  <tr><td style="padding:16px 0 8px;font-family:${UI_F};font-size:13px;color:${C.soft};text-align:center">
    ¿Te sirvió? Reenvía este correo. Quien lo reciba puede suscribirse gratis en <a href="${SITE}/boletin?utm_source=correo&amp;utm_medium=reenvio" style="color:${C.ink};text-decoration:underline">perdata.site/boletin</a>
  </td></tr>
  
  <tr><td style="padding:24px 0 36px;border-top:1px solid ${C.rule};font-family:${UI_F};font-size:12px;line-height:1.6;color:${C.soft}">
    El rango es estadístico; los factores son contexto, no una predicción de dirección.<br>
    ${ai ? "La interpretación la redacta un modelo de IA a partir de los datos de este correo; las cifras se comprueban contra la fuente.<br>" : ""}
    Información con fines informativos; no es una recomendación de inversión.<br>
    <a href="${SITE}" style="color:${C.ink}">perdata.site</a> · Equipo de PerData<br>
    Recibes este correo porque te suscribiste al boletín. <a href="{{EMPRESAS}}" style="color:${C.soft}">Elegir mis empresas</a> · <a href="{{BAJA}}" style="color:${C.soft}">Darme de baja</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function renderGratis(f, dateLabel, lectura, img) {
  const C = { paper: "#F5F1E8", card: "#FBF9F4", ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", peru: "#D91023" };
  const edition = Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - Date.UTC(2026, 9, 26)) / 864e5) + 1;
  
  const texto = (t, size = 15, lh = 1.5, clr = C.ink, weight = 400, mgb = 14) => 
    t ? `<p style="margin:0 0 ${mgb}px;font-family:${SERIF_F};font-size:${size}px;line-height:${lh};color:${clr};font-weight:${weight}">${esc(t)}</p>` : "";
  
  const tituloSeccion = (title, numero) => 
    `<tr><td style="padding:24px 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${UI_F};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">${numero ? `${numero}. ` : ''}${title}</td></tr></table></td></tr>`;
  
  const regla = () => `<tr><td style="padding:0"><hr style="border:none;border-top:1px solid ${C.rule};margin:0"/></td></tr>`;

  // Bloque del dólar (gratis): cabecera, gráfico PNG, tabla de un horizonte y lectura.
  const cierre = f.cierre;
  const dollarHeadline = cierre ? `<tr><td style="padding:16px 0 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF_F};font-size:24px;font-weight:600;color:${C.ink}">Dólar</td>
      <td align="right" style="font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;color:${C.ink};white-space:nowrap">S/ ${fmt(cierre.valor, 3)}</td>
    </tr></table>
    <p style="margin:4px 0 0;font-family:${UI_F};font-size:13px;color:${C.soft}">Tipo de cambio venta del sistema bancario (SBS), publicado por ${cierre.fuente === "SUNAT" ? "SUNAT" : "el BCRP"} · cierre del ${esc(formatCierreFecha(cierre.fecha))}</p>
  </td></tr>` : "";

  const dollarImg = imgTag(img, "dolar-hoy.png", 560, 150, "Dólar: últimos 30 cierres y rango proyectado");
  const dollarGraphHtml = dollarImg ? `<tr><td style="padding:4px 0 0">${dollarImg}</td></tr>` : "";
  const tablaHtml = bloqueTablaRangos(f, true);
  const presionaHtml = bloquePresionDolar(lectura, true);

  // Top 3 stories
  const historiaHtml = (h) => `<tr><td style="padding:16px 0">
    <div style="font-family:${SERIF_F};font-size:17px;font-weight:600;line-height:1.3;color:${C.ink};margin-bottom:4px">${esc(h.titulo)}</div>
    ${h.nota ? `<div style="font-family:${SERIF_F};font-size:15px;line-height:1.45;color:${C.ink}">${esc(primeraFrase(h.nota))}</div>` : ""}
    <div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:6px">${(h.fuentes || []).filter((x, i, a) => a.findIndex((y) => y.fuente === x.fuente) === i).map((x) => `<a href="${esc(x.url)}" style="color:${C.soft}">${esc(x.fuente)}</a>`).join(" · ")}</div>
  </td></tr>`;

  // Plan Boletín invitation - 3 bullets
  const plan = `<!-- plan-boletin -->
  <tr><td style="padding:24px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-top:1px solid ${C.rule};border-bottom:1px solid ${C.rule}"><tr><td style="padding:20px 4px">
      <div style="font-family:${UI_F};font-size:14px;line-height:1.55;color:${C.ink};margin-bottom:12px">Con el plan Boletín (US$&nbsp;1.99 al mes, 7 días de prueba con tarjeta) recibes:</div>
      <ul style="margin:0;padding-left:20px;font-family:${SERIF_F};font-size:15px;line-height:1.6;color:${C.ink}">
        <li style="margin-bottom:8px">Dólar a una semana y a un mes, cada uno con su rango y lectura</li>
        <li style="margin-bottom:8px">Cobre, oro y petróleo con variación y gráficos</li>
        <li>Tus empresas (hasta 15) con precio, proyección, hechos y noticias</li>
      </ul>
      <div style="margin-top:16px"><a href="${SITE}/precios" style="display:inline-block;background:${C.ink};color:${C.paper};font-family:${UI_F};font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:4px">Ver los planes</a></div>
    </td></tr></table>
  </td></tr>
  <!-- /plan-boletin -->`;

  const preheader = esc("Cierre oficial del dólar (sistema bancario SBS) y rango probable para el próximo día hábil.");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>Boletín PerData</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:28px 0 12px;border-bottom:4px double ${C.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF_F};font-size:32px;font-style:italic;font-weight:600;color:${C.ink};white-space:nowrap">PerData${flagHtml(C)}</td>
      <td align="right" style="font-family:${UI_F};font-size:12px;line-height:1.5;color:${C.soft}">Boletín diario<br>Edición ${edition > 0 ? edition : 1}</td>
    </tr></table>
    <div style="font-family:${UI_F};font-size:13px;color:${C.soft};margin-top:6px">${esc(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1))} · Lima</div>
  </td></tr>
  
  ${dollarHeadline}
  ${dollarGraphHtml}
  ${tablaHtml}
  ${presionaHtml}
  {{PERSONAL}}
  
  ${f.historiasTop3?.length ? tituloSeccion("Lo importante de hoy", 0) + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${f.historiasTop3.map(historiaHtml).join(regla())}</table><div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:16px">Notas de PerData redactadas con IA a partir de los titulares de varias fuentes; cada enlace lleva al medio original.</div></td></tr>` : ""}
  
  ${plan}
  
  <tr><td style="padding:16px 0 8px;font-family:${UI_F};font-size:13px;color:${C.soft};text-align:center">
    ¿Te sirvió? Reenvía este correo. Quien lo reciba puede suscribirse gratis en <a href="${SITE}/boletin?utm_source=correo&amp;utm_medium=reenvio" style="color:${C.ink};text-decoration:underline">perdata.site/boletin</a>
  </td></tr>
  
  <tr><td style="padding:24px 0 36px;border-top:1px solid ${C.rule};font-family:${UI_F};font-size:12px;line-height:1.6;color:${C.soft}">
    El rango es estadístico; los factores son contexto, no una predicción de dirección.<br>
    Información con fines informativos; no es una recomendación de inversión.<br>
    <a href="${SITE}" style="color:${C.ink}">perdata.site</a> · Equipo de PerData<br>
    Recibes este correo porque te suscribiste al boletín. <a href="{{EMPRESAS}}" style="color:${C.soft}">Elegir mis empresas</a> · <a href="{{BAJA}}" style="color:${C.soft}">Darme de baja</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---- Personal section: the companies each subscriber follows ----
const empresasLocal = readLocal("data/empresas.json", { emisores: [] });
const estadoLocal = readLocal("data/empresas-estado.json", { emisores: {} });
// Rango semanal calibrado de las acciones (data/acciones-rangos.json): una sola
// lectura para todas las tarjetas. Si el archivo no se puede leer, el correo
// sale igual que hoy (con la proyección vieja), nunca falla el envío.
let rangos = readLocal("data/acciones-rangos.json", null);
if (!rangos) {
  try { rangos = await getJson(`${RAW}/acciones-rangos.json`).catch(() => null); } catch { rangos = null; }
}
// Fecha de hoy en Lima (AAAA-MM-DD): con ella se mide la vigencia del rango.
const hoyLima = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
// Live issuers are loaded at module level like before (one fetch, reused by
// every subscriber); when the network is down the repo copy above keeps the
// preview working with the same figures.
let issuers = empresasLocal.emisores || [];
try { const live = (await getJson(`${RAW}/empresas.json`).catch(() => null))?.emisores; if (live?.length) issuers = live; } catch {}
const issuerOf = (nemo) => issuers.find((e) => e.valores.some((v) => v.nemonico === nemo));

async function companyCard(nemo, smvAll, clasif, newsById) {
  const e = issuerOf(nemo);
  if (!e) return null;
  const nemos = e.valores.map((v) => v.nemonico);
  // Only the requested security's own projection symbol counts. The old
  // fallback (`|| e.valores.find(...)`) borrowed BUENAVI1.LM for BVN and
  // priced the US$ foreign share in soles with the Lima share's figure.
  const simbolo_proyeccion = e.valores.find((v) => v.nemonico === nemo && v.simbolo_proyeccion)?.simbolo_proyeccion || null;
  const v = e.valores.find((x) => x.nemonico === nemo) || e.valores[0];
  const st = (Object.values(estadoLocal.emisores || {}).find((x) => x.nemonico === nemo)) || {};
  // `lima` is true only when THE requested security itself is the Lima one.
  // BVN (US$, foreign segment) shares an issuer with BUENAVI1 (S/, .LM):
  // the old rule (`some` value is .LM) leaked BUENAVI1.LM's price into BVN,
  // a currency it never had in data/. The brief asks for BVN's own price.
  const lima = Boolean(v && /\.LM$/i.test(v.simbolo_proyeccion || ""));
  const card = {
    nemo, name: prettyName(e.razonSocial), sector: e.sector || null, simbolo_proyeccion,
    price: null, change: null, currency: st.moneda || v?.moneda || "S/", forecast: null, rangoMotivo: null,
    smv: [], news: [], serie: [],
  };
  // Lima prices: data/empresas-estado.json (the table /empresas and the module
  // demos read) with the SMV table as the live fallback. The figure shown is
  // the one in data/, so the preview agrees with the site without keys.
  if (numOk(st.ultimo_cierre)) {
    card.price = Number(st.ultimo_cierre);
    card.priceDate = st.ultima_fecha;
    card.priceSource = "empresas-estado";
  }
  // Cierres para el gráfico (60): la tabla de la SMV para las de Lima y el
  // endpoint público /api/historical para el resto. Si la consulta falla, la
  // empresa sale sin imagen (pero con precio y noticias).
  if (lima) {
    try {
      const rows = await smvRows(nemo, "2000-01-01", { limit: 60 });
      if (rows.length) {
        card.serie = rows.map((r) => ({ fecha: String(r.fecha).slice(0, 10), valor: Number(r.cierre) }))
          .filter((p) => p.fecha && Number.isFinite(p.valor))
          .sort((a, b) => a.fecha.localeCompare(b.fecha));
        const last = card.serie[card.serie.length - 1];
        const prev = card.serie[card.serie.length - 2];
        if (last) {
          card.price = last.valor;
          card.currency = "S/";
          card.priceDate = last.fecha;
          card.priceSource = "smv";
          if (prev && prev.valor) card.change = pct(last.valor, prev.valor);
        }
      }
    } catch (e2) {
      console.error(`SMV ${nemo}: ${e2.message}`);
    }
  }
  if (!card.serie.length && simbolo_proyeccion) {
    const rango = /\.LM$/i.test(simbolo_proyeccion) ? "3mo" : "1y";
    const h = await getJson(`${SITE}/api/historical?symbol=${encodeURIComponent(simbolo_proyeccion)}&range=${rango}&interval=1d`).catch(() => null);
    card.serie = (h?.series || []).map((p) => ({ fecha: String(p.date).slice(0, 10), valor: Number(p.close) }))
      .filter((p) => p.fecha && Number.isFinite(p.valor));
    if (h?.live?.price && card.price == null) {
      card.price = h.live.price;
      card.change = h.live.changePct ?? null;
      card.priceDate = h.live.time;
    }
    if (h?.currency && !st.moneda) card.currency = h.currency === "USD" ? "US$" : "S/";
  }
  // El rango de la semana sale del motor calibrado (data/acciones-rangos.json):
  // en las acciones de Lima sustituye a la banda mensual vieja de /api/forecast
  // (ancha y sin calibrar). Los valores que NO son de Lima siguen con su
  // proyección de /api/forecast, tal como hasta ahora.
  const valorRango = rangos ? rangos.valores?.[nemo] : undefined;
  const r = rangos ? rangoEmpresaCorreo(valorRango, { hoy: hoyLima }) : null;
  if (r && lima) {
    card.forecast = r.forecast;
    card.rangoMotivo = r.motivo;
  } else if (simbolo_proyeccion) {
    const fc = await getJson(`${SITE}/api/forecast?symbol=${encodeURIComponent(simbolo_proyeccion)}&horizon=1`).catch(() => null);
    if (fc?.quantiles) card.forecast = {
      p50: fc.predictedPrice, p10: fc.quantiles.p10 ?? fc.quantiles.P10, p25: fc.quantiles.p25 ?? fc.quantiles.P25,
      p75: fc.quantiles.p75 ?? fc.quantiles.P75, p90: fc.quantiles.p90 ?? fc.quantiles.P90,
      date: fc.horizonDate, prob: fc.probabilityOfRise,
    };
  }
  // Sin rango propio (acciones que no son de Lima): cuando el motor conoce la
  // acción y no publica un rango, la tarjeta explica el motivo en vez de callar.
  // Las que el motor no conoce quedan exactamente como hasta ahora.
  if (r && !lima && !card.forecast && valorRango) card.rangoMotivo = r.motivo;
  // The series ends at the close that is shown (nothing later) and the
  // variation is derived from it when the source did not give one.
  if (card.priceDate) {
    const limite = String(card.priceDate).slice(0, 10);
    card.serie = card.serie.filter((p) => p.fecha <= limite);
  }
  if (card.change == null && card.serie.length >= 2) {
    const last = card.serie[card.serie.length - 1];
    const prev = card.serie[card.serie.length - 2];
    if (prev.valor) card.change = pct(last.valor, prev.valor);
  }
  if (card.price == null && st.ultimo_cierre != null) { card.price = Number(st.ultimo_cierre); card.priceDate = st.ultima_fecha; }
  // Gráfico: sin proyección o con menos de 10 cierres la empresa sale sin imagen.
  card.grafico = (card.forecast && card.serie.length >= 10)
    ? { archivo: `${nemo}.png`, ancho: 560, alto: 110, alt: `${card.name}: últimos cierres y rango proyectado a ${card.forecast.horizonte === "semana" ? "una semana" : "un mes"}` }
    : null;
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  for (const n of nemos) for (const h of smvAll[n] || []) if (h.fecha >= since) card.smv.push({ ...h, titulo: sentence(h.titulo) || sentence(h.tipo) });
  const seen = new Set();
  card.smv = card.smv.filter((h) => {
    const k = `${String(h.fecha).slice(0, 10)} ${String(h.titulo).toLowerCase().replace(/\s+/g, " ").trim()}`;
    return seen.has(k) ? false : seen.add(k);
  }).slice(0, 3);
  // Brief: pass ONLY the news companyCard already filtered by real mention
  // (clasificador tag + mencionaEmpresa), never the demo ones.
  for (const [id, c] of Object.entries(clasif)) {
    const story = newsById[id];
    const recent = story?.fecha_iso && Date.parse(story.fecha_iso) >= Date.now() - 7 * 864e5;
    if (recent && (c.empresas || []).some((x) => nemos.includes(x)) && mencionaEmpresa(`${story.titulo} ${story.resumen || ""}`, e)) card.news.push({ ...story, sentimiento: c.sentimiento });
  }
  card.news.sort((a, b) => String(b.fecha_iso).localeCompare(String(a.fecha_iso)));
  card.news = card.news.slice(0, 3);
  return card;
}
const numOk = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

function macroEmpresa(f) {
  const macroDeSerie = (serie) => {
    if (!serieOk(serie)) return null;
    const [f0, v0] = serie[serie.length - 1];
    const f5 = serie[Math.max(0, serie.length - 6)];
    return { valor: Math.round(Number(v0) * 10000) / 10000, variacion_5: round2(varPct(v0, f5[1])), fecha: String(f0).slice(0, 10) };
  };
  const macro = {};
  for (const [clave, nombre] of [["cobre", "COBRE"], ["oro", "ORO"], ["wti", "WTI"], ["dolar", "PEN"]]) {
    const m = macroDeSerie(f.bcrp?.series?.[nombre]?.serie);
    if (m) macro[clave] = m;
  }
  const tasaSerie = f.ctx?.series?.TASA_REFERENCIA?.serie;
  if (serieOk(tasaSerie)) {
    const [ft, vt] = tasaSerie[tasaSerie.length - 1];
    macro.tasa_referencia = { valor: round2(vt), fecha: String(ft).slice(0, 10) };
  }
  return macro;
}

function renderPersonal(cards, lecturas, img) {
  const C = { ink: "#1B1916", soft: "#5E584E", rule: "#DCD4C4", pos: "#1E7A46", neg: "#B42318", card: "#FBF9F4" };

  const punto = (p, tipo) => `<div style="margin:0 0 6px;padding-left:10px;border-left:2px solid ${tipo === "al_alza" ? C.pos : C.neg};font-family:${SERIF_F};font-size:14px;line-height:1.45;color:${C.ink}">${esc(p.texto)}</div>`;

  const regla = () => `<tr><td style="padding:0"><hr style="border:none;border-top:1px solid ${C.rule};margin:0"/></td></tr>`;

  const body = cards.map((c) => {
    const ch = c.change == null ? "" : `<span style="color:${c.change >= 0 ? C.pos : C.neg}">${c.change >= 0 ? "▲" : "▼"} ${fmt(Math.abs(c.change))}%</span>`;
    const fc = c.forecast;

    // Gráfico: 60 cierres + abanico a un mes (alto 110). Sin proyección o con
    // menos de 10 cierres la empresa sale sin imagen.
    const grafico = c.grafico ? imgTag(img, c.grafico.archivo, c.grafico.ancho, c.grafico.alto, c.grafico.alt) : "";
    const graficoHtml = grafico ? `<div style="margin:8px 0 0">${grafico}</div>` : "";

    // Una línea en mono con el rango central y el amplio. Las de Lima usan el
    // rango semanal calibrado (lineaRangoCorreo); el resto, igual que hoy, con
    // la banda mensual de /api/forecast.
    const linea = fc
      ? (fc.horizonte === "semana"
        ? lineaRangoCorreo(fc, { fmt, fechaCorta })
        : (fc.p25 != null && fc.p75 != null
          ? `Al ${fechaCorta(fc.date)}: ${rangoTexto(fc.p25, fc.p75, 2)} (1 de cada 2) · ${rangoTexto(fc.p10, fc.p90, 2)} (8 de cada 10)`
          : ""))
      : "";
    const [cabeza, cola] = linea.split(" · ");
    const rangoHtml = linea
      ? `<div style="font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:12px;color:${C.ink};margin:8px 0 0">${esc(cabeza)} · <span style="color:${C.soft}">${esc(cola ?? "")}</span></div>`
      : "";

    // Sin rango publicable: el motivo exacto del motor, en una línea.
    const motivoHtml = !fc && c.rangoMotivo
      ? `<div style="font-family:${UI_F};font-size:12px;color:${C.soft};margin:8px 0 0">${esc(c.rangoMotivo)}</div>`
      : "";

    // Hechos SMV y noticias: máximo 2 en total, una línea cada uno.
    const lineas = [
      ...c.smv.map((h) => `<span style="color:${C.soft}">SMV</span> <a href="${esc(h.url_oficial)}" style="color:${C.ink}">${esc(recortar(h.titulo, 110))}</a>`),
      ...c.news.map((n) => `<a href="${esc(n.url)}" style="color:${C.ink}">${esc(recortar(n.titulo, 110))}</a> <span style="color:${C.soft}">· ${esc(n.fuente)}</span>`),
    ].slice(0, 2);
    const hechosHtml = lineas.length
      ? `<div style="margin-top:8px;font-family:${UI_F};font-size:13px;line-height:1.45;color:${C.ink}">${lineas.join("<br>")}</div>`
      : "";

    // Lectura: solo los puntos con dirección (1 por lado). Sin «Qué hay» ni «Contexto».
    const l = lecturas?.[c.nemo];
    const alAlza = (l?.podria_mover?.al_alza || []).slice(0, 1);
    const aLaBaja = (l?.podria_mover?.a_la_baja || []).slice(0, 1);
    const lecturaHtml = (alAlza.length || aLaBaja.length)
      ? `<div style="margin-top:10px;padding-top:8px;border-top:1px dashed ${C.rule}">
          ${alAlza.length ? `<div style="font-family:${UI_F};font-size:12px;font-weight:600;margin-bottom:4px">Podría mover al alza</div>${alAlza.map((p) => punto(p, "al_alza")).join("")}` : ""}
          ${aLaBaja.length ? `<div style="font-family:${UI_F};font-size:12px;font-weight:600;margin-bottom:4px">Podría mover a la baja</div>${aLaBaja.map((p) => punto(p, "a_la_baja")).join("")}` : ""}
        </div>`
      : "";

    return `<tr><td style="padding:18px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${UI_F};font-size:15px;font-weight:600;color:${C.ink};vertical-align:top">${esc(c.name)} <span style="font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:11px;font-weight:400;color:${C.soft}">${esc(c.nemo)}</span></td>
        <td align="right" style="font-family:${MONO_F};font-variant-numeric:tabular-nums;font-size:15px;color:${C.ink};white-space:nowrap;vertical-align:top">${c.price != null ? `${esc(c.currency)} ${fmt(c.price)}` : ""}${ch ? `<br><span style="font-size:13px">${ch}</span>` : ""}</td>
      </tr></table>
      ${graficoHtml}
      ${rangoHtml}
      ${motivoHtml}
      ${hechosHtml}
      ${lecturaHtml}
      <div style="margin-top:8px"><a href="${SITE}/empresa/${encodeURIComponent(c.nemo)}" style="font-family:${UI_F};font-size:12px;color:${C.soft};text-decoration:underline">Ver ficha</a></div>
    </td></tr>`;
  }).join(regla());
  
  return `<tr><td style="padding:24px 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${C.ink};padding-left:10px;font-family:${UI_F};font-size:14px;font-weight:600;color:${C.ink};text-transform:uppercase;letter-spacing:0.5px">Tus empresas</td></tr></table></td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
  <div style="font-family:${UI_F};font-size:11px;color:${C.soft};margin-top:16px">Precios: datos de mercado de cierre. Hechos: SMV. La proyección es estadística y no incorpora las noticias.</div></td></tr>`;
}

const f = await facts();
const ai = await interpret(f);
const lima = new Date(Date.now() - 5 * 36e5);
const dateLabel = lima.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const upsell = `<tr><td style="padding:24px 0 0;font-family:${UI_F};font-size:14px;line-height:1.5;color:#5E584E">Elegiste empresas para seguir. La sección «Tus empresas» (precio, proyección, hechos y noticias de cada una) llega con el plan Boletín.</td></tr>`;
const fill = (html, personal, baja = `${SITE}/boletin`, prefs = `${SITE}/boletin`) => html
  .replace("{{BAJA}}", () => baja)
  .replace("{{EMPRESAS}}", () => prefs)
  .replace("{{PERSONAL}}", () => personal);

// Gmail clips messages above ~102 KB and hides the footer, where the unsubscribe link lives.
// If a subscriber's email would get there, drop company readings from the last company up until it fits.
const LIMITE_BYTES = Number(process.env.BOLETIN_LIMITE_BYTES) || 98000;
function armarPagado(base, cards, lecturas, baja, prefs, img) {
  const lec = { ...lecturas };
  let html = compactar(fill(base, renderPersonal(cards, lec, img), baja, prefs));
  for (let i = cards.length - 1; i >= 0 && Buffer.byteLength(html) > LIMITE_BYTES; i--) {
    if (!lec[cards[i].nemo]) continue;
    delete lec[cards[i].nemo];
    html = compactar(fill(base, renderPersonal(cards, lec, img), baja, prefs));
  }
  return html;
}

// Shared news sources for the two readings: the classifier and the raw feed,
// read from data/ (the modules' demos read them the same way). Any failure
// simply leaves both readings deterministic, never a crash.
const clasifLocal = readLocal("data/noticias-clasificadas.json", { items: {} }).items || {};
const newsLocal = readLocal("data/noticias.json", { noticias: [] }).noticias || [];
let clasif = clasifLocal;
let newsById = Object.fromEntries(newsLocal.map((n) => [n.id, n]));
if (!Object.keys(clasif).length || !Object.keys(newsById).length) {
  clasif = (await getJson(`${RAW}/noticias-clasificadas.json`).catch(() => ({ items: {} }))).items || clasif;
  newsById = Object.fromEntries(((await getJson(`${RAW}/noticias.json`).catch(() => ({ noticias: [] }))).noticias || []).map((n) => [n.id, n]));
  if (!Object.keys(newsById).length) newsById = Object.fromEntries(newsLocal.map((n) => [n.id, n]));
}

// Both readings share one 90 s budget (brief): lecturaDolar first, then
// lecturasEmpresas over the preview/paid companies. The deterministic
// versions are instant, so without an LLM key this is negligible.
// The free email never contains company readings: its preview is built from
// the dollar/historias/presiona pieces only, and the paid preview only adds
// «Tus empresas».
const lecturaDeadline = Date.now() + 90 * 1000;
const { dolar: lecturaDolarOut } = await lecturaDolarSegura(f, clasif, newsById, lecturaDeadline);

// Vista previa local: los PNG se escriben junto al HTML y se referencian con
// una ruta relativa («<archivo>-img/»). En el envío real las imágenes solo
// aparecen si existe BOLETIN_IMG_BASE (si no, el correo va sin <img>).
const cliPreviewPath = process.argv.find((a) => a.startsWith("--preview-path="))?.slice("--preview-path=".length);
const previewPath = process.env.BOLETIN_PREVIEW_PATH || cliPreviewPath || path.join(ROOT, "..", "handoff", "qa", PREVIEW_PLAN === "gratis" ? "correo-gratis.html" : "correo-pagado.html");
fs.mkdirSync(path.dirname(path.resolve(previewPath)), { recursive: true });
const imgPreview = {
  dir: path.join(path.dirname(path.resolve(previewPath)), carpetaImagen(previewPath)),
  base: carpetaImagen(previewPath),
};

let previewPersonal = "";
let lecturasPreview = {};
let previewCards = null;
if (process.env.PREVIEW_EMPRESAS) {
  const want = process.env.PREVIEW_EMPRESAS.split(",").map((x) => x.trim()).filter(Boolean);
  const smvAll = readLocal("data/smv-hechos.json", { hechos: {} }).hechos || {};
  const smvLive = (await getJson(`${RAW}/smv-hechos.json`).catch(() => null))?.hechos;
  const cards = [];
  for (const n of want) { const c = await companyCard(n, smvLive || smvAll, clasif, newsById); if (c) cards.push(c); }
  // Brief: lecturasEmpresas over `datos` built from the cards (only the news
  // companyCard already filtered → card.news), with the same macro and the
  // forecast range. No card → no reading, never a crash.
  if (PREVIEW_PLAN !== "gratis" && cards.length) {
    const macro = macroEmpresa(f);
    const listaDatos = cards.map((c) => ({
      nemo: c.nemo, nombre: c.name, sector: c.sector,
      precio: c.price, moneda: c.currency, fecha_precio: c.priceDate ? String(c.priceDate).slice(0, 10) : null,
      variacion_dia: c.change ?? null,
      rango: c.forecast ? { p10: c.forecast.p10, p50: c.forecast.p50, p90: c.forecast.p90, fecha: c.forecast.date } : null,
      hechos_smv: (c.smv || []).map((h) => ({ fecha: String(h.fecha).slice(0, 10), titulo: h.titulo })),
      noticias: (c.news || []).map((n) => ({ titular: n.titulo, fuente: n.fuente, fecha: String(n.fecha_iso || "").slice(0, 10), sentimiento: n.sentimiento })),
      macro,
    }));
    try {
      const left = lecturaDeadline - Date.now();
      if (left > 5000) {
        const lecturas = await Promise.race([
          lecturasEmpresas(listaDatos),
          new Promise((_, rej) => { const t = setTimeout(() => rej(new Error("tiempo agotado")), Math.max(5000, left)); t.unref?.(); }),
        ]);
        for (const [nemo, lec] of lecturas) lecturasPreview[nemo] = lec;
        const todosDet = listaDatos.every((d) => lecturas.get(d.nemo)?.determinista);
        console.log(`Lecturas de empresa: ${todosDet ? "determinista (sin LLM)" : "LLM"}`);
      } else {
        console.log("Lecturas de empresa omitidas: sin tiempo (se envía sin la sección)");
      }
    } catch (e) {
      console.log(`Lecturas de empresa no disponibles: ${e.message} (se envía sin la sección)`);
    }
  }
  previewPersonal = PREVIEW_PLAN === "gratis" ? upsell : renderPersonal(cards, lecturasPreview, imgPreview);
  previewCards = cards;
}

// Gráficos de la vista previa: el del dólar (el gratis solo lleva el de hoy) y
// uno por empresa con imagen.
try {
  if (PREVIEW_PLAN === "gratis") escribirImagen(imgPreview.dir, "dolar-hoy.png", pngDolar(f, true));
  else {
    escribirImagen(imgPreview.dir, "dolar.png", pngDolar(f, false));
    for (const c of previewCards || []) if (c.grafico) escribirImagen(imgPreview.dir, c.grafico.archivo, pngEmpresa(c));
  }
} catch (e) {
  console.error(`Gráficos de la vista previa: ${e.message}`);
}

const htmlCompleto = compactar(render(f, ai, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null, imgPreview));
const htmlGratis = compactar(renderGratis(f, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null, imgPreview));
const previewHtml = PREVIEW_PLAN !== "gratis" && previewCards
  ? armarPagado(htmlCompleto, previewCards, lecturasPreview, undefined, undefined, imgPreview)
  : compactar(fill(PREVIEW_PLAN === "gratis" ? htmlGratis : htmlCompleto, previewPersonal));
fs.writeFileSync(previewPath, previewHtml);
console.log(`Vista previa: ${PREVIEW_PLAN} · mercados: ${f.markets.length} · SMV: ${f.smvFacts.length} · titulares: ${f.headlines.length} · historias: ${f.historiasTodas?.length || 0} · IA: ${ai ? "sí" : "no"}`);

// HTML del envío real: las imágenes solo van si hay dónde alojarlas.
const imgEnv = process.env.BOLETIN_IMG_BASE ? { base: process.env.BOLETIN_IMG_BASE } : null;
const htmlCompletoEnv = compactar(render(f, ai, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null, imgEnv));
const htmlGratisEnv = compactar(renderGratis(f, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null, imgEnv));

// Vista previa del HTML de envío (sin enviar nada): comprueba, entre otras
// cosas, que sin BOLETIN_IMG_BASE el correo no lleva ninguna etiqueta <img>.
if (process.env.BOLETIN_PREVIEW_SEND === "1") {
  const sendPath = process.env.BOLETIN_PREVIEW_SEND_PATH || previewPath.replace(/\.html?$/i, "-envio.html");
  const personalEnv = PREVIEW_PLAN === "gratis" ? upsell : (previewCards?.length ? renderPersonal(previewCards, lecturasPreview, imgEnv) : "");
  const htmlEnv = PREVIEW_PLAN !== "gratis" && previewCards
    ? armarPagado(htmlCompletoEnv, previewCards, lecturasPreview, undefined, undefined, imgEnv)
    : compactar(fill(PREVIEW_PLAN === "gratis" ? htmlGratisEnv : htmlCompletoEnv, personalEnv));
  fs.writeFileSync(sendPath, htmlEnv);
  console.log(`Vista previa del envío: ${sendPath} · imágenes: ${imgEnv ? "sí" : "no"}`);
  process.exit(0);
}

// Publica los PNG del día (el dólar completo, el de hoy y uno por empresa con
// gráfico). Si un PNG no se puede dibujar, ese archivo no se publica y el
// correo sigue como si nada.
async function publicarGraficos(fecha, listaCards) {
  const archivos = new Map();
  const agrega = (nombre, dibuja) => {
    try {
      const bytes = dibuja();
      if (bytes) archivos.set(nombre, Buffer.from(bytes));
    } catch (e) {
      console.error(`Gráfico ${nombre}: ${e.message}`);
    }
  };
  agrega("dolar.png", () => pngDolar(f, false));
  agrega("dolar-hoy.png", () => pngDolar(f, true));
  for (const c of listaCards || []) if (c?.grafico) agrega(c.grafico.archivo, () => pngEmpresa(c));
  return publicarImagenes({ archivos, fecha, cmd: process.env.BOLETIN_IMG_CMD, dir: process.env.BOLETIN_IMG_DIR });
}

// La fecha del boletín en Lima (la misma que usa el archivo «ya enviado»).
const today = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);

// Corrida de prueba (--dry-run sin vista previa): publica los PNG del dólar
// para comprobar el alojamiento, sin enviar nada.
if (DRY && !PREVIEW && process.env.BOLETIN_IMG_CMD) {
  const imgPrueba = await publicarGraficos(today, []);
  console.log(imgPrueba ? `Imágenes del correo: ${imgPrueba.archivos.size} en ${imgPrueba.base}` : "Imágenes del correo: ninguna");
}

async function seguimientoDe(email) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return [];
  try {
    const u = await fetch(`${base}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!u.ok) return [];
    const rows = await u.json();
    const id = rows && rows[0] && rows[0].id;
    if (!id) return [];
    const s = await fetch(`${base}/rest/v1/seguimiento?user_id=eq.${encodeURIComponent(id)}&select=simbolo&order=creado.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!s.ok) return [];
    const list = await s.json();
    return Array.isArray(list) ? list.map((r) => r.simbolo).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

if (!DRY && !PREVIEW) {
  if (!process.env.RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY");
  const LAST = new URL("../data/boletin-last.json", import.meta.url);
  if (process.env.FORCE !== "true" && fs.existsSync(LAST)) {
    const last = JSON.parse(fs.readFileSync(LAST, "utf8"));
    if (last.date === today) {
      console.log(`Ya se envió hoy (${last.sentAt}); no se repite`);
      process.exit(0);
    }
  }
  const list = [];
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (base && process.env.SUPABASE_SERVICE_KEY) {
    const r = await fetch(`${base}/rest/v1/boletin_suscriptores?estado=eq.activo&select=email,token,empresas`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) list.push(...(await r.json()));
    else console.error(`Suscriptores no disponibles (HTTP ${r.status}); se envía solo a BOLETIN_TO`);
  }
  for (const email of (process.env.BOLETIN_TO || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!list.some((x) => x.email === email)) list.push({ email, token: null, empresas: [] });
  }
  if (!list.length) throw new Error("Sin destinatarios");

  const paid = new Set();
  if (base && process.env.SUPABASE_SERVICE_KEY && list.length) {
    const emails = list.map((x) => `"${x.email}"`).join(",");
    const r = await fetch(`${base}/rest/v1/users?select=email,plan&plan=in.(boletin,pro)&email=in.(${encodeURIComponent(emails)})`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) for (const u of await r.json()) paid.add(String(u.email).toLowerCase());
  }
  const owners = new Set((process.env.BOLETIN_TO || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  for (const x of list) x.plan = paid.has(x.email) || owners.has(x.email) ? "boletin" : "gratis";

  for (const x of list) {
    if (x.plan !== "boletin") continue;
    const seguidos = await seguimientoDe(x.email);
    if (seguidos.length) x.empresas = seguidos;
  }

  const wanted = [...new Set(list.filter((x) => x.plan === "boletin").flatMap((x) => x.empresas || []))].slice(0, 15);
  const smvLive = (await getJson(`${RAW}/smv-hechos.json`).catch(() => null))?.hechos;
  const smvAll = smvLive || readLocal("data/smv-hechos.json", { hechos: {} }).hechos || {};
  const cards = {};
  for (const nemo of wanted) cards[nemo] = await companyCard(nemo, smvAll, clasif, newsById);
  console.log(`Empresas seguidas: ${wanted.length}`);

  // Company readings for the paid send (same builders as the preview, over
  // the cards the subscribers actually see). Shared budget, never a crash.
  let lecturas = {};
  const paidCards = wanted.map((n) => cards[n]).filter(Boolean);
  if (paidCards.length) {
    const macro = macroEmpresa(f);
    const listaDatos = paidCards.map((c) => ({
      nemo: c.nemo, nombre: c.name, sector: c.sector,
      precio: c.price, moneda: c.currency, fecha_precio: c.priceDate ? String(c.priceDate).slice(0, 10) : null,
      variacion_dia: c.change ?? null,
      rango: c.forecast ? { p10: c.forecast.p10, p50: c.forecast.p50, p90: c.forecast.p90, fecha: c.forecast.date } : null,
      hechos_smv: (c.smv || []).map((h) => ({ fecha: String(h.fecha).slice(0, 10), titulo: h.titulo })),
      noticias: (c.news || []).map((n) => ({ titular: n.titulo, fuente: n.fuente, fecha: String(n.fecha_iso || "").slice(0, 10), sentimiento: n.sentimiento })),
      macro,
    }));
    try {
      const left = lecturaDeadline - Date.now();
      if (left > 5000) {
        const map = await Promise.race([
          lecturasEmpresas(listaDatos),
          new Promise((_, rej) => { const t = setTimeout(() => rej(new Error("tiempo agotado")), Math.max(5000, left)); t.unref?.(); }),
        ]);
        for (const [nemo, lec] of map) lecturas[nemo] = lec;
        const todosDet = listaDatos.every((d) => map.get(d.nemo)?.determinista);
        console.log(`Lecturas de empresa: ${todosDet ? "determinista (sin LLM)" : "LLM"}`);
      } else {
        console.log("Lecturas de empresa omitidas: sin tiempo (se envía sin la sección)");
      }
    } catch (e) {
      console.log(`Lecturas de empresa no disponibles: ${e.message} (se envía sin la sección)`);
    }
  }

  // Imágenes del envío: manda la base ya configurada; si no hay, se publican
  // los PNG del día y el correo los referencia. Si algo falla, el correo sale
  // sin imágenes (el envío nunca se rompe).
  let imgEnvSend = null;
  if (process.env.BOLETIN_IMG_BASE) imgEnvSend = { base: process.env.BOLETIN_IMG_BASE };
  else if (process.env.BOLETIN_IMG_CMD) imgEnvSend = await publicarGraficos(today, paidCards);
  const htmlCompletoSend = compactar(render(f, ai, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null, imgEnvSend));
  const htmlGratisSend = compactar(renderGratis(f, dateLabel, lecturaDolarOut?.horizontes ? lecturaDolarOut : null, imgEnvSend));
  const nImagenes = imgEnvSend?.archivos?.size ?? (2 + paidCards.filter((c) => c.grafico).length);
  console.log(imgEnvSend ? `Imágenes del correo: ${nImagenes} en ${imgEnvSend.base}` : "Imágenes del correo: ninguna");

  const emails = list.map(({ email, token, empresas, plan }) => {
    const baja = token ? `${SITE}/api/boletin?accion=baja&t=${token}` : `${SITE}/boletin`;
    const prefs = token ? `${SITE}/boletin?t=${token}#empresas` : `${SITE}/boletin`;
    const mine = (empresas || []).map((n) => cards[n]).filter(Boolean);
    // Free version: no «Tus empresas» section, only the note about the plan
    const personal = plan === "gratis" ? ((empresas || []).length ? upsell : "") : (mine.length ? renderPersonal(mine, lecturas, imgEnvSend) : `<tr><td style="padding:24px 0 0;font-family:${UI_F};font-size:14px;line-height:1.5;color:#5E584E">Aún no elegiste empresas. Elige hasta 15 en <a href="${SITE}/cuenta" style="color:#1B1916">/cuenta</a> y cada mañana llegará tu sección «Tus empresas».</td></tr>`);
    const baseHtml = plan === "gratis" ? htmlGratisSend : htmlCompletoSend;
    const msg = { 
      from: FROM, 
      to: [email], 
      subject: `PerData · ${dateLabel}`, 
      html: plan !== "gratis" && mine.length ? armarPagado(baseHtml, mine, lecturas, baja, prefs, imgEnvSend) : compactar(fill(baseHtml, personal, baja, prefs)),
    };
    
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
  if (process.env.FORCE !== "true") fs.writeFileSync(LAST, JSON.stringify({ date: today, sentAt: new Date().toISOString(), recipients: sent }) + "\n");
}

// Self-contained smoke used in tests: no fetch, same renderers as the previews.
export function renderForTests(f, dateLabel, opts = {}) {
  return {
    gratis: renderGratis(f, dateLabel, opts.lecturaDolar, opts.img),
    pagado: render(f, null, dateLabel, opts.lecturaDolar, opts.img),
  };
}
