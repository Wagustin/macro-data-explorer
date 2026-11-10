// empresa-lectura.js
// «Lectura de empresa»: qué hay hoy de cada empresa seguida y qué podría moverla, para el boletín.
// El modelo de PerData NO predice dirección: nunca afirma «subirá/bajará» ni recomienda comprar o
// vender. La lectura describe QUÉ HAY (hechos: precio, hechos SMV, titulares) y QUÉ PODRÍA MOVER
// la acción (factores). Un factor solo lleva dirección si hay una relación documentada y simple
// (una minera y el precio del metal que produce; un banco y la tasa de referencia); si no, va a
// «contexto» sin dirección, igual que en scripts/dolar-lectura.js (allí el cobre). Lo que produce
// o a qué se dedica cada empresa solo se usa si está en data/empresas.json (sector) o en los
// titulares/hechos SMV: nunca se inventa.
// hechosEmpresa(datos) es pura y calcula los hechos de los datos que arma el llamador.
// lecturaEmpresa(datos, opciones) pide al modelo un JSON con controles de forma (textoValido), de
// cifras (hechos citados) y con un revisor de segundo modelo; si falla tras UN reintento, o el LLM
// no está disponible, sale en versión determinista. lecturasEmpresas() procesa varias empresas por
// lotes (un prompt por empresa, concurrencia ≤ 3) y devuelve un Map nemo → lectura.
// Ejemplo real: node scripts/empresa-lectura.js --demo ALICORC1 BVN CVERDEC1
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON, askNIM } from "./llm.js";
import { textoValido } from "./news-digest.js";
import { prohibidoOk, cifrasEnHechos } from "./dolar-lectura.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return fallback; } };

// ---------- utilidades de formato (mismo estilo que dolar-lectura.js) ----------
const nf = (dec = 2) => new Intl.NumberFormat("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const n2 = (v) => nf(2).format(Number(v));
const pctFmt = (v) => `${nf(2).format(Number(v))} %`;
const pctSigno = (v) => `${Number(v) >= 0 ? "+" : "−"}${nf(2).format(Math.abs(Number(v)))} %`;
const fmtPctAbs = (v) => `${nf(2).format(Math.abs(Number(v)))} %`;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const round4 = (v) => Math.round(Number(v) * 10000) / 10000;
const fechaLarga = (iso) => {
  if (!iso || typeof iso !== "string") return null;
  const p = iso.slice(0, 10).split("-");
  if (p.length !== 3) return null;
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${Number(p[2])} de ${meses[Number(p[1]) - 1]} de ${p[0]}`;
};
const numOk = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const SENTIMIENTO_TONO = {
  POSITIVO: "en tono positivo",
  NEGATIVO: "en tono negativo",
  NEUTRO: "en tono neutro",
};
const FUENTE_SMV = "SMV, hechos de importancia";
const FUENTE_EMPRESA = "PerData, datos de la empresa";
const FUENTE_NOTICIAS = "Prensa, titulares recientes";
const FUENTE_MACRO = "BCRP, estadísticas diarias";

// ---------- 1. hechosEmpresa(datos): hechos calculados, uno por frase corta ----------
export function hechosEmpresa(datos = {}) {
  const hechos = [];
  const d = datos || {};
  const nemo = d.nemo || "";
  const nombre = d.nombre || nemo;
  const moneda = d.moneda || "S/";
  const precioFmt = (v) => `${moneda} ${n2(v)}`;

  // Precio y variación del día
  if (numOk(d.precio)) {
    const cierre = `La acción de ${nombre} cerró en ${precioFmt(d.precio)}`;
    const fecha = d.fecha_precio ? ` el ${fechaLarga(d.fecha_precio)}` : "";
    if (numOk(d.variacion_dia)) {
      hechos.push({ id: "precio", texto: `${cierre}${fecha}, con una variación de ${pctSigno(d.variacion_dia)} en la última sesión.`, fuente: FUENTE_EMPRESA });
    } else {
      hechos.push({ id: "precio", texto: `${cierre}${fecha}.`, fuente: FUENTE_EMPRESA });
    }
  }

  // Rango estadístico del pronóstico (p10/p50/p90 y fecha, si hay)
  const rango = d.rango;
  if (rango && numOk(rango.p10) && numOk(rango.p50) && numOk(rango.p90)) {
    const p10 = round4(rango.p10);
    const p50 = round4(rango.p50);
    const p90 = round4(rango.p90);
    const ancho = p50 !== 0 ? Math.abs((p90 - p10) / p50) * 100 : 0;
    const cuando = rango.fecha ? `, con fecha objetivo ${fechaLarga(rango.fecha)}` : "";
    hechos.push({
      id: "rango",
      texto: `El rango estadístico de ${nombre} va entre ${precioFmt(p10)} y ${precioFmt(p90)}, con centro en ${precioFmt(p50)}${cuando}; su ancho es de ${pctFmt(round2(ancho))} y es una estadística, no una promesa.`,
      fuente: FUENTE_EMPRESA,
    });
  }

  // Hechos SMV de los últimos 7 días (título con su fecha)
  const hechosSmv = (Array.isArray(d.hechos_smv) ? d.hechos_smv : [])
    .filter((h) => h && String(h.titulo || "").trim() && h.fecha)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, 3);
  hechosSmv.forEach((h, i) => {
    hechos.push({
      id: `smv-${i + 1}`,
      texto: `Hecho de importancia de la SMV del ${fechaLarga(h.fecha)}: ${String(h.titulo).trim()}`,
      fuente: FUENTE_SMV,
    });
  });

  // Titulares recientes (hasta 3), con fuente; el sentimiento se cita como tono, no como dirección
  const noticias = (Array.isArray(d.noticias) ? d.noticias : [])
    .filter((n) => n && n.titular)
    .sort((a, b) => String(b.fecha || a.fecha || "").localeCompare(String(a.fecha || "")))
    .slice(0, 3);
  noticias.forEach((n, i) => {
    const tono = SENTIMIENTO_TONO[String(n.sentimiento || "").toUpperCase()];
    hechos.push({
      id: `titular-${i + 1}`,
      texto: `Titular de ${n.fuente || "prensa"} ${tono ? `(${tono})` : ""}${n.fecha ? ` del ${fechaLarga(n.fecha)}` : ""}: ${String(n.titular).trim()}`,
      fuente: n.fuente || "prensa",
    });
  });

  // Macro: variación en 5 sesiones de cobre/oro/WTI/dólar y tasa de referencia
  const macro = d.macro || {};
  const muertes = [["cobre", "cobre"], ["oro", "oro"], ["wti", "petróleo WTI"], ["dolar", "dólar"]];
  for (const [clave, nombreMetal] of muertes) {
    const m = macro[clave];
    if (m && numOk(m.variacion_5)) {
      const unidad = clave === "dolar" ? `S/ ${n2(round2(m.valor))} por US$` : clave === "cobre" ? `US$ ${n2(round2(m.valor))} por libra` : clave === "oro" ? `US$ ${n2(round2(m.valor))} por onza` : `US$ ${n2(round2(m.valor))} por barril`;
      hechos.push({
        id: `macro-${clave}`,
        texto: `El ${nombreMetal} acumuló ${pctSigno(m.variacion_5)} en cinco sesiones y está a ${unidad}${m.fecha ? ` el ${fechaLarga(m.fecha)}` : ""}.`,
        fuente: FUENTE_MACRO,
      });
    }
  }
  const tasa = macro.tasa_referencia;
  if (tasa && numOk(tasa.valor)) {
    hechos.push({
      id: "macro-tasa",
      texto: `La tasa de referencia del BCRP está en ${pctFmt(round2(tasa.valor))}${tasa.fecha ? ` desde el ${fechaLarga(tasa.fecha)}` : ""}.`,
      fuente: FUENTE_MACRO,
    });
  }

  return hechos;
}

// ---------- 2. Validación de forma y cifras (reutiliza los helpers de dolar-lectura) ----------
const RESUMEN_MAX = 40;
const palabrasResumen = (texto) => String(texto || "").trim().split(/\s+/).filter(Boolean).length;

function bloqueValido(texto, hechosIds, hechos, rango) {
  return textoValido(texto, { minPalabras: 4 }) && prohibidoOk(texto) && cifrasEnHechos(texto, hechosIds, hechos, rango);
}

function puntosValidos(lista, hechos, rango) {
  return Array.isArray(lista) && lista.every((p) => p && typeof p.texto === "string" && Array.isArray(p.hechos) && p.hechos.length && p.hechos.every((id) => hechos.some((h) => h.id === id)) && bloqueValido(p.texto, p.hechos, hechos, rango));
}

// Relación documentada y simple entre un macro y la empresa: sector MINERAS con su metal
// principal (cobre u oro), y bancos con la tasa de referencia. Todo lo demás (WTI, dólar,
// oro en una no minera, zinc, estaño, hierro, etc.) no tiene dirección documentada y va a
// «contexto».
const METALES_MINERA = new Set(["cobre", "oro"]);
const SIN_DIRECCION = new Set(["macro-wti", "macro-dolar"]);

// Metal principal de cada minera, solo donde es público e inequívoco. Una minera que no esté
// aquí (zinc, estaño, hierro, polimetálicas) no recibe dirección de ningún metal: cobre y
// oro van a contexto.
const METAL_DE_MINERA = {
  CVERDEC1: "cobre",
  SCCO: "cobre",
  SPCCPI1: "cobre",
  SPCCPI2: "cobre",
  BVN: "oro",
  BUENAVI1: "oro",
  PODERC1: "oro",
};

function macroConDireccion(datos, idHecho) {
  const clave = String(idHecho || "").replace(/^macro-/, "");
  if (!METALES_MINERA.has(clave) && clave !== "tasa_referencia") return false;
  const sector = String(datos?.sector || "");
  if (clave === "tasa_referencia") return sector === "BANCOS Y FINANCIERAS";
  // Solo la minera cuyo metal principal coincida con el macro lleva dirección.
  const nemo = datos?.nemo ?? datos?.nemonico ?? "";
  return METAL_DE_MINERA[nemo] === clave;
}

// Guardia de dirección: un punto en al_alza/a_la_baja sostenido solo por hechos sin dirección
// documentada se mueve a «contexto». Los puntos de smv/titular que mencionan un mecanismo
// claro (modelo, noticias) se quedan en el lado que los puso; el determinista nunca los
// pone allí. No se reubica la dirección dentro de los lados (eso es del modelo): solo se
// retira la dirección no documentada.
export function corregirDireccionEmpresa(out, hechos, datos) {
  const contexto = Array.isArray(out?.contexto) ? [...out.contexto] : [];
  const reparte = (p) => {
    const ids = p.hechos || [];
    if (ids.length && ids.every((id) => SIN_DIRECCION.has(id) || (String(id).startsWith("macro-") && !macroConDireccion(datos, id)))) {
      contexto.push(p);
      return null;
    }
    return p;
  };
  const al_alza = (out?.al_alza || []).map(reparte).filter(Boolean);
  const a_la_baja = (out?.a_la_baja || []).map(reparte).filter(Boolean);
  return { ...out, al_alza, a_la_baja, contexto };
}

// ---------- 3. Prompts ----------
function promptLectura(datos, hechos) {
  const d = datos || {};
  const lista = hechos.map((h) => `${h.id}|${h.fuente}|${h.texto}`).join("\n");
  const nombre = d.nombre || d.nemo || "la empresa";
  const sector = d.sector ? ` Sector registrado en PerData: ${d.sector}. Solo puedes describir su actividad con ese sector y con los hechos de abajo; no inventes qué produce ni a qué se dedica.` : " No hay sector registrado en PerData: no inventes qué produce ni a qué se dedica, solo usa los hechos de abajo.";
  const metalPrincipal = d.metal_principal
    ? ` Metal principal de la minera: ${d.metal_principal}; solo ese metal puede llevar dirección.`
    : " No hay metal principal registrado para esta empresa: ni el cobre ni el oro llevan dirección.";
  return `Eres el redactor del boletín de PerData, un medio económico del Perú. Escribes la lectura de ${nombre} (nemónico ${d.nemo || "sin nemónico"}): qué hay hoy de la empresa y qué podría mover su acción, sin afirmar la dirección.
Hechos disponibles (formato: id|fuente|hecho):
${lista}
${sector}${metalPrincipal}
El modelo de PerData NO predice dirección: nunca afirmas «subirá» ni «bajará», nunca recomiendas comprar o vender, nunca nombras TimesFM y no usas cifras que no estén en los hechos citados. Cada punto cita los ids de los hechos que lo respaldan. El sentimiento de un titular se cita como tono («en tono positivo», «en tono negativo» o «en tono neutro»), nunca como dirección.

Reglas económicas (obligatorias): solo un factor macro con relación documentada y simple puede ir en al_alza o a_la_baja: (a) una empresa del sector MINERAS con el precio de su metal principal (cobre u oro) — si ese metal sube en cinco sesiones, suele acompañar un precio más alto de la minera y, si baja, uno más bajo; (b) un banco del sector BANCOS Y FINANCIERAS con la tasa de referencia — si la tasa sube, suele acompañar una presión bajista para el banco y, si baja, una presión alcista. Ningún otro hecho lleva dirección: el petróleo WTI, el dólar, el cobre/oro de una minera que no los produce, los hechos SMV y los titulares solo van en «que_hay» o en «contexto», con su cifra y sin decir hacia dónde empujan. Si el sector no es de esos dos, todo va sin dirección.

Escribe en español de Perú, tono llano de periodista económico, sin emojis, con tildes. Máximo 2 puntos por lista.

Devuelve SOLO este JSON:
{"resumen":"resumen de máximo 40 palabras con lo más importante de hoy","que_hay":[{"texto":"un hecho de la empresa en una frase, con su cifra","hechos":["id de hecho"]}],"podria_mover":{"al_alza":[{"texto":"una frase que describe un factor que podría mover la acción al alza, con su cifra","hechos":["id de hecho"]}],"a_la_baja":[{"texto":"una frase que describe un factor que podría mover la acción a la baja, con su cifra","hechos":["id de hecho"]}]},"contexto":[{"texto":"un dato del entorno sin dirección, con su cifra","hechos":["id de hecho"]}]}`;
}

function promptReintento(datos, texto, motivo) {
  const lista = factsLista(datos);
  const detalle = motivo ? `El revisor rechazó el texto por: ${motivo}.` : "El texto anterior no pasó el control de forma o de cifras.";
  const nombre = datos?.nombre || datos?.nemo || "la empresa";
  return `Eres el redactor del boletín de PerData. ${detalle} Vuelve a redactar la lectura de ${nombre} desde estos hechos (formato: id|fuente|hecho):
${lista}

Texto rechazado: ${String(texto || "").slice(0, 400)}

Reglas obligatorias: todo en español con tildes, tono llano, sin emojis; frases completas terminadas en punto; nunca afirmas «subirá», «bajará», «comprar» ni «vender»; ninguna cifra fuera de los hechos citados (cada punto cita sus ids); máximo 2 puntos por lista; un factor sin relación documentada va a «contexto» sin dirección; resumen de máximo 40 palabras.

Devuelve SOLO este JSON:
{"resumen":"máximo 40 palabras","que_hay":[{"texto":"frase","hechos":["id"]}],"podria_mover":{"al_alza":[{"texto":"frase","hechos":["id"]}],"a_la_baja":[{"texto":"frase","hechos":["id"]}]},"contexto":[{"texto":"frase","hechos":["id"]}]}`;
}

function factsLista(datos) {
  const hechos = hechosEmpresa(datos);
  return hechos.map((h) => `${h.id}|${h.fuente}|${h.texto}`).join("\n");
}

function promptRevision(datos, texto, hechosIds, hechos) {
  const citados = (hechosIds || []).map((id) => hechos.find((h) => h.id === id)).filter(Boolean);
  const lista = citados.map((h) => `${h.id}|${h.fuente}|${h.texto}`).join("\n") || "(sin hechos citados)";
  return `Eres el revisor de PerData. Otro modelo redactó la lectura de ${datos?.nombre || datos?.nemo || "la empresa"} a partir de los hechos citados; tú no redactas, solo compruebas.

Hechos citados (formato: id|fuente|hecho):
${lista}

Lectura redactada:
${String(texto || "").slice(0, 600)}

Evalúa solo estos tres puntos:
(a) Fidelidad: el texto no añade hechos, cifras, causas ni nombres que no estén en los hechos citados, y no inventa qué produce ni a qué se dedica la empresa.
(b) El texto no afirma dirección («subirá», «bajará»), no recomienda comprar o vender, no nombra TimesFM y no da dirección a un factor sin relación documentada.
(c) El español es correcto, con tildes, sin emojis ni palabras cortadas.

Devuelve SOLO este JSON:
{"ok": true|false, "motivo": "si ok es false, una frase con lo que falla; si es true, cadena vacía"}`;
}

// ---------- 4. Revisor: segundo modelo (mismo criterio que dolar-lectura y news-digest) ----------
const REVISOR_RESPALDO = "minimaxai/minimax-m3.1-flash";

function modelosRevisor() {
  const primero = process.env.NIM_REVIEW_MODEL || "mistralai/mistral-large-4-1t-a52b";
  return [...new Set([primero, REVISOR_RESPALDO])];
}

async function revisorNIM(datos, texto, hechosIds, hechos) {
  if (!process.env.NVIDIA_API_KEY) return null;
  for (const model of modelosRevisor()) {
    const res = await askNIM(model, promptRevision(datos, texto, hechosIds, hechos), { timeoutMs: 30000, maxTokens: 1000 });
    if (typeof res?.out?.ok === "boolean") return { modelo: res.model, ok: res.out.ok, motivo: String(res.out.motivo || "") };
  }
  return null;
}

// ---------- 5. Versión determinista (una frase por hecho, plantillas simples) ----------
export function lecturaEmpresaDeterminista(datos, hechos) {
  const h = hechos ?? hechosEmpresa(datos);
  if (!h.length) {
    return {
      resumen: "Sin hechos de importancia ni noticias en los últimos 7 días.",
      que_hay: [],
      podria_mover: { al_alza: [], a_la_baja: [] },
      contexto: [],
    };
  }
  const byId = (id) => h.find((x) => x.id === id);
  const pctDe = (hecho) => {
    const m = String(hecho?.texto || "").match(/([+−-]?\d+(?:[.,]\d+)?) %/);
    return m ? Number(m[1].replace(",", ".").replace("−", "-")) : null;
  };
  const metalDe = (id) => id.replace(/^macro-/, "");
  const nombreMetal = { cobre: "cobre", oro: "oro" };

  const que_hay = [];
  const al_alza = [];
  const a_la_baja = [];
  const contexto = [];

  for (const f of ["precio", "rango", "smv-1", "smv-2", "smv-3", "titular-1", "titular-2", "titular-3"]) {
    const hecho = byId(f);
    if (!hecho) continue;
    if (bloqueValido(hecho.texto, [hecho.id], h, datos?.rango)) que_hay.push({ texto: hecho.texto, hechos: [hecho.id] });
  }

  // Solo factores con relación documentada llevan dirección; el resto va a contexto.
  // También el determinista solo admite un metal como máximo por lado en podria_mover:
  // si cobre y oro empujan al mismo lado, el punto extra va a contexto sin dirección.
  const macroCtx = (hecho, id) => {
    if (bloqueValido(hecho.texto, [id], h, datos?.rango)) contexto.push({ texto: hecho.texto, hechos: [id] });
  };
  for (const id of ["macro-cobre", "macro-oro", "macro-tasa", "macro-wti", "macro-dolar"]) {
    const hecho = byId(id);
    if (!hecho) continue;
    const v = pctDe(hecho);
    // La tasa de referencia: con solo su nivel no hay cambio documentado y no lleva dirección;
    // en el determinista va a contexto con su cifra. La dirección de la tasa solo puede
    // ponerla el modelo, con la guardia (corregirDireccionEmpresa) y el revisor de por medio.
    if (id === "macro-tasa") {
      macroCtx(hecho, id);
      continue;
    }
    if (METALES_MINERA.has(metalDe(id)) && macroConDireccion(datos, id) && v != null && Math.abs(v) >= 1) {
      const metal = nombreMetal[metalDe(id)];
      const txt = v > 0
        ? `El ${metal} subió ${fmtPctAbs(v)} en cinco sesiones, un factor que suele acompañar un precio más alto de la minera.`
        : `El ${metal} bajó ${fmtPctAbs(v)} en cinco sesiones, un factor que suele acompañar un precio más bajo de la minera.`;
      const lista = v > 0 ? al_alza : a_la_baja;
      if (lista.length >= 1 || !bloqueValido(txt, [id], h, datos?.rango)) {
        macroCtx(hecho, id);
        continue;
      }
      lista.push({ texto: txt, hechos: [id] });
      continue;
    }
    macroCtx(hecho, id);
  }

  const fraseResumen = que_hay[0]?.texto || (al_alza[0] || a_la_baja[0] || contexto[0] || {}).texto || "";
  const resumen = fraseResumen ? `${fraseResumen.replace(/\s+de\s+\S+:/, ":").slice(0, 200)}` : "Sin hechos de importancia ni noticias en los últimos 7 días.";
  const resumenCorto = resumen.length > 240 ? `${resumen.slice(0, 237).trimEnd()}…` : resumen;
  return {
    resumen: palabrasResumen(resumenCorto) > RESUMEN_MAX ? `${resumenCorto.split(/\s+/).slice(0, RESUMEN_MAX).join(" ")}.` : resumenCorto,
    que_hay: que_hay.slice(0, 2),
    podria_mover: { al_alza: al_alza.slice(0, 2), a_la_baja: a_la_baja.slice(0, 2) },
    contexto: contexto.slice(0, 2),
  };
}

// ---------- 6. lecturaEmpresa(datos, opciones) ----------
export async function lecturaEmpresa(datos, opciones = {}) {
  const hechos = hechosEmpresa(datos);
  const d = { ...(datos || {}), metal_principal: METAL_DE_MINERA[datos?.nemo ?? datos?.nemonico ?? ""] || null };

  // Sin hechos: respuesta determinista sin llamar al LLM.
  if (!hechos.length) {
    return {
      resumen: "Sin hechos de importancia ni noticias en los últimos 7 días.",
      que_hay: [],
      podria_mover: { al_alza: [], a_la_baja: [] },
      contexto: [],
      modelo: null,
      determinista: true,
      revision: { modelo: null, ok: null, motivo: "sin hechos" },
    };
  }

  const ask = opciones.askJSON || askJSON;
  const revisar = opciones.revisar || revisorNIM;

  const ordena = (out) => {
    const limpio = (lista) => (Array.isArray(lista) ? lista.filter((p) => p && typeof p.texto === "string" && Array.isArray(p.hechos) && p.hechos.length && p.hechos.every((id) => hechos.some((h) => h.id === id)) && bloqueValido(p.texto, p.hechos, hechos, d.rango)).slice(0, 2) : []);
    const mal = (lista) => (Array.isArray(lista) ? lista.filter((p) => p && typeof p.texto === "string" && Array.isArray(p.hechos) && p.hechos.length && p.hechos.some((id) => hechos.some((h) => h.id === id)) && !bloqueValido(p.texto, p.hechos, hechos, d.rango)) : []);
    const podria = out?.podria_mover || out?.podria || {};
    const malTodo = [...mal(out?.que_hay), ...mal(podria.al_alza), ...mal(podria.a_la_baja), ...mal(out?.contexto)];
    return {
      resumen: typeof out?.resumen === "string" ? String(out.resumen) : "",
      que_hay: limpio(out?.que_hay),
      podria_mover: { al_alza: limpio(podria.al_alza), a_la_baja: limpio(podria.a_la_baja) },
      contexto: limpio(out?.contexto),
      mal: malTodo,
    };
  };

  const pasaControles = (cand) => {
    if (cand.mal && cand.mal.length) return false;
    if (cand.resumen && (palabrasResumen(cand.resumen) > RESUMEN_MAX || !textoValido(cand.resumen, { minPalabras: 4 }) || !prohibidoOk(cand.resumen))) return false;
    return true;
  };

  const textoDe = (cand) => [
    ...(cand.que_hay || []).map((p) => `${p.texto}`),
    ...(cand.podria_mover?.al_alza || []).map((p) => `${p.texto}`),
    ...(cand.podria_mover?.a_la_baja || []).map((p) => `${p.texto}`),
    ...(cand.contexto || []).map((p) => `${p.texto}`),
    cand.resumen || "",
  ].join(" ");

  let salida = null;
  let modeloUsado = null;
  let revision = { modelo: null, ok: null, motivo: "sin modelo" };
  let salidaPrev = null;
  let motivoPrev = null;

  if (process.env.NVIDIA_API_KEY || opciones.askJSON) {
    for (let intento = 0; intento < 2 && !salida; intento++) {
      const prompt = intento === 0 ? promptLectura(d, hechos) : promptReintento(d, salidaPrev, motivoPrev);
      let res = null;
      try {
        res = await ask(prompt, { budgetMs: 120 * 1000 });
      } catch (e) {
        console.error(`Lectura ${d.nemo || ""}: ${e.message}`);
      }
      if (!res || !res.out) continue;
      const cand = ordena(corregirDireccionEmpresa(res.out, hechos, d));
      if (!pasaControles(cand)) {
        if (intento === 0) {
          salidaPrev = (cand.mal?.[0]?.texto || textoDe(cand)).slice(0, 400);
          motivoPrev = "el resumen o los puntos no pasaron el control de forma o de cifras";
        }
        continue;
      }
      const { mal, ...candLimpio } = cand;
      const ids = [...candLimpio.que_hay, ...candLimpio.podria_mover.al_alza, ...candLimpio.podria_mover.a_la_baja, ...candLimpio.contexto].flatMap((p) => p.hechos);
      const rev = await revisar(d, textoDe(candLimpio), ids, hechos);
      if (!rev) {
        // revisor caído: solo pasa lo que cumple forma y cifras (ya comprobado)
        salida = candLimpio;
        modeloUsado = res.model;
        revision = { modelo: null, ok: null, motivo: "revisor no disponible" };
        break;
      }
      if (rev.ok) {
        salida = candLimpio;
        modeloUsado = res.model;
        revision = { modelo: rev.modelo, ok: true, motivo: rev.motivo };
        break;
      }
      // revisor rechazó: UN reintento con el motivo
      if (intento === 0) {
        salidaPrev = textoDe(candLimpio);
        motivoPrev = rev.motivo || "fidelidad";
      }
      salida = null;
      revision = { modelo: rev.modelo, ok: false, motivo: rev.motivo };
    }
  }

  if (salida) {
    return { ...salida, modelo: modeloUsado || null, determinista: false, revision };
  }
  // Si falla tras UN reintento, o no hay LLM: versión determinista.
  return {
    ...lecturaEmpresaDeterminista(d, hechos),
    modelo: modeloUsado || null,
    determinista: true,
    revision: { modelo: null, ok: null, motivo: "versión determinista" },
  };
}

// ---------- 7. lecturasEmpresas(listaDatos, opciones): lotes con concurrencia ≤ 3 ----------
export async function lecturasEmpresas(listaDatos, opciones = {}) {
  const lista = Array.isArray(listaDatos) ? listaDatos : [];
  const resultado = new Map();
  let indice = 0;
  const trabajar = async () => {
    while (indice < lista.length) {
      const item = lista[indice++];
      const nemo = String(item?.nemo || "");
      try {
        resultado.set(nemo, await lecturaEmpresa(item, opciones));
      } catch (e) {
        console.error(`Lectura ${nemo}: ${e.message}`);
        resultado.set(nemo, {
          resumen: "Sin hechos de importancia ni noticias en los últimos 7 días.",
          que_hay: [],
          podria_mover: { al_alza: [], a_la_baja: [] },
          contexto: [],
          modelo: null,
          determinista: true,
          revision: { modelo: null, ok: null, motivo: "versión determinista" },
        });
      }
    }
  };
  await Promise.all([trabajar(), trabajar(), trabajar()]);
  return resultado;
}

// ---------- 8. Demo: arma datos desde data/ ----------
const varPct = (actual, anterior) => (Number(actual) / Number(anterior) - 1) * 100;
const serieOk = (serie) => Array.isArray(serie) && serie.length >= 1 && serie.every((p) => Array.isArray(p) && p[0] && Number.isFinite(Number(p[1])));
const macroDeSerie = (serie) => {
  if (!serieOk(serie)) return null;
  const [f0, v0] = serie[serie.length - 1];
  const f5 = serie[Math.max(0, serie.length - 6)];
  return { valor: round4(v0), variacion_5: round2(varPct(v0, f5[1])), fecha: f0.slice(0, 10) };
};

function armaDatosDemo(nemos) {
  const empresas = read("empresas.json", { emisores: [] });
  const estado = read("empresas-estado.json", { emisores: {} });
  const hechosSmv = read("smv-hechos.json", { hechos: {} }).hechos || {};
  const clasif = read("noticias-clasificadas.json", { items: {} }).items || {};
  const feed = read("noticias.json", { noticias: [] }).noticias || [];
  const byId = Object.fromEntries(feed.map((n) => [n.id, n]));
  const bcrp = read("official/bcrp-daily.json", { series: {} });
  const ctx = read("official/bcrp-contexto.json", { series: {} });

  const macro = {};
  for (const [clave, nombre] of [["cobre", "COBRE"], ["oro", "ORO"], ["wti", "WTI"], ["dolar", "PEN"]]) {
    const m = macroDeSerie(bcrp.series?.[nombre]?.serie);
    if (m) macro[clave] = m;
  }
  const tasaSerie = ctx.series?.TASA_REFERENCIA?.serie;
  if (serieOk(tasaSerie)) {
    const [f, v] = tasaSerie[tasaSerie.length - 1];
    macro.tasa_referencia = { valor: round2(v), fecha: String(f).slice(0, 10) };
  }

  const since = Date.now() - 7 * 24 * 36e5;
  const lista = {};
  for (const em of empresas.emisores || []) {
    for (const v of em.valores || []) {
      if (nemos.length && !nemos.includes(v.nemonico)) continue;
      const st = (Object.values(estado.emisores || {}).find((x) => x.nemonico === v.nemonico)) || {};
      const smv = (hechosSmv[v.nemonico] || [])
        .filter((h) => h && h.titulo && Date.parse(String(h.fecha).replace(" ", "T")) >= since)
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((h) => ({ fecha: String(h.fecha).slice(0, 10), titulo: h.titulo }));
      const noticias = Object.entries(clasif)
        .filter(([, c]) => (c.empresas || []).includes(v.nemonico))
        .map(([id, c]) => ({ n: byId[id], c }))
        .filter(({ n }) => n && Date.parse(n.fecha_iso) >= since)
        .sort((a, b) => String(b.n.fecha_iso).localeCompare(String(a.n.fecha_iso)))
        .slice(0, 3)
        .map(({ n, c }) => ({ titular: n.titulo, fuente: n.fuente, fecha: String(n.fecha_iso).slice(0, 10), sentimiento: c.sentimiento }));
      lista[v.nemonico] = {
        nemo: v.nemonico,
        nombre: em.razonSocial || v.nemonico,
        sector: em.sector || null,
        precio: numOk(st.ultimo_cierre) ? st.ultimo_cierre : null,
        moneda: st.moneda || v.moneda || "S/",
        fecha_precio: st.ultima_fecha || null,
        variacion_dia: null,
        rango: null,
        hechos_smv: smv,
        noticias,
        macro,
      };
    }
  }
  return lista;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--demo");
  const lista = armaDatosDemo(args);
  const nemos = Object.keys(lista);
  if (!nemos.length) {
    console.log("Sin empresas encontradas en data/ para esos nemónicos.");
    return;
  }
  const salida = await lecturasEmpresas(Object.values(lista));
  const qaDir = path.resolve(ROOT, "..", "handoff", "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  const destino = path.join(qaDir, "lectura-empresas-ejemplo.json");
  const contenido = {};
  for (const nemo of nemos) contenido[nemo] = salida.get(nemo);
  fs.writeFileSync(destino, JSON.stringify(contenido, null, 1) + "\n");
  console.log(`Ejemplo: ${destino}`);
  console.log(JSON.stringify(contenido, null, 1));
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) await main();
