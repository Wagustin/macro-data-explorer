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
    const cs = window.getComputedStyle(el);
    return {
      ink: cs.getPropertyValue("--pd-ink").trim() || "#0E1A2B",
      inkSoft: cs.getPropertyValue("--pd-ink-soft").trim() || "#556170",
      surface: cs.getPropertyValue("--pd-surface").trim() || "#EEF1F5",
      accent: cs.getPropertyValue("--pd-accent").trim() || "#1414D2",
      sky: cs.getPropertyValue("--pd-sky").trim() || "#93B7F8",
      rule: cs.getPropertyValue("--pd-rule").trim() || "#DCE1E8",
      pos: cs.getPropertyValue("--pd-pos").trim() || "#1E7A46",
      neg: cs.getPropertyValue("--pd-neg").trim() || "#B3261E",
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
      const histOnly = history.map(h => ({ d: h.date.substring(0, 7), v: Number(h.close) }));
      let seriesLabels = histOnly.map(h => h.d);
      let seriesData = histOnly.map(h => h.v);

      const forecastSeries = forecast && forecast.forecastSeries ? forecast.forecastSeries : [];
      const macroEnabled = macro && macro.enabled && macro.series && macro.series.length;
      const macroSeries = macroEnabled ? macro.series.map(m => ({ d: m.date.substring(0, 7), v: Number(m.close) })) : [];

      // Rango automático según horizonte (6 meses para H=1, 1 año para H=3-6 y 3 años para H=12)
      if (history && history.length > 0 && options.horizonMonths) {
        const H = Number(options.horizonMonths);
        const months = H <= 1 ? 6 : H <= 6 ? 12 : 36;
        const lastItem = histOnly[histOnly.length - 1];
        const lastDate = lastItem ? new Date(lastItem.d + "-01T00:00:00") : new Date();
        const cutoff = new Date(lastDate);
        cutoff.setMonth(cutoff.getMonth() - months);
        // histOnly.d es "YYYY-MM"; se filtra sobre él (no sobre history, que trae "YYYY-MM-DD")
        const filtered = histOnly.filter(h => new Date(h.d + "-01T00:00:00") >= cutoff);
        if (filtered.length > 1) {
          seriesLabels = filtered.map(h => h.d);
          seriesData = filtered.map(h => h.v);
        }
      }

      // nHist = puntos de historia que se dibujan (después del recorte por horizonte)
      const nHist = seriesData.length;
      const labels = [...seriesLabels];
      const histPadded = [...seriesData];
      while (histPadded.length < labels.length) histPadded.push(null);

      // Array de pronóstico (alinee con labels)
      const p50 = new Array(labels.length).fill(null);
      const p10 = new Array(labels.length).fill(null);
      const p25 = new Array(labels.length).fill(null);
      const p75 = new Array(labels.length).fill(null);
      const p90 = new Array(labels.length).fill(null);

      if (forecastSeries.length) {
        // Último punto real se replica al inicio del pronóstico para continuidad visual
        p50[nHist - 1] = seriesData[seriesData.length - 1];
        p10[nHist - 1] = seriesData[seriesData.length - 1];
        p25[nHist - 1] = seriesData[seriesData.length - 1];
        p75[nHist - 1] = seriesData[seriesData.length - 1];
        p90[nHist - 1] = seriesData[seriesData.length - 1];

        forecastSeries.forEach((item, i) => {
          const idx = nHist + i;
          labels.push(item.date.substring(0, 7));
          p50[idx] = Number(item.p50);
          p10[idx] = Number(item.p10);
          p25[idx] = Number(item.p25 !== undefined ? item.p25 : item.p10);
          p75[idx] = Number(item.p75 !== undefined ? item.p75 : item.p90);
          p90[idx] = Number(item.p90);
        });
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
          tension: 0.25,
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
          borderColor: tokens.accent,
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

      const chart = new Chart(cctx, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              right: isMobile ? 64 : 88,
              top: 10,
              left: 4,
              bottom: 4,
            },
          },
          animation: {
            duration: reduceMotion() ? 0 : 600,
            easing: "easeOutQuart",
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
                maxTicksLimit: 6,
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
                maxTicksLimit: 5,
                callback: (v) => {
                  const n = Number(v);
                  return isFinite(n) ? sym + n.toFixed(2) : "";
                },
                font: { family: "IBM Plex Mono, ui-monospace, monospace", size: 10 },
                color: tokens.inkSoft,
                padding: 6,
              },
              grid: {
                color: hexAlpha(tokens.rule, 60),
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
              if (lastCloseVal != null && !isNaN(lastCloseVal)) {
                const yClose = scales.y.getPixelForValue(lastCloseVal);
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

                  // Pastilla en el eje Y
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

                  c.fillStyle = tokens.card || "#FFFFFF";
                  c.textAlign = "center";
                  c.textBaseline = "middle";
                  c.fillText(priceStr, pillX + pillW / 2, yClose);
                  c.restore();
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

              // Separación mínima de 14px; si chocan, se desplazan
              const minDist = 14;
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

              // Posicionadas en el extremo derecho del abanico (alineadas a la derecha dentro del abanico)
              const xText = Math.min(xLast, area.right) - 6;

              c.save();
              c.textAlign = "right";
              c.textBaseline = "middle";
              c.font = mob
                ? "700 9px 'IBM Plex Mono', ui-monospace, monospace"
                : "700 10.5px 'IBM Plex Mono', ui-monospace, monospace";

              if (valP90 != null && !isNaN(valP90)) {
                c.fillStyle = tokens.inkSoft;
                c.fillText("P90 " + sym + Number(valP90).toFixed(2), xText, pos90);
              }
              if (valP50 != null && !isNaN(valP50)) {
                c.fillStyle = tokens.accent;
                c.fillText("P50 " + sym + Number(valP50).toFixed(2), xText, pos50);
              }
              if (valP10 != null && !isNaN(valP10)) {
                c.fillStyle = tokens.inkSoft;
                c.fillText("P10 " + sym + Number(valP10).toFixed(2), xText, pos10);
              }
              c.restore();
            },
            afterDraw() {
              // Rótulo del modelo se gestiona en HTML fuera del canvas
            },
          },
          // Crosshair vertical + ficha
          {
            id: "pd-crosshair",
            afterEvent(ch) {
              const evt = ch.event;
              if (!evt || evt.type !== "mousemove" && evt.type !== "touchmove") return;
              const rect = ch.canvas.getBoundingClientRect();
              const x = (evt.type === "touchmove" ? evt.touches[0].clientX : evt.clientX) - rect.left;
              const y = (evt.type === "touchmove" ? evt.touches[0].clientY : evt.clientY) - rect.top;
              const area = ch.chartArea;
              if (!area || x < area.left || x > area.right || y < area.top || y > area.bottom) {
                removeCrosshair();
                return;
              }
              const xScale = ch.scales.x;
              const idx = Math.round(xScale.getValueForPixel(x));
              if (idx < 0 || idx >= labels.length) return;
              drawCrosshair(x, idx);
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
          "position:absolute;z-index:10;pointer-events:none;padding:6px 10px;border:1px solid var(--pd-rule);background:var(--pd-card);color:var(--pd-ink);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.08);font:600 11px 'IBM Plex Mono',ui-monospace,monospace;transition:left 80ms ease-out, top 80ms ease-out;display:none;min-width:110px;";
        container.style.position = container.style.position || "relative";
        container.appendChild(chip);
      }
      let vline = container.querySelector(".pd-vline");
      if (!vline) {
        vline = document.createElement("div");
        vline.className = "pd-vline";
        vline.style.cssText =
          "position:absolute;z-index:9;top:0;bottom:0;width:1px;border-left:1px dashed var(--pd-ink-soft);background:transparent;display:none;pointer-events:none;transition:left 80ms ease-out;";
        container.style.position = container.style.position || "relative";
        container.appendChild(vline);
      }
      let dotHalo = container.querySelector(".pd-dot-halo");
      if (!dotHalo) {
        dotHalo = document.createElement("div");
        dotHalo.className = "pd-dot-halo";
        dotHalo.style.cssText =
          "position:absolute;z-index:9;width:8px;height:8px;border-radius:50%;background:var(--pd-accent);box-shadow:0 0 0 4px rgba(20,20,210,0.2);display:none;pointer-events:none;transform:translate(-50%,-50%);transition:left 80ms ease-out, top 80ms ease-out;";
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

        let html = `<div style="font-weight:700;margin-bottom:3px;color:var(--pd-ink);">${monthLabel(label)}</div>`;
        if (v != null && !isNaN(v)) {
          html += `<div style="color:var(--pd-ink-soft);">Cierre real: <b style="color:var(--pd-ink);font-family:'IBM Plex Mono',monospace;">${sym}${Number(v).toFixed(2)}</b></div>`;
        }
        if (isFuture && p != null && !isNaN(p)) {
          html += `<div style="color:var(--pd-accent);">P50: <b style="font-family:'IBM Plex Mono',monospace;">${sym}${Number(p).toFixed(2)}</b></div>`;
          if (p90[idx] != null && !isNaN(p90[idx])) {
            html += `<div style="color:var(--pd-ink-soft);">P90: <span style="font-family:'IBM Plex Mono',monospace;">${sym}${Number(p90[idx]).toFixed(2)}</span></div>`;
          }
          if (p10[idx] != null && !isNaN(p10[idx])) {
            html += `<div style="color:var(--pd-ink-soft);">P10: <span style="font-family:'IBM Plex Mono',monospace;">${sym}${Number(p10[idx]).toFixed(2)}</span></div>`;
          }
        }
        chip.innerHTML = html;
        chip.style.display = "block";

        const cWidth = container.clientWidth || 400;
        if (xPx + 140 > cWidth) {
          chip.style.left = Math.max(0, xPx - 130) + "px";
        } else {
          chip.style.left = (xPx + 12) + "px";
        }
        chip.style.top = "10px";
      }

      function removeCrosshair() {
        vline.style.display = "none";
        dotHalo.style.display = "none";
        chip.style.display = "none";
      }

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
        const txt = modelName === "timesfm-2.5"
          ? `TimesFM 2.5 · calculado ${runAt}`
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
          chart.destroy();
          PdChart.instances.delete(container);
          if (chip) chip.remove();
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
