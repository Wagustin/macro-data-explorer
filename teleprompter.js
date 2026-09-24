/**
 * PerData - Responsive Financial Teleprompter / Ticker
 * Fixed at top-0 on mobile, bottom-0 on desktop.
 * Smooth infinite marquee with hover/touch pause.
 */

(function (window) {
  const FALLBACK_NEWS = [
    { id: "1", impact: "BCRP", color: "blue", title: "BCRP mantiene tasa de referencia en 5.00% ratificando anclaje de inflación en rango meta", source: "Reuters", time: "hace 8m", symbol: "PEN=X" },
    { id: "2", impact: "ALTO IMPACTO", color: "red", title: "Cobre COMEX repunta +2.4% superando los $4.48/lb por restricciones en fundiciones globales", source: "Bloomberg", time: "hace 15m", symbol: "HG=F" },
    { id: "3", impact: "MINERÍA", color: "amber", title: "Minas Buenaventura (BVN) eleva guía de producción de plata y oro tras optimización en Yumpag", source: "Gestión", time: "hace 24m", symbol: "BVN" },
    { id: "4", impact: "DIVISAS", color: "emerald", title: "Tipo de cambio USD/PEN consolida soporte en S/ 3.74 con flujo sostenido de ventas mineras", source: "SEMANAeconómica", time: "hace 35m", symbol: "PEN=X" },
    { id: "5", impact: "FED", color: "purple", title: "Rendimiento del bono del Tesoro EE.UU. a 10 años modera a 4.22% tras reporte de nóminas", source: "Financial Times", time: "hace 42m", symbol: "^TNX" },
    { id: "6", impact: "COBRE", color: "amber", title: "Southern Copper (SCCO) proyecta incremento del 8% en despacho de cátodos refinados", source: "Mining.com", time: "hace 55m", symbol: "SCCO" },
    { id: "7", impact: "MACRO", color: "blue", title: "Producción minera peruana aporta 1.8 puntos porcentuales al crecimiento desestacionalizado del PBI", source: "INEI / BCRP", time: "hace 1h", symbol: "PERU_GDP" }
  ];

  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]);
  }

  function escapeJSString(str) {
    // Escape characters that could break out of a single-quoted JS string
    return String(str === null || str === undefined ? "" : str).replace(/[\\'\n\r\u2028\u2029]/g, m => "\\" + m);
  }

  function getBadgeClasses(color) {
    switch (color) {
      case "red":
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      case "blue":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "amber":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "emerald":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "purple":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      default:
        return "bg-zinc-700/50 text-zinc-300 border-zinc-600/40";
    }
  }

  function renderNewsItems(items) {
    return items.map(item => {
      const badgeStyle = getBadgeClasses(item.impactColor || item.color || "blue");
      const sym = escapeJSString(item.symbol || "");
      const targetUrl = window.location.pathname.includes("explorer")
        ? `javascript:window.selectTickerAsset && window.selectTickerAsset('${sym}')`
        : `/explorer?symbol=${encodeURIComponent(item.symbol || 'BVN')}`;

      return `
        <div class="teleprompter-item inline-flex items-center gap-2 px-4 py-1 hover:text-white transition group shrink-0 text-xs">
          <a href="${escapeHTML(targetUrl)}" class="inline-flex items-center gap-2 hover:opacity-80 transition">
            <span class="px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded border font-mono ${badgeStyle}">
              ${escapeHTML(item.impact || "MACRO")}
            </span>
            <span class="text-[#D1D1D6] group-hover:text-white font-medium">
              ${escapeHTML(item.title)}
            </span>
          </a>
          <a href="${escapeHTML(item.url || 'https://www.bcrp.gob.pe')}" target="_blank" rel="noopener noreferrer" class="text-[10px] text-[#86868B] hover:text-white hover:underline font-mono inline-flex items-center gap-0.5" title="Ver fuente original">
            <span>${escapeHTML(item.source)}</span>
            <span class="text-[9px] text-[#636366]">· ${escapeHTML(item.time)} ↗</span>
          </a>
          <span class="text-zinc-700 mx-2">|</span>
        </div>
      `;
    }).join("");
  }

  async function initTeleprompter() {
    if (document.getElementById("mdeTeleprompter")) return;

    // Inject styles for infinite marquee
    if (!document.getElementById("teleprompterStyles")) {
      const style = document.createElement("style");
      style.id = "teleprompterStyles";
      style.textContent = `
        @keyframes mdeMarqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .teleprompter-track {
          display: inline-flex;
          white-space: nowrap;
          animation: mdeMarqueeScroll 75s linear infinite;
          will-change: transform;
        }
        .teleprompter-container:hover .teleprompter-track,
        .teleprompter-container:active .teleprompter-track {
          animation-play-state: paused !important;
        }
        @media (max-width: 639px) {
          body.has-teleprompter {
            padding-top: 2.5rem;
          }
        }
        @media (min-width: 640px) {
          body.has-teleprompter {
            padding-bottom: 2.5rem;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.classList.add("has-teleprompter");

    // Fetch news from /api/news with fallback
    let newsItems = FALLBACK_NEWS;
    try {
      const res = await fetch("/api/news");
      if (res.ok) {
        const data = await res.json();
        if (data.news && data.news.length > 0) {
          newsItems = data.news;
        }
      }
    } catch (e) {
      console.warn("Teleprompter using fallback news feed:", e);
    }

    const itemsHtml = renderNewsItems(newsItems);
    // Duplicate items to ensure smooth infinite loop
    const fullTrackHtml = itemsHtml + itemsHtml;

    const barHtml = `
      <aside id="mdeTeleprompter" class="fixed left-0 right-0 z-40 h-9 sm:h-10 top-0 sm:top-auto sm:bottom-0 bg-black/95 dark:bg-[#121214]/95 text-white backdrop-blur-md border-b sm:border-b-0 sm:border-t border-[#2C2C2E] flex items-center overflow-hidden select-none" aria-label="Titulares Macroeconómicos en Vivo">
        
        <!-- Live Indicator Badge -->
        <div class="h-full flex items-center gap-1.5 px-3 bg-black dark:bg-[#121214] z-10 border-r border-[#2C2C2E] shrink-0 text-[10px] font-bold tracking-wider font-mono">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span class="text-white hidden sm:inline">MACRO FEED</span>
          <span class="text-emerald-400 text-[9px] uppercase sm:hidden">VIVO</span>
        </div>

        <!-- Marquee Viewport -->
        <div class="teleprompter-container flex-1 overflow-hidden relative h-full flex items-center">
          <div class="teleprompter-track">
            ${fullTrackHtml}
          </div>
        </div>

        <!-- Right Quick Action / Audio/Pause helper -->
        <div class="h-full hidden md:flex items-center px-3 bg-black dark:bg-[#121214] z-10 border-l border-[#2C2C2E] shrink-0 text-[10px] text-[#86868B] font-mono">
          <span>Pausa: Hover</span>
        </div>
      </aside>
    `;

    document.body.insertAdjacentHTML("beforeend", barHtml);
  }

  // Support jumping to asset from teleprompter on explorer page
  window.selectTickerAsset = function(sym) {
    if (!sym) return;
    if (window.selectAssetBySymbol) {
      window.selectAssetBySymbol(sym);
    } else {
      window.location.href = `/explorer?symbol=${encodeURIComponent(sym)}`;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTeleprompter);
  } else {
    initTeleprompter();
  }
})(window);
