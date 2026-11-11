// historial-html.js
// Pure function to render the historial section for dolar.html
// Input: aciertos object from data/official/aciertos-dolar.json
// Output: HTML string for the historial section

/**
 * Formats a date as "6 nov" (day + short month name in Spanish).
 * @param {string} iso - Date in ISO format (YYYY-MM-DD)
 * @returns {string} Short date like "6 nov"
 */
function fechaCorta(iso) {
  if (!iso || typeof iso !== 'string') return 's/d';
  const partes = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (partes.length === 3) return `${Number(partes[2])} ${meses[Number(partes[1]) - 1]}`;
  return iso;
}

/**
 * Formats a number with manual thin space for thousands (e.g., "1 958").
 * @param {number} n - Number to format
 * @returns {string} Formatted number
 */
function milesConEspacio(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Formats a price with 3 decimals and dot (e.g., "3.435").
 * @param {number} n - Price
 * @returns {string} Formatted price
 */
function precio3(n) {
  return Number(n.toFixed(3));
}

/**
 * Formats a percentage with dot and no space, preserving trailing zeros (e.g., "80.59%", "80.00%").
 * @param {number} n - Percentage value
 * @param {number} decimals - Number of decimals (default 2)
 * @returns {string} Formatted percentage
 */
function pctStr(n, decimals = 2) {
  return `${n.toFixed(decimals)}%`;
}

/**
 * Renders the historial section as static HTML.
 * @param {Object} aciertos - The aciertos-dolar.json object
 * @returns {string} HTML string for the historial section
 */
export function renderHistorial(aciertos) {
  if (!aciertos || !aciertos.horizontes || !aciertos.prueba_historica) {
    return `<p class="text-ink-soft text-sm">Historial no disponible.</p>`;
  }

  const { horizontes, prueba_historica, backtest_motor, actualizado } = aciertos;
  const manana = horizontes.manana || { n: 0, dentro: 0, cobertura: null, casos: [] };
  const semana = horizontes.semana || { n: 0, dentro: 0, cobertura: null, casos: [] };

  // Fecha de actualización para el pie
  const actualizadoFecha = actualizado ? new Date(actualizado + 'T00:00:00') : new Date();
  const actualizadoCorta = fechaCorta(actualizado);
  const actualizadoAnio = actualizadoFecha.getFullYear();

  let html = '<div class="space-y-8">';

  // Part (a): Rangos publicados
  html += '<div class="space-y-6">';
  html += '<h3 class="text-lg font-semibold text-ink">Rangos publicados desde el 4 de noviembre de 2026</h3>';

  // --- Rango para el día siguiente ---
  html += '<div class="space-y-3">';
  html += '<h4 class="text-base font-medium text-ink">Rango para el día siguiente</h4>';

  if (manana.n === 0) {
    html += '<p class="text-ink-soft text-sm">Aún no ha vencido ningún rango diario.</p>';
  } else if (manana.n < 20) {
    html += `<p class="text-ink-soft text-sm">${manana.dentro} de ${manana.n} cierres cayeron dentro del rango publicado. Todavía hay pocos casos (${manana.n}); el porcentaje se mostrará a partir de 20.</p>`;
  } else {
    html += `<p class="text-ink-soft text-sm">${manana.dentro} de ${manana.n} cierres cayeron dentro del rango publicado (${pctStr(manana.cobertura)}). El rango promete 8 de cada 10.</p>`;
  }

  if (manana.casos && manana.casos.length > 0) {
    const showCount = Math.min(20, manana.casos.length);
    html += '<div class="overflow-x-auto">';
    html += '<table class="w-full text-left text-sm border border-rule">';
    html += '<thead class="bg-paper border-b border-rule font-mono text-xs text-ink uppercase">';
    html += '<tr>';
    html += '<th class="py-2 px-2 font-semibold">Cierre del</th>';
    html += '<th class="py-2 px-2 font-semibold">Rango publicado</th>';
    html += '<th class="py-2 px-2 font-semibold">Cierre real</th>';
    html += '<th class="py-2 px-2 font-semibold">Resultado</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody class="divide-y divide-rule font-mono tnum text-ink">';
    for (let i = 0; i < showCount; i++) {
      const c = manana.casos[i];
      const p10 = precio3(c.p10);
      const p90 = precio3(c.p90);
      const cierre = precio3(c.cierre);
      html += '<tr>';
      html += `<td class="py-2 px-2 font-sans">${fechaCorta(c.fecha_objetivo)}</td>`;
      html += `<td class="py-2 px-2">${p10} – ${p90}</td>`;
      html += `<td class="py-2 px-2">${cierre}</td>`;
      html += `<td class="py-2 px-2 font-sans">${c.dentro ? 'dentro' : 'fuera'}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
    html += '</table>';
    html += '</div>';
    html += '<p class="text-ink-soft text-xs mt-1">en soles por dólar</p>';
    if (manana.casos.length > showCount) {
      html += `<p class="text-ink-soft text-xs mt-1">Mostrando los ${showCount} más recientes de ${manana.casos.length} casos.</p>`;
    }
  }
  html += '</div>';

  // --- Rango para la semana ---
  html += '<div class="space-y-3">';
  html += '<h4 class="text-base font-medium text-ink">Rango para la semana</h4>';

  if (semana.n === 0) {
    html += '<p class="text-ink-soft text-sm">Aún no ha vencido ningún rango semanal.</p>';
  } else if (semana.n < 20) {
    html += `<p class="text-ink-soft text-sm">${semana.dentro} de ${semana.n} cierres cayeron dentro del rango publicado. Todavía hay pocos casos (${semana.n}); el porcentaje se mostrará a partir de 20.</p>`;
  } else {
    html += `<p class="text-ink-soft text-sm">${semana.dentro} de ${semana.n} cierres cayeron dentro del rango publicado (${pctStr(semana.cobertura)}). El rango promete 8 de cada 10.</p>`;
  }

  if (semana.casos && semana.casos.length > 0) {
    const showCount = Math.min(20, semana.casos.length);
    html += '<div class="overflow-x-auto">';
    html += '<table class="w-full text-left text-sm border border-rule">';
    html += '<thead class="bg-paper border-b border-rule font-mono text-xs text-ink uppercase">';
    html += '<tr>';
    html += '<th class="py-2 px-2 font-semibold">Cierre del</th>';
    html += '<th class="py-2 px-2 font-semibold">Rango publicado</th>';
    html += '<th class="py-2 px-2 font-semibold">Cierre real</th>';
    html += '<th class="py-2 px-2 font-semibold">Resultado</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody class="divide-y divide-rule font-mono tnum text-ink">';
    for (let i = 0; i < showCount; i++) {
      const c = semana.casos[i];
      const p10 = precio3(c.p10);
      const p90 = precio3(c.p90);
      const cierre = precio3(c.cierre);
      html += '<tr>';
      html += `<td class="py-2 px-2 font-sans">${fechaCorta(c.fecha_objetivo)}</td>`;
      html += `<td class="py-2 px-2">${p10} – ${p90}</td>`;
      html += `<td class="py-2 px-2">${cierre}</td>`;
      html += `<td class="py-2 px-2 font-sans">${c.dentro ? 'dentro' : 'fuera'}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
    html += '</table>';
    html += '</div>';
    html += '<p class="text-ink-soft text-xs mt-1">en soles por dólar</p>';
    if (semana.casos.length > showCount) {
      html += `<p class="text-ink-soft text-xs mt-1">Mostrando los ${showCount} más recientes de ${semana.casos.length} casos.</p>`;
    }
  }
  html += '</div>';
  html += '</div>';

  // Part (b): Prueba histórica
  const ph = prueba_historica;
  html += '<div class="space-y-4 border-t border-rule pt-6">';
  html += '<h3 class="text-lg font-semibold text-ink">Prueba histórica (no son rangos publicados)</h3>';
  html += '<p class="text-ink-soft text-sm">';
  html += `Entre enero de 2019 y noviembre de 2026, recalculando el modelo solo con la historia anterior a cada día, el rango a un día hábil del último cierre conocido contuvo el cierre real ${pctStr(ph.cobertura_fuera_muestra)} de las veces (${milesConEspacio(ph.cortes)} días).`;
  html += '</p>';

  if (ph.por_anio && ph.por_anio.length > 0) {
    html += '<div class="overflow-x-auto">';
    html += '<table class="w-full text-left text-sm border border-rule">';
    html += '<thead class="bg-paper border-b border-rule font-mono text-xs text-ink uppercase">';
    html += '<tr>';
    html += '<th class="py-2 px-2 font-semibold">Año</th>';
    html += '<th class="py-2 px-2 font-semibold">Días</th>';
    html += '<th class="py-2 px-2 font-semibold">Dentro del rango</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody class="divide-y divide-rule font-mono tnum text-ink">';
    for (const row of ph.por_anio) {
      html += '<tr>';
      html += `<td class="py-2 px-2 font-sans">${row.anio}</td>`;
      html += `<td class="py-2 px-2">${milesConEspacio(row.n)}</td>`;
      html += `<td class="py-2 px-2">${pctStr(row.cobertura, 2)}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
    html += '</table>';
    html += '</div>';
  }

  // Párrafo final con backtest_motor
  if (backtest_motor && (backtest_motor.manana || backtest_motor.semana)) {
    const mananaBT = backtest_motor.manana;
    const semanaBT = backtest_motor.semana;
    const x = mananaBT ? Number(mananaBT.cobertura_80_k_expansivo.toFixed(1)) : 's/d';
    const y = semanaBT ? Number(semanaBT.cobertura_80_k_expansivo.toFixed(1)) : 's/d';

    html += '<p class="text-ink-soft text-sm mt-4">';
    html += `Hasta el 9 de noviembre de 2026 el rango del día siguiente partía de un cierre de dos días hábiles atrás, porque el BCRP lo difunde con un día de retraso. Desde el 10 de noviembre parte del cierre del día hábil anterior, que SUNAT difunde de madrugada, y por eso es más angosto. Cada rango queda registrado antes de las 9:00 a. m. del día que anuncia y no se cambia después. En la prueba del propio motor sobre los cierres desde 2024, el rango de un día acertó ${x} % de las veces; el de la semana, ${y} %.`;
    html += '</p>';
  }

  // Pie
  html += `<p class="text-ink-soft text-xs mt-4">Actualizado el ${actualizadoCorta} de ${actualizadoAnio}. Cierres: tipo de cambio venta SBS, publicado por el BCRP y por SUNAT.</p>`;

  html += '</div>';

  return html;
}