/**
 * PerData - Reglas puras del motor de avisos de precio.
 *
 * Sin red ni sistema de archivos: sólo decide qué avisos hay que enviar
 * y qué rearmes hay que aplicar para una fila de `seguimiento`.
 *
 * Tipos de aviso: "arriba" | "abajo" (umbrales absolutos) y
 * "pct_arriba" | "pct_abajo" (porcentaje sobre `precio_base`).
 * Para los avisos porcentuales el `nivel` es el porcentaje pactado.
 */

// Finite number or null. Acepta números o cadenas numéricas.
// null/undefined/"" cuentan como ausencia de dato (no como 0).
function finito(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Finite number strictly greater than zero, or null.
function positivo(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Umbral absoluto que corresponde a un porcentaje sobre el precio de referencia.
// Devuelve null si base o pct no son números finitos positivos.
export function umbralPct(precioBase, pct, tipo) {
  const base = positivo(precioBase);
  const p = positivo(pct);
  if (base === null || p === null) return null;
  if (tipo === "abajo") return base * (1 - p / 100);
  if (tipo === "arriba") return base * (1 + p / 100);
  return null;
}

function clave(user, simbolo, tipo, nivel) {
  return `${user}|${simbolo}|${tipo}|${Number(nivel)}`;
}

/**
 * Evalúa una fila de seguimiento contra el precio actual.
 * Devuelve { avisar: [{tipo, nivel}], rearmar: [{tipo, nivel}] }.
 * Nunca lanza: una fila sin datos válidos no produce nada.
 */
export function evaluarFila({ fila, precio, enviadas } = {}) {
  const avisar = [];
  const rearmar = [];

  if (!fila || typeof fila !== "object") return { avisar, rearmar };

  const p = finito(precio);
  if (p === null) return { avisar, rearmar };

  const user = fila.user_id;
  const simbolo = fila.simbolo;
  if (user === undefined || user === null || simbolo === undefined || simbolo === null || simbolo === "") {
    return { avisar, rearmar };
  }

  const set = enviadas instanceof Set ? enviadas : new Set(enviadas || []);

  // Aviso absoluto "arriba".
  const absArriba = finito(fila.alerta_arriba);
  if (absArriba !== null) {
    const k = clave(user, simbolo, "arriba", absArriba);
    if (p >= absArriba) {
      if (!set.has(k)) avisar.push({ tipo: "arriba", nivel: absArriba });
    } else if (p < absArriba * 0.995) {
      if (set.has(k)) rearmar.push({ tipo: "arriba", nivel: absArriba });
    }
  }

  // Aviso absoluto "abajo".
  const absAbajo = finito(fila.alerta_abajo);
  if (absAbajo !== null) {
    const k = clave(user, simbolo, "abajo", absAbajo);
    if (p <= absAbajo) {
      if (!set.has(k)) avisar.push({ tipo: "abajo", nivel: absAbajo });
    } else if (p > absAbajo * 1.005) {
      if (set.has(k)) rearmar.push({ tipo: "abajo", nivel: absAbajo });
    }
  }

  const base = positivo(fila.precio_base);

  // Aviso porcentual "pct_arriba".
  const pctArriba = positivo(fila.alerta_pct_arriba);
  if (base !== null && pctArriba !== null) {
    const umbral = umbralPct(base, pctArriba, "arriba");
    if (umbral !== null) {
      const k = clave(user, simbolo, "pct_arriba", pctArriba);
      if (p >= umbral) {
        if (!set.has(k)) avisar.push({ tipo: "pct_arriba", nivel: pctArriba, base, precio: p });
      } else if (p < umbral * 0.995) {
        if (set.has(k)) rearmar.push({ tipo: "pct_arriba", nivel: pctArriba, base });
      }
    }
  }

  // Aviso porcentual "pct_abajo".
  const pctAbajo = positivo(fila.alerta_pct_abajo);
  if (base !== null && pctAbajo !== null) {
    const umbral = umbralPct(base, pctAbajo, "abajo");
    if (umbral !== null) {
      const k = clave(user, simbolo, "pct_abajo", pctAbajo);
      if (p <= umbral) {
        if (!set.has(k)) avisar.push({ tipo: "pct_abajo", nivel: pctAbajo, base, precio: p });
      } else if (p > umbral * 1.005) {
        if (set.has(k)) rearmar.push({ tipo: "pct_abajo", nivel: pctAbajo, base });
      }
    }
  }

  return { avisar, rearmar };
}
