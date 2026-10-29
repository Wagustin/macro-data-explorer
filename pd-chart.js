/* ============================================================
   PERDATA — PdChart (componente aislado, Chart.js 4.4.4)
   Exporta: PdChart.render(container, props), .update(props), .destroy(), .resize()
   Los colores se leen de variables CSS --pd-* del contenedor; cero colores fijos.
   ============================================================ */

(function (global) {
  "use strict";

  const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                     "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  function monthLabel(dateStr) {
    if (!dateStr) return "";
    const p = String(dateStr).split("-");
    if (p.length < 2) return dateStr;
    const m = parseInt(p[1], 10) - 1;
    const mName = MONTHS_ES[m] || p[1];
    if (p.length >= 3 && p[2] && p[2] !== "01") {
      const day = parseInt(p[2], 10);
      return `${day} ${mName}`;
    }
    if (p[0]) return `${mName} '${p[0].slice(2)}`;
    return mName;
  }

  function formatChipDate(dateStr) {
    if (!dateStr) return "";
    const p = String(dateStr).split("-");
    if (p.length < 2) return dateStr;
    const m = parseInt(p[1], 10) - 1;
    const mName = MONTHS_ES[m] || p[1];
    if (p.length >= 3 && p[2]) {
      const day = parseInt(p[2], 10);
      return `${day} ${mName} ${p[0]}`;
    }
    if (p[0]) return `${mName} ${p[0]}`;
    return mName;
  }

  function maxSixLabels(labels) {
    if (labels.length <= 6) return labels;
    const step = Math.floor((labels.length - 1) / 5);
    const out = [labels[0]];
    for (let i = step; i < labels.length - 1; i += step) out.push(labels[i]);
    out.push(labels[labels.length - 1]);
    return out;
  }

  function currencySymbol(code) {
    return code === "PEN" ? "S/ " : "$";
  }

  function getComputedTokens(el) {
    const cs = window.getComputedStyle(el || document.documentElement);
    const rootCs = window.getComputedStyle(document.documentElement);
    return {
      ink: cs.getPropertyValue("--pd-ink").trim() || rootCs.getPropertyValue("--pd-ink").trim() || "#1B1916",
      inkSoft: cs.getPropertyValue("--pd-ink-soft").trim() || rootCs.getPropertyValue("--pd-ink-soft").trim() || "#5E584E",
      paper: cs.getPropertyValue("--pd-paper").trim() || rootCs.getPropertyValue("--pd-paper").trim() || "#F5F1E8",
      surface: cs.getPropertyValue("--pd-surface").trim() || rootCs.getPropertyValue("--pd-surface").trim() || "#ECE6D9",
      accent: cs.getPropertyValue("--pd-accent").trim() || rootCs.getPropertyValue("--pd-accent").trim() || "#1B1916",
      sky: cs.getPropertyValue("--pd-sky").trim() || rootCs.getPropertyValue("--pd-sky").trim() || "#B9AF9A",
      rule: cs.getPropertyValue("--pd-rule").trim() || rootCs.getPropertyValue("--pd-rule").trim() || "#DCD4C4",
      card: cs.getPropertyValue("--pd-card").trim() || rootCs.getPropertyValue("--pd-card").trim() || "#1C1B18",
      pos: cs.getPropertyValue("--pd-pos").trim() || rootCs.getPropertyValue("--pd-pos").trim() || "#1E7A46",
      neg: cs.getPropertyValue("--pd-neg").trim() || rootCs.getPropertyValue("--pd-neg").trim() || "#B3261E",
    };
  }

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  const PdChart = {
    instances: new WeakMap(),

    render(container, props) {
      if (!container) throw new Error("PdChart.render: contenedor requerido");
      if (Chart === undefined) {
        throw new Error("PdChart.render: Chart.js (global Chart) no está cargado");
      }

      const prev = this.instances.get(container);
      if (prev) {
        prev.destroy();
      }

      const { history = [], forecast, macro, options = {} } = props;
      const currency = options.currency || "USD";
      const sym = currencySymbol(currency);
      const isDark = Boolean(options.isDark);
      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      const tokens = getComputedTokens(container);

      // Línea histórica: usa cierres DIARIOS para rangos ≤ 1 año (más veraz que 6 puntos mensuales)
      // y tensión 0 en móvil para evitar sobreoscilación.
      const range = options.range || "1y";
      const rangeYears = range === "1y" ? 1 : range === "2y" ? 2 : range === "3y" ? 3 : range === "5y" ? 5 : 10;
      const H = Number(options.horizonMonths || 1);
      const isShortRange = rangeYears <= 1 || H <= 12;

      const dailySource = props.daily || [];
      const useDaily = isShortRange && dailySource && dailySource.length > 2;

      let seriesPoints;
      if (useDaily) {
        seriesPoints = dailySource.map(d => ({ d: d.date, v: Number(d.close) }));
      } else {
        seriesPoints = history.map(h => ({ d: h.date.substring(0, 7), v: Number(h.close) }));
      }

      let seriesLabels = seriesPoints.map(h => h.d);
      let seriesData = seriesPoints.map(h => h.v);

      const forecastSeries = forecast && forecast.forecastSeries ? forecast.forecastSeries : [];
      const macroEnabled = macro && macro.enabled && macro.series && macro.series.length;
      const macroSeries = macroEnabled ? macro.series.map(m => ({ d: m.date.substring(0, 7), v: Number(m.close) })) : [];

      // Rango automático según horizonte (6 meses para H=1, 1 año para H=3-6 y 3 años para H=12)
      if (useDaily) {
        const H = Number(options.horizonMonths || 1);
        // Móvil: ~3 meses de historia para que la proyección se vea; ordenador: 1 año
        const dayLimit = isMobile ? 63 : 252;
        let sliced = seriesPoints.slice(-dayLimit);
        // Gráfico compacto (landing): cierres semanales, contando desde el último cierre para conservarlo
        if (options.compact && sliced.length > 120) {
          sliced = sliced.filter((_, i) => (sliced.length - 1 - i) % 5 === 0);
        }
        if (sliced.length > 1) {
          seriesLabels = sliced.map(h => h.d);
          seriesData = sliced.map(h => h.v);
        }
      } else if (history && history.length > 0 && options.horizonMonths) {
        const H = Number(options.horizonMonths);
        const months = isMobile ? (H <= 6 ? 3 : 12) : (H <= 6 ? 12 : 36);
        const lastItem = seriesPoints[seriesPoints.length - 1];
        const lastDate = lastItem ? new Date(lastItem.d + "-01T00:00:00") : new Date();
        const cutoff = new Date(lastDate);
        cutoff.setMonth(cutoff.getMonth() - months);
        const filtered = seriesPoints.filter(h => new Date(h.d + "-01T00:00:00") >= cutoff);
        if (filtered.length > 1) {
          seriesLabels = filtered.map(h => h.d);
          seriesData = filtered.map(h => h.v);
        }
      }

      // nHist = puntos de historia que se dibujan
      const nHist = seriesData.length;

      // Reserva de ancho para la zona futura: al menos 30% en móvil y 22% en escritorio, incluso para H=1M
      const targetFutureRatio = isMobile ? 0.32 : 0.24;
      const nFutureSlots = forecastSeries.length > 0
        ? Math.max(forecastSeries.length, Math.round(nHist * (targetFutureRatio / (1 - targetFutureRatio))))
        : 0;

      const labels = [...seriesLabels];
      const histPadded = [...seriesData];
      for (let s = 0; s < nFutureSlots; s++) histPadded.push(null);

      // Arrays de pronóstico (con slots suficientes para reservar el 30% en móvil / 22% en escritorio)
      const totalLen = labels.length + nFutureSlots;
      const p50 = new Array(totalLen).fill(null);
      const p10 = new Array(totalLen).fill(null);
      const p25 = new Array(totalLen).fill(null);
      const p75 = new Array(totalLen).fill(null);
      const p90 = new Array(totalLen).fill(null);

      if (forecastSeries.length) {
        const lastRealVal = seriesData[nHist - 1];
        const lastRealDate = seriesLabels[nHist - 1];

        // Hitos del pronóstico
        const milestones = [
          {
            prog: 0,
            date: lastRealDate,
            p10: lastRealVal,
            p25: lastRealVal,
            p50: lastRealVal,
            p75: lastRealVal,
            p90: lastRealVal,
          }
        ];
        forecastSeries.forEach((item, mIdx) => {
          milestones.push({
            prog: (mIdx + 1) / forecastSeries.length,
            date: item.date.substring(0, 7),
            p10: Number(item.p10),
            p25: Number(item.p25 !== undefined ? item.p25 : item.p10),
            p50: Number(item.p50),
            p75: Number(item.p75 !== undefined ? item.p75 : item.p90),
            p90: Number(item.p90),
          });
        });

        // Punto de anclaje inicial en Hoy (nHist - 1)
        p50[nHist - 1] = lastRealVal;
        p10[nHist - 1] = lastRealVal;
        p25[nHist - 1] = lastRealVal;
        p75[nHist - 1] = lastRealVal;
        p90[nHist - 1] = lastRealVal;

        // Abanico con forma de difusión: entre «Hoy» y el primer mes proyectado, la distancia de cada
        // cuantil al P50 crece como sqrt(t) (así crece la incertidumbre en el modelo); entre meses
        // reales, interpolación lineal que Chart.js suaviza con curva monótona. Los valores exactos
        // son solo los de cada mes devuelto por /api/forecast.
        const QS = ["p10", "p25", "p75", "p90"];
        for (let k = 1; k <= nFutureSlots; k++) {
          const prog = k / nFutureSlots;
          const idx = nHist - 1 + k;

          let seg = 0;
          while (seg < milestones.length - 1 && milestones[seg + 1].prog < prog) {
            seg++;
          }
          const m0 = milestones[seg];
          const m1 = milestones[seg + 1] || m0;
          const segSpan = (m1.prog - m0.prog) || 1;
          const alpha = Math.min(1, Math.max(0, (prog - m0.prog) / segSpan));

          const mid = m0.p50 + alpha * (m1.p50 - m0.p50);
          p50[idx] = Number(mid.toFixed(4));
          const shape = seg === 0 ? Math.sqrt(alpha) : alpha;
          const target = { p10, p25, p75, p90 };
          QS.forEach((q) => {
            const d0 = m0[q] - m0.p50;
            const d1 = m1[q] - m1.p50;
            const d = seg === 0 ? d1 * shape : d0 + (d1 - d0) * shape;
            target[q][idx] = Number((mid + d).toFixed(4));
          });

          labels.push(alpha > 0.5 ? m1.date : m0.date);
        }
      }

      const ctx = container.querySelector("canvas");
      if (!ctx) {
        throw new Error("PdChart.render: el contenedor debe tener un <canvas>");
      }
      const cctx = ctx.getContext("2d");

      // Gradiente de relleno sutil bajo la línea de historia: sky 12% -> 0%
      const gradFill = cctx.createLinearGradient(0, 0, 0, container.clientHeight || 400);
      gradFill.addColorStop(0, hexAlpha(tokens.sky, 12));
      gradFill.addColorStop(1, hexAlpha(tokens.sky, 0));

      const datasets = [
        {
          label: "Histórico",
          data: histPadded,
          borderColor: tokens.ink,
          backgroundColor: gradFill,
          borderWidth: isMobile ? 1.4 : 1.2,
          pointRadius: 0,
          fill: "start",
          cubicInterpolationMode: "monotone",
          tension: useDaily ? 0 : 0.25,
          borderJoinStyle: "round",
          spanGaps: false,
          order: 3,
        },
      ];

      if (forecastSeries.length) {
        // Abanico exterior P10–P90 (con degradado horizontal que se desvanece hacia el futuro)
        datasets.push({
          label: "P90",
          data: p90,
          borderColor: "transparent",
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea: area, scales } = chart;
            if (!area || !scales?.x) return hexAlpha(tokens.sky, 14);
            const x0 = scales.x.getPixelForValue(nHist - 1);
            const x1 = scales.x.getPixelForValue(labels.length - 1);
            if (!isFinite(x0) || !isFinite(x1) || x1 <= x0) return hexAlpha(tokens.sky, 14);
            const g = c.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, hexAlpha(tokens.sky, 16));
            g.addColorStop(1, hexAlpha(tokens.sky, 3));
            return g;
          },
          borderWidth: 0,
          pointRadius: 0,
          fill: "+1",
          tension: 0.15,
          order: 2,
        });
        datasets.push({
          label: "P10",
          data: p10,
          borderColor: "transparent",
          backgroundColor: "transparent",
          borderWidth: 0,
          pointRadius: 0,
          fill: false,
          tension: 0.15,
          order: 2,
        });
        // Abanico interior P25–P75 (más opaco cerca de Hoy, desvaneciéndose hacia el futuro)
        datasets.push({
          label: "P75",
          data: p75,
          borderColor: "transparent",
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea: area, scales } = chart;
            if (!area || !scales?.x) return hexAlpha(tokens.sky, 22);
            const x0 = scales.x.getPixelForValue(nHist - 1);
            const x1 = scales.x.getPixelForValue(labels.length - 1);
            if (!isFinite(x0) || !isFinite(x1) || x1 <= x0) return hexAlpha(tokens.sky, 22);
            const g = c.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, hexAlpha(tokens.sky, 26));
            g.addColorStop(1, hexAlpha(tokens.sky, 5));
            return g;
          },
          borderWidth: 0,
          pointRadius: 0,
          fill: "+1",
          tension: 0.15,
          order: 2,
        });
        datasets.push({
          label: "P25",
          data: p25,
          borderColor: "transparent",
          backgroundColor: "transparent",
          borderWidth: 0,
          pointRadius: 0,
          fill: false,
          tension: 0.15,
          order: 2,
        });
        // P50 discontinua
        datasets.push({
          label: "P50",
          data: p50,
          borderColor: tokens.ink,
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.15,
          order: 1,
        });
        // Punto del último cierre real
        const lastReal = new Array(labels.length).fill(null);
        lastReal[nHist - 1] = seriesData[seriesData.length - 1];
        datasets.push({
          label: "Último cierre",
          data: lastReal,
          borderColor: "transparent",
          backgroundColor: tokens.ink,
          borderWidth: 0,
          pointRadius: 3,
          showLine: false,
          order: 4,
        });
      }

      const allVals = [
        ...seriesData.filter(v => v !== null && !isNaN(v)),
        ...p10.filter(v => v !== null && !isNaN(v)),
        ...p90.filter(v => v !== null && !isNaN(v)),
      ];
      const yMin = allVals.length ? Math.min(...allVals) : 0;
      const yMax = allVals.length ? Math.max(...allVals) : 100;
      const yPad = (yMax - yMin) * 0.12 || Math.max(Math.abs(yMax), 1) * 0.12;

      datasets.forEach((d) => {
        if (/^P\d/.test(d.label || "")) { d.cubicInterpolationMode = "monotone"; d.tension = 0.4; }
      });
      const chart = new Chart(cctx, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              right: isMobile ? (options.plainLabels ? 110 : 70) : (options.plainLabels ? 170 : 88),
              top: 10,
              left: 4,
              bottom: 4,
            },
          },
          animation: reduceMotion() ? false : {
            duration: 750,
            easing: "easeOutQuart",
          },
          animations: reduceMotion() ? {} : {
            y: {
              type: "number",
              easing: "easeOutQuart",
              duration: 380,
              delay: function(ctx) {
                if (reduceMotion()) return 0;
                return ctx.datasetIndex === 0 ? 0 : 350;
              }
            },
            x: {
              type: "number",
              easing: "linear",
              duration: 350,
              delay: function(ctx) {
                if (reduceMotion()) return 0;
                return ctx.datasetIndex === 0 ? 0 : 350;
              }
            }
          },
          interaction: { mode: "nearest", intersect: false, axis: "x" },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: "category",
              ticks: {
                maxTicksLimit: isMobile ? 4 : 6,
                maxRotation: 0,
                minRotation: 0,
                autoSkip: true,
                callback: (v) => (labels[v] ? monthLabel(labels[v]) : ""),
                font: { family: "IBM Plex Mono, ui-monospace, monospace", size: 10 },
                color: tokens.inkSoft,
                padding: 4,
              },
              grid: { display: false, drawBorder: false },
              border: { display: false },
            },
            y: {
              type: "linear",
              position: "right",
              min: yMin - yPad,
              max: yMax + yPad,
              ticks: {
                // En móvil las cifras del eje se pisaban con las etiquetas directas: se ocultan
                display: !options.plainLabels && !isMobile,
                maxTicksLimit: options.compact ? 4 : (isMobile ? 4 : 5),
                callback: function (val) {
                  return sym + Number(val).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                },
                font: { family: "IBM Plex Mono, ui-monospace, monospace", size: 10 },
                color: tokens.inkSoft,
                padding: 6,
              },
              grid: {
                color: hexAlpha(tokens.rule, options.compact ? 30 : 60),
                drawBorder: false,
                drawTicks: false,
              },
              border: { display: false },
            },
          },
        },
        plugins: [
          {
            id: "pd-chart-core",
            beforeDraw(ch) {
              // Zona futura: fondo transparente sobre la tarjeta (sin caja de fondo gris)
              if (!forecastSeries.length) return;
              const { ctx: c, chartArea: area, scales } = ch;
              if (!area || !scales.x) return;
              const xScale = scales.x;
              const hoyIdx = nHist - 1;
              const hoyX = xScale.getPixelForValue(hoyIdx);
              if (!isFinite(hoyX)) return;

              // Línea Hoy: exactamente en el punto del último cierre real
              c.save();
              c.strokeStyle = hexAlpha(tokens.inkSoft, 70);
              c.lineWidth = 1;
              c.setLineDash([3, 3]);
              c.beginPath();
              c.moveTo(hoyX, area.top);
              c.lineTo(hoyX, area.bottom);
              c.stroke();
              c.setLineDash([]);
              c.fillStyle = tokens.ink;
              c.font = "700 10px 'IBM Plex Mono', ui-monospace, monospace";
              c.fillText("Hoy", hoyX + 4, area.top + 14);
              c.restore();
            },
            afterDatasetsDraw(ch) {
              const { ctx: c, chartArea: area, scales } = ch;
              if (!area || !scales.y || !scales.x) return;
              const mob = typeof window !== "undefined" && window.innerWidth < 640;

              // 1. Pastilla del último precio pegada al eje Y a la altura del último cierre
              const lastCloseVal = seriesData[nHist - 1];
              let yClose = null;
              if (lastCloseVal != null && !isNaN(lastCloseVal)) {
                yClose = scales.y.getPixelForValue(lastCloseVal);
                const hoyX = scales.x.getPixelForValue(nHist - 1);
                if (isFinite(yClose)) {
                  // Línea guía horizontal punteada sutil desde Hoy hasta el eje Y
                  if (isFinite(hoyX)) {
                    c.save();
                    c.strokeStyle = hexAlpha(tokens.inkSoft, 30);
                    c.lineWidth = 1;
                    c.setLineDash([2, 2]);
                    c.beginPath();
                    c.moveTo(hoyX, yClose);
                    c.lineTo(area.right, yClose);
                    c.stroke();
                    c.restore();
                  }

                  // Pastilla en el eje Y (solo si no es modo de etiquetas directas en margen)
                  if (!options.plainLabels) {
                    const priceStr = sym + Number(lastCloseVal).toFixed(2);
                    c.save();
                    c.font = "700 10px 'IBM Plex Mono', ui-monospace, monospace";
                    const textW = c.measureText(priceStr).width;
                    const pillW = textW + 8;
                    const pillH = 17;
                    const pillX = area.right + 2;
                    const pillY = yClose - pillH / 2;

                    c.fillStyle = tokens.ink;
                    c.beginPath();
                    if (typeof c.roundRect === "function") {
                      c.roundRect(pillX, pillY, pillW, pillH, 3);
                    } else {
                      c.rect(pillX, pillY, pillW, pillH);
                    }
                    c.fill();

                    c.fillStyle = tokens.paper || (isDark ? "#141311" : "#F5F1E8");
                    c.textAlign = "center";
                    c.textBaseline = "middle";
                    c.fillText(priceStr, pillX + pillW / 2, yClose);
                    c.restore();
                  }
                }
              }

              // 2. Etiquetas directas P90, P50, P10 al final del abanico
              if (!forecastSeries.length) return;
              const lastIdx = labels.length - 1;
              const xLast = scales.x.getPixelForValue(lastIdx);
              if (!isFinite(xLast)) return;

              const valP90 = p90[lastIdx];
              const valP50 = p50[lastIdx];
              const valP10 = p10[lastIdx];

              const yP90 = scales.y.getPixelForValue(valP90 ?? valP50);
              const yP50 = scales.y.getPixelForValue(valP50);
              const yP10 = scales.y.getPixelForValue(valP10 ?? valP50);

              let pos90 = yP90;
              let pos50 = yP50;
              let pos10 = yP10;

              const isPlain = Boolean(options.plainLabels);

              // Anti-colisión entre P50 y la pastilla del último precio:
              // "la pastilla del último precio no puede tapar la etiqueta P50: si chocan, la P50 se desplaza"
              if (!isPlain && yClose !== null && isFinite(yClose)) {
                const pillCollisionDist = 18;
                if (Math.abs(pos50 - yClose) < pillCollisionDist) {
                  if (pos50 <= yClose) {
                    pos50 = yClose - pillCollisionDist;
                  } else {
                    pos50 = yClose + pillCollisionDist;
                  }
                }
              }

              // Separación mínima: si chocan, se desplazan (anti-solapamiento)
              const minDist = isPlain ? (mob ? 16 : 18) : 14;
              if (pos50 - pos90 < minDist) {
                const mid = (pos90 + pos50) / 2;
                pos90 = mid - minDist / 2;
                pos50 = mid + minDist / 2;
              }
              if (pos10 - pos50 < minDist) {
                pos10 = pos50 + minDist;
              }
              if (pos50 - pos90 < minDist) {
                pos90 = pos50 - minDist;
              }

              // Mantener dentro del área visible vertical
              if (pos90 < area.top + 8) {
                const shift = (area.top + 8) - pos90;
                pos90 += shift;
                pos50 += shift;
                pos10 += shift;
              }
              if (pos10 > area.bottom - 4) {
                const shift = pos10 - (area.bottom - 4);
                pos10 -= shift;
                pos50 = Math.min(pos50, pos10 - minDist);
                pos90 = Math.min(pos90, pos50 - minDist);
              }

              // Posicionadas en el extremo derecho del abanico
              const xText = isPlain
                ? (mob ? area.right + 4 : xLast + 8)
                : (mob ? area.right + 6 : Math.min(xLast, area.right) - 6);

              c.save();
              c.textAlign = isPlain ? "left" : (mob ? "left" : "right");
              c.textBaseline = "middle";
              c.font = mob
                ? (isPlain ? "700 8px 'IBM Plex Mono', ui-monospace, monospace" : "700 9px 'IBM Plex Mono', ui-monospace, monospace")
                : (isPlain ? "600 10px 'IBM Plex Mono', ui-monospace, monospace" : "700 10.5px 'IBM Plex Mono', ui-monospace, monospace");

              if (valP90 != null && !isNaN(valP90)) {
                c.fillStyle = tokens.inkSoft;
                const txt90 = isPlain ? (mob ? "Esc. alto " : "Escenario alto ") : "P90 ";
                c.fillText(txt90 + sym + Number(valP90).toFixed(2), xText, pos90);
              }
              if (valP50 != null && !isNaN(valP50)) {
                c.fillStyle = isPlain ? tokens.accent : tokens.ink;
                if (isPlain) {
                  c.font = mob
                    ? "700 8.5px 'IBM Plex Mono', ui-monospace, monospace"
                    : "700 10.5px 'IBM Plex Mono', ui-monospace, monospace";
                }
                const txt50 = isPlain ? (mob ? "Probable " : "Lo más probable ") : "P50 ";
                c.fillText(txt50 + sym + Number(valP50).toFixed(2), xText, pos50);
              }
              if (valP10 != null && !isNaN(valP10)) {
                c.fillStyle = tokens.inkSoft;
                if (isPlain) {
                  c.font = mob
                    ? "700 8px 'IBM Plex Mono', ui-monospace, monospace"
                    : "600 10px 'IBM Plex Mono', ui-monospace, monospace";
                }
                const txt10 = isPlain ? (mob ? "Esc. bajo " : "Escenario bajo ") : "P10 ";
                c.fillText(txt10 + sym + Number(valP10).toFixed(2), xText, pos10);
              }
              c.restore();
            },
            afterDraw() {
              // Rótulo del modelo se gestiona en HTML fuera del canvas
            },
          },
        ],
      });

      // Contenedor de ficha del crosshair (HTML, fuera del canvas)
      let chip = container.querySelector(".pd-chip");
      if (!chip) {
        chip = document.createElement("div");
        chip.className = "pd-chip";
        chip.style.cssText =
          "position:absolute;z-index:30;pointer-events:none;padding:8px 12px;border:1px solid " + tokens.rule + ";background:" + tokens.card + ";color:" + tokens.ink + ";border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.14);font:600 11px 'IBM Plex Mono',ui-monospace,monospace;display:none;min-width:145px;line-height:1.45;";
        container.style.position = container.style.position || "relative";
        container.appendChild(chip);
      }
      // Móvil: la ficha va en un hueco encima del gráfico, que se abre y empuja el gráfico hacia abajo,
      // para que el dedo no la tape.
      let slot = null;
      // Also in compact charts (landing): the readout never covers the projection
      if (isMobile && container.parentNode) {
        slot = container.previousElementSibling && container.previousElementSibling.classList.contains("pd-chip-slot")
          ? container.previousElementSibling : null;
        if (!slot) {
          slot = document.createElement("div");
          slot.className = "pd-chip-slot";
          container.parentNode.insertBefore(slot, container);
        }
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        slot.style.cssText = "height:0;overflow:hidden;" + (reduce ? "" : "transition:height 200ms cubic-bezier(.05,.7,.1,1);");
        slot.querySelectorAll(".pd-chip").forEach((old) => { if (old !== chip) old.remove(); });
        slot.appendChild(chip);
        chip.style.position = "static";
        chip.style.boxShadow = "none";
        chip.style.minHeight = "96px";
        chip.style.margin = "0 0 8px";
      }
      let slotTimer = null;
      let vline = container.querySelector(".pd-vline");
      if (!vline) {
        vline = document.createElement("div");
        vline.className = "pd-vline";
        vline.style.cssText =
          "position:absolute;z-index:15;top:8px;bottom:26px;width:1px;border-left:1px dashed " + tokens.inkSoft + ";background:transparent;display:none;pointer-events:none;";
        container.style.position = container.style.position || "relative";
        container.appendChild(vline);
      }
      let dotHalo = container.querySelector(".pd-dot-halo");
      if (!dotHalo) {
        dotHalo = document.createElement("div");
        dotHalo.className = "pd-dot-halo";
        dotHalo.style.cssText =
          "position:absolute;z-index:20;width:8px;height:8px;border-radius:50%;background:" + tokens.accent + ";box-shadow:0 0 0 4px rgba(27,25,22,0.25);display:none;pointer-events:none;transform:translate(-50%,-50%);";
        container.style.position = container.style.position || "relative";
        container.appendChild(dotHalo);
      }

      function drawCrosshair(xPx, idx) {
        const label = labels[idx];
        const v = seriesData[idx];
        const p = p50[idx];
        const isFuture = idx >= nHist;
        
        vline.style.left = xPx + "px";
        vline.style.display = "block";

        const ptVal = isFuture ? p : v;
        if (ptVal != null && !isNaN(ptVal)) {
          const yPx = chart.scales.y.getPixelForValue(ptVal);
          if (isFinite(yPx)) {
            dotHalo.style.left = xPx + "px";
            dotHalo.style.top = yPx + "px";
            dotHalo.style.display = "block";
          } else {
            dotHalo.style.display = "none";
          }
        } else {
          dotHalo.style.display = "none";
        }

        const dateStr = formatChipDate(label);
        const fmt = (n) => sym + Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const row = (name, val, strong) =>
          `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;color:${strong ? tokens.ink : tokens.inkSoft};"><span>${name}</span><span style="font-family:var(--pd-font-mono,monospace);font-variant-numeric:tabular-nums;${strong ? "font-weight:700;" : ""}color:${tokens.ink};">${val}</span></div>`;
        let html = `<div style="font-weight:700;font-size:12px;margin-bottom:5px;border-bottom:1px solid ${tokens.rule};padding-bottom:4px;color:${tokens.ink};">${dateStr}${isFuture ? " · proyección" : ""}</div>`;
        if (!isFuture && v != null && !isNaN(v)) {
          html += row("Precio de cierre", fmt(v), true);
        }
        if (isFuture && p != null && !isNaN(p)) {
          html += row("Lo más probable (P50)", fmt(p), true);
          if (p10[idx] != null && p90[idx] != null) html += row("Rango 80 % (P10–P90)", fmt(p10[idx]) + " – " + fmt(p90[idx]));
          if (p25[idx] != null && p75[idx] != null) html += row("Rango 50 % (P25–P75)", fmt(p25[idx]) + " – " + fmt(p75[idx]));
          const base = seriesData[nHist - 1];
          if (base) {
            const ch = (p - base) / base * 100;
            const col = ch >= 0 ? "var(--pd-pos)" : "var(--pd-neg)";
            html += `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;color:${tokens.inkSoft};"><span>Frente a hoy</span><span style="font-family:var(--pd-font-mono,monospace);font-variant-numeric:tabular-nums;font-weight:700;color:${col};">${ch >= 0 ? "+" : ""}${ch.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</span></div>`;
          }
          html += `<div style="margin-top:5px;font-size:11px;color:${tokens.inkSoft};">Entre meses proyectados el valor se interpola.</div>`;
        }
        chip.innerHTML = html;
        chip.style.display = "block";
        chip.style.fontSize = "13px";
        chip.style.lineHeight = "1.35";
        chip.style.padding = "9px 11px";
        chip.style.borderRadius = "6px";
        chip.style.background = tokens.card;
        chip.style.border = "1px solid " + tokens.rule;
        chip.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
        chip.style.whiteSpace = (container.clientWidth || 400) < 640 ? "normal" : "nowrap";
        chip.style.maxWidth = Math.max(160, (container.clientWidth || 400) - 8) + "px";
        chip.style.boxSizing = "border-box";
        chip.style.color = tokens.ink;
        if ((container.clientWidth || 400) < 640) chip.style.fontSize = "12px";

        const cWidth = container.clientWidth || 400;
        const chipWidth = chip.offsetWidth || 230;
        if (slot) {
          clearTimeout(slotTimer);
          chip.style.maxWidth = "none";
          slot.style.height = (chip.offsetHeight + 8) + "px";
        } else if (cWidth < 640) {
          chip.style.left = Math.max(4, (cWidth - chipWidth) / 2) + "px";
          chip.style.top = "4px";
        } else {
          chip.style.left = (xPx + chipWidth + 18 > cWidth) ? Math.max(4, xPx - chipWidth - 14) + "px" : (xPx + 14) + "px";
          chip.style.top = "12px";
        }
      }

      function removeCrosshair() {
        vline.style.display = "none";
        dotHalo.style.display = "none";
        if (!slot) { chip.style.display = "none"; return; }
        clearTimeout(slotTimer);
        slotTimer = setTimeout(() => { slot.style.height = "0px"; }, 1500);
      }

      function onMouseMove(e) {
        const rect = chart.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const area = chart.chartArea;
        // With the readout slot the chart moves under the cursor, so only x matters there
        if (!area || x < area.left || x > area.right || (!slot && (y < area.top || y > area.bottom))) {
          removeCrosshair();
          return;
        }
        const xScale = chart.scales.x;
        const idx = Math.round(xScale.getValueForPixel(x));
        if (idx < 0 || idx >= labels.length) {
          removeCrosshair();
          return;
        }
        drawCrosshair(x, idx);
      }

      function onTouchMove(e) {
        if (!e.touches || !e.touches[0]) return;
        const rect = chart.canvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const area = chart.chartArea;
        if (!area || x < area.left || x > area.right) {
          removeCrosshair();
          return;
        }
        const xScale = chart.scales.x;
        const idx = Math.round(xScale.getValueForPixel(x));
        if (idx < 0 || idx >= labels.length) {
          removeCrosshair();
          return;
        }
        drawCrosshair(x, idx);
      }

      chart.canvas.addEventListener("mousemove", onMouseMove);
      // With the slot, close only when the pointer leaves the whole block (slot + chart),
      // otherwise moving onto the readout would close it and the chart would jump back
      const leaveTarget = slot ? container.parentNode : chart.canvas;
      leaveTarget.addEventListener("mouseleave", removeCrosshair);
      chart.canvas.addEventListener("touchstart", onTouchMove, { passive: true });
      chart.canvas.addEventListener("touchmove", onTouchMove, { passive: true });
      chart.canvas.addEventListener("touchend", removeCrosshair);

      // Tabla oculta para lectores de pantalla
      let a11y = container.querySelector(".pd-a11y");
      if (!a11y) {
        a11y = document.createElement("div");
        a11y.className = "pd-a11y";
        a11y.setAttribute("aria-hidden", "true");
        a11y.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;";
        container.appendChild(a11y);
      }
      const rows = labels.map((l, i) => {
        const histVal = seriesData[i] != null && !isNaN(seriesData[i]) ? sym + Number(seriesData[i]).toFixed(2) : "—";
        const p50Val = p50[i] != null && !isNaN(p50[i]) ? sym + Number(p50[i]).toFixed(2) : "—";
        const cells = [monthLabel(l), histVal, p50Val];
        return cells.join("\t");
      });
      a11y.textContent = "Gráfico PerData: fecha, precio real y P50 proyectado por mes.\n" + rows.join("\n");

      // Rótulo del modelo FUERA del canvas, en HTML encima del gráfico (11px mono en --pd-ink-soft)
      let modelBadge = document.getElementById("chartModelBadge");
      if (!modelBadge && container.parentElement) {
        modelBadge = container.parentElement.querySelector("#chartModelBadge, .pd-chart-model-badge");
      }
      if (!modelBadge && container.parentNode) {
        const header = document.createElement("div");
        header.className = "flex justify-end items-center mb-1.5 pd-chart-model-header";
        modelBadge = document.createElement("span");
        modelBadge.id = "chartModelBadge";
        modelBadge.className = "pd-chart-model-badge";
        modelBadge.style.cssText = "font:11px 'IBM Plex Mono',ui-monospace,monospace;color:var(--pd-ink-soft);text-align:right;";
        header.appendChild(modelBadge);
        container.parentNode.insertBefore(header, container);
      }
      if (modelBadge) {
        const modelName = forecast && forecast.model ? forecast.model : "engine-v3";
        const runAt = forecast && forecast.runAt ? new Date(forecast.runAt).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
        const txt = /^perdata-engine-v\d/.test(modelName || "")
          ? `PerData Engine v5${runAt ? " · " + runAt : ""}`
          : `PerData Engine v3${runAt ? " · " + runAt : ""}`;
        modelBadge.textContent = forecastSeries.length ? txt : "";
        modelBadge.style.color = "var(--pd-ink-soft)";
        modelBadge.style.fontFamily = "'IBM Plex Mono', ui-monospace, monospace";
        modelBadge.style.fontSize = "11px";
        modelBadge.style.textAlign = "right";
      }

      const instance = {
        container,
        chart,
        update(nextProps) {
          return PdChart.render(container, nextProps);
        },
        destroy() {
          chart.canvas.removeEventListener("mousemove", onMouseMove);
          leaveTarget.removeEventListener("mouseleave", removeCrosshair);
          chart.canvas.removeEventListener("touchstart", onTouchMove);
          chart.canvas.removeEventListener("touchmove", onTouchMove);
          chart.canvas.removeEventListener("touchend", removeCrosshair);
          chart.destroy();
          PdChart.instances.delete(container);
          if (chip) chip.remove();
          if (slot) slot.remove();
          if (vline) vline.remove();
          if (dotHalo) dotHalo.remove();
          if (a11y) a11y.remove();
        },
        resize() {
          chart.resize();
        },
      };
      this.instances.set(container, instance);
      return instance;
    },
  };

  function hexAlpha(hex, pct) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${pct / 100})`;
  }

  if (typeof global.PdChart === "undefined") {
    global.PdChart = PdChart;
  }

})(typeof window !== "undefined" ? window : globalThis);
