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
    const d = new Date(dateStr + "-01");
    return MONTHS_ES[d.getMonth()] + " " + d.getFullYear().toString().slice(2);
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
      const tokens = getComputedTokens(container);
      const histOnly = history.map(h => ({ d: h.date.substring(0, 7), v: Number(h.close) }));
      let seriesLabels = histOnly.map(h => h.d);
      let seriesData = histOnly.map(h => h.v);

      const forecastSeries = forecast && forecast.forecastSeries ? forecast.forecastSeries : [];
      const macroEnabled = macro && macro.enabled && macro.series && macro.series.length;
      const macroSeries = macroEnabled ? macro.series.map(m => ({ d: m.date.substring(0, 7), v: Number(m.close) })) : [];

      // Rango automático según horizonte (ya aplicado por el caller, pero protegemos aquí)
      if (history && history.length > 0 && options.horizonMonths) {
        const H = options.horizonMonths;
        let years = H <= 6 ? 1 : H === 12 ? 3 : 5;
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - years);
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

      // Macro en base 100 sobre el mismo rango
      let macroPadded = new Array(labels.length).fill(null);
      if (macroEnabled) {
        const macroMap = new Map();
        macroSeries.forEach(m => macroMap.set(m.d, m.v));
        labels.forEach((l, i) => {
          if (macroMap.has(l)) macroPadded[i] = macroMap.get(l);
        });
        // Rebase a 100 usando el primer valor común
        const firstMacro = macroPadded.find(v => v !== null);
        if (firstMacro) {
          macroPadded = macroPadded.map(v => v !== null ? (v / firstMacro) * 100 : null);
        }
      }

      const ctx = container.querySelector("canvas");
      if (!ctx) {
        throw new Error("PdChart.render: el contenedor debe tener un <canvas>");
      }
      const cctx = ctx.getContext("2d");

      const datasets = [
        {
          label: "Histórico",
          data: histPadded,
          borderColor: tokens.ink,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
          spanGaps: false,
          order: 3,
        },
      ];

      if (forecastSeries.length) {
        // Abanico exterior P10–P90
        datasets.push({
          label: "P90",
          data: p90,
          borderColor: "transparent",
          backgroundColor: hexAlpha(tokens.sky, 30),
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
        // Abanico interior P25–P75
        datasets.push({
          label: "P75",
          data: p75,
          borderColor: "transparent",
          backgroundColor: hexAlpha(tokens.sky, 55),
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
          borderWidth: 2,
          borderDash: [6, 4],
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
          pointRadius: 4,
          showLine: false,
          order: 4,
        });
      }

      if (macroEnabled) {
        datasets.push({
          label: macro.name || "Macro",
          data: macroPadded,
          borderColor: tokens.inkSoft,
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 0,
        });
      }

      const yMin = Math.min(...seriesData.filter(v => v !== null));
      const yMax = Math.max(...seriesData.filter(v => v !== null));
      const yPad = (yMax - yMin) * 0.12 || Math.max(Math.abs(yMax), 1) * 0.12;

      const chart = new Chart(cctx, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: reduceMotion() ? 0 : 300,
            easing: "easeInOutQuad",
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
                callback: (v) => labels[v] ? monthLabel(labels[v]) : "",
                font: { family: "IBM Plex Mono, ui-monospace, monospace", size: 10 },
                color: tokens.inkSoft,
              },
              grid: { color: tokens.rule, drawBorder: false },
            },
            y: {
              type: "linear",
              position: "left",
              min: yMin - yPad,
              max: yMax + yPad,
              ticks: {
                callback: (v) => sym + v.toFixed(1),
                font: { family: "IBM Plex Mono, ui-monospace, monospace", size: 10 },
                color: tokens.inkSoft,
              },
              grid: { color: tokens.rule, drawBorder: false },
            },
          },
        },
        plugins: [
          {
            id: "pd-chart-core",
            beforeDraw(ch) {
              // Zona futura + línea Hoy + etiquetas directas
              if (!forecastSeries.length) return;
              const { ctx: c, chartArea: area, scales } = ch;
              if (!area) return;
              const xScale = scales.x;
              const fcStart = nHist;
              const x0 = xScale.getPixelForValue(fcStart - 0.5);
              const x1 = xScale.getPixelForValue(labels.length - 1);
              if (!isFinite(x0) || !isFinite(x1)) return;

              // Fondo zona futura
              c.save();
              c.fillStyle = tokens.surface;
              c.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
              c.restore();

              // Línea Hoy
              const hoyX = xScale.getPixelForValue(fcStart - 0.5);
              c.save();
              c.strokeStyle = tokens.inkSoft;
              c.lineWidth = 1;
              c.setLineDash([3, 3]);
              c.beginPath();
              c.moveTo(hoyX, area.top);
              c.lineTo(hoyX, area.bottom);
              c.stroke();
              c.setLineDash([]);
              c.fillStyle = tokens.ink;
              c.font = `700 10px ${"IBM Plex Mono, ui-monospace, monospace"}`;
              c.fillText("Hoy", hoyX + 5, area.top + 16);
              c.restore();

              // Etiquetas directas P90, P50, P10 al final del abanico
              const lastIdx = labels.length - 1;
              const xLast = xScale.getPixelForValue(lastIdx);
              const yP90 = ch.scales.y.getPixelForValue(p90[lastIdx] ?? p50[lastIdx]);
              const yP50 = ch.scales.y.getPixelForValue(p50[lastIdx]);
              const yP10 = ch.scales.y.getPixelForValue(p10[lastIdx] ?? p50[lastIdx]);

              c.save();
              c.textAlign = "left";
              c.font = `700 11px ${"IBM Plex Mono, ui-monospace, monospace"}`;
              if (p90[lastIdx] != null && !isNaN(p90[lastIdx])) {
                c.fillStyle = tokens.accent;
                c.fillText("P90 " + sym + Number(p90[lastIdx]).toFixed(2), xLast + 8, yP90 - 6);
              }
              if (p50[lastIdx] != null && !isNaN(p50[lastIdx])) {
                c.fillStyle = tokens.ink;
                c.fillText("P50 " + sym + Number(p50[lastIdx]).toFixed(2), xLast + 8, yP50 + 4);
              }
              if (p10[lastIdx] != null && !isNaN(p10[lastIdx])) {
                c.fillStyle = tokens.inkSoft;
                c.fillText("P10 " + sym + Number(p10[lastIdx]).toFixed(2), xLast + 8, yP10 + 14);
              }
              c.restore();
            },
            afterDraw(ch) {
              // Rótulo del modelo sobre el gráfico
              const modelName = forecast && forecast.model ? forecast.model : "engine-v3";
              const runAt = forecast && forecast.runAt ? new Date(forecast.runAt).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
              const txt = modelName === "timesfm-2.5"
                ? `TimesFM 2.5 · calculado ${runAt}`
                : `PerData Engine v3${runAt ? " · " + runAt : ""}`;
              if (!txt) return;
              const { ctx: c, chartArea: area } = ch;
              if (!area) return;
              c.save();
              c.fillStyle = tokens.inkSoft;
              c.font = `600 11px ${"Libre Franklin, -apple-system, sans-serif"}`;
              c.textAlign = "right";
              c.fillText(txt, area.right - 8, area.top - 8);
              c.restore();
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
        chip.style.cssText = "position:absolute;z-index:10;pointer-events:none;padding:4px 8px;border:1px solid var(--pd-rule);background:var(--pd-card);color:var(--pd-ink);border-radius:6px;font:600 11px IBM Plex Mono,ui-monospace,monospace;display:none;";
        container.style.position = container.style.position || "relative";
        container.appendChild(chip);
      }
      let vline = container.querySelector(".pd-vline");
      if (!vline) {
        vline = document.createElement("div");
        vline.className = "pd-vline";
        vline.style.cssText = "position:absolute;z-index:9;top:0;bottom:0;width:1px;background:var(--pd-accent);display:none;pointer-events:none;";
        container.style.position = container.style.position || "relative";
        container.appendChild(vline);
      }

      function drawCrosshair(xPx, idx) {
        const label = labels[idx];
        const v = seriesData[idx];
        const p = p50[idx];
        const isFuture = idx >= nHist;
        const vLine = vline;
        vLine.style.left = xPx + "px";
        vLine.style.display = "block";
        let html = `<div>${monthLabel(label)}</div>`;
        if (v != null && !isNaN(v)) html += `<div>Último real <b>${sym}${Number(v).toFixed(2)}</b></div>`;
        if (isFuture && p != null && !isNaN(p)) {
          html += `<div>P50 <b>${sym}${Number(p).toFixed(2)}</b></div>`;
          if (p10[idx] != null && !isNaN(p10[idx])) html += `<div>P10 ${sym}${Number(p10[idx]).toFixed(2)}</div>`;
          if (p90[idx] != null && !isNaN(p90[idx])) html += `<div>P90 ${sym}${Number(p90[idx]).toFixed(2)}</div>`;
        }
        chip.innerHTML = html;
        chip.style.display = "block";
        chip.style.left = (xPx + 10) + "px";
        chip.style.top = "10px";
      }

      function removeCrosshair() {
        vline.style.display = "none";
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
