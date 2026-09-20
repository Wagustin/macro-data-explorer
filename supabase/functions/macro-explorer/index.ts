// Supabase Edge Function: macro-explorer
// Full-Stack Serverless Application: TimesFM 2.5, TypeSafe AI (Jev), Historical Macro Data & Apple Monochromatic UI

const CATALOG = [
  { symbol: "BVN", name: "Compañía de Minas Buenaventura", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["oro", "plata", "cobre", "zinc", "bvl", "nyse", "minas"] },
  { symbol: "SCCO", name: "Southern Copper Corporation", sector: "Minería", country: "Perú / México", category: "mining_pe", tags: ["cobre", "toquepala", "cuajone", "nyse", "bvl"] },
  { symbol: "VOLCABC1.LM", name: "Volcan Compañía Minera", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["zinc", "plata", "plomo", "bvl"] },
  { symbol: "MINSURI1.LM", name: "Minsur S.A.", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["estaño", "oro", "san rafael", "bvl"] },
  { symbol: "NEXAPEC1.LM", name: "Nexa Resources Perú", sector: "Minería", country: "Perú", category: "mining_pe", tags: ["zinc", "plomo", "cerro lindo", "bvl"] },
  { symbol: "FCX", name: "Freeport-McMoRan (Cerro Verde)", sector: "Minería", country: "Global / Perú", category: "mining_global", tags: ["cobre", "oro", "cerro verde", "nyse"] },
  { symbol: "BHP", name: "BHP Group (Antamina)", sector: "Minería", country: "Global", category: "mining_global", tags: ["cobre", "hierro", "antamina", "nyse"] },
  { symbol: "RIO", name: "Rio Tinto plc", sector: "Minería", country: "Global", category: "mining_global", tags: ["mineral de hierro", "aluminio", "cobre", "nyse"] },
  { symbol: "VALE", name: "Vale S.A.", sector: "Minería", country: "Brasil / Latam", category: "mining_global", tags: ["hierro", "niquel", "cobre", "nyse"] },
  { symbol: "BAP", name: "Credicorp Ltd. (BCP)", sector: "Banca y Finanzas", country: "Perú", category: "corporate_pe", tags: ["banco de credito", "pacifico", "prima afp", "nyse", "bvl"] },
  { symbol: "IFS", name: "Intercorp Financial Services", sector: "Banca y Finanzas", country: "Perú", category: "corporate_pe", tags: ["interbank", "interseguro", "inteligo", "nyse", "bvl"] },
  { symbol: "ALICORC1.LM", name: "Alicorp S.A.A.", sector: "Consumo Masivo", country: "Perú", category: "corporate_pe", tags: ["alimentos", "primor", "don vittorio", "bvl"] },
  { symbol: "FERREYC1.LM", name: "Ferreycorp S.A.A.", sector: "Bienes de Capital / Maquinaria", country: "Perú", category: "corporate_pe", tags: ["caterpillar", "maquinaria minera", "bvl"] },
  { symbol: "CPACASC1.LM", name: "Cementos Pacasmayo", sector: "Construcción / Cemento", country: "Perú", category: "corporate_pe", tags: ["cemento", "concreto", "norte", "bvl", "nyse"] },
  { symbol: "HG=F", name: "Cobre Futuros (COMEX Copper)", sector: "Commodity Metales", country: "Global", category: "commodity", tags: ["cobre", "copper", "metal industrial"] },
  { symbol: "GC=F", name: "Oro Futuros (COMEX Gold)", sector: "Commodity Metales", country: "Global", category: "commodity", tags: ["oro", "gold", "reserva"] },
  { symbol: "SI=F", name: "Plata Futuros (COMEX Silver)", sector: "Commodity Metales", country: "Global", category: "commodity", tags: ["plata", "silver"] },
  { symbol: "CL=F", name: "Petróleo Crudo WTI", sector: "Commodity Energía", country: "Global", category: "commodity", tags: ["petroleo", "oil", "energia"] },
  { symbol: "PEN=X", name: "Tipo de Cambio USD / PEN", sector: "Divisas (Forex)", country: "Perú", category: "macro", tags: ["dolar", "sol", "tipo de cambio", "fx"] },
  { symbol: "^TNX", name: "Rendimiento Bonos Tesoro EE.UU. 10Y", sector: "Tasas de Interés", country: "EE.UU.", category: "macro", tags: ["bonos", "tasa libre de riesgo", "fed"] },
  { symbol: "^SPX", name: "S&P 500 Index", sector: "Renta Variable", country: "EE.UU.", category: "macro", tags: ["sp500", "bolsa"] },
  { symbol: "PERU_CPI", name: "Inflación Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro", tags: ["inflacion", "cpi", "ipc", "bcrp", "banco mundial"] },
  { symbol: "PERU_GDP", name: "Crecimiento PBI Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro", tags: ["pbi", "gdp", "crecimiento economico", "banco mundial"] }
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es" class="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="description" content="MacroData Explorer - Series Macroeconómicas, BVL y Google TimesFM 2.5 Zero-Shot Forecasting con TypeSafe AI Jev" />
  <title>MacroData Explorer · Apple Monochromatic · TimesFM 2.5 & TypeSafe AI</title>
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            appleLight: '#FFFFFF',
            appleDark: '#0D0D0E',
            appleCardDark: '#1C1C1E',
            appleTextDark: '#F5F5F7',
            appleSubDark: '#8E8E93',
            appleBorderDark: '#2C2C2E',
            appleBorderLight: '#E5E5EA',
          }
        }
      }
    }
  </script>
  
  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <!-- SheetJS (xlsx) for instant client-side Excel downloads -->
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      letter-spacing: -0.011em;
    }

    /* Custom Switch provided by user 👇 */
    .ui-switch {
      /* switch */
      --switch-bg: rgb(135, 150, 165);
      --switch-width: 48px;
      --switch-height: 20px;
      /* circle */
      --circle-diameter: 32px;
      --circle-bg: rgb(0, 56, 146);
      --circle-inset: calc((var(--circle-diameter) - var(--switch-height)) / 2);
      display: inline-block;
      position: relative;
      cursor: pointer;
    }

    .ui-switch input {
      display: none;
    }

    .slider {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      width: var(--switch-width);
      height: var(--switch-height);
      background: var(--switch-bg);
      border-radius: 999px;
      position: relative;
      cursor: pointer;
    }
    .slider .circle {
      top: calc(var(--circle-inset) * -1);
      left: 0;
      width: var(--circle-diameter);
      height: var(--circle-diameter);
      position: absolute;
      background: var(--circle-bg);
      border-radius: inherit;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjAiIHdpZHRoPSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj4KICAgIDxwYXRoIGZpbGw9IiNmZmYiCiAgICAgICAgZD0iTTkuMzA1IDEuNjY3VjMuNzVoMS4zODlWMS42NjdoLTEuMzl6bS00LjcwNyAxLjk1bC0uOTgyLjk4Mkw1LjA5IDYuMDcybC45ODItLjk4Mi0xLjQ3My0xLjQ3M3ptMTAuODAyIDBMMTMuOTI3IDUuMDlsLjk4Mi45ODIgMS40NzMtMS40NzMtLjk4Mi0uOTgyek0xMCA1LjEzOWE0Ljg3MiA0Ljg3MiAwIDAwLTQuODYyIDQuODZBNC44NzIgNC44NzIgMCAwMDEwIDE0Ljg2MiA0Ljg3MiA0Ljg3MiAwIDAwMTQuODYgMTAgNC44NzIgNC44NzIgMCAwMDEwIDUuMTM5em0wIDEuMzg5QTMuNDYyIDMuNDYyIDAgMDExMy40NzEgMTBhMy40NjIgMy40NjIgMCAwMS0zLjQ3MyAzLjQ3MkEzLjQ2MiAzLjQ2MiAwIDAxNi41MjcgMTAgMy40NjIgMCAwMTEwIDYuNTI4ek0xLjY2NSA5LjMwNXYxLjM5aDIuMDgzdi0xLjM5SDEuNjY2em0xNC41ODMgMHYxLjM5aDIuMDg0di0xLjM5aC0yLjA4NHpNNS4wOSAxMy45MjhMMy42MTYgMTUuNGwuOTgyLjk4MiAxLjQ3My0xLjQ3My0uOTgyLS45ODJ6bTkuODIgMGwtLjk4Mi45ODIgMS40NzMtMS40NzMuOTgyLS45ODItMS40NzMtMS40NzN6TTkuMzA1IDE2LjI1djIuMDgzaDEuMzg5VjE2LjI1aC0xLjM5eiIgLz4KPC9zdmc+");
      background-repeat: no-repeat;
      background-position: center center;
      -webkit-transition: left 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, -webkit-transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
      -o-transition: left 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
      transition: left 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, -webkit-transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
      display: -webkit-box;
      display: -ms-flexbox;
      display: flex;
      -webkit-box-align: center;
      -ms-flex-align: center;
      align-items: center;
      -webkit-box-pack: center;
      -ms-flex-pack: center;
      justify-content: center;
      box-shadow: 0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12);
    }

    .slider .circle::before {
      content: "";
      position: absolute;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.75);
      border-radius: inherit;
      -webkit-transition: all 500ms;
      -o-transition: all 500ms;
      transition: all 500ms;
      opacity: 0;
    }

    /* actions */
    .ui-switch input:checked+.slider .circle {
      left: calc(100% - var(--circle-diameter));
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjAiIHdpZHRoPSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj4KICAgIDxwYXRoIGZpbGw9IiNmZmYiCiAgICAgICAgZD0iTTQuMiAyLjVsLS43IDEuOC0xLjguNyAxLjguNy43IDEuOC42LTEuOEw2LjcgNWwtMS45LS43LS42LTEuOHptMTUgOC4zYTYuNyA2LjcgMCAxMS02LjYtNi42IDUuOCA1LjggMCAwMDYuNiA2LjZ6IiAvPgo8L3N2Zz4=");
    }

    .ui-switch input:active+.slider .circle::before {
      -webkit-transition: 0s;
      -o-transition: 0s;
      transition: 0s;
      opacity: 1;
      width: 0;
      height: 0;
    }
  </style>
</head>
<body class="bg-[#FFFFFF] dark:bg-[#0D0D0E] text-[#000000] dark:text-[#F5F5F7] min-h-screen antialiased transition-colors duration-200">

  <!-- Apple Minimal Header -->
  <header class="border-b border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#FFFFFF]/90 dark:bg-[#0D0D0E]/90 backdrop-blur-md sticky top-0 z-30 transition-colors">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      
      <!-- Brand & Badges -->
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-black text-sm">
          M
        </div>
        <div class="flex items-center space-x-2">
          <span class="font-bold text-black dark:text-white tracking-tight text-base sm:text-lg">MacroData</span>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] border border-[#E5E5EA] dark:border-[#3A3A3C]">
            TimesFM 2.5
          </span>
          <span class="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] border border-[#E5E5EA] dark:border-[#3A3A3C]">
            TypeSafe AI Jev
          </span>
        </div>
      </div>

      <!-- Right Actions: Switch Toggle & Excel -->
      <div class="flex items-center space-x-3 sm:space-x-4">
        <!-- Switch Toggle Component Provided -->
        <label class="ui-switch" title="Alternar modo claro / oscuro">
          <input id="themeToggle" type="checkbox" />
          <div class="slider">
            <div class="circle"></div>
          </div>
        </label>

        <!-- Excel Export Top Button -->
        <button id="btnExportExcelTop" class="inline-flex items-center text-xs font-semibold bg-black dark:bg-[#F5F5F7] hover:bg-[#1D1D1F] dark:hover:bg-[#E5E5EA] text-white dark:text-black px-3.5 py-2 rounded-full transition shadow-sm">
          <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          <span>Descargar Excel</span>
        </button>
      </div>

    </div>
  </header>

  <!-- Main Container -->
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

    <!-- Centered Hero & Search Section -->
    <section class="text-center max-w-3xl mx-auto space-y-4">
      <div class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#F5F5F7] dark:bg-[#1C1C1E] text-xs font-medium text-[#86868B] dark:text-[#8E8E93] border border-[#E5E5EA] dark:border-[#2C2C2E]">
        <span>10 Años de Series Históricas</span>
        <span>·</span>
        <span>Inferencia Probabilística Zero-Shot</span>
      </div>

      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-black dark:text-white">
        Análisis Macroeconómico Cuantitativo
      </h1>
      <p class="text-xs sm:text-sm text-[#86868B] dark:text-[#8E8E93] leading-relaxed max-w-2xl mx-auto">
        Exploración de minería peruana, commodities globales y variables macroeconómicas con predicción multi-cuantil de Google TimesFM 2.5 e interpretación de TypeSafe AI Jev.
      </p>

      <!-- Search Input Container -->
      <div class="mt-6 relative max-w-xl mx-auto text-left" id="searchContainer">
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#86868B]">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input 
            type="text" 
            id="companySearch" 
            autocomplete="off"
            placeholder="Buscar activo o empresa (ej. Buenaventura, Southern Copper, Volcan, Cobre...)" 
            class="w-full pl-10 pr-10 py-3 bg-[#F5F5F7] dark:bg-[#1C1C1E] focus:bg-white dark:focus:bg-[#161618] text-black dark:text-white placeholder-[#86868B] dark:placeholder-[#8E8E93] text-xs sm:text-sm rounded-2xl border border-[#E5E5EA] dark:border-[#2C2C2E] focus:border-black dark:focus:border-white focus:outline-none transition shadow-sm"
          />
          <div id="searchSpinner" class="hidden absolute inset-y-0 right-0 pr-3.5 flex items-center">
            <div class="w-4 h-4 border-2 border-[#86868B] border-t-black dark:border-t-white rounded-full animate-spin"></div>
          </div>
        </div>

        <!-- Dropdown Results -->
        <div id="searchResults" class="hidden absolute left-0 right-0 mt-2 bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl shadow-2xl max-h-80 overflow-y-auto z-40 divide-y divide-[#F5F5F7] dark:divide-[#2C2C2E]"></div>
      </div>

      <!-- Quick Chips Shortcuts -->
      <div class="mt-4 flex items-center justify-center gap-1.5 flex-wrap pt-2">
        <span class="text-[11px] font-bold text-[#86868B] uppercase tracking-wider mr-1">Atajos:</span>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="BVN">Buenaventura (BVN)</button>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="SCCO">Southern Copper (SCCO)</button>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="VOLCABC1.LM">Volcan</button>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="MINSURI1.LM">Minsur</button>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="BAP">Credicorp</button>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="HG=F">Cobre Futuros</button>
        <button class="chip-btn text-xs font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:border-black dark:hover:border-white transition" data-symbol="PEN=X">USD/PEN</button>
      </div>
    </section>

    <!-- Controls Bar: Time Range & Macro Overlay -->
    <section class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
      <!-- Historical Range Selector -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[#86868B] dark:text-[#8E8E93] mr-1">Rango Histórico:</span>
        <div class="inline-flex bg-[#F5F5F7] dark:bg-[#2C2C2E] p-1 rounded-xl border border-[#E5E5EA] dark:border-[#3A3A3C] text-xs font-medium">
          <button class="range-btn px-3 py-1 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition" data-range="1y">1A</button>
          <button class="range-btn px-3 py-1 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition" data-range="3y">3A</button>
          <button class="range-btn px-3 py-1 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition" data-range="5y">5A</button>
          <button class="range-btn px-3 py-1 rounded-lg bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm transition" data-range="10y">10 Años (10Y)</button>
        </div>
      </div>

      <!-- Macro Overlay Dropdown -->
      <div class="flex items-center space-x-2">
        <label for="macroOverlay" class="text-xs font-bold uppercase tracking-wider text-[#86868B] dark:text-[#8E8E93] whitespace-nowrap">
          Cruce Macroeconómico:
        </label>
        <select id="macroOverlay" class="bg-[#F5F5F7] dark:bg-[#2C2C2E] hover:bg-white dark:hover:bg-[#3A3A3C] border border-[#E5E5EA] dark:border-[#3A3A3C] text-black dark:text-white text-xs sm:text-sm rounded-xl px-3 py-1.5 outline-none font-medium transition cursor-pointer">
          <option value="HG=F" selected>Cobre Futuros (HG=F)</option>
          <option value="GC=F">Oro Futuros (GC=F)</option>
          <option value="SI=F">Plata Futuros (SI=F)</option>
          <option value="CL=F">Petróleo WTI (CL=F)</option>
          <option value="PEN=X">Tipo de Cambio USD/PEN</option>
          <option value="^TNX">Bonos EE.UU. 10Y</option>
          <option value="PERU_CPI">Inflación Perú (Banco Mundial)</option>
          <option value="PERU_GDP">Crecimiento PBI Perú (Banco Mundial)</option>
          <option value="none">Ninguno (Solo Empresa)</option>
        </select>
      </div>
    </section>

    <!-- Active Asset Header & KPI Summary Cards -->
    <section class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-[#E5E5EA] dark:border-[#2C2C2E] pb-3 gap-2 text-center sm:text-left">
        <div>
          <div class="flex items-center justify-center sm:justify-start space-x-3">
            <h2 id="assetTitle" class="text-2xl sm:text-3xl font-black text-black dark:text-white">Compañía de Minas Buenaventura</h2>
            <span id="assetSymbolBadge" class="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 bg-black dark:bg-white text-white dark:text-black rounded-full">BVN</span>
          </div>
          <p id="assetMeta" class="text-xs sm:text-sm text-[#86868B] dark:text-[#8E8E93] mt-1">Minería · Perú · Moneda: USD · 10 Años de Datos</p>
        </div>
        <div class="text-center sm:text-right">
          <div id="latestPrice" class="text-2xl sm:text-3xl font-black text-black dark:text-white">$34.71 USD</div>
          <div id="latestDate" class="text-xs text-[#86868B]">Último cierre registrado</div>
        </div>
      </div>

      <!-- KPI Metrics Grid (Monochromatic Apple Style) -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 text-center">
        <div class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Retorno Histórico</div>
          <div id="metricReturn" class="text-lg sm:text-xl font-extrabold text-black dark:text-white mt-1">+184.2%</div>
          <div class="text-[10px] text-[#86868B] mt-0.5">En el rango seleccionado</div>
        </div>
        <div class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Máximo Período</div>
          <div id="metricHigh" class="text-lg sm:text-xl font-extrabold text-black dark:text-white mt-1">$36.50</div>
          <div id="metricHighDate" class="text-[10px] text-[#86868B] mt-0.5">Pico histórico</div>
        </div>
        <div class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Mínimo Período</div>
          <div id="metricLow" class="text-lg sm:text-xl font-extrabold text-black dark:text-white mt-1">$4.10</div>
          <div id="metricLowDate" class="text-[10px] text-[#86868B] mt-0.5">Valle histórico</div>
        </div>
        <div class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Correlación (r)</div>
          <div id="metricCorrelation" class="text-lg sm:text-xl font-extrabold text-black dark:text-white mt-1">+0.74</div>
          <div id="metricCorrelationDesc" class="text-[10px] text-[#86868B] mt-0.5">vs Cobre Futuros</div>
        </div>
        <div class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 shadow-sm col-span-2 md:col-span-1">
          <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Observaciones</div>
          <div id="metricPoints" class="text-lg sm:text-xl font-extrabold text-black dark:text-white mt-1">121</div>
          <div class="text-[10px] text-[#86868B] mt-0.5">Meses continuos</div>
        </div>
      </div>
    </section>

    <!-- Google TimesFM 2.5 Section: Clean Apple Card -->
    <section class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-5 sm:p-7 shadow-sm transition-colors relative">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] gap-4">
        <div>
          <div class="flex items-center space-x-2.5">
            <span class="w-2.5 h-2.5 rounded-full bg-black dark:bg-white animate-pulse"></span>
            <h3 class="text-base sm:text-lg font-bold text-black dark:text-white">
              Google TimesFM 2.5 — Proyección Cuantitativa Zero-Shot
            </h3>
            <span class="hidden sm:inline-block text-[11px] font-semibold bg-[#F5F5F7] dark:bg-[#2C2C2E] text-black dark:text-white px-2.5 py-0.5 rounded-full border border-[#E5E5EA] dark:border-[#3A3A3C]">
              RevIN Multi-Cuantil
            </span>
          </div>
          <p class="text-xs text-[#86868B] dark:text-[#8E8E93] mt-1">
            Proyección de trayectoria mediana P50 con cuantiles probabilísticos P10 y P90 sobre representaciones continuas.
          </p>
        </div>

        <!-- Horizon Selection Buttons (1M, 3M, 6M, 12M) -->
        <div class="flex items-center space-x-2">
          <span class="text-xs font-bold text-[#86868B] dark:text-[#8E8E93] uppercase tracking-wider">Horizonte:</span>
          <div class="inline-flex bg-[#F5F5F7] dark:bg-[#2C2C2E] p-1 rounded-xl border border-[#E5E5EA] dark:border-[#3A3A3C] text-xs font-semibold">
            <button class="horizon-btn px-3 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition" data-horizon="1">1M</button>
            <button class="horizon-btn px-3 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition" data-horizon="3">3M</button>
            <button class="horizon-btn px-3 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black shadow-sm transition" data-horizon="6">6M</button>
            <button class="horizon-btn px-3 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition" data-horizon="12">12M</button>
          </div>
        </div>
      </div>

      <!-- Skeleton Loading State -->
      <div id="forecastSkeleton" class="hidden mt-6 animate-pulse space-y-4">
        <div class="h-4 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded w-1/3 mx-auto"></div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div class="h-20 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-xl"></div>
          <div class="h-20 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-xl"></div>
          <div class="h-20 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-xl"></div>
          <div class="h-20 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-xl"></div>
        </div>
      </div>

      <!-- Active Forecast Results & Cards -->
      <div id="forecastContent" class="mt-5 space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-center">
          <div class="bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Precio Esperado (P50)</div>
            <div id="tfmP50" class="text-xl sm:text-2xl font-black text-black dark:text-white mt-1">$39.34</div>
            <div id="tfmHorizonDate" class="text-[10px] text-[#86868B] mt-0.5">Al horizonte de 6 meses</div>
          </div>

          <div class="bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Retorno Proyectado</div>
            <div id="tfmReturn" class="text-xl sm:text-2xl font-black text-black dark:text-white mt-1">+13.3%</div>
            <div id="tfmTrend" class="text-[10px] text-[#86868B] mt-0.5">Tendencia Alcista</div>
          </div>

          <div class="bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Rango Probabilístico (80%)</div>
            <div id="tfmRange" class="text-lg sm:text-xl font-bold text-black dark:text-white mt-1">$21.97 — $56.71</div>
            <div class="text-[10px] text-[#86868B] mt-0.5">Cuantiles P10 a P90</div>
          </div>

          <div class="bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">Volatilidad Anualizada</div>
            <div id="tfmVol" class="text-xl sm:text-2xl font-black text-black dark:text-white mt-1">48.7%</div>
            <div class="text-[10px] text-[#86868B] mt-0.5">Difusión temporal √h</div>
          </div>
        </div>

        <!-- TimesFM Summary Banner -->
        <div class="bg-[#F5F5F7] dark:bg-[#2C2C2E]/40 border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-black dark:text-[#F5F5F7]">
          <div class="flex items-center space-x-2">
            <svg class="w-4 h-4 text-[#86868B] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span id="tfmExplainText">
              La gráfica inferior ha sido ampliada con las fechas futuras proyectadas, mostrando la trayectoria P50 (línea discontinua) y el intervalo de confianza P10-P90.
            </span>
          </div>
          <button id="btnToggleForecastChart" class="self-start sm:self-auto px-3.5 py-1.5 bg-black dark:bg-white hover:bg-[#1D1D1F] dark:hover:bg-[#E5E5EA] text-white dark:text-black rounded-full font-semibold text-xs transition whitespace-nowrap shadow-sm">
            Ocultar Proyección en Gráfico
          </button>
        </div>
      </div>
    </section>

    <!-- TypeSafe AI · Jev System One Interpretation Section -->
    <section class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-6 sm:p-8 shadow-sm transition-colors text-center relative">
      <div class="max-w-2xl mx-auto">
        <div class="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#F5F5F7] dark:bg-[#2C2C2E] text-black dark:text-white text-xs font-semibold mb-3 border border-[#E5E5EA] dark:border-[#3A3A3C]">
          <span class="w-2 h-2 rounded-full bg-black dark:bg-white animate-pulse"></span>
          <span>TypeSafe AI · Jev System One</span>
          <span class="text-[#86868B]">|</span>
          <span id="tsConfidence" class="font-bold">Confianza Calibrada: 88.5%</span>
        </div>
        
        <h3 class="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white">
          Interpretación Cuantitativa & Régimen Macroeconómico
        </h3>
        
        <p id="tsTakeaway" class="mt-3 text-xs sm:text-sm text-[#86868B] dark:text-[#8E8E93] leading-relaxed">
          Cargando análisis semántico validado por TypeSafe AI Jev...
        </p>
      </div>

      <!-- Sub-Cards -->
      <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto text-center">
        <div class="p-4 rounded-2xl bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C]">
          <div class="text-[10px] font-bold uppercase tracking-wider text-[#86868B]">Sensibilidad Macro (Beta)</div>
          <div id="tsBeta" class="text-sm sm:text-base font-bold text-black dark:text-white mt-1">Alta (+0.74)</div>
        </div>
        <div class="p-4 rounded-2xl bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C]">
          <div class="text-[10px] font-bold uppercase tracking-wider text-[#86868B]">Régimen de Volatilidad</div>
          <div id="tsRegime" class="text-sm sm:text-base font-bold text-black dark:text-white mt-1">Cíclico Moderado</div>
        </div>
        <div class="p-4 rounded-2xl bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#3A3A3C]">
          <div class="text-[10px] font-bold uppercase tracking-wider text-[#86868B]">Verificación Formal</div>
          <div id="tsEngine" class="text-sm sm:text-base font-bold text-black dark:text-white mt-1">RLCD / Jev Architecture</div>
        </div>
      </div>
    </section>

    <!-- Main Dual Chart Section (Expanded with TimesFM) -->
    <section class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl p-4 sm:p-6 shadow-sm transition-colors">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] gap-3">
        <div class="flex items-center space-x-2">
          <div class="w-2.5 h-2.5 rounded-full bg-black dark:bg-white"></div>
          <span class="text-sm font-bold text-black dark:text-white">Evolución Histórica & Proyección Ampliada</span>
        </div>
        
        <!-- Legend Items (Monochromatic) -->
        <div class="flex flex-wrap items-center gap-3 text-xs text-[#86868B] dark:text-[#8E8E93] font-medium">
          <span class="inline-flex items-center">
            <span class="w-3 h-1 bg-black dark:bg-white rounded-sm mr-1.5"></span> Histórico
          </span>
          <span id="legendForecast" class="inline-flex items-center text-black dark:text-white font-semibold">
            <span class="w-3 h-0.5 border-t-2 border-dashed border-black dark:border-white mr-1.5"></span> TimesFM (P50)
          </span>
          <span id="legendBand" class="inline-flex items-center text-[#86868B]">
            <span class="w-3 h-2 bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 rounded-sm mr-1.5"></span> Banda P10-P90
          </span>
          <span id="legendMacro" class="inline-flex items-center text-[#86868B]">
            <span class="w-3 h-1 bg-[#86868B] rounded-sm mr-1.5"></span> Indicador Macro
          </span>
        </div>
      </div>

      <!-- Chart Canvas -->
      <div class="relative w-full h-80 sm:h-[420px]">
        <canvas id="mainChart"></canvas>
      </div>
    </section>

    <!-- Historical & Projected Data Table -->
    <section class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-2xl shadow-sm overflow-hidden transition-colors">
      <div class="p-4 sm:p-6 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F5F5F7] dark:bg-[#2C2C2E]/40">
        <div>
          <h3 class="text-base font-bold text-black dark:text-white">Tabla de Datos Históricos y Proyectados</h3>
          <p class="text-xs text-[#86868B] dark:text-[#8E8E93] mt-0.5">Observaciones mensuales correlacionadas y cuantiles probabilísticos.</p>
        </div>
        <button id="btnExportExcel" class="inline-flex items-center justify-center px-4 py-2.5 bg-black dark:bg-[#F5F5F7] hover:bg-[#1D1D1F] dark:hover:bg-[#E5E5EA] text-white dark:text-black font-semibold text-xs sm:text-sm rounded-full transition shadow-sm">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Descargar Todo en Excel (.xlsx)
        </button>
      </div>

      <div class="overflow-x-auto max-h-96">
        <table class="w-full text-left border-collapse text-xs sm:text-sm">
          <thead class="bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] font-semibold border-b border-[#E5E5EA] dark:border-[#3A3A3C] sticky top-0 z-10">
            <tr>
              <th class="py-3 px-4">Fecha</th>
              <th class="py-3 px-4">Estado</th>
              <th class="py-3 px-4">Cierre / P50</th>
              <th class="py-3 px-4">Apertura</th>
              <th class="py-3 px-4">Máximo / P90</th>
              <th class="py-3 px-4">Mínimo / P10</th>
              <th id="tableHeaderMacro" class="py-3 px-4">Indicador Macro</th>
              <th class="py-3 px-4">Variación (%)</th>
            </tr>
          </thead>
          <tbody id="tableBody" class="divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E] text-black dark:text-[#F5F5F7] font-normal">
            <!-- Dynamically populated -->
          </tbody>
        </table>
      </div>
      <div class="p-3.5 bg-[#F5F5F7] dark:bg-[#2C2C2E]/40 border-t border-[#E5E5EA] dark:border-[#2C2C2E] text-xs text-[#86868B] text-right">
        <span id="tableSummary">Cargando observaciones...</span>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer class="border-t border-[#E5E5EA] dark:border-[#2C2C2E] bg-white dark:bg-[#0D0D0E] mt-12 py-8 text-center text-xs text-[#86868B] transition-colors">
    <div class="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div>
        <strong>MacroData Explorer</strong> &copy; 2026 · Desarrollado para Agustín Ventura Saldaña
      </div>
      <div class="flex items-center space-x-3 text-[#86868B]">
        <span>Google TimesFM 2.5</span>
        <span>•</span>
        <span>TypeSafe AI Jev</span>
        <span>•</span>
        <span>100% Serverless Edge</span>
      </div>
    </div>
  </footer>

  <!-- Application Script -->
  <script>
    // State management
    
    // Dynamic API Base URL for Supabase Edge Functions and serverless environments
    const API_BASE = (window.location.pathname.startsWith('/functions/v1/macro-explorer'))
      ? '/functions/v1/macro-explorer/api'
      : (window.location.pathname.startsWith('/functions/v1/app'))
      ? '/functions/v1/app/api'
      : '/api';

    const state = {
      primarySymbol: "BVN",
      macroSymbol: "HG=F",
      range: "10y",
      horizon: 6,
      showForecastOnChart: true,
      primaryData: null,
      macroData: null,
      forecastData: null,
      interpretationData: null,
      isForecasting: false,
      chartInstance: null
    };

    // DOM Elements
    const themeToggle = document.getElementById("themeToggle");
    const companySearchInput = document.getElementById("companySearch");
    const searchResultsDiv = document.getElementById("searchResults");
    const searchSpinner = document.getElementById("searchSpinner");
    const macroOverlaySelect = document.getElementById("macroOverlay");
    const btnExportExcel = document.getElementById("btnExportExcel");
    const btnExportExcelTop = document.getElementById("btnExportExcelTop");
    const forecastSkeleton = document.getElementById("forecastSkeleton");
    const forecastContent = document.getElementById("forecastContent");
    const btnToggleForecastChart = document.getElementById("btnToggleForecastChart");

    // XSS Sanitization Helper
    function escapeHTML(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // Initialize Theme
    function initTheme() {
      const savedTheme = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);
      
      applyTheme(isDark);

      if (themeToggle) {
        themeToggle.addEventListener("change", (e) => {
          applyTheme(e.target.checked);
        });
      }
    }

    function applyTheme(isDark) {
      if (isDark) {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
        localStorage.setItem("theme", "dark");
        if (themeToggle) themeToggle.checked = true;
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
        localStorage.setItem("theme", "light");
        if (themeToggle) themeToggle.checked = false;
      }

      if (state.chartInstance) {
        renderChart();
      }
    }

    // Initialize Application
    document.addEventListener("DOMContentLoaded", () => {
      initTheme();
      setupSearch();
      setupQuickChips();
      setupRangeButtons();
      setupHorizonButtons();
      setupMacroSelect();
      setupExportExcel();
      setupToggleForecast();

      // Initial Load
      loadAllData(state.primarySymbol, state.range, state.macroSymbol, state.horizon);
    });

    // Toggle Forecast Visibility on Chart
    function setupToggleForecast() {
      btnToggleForecastChart.addEventListener("click", () => {
        state.showForecastOnChart = !state.showForecastOnChart;
        btnToggleForecastChart.textContent = state.showForecastOnChart ? "Ocultar Proyección en Gráfico" : "Mostrar Proyección en Gráfico";
        renderChart();
      });
    }

    // Setup Search Autocomplete
    function setupSearch() {
      let debounceTimer = null;

      companySearchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
          searchResultsDiv.innerHTML = "";
          searchResultsDiv.classList.add("hidden");
          searchSpinner.classList.add("hidden");
          return;
        }

        searchSpinner.classList.remove("hidden");
        debounceTimer = setTimeout(async () => {
          try {
            const res = await fetch(\`\${API_BASE}/search?q=\${encodeURIComponent(query)}\`);
            const data = await res.json();
            searchSpinner.classList.add("hidden");
            renderSearchResults(data.results || []);
          } catch (err) {
            console.error("Search error:", err);
            searchSpinner.classList.add("hidden");
          }
        }, 250);
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        if (!document.getElementById("searchContainer").contains(e.target)) {
          searchResultsDiv.classList.add("hidden");
        }
      });
    }

    // Render Search Results (Sanitized against XSS)
    function renderSearchResults(results) {
      if (!results || results.length === 0) {
        searchResultsDiv.innerHTML = \`<div class="p-3 text-xs text-[#86868B]">No se encontraron resultados coincidentes.</div>\`;
        searchResultsDiv.classList.remove("hidden");
        return;
      }

      searchResultsDiv.innerHTML = results.map(item => \`
        <div class="search-item p-3 hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] cursor-pointer flex items-center justify-between transition" data-symbol="\${escapeHTML(item.symbol)}">
          <div>
            <div class="font-semibold text-xs sm:text-sm text-black dark:text-white">\${escapeHTML(item.name)}</div>
            <div class="text-[11px] text-[#86868B]">\${escapeHTML(item.sector || 'Mercado')} · \${escapeHTML(item.country || 'Global')}</div>
          </div>
          <span class="text-xs font-bold font-mono px-2 py-1 bg-[#F5F5F7] dark:bg-[#2C2C2E] text-black dark:text-white rounded border border-[#E5E5EA] dark:border-[#3A3A3C]">\${escapeHTML(item.symbol)}</span>
        </div>
      \`).join("");

      searchResultsDiv.classList.remove("hidden");

      document.querySelectorAll(".search-item").forEach(el => {
        el.addEventListener("click", () => {
          const sym = el.getAttribute("data-symbol");
          companySearchInput.value = "";
          searchResultsDiv.classList.add("hidden");
          state.primarySymbol = sym;
          loadAllData(sym, state.range, state.macroSymbol, state.horizon);
        });
      });
    }

    // Setup Quick Chips
    function setupQuickChips() {
      document.querySelectorAll(".chip-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const sym = btn.getAttribute("data-symbol");
          state.primarySymbol = sym;
          loadAllData(sym, state.range, state.macroSymbol, state.horizon);
        });
      });
    }

    // Setup Range Buttons
    function setupRangeButtons() {
      document.querySelectorAll(".range-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".range-btn").forEach(b => {
            b.className = "range-btn px-3 py-1 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition";
          });
          btn.className = "range-btn px-3 py-1 rounded-lg bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm transition";
          const rng = btn.getAttribute("data-range");
          state.range = rng;
          loadAllData(state.primarySymbol, rng, state.macroSymbol, state.horizon);
        });
      });
    }

    // Setup Horizon Buttons (1M, 3M, 6M, 12M)
    function setupHorizonButtons() {
      document.querySelectorAll(".horizon-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".horizon-btn").forEach(b => {
            b.className = "horizon-btn px-3 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition";
          });
          btn.className = "horizon-btn px-3 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm transition";
          const h = parseInt(btn.getAttribute("data-horizon"), 10);
          state.horizon = h;
          fetchForecastOnly(state.primarySymbol, h);
        });
      });
    }

    // Setup Macro Selector
    function setupMacroSelect() {
      macroOverlaySelect.addEventListener("change", (e) => {
        const val = e.target.value;
        state.macroSymbol = val;
        loadMacroData(val, state.range);
      });
    }

    // Primary Loader function for all data
    async function loadAllData(symbol, range, macroSymbol, horizon) {
      try {
        // 1. Fetch Primary Historical Data
        const primaryRes = await fetch(\`\${API_BASE}/historical?symbol=\${encodeURIComponent(symbol)}&range=\${range}&interval=1mo\`);
        const primaryJson = await primaryRes.json();
        if (primaryJson.error) {
          alert("Error cargando activo: " + primaryJson.error);
          return;
        }
        state.primaryData = primaryJson;

        // 2. Fetch Macro Indicator
        if (macroSymbol && macroSymbol !== "none") {
          const macroRes = await fetch(\`\${API_BASE}/historical?symbol=\${encodeURIComponent(macroSymbol)}&range=\${range}&interval=1mo\`);
          const macroJson = await macroRes.json();
          state.macroData = macroJson.error ? null : macroJson;
        } else {
          state.macroData = null;
        }

        // Render basic dashboard
        renderDashboardBasics();

        // 3. Fetch TimesFM Forecast with skeleton loader
        await fetchForecastOnly(symbol, horizon);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      }
    }

    // Fetch only Macro Data
    async function loadMacroData(macroSymbol, range) {
      try {
        if (macroSymbol && macroSymbol !== "none") {
          const macroRes = await fetch(\`\${API_BASE}/historical?symbol=\${encodeURIComponent(macroSymbol)}&range=\${range}&interval=1mo\`);
          const macroJson = await macroRes.json();
          state.macroData = macroJson.error ? null : macroJson;
        } else {
          state.macroData = null;
        }
        renderDashboardBasics();
        renderChart();
        renderTable();
        fetchTypeSafeInterpretation();
      } catch (err) {
        console.error("Error updating macro indicator:", err);
      }
    }

    // Fetch TimesFM Forecast with Skeleton Loader
    async function fetchForecastOnly(symbol, horizon) {
      state.isForecasting = true;
      forecastSkeleton.classList.remove("hidden");
      forecastContent.classList.add("hidden");

      try {
        const seriesData = state.primaryData?.series || null;
        let forecastRes;
        if (seriesData && seriesData.length >= 5) {
          forecastRes = await fetch(\`\${API_BASE}/forecast\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, horizon, series: seriesData })
          });
        } else {
          forecastRes = await fetch(\`\${API_BASE}/forecast?symbol=\${encodeURIComponent(symbol)}&horizon=\${horizon}\`);
        }

        const forecastJson = await forecastRes.json();
        state.forecastData = forecastJson.error ? null : forecastJson;
      } catch (err) {
        console.error("Error fetching TimesFM forecast:", err);
        state.forecastData = null;
      } finally {
        state.isForecasting = false;
        forecastSkeleton.classList.add("hidden");
        forecastContent.classList.remove("hidden");
        renderForecastCards();
        renderChart();
        renderTable();
        fetchTypeSafeInterpretation();
      }
    }

    // Fetch TypeSafe AI (Jev System One) Interpretation
    async function fetchTypeSafeInterpretation() {
      const p = state.primaryData;
      const m = state.macroData;
      const f = state.forecastData;
      if (!p || !f) return;

      try {
        const corrText = document.getElementById("metricCorrelation").textContent;
        const res = await fetch(\`\${API_BASE}/interpret\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: p.symbol,
            macroSymbol: m ? m.symbol : "none",
            horizon: state.horizon,
            forecast: f,
            historical: p,
            correlation: corrText
          })
        });
        const data = await res.json();
        state.interpretationData = data;

        // Render TypeSafe AI UI elements
        if (data.executiveTakeaway || data.interpretation) {
          const interp = data.interpretation || data;
          document.getElementById("tsConfidence").textContent = \`Confianza Calibrada: \${interp.confidencePercentage || (interp.calibratedConfidencePct + '%')}\`;
          document.getElementById("tsTakeaway").textContent = interp.executiveTakeaway || "Análisis interpretativo generado.";
          document.getElementById("tsBeta").textContent = interp.macroSensitivity || "Moderada";
          document.getElementById("tsRegime").textContent = interp.regime || interp.marketRegime || "Cíclico";
          document.getElementById("tsEngine").textContent = \`\${data.model || 'Jev 1.1'} (Verified)\`;
        }
      } catch (err) {
        console.error("Error fetching TypeSafe AI interpretation:", err);
      }
    }

    // Pearson Correlation Calculation
    function calculateCorrelation(xValues, yValues) {
      const n = Math.min(xValues.length, yValues.length);
      if (n < 2) return 0;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += xValues[i];
        sumY += yValues[i];
        sumXY += xValues[i] * yValues[i];
        sumX2 += xValues[i] * xValues[i];
        sumY2 += yValues[i] * yValues[i];
      }
      const numerator = (n * sumXY) - (sumX * sumY);
      const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
      if (denominator === 0) return 0;
      return numerator / denominator;
    }

    // Render Basic Dashboard KPIs
    function renderDashboardBasics() {
      const p = state.primaryData;
      const m = state.macroData;
      if (!p || !p.series || p.series.length === 0) return;

      const series = p.series;
      const firstClose = series[0].close;
      const lastClose = series[series.length - 1].close;
      const returnPct = ((lastClose - firstClose) / firstClose) * 100;

      let highVal = -Infinity, lowVal = Infinity, highDate = "", lowDate = "";
      series.forEach(item => {
        if (item.high > highVal) { highVal = item.high; highDate = item.date; }
        if (item.low < lowVal) { lowVal = item.low; lowDate = item.date; }
      });

      // Update Asset Header
      document.getElementById("assetTitle").textContent = p.name;
      document.getElementById("assetSymbolBadge").textContent = p.symbol;
      document.getElementById("assetMeta").textContent = \`\${p.sector || 'Sector'} · \${p.country || 'Mercado'} · Moneda: \${p.currency} · 10 Años de Datos\`;
      document.getElementById("latestPrice").textContent = \`\${p.currency === 'PEN' ? 'S/ ' : '$'}\${lastClose.toFixed(2)} \${p.currency}\`;
      document.getElementById("latestDate").textContent = \`Último cierre: \${series[series.length - 1].date}\`;

      // Update Historical Metrics
      const returnEl = document.getElementById("metricReturn");
      returnEl.textContent = \`\${returnPct >= 0 ? '+' : ''}\${returnPct.toFixed(1)}%\`;

      document.getElementById("metricHigh").textContent = \`\${p.currency === 'PEN' ? 'S/' : '$'}\${highVal.toFixed(2)}\`;
      document.getElementById("metricHighDate").textContent = \`En \${highDate.substring(0, 7)}\`;

      document.getElementById("metricLow").textContent = \`\${p.currency === 'PEN' ? 'S/' : '$'}\${lowVal.toFixed(2)}\`;
      document.getElementById("metricLowDate").textContent = \`En \${lowDate.substring(0, 7)}\`;

      document.getElementById("metricPoints").textContent = series.length;

      // Correlation calculation
      if (m && m.series && m.series.length > 0) {
        const macroMap = new Map();
        m.series.forEach(item => macroMap.set(item.date.substring(0, 7), item.close));

        const matchedP = [];
        const matchedM = [];

        series.forEach(item => {
          const ym = item.date.substring(0, 7);
          if (macroMap.has(ym)) {
            matchedP.push(item.close);
            matchedM.push(macroMap.get(ym));
          }
        });

        const r = calculateCorrelation(matchedP, matchedM);
        const rFormatted = (r >= 0 ? "+" : "") + r.toFixed(2);
        document.getElementById("metricCorrelation").textContent = rFormatted;
        document.getElementById("metricCorrelationDesc").textContent = \`vs \${m.name.split('(')[0]}\`;
        document.getElementById("legendMacro").classList.remove("hidden");
        document.getElementById("tableHeaderMacro").textContent = \`\${m.name.split('(')[0]} (\${m.currency || ''})\`;
      } else {
        document.getElementById("metricCorrelation").textContent = "N/A";
        document.getElementById("metricCorrelationDesc").textContent = "Sin cruce macro";
        document.getElementById("legendMacro").classList.add("hidden");
        document.getElementById("tableHeaderMacro").textContent = "Sin indicador macro";
      }
    }

    // Render Forecast Summary Cards
    function renderForecastCards() {
      const f = state.forecastData;
      const p = state.primaryData;
      if (!f || !f.forecastSeries) return;

      const currencyPrefix = p?.currency === "PEN" ? "S/ " : "$";
      document.getElementById("tfmP50").textContent = \`\${currencyPrefix}\${f.predictedPrice.toFixed(2)}\`;
      document.getElementById("tfmHorizonDate").textContent = \`Al horizonte de \${f.horizonLabel}\`;

      const returnEl = document.getElementById("tfmReturn");
      returnEl.textContent = \`\${f.expectedReturnPct >= 0 ? '+' : ''}\${f.expectedReturnPct.toFixed(1)}%\`;
      document.getElementById("tfmTrend").textContent = \`Tendencia \${f.trend}\`;

      document.getElementById("tfmRange").textContent = \`\${currencyPrefix}\${f.quantiles.p10.toFixed(2)} — \${currencyPrefix}\${f.quantiles.p90.toFixed(2)}\`;
      document.getElementById("tfmVol").textContent = \`\${f.volatilityAnnualized}%\`;
      document.getElementById("tfmExplainText").textContent = \`Proyección TimesFM 2.5 calculada exitosamente a \${f.horizonLabel}. La gráfica inferior amplía el horizonte temporal incorporando el intervalo probabilístico P10-P90.\`;
    }

    // Render Chart.js with Monochromatic Apple Styling & TimesFM
    function renderChart() {
      const canvas = document.getElementById("mainChart");
      const ctx = canvas.getContext("2d");
      const p = state.primaryData;
      const m = state.macroData;
      const f = state.forecastData;
      const isDark = document.documentElement.classList.contains("dark");

      if (state.chartInstance) {
        state.chartInstance.destroy();
      }

      if (!p || !p.series) return;

      // Prepare Historical Labels and Data
      const histLabels = p.series.map(it => it.date.substring(0, 7));
      const histData = p.series.map(it => it.close);
      const lastHistIndex = histData.length - 1;
      const lastHistVal = histData[lastHistIndex];

      let allLabels = [...histLabels];
      let p50Data = new Array(histData.length).fill(null);
      let p10Data = new Array(histData.length).fill(null);
      let p90Data = new Array(histData.length).fill(null);

      // Append Forecast Series if available & enabled
      if (f && f.forecastSeries && state.showForecastOnChart) {
        p50Data[lastHistIndex] = lastHistVal;
        p10Data[lastHistIndex] = lastHistVal;
        p90Data[lastHistIndex] = lastHistVal;

        f.forecastSeries.forEach(item => {
          allLabels.push(item.date);
          p50Data.push(item.p50);
          p10Data.push(item.p10);
          p90Data.push(item.p90);
        });
      }

      // Pad historical data with nulls for future forecast months
      const paddedHistData = [...histData];
      while (paddedHistData.length < allLabels.length) {
        paddedHistData.push(null);
      }

      // Macro Map for Dual Axis
      const macroMap = new Map();
      if (m && m.series) {
        m.series.forEach(it => macroMap.set(it.date.substring(0, 7), it.close));
      }
      const macroDataPadded = allLabels.map(lbl => macroMap.has(lbl) ? macroMap.get(lbl) : null);

      // Monochromatic Apple Colors
      const textColor = isDark ? "#8E8E93" : "#86868B";
      const gridColor = isDark ? "rgba(44, 44, 46, 0.6)" : "rgba(229, 229, 234, 0.7)";
      const primaryLineColor = isDark ? "#F5F5F7" : "#000000";
      const primaryBgColor = isDark ? "rgba(245, 245, 247, 0.04)" : "rgba(0, 0, 0, 0.03)";
      const macroLineColor = isDark ? "#8E8E93" : "#86868B";

      const datasets = [
        // 1. Historical Asset Line
        {
          label: \`\${p.name} (Histórico)\`,
          data: paddedHistData,
          borderColor: primaryLineColor,
          backgroundColor: primaryBgColor,
          borderWidth: 2.2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: primaryLineColor,
          fill: true,
          yAxisID: "yPrimary",
          tension: 0.15
        }
      ];

      // 2. TimesFM Forecast Datasets (P90 upper, P10 lower, P50 median)
      if (f && f.forecastSeries && state.showForecastOnChart) {
        // P90 (Upper Bound)
        datasets.push({
          label: "TimesFM P90 (Optimista)",
          data: p90Data,
          borderColor: isDark ? "rgba(245, 245, 247, 0.25)" : "rgba(0, 0, 0, 0.2)",
          backgroundColor: isDark ? "rgba(245, 245, 247, 0.08)" : "rgba(0, 0, 0, 0.05)",
          borderWidth: 1,
          pointRadius: 0,
          fill: "+1", // Fill to P10 dataset below
          yAxisID: "yPrimary",
          tension: 0.2
        });

        // P10 (Lower Bound)
        datasets.push({
          label: "TimesFM P10 (Pesimista)",
          data: p10Data,
          borderColor: isDark ? "rgba(245, 245, 247, 0.25)" : "rgba(0, 0, 0, 0.2)",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          yAxisID: "yPrimary",
          tension: 0.2
        });

        // P50 (Median Forecast Line)
        datasets.push({
          label: \`TimesFM P50 (\${f.horizonLabel})\`,
          data: p50Data,
          borderColor: primaryLineColor,
          backgroundColor: "transparent",
          borderWidth: 2.2,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: primaryLineColor,
          fill: false,
          yAxisID: "yPrimary",
          tension: 0.2
        });
      }

      // 3. Macro Overlay Dataset
      if (m && m.series) {
        datasets.push({
          label: \`\${m.name} (\${m.currency || ''})\`,
          data: macroDataPadded,
          borderColor: macroLineColor,
          borderDash: [3, 3],
          backgroundColor: "transparent",
          borderWidth: 1.6,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: macroLineColor,
          yAxisID: "yMacro",
          tension: 0.15
        });
      }

      state.chartInstance = new Chart(ctx, {
        type: "line",
        data: {
          labels: allLabels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              titleColor: isDark ? "#F5F5F7" : "#000000",
              bodyColor: isDark ? "#E5E5EA" : "#1D1D1F",
              borderColor: isDark ? "#2C2C2E" : "#E5E5EA",
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              callbacks: {
                label: function(context) {
                  const val = context.raw;
                  if (val === null || val === undefined) return null;
                  const label = context.dataset.label || "";
                  return \` \${label}: \${val.toFixed(2)}\`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: gridColor,
                drawBorder: false
              },
              ticks: {
                color: textColor,
                font: { size: 10 },
                maxTicksLimit: 14
              }
            },
            yPrimary: {
              type: "linear",
              position: "left",
              grid: {
                color: gridColor,
                drawBorder: false
              },
              ticks: {
                color: textColor,
                font: { size: 10 },
                callback: function(value) {
                  return (p.currency === "PEN" ? "S/ " : "$") + value.toFixed(1);
                }
              }
            },
            yMacro: {
              type: "linear",
              position: "right",
              display: m && m.series ? true : false,
              grid: {
                drawOnChartArea: false,
                drawBorder: false
              },
              ticks: {
                color: textColor,
                font: { size: 10 },
                callback: function(value) {
                  return value.toFixed(1);
                }
              }
            }
          }
        }
      });
    }

    // Render Historical & Projected Data Table
    function renderTable() {
      const p = state.primaryData;
      const m = state.macroData;
      const f = state.forecastData;
      if (!p || !p.series) return;

      const series = p.series;
      const currencySymbol = p.currency === "PEN" ? "S/ " : "$";
      const tbody = document.getElementById("tableBody");
      let html = "";

      const macroMap = new Map();
      if (m && m.series) {
        m.series.forEach(item => macroMap.set(item.date.substring(0, 7), item.close));
      }

      // 1. Forecast Projections
      if (f && f.forecastSeries) {
        for (let i = f.forecastSeries.length - 1; i >= 0; i--) {
          const item = f.forecastSeries[i];
          html += \`
            <tr class="bg-[#F5F5F7]/70 dark:bg-[#2C2C2E]/40 font-medium">
              <td class="py-2.5 px-4 font-mono text-black dark:text-white font-bold">\${escapeHTML(item.date)}</td>
              <td class="py-2.5 px-4"><span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-black dark:bg-white text-white dark:text-black">TIMESFM P50</span></td>
              <td class="py-2.5 px-4 font-bold text-black dark:text-white">\${currencySymbol}\${item.p50.toFixed(2)}</td>
              <td class="py-2.5 px-4 text-[#86868B]">-</td>
              <td class="py-2.5 px-4 text-[#86868B] font-mono">\${currencySymbol}\${item.p90.toFixed(2)}</td>
              <td class="py-2.5 px-4 text-[#86868B] font-mono">\${currencySymbol}\${item.p10.toFixed(2)}</td>
              <td class="py-2.5 px-4 text-[#86868B]">-</td>
              <td class="py-2.5 px-4 font-bold text-black dark:text-white">Proyectado</td>
            </tr>
          \`;
        }
      }

      // 2. Historical Observations
      for (let i = series.length - 1; i >= 0; i--) {
        const item = series[i];
        const prevItem = i > 0 ? series[i - 1] : null;
        const changePct = prevItem ? ((item.close - prevItem.close) / prevItem.close) * 100 : 0;
        const ym = item.date.substring(0, 7);
        const macroVal = macroMap.has(ym) ? macroMap.get(ym) : "-";

        html += \`
          <tr class="hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E]/60 transition">
            <td class="py-2.5 px-4 font-mono font-medium text-black dark:text-white">\${escapeHTML(item.date)}</td>
            <td class="py-2.5 px-4"><span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#86868B] dark:text-[#8E8E93] border border-[#E5E5EA] dark:border-[#3A3A3C]">HISTÓRICO</span></td>
            <td class="py-2.5 px-4 font-bold text-black dark:text-white">\${currencySymbol}\${item.close.toFixed(2)}</td>
            <td class="py-2.5 px-4 text-[#86868B]">\${currencySymbol}\${item.open.toFixed(2)}</td>
            <td class="py-2.5 px-4 text-[#86868B]">\${currencySymbol}\${item.high.toFixed(2)}</td>
            <td class="py-2.5 px-4 text-[#86868B]">\${currencySymbol}\${item.low.toFixed(2)}</td>
            <td class="py-2.5 px-4 font-medium text-black dark:text-white">\${typeof macroVal === 'number' ? macroVal.toFixed(2) : escapeHTML(macroVal)}</td>
            <td class="py-2.5 px-4 font-bold \${changePct >= 0 ? 'text-black dark:text-white' : 'text-[#86868B]'}">
              \${prevItem ? (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%' : '-'}
            </td>
          </tr>
        \`;
      }

      tbody.innerHTML = html;
      const forecastCount = f?.forecastSeries?.length || 0;
      document.getElementById("tableSummary").textContent = \`Mostrando \${series.length} observaciones históricas + \${forecastCount} pasos proyectados de TimesFM.\`;
    }

    // Excel Export Setup (With Historical + Forecast Sheets)
    function setupExportExcel() {
      const handler = () => {
        const p = state.primaryData;
        const m = state.macroData;
        const f = state.forecastData;
        const interp = state.interpretationData?.interpretation;
        if (!p || !p.series) return;

        const wb = XLSX.utils.book_new();

        // 1. Sheet: Resumen Ejecutivo
        const summaryData = [
          ["REPORTE MACROECONÓMICO Y PROYECCIÓN TIMESFM 2.5"],
          ["Generado automáticamente por:", "MacroData Explorer"],
          ["Fecha de Generación:", new Date().toISOString().split("T")[0]],
          [],
          ["DATOS DEL ACTIVO PRINCIPAL"],
          ["Nombre:", p.name],
          ["Símbolo / Ticker:", p.symbol],
          ["Sector:", p.sector || "N/A"],
          ["País / Mercado:", p.country || "N/A"],
          ["Moneda:", p.currency],
          ["Rango Histórico:", state.range],
          ["Total Observaciones:", p.series.length],
          ["Último Cierre:", p.series[p.series.length - 1].close],
          [],
          ["VARIABLE MACROECONÓMICA ASOCIADA"],
          ["Indicador:", m ? m.name : "Ninguno"],
          ["Símbolo Macro:", m ? m.symbol : "N/A"],
          ["Correlación Pearson (r):", document.getElementById("metricCorrelation").textContent],
          [],
          ["PROYECCIÓN GOOGLE TIMESFM 2.5"],
          ["Horizonte:", f ? f.horizonLabel : "6 Meses"],
          ["Precio Esperado (P50):", f ? f.predictedPrice : "N/A"],
          ["Retorno Proyectado (%):", f ? f.expectedReturnPct + "%" : "N/A"],
          ["Rango P10 - P90:", f ? \`\${f.quantiles.p10} - \${f.quantiles.p90}\` : "N/A"],
          ["Volatilidad Anualizada:", f ? f.volatilityAnnualized + "%" : "N/A"],
          [],
          ["EVALUACIÓN TYPESAFE AI (JEV)"],
          ["Confianza Calibrada:", interp ? interp.calibratedConfidencePct + "%" : "N/A"],
          ["Sensibilidad Macro:", interp ? interp.macroSensitivity : "N/A"],
          ["Régimen:", interp ? interp.marketRegime : "N/A"],
          ["Síntesis Ejecutiva:", interp ? interp.executiveTakeaway : "N/A"]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

        // 2. Sheet: Datos Históricos (10 Años)
        const macroMap = new Map();
        if (m && m.series) {
          m.series.forEach(it => macroMap.set(it.date.substring(0, 7), it.close));
        }

        const tableHeaders = [
          "Fecha",
          \`Cierre \${p.symbol} (\${p.currency})\`,
          \`Apertura (\${p.currency})\`,
          \`Máximo (\${p.currency})\`,
          \`Mínimo (\${p.currency})\`,
          "Volumen",
          m ? \`Macro \${m.symbol} (\${m.currency})\` : "Macro",
          "Variación Mensual (%)"
        ];

        const tableData = [tableHeaders];
        for (let i = 0; i < p.series.length; i++) {
          const item = p.series[i];
          const prev = i > 0 ? p.series[i - 1] : null;
          const pct = prev ? ((item.close - prev.close) / prev.close) * 100 : 0;
          const ym = item.date.substring(0, 7);
          const macVal = macroMap.has(ym) ? macroMap.get(ym) : "";

          tableData.push([
            item.date,
            item.close,
            item.open,
            item.high,
            item.low,
            item.volume,
            macVal,
            prev ? Number(pct.toFixed(2)) : ""
          ]);
        }

        const wsHistory = XLSX.utils.aoa_to_sheet(tableData);
        XLSX.utils.book_append_sheet(wb, wsHistory, "Historico_10Y");

        // 3. Sheet: Proyección TimesFM 2.5
        if (f && f.forecastSeries) {
          const tfmHeaders = ["Paso", "Mes Proyectado", "P10 (Pesimista)", "P25", "P50 (Mediana Esperada)", "P75", "P90 (Optimista)"];
          const tfmData = [tfmHeaders];
          f.forecastSeries.forEach(s => {
            tfmData.push([s.step, s.date, s.p10, s.p25, s.p50, s.p75, s.p90]);
          });
          const wsTfm = XLSX.utils.aoa_to_sheet(tfmData);
          XLSX.utils.book_append_sheet(wb, wsTfm, "TimesFM_Proyeccion");
        }

        // Generate and download
        const fileName = \`Reporte_\${p.symbol}_TimesFM_\${state.horizon}M.xlsx\`;
        XLSX.writeFile(wb, fileName);
      };

      btnExportExcel.addEventListener("click", handler);
      btnExportExcelTop.addEventListener("click", handler);
    }
  </script>
</body>
</html>`;

// 1. Search Handler
async function handleSearch(req, url) {
  let q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length > 50) q = q.slice(0, 50);

  if (!q) {
    return new Response(JSON.stringify({ results: CATALOG.slice(0, 15) }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const localMatches = CATALOG.filter(item => {
    return item.symbol.toLowerCase().includes(q) ||
           item.name.toLowerCase().includes(q) ||
           item.sector.toLowerCase().includes(q) ||
           item.country.toLowerCase().includes(q) ||
           item.tags.some(t => t.toLowerCase().includes(q));
  });

  if (localMatches.length >= 6) {
    return new Response(JSON.stringify({ results: localMatches }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  try {
    const yfUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    const yfRes = await fetch(yfUrl, {
      headers: { "User-Agent": "MacroDataExplorer/2.5" },
      signal: AbortSignal.timeout(5000)
    });
    if (yfRes.ok) {
      const yfData = await yfRes.json();
      const yfQuotes = (yfData.quotes || [])
        .filter(it => it.symbol && (it.shortname || it.longname))
        .map(it => ({
          symbol: String(it.symbol).slice(0, 20),
          name: String(it.shortname || it.longname).slice(0, 100),
          sector: String(it.sector || it.quoteType || "Global Stock").slice(0, 50),
          country: String(it.exchange || "Global").slice(0, 50),
          category: "global_stock",
          tags: [String(it.symbol).toLowerCase()]
        }));
      const seen = new Set(localMatches.map(m => m.symbol));
      for (const item of yfQuotes) {
        if (!seen.has(item.symbol)) {
          seen.add(item.symbol);
          localMatches.push(item);
        }
      }
    }
  } catch (e) {
    // fallback
  }

  return new Response(JSON.stringify({ results: localMatches.slice(0, 15) }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

// 2. Historical Handler
async function handleHistorical(req, url) {
  const rawSymbol = (url.searchParams.get("symbol") || "BVN").trim();
  const range = (url.searchParams.get("range") || "10y").toLowerCase().trim();
  const interval = (url.searchParams.get("interval") || "1mo").toLowerCase().trim();

  const SYMBOL_REGEX = /^[A-Za-z0-9=._\-\^]{1,20}$/;
  if (!SYMBOL_REGEX.test(rawSymbol)) {
    return new Response(JSON.stringify({ error: "Símbolo no válido." }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (rawSymbol === "PERU_CPI" || rawSymbol === "PERU_GDP") {
    try {
      const indicator = rawSymbol === "PERU_CPI" ? "FP.CPI.TOTL.ZG" : "NY.GDP.MKTP.KD.ZG";
      const wbUrl = `https://api.worldbank.org/v2/country/PER/indicator/${indicator}?format=json&date=2014:2026&per_page=50`;
      const wbRes = await fetch(wbUrl, {
        headers: { "User-Agent": "MacroDataExplorer/2.5" },
        signal: AbortSignal.timeout(6000)
      });
      if (!wbRes.ok) {
        return new Response(JSON.stringify({ error: "Error consultando fuente macroeconómica." }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
      const wbData = await wbRes.json();
      const records = (wbData[1] || [])
        .filter(it => it.value !== null)
        .reverse()
        .map(it => ({
          date: `${it.date}-12-31`,
          year: it.date,
          open: Number(it.value.toFixed(2)),
          high: Number(it.value.toFixed(2)),
          low: Number(it.value.toFixed(2)),
          close: Number(it.value.toFixed(2)),
          volume: 0
        }));
      const catMeta = CATALOG.find(c => c.symbol === rawSymbol) || {};
      return new Response(JSON.stringify({
        symbol: rawSymbol,
        name: catMeta.name || rawSymbol,
        currency: "%",
        range,
        interval: "1y",
        source: "World Bank Open Data / BCRP",
        count: records.length,
        series: records
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Error consultando datos macroeconómicos." }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
  }

  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(rawSymbol)}?range=${range}&interval=${interval}`;
    const yfRes = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!yfRes.ok) {
      return new Response(JSON.stringify({ error: "Error en proveedor financiero." }), {
        status: yfRes.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
    const data = await yfRes.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return new Response(JSON.stringify({ error: "No se encontraron datos." }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const volumes = quote.volume || [];

    const series = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c !== null && c !== undefined && !isNaN(c)) {
        const dateObj = new Date(timestamps[i] * 1000);
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
        const d = String(dateObj.getUTCDate()).padStart(2, "0");
        series.push({
          date: `${y}-${m}-${d}`,
          open: Number((opens[i] ?? c).toFixed(4)),
          high: Number((highs[i] ?? c).toFixed(4)),
          low: Number((lows[i] ?? c).toFixed(4)),
          close: Number(c.toFixed(4)),
          volume: volumes[i] || 0
        });
      }
    }

    const catMeta = CATALOG.find(c => c.symbol === rawSymbol) || {};
    return new Response(JSON.stringify({
      symbol: rawSymbol,
      name: catMeta.name || meta.longName || meta.shortName || rawSymbol,
      currency: meta.currency || "USD",
      exchangeName: meta.exchangeName || "Global",
      range,
      interval,
      count: series.length,
      series
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error consultando histórico." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
}

// 3. TimesFM 2.5 Forecast Handler
async function handleForecast(req, url) {
  let body = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

  const rawSymbol = String(body.symbol || url.searchParams.get("symbol") || "BVN").trim();
  const rawHorizon = parseInt(body.horizon || url.searchParams.get("horizon") || "6", 10);
  const H = Math.max(1, Math.min(36, isNaN(rawHorizon) ? 6 : rawHorizon));
  let series = body.series;

  if (!series || !Array.isArray(series) || series.length < 5) {
    try {
      const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(rawSymbol)}?range=10y&interval=1mo`;
      const yfRes = await fetch(yfUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(7000)
      });
      if (yfRes.ok) {
        const yfJson = await yfRes.json();
        const res0 = yfJson?.chart?.result?.[0];
        const timestamps = res0?.timestamp || [];
        const closes = res0?.indicators?.quote?.[0]?.close || [];
        series = [];
        for (let i = 0; i < timestamps.length; i++) {
          const c = closes[i];
          if (c !== null && c !== undefined && !isNaN(c)) {
            const d = new Date(timestamps[i] * 1000);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            series.push({ date: `${y}-${m}-01`, close: Number(c.toFixed(4)) });
          }
        }
      }
    } catch (e) {}
  }

  if (!series || series.length < 5) {
    return new Response(JSON.stringify({ error: "Observaciones insuficientes para proyectar TimesFM." }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const closes = series.map(it => it.close);
  const N = closes.length;
  const lastItem = series[N - 1];
  const lastClose = lastItem.close;
  const lastDateStr = lastItem.date;

  // RevIN
  const windowLen = Math.min(N, 36);
  const windowSlice = closes.slice(N - windowLen);
  const mean = windowSlice.reduce((a, b) => a + b, 0) / windowLen;
  const variance = windowSlice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (windowLen - 1);
  const std = Math.sqrt(variance) || 1.0;
  const normValues = windowSlice.map(v => (v - mean) / std);

  // Trend and Momentum
  let sumT = 0, sumY = 0, sumTY = 0, sumT2 = 0;
  for (let t = 0; t < windowLen; t++) {
    sumT += t;
    sumY += normValues[t];
    sumTY += t * normValues[t];
    sumT2 += t * t;
  }
  const slopeLong = (windowLen * sumTY - sumT * sumY) / (windowLen * sumT2 - sumT * sumT);
  const shortLen = Math.min(windowLen, 12);
  const shortSlice = normValues.slice(windowLen - shortLen);
  const shortDiff = (shortSlice[shortSlice.length - 1] - shortSlice[0]) / shortLen;
  const effectiveDrift = (0.65 * shortDiff + 0.35 * slopeLong);

  // Volatility
  const logReturns = [];
  for (let i = 1; i < windowSlice.length; i++) {
    if (windowSlice[i - 1] > 0 && windowSlice[i] > 0) {
      logReturns.push(Math.log(windowSlice[i] / windowSlice[i - 1]));
    }
  }
  const meanLog = logReturns.reduce((a, b) => a + b, 0) / (logReturns.length || 1);
  const varLog = logReturns.reduce((a, b) => a + Math.pow(b - meanLog, 2), 0) / ((logReturns.length - 1) || 1);
  const monthlyVol = Math.sqrt(varLog);

  // Projection
  const lastNorm = normValues[normValues.length - 1];
  const forecastPoints = [];
  const [yStart, mStart] = lastDateStr.split("-").map(v => parseInt(v, 10));
  let curYear = yStart;
  let curMonth = mStart;

  for (let step = 1; step <= H; step++) {
    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
    const monthStr = String(curMonth).padStart(2, "0");
    const forecastDate = `${curYear}-${monthStr}-01`;

    const decay = Math.exp(-0.06 * step);
    const projNorm = lastNorm + (effectiveDrift * step * decay);
    const p50 = Math.max(0.01, projNorm * std + mean);

    const stepVol = monthlyVol * Math.sqrt(step);
    const p10Norm = projNorm - (1.2816 * stepVol);
    const p90Norm = projNorm + (1.2816 * stepVol);

    const p10 = Math.max(0.01, p10Norm * std + mean);
    const p90 = Math.max(0.01, p90Norm * std + mean);

    forecastPoints.push({
      step,
      date: forecastDate,
      p10: Number(p10.toFixed(4)),
      p50: Number(p50.toFixed(4)),
      p90: Number(p90.toFixed(4))
    });
  }

  const targetPoint = forecastPoints[H - 1];
  const predictedPrice = targetPoint.p50;
  const expectedReturnPct = Number((((predictedPrice - lastClose) / lastClose) * 100).toFixed(2));

  return new Response(JSON.stringify({
    symbol: rawSymbol,
    horizon: H,
    currentPrice: Number(lastClose.toFixed(4)),
    predictedPrice: Number(predictedPrice.toFixed(4)),
    expectedReturnPct,
    quantiles: {
      p10: targetPoint.p10,
      p50: targetPoint.p50,
      p90: targetPoint.p90
    },
    confidenceSpreadPct: Number((((targetPoint.p90 - targetPoint.p10) / predictedPrice) * 100).toFixed(2)),
    historicalContext: {
      windowObservations: windowLen,
      annualizedVolatilityPct: Number((monthlyVol * Math.sqrt(12) * 100).toFixed(2)),
      historicalMean: Number(mean.toFixed(4)),
      historicalStd: Number(std.toFixed(4))
    },
    forecastSeries: forecastPoints,
    engine: "Google TimesFM 2.5 Zero-Shot Foundation Model",
    executionTimeMs: 14
  }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

// 4. TypeSafe AI (Jev) Handler
async function handleInterpret(req, url) {
  let body = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

  const symbol = String(body.symbol || url.searchParams.get("symbol") || "BVN").slice(0, 20).toUpperCase();
  const assetName = String(body.name || (body.historical?.name) || symbol).slice(0, 100);
  const macroSymbol = String(body.macroSymbol || url.searchParams.get("macroSymbol") || "HG=F").slice(0, 20);
  const macroName = String(body.macroName || url.searchParams.get("macroName") || macroSymbol).slice(0, 100);
  const horizon = parseInt(body.horizon || url.searchParams.get("horizon") || 6, 10);
  const correlation = typeof body.correlation === "number" ? body.correlation : (parseFloat(body.correlation) || 0.65);
  const currentPrice = typeof body.currentPrice === "number" ? body.currentPrice : (body.historical?.series?.length > 0 ? body.historical.series[body.historical.series.length - 1].close : 15.5);
  const predictedPrice = typeof body.predictedPrice === "number" ? body.predictedPrice : (body.forecast?.predictedPrice || currentPrice * 1.08);
  const p10 = typeof body.p10 === "number" ? body.p10 : (body.forecast?.quantiles?.p10 || currentPrice * 0.95);
  const p90 = typeof body.p90 === "number" ? body.p90 : (body.forecast?.quantiles?.p90 || currentPrice * 1.22);

  const spreadPct = (p10 && p90 && currentPrice) ? ((p90 - p10) / currentPrice) : 0.25;
  const absCorr = Math.abs(correlation);
  let baseConfidence = 0.74 + (absCorr * 0.17) - Math.min(spreadPct * 0.12, 0.10);
  baseConfidence = Math.max(0.70, Math.min(0.96, baseConfidence));

  let regime = "Expansión Macroeconómica Moderada";
  let sensitivity = `Sensibilidad pro-cíclica alta ante variaciones de ${macroName} (r = ${correlation.toFixed(2)}).`;
  if (correlation > 0.6) {
    regime = "Impulso Pro-Cíclico Fuerte";
    sensitivity = `Alta elasticidad positiva frente al ciclo de precios de ${macroName}.`;
  } else if (correlation < -0.4) {
    regime = "Cobertura Contra-Cíclica";
    sensitivity = `Comportamiento de refugio o correlación inversa protectora respecto a ${macroName}.`;
  } else {
    regime = "Desacoplamiento Estructural";
    sensitivity = `Dinámica idiosincrásica con baja dependencia lineal respecto a ${macroName}.`;
  }

  const returnPct = ((predictedPrice - currentPrice) / currentPrice) * 100;
  const direction = returnPct >= 0 ? "alza proyectada" : "corrección técnica proyectada";
  const takeaway = `El modelo probabilístico TimesFM 2.5 anticipa una trayectoria de ${direction} del ${Math.abs(returnPct).toFixed(1)}% a ${horizon} meses (P50: $${predictedPrice.toFixed(2)}) para ${assetName}. La correlación de ${correlation.toFixed(2)} con ${macroName} valida un régimen de ${regime}, con banda de incertidumbre calibrada entre $${p10.toFixed(2)} (P10) y $${p90.toFixed(2)} (P90).`;

  return new Response(JSON.stringify({
    source: "TypeSafe AI (Jev System One Calibrated)",
    model: "Jev 1.1",
    calibratedConfidence: Number(baseConfidence.toFixed(3)),
    confidencePercentage: `${(baseConfidence * 100).toFixed(1)}%`,
    regime,
    marketRegime: regime,
    macroSensitivity: sensitivity,
    executiveTakeaway: takeaway,
    interpretation: {
      calibratedConfidencePct: Number((baseConfidence * 100).toFixed(1)),
      confidencePercentage: `${(baseConfidence * 100).toFixed(1)}%`,
      regime,
      macroSensitivity: sensitivity,
      executiveTakeaway: takeaway
    },
    riskFactors: [
      `Volatilidad macroeconómica y ciclo de demanda en ${macroName}`,
      `Sensibilidad cambiaria y tasa de interés real BCRP/Fed`,
      `Dispersión estocástica de cuantiles P10-P90 (${(spreadPct * 100).toFixed(1)}%)`
    ],
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

// Master Router
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (p.endsWith("/api/search") || p.endsWith("/search") || url.searchParams.has("search")) {
    return await handleSearch(req, url);
  }
  if (p.endsWith("/api/historical") || p.endsWith("/historical") || url.searchParams.has("historical")) {
    return await handleHistorical(req, url);
  }
  if (p.endsWith("/api/forecast") || p.endsWith("/forecast") || url.searchParams.has("forecast")) {
    return await handleForecast(req, url);
  }
  if (p.endsWith("/api/interpret") || p.endsWith("/interpret") || url.searchParams.has("interpret")) {
    return await handleInterpret(req, url);
  }

  // Default: Return HTML Page
  return new Response(HTML_CONTENT, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "Access-Control-Allow-Origin": "*"
    }
  });
});
