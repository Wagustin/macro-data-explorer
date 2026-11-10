// historial-html.js
// Pure function to render the historial section for dolar.html
// Input: aciertos object from data/official/aciertos-dolar.json
// Output: HTML string for the historial section

import { fileURLToPath } from "url";
import path from "path";

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

  // Labels for display
  const tipoLabels = {
    manana: "Mañana (h2: 2 días hábiles)",
    semana: "Próxima semana (h6: 6 días hábiles)",
  };

  const tipoOrder = ["manana", "semana"];

  let html = '<div class="space-y-8">';

  // Part (a): Pronósticos publicados
  html += '<div class="space-y-6">';
  html += '<h3 class="text-lg font-semibold text-ink">Pronósticos publicados</h3>';

  for (const tipo of tipoOrder) {
    const h = horizontes[tipo];
    if (!h) continue;

    html += '<div class="space-y-3">';
    html += `<h4 class="text-base font-medium text-ink">${tipoLabels[tipo]}</h4>`;

    if (h.n === 0) {
      html += '<p class="text-ink-soft text-sm">Todavía no hay casos evaluados para este horizonte.</p>';
    } else if (h.n < 20) {
      html += `<p class="text-ink-soft text-sm">Todavía hay pocos casos (${h.n}); el porcentaje se mostrará a partir de 20.</p>`;
    } else {
      html += '<p class="text-ink-soft text-sm">';
      html += `${h.dentro} de ${h.n} cierres cayeron dentro del rango (${h.cobertura.toFixed(1)} %); el rango promete 80 %.`;
      html += '</p>';
    }

    if (h.casos && h.casos.length > 0) {
      const showCount = Math.min(20, h.casos.length);
      html += '<div class="overflow-x-auto">';
      html += '<table class="w-full text-left text-sm border border-rule">';
      html += '<thead class="bg-paper border-b border-rule font-mono text-xs text-ink uppercase">';
      html += '<tr>';
      html += '<th class="py-2.5 px-4 font-semibold">Fecha publicación</th>';
      html += '<th class="py-2.5 px-4 font-semibold">Fecha base</th>';
      html += '<th class="py-2.5 px-4 font-semibold">Fecha objetivo</th>';
      html += '<th class="py-2.5 px-4 font-semibold">P10</th>';
      html += '<th class="py-2.5 px-4 font-semibold">P50</th>';
      html += '<th class="py-2.5 px-4 font-semibold">P90</th>';
      html += '<th class="py-2.5 px-4 font-semibold">Cierre real</th>';
      html += '<th class="py-2.5 px-4 font-semibold">Resultado</th>';
      html += '</tr>';
      html += '</thead>';
      html += '<tbody class="divide-y divide-rule font-mono tnum text-ink">';
      for (let i = 0; i < showCount; i++) {
        const c = h.casos[i];
        html += '<tr>';
        html += `<td class="py-2.5 px-4 font-sans">${c.fecha_publicacion}</td>`;
        html += `<td class="py-2.5 px-4 font-sans">${c.fecha_base}</td>`;
        html += `<td class="py-2.5 px-4 font-sans">${c.fecha_objetivo}</td>`;
        html += `<td class="py-2.5 px-4">S/ ${c.p10.toFixed(4)}</td>`;
        html += `<td class="py-2.5 px-4">S/ ${c.p50.toFixed(4)}</td>`;
        html += `<td class="py-2.5 px-4">S/ ${c.p90.toFixed(4)}</td>`;
        html += `<td class="py-2.5 px-4">S/ ${c.cierre.toFixed(4)}</td>`;
        html += `<td class="py-2.5 px-4 font-sans">${c.dentro ? "dentro" : "fuera"}</td>`;
        html += '</tr>';
      }
      html += '</tbody>';
      html += '</table>';
      html += '</div>';
      if (h.casos.length > showCount) {
        html += `<p class="text-ink-soft text-xs mt-1">Mostrando los ${showCount} más recientes de ${h.casos.length} casos.</p>`;
      }
    }
    html += '</div>';
  }
  html += '</div>';

  // Part (b): Prueba histórica
  const ph = prueba_historica;
  html += '<div class="space-y-4 border-t border-rule pt-6">';
  html += '<h3 class="text-lg font-semibold text-ink">Prueba histórica (no son pronósticos publicados)</h3>';
  html += '<p class="text-ink-soft text-sm">';
  html += `Entre enero de 2019 y noviembre de 2026, recalculando el modelo solo con la historia previa a cada día, el rango de 80 % contuvo el cierre real `;
  html += `${ph.cobertura_fuera_muestra} % de las veces (${ph.cortes.toLocaleString()} días).`;
  html += '</p>';

  if (ph.por_anio && ph.por_anio.length > 0) {
    html += '<div class="overflow-x-auto">';
    html += '<table class="w-full text-left text-sm border border-rule">';
    html += '<thead class="bg-paper border-b border-rule font-mono text-xs text-ink uppercase">';
    html += '<tr>';
    html += '<th class="py-2.5 px-4 font-semibold">Año</th>';
    html += '<th class="py-2.5 px-4 font-semibold">Días</th>';
    html += '<th class="py-2.5 px-4 font-semibold">Cobertura 80 %</th>';
    html += '<th class="py-2.5 px-4 font-semibold">Ancho medio (%)</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody class="divide-y divide-rule font-mono tnum text-ink">';
    for (const row of ph.por_anio) {
      html += '<tr>';
      html += `<td class="py-2.5 px-4 font-sans">${row.anio}</td>`;
      html += `<td class="py-2.5 px-4">${row.n.toLocaleString()}</td>`;
      html += `<td class="py-2.5 px-4">${row.cobertura.toFixed(2)} %</td>`;
      html += `<td class="py-2.5 px-4">${row.ancho_pct.toFixed(3)}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
    html += '</table>';
    html += '</div>';
  }

  // Part (c): Backtest del motor actual
  if (backtest_motor && (backtest_motor.manana || backtest_motor.semana)) {
    html += '<div class="space-y-3 border-t border-rule pt-6">';
    html += '<h3 class="text-lg font-semibold text-ink">Backtest del motor actual (daily-forecasts.json)</h3>';

    if (backtest_motor.manana) {
      const m = backtest_motor.manana;
      html += '<p class="text-ink-soft text-sm">';
      html += `Mañana (h2): cobertura expansiva k = ${m.cobertura_80_k_expansivo.toFixed(2)} % sobre ${m.cortes_evaluados.toLocaleString()} cortes.`;
      html += '</p>';
    }
    if (backtest_motor.semana) {
      const s = backtest_motor.semana;
      html += '<p class="text-ink-soft text-sm">';
      html += `Próxima semana (h6): cobertura expansiva k = ${s.cobertura_80_k_expansivo.toFixed(2)} % sobre ${s.cortes_evaluados.toLocaleString()} cortes.`;
      html += '</p>';
    }
    html += '</div>';
  }

  html += '</div>';

  html += `<p class="text-ink-soft text-xs mt-4">Actualizado: ${actualizado || "—"}. Fuente: BCRP (cierres oficiales) y data/daily-forecasts.json (pronósticos publicados).</p>`;

  return html;
}