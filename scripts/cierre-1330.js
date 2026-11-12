// scripts/cierre-1330.js
// Captura provisional del cierre interbancario del dólar de la 1:30 p. m. (Lima).
// Lee dos canales RSS públicos (El Comercio y Andina), extrae el cierre con patrones
// estrictos y lo guarda como dato PROVISIONAL solo cuando dos notas coinciden.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const USER_AGENT = "PerDataBot/1.0 (+https://perdata.site)";
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const RE_NOTA = /El precio del dólar cerró este (lunes|martes|miércoles|jueves|viernes) en S\/\s?(\d[.,]\d{3,4}) en el mercado interbancario/i;
const RE_ENVIVO = /cerró el (lunes|martes|miércoles|jueves|viernes) (\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) en (\d[.,]\d{3,4}), con una apertura de \d[.,]\d{3,4}, según lo dio a conocer el Banco Central/gi;
const RE_ANDINA_TITULO = /^Dólar cierra\b.* en S\/ ?(\d\.\d{3})\b/;
const RE_ANDINA_DESC = /cerró este (lunes|martes|miércoles|jueves|viernes) en (\d\.\d{3,4}) soles en el mercado interbancario/i;

const AMP = String.fromCharCode(38);
const ENTIDADES = {
  amp: AMP,
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
};
const RE_ENTIDADES = new RegExp(`${AMP}(#\\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);`, "g");

/**
 * Decodifica las entidades XML de un texto (las básicas y las más comunes).
 */
function decodificar(texto) {
  return String(texto ?? "").replace(RE_ENTIDADES, (todo, nombre) => {
    if (nombre in ENTIDADES) return ENTIDADES[nombre];
    if (nombre[0] === "#") {
      const hex = nombre[1] === "x" || nombre[1] === "X";
      const code = Number.parseInt(hex ? nombre.slice(2) : nombre.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : todo;
    }
    return todo;
  });
}

/**
 * Extrae un campo de un <item> del RSS: quita el CDATA y decodifica entidades.
 * Devuelve "" si el campo no existe.
 */
function campo(item, nombre) {
  const m = item.match(new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`));
  if (!m) return "";
  const bruto = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(bruto);
  return decodificar(cdata ? cdata[1] : bruto);
}

/**
 * Devuelve la fecha/hora de Lima (UTC-5, sin horario de verano) de un pubDate RFC 822.
 * Lima se representa como un Date "falso UTC": sus getters UTC dan la hora de Lima.
 * Devuelve null si el pubDate no se puede leer.
 */
function fechaLima(pubDate) {
  const texto = String(pubDate ?? "").trim();
  if (!texto) return null;
  const ms = Date.parse(texto);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 5 * 60 * 60 * 1000);
}

/**
 * Fecha "YYYY-MM-DD" de una fecha/hora de Lima.
 */
function fechaIso(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(fecha.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Convierte "3,4090" o "3.4090" en número redondeado a 4 decimales.
 */
function numero(texto) {
  const v = Number(String(texto ?? "").replace(",", "."));
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 10000) / 10000;
}

/**
 * ¿La hora de Lima es 13:30 o posterior?
 */
function desde1330(fecha) {
  const h = fecha.getUTCHours();
  const m = fecha.getUTCMinutes();
  return h > 13 || (h === 13 && m >= 30);
}

/**
 * Fecha (medianoche) que cita un_item en vivo: usa el año de publicación y, si con
 * ese año quedaría después, el año anterior. Devuelve null si no hay fecha válida.
 */
function fechaCitada(anio, mes, dia, fecha) {
  const hoy = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  for (const y of [anio, anio - 1]) {
    const t = new Date(Date.UTC(y, mes - 1, dia));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mes - 1 || t.getUTCDate() !== dia) continue;
    if (t.getTime() <= hoy) return t;
  }
  return null;
}

/**
 * Items del RSS con su pubDate ya llevado a Lima. Los items sin pubDate se saltan.
 */
function items(xml) {
  const salida = [];
  const texto = String(xml ?? "");
  for (const m of texto.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const fecha = fechaLima(campo(item, "pubDate"));
    if (!fecha) continue;
    salida.push({
      titulo: campo(item, "title"),
      url: campo(item, "link"),
      descripcion: campo(item, "description"),
      contenido: campo(item, "content:encoded"),
      fecha,
    });
  }
  return salida;
}

/**
 * Nombre del día de la semana (lunes...) de una fecha de Lima.
 */
function diaSemana(fecha) {
  return DIAS[(fecha.getUTCDay() + 6) % 7];
}

/**
 * Candidatos del canal de El Comercio.
 * - "nota": la descripción anuncia el cierre del día.
 * - "envivo": el contenido en vivo cita el cierre con fecha explícita.
 * Devuelve [{ fecha, valor, tipo, url }]; un texto vacío o que no es RSS devuelve [].
 */
export function candidatosComercio(xml) {
  const salida = [];
  for (const item of items(xml)) {
    const dia = diaSemana(item.fecha);
    const fecha = fechaIso(item.fecha);

    const nota = RE_NOTA.exec(item.descripcion);
    if (nota && nota[1].toLowerCase() === dia && desde1330(item.fecha)) {
      const valor = numero(nota[2]);
      if (valor !== null) salida.push({ fecha, valor, tipo: "nota", url: item.url });
    }

    const texto = item.contenido.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const m of texto.matchAll(new RegExp(RE_ENVIVO.source, "gi"))) {
      const mes = MESES.indexOf(m[3].toLowerCase()) + 1;
      if (!mes) continue;
      const diaNum = Number(m[2]);
      const citada = fechaCitada(item.fecha.getUTCFullYear(), mes, diaNum, item.fecha);
      if (!citada) continue;
      const fechaCitadaIso = `${citada.getUTCFullYear()}-${String(citada.getUTCMonth() + 1).padStart(2, "0")}-${String(citada.getUTCDate()).padStart(2, "0")}`;
      const dias = Math.round((Date.UTC(item.fecha.getUTCFullYear(), item.fecha.getUTCMonth(), item.fecha.getUTCDate()) - citada.getTime()) / 86400000);
      if (diaSemana(citada) !== m[1].toLowerCase() || dias > 10) continue;
      const valor = numero(m[4]);
      if (valor === null) continue;
      salida.push({ fecha: fechaCitadaIso, valor, tipo: "envivo", url: item.url });
    }
  }
  return salida;
}

/**
 * Candidatos del canal de Andina.
 * Acepta el titular ("Dólar cierra..."), la descripción ("cerró este...") o ambos;
 * si ambos traen valores distintos, el item se descarta.
 * Devuelve [{ fecha, valor, tipo: "andina", url }].
 */
export function candidatosAndina(xml) {
  const salida = [];
  for (const item of items(xml)) {
    const dia = diaSemana(item.fecha);
    const titulo = RE_ANDINA_TITULO.exec(item.titulo);
    let descripcion = RE_ANDINA_DESC.exec(item.descripcion);
    if (descripcion && descripcion[1].toLowerCase() !== dia) descripcion = null;
    if (!titulo && !descripcion) continue;
    if (!desde1330(item.fecha)) continue;
    if (item.fecha.getUTCDay() === 0 || item.fecha.getUTCDay() === 6) continue;
    const valorTitulo = titulo ? numero(titulo[1]) : null;
    const valorDescripcion = descripcion ? numero(descripcion[2]) : null;
    if (titulo && descripcion && valorTitulo !== valorDescripcion) continue;
    const valor = valorDescripcion !== null ? valorDescripcion : valorTitulo;
    if (valor === null) continue;
    salida.push({ fecha: fechaIso(item.fecha), valor, tipo: "andina", url: item.url });
  }
  return salida;
}

/**
 * Estado provisional: se completa en el paso 2 del encargo.
 */
export function actualizarEstado(estado, { candidatos, oficiales, sbs, hoyLima, ahora }) {
  return { provisional: null, bitacora: [] };
}
