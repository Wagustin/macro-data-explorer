import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const data = JSON.parse(fs.readFileSync(path.join(projectRoot, "data", "empresas.json"), "utf8"));

function formatSector(sec) {
  if (!sec) return "Diversas";
  const s = sec.toUpperCase();
  if (s === "ADMINISTRADORAS DE FONDOS DE PENSIONES") return "AFP";
  if (s === "BANCOS Y FINANCIERAS") return "Bancos";
  if (s === "SERVICIOS PÚBLICOS") return "Servicios Públicos";
  if (s === "INDUSTRIALES") return "Industriales";
  if (s === "MINERAS") return "Mineras";
  if (s === "AGRARIO") return "Agrario";
  if (s === "SEGUROS") return "Seguros";
  if (s === "DIVERSAS") return "Diversas";
  return sec;
}

// «COMPAÑÍA MINERA PODEROSA S.A.A.» -> «Compañía Minera Poderosa S.A.A.»; siglas y formas societarias intactas
const KEEP = new Set(["S.A.", "S.A.A.", "S.A.C.", "S.R.L.", "BBVA", "AFP", "BVL", "FTE", "IDE", "SEAL", "RPP", "AIB", "XP", "OH!", "S.A", "PERÚ", "PERU"]);
const SMALL = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
function prettyName(raw) {
  return String(raw).trim().split(/\s+/).map((w, i) => {
    if (KEEP.has(w.toUpperCase()) && w.toUpperCase() !== "PERU" && w.toUpperCase() !== "PERÚ") return w.toUpperCase();
    if (/^\(?([A-Za-z]\.){2,}[-)]*$/.test(w)) return w.toUpperCase();
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.replace(/(^|[-(«"])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }).join(" ");
}

// Process emitters
const rows = data.emisores.map(e => {
  // Determine primary valor
  let primary = e.valores.find(v => v.yahoo && (v.yahoo === v.nemonico || v.nemonico === "BVN" || v.nemonico.endsWith("C1")));
  if (!primary) primary = e.valores.find(v => v.yahoo);
  if (!primary) primary = e.valores.find(v => v.fechaUltimaNegociacion);
  if (!primary) primary = e.valores[0] || { nemonico: "S/N", moneda: "S/", fechaUltimaNegociacion: null };

  const hasYahoo = Boolean(primary.yahoo);
  const isActiva = Boolean(e.negociadaUltimos12m);
  
  let tier = 3;
  let tierLabel = "sin";
  if (hasYahoo) {
    tier = 1;
    tierLabel = "yahoo";
  } else if (isActiva) {
    tier = 2;
    tierLabel = "activo";
  }

  let name = prettyName(e.razonSocial || "Emisor");
  
  return {
    codigoBVL: e.codigoBVL,
    razonSocial: name,
    sectorRaw: e.sector,
    sectorFormatted: formatSector(e.sector),
    nemonico: primary.nemonico,
    moneda: primary.moneda || "S/",
    fechaUltima: primary.fechaUltimaNegociacion || e.fechaUltimaNegociacion,
    yahoo: primary.yahoo,
    tier,
    tierLabel,
    hasYahoo,
    isActiva
  };
});

// Sort: Tier 1, then Tier 2, then Tier 3. Within tier, alphabetical by nemonico
rows.sort((a, b) => {
  if (a.tier !== b.tier) return a.tier - b.tier;
  return a.nemonico.localeCompare(b.nemonico);
});

// Generate HTML rows
const rowsHtml = rows.map(r => {
  const isMuted = r.tier === 3;
  // Precio solo de fuentes confirmadas (datos de mercado, cargados en vivo). Los precios de la BVL quedan
  // pendientes de revisar sus términos de uso: la ficha enlaza a la BVL.
  const priceDisplay = r.tier === 1
    ? '<span class="price-none">…</span>'
    : (r.tier === 3 ? '<span class="price-none">Sin negociación</span>' : '<span class="price-none">En la BVL</span>');
  
  let subHtml = "";
  if (r.tier === 1) {
    subHtml = `<div class="company-sub text-ink-soft"><span class="badge-dot"></span>Con proyección PerData Engine</div>`;
  } else if (r.tier === 2) {
    subHtml = `<div class="company-sub text-ink-soft">Cotiza poco · sin proyección</div>`;
  } else {
    subHtml = `<div class="company-sub text-ink-soft">Sin negociación reciente · solo ficha</div>`;
  }

  return `      <a href="/empresa/${encodeURIComponent(r.nemonico)}" class="row-link" data-nemo="${r.nemonico}" data-name="${r.razonSocial.toLowerCase()}" data-sector="${r.sectorRaw}" data-tier="${r.tierLabel}" ${r.yahoo ? `data-yahoo="${r.yahoo}"` : ""}>
        <div class="row-inner ${isMuted ? "muted" : ""}">
          <div class="mono nemo">${r.nemonico}</div>
          <div class="name-col">
            <div class="company-name font-medium">${r.razonSocial}</div>
            ${subHtml}
          </div>
          <div class="sector-col sector-label">${r.sectorFormatted}</div>
          <div class="mono price-cell text-right" data-cell="price">${priceDisplay}</div>
          <div class="mono var-cell text-right" data-cell="var">—</div>
        </div>
      </a>`;
}).join("\n");

const sectorCounts = {};
rows.forEach(r => { if (r.sectorRaw) sectorCounts[r.sectorRaw] = (sectorCounts[r.sectorRaw] || 0) + 1; });
const SECTOR_TABS = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])
  .map(([raw, n]) => `        <button type="button" role="tab" data-sec="${raw}" aria-selected="false">${formatSector(raw)} <span>${n}</span></button>`).join("\n");

const template = `<!DOCTYPE html>
<html lang="es-PE" class="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Empresas de la Bolsa de Valores de Lima · PerData</title>
  <meta name="description" content="Directorio de renta variable de la BVL con 182 emisores peruanos. Precio de cierre, historial y proyección de PerData Engine." />
  <link rel="canonical" href="https://perdata.site/empresas" />

  <!-- Favicon -->
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/svg+xml" href="/icon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Open Graph -->
  <meta property="og:locale" content="es_PE" />
  <meta property="og:site_name" content="PerData" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://perdata.site/empresas" />
  <meta property="og:title" content="Empresas de la Bolsa de Valores de Lima · PerData" />
  <meta property="og:description" content="Directorio de renta variable de la BVL con 182 emisores peruanos. Precios en tiempo real, historial y proyecciones cuantitativas." />
  <meta property="og:image" content="https://perdata.site/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Fonts & Styles -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Libre+Franklin:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400;1,8..60,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/tw.css">
  <link rel="stylesheet" href="/pd.css" />

  <style>
    /* Direct editorial table styles */
    .finder { margin-bottom: 8px; }
    .finder-search {
      display: flex; align-items: center; gap: 12px;
      border-bottom: 2px solid var(--pd-ink);
      padding: 6px 0 10px;
    }
    .finder-search svg { width: 22px; height: 22px; flex: none; fill: none; stroke: var(--pd-ink-soft); stroke-width: 2; }
    .finder-search input {
      flex: 1; min-width: 0; border: 0; background: transparent; outline: none;
      font-family: var(--pd-font-serif, "Source Serif 4", Georgia, serif);
      font-size: clamp(19px, 2.4vw, 26px); color: var(--pd-ink);
    }
    .finder-search input::placeholder { color: var(--pd-ink-soft); opacity: .8; }
    .finder-search:focus-within { border-bottom-color: var(--pd-ink); }
    .finder-search:focus-within svg { stroke: var(--pd-ink); }
    .finder-kbd {
      font-family: var(--pd-font-mono, monospace); font-size: 12px; color: var(--pd-ink-soft);
      border: 1px solid var(--pd-rule); padding: 1px 7px; border-radius: 3px;
    }
    @media (max-width: 640px) { .finder-kbd { display: none; } }
    .finder-hint { font-size: 13px; color: var(--pd-ink-soft); margin: 10px 0 18px; }
    .finder-hint button {
      color: var(--pd-ink); text-decoration: underline; text-underline-offset: 3px;
      text-decoration-color: var(--pd-rule); font: inherit; background: none; border: 0; padding: 0; cursor: pointer;
    }
    .finder-hint button:hover { text-decoration-color: var(--pd-ink); }
    .finder-tabs {
      display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none;
      border-bottom: 1px solid var(--pd-rule); margin-bottom: 4px;
    }
    .finder-tabs::-webkit-scrollbar { display: none; }
    .finder-tabs button {
      flex: none; background: none; border: 0; cursor: pointer;
      padding: 10px 0 9px; margin-bottom: -1px; border-bottom: 2px solid transparent;
      font-family: var(--pd-font-ui); font-size: 14px; color: var(--pd-ink-soft);
      transition: color .2s, border-color .25s cubic-bezier(.05,.7,.1,1);
    }
    .finder-tabs button span { font-family: var(--pd-font-mono, monospace); font-size: 12px; margin-left: 4px; font-variant-numeric: tabular-nums; }
    .finder-tabs button:hover { color: var(--pd-ink); }
    .finder-tabs button[aria-selected="true"] { color: var(--pd-ink); font-weight: 600; border-bottom-color: var(--pd-ink); }
    .finder-sectors button { font-size: 13px; }
    .finder-empty-actions button {
      margin-top: 12px; font: 600 14px var(--pd-font-ui); color: var(--pd-ink);
      background: none; border: 0; text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
    }
    .controls input::placeholder {
      color: var(--pd-ink-muted);
    }
    .stat-bar {
      font-size: 12px;
      color: var(--pd-ink-soft);
      margin-bottom: 8px;
      font-family: var(--pd-font-mono);
      letter-spacing: 0.01em;
    }
    .table-head {
      display: grid;
      grid-template-columns: 100px 1fr 160px 120px 84px;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--pd-ink);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--pd-ink-soft);
      font-family: var(--pd-font-ui);
    }
    .row-link {
      display: block;
      text-decoration: none;
      color: var(--pd-ink);
      transition: background-color 0.12s;
    }
    .row-link:hover {
      background: var(--pd-hover);
    }
    .row-inner {
      display: grid;
      grid-template-columns: 100px 1fr 160px 120px 84px;
      gap: 12px;
      padding: 12px 12px;
      border-bottom: 1px solid var(--pd-rule);
      align-items: center;
    }
    .row-link:last-child .row-inner {
      border-bottom: none;
    }
    .mono {
      font-family: var(--pd-font-mono);
      font-variant-numeric: tabular-nums;
    }
    .nemo {
      font-weight: 600;
      font-size: 13px;
    }
    .company-name {
      font-family: var(--pd-font-read);
      font-size: 15px;
      line-height: 1.3;
    }
    .company-sub {
      font-size: 11px;
      margin-top: 3px;
      display: flex;
      align-items: center;
    }
    .badge-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 6px;
      flex-shrink: 0;
    }
    .badge-dot { background: var(--pd-ink-soft); }
    .sector-label {
      font-size: 12px;
      color: var(--pd-ink-soft);
      font-family: var(--pd-font-ui);
    }
    .price-cell {
      font-size: 13px;
      font-weight: 500;
    }
    .price-none {
      color: var(--pd-ink-muted);
      font-size: 12px;
    }
    .var-cell {
      font-size: 12px;
    }
    .var-pos {
      color: var(--pd-pos);
    }
    .var-neg {
      color: var(--pd-neg);
    }
    .var-none {
      color: var(--pd-ink-soft);
    }
    .row-inner.muted .company-name,
    .row-inner.muted .nemo {
      color: var(--pd-ink-soft);
    }
    @media (max-width: 768px) {
      .table-head {
        display: none;
      }
      .row-inner {
        grid-template-columns: 1fr auto;
        gap: 6px 10px;
        padding: 12px 8px;
      }
      .row-inner > .nemo {
        grid-column: 1;
        font-size: 12px;
        color: var(--pd-ink-soft);
        margin-bottom: -2px;
      }
      .row-inner > .name-col {
        grid-column: 1;
      }
      .row-inner > .sector-col {
        display: none;
      }
      .row-inner > .price-cell {
        grid-column: 2;
        grid-row: 1 / span 2;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: center;
      }
      .row-inner > .var-cell {
        display: none;
      }
    }
  
    /* Interruptor de tema (igual que en el resto del sitio) */
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--switch-bg);
      -webkit-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 9999px;
    }
    .slider .circle {
      top: var(--circle-inset);
      left: var(--circle-inset);
      width: var(--circle-diameter);
      height: var(--circle-diameter);
      position: absolute;
      background: var(--circle-bg);
      border-radius: inherit;
      -webkit-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .ui-switch {
      --switch-bg: rgb(229, 229, 234);
      --switch-checked-bg: rgb(0, 0, 0);
      --circle-diameter: 18px;
      --circle-bg: #FFFFFF;
      --circle-inset: 2px;
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
    }
html.dark .ui-switch {
      --switch-bg: rgb(44, 44, 46);
      --switch-checked-bg: rgb(255, 255, 255);
      --circle-bg: #0D0D0E;
    }
.ui-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
.ui-switch input:checked + .slider {
      background-color: var(--switch-checked-bg);
    }
.ui-switch input:checked + .slider .circle {
      left: calc(100% - var(--circle-diameter) - var(--circle-inset));
    }</style>

  <!-- Early Theme Init -->
  <script>
    (function() {
      const savedTheme = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
    })();
  </script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3342536112010915"
     crossorigin="anonymous"></script>
</head>
<body class="bg-paper text-ink min-h-screen antialiased transition-colors duration-200 flex flex-col justify-between">

  <!-- Shared Institutional Header -->
  <header class="border-b border-rule bg-card sticky top-0 z-30 transition-colors">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between relative">
      <!-- Brand & Navigation -->
      <div class="flex items-center space-x-6">
        <a href="/" class="flex items-center space-x-2.5 text-inherit no-underline">
          <span class="pd-wordmark">PerData<span class="pd-flag" role="img" aria-label="Perú"><b></b><b></b><b></b></span></span>
        </a>

        <nav class="hidden md:flex items-center space-x-5 text-xs font-medium text-ink-soft">
          <a href="/explorer" class="hover:text-ink transition no-underline">Terminal</a>
          <a href="/empresas" class="text-ink font-semibold transition no-underline">Empresas</a>
          <a href="/noticias" class="hover:text-ink transition no-underline">Noticias</a>
          <a href="/metodologia" class="hover:text-ink transition no-underline">Metodología</a>
          <a href="/guia" class="hover:text-ink transition no-underline">Guía</a>
          <a href="/precios" class="hover:text-ink transition no-underline">Precios</a>
        </nav>
      </div>

      <!-- Right Actions -->
      <div class="flex items-center space-x-2 sm:space-x-3">
        <div id="navbarAuthContainer"></div>

        <label class="ui-switch" title="Alternar modo claro / oscuro">
          <input id="themeToggle" type="checkbox" aria-label="Modo oscuro" />
          <div class="slider">
            <div class="circle"></div>
          </div>
        </label>

        <button id="mobileMenuBtn" class="md:hidden inline-flex items-center justify-center w-8 h-8 rounded border border-rule text-ink-soft hover:text-ink transition" aria-label="Abrir menú" aria-expanded="false">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
    </div>

    <!-- Mobile Drawer -->
    <div id="mobileMenu" class="hidden md:hidden border-t border-rule bg-card px-4 py-3 transition-colors">
      <nav class="flex flex-col py-2 text-xs font-medium space-y-2 text-ink-soft">
        <a href="/explorer" class="hover:text-ink py-1 transition no-underline">Terminal</a>
        <a href="/empresas" class="text-ink font-semibold py-1 transition no-underline">Empresas</a>
        <a href="/noticias" class="hover:text-ink py-1 transition no-underline">Noticias</a>
        <a href="/metodologia" class="hover:text-ink py-1 transition no-underline">Metodología</a>
        <a href="/guia" class="hover:text-ink py-1 transition no-underline">Guía</a>
        <a href="/precios" class="hover:text-ink py-1 transition no-underline">Precios</a>
      </nav>
    </div>
  </header>

  <!-- Main Content -->
  <main class="pd-data-main flex-grow max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
    <div class="mb-8">
      <h1 class="pd-page-title mb-2">Directorio de Renta Variable <span class="italic text-ink-soft">BVL</span></h1>
      <p class="pd-lede max-w-2xl text-ink-soft">
        Las 182 empresas con acciones en la Bolsa de Valores de Lima. Listado de la BVL al 23 de octubre de 2026; precios de cierre de mercado; proyección de PerData Engine para las 36 que tienen historial suficiente.
      </p>
    </div>

    <div class="finder">
      <label class="finder-search" for="searchInput">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="searchInput" placeholder="Busca empresa, nemónico o sector" aria-label="Buscar empresa" autocomplete="off" spellcheck="false" />
        <kbd class="finder-kbd" aria-hidden="true">/</kbd>
      </label>
      <p class="finder-hint">Por ejemplo: <button type="button" data-try="alicorp">Alicorp</button>, <button type="button" data-try="BVN">BVN</button>, <button type="button" data-try="bancos">bancos</button>, <button type="button" data-try="mineras">mineras</button>.</p>
      <div class="finder-tabs" role="tablist" aria-label="Qué empresas mostrar" id="actTabs">
        <button type="button" role="tab" data-act="" aria-selected="true">Todas <span>${rows.length}</span></button>
        <button type="button" role="tab" data-act="yahoo" aria-selected="false">Con proyección <span>${rows.filter(r => r.tier === 1).length}</span></button>
        <button type="button" role="tab" data-act="activo" aria-selected="false" title="Con negociación en los últimos 12 meses">Activas <span>${rows.filter(r => r.tier !== 3).length}</span></button>
      </div>
      <div class="finder-tabs finder-sectors" role="tablist" aria-label="Sector" id="secTabs">
        <button type="button" role="tab" data-sec="" aria-selected="true">Todos los sectores</button>
${SECTOR_TABS}
      </div>
    </div>

    <p class="stat-bar" id="statBar" aria-live="polite">${rows.length} empresas</p>

    <div class="table-head">
      <div>Nemónico</div>
      <div>Razón Social</div>
      <div class="sector-col">Sector</div>
      <div class="text-right">Último Precio</div>
      <div class="text-right">Var. %</div>
    </div>

    <div id="listado">
${rowsHtml}
    </div>

    <div id="emptyMessage" class="hidden py-12 text-center text-ink-soft text-sm font-sans">
      <p id="emptyText">No encontramos esa empresa.</p>
      <p>Prueba con el nemónico (por ejemplo, ALICORC1) o con una parte del nombre.</p>
      <div class="finder-empty-actions"><button type="button" id="clearFilters">Ver todas las empresas</button></div>
    </div>

    <p class="text-xs text-ink-soft mt-8 text-center">
      Universo de 182 emisores de acciones de la BVL. Precios y variaciones actualizados en lote.<br>
      Para valores sin negociación reciente se muestra la última cotización oficial registrada.
    </p>
  </main>

  <!-- Mobile Bottom Bar (≤768px: Terminal, Empresas, Noticias, Mi cuenta) -->
  <nav class="mobile-nav" aria-label="Navegación móvil">
    <a href="/explorer" class="nav-item">
      <div class="nav-icon-wrap">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      </div>
      <span>Terminal</span>
    </a>
    <a href="/empresas" class="nav-item active">
      <div class="nav-icon-wrap">
        <svg viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h6M8 11h4"/></svg>
      </div>
      <span>Empresas</span>
    </a>
    <a href="/noticias" class="nav-item">
      <div class="nav-icon-wrap">
        <svg viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>
      </div>
      <span>Noticias</span>
    </a>
    <a href="/cuenta" class="nav-item">
      <div class="nav-icon-wrap">
        <svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <span>Mi cuenta</span>
    </a>
  </nav>

  <!-- Shared Institutional Footer -->
  <footer class="border-t border-rule bg-card py-10 px-4 sm:px-6 transition-colors">
    <div class="max-w-6xl mx-auto flex flex-col gap-6 text-left">
      <div class="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-rule">
        <a href="/" class="flex items-center space-x-2.5 text-inherit no-underline">
          <span class="pd-wordmark">PerData<span class="pd-flag" role="img" aria-label="Perú"><b></b><b></b><b></b></span></span>
        </a>
        <nav class="flex flex-wrap items-center gap-6 text-xs text-ink-soft" aria-label="Navegación secundaria">
          <a href="/terms" class="hover:text-ink transition no-underline">Términos</a>
          <a href="/privacidad" class="hover:text-ink transition no-underline">Privacidad</a>
          <a href="mailto:soporte@perdata.site" class="hover:text-ink transition no-underline">Contacto</a>
        </nav>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 text-[11px] text-ink-soft leading-relaxed">
        <span class="font-medium text-ink shrink-0">© 2026 PerData</span>
        <p class="max-w-2xl m-0 text-ink-soft">
          Información financiera y cuantitativa con fines estrictamente informativos y de investigación. No constituye asesoramiento de inversión ni oferta pública de valores.
        </p>
      </div>
    </div>
  </footer>

  <!-- Theme Toggle & Mobile Menu -->
  <script>
    const themeToggle = document.getElementById("themeToggle");
    const isDark = document.documentElement.classList.contains("dark");
    if (themeToggle) {
      themeToggle.checked = isDark;
      themeToggle.addEventListener("change", (e) => {
        if (e.target.checked) {
          document.documentElement.classList.add("dark");
          document.documentElement.classList.remove("light");
          localStorage.setItem("theme", "dark");
        } else {
          document.documentElement.classList.remove("dark");
          document.documentElement.classList.add("light");
          localStorage.setItem("theme", "light");
        }
      });
    }

    (function() {
      const btn = document.getElementById('mobileMenuBtn');
      const menu = document.getElementById('mobileMenu');
      if (btn && menu) {
        btn.addEventListener('click', function() {
          const open = menu.classList.toggle('hidden');
          btn.setAttribute('aria-expanded', String(!open));
        });
      }
    })();
  </script>

  <!-- Filter and Lazy Load Script -->
  <script>
    (function() {
      const searchInput = document.getElementById("searchInput");
      const statBar = document.getElementById("statBar");
      const emptyMessage = document.getElementById("emptyMessage");
      const rows = Array.from(document.querySelectorAll("#listado .row-link"));
      const TOTAL = rows.length;
      const fold = (t) => String(t || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
      // Sinónimos para que «bancos» o «minería» encuentren su sector
      const ALIAS = { banco: "bancos y financieras", bancos: "bancos y financieras", financiera: "bancos y financieras",
        mineria: "mineras", minera: "mineras", mina: "mineras", seguro: "seguros", electricas: "servicios publicos",
        energia: "servicios publicos", agro: "agrario", azucar: "agrario", afp: "administradoras de fondos de pensiones" };
      rows.forEach(r => { r._hay = fold(r.dataset.nemo + " " + r.dataset.name + " " + r.dataset.sector); });
      const state = { q: "", act: "", sec: "" };

      function setTab(group, attr, value) {
        group.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", String(b.dataset[attr] === value)));
      }
      function filterRows() {
        const words = fold(state.q).split(/\\s+/).filter(Boolean).map(w => ALIAS[w] || w);
        let shown = 0;
        rows.forEach(row => {
          const tier = row.dataset.tier || "";
          const ok = words.every(w => row._hay.includes(w))
            && (!state.sec || row.dataset.sector === state.sec)
            && (!state.act || (state.act === "yahoo" ? tier === "yahoo" : tier !== "sin"));
          row.style.display = ok ? "" : "none";
          if (ok) shown++;
        });
        emptyMessage.classList.toggle("hidden", shown > 0);
        if (!shown) document.getElementById("emptyText").textContent = state.q ? \`No encontramos «\${state.q}».\` : "Ninguna empresa con estos filtros.";
        statBar.textContent = shown === TOTAL ? \`\${TOTAL} empresas\` : \`\${shown} de \${TOTAL} empresas\`;
        const u = new URL(location.href);
        ["q", "act", "sec"].forEach(k => state[k] ? u.searchParams.set(k, state[k]) : u.searchParams.delete(k));
        history.replaceState(null, "", u);
        if (typeof processQueue === "function") setTimeout(processQueue, 0);
      }

      const actTabs = document.getElementById("actTabs");
      const secTabs = document.getElementById("secTabs");
      actTabs.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.act = b.dataset.act; setTab(actTabs, "act", state.act); filterRows(); });
      secTabs.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.sec = b.dataset.sec; setTab(secTabs, "sec", state.sec); b.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); filterRows(); });
      searchInput.addEventListener("input", () => { state.q = searchInput.value.trim(); filterRows(); });
      searchInput.addEventListener("keydown", e => {
        if (e.key === "Escape") { searchInput.value = ""; state.q = ""; filterRows(); }
        if (e.key === "Enter") { const first = rows.find(r => r.style.display !== "none"); if (first && rows.filter(r => r.style.display !== "none").length === 1) location.href = first.href; }
      });
      document.addEventListener("keydown", e => {
        if (e.key === "/" && document.activeElement !== searchInput && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); searchInput.focus(); }
      });
      document.querySelectorAll(".finder-hint [data-try]").forEach(b => b.addEventListener("click", () => { searchInput.value = b.dataset.try; state.q = b.dataset.try; filterRows(); searchInput.focus(); }));
      document.getElementById("clearFilters").addEventListener("click", () => {
        searchInput.value = ""; Object.assign(state, { q: "", act: "", sec: "" }); setTab(actTabs, "act", ""); setTab(secTabs, "sec", ""); filterRows();
      });
      // Estado inicial desde la URL (?q=&act=&sec=)
      const params = new URLSearchParams(location.search);
      state.q = params.get("q") || ""; state.act = params.get("act") || ""; state.sec = params.get("sec") || "";
      searchInput.value = state.q; setTab(actTabs, "act", state.act); setTab(secTabs, "sec", state.sec);
      if (state.q || state.act || state.sec) filterRows();

      // Lazy Loading Batch for market prices
      const priceCache = {};
      const pendingQueue = [];
      let activeRequests = 0;
      const MAX_CONCURRENT = 6;

      function processQueue() {
        while (activeRequests < MAX_CONCURRENT && pendingQueue.length > 0) {
          const item = pendingQueue.shift();
          const { symbol, row } = item;
          if (priceCache[symbol]) {
            applyPriceData(row, priceCache[symbol]);
            continue;
          }
          activeRequests++;
          fetch(\`/api/historical?symbol=\${encodeURIComponent(symbol)}\`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (!data) return;
              // Sin cotización en vivo (acciones de Lima sin dato diario): último cierre de la serie, sin variación
              let live = data.live && typeof data.live.price === "number" ? data.live : null;
              const ser = Array.isArray(data.series) ? data.series : [];
              if (!live && ser.length) live = { price: Number(ser[ser.length - 1].close) };
              if (live) {
                priceCache[symbol] = live;
                applyPriceData(row, live);
              } else {
                const pc = row.querySelector('[data-cell="price"]');
                if (pc) pc.textContent = "—";
              }
            })
            .catch(() => {})
            .finally(() => {
              activeRequests--;
              processQueue();
            });
        }
      }

      function applyPriceData(row, live) {
        if (!live || typeof live.price !== "number") return;
        const priceCell = row.querySelector('[data-cell="price"]');
        const varCell = row.querySelector('[data-cell="var"]');

        if (priceCell) {
          const isUsd = (row.dataset.yahoo === "BVN" || row.dataset.yahoo === "BAP" || row.dataset.yahoo === "SCCO" || row.dataset.yahoo === "IFS" || row.dataset.yahoo === "AUNA");
          const curr = isUsd ? "US$" : "S/";
          priceCell.textContent = \`\${curr} \${live.price.toFixed(live.price < 1 ? 3 : 2)}\`;
        }

        if (varCell && typeof live.changePct === "number") {
          const pct = live.changePct;
          varCell.classList.remove("var-pos", "var-neg", "var-none");
          if (pct > 0.001) {
            varCell.classList.add("var-pos");
            varCell.textContent = \`+\${pct.toFixed(2)}%\`;
          } else if (pct < -0.001) {
            varCell.classList.add("var-neg");
            varCell.textContent = \`\${pct.toFixed(2)}%\`;
          } else {
            varCell.classList.add("var-none");
            varCell.textContent = "0.00%";
          }
        }
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const row = entry.target;
            observer.unobserve(row);
            const symbol = row.getAttribute("data-yahoo");
            if (symbol) {
              pendingQueue.push({ symbol, row });
              processQueue();
            }
          }
        });
      }, { rootMargin: "150px" });

      rows.forEach(row => {
        if (row.hasAttribute("data-yahoo")) {
          observer.observe(row);
        }
      });
    })();
  </script>

  <!-- Auth -->
  <script src="/auth.js"></script>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "bc9abca1e97b4bcaa6261b23afc498e5"}'></script>
</body>
</html>
`;

fs.writeFileSync(path.join(projectRoot, "empresas.html"), template, "utf8");
console.log("Successfully generated empresas.html with", rows.length, "companies.");
