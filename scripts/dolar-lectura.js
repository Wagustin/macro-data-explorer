// dolar-lectura.js
// «Lectura del dólar»: qué podría presionar al alza y a la baja, para el boletín.
// El modelo de PerData NO predice dirección: el centro del rango es el último cierre y en
// las pruebas las noticias no mejoraron el rango. Por eso la lectura nunca afirma
// «subirá/bajará»: describe factores que PODRÍAN presionar al alza o a la baja, cada uno
// con su dato, y recuerda que el rango es estadístico.
// hechosDolar(datos) es pura y calcula los hechos de los datos que arma el llamador.
// lecturaDolar(datos, opciones) pide al modelo un JSON por horizonte (manana, semana, mes)
// con controles de forma (textoValido), de cifras (hechos citados) y con un revisor de
// segundo modelo; si falla un horizonte tras UN reintento, o el LLM no está disponible,
// sale en versión determinista. Devuelve también modelo y revision por horizonte.
// Ejecutar con datos reales: node scripts/dolar-lectura.js --demo
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON, askNIM } from "./llm.js";
import { textoValido } from "./news-digest.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return fallback; } };

// ---------- utilidades de formato (estilo de build-dolar-html.js / boletin.js) ----------
const nf = (dec = 2) => new Intl.NumberFormat("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const n3 = (v) => nf(3).format(Number(v));
const n2 = (v) => nf(2).format(Number(v));
const pctFmt = (v) => `${nf(2).format(Number(v))} %`;
const pctSigno = (v) => `${Number(v) >= 0 ? "+" : "−"}${nf(2).format(Math.abs(Number(v)))} %`;
const varPct = (actual, anterior) => (Number(actual) / Number(anterior) - 1) * 100;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const serieOk = (serie) => Array.isArray(serie) && serie.length >= 1 && serie.every((p) => Array.isArray(p) && p[0] && Number.isFinite(Number(p[1])));
const fechaLarga = (iso) => {
  if (!iso || typeof iso !== "string") return null;
  const p = iso.slice(0, 10).split("-");
  if (p.length !== 3) return null;
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${Number(p[2])} de ${meses[Number(p[1]) - 1]} de ${p[0]}`;
};

// ---------- 1. hechosDolar(datos): hechos calculados, uno por frase corta ----------
const FUENTE_BCRP_DIARIA = "BCRP, estadísticas diarias";
const FUENTE_BCRP_CONTEXTO = "BCRP, estadísticas macroeconómicas y monetarias";

export function hechosDolar(datos = {}) {
  const hechos = [];
  const d = datos || {};
  const series = d.series || {};

  const serieDe = (clave) => (serieOk(series[clave]?.serie) ? series[clave].serie : null);

  // Dólar: variación en 1 y 5 sesiones
  const pen = serieDe("PEN");
  if (pen) {
    const [f0, v0] = pen[pen.length - 1];
    const [f1, v1] = pen[pen.length - 2];
    const f5 = pen[Math.max(0, pen.length - 6)];
    hechos.push({
      id: "dolar-1",
      texto: `El dólar cerró en S/ ${n3(v0)} el ${fechaLarga(f0)}, con una variación de ${pctSigno(varPct(v0, v1))} en una sesión.`,
      fuente: FUENTE_BCRP_DIARIA,
    });
    hechos.push({
      id: "dolar-5",
      texto: `El dólar cambió ${pctSigno(varPct(v0, f5[1]))} en las últimas 5 sesiones (de S/ ${n3(f5[1])} el ${fechaLarga(f5[0])} a S/ ${n3(v0)}).`,
      fuente: FUENTE_BCRP_DIARIA,
    });
  }

  // Cobre, oro y WTI: variación en 5 sesiones (%)
  const variacion5 = (clave, nombre, unidadFmt) => {
    const s = serieDe(clave);
    if (!s) return;
    const [f0, v0] = s[s.length - 1];
    const f5 = s[Math.max(0, s.length - 6)];
    hechos.push({
      id: `${clave.toLowerCase()}-5`,
      texto: `El ${nombre} acumuló ${pctSigno(varPct(v0, f5[1]))} en cinco sesiones, a ${unidadFmt(v0)} el ${fechaLarga(f0)}.`,
      fuente: FUENTE_BCRP_DIARIA,
    });
  };
  variacion5("COBRE", "cobre", (v) => `US$ ${n2(v)} por libra`);
  variacion5("ORO", "oro", (v) => `US$ ${n2(v)} por onza`);
  variacion5("WTI", "petróleo WTI", (v) => `US$ ${n2(v)} por barril`);

  // Intervención cambiaria del BCRP: suma de las últimas 5 sesiones (millones de US$)
  const interv = (d.contexto || {}).INTERVENCION_BCRP;
  if (serieOk(interv?.serie)) {
    const ultimas = interv.serie.slice(-5);
    const total = ultimas.reduce((acc, [, v]) => acc + Number(v), 0);
    hechos.push({
      id: "intervencion-5",
      texto: `La intervención cambiaria del BCRP sumó US$ ${n2(round2(total))} millones en las últimas 5 sesiones.`,
      fuente: FUENTE_BCRP_CONTEXTO,
    });
  }

  // Tasa de referencia y reservas (RIN) con su fecha
  const tasa = (d.contexto || {}).TASA_REFERENCIA;
  if (serieOk(tasa?.serie)) {
    const [f, v] = tasa.serie[tasa.serie.length - 1];
    hechos.push({
      id: "tasa",
      texto: `La tasa de referencia del BCRP está en ${pctFmt(v)} desde el ${fechaLarga(f)}.`,
      fuente: FUENTE_BCRP_CONTEXTO,
    });
  }
  const rin = (d.contexto || {}).RIN;
  if (serieOk(rin?.serie)) {
    const [f, v] = rin.serie[rin.serie.length - 1];
    hechos.push({
      id: "rin",
      texto: `Las reservas internacionales netas fueron de US$ ${n2(v)} millones el ${fechaLarga(f)}.`,
      fuente: FUENTE_BCRP_CONTEXTO,
    });
  }

  // Hasta 4 titulares recientes del tema dólar/BCRP/metales, con su fuente
  const noticias = Array.isArray(d.noticias) ? d.noticias : [];
  const titulares = noticias
    .filter((n) => n && n.titulo)
    .sort((a, b) => String(b.fecha_iso || "").localeCompare(String(a.fecha_iso || "")))
    .slice(0, 4);
  titulares.forEach((n, i) => {
    hechos.push({
      id: `titular-${i + 1}`,
      texto: `Titular de ${n.fuente || "prensa"}: ${String(n.titulo).trim()}`,
      fuente: n.fuente || "prensa",
    });
  });

  return hechos;
}

// ---------- 2. Validación de forma, cifras y prohibición de afirmaciones ----------
// Nota: \b no funciona con á (no es \w en JS): «subirá» no tendría borde final.
// Se usa /(^|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ])...($|[^A-Za-z...])/ como hace news-digest.
const palabra = (w) => new RegExp(`(?:^|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ])${w}(?:$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ])`, "i");
const PROHIBIDO = [
  { re: palabra("subirá"), msg: "afirma «subirá» como certeza" },
  { re: palabra("bajará"), msg: "afirma «bajará» como certeza" },
  { re: palabra("subiran") , msg: "afirma la dirección sin matiz" },
  { re: palabra("bajaran") , msg: "afirma la dirección sin matiz" },
  { re: palabra("comprar") , msg: "recomienda comprar o vender" },
  { re: palabra("vender") , msg: "recomienda comprar o vender" },
  { re: palabra("recomendamos") , msg: "recomienda acción" },
  { re: palabra("timesfm") , msg: "nombra TimesFM" },
];

export function prohibidoOk(texto) {
  const t = String(texto || "");
  return PROHIBIDO.every(({ re }) => !re.test(t));
}

function numsDe(texto) {
  return (String(texto || "").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."));
}

// Control de cifras: cada cifra del texto debe aparecer en alguno de los hechos
// citados (o en el rango publicado para el resumen, que el llamador pasa aparte).
// Solo se eximen los días del mes (1-31 sin decimales) y el año 2026 en fechas;
// el grounded() del digest exime <32 porque allí solo hay días de mes, pero aquí
// una variación inventada (p. ej. 9.99 %) también es <32 y debe rechazarse.
export function cifrasEnHechos(texto, hechosIds, hechos, rango) {
  const byId = {};
  for (const h of hechos || []) byId[h.id] = h.texto || "";
  const fuente = hechosIds.map((id) => byId[id] || "").join(" ");
  const conocidas = new Set(numsDe(fuente));
  if (rango) for (const v of [rango.p10, rango.p50, rango.p90]) {
    conocidas.add(String(Number(v)));
    conocidas.add(n3(v).replace(",", "."));
    conocidas.add(n2(v).replace(",", "."));
  }
  return numsDe(texto).every((n) => {
    if (conocidas.has(n) || conocidas.has(String(Number(n)))) return true;
    if (n === "2026") return true;
    // día del mes: entero entre 1 y 31, sin decimales
    if (/^\d{1,2}$/.test(n)) {
      const v = Number(n);
      if (v >= 1 && v <= 31) return true;
    }
    return false;
  });
}

function bloqueValido(texto, hechosIds, hechos, rango) {
  return textoValido(texto, { minPalabras: 4 }) && prohibidoOk(texto) && cifrasEnHechos(texto, hechosIds, hechos, rango);
}

// ---------- 3. Prompts ----------
const RANGOS_TRAD = {
  manana: "mañana",
  semana: "la próxima semana",
  mes: "el próximo mes",
};

function promptHorizonte(nombreHor, hechos, rango) {
  const lista = hechos.map((h) => `${h.id}|${h.fuente}|${h.texto}`).join("\n");
  return `Eres el redactor del boletín de PerData, un medio económico del Perú. Escribes la lectura de lo que PODRÍA presionar al alza o a la baja al dólar en ${RANGOS_TRAD[nombreHor] || nombreHor}, sin afirmar la dirección.
Hechos disponibles (formato: id|fuente|hecho):
${lista}

Rango estadístico para ${RANGOS_TRAD[nombreHor] || nombreHor}: P10 S/ ${n3(rango.p10)}, P50 S/ ${n3(rango.p50)}, P90 S/ ${n3(rango.p90)}${rango.fecha ? `, fecha objetivo ${rango.fecha}` : ""}. El rango es estadístico: describe una frecuencia histórica, no una promesa; el centro es el último cierre.
El modelo de PerData NO predice dirección: nunca afirmas «subirá» ni «bajará», nunca recomiendas comprar o vender, nunca nombras TimesFM y no usas cifras que no estén en los hechos citados. Cada punto cita los ids de los hechos que lo respaldan.

Reglas económicas (obligatorias): el cobre es la principal exportación del Perú: si el cobre sube, suele acompañar un sol más fuerte (dólar a la baja); si baja, un sol más débil (dólar al alza). NO atribuyas dirección al oro, al petróleo, a los movimientos recientes del propio dólar, a las operaciones del BCRP, a la tasa de referencia ni a las reservas: esos hechos solo van en «contexto», con su cifra y sin decir hacia dónde empujan. Un titular solo puede ir en al_alza o a_la_baja si el propio titular menciona un mecanismo claro que mueva el dólar (el BCRP, minería, aranceles, tasas, política económica); si no, va en «contexto».

Escribe en español de Perú, tono llano de periodista económico, sin emojis, con tildes.

Devuelve SOLO este JSON:
{"contexto":[{"texto":"hecho relevante sin dirección, con su cifra","hechos":["id"]}],"al_alza":[{"texto":"una frase que describe un factor que podría presionar el dólar al alza, con su cifra","hechos":["id de hecho"]}],"a_la_baja":[{"texto":"una frase que describe un factor que podría presionar el dólar a la baja, con su cifra","hechos":["id de hecho"]}],"resumen":"resumen de máximo 45 palabras que cita el rango"}
0-3 puntos por lado, solo si hay hechos que los respalden; es válido dejar un lado vacío.`;
}

function promptReintento(nombreHor, horizontesFallidos, hechos, rango, motivo) {
  const fallido = horizontesFallidos || {};
  const lista = hechos.map((h) => `${h.id}|${h.fuente}|${h.texto}`).join("\n");
  const detalle = motivo ? `El revisor rechazó el texto por: ${motivo}.` : "El texto anterior no pasó el control de forma o de cifras.";
  return `Eres el redactor del boletín de PerData. ${detalle} Vuelve a redactar el horizonte ${nombreHor} desde estos hechos (formato: id|fuente|hecho):
${lista}

Rango estadístico: P10 S/ ${n3(rango.p10)}, P50 S/ ${n3(rango.p50)}, P90 S/ ${n3(rango.p90)}.
Texto rechazado: ${String(fallido.texto || "").slice(0, 400)}

Reglas obligatorias: todo en español con tildes, tono llano, sin emojis; frases completas terminadas en punto; nunca afirmas «subirá», «bajará», «comprar» ni «vender»; ninguna cifra fuera de los hechos citados (cada punto cita sus ids);Resumen de máximo 45 palabras que cita el rango.

Devuelve SOLO este JSON:
{"al_alza":[{"texto":"frase","hechos":["id"]}],"a_la_baja":[{"texto":"frase","hechos":["id"]}],"resumen":"máximo 45 palabras"}`;
}

function promptRevision(nombreHor, texto, hechosIds, hechos) {
  const citados = (hechosIds || []).map((id) => hechos.find((h) => h.id === id)).filter(Boolean);
  const lista = citados.map((h) => `${h.id}|${h.fuente}|${h.texto}`).join("\n") || "(sin hechos citados)";
  return `Eres el revisor de PerData. Otro modelo redactó la lectura del horizonte ${nombreHor} a partir de los hechos citados; tú no redactas, solo compruebas.

Hechos citados (formato: id|fuente|hecho):
${lista}

Lectura redactada:
${String(texto || "").slice(0, 600)}

Evalúa solo estos tres puntos:
(a) Fidelidad: el texto no añade hechos, cifras, causas ni nombres que no estén en los hechos citados.
(b) El texto no afirma dirección («subirá», «bajará») ni recomienda comprar o vender, y no nombra TimesFM.
(c) El español es correcto, con tildes, sin emojis ni palabras cortadas.

Devuelve SOLO este JSON:
{"ok": true|false, "motivo": "si ok es false, una frase con lo que falla; si es true, cadena vacía"}`;
}

// ---------- 4. Revisor: news-digest.js no exporta revisorNIM ni modelosRevisor ----------
// Se replica mínimo aquí: llamada directa a askNIM con NIM_REVIEW_MODEL (mismo criterio que el digest).
const REVISOR_RESPALDO = "minimaxai/minimax-m3.1-flash";

function modelosRevisor() {
  const primero = process.env.NIM_REVIEW_MODEL || "mistralai/mistral-large-4-1t-a52b";
  return [...new Set([primero, REVISOR_RESPALDO])];
}

async function revisorNIM(nombreHor, texto, hechosIds, hechos) {
  if (!process.env.NVIDIA_API_KEY) return null;
  for (const model of modelosRevisor()) {
    const res = await askNIM(model, promptRevision(nombreHor, texto, hechosIds, hechos), { timeoutMs: 30000, maxTokens: 1000 });
    if (typeof res?.out?.ok === "boolean") return { modelo: res.model, ok: res.out.ok, motivo: String(res.out.motivo || "") };
  }
  return null;
}

// ---------- 5. Versión determinista ----------
export function lecturaDeterminista(hechos, rango, nombreHor) {
  const byId = (id) => hechos.find((h) => h.id === id);
  const cobre = byId("cobre-5");
  const oro = byId("oro-5");
  const wti = byId("wti-5");
  const interv = byId("intervencion-5");
  const dolar5 = byId("dolar-5");
  const dolar1 = byId("dolar-1");
  const tasa = byId("tasa");
  const rin = byId("rin");
  const titulares = hechos.filter((h) => /^titular-\d+$/.test(h.id));

  const pctDe = (h) => {
    const m = String(h?.texto || "").match(/([+\−-]?\d+(?:[.,]\d+)?) %/);
    return m ? Number(m[1].replace(",", ".").replace("−", "-")) : null;
  };
  const cifraDe = (h) => {
    const m = String(h?.texto || "").match(/US\$ (\d+(?:[.,]\d+)?) millones/);
    return m ? Number(m[1].replace(",", ".")) : null;
  };

  // Only one link is directional and documented: copper is Peru's main export, so a rising copper
  // price tends to go with a stronger sol (dollar down) and a falling one with a weaker sol (dollar
  // up). Gold, oil, the dollar's own recent moves and the BCRP operations (the sign convention of
  // the series is not stated in the data) are NOT given a direction: they go to «contexto».
  const al_alza = [];
  const a_la_baja = [];
  const contexto = [];
  if (cobre && pctDe(cobre) != null && Math.abs(pctDe(cobre)) >= 1) {
    const v = pctDe(cobre);
    const txt = v > 0
      ? `El cobre subió ${fmtPctAbs(v)} en cinco sesiones, un factor que suele acompañar un sol más fuerte y, con él, un dólar más bajo.`
      : `El cobre bajó ${fmtPctAbs(v)} en cinco sesiones, un factor que suele acompañar un sol más débil y, con él, un dólar más alto.`;
    if (bloqueValido(txt, ["cobre-5"], hechos)) (v > 0 ? a_la_baja : al_alza).push({ texto: txt, hechos: ["cobre-5"] });
  }
  // Neutral context: the facts as they are, without claiming a direction
  for (const h of [interv, tasa, rin, dolar5]) {
    if (h && bloqueValido(h.texto, [h.id], hechos)) contexto.push({ texto: h.texto, hechos: [h.id] });
  }
  for (const h of titulares.slice(0, 2)) {
    if (bloqueValido(h.texto, [h.id], hechos)) contexto.push({ texto: h.texto, hechos: [h.id] });
  }

  const resumen = `El rango para ${RANGOS_TRAD[nombreHor] || nombreHor} va entre S/ ${n3(rango.p10)} y S/ ${n3(rango.p90)}, con centro en el último cierre; es una estadística, no una promesa.`;
  return {
    al_alza: al_alza.slice(0, 3),
    a_la_baja: a_la_baja.slice(0, 3),
    contexto: contexto.slice(0, 5),
    resumen,
  };
}

// Directional guard for the model's output: the copper link is forced to its correct side, and a
// point that is supported only by facts without a documented direction moves to «contexto».
const SIN_DIRECCION = new Set(["oro-5", "wti-5", "dolar-1", "dolar-5", "intervencion-5", "tasa", "rin"]);
export function corregirDireccion(out, hechos) {
  const byId = (id) => hechos.find((h) => h.id === id);
  const pct = (h) => {
    const m = String(h?.texto || "").match(/([+\u2212-]?\d+(?:[.,]\d+)?) %/);
    return m ? Number(m[1].replace(",", ".").replace("\u2212", "-")) : null;
  };
  const alza = []; const baja = []; const contexto = Array.isArray(out?.contexto) ? [...out.contexto] : [];
  const reparte = (p, lado) => {
    const ids = p.hechos || [];
    if (ids.includes("cobre-5")) {
      const v = pct(byId("cobre-5"));
      if (v == null || Math.abs(v) < 1) { contexto.push(p); return; }
      (v > 0 ? baja : alza).push(p);
    } else if (ids.length && ids.every((id) => SIN_DIRECCION.has(id))) {
      contexto.push(p);
    } else {
      (lado === "alza" ? alza : baja).push(p);
    }
  };
  for (const p of out?.al_alza || []) reparte(p, "alza");
  for (const p of out?.a_la_baja || []) reparte(p, "baja");
  return { ...out, al_alza: alza, a_la_baja: baja, contexto };
}

function fmtPctAbs(v) {
  return `${nf(2).format(Math.abs(Number(v)))} %`;
}

// ---------- 6. lecturaDolar(datos, opciones) ----------
export async function lecturaDolar(datos, opciones = {}) {
  const hechos = hechosDolar(datos);
  const rangos = (datos || {}).rangos || {};
  const horizontes = ["manana", "semana", "mes"];
  const ask = opciones.askJSON || askJSON;
  const revisar = opciones.revisar || revisorNIM;

  const resultado = { actualizado: new Date().toISOString(), hechos, horizontes: {}, modelo: null, revision: null };

  for (const nombreHor of horizontes) {
    const rango = rangos[nombreHor];
    if (!rango || !Number.isFinite(Number(rango.p10))) {
      resultado.horizontes[nombreHor] = lecturaDeterminista(hechos, rango || { p10: 0, p50: 0, p90: 0 }, nombreHor);
      resultado.horizontes[nombreHor].determinista = true;
      continue;
    }

    const ordena = (out) => {
      const okPunto = (p) => p && typeof p.texto === "string" && Array.isArray(p.hechos) && p.hechos.length && bloqueValido(p.texto, p.hechos, hechos, rango);
      const malPunto = (p) => p && typeof p.texto === "string" && Array.isArray(p.hechos) && p.hechos.length && p.hechos.some((id) => hechos.some((h) => h.id === id)) && !okPunto(p);
      const mal = (Array.isArray(out?.al_alza) ? out.al_alza.filter(malPunto) : []).concat(Array.isArray(out?.a_la_baja) ? out.a_la_baja.filter(malPunto) : []);
      return {
        al_alza: Array.isArray(out?.al_alza) ? out.al_alza.filter(okPunto).slice(0, 3) : [],
        a_la_baja: Array.isArray(out?.a_la_baja) ? out.a_la_baja.filter(okPunto).slice(0, 3) : [],
        contexto: Array.isArray(out?.contexto) ? out.contexto.filter(okPunto).slice(0, 5) : [],
        resumen: typeof out?.resumen === "string" ? String(out.resumen) : "",
        mal,
      };
    };
    const pasaControles = (cand) => {
      // (a) forma con textoValido, (b) cifras en hechos citados: cada punto ya lo pasó en okPunto;
      // si el modelo trajo un punto con cifras inventadas o prohibido, todo el horizonte falla
      if (cand.mal && cand.mal.length) return false;
      const resumenOk = !cand.resumen || (textoValido(cand.resumen, { minPalabras: 4 }) && prohibidoOk(cand.resumen) && cifrasEnHechos(cand.resumen, ["dolar-1"], hechos, rango));
      return resumenOk;
    };
    const textoDe = (cand) => [
      ...(cand.al_alza || []).map((p) => `${p.texto}`),
      ...(cand.a_la_baja || []).map((p) => `${p.texto}`),
      cand.resumen || "",
    ].join(" ");

    let salida = null;
    let modeloUsado = null;
    let revision = { modelo: null, ok: null, motivo: "sin modelo" };
    let salidaPrev = null;
    let motivoPrev = null;

    if (process.env.NVIDIA_API_KEY || opciones.askJSON) {
      for (let intento = 0; intento < 2 && !salida; intento++) {
        const prompt = intento === 0
          ? promptHorizonte(nombreHor, hechos, rango)
          : promptReintento(nombreHor, salidaPrev, hechos, rango, motivoPrev);
        let res = null;
        try {
          res = await ask(prompt, { budgetMs: 120 * 1000 });
        } catch (e) {
          console.error(`Lectura ${nombreHor}: ${e.message}`);
        }
        if (!res || !res.out) continue;
        const cand = ordena(corregirDireccion(res.out, hechos));
        if (!pasaControles(cand)) {
          if (intento === 0) {
            salidaPrev = { texto: (cand.mal?.[0]?.texto || textoDe(cand)).slice(0, 400) };
            motivoPrev = "el resumen o los puntos no pasaron el control de forma o de cifras";
          }
          continue;
        }
        const { mal, ...candLimpio } = cand;
        const ids = [...candLimpio.al_alza, ...candLimpio.a_la_baja, ...(candLimpio.contexto || [])].flatMap((p) => p.hechos);
        const rev = await revisar(nombreHor, textoDe(candLimpio), ids, hechos);
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
          salidaPrev = { texto: textoDe(candLimpio) };
          motivoPrev = rev.motivo || "fidelidad";
        }
        salida = null;
        revision = { modelo: rev.modelo, ok: false, motivo: rev.motivo };
      }
    }

    if (salida) {
      resultado.horizontes[nombreHor] = { ...salida, determinista: false, modelo: modeloUsado, revision };
      resultado.modelo = resultado.modelo || modeloUsado;
      resultado.revision = resultado.revision || revision;
    } else {
      // (d) si falla un horizonte tras UN reintento, versión determinista
      resultado.horizontes[nombreHor] = { ...lecturaDeterminista(hechos, rango, nombreHor), determinista: true };
      resultado.horizontes[nombreHor].modelo = modeloUsado || null;
      resultado.horizontes[nombreHor].revision = { modelo: null, ok: null, motivo: "versión determinista" };
      if (!resultado.modelo && modeloUsado) resultado.modelo = modeloUsado;
      if (!resultado.revision) resultado.revision = resultado.horizontes[nombreHor].revision;
    }
  }

  resultado.modelo = resultado.modelo || null;
  resultado.revision = resultado.revision || { modelo: null, ok: null, motivo: "sin modelo" };
  return resultado;
}

// ---------- 7. Demo: arma datos desde data/ (mes desde el endpoint público) ----------
async function mesDesdeApi() {
  try {
    const r = await fetch("https://perdata.site/api/forecast?symbol=PEN=X&horizon=1", { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const f = await r.json();
    if (!f?.quantiles) return null;
    return { p10: f.quantiles.p10, p50: f.predictedPrice, p90: f.quantiles.p90, fecha: f.horizonDate };
  } catch (e) {
    console.warn(`Aviso: no se pudo leer el rango del mes (${e.message}).`);
    return null;
  }
}

function armaDatosDemo(mes) {
  const bcrp = read("official/bcrp-daily.json", { series: {} });
  const ctx = read("official/bcrp-contexto.json", { series: {} });
  const daily = read("daily-forecasts.json", { simbolos: {} });
  const pen = daily.simbolos?.PEN || {};
  const rangos = {
    manana: pen.manana ? { p10: pen.manana.p10, p50: pen.manana.p50, p90: pen.manana.p90, fecha: pen.manana.fecha_objetivo } : null,
    semana: pen.semana ? { p10: pen.semana.p10, p50: pen.semana.p50, p90: pen.semana.p90, fecha: pen.semana.fecha_objetivo } : null,
    mes: mes || null, // el mes viene del llamador (endpoint público o periódico)
  };
  const series = {};
  for (const k of ["PEN", "COBRE", "ORO", "WTI"]) if (bcrp.series?.[k]?.serie) series[k] = { serie: bcrp.series[k].serie };
  const contexto = {};
  for (const k of ["INTERVENCION_BCRP", "TASA_REFERENCIA", "RIN"]) if (ctx.series?.[k]?.serie) contexto[k] = { serie: ctx.series[k].serie };

  const clasif = read("noticias-clasificadas.json", { items: {} }).items || {};
  const feed = read("noticias.json", { noticias: [] }).noticias || [];
  const byId = Object.fromEntries(feed.map((n) => [n.id, n]));
  const since = Date.now() - 36 * 36e5;
  const TEMAS = new Set(["Dólar y BCRP", "Minería y metales", "Economía y fiscal"]);
  const noticias = Object.entries(clasif)
    .filter(([, v]) => TEMAS.has(v.tema))
    .map(([id]) => byId[id])
    .filter((n) => n && Date.parse(n.fecha_iso) >= since)
    .sort((a, b) => String(b.fecha_iso).localeCompare(String(a.fecha_iso)))
    .slice(0, 12)
    .map((n) => ({ titulo: n.titulo, fuente: n.fuente, fecha_iso: n.fecha_iso }));

  return { series, contexto, rangos, noticias };
}

async function main() {
  const mes = await mesDesdeApi();
  const datos = armaDatosDemo(mes);
  // Sin LLM disponible, todo sale en versión determinista (regla del brief)
  const out = await lecturaDolar(datos);
  const qaDir = path.resolve(ROOT, "..", "handoff", "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  const destino = path.join(qaDir, "lectura-dolar-ejemplo.json");
  fs.writeFileSync(destino, JSON.stringify(out, null, 1) + "\n");
  console.log(`Ejemplo: ${destino}`);
  console.log(JSON.stringify(out, null, 1));
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) await main();

export const HORIZONTES = ["manana", "semana", "mes"];
