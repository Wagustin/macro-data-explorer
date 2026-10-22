/**
 * PerData - Responsive Financial Teleprompter / Ticker
 * Displayed in-flow on news.html above main content.
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
    return String(str === null || str === undefined ? "" : str).replace(/[\\'\n\r\u2028\u2029]/g, m => "\\" + m);
  }

  function renderNewsItems(items) {
    return items.map(item => {
      const sym = escapeJSString(item.symbol || "");
      const targetUrl = window.location.pathname.includes("explorer")
        ? `javascript:window.selectTickerAsset && window.selectTickerAsset('${sym}')`
        : `/explorer?symbol=${encodeURIComponent(item.symbol || 'BVN')}`;

      const cat = String(item.impact || item.category || "MACRO").toUpperCase();

      return `
        <div class="teleprompter-item" style="display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; flex-shrink: 0; font-size: 12px; color: var(--pd-ink);">
          <span style="font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--pd-ink-soft); text-transform: uppercase;">
            ${escapeHTML(cat)}
          </span>
          <a href="${escapeHTML(targetUrl)}" class="hover:underline" style="color: var(--pd-ink); text-decoration: none;">
            <span>${escapeHTML(item.title)}</span>
          </a>
          <a href="${escapeHTML(item.url || 'https://www.bcrp.gob.pe')}" target="_blank" rel="noopener noreferrer" class="hover:underline" style="font-size: 11px; color: var(--pd-ink-soft); font-family: var(--pd-font-mono); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Ver fuente original">
            <span>${escapeHTML(item.source)}</span>
            <span style="font-size: 10px; color: var(--pd-ink-soft);">· ${escapeHTML(item.time)} ↗</span>
          </a>
          <span style="color: var(--pd-rule); margin: 0 8px;">|</span>
        </div>
      `;
    }).join("");
  }

  async function initTeleprompter() {
    if (document.getElementById("mdeTeleprompter")) return;

    let newsItems = [];
    try {
      const res = await fetch("/api/news");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.news) && data.news.length > 0) {
          newsItems = data.news;
        }
      }
    } catch (e) {
      console.warn("Error fetching news for ticker:", e);
    }

    if (!newsItems || newsItems.length === 0) {
      return;
    }

    let mount = document.getElementById("pdNewsTicker");
    if (!mount) {
      const main = document.querySelector("main");
      if (main) {
        mount = document.createElement("div");
        mount.id = "pdNewsTicker";
        main.parentNode.insertBefore(mount, main);
      } else {
        return;
      }
    }

    if (!document.getElementById("teleprompterStyles")) {
      const style = document.createElement("style");
      style.id = "teleprompterStyles";
      style.textContent = `
        @keyframes pdTickerMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .teleprompter-bar {
          height: 36px;
          background: var(--pd-surface);
          color: var(--pd-ink);
          border-top: 1px solid var(--pd-rule);
          border-bottom: 1px solid var(--pd-rule);
          display: flex;
          align-items: center;
          overflow: hidden;
          user-select: none;
          font-family: var(--pd-font-ui);
        }
        .teleprompter-label {
          height: 100%;
          display: flex;
          align-items: center;
          padding: 0 14px;
          background: var(--pd-surface);
          color: var(--pd-ink);
          font-family: var(--pd-font-ui);
          font-weight: 600;
          font-size: 13px;
          border-right: 1px solid var(--pd-rule);
          flex-shrink: 0;
          z-index: 10;
        }
        .teleprompter-container {
          flex: 1;
          overflow: hidden;
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
        }
        .teleprompter-track {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          animation: pdTickerMarquee 140s linear infinite;
          will-change: transform;
        }
        .teleprompter-container:hover .teleprompter-track,
        .teleprompter-container:active .teleprompter-track {
          animation-play-state: paused !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .teleprompter-track {
            animation: none !important;
          }
          .teleprompter-container {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const itemsHtml = renderNewsItems(newsItems);
    const fullTrackHtml = itemsHtml + itemsHtml;

    const barHtml = `
      <aside id="mdeTeleprompter" class="teleprompter-bar" aria-label="Titulares Macroeconómicos">
        <div class="teleprompter-label">
          Titulares
        </div>
        <div class="teleprompter-container">
          <div class="teleprompter-track">
            ${fullTrackHtml}
          </div>
        </div>
      </aside>
    `;

    mount.innerHTML = barHtml;
  }

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
