// ficha-rango.js
// Bloque «Rango esperado de PerData Engine» de la ficha de empresa.
// Toma el valor que calibra el motor de acciones (data/acciones-rangos.json) y devuelve el HTML
// del bloque: el rango central (p25–p75) y el amplio (p10–p90) de la semana y del mes, o el
// motivo exacto por el que no se publica. PerData no predice dirección: el bloque nunca dice
// «subirá» ni «bajará», y siempre aclara que es un rango estadístico y no una recomendación.
// Funciones puras: no leen archivos al importarse. El que arma la página es
// scripts/build-empresas-html.js, que llama bloqueRango(valor, { moneda, hoy, ultimoDia }).

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

const TITULO = "Rango esperado de PerData Engine";
const AVISO = "Es un rango estadístico, no una recomendación de compra o venta.";
const SIN_BASE =
  "Sin rango: esta acción casi no se negocia (menos de 20 días con operaciones en los últimos 12 meses), " +
  "así que no hay base para calcularlo.";
const SIN_RANGO = "Sin rango por ahora.";
const HORIZONTES = [
  { clave: "semana", etiqueta: "Esta semana", pie: "de la semana" },
  { clave: "mes", etiqueta: "Este mes", pie: "del mes" },
];
const DIAS_MAX_VIGENCIA = 7;

// ---------- utilidades ----------

const ENT = String.fromCharCode(38); // ampersand de las entidades HTML
const ENTIDADES = {
  "&": ENT + "amp;",
  "<": ENT + "lt;",
  ">": ENT + "gt;",
  '"': ENT + "quot;",
  "'": ENT + "#39;",
};

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter]);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// «2026-11-16» -> Date en UTC (medianoche) o null si no es una fecha usable.
function fecha(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

// «lun 16 nov»: nunca en formato ISO.
function fechaCorta(iso) {
  const d = fecha(iso);
  if (!d) return null;
  return `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
}

// «octubre de 2024»: mes y año de la primera fecha con datos.
function mesYAnio(iso) {
  const d = fecha(iso);
  if (!d) return null;
  return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

// Días naturales entre dos fechas YYYY-MM-DD (positivo si la primera es posterior).
function diasEntre(desde, hasta) {
  const a = fecha(desde);
  const b = fecha(hasta);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

// Si el último día de los rangos es más de 7 días naturales anterior a hoy, no se muestran.
function desactualizado(hoy, ultimoDia) {
  const dias = diasEntre(hoy, ultimoDia);
  return dias !== null && dias > DIAS_MAX_VIGENCIA;
}

// Precio con la moneda delante: dos decimales si es 1 o más, cuatro si es menor.
function rangoTexto(izq, der, moneda) {
  const a = numero(izq);
  const b = numero(der);
  if (a === null || b === null) return "";
  const decimales = Math.min(a, b) < 1 ? 4 : 2;
  const desde = a.toFixed(decimales);
  const hasta = b.toFixed(decimales);
  // Acciones que casi no cambian de precio: los dos extremos coinciden y se muestra un solo precio.
  if (desde === hasta) return `${esc(moneda)} ${desde}`;
  return `${esc(moneda)} ${desde} – ${hasta}`;
}

// ---------- filas ----------

function etiquetaFila(horizonte, objetivo, conFecha) {
  const dia = conFecha ? fechaCorta(objetivo) : null;
  return dia ? `${horizonte.etiqueta}, al ${dia}` : horizonte.etiqueta;
}

function filaRango(horizonte, h, moneda) {
  const central = rangoTexto(h.p25, h.p75, moneda);
  const amplio = rangoTexto(h.p10, h.p90, moneda);
  if (!central || !amplio) return filaMotivo(horizonte, h, null);
  // Acción que casi no se mueve: los dos rangos son el mismo precio y basta una línea.
  if (central === amplio) {
    return [
      "    <tr>",
      `      <th scope="row">${esc(etiquetaFila(horizonte, h.fecha_objetivo, true))}</th>`,
      "      <td>",
      `        <p class="rango-linea"><span class="mono">${central}</span><span class="rango-nota">· sin cambio, 8 de cada 10 veces</span></p>`,
      "      </td>",
      "    </tr>",
    ].join("\n");
  }
  return [
    "    <tr>",
    `      <th scope="row">${esc(etiquetaFila(horizonte, h.fecha_objetivo, true))}</th>`,
    "      <td>",
    `        <p class="rango-linea"><span class="mono">${central}</span><span class="rango-nota">· la mitad de las veces</span></p>`,
    `        <p class="rango-linea"><span class="mono">${amplio}</span><span class="rango-nota">· 8 de cada 10 veces</span></p>`,
    "      </td>",
    "    </tr>",
  ].join("\n");
}

function filaMotivo(horizonte, h, valor) {
  const motivo = h && typeof h.motivo === "string" ? h.motivo : "";
  let texto = SIN_RANGO;
  if (motivo === "historia_insuficiente") {
    const desde = valor ? mesYAnio(valor.primera_fecha) : null;
    texto = desde
      ? `Aún sin rango: cotiza desde ${desde} y la prueba todavía es corta. Se publicará cuando haya al menos 100 días de prueba.`
      : "Aún sin rango: la prueba todavía es corta. Se publicará cuando haya al menos 100 días de prueba.";
  } else if (motivo === "cobertura_fuera_de_rango") {
    const cobertura = numero(h && h.validacion ? h.validacion.cobertura80 : null);
    const aciertos = cobertura === null ? null : Math.round(cobertura);
    // Si el rango amplio sí pasó (74 a 86), lo que falló fue el rango central: no se cita una cifra que confunda.
    texto =
      aciertos === null || (aciertos >= 74 && aciertos <= 86)
        ? "Sin rango publicado: en la prueba no fue lo bastante confiable, así que preferimos no mostrarlo."
        : `Sin rango publicado: en la prueba acertó ${aciertos} de cada 100 veces y exigimos entre 74 y 86, ` +
          "así que preferimos no mostrarlo.";
  }
  return [
    "    <tr>",
    `      <th scope="row">${esc(etiquetaFila(horizonte, h ? h.fecha_objetivo : null, false))}</th>`,
    `      <td><p class="rango-motivo">${esc(texto)}</p></td>`,
    "    </tr>",
  ].join("\n");
}

// ---------- bloque ----------

/**
 * Devuelve el HTML del bloque «Rango esperado de PerData Engine» de una ficha de empresa.
 * `valor` es valores[NEMONICO] de data/acciones-rangos.json (o undefined).
 * Devuelve "" cuando los rangos son demasiado viejos para mostrarlos.
 */
export function bloqueRango(valor, opciones = {}) {
  const { moneda = "S/", hoy, ultimoDia } = opciones || {};

  if (!valor) {
    return [
      `<h2 class="section-title">${TITULO}</h2>`,
      `<p class="rango-motivo">${esc(SIN_BASE)}</p>`,
      `<p class="rango-pie">${esc(AVISO)}</p>`,
    ].join("\n");
  }

  if (desactualizado(hoy, ultimoDia)) return "";

  const filas = [];
  const publicables = [];
  for (const horizonte of HORIZONTES) {
    const h = valor[horizonte.clave];
    if (h && h.publicable) {
      filas.push(filaRango(horizonte, h, moneda));
      publicables.push({ horizonte, h });
    } else {
      filas.push(filaMotivo(horizonte, h, valor));
    }
  }

  const pie = [];
  if (publicables.length > 0) {
    const elegido = publicables.find((p) => p.horizonte.clave === "semana") || publicables[0];
    const validacion = elegido.h.validacion || {};
    const cobertura = numero(validacion.cobertura80);
    const cortes = numero(validacion.cortes);
    let frase =
      `En la prueba de 2025-2026 el rango amplio ${elegido.horizonte.pie} contuvo el precio ` +
      `${cobertura === null ? 0 : Math.round(cobertura)} de cada 100 veces`;
    if (cortes !== null) frase += ` (${cortes} días de prueba)`;
    pie.push(`${frase}.`);
    const metodos = publicables.map((p) => (p.h.metodo || valor.metodo || "propio"));
    if (metodos.includes("fondo")) {
      pie.push("Calculado con el comportamiento conjunto de las acciones de la Bolsa de Lima, ajustado a esta acción.");
    }
  }
  pie.push(AVISO);

  return [
    `<h2 class="section-title">${TITULO}</h2>`,
    '<table class="rango-tabla">',
    "  <tbody>",
    filas.join("\n"),
    "  </tbody>",
    "</table>",
    `<p class="rango-pie">${esc(pie.join(" "))}</p>`,
  ].join("\n");
}
