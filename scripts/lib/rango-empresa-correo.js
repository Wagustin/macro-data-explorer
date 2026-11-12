// Rango semanal calibrado de una acción para el correo.
// El motor de acciones (scripts/engine-acciones.js) deja el rango de la semana en
// data/acciones-rangos.json: el central (p25–p75) y el amplio (p10–p90), ya
// calibrados contra la prueba fuera de muestra. Este módulo es puro (no lee
// archivos ni red): solo traduce ese dato a la línea del correo y explica, con
// el motivo exacto del motor, por qué un valor no tiene rango.
// Nunca dice hacia dónde irá el precio: no escribe «subirá», «bajará» ni
// «predicción», y nunca devuelve «undefined», «null» ni «NaN» en el texto.

const MOTIVO_SIN_RANGO = "Sin rango: esta acción casi no se negocia.";
const MOTIVO_HISTORIA = "Aún sin rango: su historia en bolsa es corta para probarlo.";
const MOTIVO_CONFIABILIDAD = "Sin rango esta semana: en la prueba no fue lo bastante confiable y preferimos no mostrarlo.";

// "AAAA-MM-DD" (se recorta a los 10 primeros caracteres).
const fechaIso = (v) => {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const finito = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Rango de la semana de una acción (o el motivo por el que no se publica).
 * `valor` es `valores[NEMONICO]` de data/acciones-rangos.json (o undefined).
 * `hoy` es la fecha de Lima (AAAA-MM-DD).
 * → { forecast: { p10, p25, p50, p75, p90, date, horizonte } | null, motivo: string | null }
 */
export function rangoEmpresaCorreo(valor, { hoy } = {}) {
  if (!valor) return { forecast: null, motivo: MOTIVO_SIN_RANGO };
  const semana = valor.semana;
  if (!semana) return { forecast: null, motivo: MOTIVO_CONFIABILIDAD };
  if (semana.publicable === true) {
    const fecha = fechaIso(semana.fecha_objetivo);
    const numeros = ["p10", "p25", "p50", "p75", "p90"].every((k) => finito(semana[k]));
    const vigente = fecha && (!fechaIso(hoy) || fecha >= fechaIso(hoy));
    if (numeros && vigente) {
      return {
        forecast: {
          p10: semana.p10, p25: semana.p25, p50: semana.p50, p75: semana.p75, p90: semana.p90,
          date: semana.fecha_objetivo, horizonte: "semana",
        },
        motivo: null,
      };
    }
    // Rango vencido o con cifras incompletas: no se muestra nada.
    return { forecast: null, motivo: null };
  }
  if (semana.motivo === "historia_insuficiente") return { forecast: null, motivo: MOTIVO_HISTORIA };
  return { forecast: null, motivo: MOTIVO_CONFIABILIDAD };
}

/**
 * Línea de texto plano del rango: «Al 17 nov: 13.17 – 13.40 (1 de cada 2) ·
 * 13.00 – 13.65 (8 de cada 10)». `fmt` y `fechaCorta` son los del correo y se
 * pasan como argumento para que el módulo no dependa de nada.
 */
export function lineaRangoCorreo(forecast, { fmt, fechaCorta } = {}) {
  if (!forecast) return "";
  const a = fmt(forecast.p25, 2);
  const b = fmt(forecast.p75, 2);
  const c = fmt(forecast.p10, 2);
  const d = fmt(forecast.p90, 2);
  const fecha = fechaCorta(forecast.date);
  // El rango amplio se reduce a un solo precio: la acción apenas se mueve.
  if (c === d) return `Al ${fecha}: ${fmt(forecast.p50, 2)} · sin cambio (8 de cada 10)`;
  // El rango central se reduce a un solo precio: la mitad de las veces vale eso.
  if (a === b) return `Al ${fecha}: ${a} (1 de cada 2) · ${c} – ${d} (8 de cada 10)`;
  return `Al ${fecha}: ${a} – ${b} (1 de cada 2) · ${c} – ${d} (8 de cada 10)`;
}
