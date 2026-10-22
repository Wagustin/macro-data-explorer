/**
 * PerData - Responsive Financial Teleprompter / Ticker
 * Fixed at top-0 on mobile, bottom-0 on desktop.
 * Smooth infinite marquee with hover/touch pause.
 */

(function (window) {

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

  function getBadgeClasses() {
    // Una sola etiqueta sobria para todas las categorías.
    return "text-[#6CACE4] border-[#6CACE4]/40";
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
            <span class="px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase border font-mono ${badgeStyle}">
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
          <span class="text-white/20 mx-2">/</span>
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
          animation: mdeMarqueeScroll 140s linear infinite;
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

    // Sin titulares reales no se muestra la barra: nunca se inventan noticias.
    let newsItems = [];
    try {
      const res = await fetch("/api/news");
      if (res.ok) {
        const data = await res.json();
        if (data.news && data.news.length > 0) {
          newsItems = data.news;
        }
      }
    } catch (e) {
      console.warn("Teleprompter: /api/news no disponible", e);
    }
    if (!newsItems.length) return;
    document.body.classList.add("has-teleprompter");

    const itemsHtml = renderNewsItems(newsItems);
    // Duplicate items to ensure smooth infinite loop
    const fullTrackHtml = itemsHtml + itemsHtml;

    const barHtml = `
      <aside id="mdeTeleprompter" class="fixed left-0 right-0 z-40 h-9 sm:h-10 top-0 sm:top-auto sm:bottom-0 bg-[#002244] text-white border-b sm:border-b-0 sm:border-t border-white/10 flex items-center overflow-hidden select-none" aria-label="Titulares Macroeconómicos en Vivo">
        
        <!-- Live Indicator Badge -->
        <div class="h-full flex items-center gap-1.5 px-3 bg-[#005DAA] z-10 shrink-0 text-[10px] font-medium tracking-wider font-mono">
          <span class="text-white">TITULARES</span>
        </div>

        <!-- Marquee Viewport -->
        <div class="teleprompter-container flex-1 overflow-hidden relative h-full flex items-center">
          <div class="teleprompter-track">
            ${fullTrackHtml}
          </div>
        </div>

        <!-- Right Quick Action / Audio/Pause helper -->
        <div class="h-full hidden md:flex items-center px-3 bg-[#002244] z-10 border-l border-white/10 shrink-0 text-[10px] text-slate-400 font-mono">
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
