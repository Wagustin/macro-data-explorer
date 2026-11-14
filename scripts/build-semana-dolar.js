// build-semana-dolar.js
// Nota semanal «El dólar esta semana».
// Genera un JSON por semana en data/semana-dolar/AAAA-MM-DD.json y una pagina estatica en
// semana/AAAA-MM-DD/index.html, mas el indice semana/index.html.
// Las cifras salen siempre de data/: cierres del BCRP (data/official/bcrp-daily.json),
// intervencion y swaps (data/official/bcrp-contexto.json) y el rango publicado por el motor
// diario (data/daily-forecasts.json). El texto se arma con frases plantilla: no hay modelo
// de lenguaje ni cifras escritas a mano.
// Ejecutar: node scripts/build-semana-dolar.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const notasDir = path.join(dataDir, 'semana-dolar');
const paginasDir = path.join(rootDir, 'semana');

// ---- 1. Datos ----

const bcrpDaily = JSON.parse(fs.readFileSync(path.join(dataDir, 'official', 'bcrp-daily.json'), 'utf8'));
const seriePen = bcrpDaily.series.PEN.serie.map(([fecha, cierre]) => ({ fecha, cierre }));

const bcrpContexto = JSON.parse(fs.readFileSync(path.join(dataDir, 'official', 'bcrp-contexto.json'), 'utf8'));

const dailyForecasts = JSON.parse(fs.readFileSync(path.join(dataDir, 'daily-forecasts.json'), 'utf8'));
const penForecast = dailyForecasts.simbolos.PEN;

// ---- 2. Helpers ----

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const nf = (decimales = 2) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const num = (valor, decimales = 2) =>
  (typeof valor === 'number' && Number.isFinite(valor) ? nf(decimales).format(valor) : 's/d');

const pct = (valor, decimales = 2) =>
  (typeof valor === 'number' && Number.isFinite(valor) ? `${nf(decimales).format(valor)}%` : 's/d');

const conSigno = (valor, decimales = 2) =>
  (typeof valor === 'number' && Number.isFinite(valor) ? `${valor >= 0 ? '+' : '-'}${nf(decimales).format(Math.abs(valor))}` : 's/d');

const fechaIso = (iso) => new Date(`${iso}T12:00:00Z`);
const iso = (fecha) => fecha.toISOString().slice(0, 10);
const diaSemana = (isoFecha) => DIAS[fechaIso(isoFecha).getUTCDay()];
const fechaCorta = (isoFecha) => `${fechaIso(isoFecha).getUTCDate()} ${MESES_CORTOS[fechaIso(isoFecha).getUTCMonth()]}`;
const fechaLarga = (isoFecha) => {
  const d = fechaIso(isoFecha);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
const lunesDe = (isoFecha) => {
  const d = fechaIso(isoFecha);
  const retroceso = (d.getUTCDay() + 6) % 7; // 0 lunes ... 6 domingo
  return iso(new Date(d.getTime() - retroceso * 86400000));
};

const ENT = String.fromCharCode(38); // ampersand de las entidades HTML
const ENTIDADES = {
  '&': ENT + '#38;',
  '<': ENT + '#60;',
  '>': ENT + '#62;',
  '"': ENT + '#34;',
  "'": ENT + '#39;',
};
const escapeHtml = (valor) => String(valor ?? '').replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter]);

// Suma los valores de una serie del BCRP que caen dentro de las fechas indicadas
const sumaSerie = (clave, fechas) => {
  const serie = bcrpContexto.series[clave];
  if (!serie || !Array.isArray(serie.serie)) return null;
  const enFechas = new Set(fechas);
  let total = 0;
  let dias = 0;
  let diasOperacion = 0;
  let ultimo = null;
  let maximo = null;
  for (const [fecha, valor] of serie.serie) {
    if (!enFechas.has(fecha)) continue;
    total += valor;
    dias += 1;
    if (Math.abs(valor) > 0.005) diasOperacion += 1;
    ultimo = { fecha, valor };
    if (!maximo || Math.abs(valor) > Math.abs(maximo.valor)) maximo = { fecha, valor };
  }
  return { codigo: serie.codigo, unidad: serie.unidad, total, dias, dias_operacion: diasOperacion, ultimo, maximo };
};

// ---- 3. Semanas completas (lunes a viernes) ----

const porSemana = new Map();
for (const punto of seriePen) {
  const clave = lunesDe(punto.fecha);
  if (!porSemana.has(clave)) porSemana.set(clave, []);
  porSemana.get(clave).push(punto);
}

const semanasCompletas = [];
for (const [clave, puntos] of porSemana) {
  // Una semana solo tiene nota cuando el BCRP publico el cierre del viernes
  const viernes = puntos.find((p) => fechaIso(p.fecha).getUTCDay() === 5);
  if (!viernes) continue;
  semanasCompletas.push({ lunes: clave, puntos, viernes: viernes.fecha });
}
semanasCompletas.sort((a, b) => (a.viernes < b.viernes ? -1 : 1));

// ---- 4. Rango publicado por el motor diario ----

const rangoMotor = () => {
  const semana = penForecast.semana;
  if (!semana || typeof semana.p10 !== 'number') return null;
  return {
    p10: semana.p10,
    p25: semana.p25,
    p50: semana.p50,
    p75: semana.p75,
    p90: semana.p90,
    fecha_objetivo: semana.fecha_objetivo,
    horizonte_dias_habiles: semana.horizonte_dias_habiles,
    ancho_banda_pct: semana.ancho_banda_pct,
    cobertura_80_fuera_muestra: semana.backtest ? semana.backtest.cobertura_80_fuera_muestra : null,
    cortes_evaluados: semana.backtest ? semana.backtest.cortes_evaluados : null,
    referencia_cierre: penForecast.fecha_ultimo_cierre,
    publicado: dailyForecasts.actualizado,
  };
};

// ---- 5. Nota de una semana ----

function calcularNota(semana, rangoPublicado, comparacion) {
  const puntos = semana.puntos;
  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const maximo = puntos.reduce((acc, p) => (p.cierre > acc.cierre ? p : acc), puntos[0]);
  const minimo = puntos.reduce((acc, p) => (p.cierre < acc.cierre ? p : acc), puntos[0]);
  const variacionSol = fin.cierre - inicio.cierre;
  const variacionPct = (variacionSol / inicio.cierre) * 100;
  const fechas = puntos.map((p) => p.fecha);

  const intervencion = sumaSerie('INTERVENCION_BCRP', fechas);
  const swaps = sumaSerie('SWAPS_CAMBIARIOS_NETOS', fechas);

  return {
    version: 'Nota semanal del dolar v1',
    semana: semana.viernes,
    titulo: `El dolar esta semana: del ${fechaCorta(inicio.fecha)} al ${fechaCorta(fin.fecha)} de ${fechaIso(fin.fecha).getUTCFullYear()}`,
    generado: new Date().toISOString(),
    fuente_cierres: { codigo: bcrpDaily.series.PEN.codigo, unidad: bcrpDaily.series.PEN.unidad, fuente: bcrpDaily.fuente },
    fuente_contexto: { fuente: bcrpContexto.fuente, url: bcrpContexto.url, licencia: bcrpContexto.licencia },
    mercado: {
      inicio: { fecha: inicio.fecha, cierre: inicio.cierre },
      fin: { fecha: fin.fecha, cierre: fin.cierre },
      variacion_sol: variacionSol,
      variacion_pct: variacionPct,
      maximo: { fecha: maximo.fecha, cierre: maximo.cierre },
      minimo: { fecha: minimo.fecha, cierre: minimo.cierre },
      cierres: puntos.map((p) => [p.fecha, p.cierre]),
    },
    bcrp: {
      intervencion: intervencion,
      swaps_netos: swaps,
    },
    rango_publicado: rangoPublicado,
    comparacion_semana_anterior: comparacion,
    p50_criterio: dailyForecasts.p50_criterio || null,
  };
}

// El cierre del viernes cae dentro del intervalo P10-P90 que el motor publico antes?
// El intervalo solo es comparable si su ventana (cierre de referencia, fecha objetivo)
// cubre la fecha del cierre real.
function compararConRango(rango, cierreReal, fechaCierre) {
  if (!rango || typeof rango.p10 !== 'number') return null;
  const cubre = Boolean(rango.referencia_cierre) && Boolean(rango.fecha_objetivo)
    ? rango.referencia_cierre <= fechaCierre && rango.fecha_objetivo >= fechaCierre
    : false;
  const dentro = cubre ? (cierreReal >= rango.p10 && cierreReal <= rango.p90) : null;
  const distancia = !cubre
    ? null
    : dentro
      ? Math.min(cierreReal - rango.p10, rango.p90 - cierreReal)
      : (cierreReal < rango.p10 ? rango.p10 - cierreReal : cierreReal - rango.p90);
  const borde = !cubre
    ? null
    : (cierreReal - rango.p10 <= rango.p90 - cierreReal ? 'inferior' : 'superior');
  return {
    rango,
    cierre_real: cierreReal,
    fecha_cierre: fechaCierre,
    cubre,
    dentro,
    distancia,
    borde,
  };
}

// ---- 6. Texto de la nota (frases plantilla rellenas con los datos) ----

function textoNota(nota) {
  const m = nota.mercado;
  const cierres = m.cierres.map(([fecha, cierre]) => `S/ ${num(cierre, 4)} el ${diaSemana(fecha)} ${fechaCorta(fecha)}`).join(', ');
  const monotono = m.cierres.every((p, i) => i === 0 || p[1] > m.cierres[i - 1][1]);
  const monotonoBaja = m.cierres.every((p, i) => i === 0 || p[1] < m.cierres[i - 1][1]);
  const recorrido = monotono
    ? 'Cada cierre de la semana quedó por encima del anterior.'
    : monotonoBaja
      ? 'Cada cierre de la semana quedó por debajo del anterior.'
      : 'El tipo de cambio alternó entre alzas y bajas durante la semana.';
  const intradía = m.maximo.fecha === m.minimo.fecha
    ? `El máximo y el mínimo coinciden en el ${diaSemana(m.maximo.fecha)} ${fechaCorta(m.maximo.fecha)}.`
    : `El recorrido más bajo de la semana fue el ${diaSemana(m.minimo.fecha)} ${fechaCorta(m.minimo.fecha)} y el más alto el ${diaSemana(m.maximo.fecha)} ${fechaCorta(m.maximo.fecha)}.`;

  const interv = nota.bcrp.intervencion;
  const swaps = nota.bcrp.swaps_netos;
  const diasOperacion = interv && interv.dias_operacion ? interv.dias_operacion : 0;
  const diasTotal = m.cierres.length;
  const sentidoInterv = !interv || Math.abs(interv.total) < 0.005
    ? 'no registró operación en la mesa de negociación'
    : interv.total > 0
      ? `compró ${num(Math.abs(interv.total), 2)} millones de dólares en la mesa de negociación`
      : `vendió ${num(Math.abs(interv.total), 2)} millones de dólares en la mesa de negociación`;
  const textoSwaps = !swaps || Math.abs(swaps.total) < 0.005
    ? (swaps && swaps.dias_operacion ? `registró operaciones de swaps por ${num(Math.abs(swaps.total), 2)} millones de dólares` : 'no registró colocaciones netas en ninguno de los días con cierre')
    : `registró colocaciones netas por ${num(Math.abs(swaps.total), 2)} millones de dólares`;
  const anterior = nota.comparacion_semana_anterior;
  const rango = nota.rango_publicado;

  const parrafoComparacion = anterior
    ? `El último rango publicado por el motor antes de esta nota (publicado el ${fechaLarga(anterior.rango.publicado.slice(0, 10))}, con objetivo ${fechaLarga(anterior.rango.fecha_objetivo)}) situaba el cierre entre S/ ${num(anterior.rango.p10, 4)} y S/ ${num(anterior.rango.p90, 4)}. ${anterior.cubre
      ? `Ese intervalo cubría la fecha del ${diaSemana(anterior.fecha_cierre)} ${fechaCorta(anterior.fecha_cierre)} y el cierre real fue S/ ${num(anterior.cierre_real, 4)}: ${anterior.dentro
        ? `quedó dentro, a ${num(anterior.distancia, 4)} soles del borde ${anterior.borde}`
        : `quedó fuera, a ${num(anterior.distancia, 4)} soles del borde ${anterior.borde}`}.`
      : `Ese intervalo no alcanzaba la fecha del ${diaSemana(anterior.fecha_cierre)} ${fechaCorta(anterior.fecha_cierre)}, así que no sirve para comparar el cierre de esta semana.`} El intervalo está calibrado para contener el cierre en cerca del 80 % de los cortes evaluados fuera de muestra${anterior.rango.cortes_evaluados ? ` (${num(anterior.rango.cortes_evaluados, 0)} cortes)` : ''}${anterior.rango.cobertura_80_fuera_muestra !== null && anterior.rango.cobertura_80_fuera_muestra !== undefined ? `, con una cobertura medida de ${pct(anterior.rango.cobertura_80_fuera_muestra, 2)}` : ''}.`
    : `Esta es la primera nota del archivo semanal de PerData, así que todavía no hay un rango anterior con el que comparar el cierre del viernes. Desde la próxima nota, cada página comprueba si el cierre de la semana cayó dentro del intervalo P10-P90 que el motor había publicado con antelación.`;

  const parrafoRango = rango
    ? `El motor diario publica un rango para la próxima semana, con un horizonte de ${rango.horizonte_dias_habiles ? `${rango.horizonte_dias_habiles} días hábiles` : 'varios días hábiles'}: P10 S/ ${num(rango.p10, 4)}, P50 S/ ${num(rango.p50, 4)} y P90 S/ ${num(rango.p90, 4)}, con objetivo ${fechaLarga(rango.fecha_objetivo)} y un ancho de banda de ${pct(rango.ancho_banda_pct, 2)}. La cobertura empírica fuera de muestra es de ${rango.cobertura_80_fuera_muestra !== null && rango.cobertura_80_fuera_muestra !== undefined ? pct(rango.cobertura_80_fuera_muestra, 2) : 's/d'}${rango.cortes_evaluados ? ` sobre ${num(rango.cortes_evaluados, 0)} cortes` : ''}. El valor central no es un precio previsto: el motor toma el último cierre como punto de partida (criterio «paseo aleatorio desde el último cierre», validado con backtest), así que P50 se queda cerca del último cierre oficial; lo que se mueve de un día a otro son los bordes del intervalo, que siguen a la volatilidad.`
    : `El motor diario no tiene un rango disponible para los próximos cinco días hábiles en esta corrida, así que esta nota no lo incluye.`;

  return {
    lede: `El tipo de cambio del sol peruano cerró la semana del ${fechaCorta(m.inicio.fecha)} al ${fechaCorta(m.fin.fecha)} en S/ ${num(m.fin.cierre, 4)}, frente a S/ ${num(m.inicio.cierre, 4)} el ${diaSemana(m.inicio.fecha)} ${fechaCorta(m.inicio.fecha)}: ${conSigno(m.variacion_sol, 4)} S/ (${conSigno(m.variacion_pct, 2)} %). El máximo de la semana fue S/ ${num(m.maximo.cierre, 4)} (${diaSemana(m.maximo.fecha)} ${fechaCorta(m.maximo.fecha)}) y el mínimo S/ ${num(m.minimo.cierre, 4)} (${diaSemana(m.minimo.fecha)} ${fechaCorta(m.minimo.fecha)}).`,
    recorrido: `Los cierres oficiales que publica el Banco Central de Reserva del Perú (serie ${nota.fuente_cierres.codigo}) fueron ${cierres}. ${recorrido} ${intradía} La diferencia entre el primer y el último cierre de la semana fue de ${conSigno(m.variacion_sol, 4)} soles, un ${conSigno(m.variacion_pct, 2)} % sobre el cierre del ${diaSemana(m.inicio.fecha)}.`,
    bcrp: `El BCRP ${sentidoInterv} durante la semana (serie ${interv ? interv.codigo : 's/d'}): ${diasOperacion ? `${diasOperacion} de los ${diasTotal} días con cierre tuvieron operación` : 'ninguno de los días con cierre registró operación'}${interv && interv.maximo && Math.abs(interv.maximo.valor) > 0.005 ? `, y el día de mayor intervención fue el ${diaSemana(interv.maximo.fecha)} ${fechaCorta(interv.maximo.fecha)} con ${num(Math.abs(interv.maximo.valor), 2)} millones de dólares` : ''}. En swaps cambiarios netos, ${textoSwaps} (serie ${swaps ? swaps.codigo : 's/d'}). Son las dos herramientas con las que el banco central amortigua los movimientos bruscos del tipo de cambio: no anuncia un valor para el dólar, interviene cuando el mercado se mueve de forma excesiva.`,
    comparacion: parrafoComparacion,
    rango: parrafoRango,
    cierre: `Los cierres, la intervención y los swaps son los que difunde el Banco Central de Reserva del Perú, con su código de serie y su fecha. El rango viene de PerData Engine, cuyo método está descrito en <a href="/metodologia">/metodologia</a>. Esta nota resume lo que pasó y lo que el motor había anticipado; no es una recomendación de compra o venta.`,
  };
}

// ---- 7. HTML ----

const CABECERA_HTML = `  <header class="border-b border-rule bg-card sticky top-0 z-30 transition-colors">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between relative">
      <div class="flex items-center space-x-6">
        <a href="/" class="flex items-center space-x-2.5 text-inherit no-underline"><span class="pd-wordmark">PerData<span class="pd-flag" role="img" aria-label="Peru"><b></b><b></b><b></b></span></span></a>
        <nav class="hidden md:flex items-center space-x-5 text-xs font-medium text-ink-soft" aria-label="Navegación principal">
          <a href="/explorer" class="hover:text-ink transition no-underline">Terminal</a><a href="/empresas" class="hover:text-ink transition no-underline">Empresas</a><a href="/dolar" class="hover:text-ink transition no-underline">Dólar</a><a href="/mercado" class="hover:text-ink transition no-underline">Mercado</a><a href="/noticias" class="hover:text-ink transition no-underline">Noticias</a><a href="/metodologia" class="hover:text-ink transition no-underline">Metodología</a><a href="/guia" class="hover:text-ink transition no-underline">Guía</a><a href="/precios" class="hover:text-ink transition no-underline">Precios</a>
        </nav>
      </div>
      <div class="flex items-center space-x-2 sm:space-x-3"><div id="navbarAuthContainer"></div><label class="ui-switch" title="Alternar modo claro / oscuro"><input id="themeToggle" type="checkbox" aria-label="Modo oscuro" /><div class="slider"><div class="circle"></div></div></label><button id="mobileMenuBtn" class="md:hidden inline-flex items-center justify-center w-8 h-8 rounded border border-rule text-ink-soft hover:text-ink transition" aria-label="Abrir menú" aria-expanded="false"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>
    </div>
    <div id="mobileMenu" class="hidden md:hidden border-t border-rule bg-card px-4 py-3 transition-colors"><nav class="flex flex-col py-2 text-xs font-medium space-y-2 text-ink-soft" aria-label="Menú móvil"><a href="/explorer" class="hover:text-ink py-1 no-underline">Terminal</a><a href="/empresas" class="hover:text-ink py-1 no-underline">Empresas</a><a href="/dolar" class="hover:text-ink py-1 no-underline">Dólar</a><a href="/mercado" class="hover:text-ink py-1 no-underline">Mercado</a><a href="/noticias" class="hover:text-ink py-1 no-underline">Noticias</a><a href="/metodologia" class="hover:text-ink py-1 no-underline">Metodología</a><a href="/guia" class="hover:text-ink py-1 no-underline">Guía</a><a href="/precios" class="hover:text-ink py-1 no-underline">Precios</a></nav></div>
  </header>`;

const PIE_HTML = `  <footer class="border-t border-rule bg-card py-8 px-4">
    <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-ink-soft">
      <a href="/" class="pd-wordmark no-underline">PerData<span class="pd-flag" aria-hidden="true"><b></b><b></b><b></b></span></a>
      <nav class="flex flex-wrap gap-5" aria-label="Navegación secundaria">
        <a href="/noticias">Noticias</a><a href="/resumenes">Archivo de resúmenes</a><a href="/mercado">Mercado</a><a href="/dolar">Dólar</a><a href="/semana">Notas semanales</a><a href="/estado">Estado</a><a href="/nosotros" class="hover:text-ink transition no-underline">Quiénes somos</a>
          <a href="/privacidad">Privacidad</a>
          <a href="/contacto">Contacto</a>
          <a href="/politica-editorial">Política editorial</a>
          <a href="#cookies" class="pd-cookies-link hover:text-ink transition no-underline" data-open-cookies>Cookies</a>
      </nav>
    </div>
  </footer>`;

const SCRIPTS_HTML = `  <script>
    (function() {
      const toggle = document.getElementById('themeToggle');
      if (toggle) {
        toggle.checked = document.documentElement.classList.contains('dark');
        toggle.addEventListener('change', (event) => {
          document.documentElement.classList.toggle('dark', event.target.checked);
          document.documentElement.classList.toggle('light', !event.target.checked);
          localStorage.setItem('theme', event.target.checked ? 'dark' : 'light');
        });
      }
      const menuButton = document.getElementById('mobileMenuBtn');
      const mobileMenu = document.getElementById('mobileMenu');
      if (menuButton && mobileMenu) {
        menuButton.addEventListener('click', () => {
          const open = mobileMenu.classList.toggle('hidden') === false;
          menuButton.setAttribute('aria-expanded', String(open));
        });
      }
    })();
  </script>
  <script src="/consent.js" defer></script>
  <script src="/auth.js" defer></script>`;

// conAnuncios: solo las notas (contenido propio) llevan espacio de publicidad, no el índice
const CABECERA_PAGINA = (titulo, descripcion, canonica, robots = 'index, follow', conAnuncios = false) => `<!DOCTYPE html>
<html lang="es-PE" class="light">
<head>
${conAnuncios ? '  <meta name="pd-ads" content="1">\n' : ''}  <meta name="pd-geo" content="otro">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${canonica}">
  <title>${escapeHtml(titulo)} · PerData</title>
  <meta name="description" content="${escapeHtml(descripcion)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">

  <!-- Tipografias auto-alojadas: Source Serif 4, Libre Franklin, IBM Plex Mono -->
  <link rel="preload" href="/fonts/source-serif-4.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/libre-franklin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/pd.css">
  <link rel="stylesheet" href="/tw.css">

  <style>
    .pd-prose h2 { font: 600 22px/1.25 var(--pd-font-read); color: var(--pd-ink); margin: 34px 0 10px; }
    .pd-prose p { margin: 0 0 14px; font: 400 16px/1.7 var(--pd-font-read); color: var(--pd-ink); }
    .pd-fact-table td, .pd-fact-table th { white-space: nowrap; }
    .pd-fact-table td:first-child { white-space: normal; }
    .pd-semana-lista { list-style: none; margin: 0; padding: 0; }
    .pd-semana-lista li { padding: 16px 0; border-top: 1px solid var(--pd-rule); }
    .pd-semana-lista li:last-child { border-bottom: 1px solid var(--pd-rule); }
  </style>

  <!-- Early Theme Init to prevent flash of unstyled content -->
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
</head>
<body class="bg-paper text-ink min-h-screen antialiased transition-colors duration-200 flex flex-col justify-between">`;

const CIERRE_PAGINA = `</body>
</html>`;

const paginaNota = (nota) => {
  const m = nota.mercado;
  const texto = textoNota(nota);
  const interv = nota.bcrp.intervencion;
  const swaps = nota.bcrp.swaps_netos;
  const filasCierres = m.cierres.map(([fecha, cierre], indice) => {
    const anterior = indice > 0 ? m.cierres[indice - 1][1] : null;
    const variacion = anterior === null ? null : cierre - anterior;
    const clase = variacion === null ? '' : variacion > 0 ? 'text-pos' : variacion < 0 ? 'text-neg' : '';
    return `
            <tr>
              <td>${escapeHtml(diaSemana(fecha))} ${escapeHtml(fechaCorta(fecha))}</td>
              <td class="mono tnum">${num(cierre, 4)}</td>
              <td class="mono tnum ${clase}">${variacion === null ? 's/d' : conSigno(variacion, 4)}</td>
            </tr>`;
  }).join('');

  const titulo = `El dólar esta semana: del ${fechaCorta(m.inicio.fecha)} al ${fechaCorta(m.fin.fecha)}`;
  const descripcion = `Cierre del dólar en Perú del ${fechaCorta(m.inicio.fecha)} al ${fechaCorta(m.fin.fecha)} de ${fechaIso(m.fin.fecha).getUTCFullYear()}: variación, máximo, mínimo, intervención del BCRP y rango probable para los próximos días hábiles.`;

  return `${CABECERA_PAGINA(titulo, descripcion, `https://perdata.site/semana/${nota.semana}`, 'index, follow', true)}
${CABECERA_HTML}

  <main class="pd-data-main max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
    <section class="space-y-3">
      <p class="micro-label text-ink-soft">Banco Central de Reserva del Perú · serie ${escapeHtml(nota.fuente_cierres.codigo)}</p>
      <h1 class="pd-page-title">El dólar esta semana</h1>
      <p class="pd-page-lede">Semana del ${escapeHtml(fechaCorta(m.inicio.fecha))} al ${escapeHtml(fechaCorta(m.fin.fecha))} de ${escapeHtml(fechaIso(m.fin.fecha).getUTCFullYear())}</p>
    </section>

    <section class="mt-10">
      <dl class="pd-dl">
        <div><dt>Cierre del ${escapeHtml(diaSemana(m.inicio.fecha))}</dt><dd>${num(m.inicio.cierre, 4)} S/ · ${escapeHtml(m.inicio.fecha)}</dd></div>
        <div><dt>Cierre del ${escapeHtml(diaSemana(m.fin.fecha))}</dt><dd>${num(m.fin.cierre, 4)} S/ · ${escapeHtml(m.fin.fecha)}</dd></div>
        <div><dt>Variación de la semana</dt><dd>${conSigno(m.variacion_sol, 4)} S/ · ${conSigno(m.variacion_pct, 2)} %</dd></div>
        <div><dt>Máximo</dt><dd>${num(m.maximo.cierre, 4)} S/ · ${escapeHtml(diaSemana(m.maximo.fecha))} ${escapeHtml(fechaCorta(m.maximo.fecha))}</dd></div>
        <div><dt>Mínimo</dt><dd>${num(m.minimo.cierre, 4)} S/ · ${escapeHtml(diaSemana(m.minimo.fecha))} ${escapeHtml(fechaCorta(m.minimo.fecha))}</dd></div>
        <div><dt>Intervención del BCRP</dt><dd>${interv ? num(interv.total, 2) : 's/d'} millones US$ · serie ${escapeHtml(interv ? interv.codigo : 's/d')}</dd></div>
        <div><dt>Swaps cambiarios netos</dt><dd>${swaps ? num(swaps.total, 2) : 's/d'} millones US$ · serie ${escapeHtml(swaps ? swaps.codigo : 's/d')}</dd></div>
      </dl>
    </section>

    <section class="mt-12">
      <h2 class="pd-section-title">Cierres de la semana</h2>
      <div class="overflow-x-auto">
        <table class="pd-fact-table w-full">
          <thead>
            <tr>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Día</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Cierre (S/)</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Variación (S/)</th>
            </tr>
          </thead>
          <tbody>
            ${filasCierres}
          </tbody>
        </table>
      </div>
      <p class="pd-fineprint">Fuente: Banco Central de Reserva del Perú, serie ${escapeHtml(nota.fuente_cierres.codigo)}. La variación se calcula contra el cierre oficial anterior.</p>
    </section>

    <section class="pd-prose">
      <h2>El recorrido de la semana</h2>
      <p>${escapeHtml(texto.lede)}</p>
      <p>${escapeHtml(texto.recorrido)}</p>

      <h2>Qué hizo el BCRP</h2>
      <p>${escapeHtml(texto.bcrp)}</p>

      <h2>El rango de la semana anterior</h2>
      <p>${escapeHtml(texto.comparacion)}</p>

      <h2>El rango para la próxima semana</h2>
      <p>${escapeHtml(texto.rango)}</p>

      <h2>Cómo leer esta nota</h2>
      <p>${texto.cierre}</p>
      <p class="pd-fineprint">Nota generada automáticamente por PerData Engine el ${escapeHtml(nota.generado.slice(0, 10))}. Fuentes: ${escapeHtml(nota.fuente_cierres.fuente)} (serie ${escapeHtml(nota.fuente_cierres.codigo)}) y ${escapeHtml(nota.fuente_contexto.fuente)} (series ${escapeHtml(interv ? interv.codigo : 's/d')}, ${escapeHtml(swaps ? swaps.codigo : 's/d')}).</p>
    </section>

    <div class="pd-ad" data-ad-kind="display"></div>

    <section class="mt-12">
      <p class="pd-fineprint">Nota redactada por el equipo de PerData. <a href="/semana" class="hover:text-ink transition no-underline">Todas las notas semanales</a> · <a href="/dolar" class="hover:text-ink transition no-underline">Dólar hoy</a> · <a href="/metodologia" class="hover:text-ink transition no-underline">Metodología</a></p>
    </section>
  </main>

${PIE_HTML}

${SCRIPTS_HTML}
<script defer src="/ads.js"></script>
${CIERRE_PAGINA}`;
};

const INTRO_INDICE = `Cada semana publicamos una nota con lo que hizo el dólar en Perú: el cierre del lunes y del viernes, el máximo y el mínimo con su día, la variación, qué hizo el Banco Central de Reserva del Perú en la mesa de negociación de divisas y con swaps cambiarios, y el rango que PerData Engine había publicado para esa semana frente al cierre real. La última sección de cada nota recoge el rango vigente para los próximos cinco días hábiles, con su fecha objetivo y su cobertura medida fuera de muestra.

Las notas se generan con un script y no se escriben a mano: los cierres salen de la serie ${escapeHtml(bcrpDaily.series.PEN.codigo)} del BCRP, la intervención y los swaps de las series ${escapeHtml((bcrpContexto.series.INTERVENCION_BCRP || {}).codigo || 's/d')} y ${escapeHtml((bcrpContexto.series.SWAPS_CAMBIARIOS_NETOS || {}).codigo || 's/d')}, y el rango del motor diario que corre cada día hábil. Cada página incluye el código de la serie y la fecha de cada cifra, para que cualquiera pueda verificarla en el sitio de estadísticas del BCRP. El texto es una suma de frases plantillas rellenas con esos datos: no hay modelo de lenguaje en la redacción.

El archivo funciona como un registro de calibración. Cada nota conserva el rango que estaba publicado cuando se escribió, y la nota siguiente comprueba si el cierre de la semana cayó dentro del intervalo P10-P90. Conviene leerlo sin sobreexplotar: un rango probable describe una frecuencia histórica, no una promesa, y dos semanas no constituyen una tendencia. Tampoco son recomendaciones de compra o venta.

Para verificar cada cifra, las series del BCRP se pueden consultar en estadisticas.bcrp.gob.pe con el código que aparece en cada página: ${escapeHtml(bcrpDaily.series.PEN.codigo)} para los cierres del tipo de cambio, ${escapeHtml((bcrpContexto.series.INTERVENCION_BCRP || {}).codigo || 's/d')} para la intervención cambiaria y ${escapeHtml((bcrpContexto.series.SWAPS_CAMBIARIOS_NETOS || {}).codigo || 's/d')} para los swaps cambiarios netos. PerData no corrige ni estima esos datos: los lee, los resume y los publica con su fecha y su código de serie.`;

const paginaIndice = (notas) => {
  const ordenadas = notas.slice().sort((a, b) => (a.semana < b.semana ? 1 : -1));
  const items = ordenadas.map((nota) => {
    const m = nota.mercado;
    return `
          <li>
            <p class="pd-num font-mono tnum text-ink">Semana del ${escapeHtml(fechaCorta(m.inicio.fecha))} al ${escapeHtml(fechaCorta(m.fin.fecha))} de ${escapeHtml(fechaIso(m.fin.fecha).getUTCFullYear())}</p>
            <p class="text-ink-soft mt-1">El dólar cerró el ${escapeHtml(diaSemana(m.fin.fecha))} ${escapeHtml(fechaCorta(m.fin.fecha))} en S/ ${num(m.fin.cierre, 4)}, con una variación de ${conSigno(m.variacion_pct, 2)} % sobre el cierre del ${escapeHtml(diaSemana(m.inicio.fecha))}. El máximo de la semana fue S/ ${num(m.maximo.cierre, 4)} y el mínimo S/ ${num(m.minimo.cierre, 4)}. <a href="/semana/${escapeHtml(nota.semana)}" class="hover:text-ink transition no-underline">Leer la nota</a></p>
          </li>`;
  }).join('');

  return `${CABECERA_PAGINA('Notas semanales del dólar', 'Notas semanales del dólar en Perú: cierre del lunes y del viernes, máximo, mínimo, intervención del BCRP, swaps cambiarios y rango probable del motor diario.', 'https://perdata.site/semana')}
${CABECERA_HTML}

  <main class="pd-data-main max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
    <section class="space-y-3">
      <p class="micro-label text-ink-soft">Archivo generado por PerData Engine</p>
      <h1 class="pd-page-title">Notas semanales del dólar</h1>
      <p class="pd-page-lede">${escapeHtml(ordenadas.length)} ${ordenadas.length === 1 ? 'nota disponible' : 'notas disponibles'}, con los datos oficiales del BCRP y el rango del motor diario</p>
    </section>

    <section class="pd-prose mt-8">
      <p>${INTRO_INDICE}</p>
    </section>

    <section class="mt-10">
      <h2 class="pd-section-title">Notas publicadas</h2>
      <ul class="pd-semana-lista">
${items}
      </ul>
      <p class="pd-fineprint">La última nota se publica cuando el Banco Central de Reserva del Perú difunde el cierre del viernes, por lo general el lunes siguiente. Fuentes: ${escapeHtml(bcrpDaily.fuente)} y ${escapeHtml(bcrpContexto.fuente)}.</p>
    </section>

    <section class="mt-12">
      <p class="pd-fineprint">Redactado por el equipo de PerData. <a href="/dolar" class="hover:text-ink transition no-underline">Dólar hoy</a> · <a href="/metodologia" class="hover:text-ink transition no-underline">Metodología</a> · <a href="/politica-editorial" class="hover:text-ink transition no-underline">Política editorial</a></p>
    </section>
  </main>

${PIE_HTML}

${SCRIPTS_HTML}
${CIERRE_PAGINA}`;
};

// ---- 8. Generación y escritura ----

function main() {
  fs.mkdirSync(notasDir, { recursive: true });
  fs.mkdirSync(paginasDir, { recursive: true });

  const existentes = new Map();
  for (const archivo of fs.readdirSync(notasDir)) {
    const coincide = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(archivo);
    if (!coincide) continue;
    existentes.set(coincide[1], JSON.parse(fs.readFileSync(path.join(notasDir, archivo), 'utf8')));
  }

  const rango = rangoMotor();
  // El archivo completo, con las notas que ya estaban y las nuevas de esta corrida
  const notas = [...existentes.values()].sort((a, b) => (a.semana < b.semana ? -1 : 1));
  let nuevas = 0;

  // El archivo semanal empieza con la semana completa más reciente y crece una nota por semana.
  // Solo se rellenan las semanas posteriores a la más antigua del archivo (por ejemplo, si una
  // corrida del workflow se felló): el archivo no se alarga hacia atrás con notas viejas.
  const fechasExistentes = [...existentes.keys()].sort();
  const masAntigua = fechasExistentes[0];
  const masReciente = semanasCompletas[semanasCompletas.length - 1];
  const candidatas = masAntigua
    ? semanasCompletas.filter((semana) => semana.viernes > masAntigua)
    : (masReciente ? [masReciente] : []);

  for (const semana of candidatas) {
    const fechaFin = semana.viernes;
    if (existentes.has(fechaFin)) continue;
    // La comparación usa el rango que publicó la nota anterior del archivo
    const anterior = notas
      .filter((nota) => nota.semana < fechaFin)
      .sort((a, b) => (a.semana < b.semana ? 1 : -1))[0];
    const cierreViernes = semana.puntos.find((p) => p.fecha === fechaFin).cierre;
    const comparacion = compararConRango(anterior ? anterior.rango_publicado : null, cierreViernes, fechaFin);
    const nota = calcularNota(semana, rango, comparacion);
    fs.writeFileSync(path.join(notasDir, `${fechaFin}.json`), `${JSON.stringify(nota, null, 2)}\n`);
    notas.push(nota);
    nuevas += 1;
  }

  // La página de cada nota se vuelve a pintar desde su JSON, que no cambia
  for (const nota of notas) {
    const carpeta = path.join(paginasDir, nota.semana);
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, 'index.html'), paginaNota(nota));
  }
  fs.writeFileSync(path.join(paginasDir, 'index.html'), paginaIndice(notas));

  console.log(`Notas semanales: ${notas.length} en el archivo, ${nuevas} nuevas (${semanasCompletas.length} semanas completas en los datos).`);
  console.log(`Escrito ${path.join(paginasDir, 'index.html')}`);
  console.log('build-semana-dolar.js finished successfully');
  return notas;
}

const esEjecucionDirecta = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (esEjecucionDirecta) main();

export {
  main,
  calcularNota,
  compararConRango,
  textoNota,
  paginaNota,
  paginaIndice,
  rangoMotor,
  semanasCompletas,
  lunesDe,
  notasDir,
  paginasDir,
};
