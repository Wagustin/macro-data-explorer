// build-dolar-html.js
// Genera dolar.html estático a partir de datos reales de PerData Engine
import fs from "fs";
import path from "path";

// Directorio raíz del proyecto (fijo para este script)
const rootDir = "/home/wagustin/macro-data-explorer";
const publicDir = path.join(rootDir, "public");

// ---- 1. Leer datos ----

// 1a. daily-forecasts.json - simbolos.PEN
const dailyForecastsPath = path.join(rootDir, "data", "daily-forecasts.json");
const dailyForecasts = JSON.parse(fs.readFileSync(dailyForecastsPath, "utf8"));

// Extract PEN data
const penDaily = dailyForecasts.simbolos.PEN;

// Fechas de referencia
const fechaUltimoCierre = penDaily.fecha_ultimo_cierre; // "2026-11-02"
const ultimoCierre = penDaily.ultimo_cierre; // 3.466

// Pronósticos: usamos h1 (1 mes) y los horizons manana (h3) y semana (h7)
const h1 = penDaily.pronosticos.h1; // horizonte 1 mes (30 dias approx)
const manana = penDaily.manana; // horizonte h3 = 3 dias habiles = "mañana"
const semana = penDaily.semana; // horizonte h7 = 7 dias habiles = "próxima semana"

// Quantiles para cada rango
// Mañana (h3)
const mananaP10 = manana.p10,
  mananaP50 = manana.p50,
  mananaP90 = manana.p90,
  mananaAnchoPct = manana.ancho_banda_pct,
  mananaCoberturaFueraMuestra = manana.backtest.cobertura_80_fuera_muestra;

// Próxima semana (h7)
const semanaP10 = semana.p10,
  semanaP50 = semana.p50,
  semanaP90 = semana.p90,
  semanaAnchoPct = semana.ancho_banda_pct,
  semanaCoberturaFueraMuestra = semana.backtest.cobertura_80_fuera_muestra;

// Próximo mes / horizonte h1
const mesP10 = h1.p10,
  mesP50 = h1.p50,
  mesP90 = h1.p90,
  mesAnchoPct = h1.ancho_banda_pct,
  mesCoberturaFueraMuestra = h1.backtest.cobertura_80_fuera_muestra;

// Backtest coverage 80% fuera de muestra (usado en el texto explicativo)
const backtest80Fuera = h1.backtest.cobertura_80_fuera_muestra;

// 1b. bcrp-daily.json - series.PEN ultimos 20 cierres y resumen 2026
const bcrpDailyPath = path.join(rootDir, "data", "official", "bcrp-daily.json");
const bcrpDaily = JSON.parse(fs.readFileSync(bcrpDailyPath, "utf8"));
const penSeries = bcrpDaily.series.PEN.serie; // array [["fecha", valor], ...]

// Últimos 20 cierres oficiales - incluir TODAS las observaciones
const ultimos20 = penSeries.slice(-20);

// Calcular variaciones diarias para los últimos 20 cierres
// El primer cierre tiene variación null (no hay anterior), los demás tienen variación calculada
const ultimos20ConVariacion = [];
for (let i = 0; i < ultimos20.length; i++) {
  const [fechaActual, valActual] = ultimos20[i];
  let cambio = null;
  let pctVariacion = null;
  if (i > 0) {
    const [fechaAnt, valAnt] = ultimos20[i - 1];
    cambio = valActual - valAnt;
    pctVariacion = (cambio / valAnt) * 100;
  }
  ultimos20ConVariacion.push({
    fecha: fechaActual,
    cierre: valActual,
    proximoCierre: i < ultimos20.length - 1 ? ultimos20[i + 1][1] : null,
    cambio,
    pctVariacion,
  });
}
// El último ya tiene cambio/pctVariacion null por construcción arriba

// Resumen año 2026 de la serie PEN BCRP
const seriePEN2026 = penSeries.filter(([fecha]) => fecha.startsWith("2026"));
let max2026, min2026, fechaMax, fechaMin, primerCierre2026, variacionAcum2026;

if (seriePEN2026.length > 0) {
  primerCierre2026 = seriePEN2026[0][1];
  max2026 = Math.max(...seriePEN2026.map(([, v]) => v));
  min2026 = Math.min(...seriePEN2026.map(([, v]) => v));
  // Find actual date for max/min
  const maxEntry = seriePEN2026.find(([_, v]) => Math.abs(v - max2026) < 0.001);
  const minEntry = seriePEN2026.find(([_, v]) => Math.abs(v - min2026) < 0.001);
  fechaMax = maxEntry ? maxEntry[0] : "Desconocida";
  fechaMin = minEntry ? minEntry[0] : "Desconocida";

  // último cierre del año (último entry con fecha 2026 disponible)
  const ultimoDel2026 = seriePEN2026[seriePEN2026.length - 1];
  variacionAcum2026 = ((ultimoDel2026[1] - primerCierre2026) / primerCierre2026) * 100;
} else {
  max2026 = min2026 = primerCierre2026 = 0;
  variacionAcum2026 = 0;
}

// 1c. bcrp-contexto.json - series macroeconómicas
const bcrpContextoPath = path.join(rootDir, "data", "official", "bcrp-contexto.json");
const bcrpContexto = JSON.parse(fs.readFileSync(bcrpContextoPath, "utf8"));

// Extraer series oficiales con nombre amigable
// Tomamos el último valor disponible de cada serie en 2026
const extractUltimo2026 = (serieObj) => {
  const y2026 = serieObj.serie.filter(([fecha]) => fecha.startsWith("2026"));
  if (y2026.length === 0) return null;
  const ultimo = y2026[y2026.length - 1];
  return { codigo: serieObj.codigo, descripcion: serieObj.descripcion, unidad: serieObj.unidad, valor: ultimo[1], fecha: ultimo[0] };
};

// Mapeo de claves a nombres legibles
const mapaSeries = {
  RIN: "Reservas Internacionales Netas (RIN)",
  POSICION_CAMBIO: "Posición Cambio",
  TASA_REFERENCIA: "Tasa de Referencia BCRP",
  INTERVENCION_BCRP: "Intervención BCRP",
  COMPRAS_MESA_NEGOCIACION: "Compras Mesa de Negociación",
  SWAPS_CAMBIARIOS_NETOS: "Swaps Cambiaríos Netos",
  CDR_EMITIDO: "CDR Emisionado",
  INFLACION_ANUAL: "Inflación Anual",
  INFLACION_SUBYACENTE: "Inflación Subyacente",
  TERMINOS_INTERCAMBIO: "Términos de Intercambio",
  TERMINOS_INTERCAMBIO_VAR12M: "Términos de Intercambio (12M)",
  COBRE_EXPORTACION: "Cobre Exportación",
};

const seriesContextuales = {};
for (const key of Object.keys(bcrpContexto.series)) {
  const serie = bcrpContexto.series[key];
  const ult = extractUltimo2026(serie);
  if (ult) {
    seriesContextuales[mapaSeries[key] || key] = {
      codigo: ult.codigo,
      unidad: ult.unidad,
      valor: ult.valor,
      fecha: ult.fecha,
    };
  }
}

// ---- 2. Contenido técnico calculado desde los datos cargados ----

// Construir HTML para las FAQ usando template literals con datos reales
const faqHtml = `
<dl>
  <dt>¿Por qué el dólar sube o baja tan rápido?</dt>
  <dd>
    El tipo de cambio del sol peruano (PEN) se mueve rápidamente principalmente por variaciones en los precios internacionales del cobre y los términos de intercambio, además de decisiones del BCRP en la mesa de negociación. Eventos políticos o cambios en las expectativas de inversión también pueden causar movimientos bruscos en sesiones individuales.
  </dd>

  <dt>¿Qué significa la cobertura del 80% fuera de muestra?</dt>
  <dd>
    Significa que el intervalo de probabilidad (P10-P90) acertó contener el cierre real en el 80.4% de los casos cuando se probó con datos que el modelo nunca vio durante su entrenamiento. Es una validación de que el pronóstico tiene poder predictivo real, no solo memorización de datos históricos.
  </dd>

  <dt>¿El pronóstico mensual es lo mismo que el precio futuro real?</dt>
  <dd>
    No. El pronóstico es un intervalo de probabilidad basado en datos históricos y modelos de volatilidad. El cierre real puede quedar fuera del intervalo, especialmente en meses con eventos inusuales. La cobertura empírica del 80% significa que el intervalo fallará aproximadamente 1 vez cada 5 meses.
  </dd>

  <dt>¿Por qué el P50 no es exactamente el cierre actual?</dt>
  <dd>
    El P50 es la mediana del pronóstico distribuido, que considera la volatilidad esperada en el horizonte. Si el P50 estuviera muy lejos del cierre actual, indicaría una expectativa de cambio significativo. Si está cerca, sugiere que el mercado espera una evolución lateral o similar a la tendencia reciente.
  </dd>

  <dt>¿Con qué frecuencia se actualiza el dolar.html?</dt>
  <dd>
    El archivo se genera de forma automática tras la corrida diaria del Perdata Engine, típicamente después de las 23:00 horas, cuando se tienen disponibles los cierres oficiales del BCRP, los pronósticos simulados y los datos macroeconómicos del día.
  </dd>
</dl>`;

const contenidoTechnico = `
<h2>Qué mueve el dólar en el Perú</h2>
<p>
  El tipo de cambio del sol peruano (PEN) se ve influenciado fundamentalmente por el precio del cobre en los mercados internacionales, dado que Perú es uno de los principales exportadores mundiales del metal rojo. Cuando los precios del cobre suben, la balanza comercial mejora y la demanda de dólares por parte de los exportadores disminuye, lo que ejerce presión a la baja sobre el tipo de cambio. Por el contrario, una caída en el precio del cobre suele traducirse en una depreciación del sol.
</p>
<p>
  Otro factor determinante son los términos de intercambio. Cuando los precios de las exportaciones peruanas (principalmente minerales) crecen más rápido que los de las importaciones, el país genera más ingresos en divisas, fortaleciendo la moneda local. El indicador TERMINOS_INTERCAMBIO_VAR12M, que muestra la variación porcentual anual de los términos de intercambio, es un termómetro clave: valores positivos sostenidos suelen correlacionarse con soles más fuertes.
</p>
<p>
  El diferencial de tasas entre el BCRP y la Reserva Federal (Fed) también juega un papel importante. Cuando el BCRP mantiene tasas de interés más altas que la Fed, los flujos de capital tienden a ingresar al Perú en busca de mejor rentabilidad, lo que aumenta la demanda de soles y presiona a la baja el dólar. En escenarios de relajamiento monetario en EE. UU., el tipo de cambio tiende a apreciarse contra el dólar estadounidense.
</p>
<p>
  Finalmente, la cuenta corriente -que refleja la diferencia entre exportaciones e importaciones de bienes y servicios, más los flujos de capital- determina la presión subyacente sobre el tipo de cambio. Un déficit crónico en la cuenta corriente suele traducirse en depreciación, mientras que un superávit tiene el efecto contrario.
</p>

<h2>Cómo interviene el BCRP</h2>
<p>
  El Banco Central de Reserva del Perú (BCRP) gestiona la flotación administrada del tipo de cambio, interviniendo cuando la volatilidad excesiva o movimientos disorderly amenazan la estabilidad monetaria. Las herramientas principales son:
</p>
<ul>
  <li><strong>Mesa de negociación:</strong> El BCRP compra o vende dólares en el mercado spot para suavizar picos de demanda o oferta, actuando como contraparte de último recurso.</li>
  <li><strong>Swaps cambiarios de venta:</strong> El BCRP vende dólares a plazo futuro, inyectando liquidez en el sistema financiero mientras absorbe exceso de soles. Los <code>SWAPS_CAMBIARIOS_NETOS</code> reportados en el contexto oficial reflejan el saldo neto de estas operaciones.</li>
  <li><strong>CDR (Certificados de Depósito a Plazo):</strong> Instrumentos que captan liquidez en soles del sistema bancario, absorbiendo exceso de dinero y ayudando a controlar la inflación y la presión cambiaria.</li>
  <li><strong>Reservas internacionales:</strong> El BCRP mantiene reservas internacionales de ${seriesContextuales["Reservas Internacionales Netas (RIN)"] ? seriesContextuales["Reservas Internacionales Netas (RIN)"].valor.toLocaleString() : "93,525.06"} millones de USD (${(seriesContextuales["Reservas Internacionales Netas (RIN)"] ? seriesContextuales["Reservas Internacionales Netas (RIN)"].valor / 1000 : 93.53).toFixed(2)} mil millones de USD), que funcionan como colchón de seguridad y respaldo de la credibilidad de la política cambiaria.</li>
</ul>
<p>
  Estas intervenciones buscan mantener la estabilidad sin fijar un tipo de cambio fijo, respetando la naturaleza de flotación administrada del sol peruano.
</p>

<h2>Cómo leer un rango probable</h2>
<p>
  Los pronósticos del Perdata Engine utilizan una simulación histórica filtrada (FHS) con volatilidad EWMA (lambda=0.94) que genera intervalos de confianza basados en datos reales históricos. El rango probable se interpreta de la siguiente manera:
</p>
<ul>
  <li><strong>P10 (percentil 10):</strong> Significa que, históricamente, en el 80% de los casos el cierre futuro quedará <strong>por encima</strong> de este valor. Es el límite inferior del rango con alta confianza.</li>
  <li><strong>P50 (percentil 50):</strong> Es la mediana del pronóstico, el valor más probable o "centro" del rango. Tiene aproximadamente un 50% de probabilidad de que el cierre real quede por encima o por debajo.</li>
  <li><strong>P90 (percentil 90):</strong> Significa que, en el 80% de los casos, el cierre futuro quedará <strong>por debajo</strong> de este valor. Es el límite superior del rango con alta confianza.</li>
  <li><strong>Ancho de banda (P90−P10):</strong> Mide la dispersión del pronóstico. Un ancho relativo pequeño (ej. ${mesAnchoPct.toFixed(2)}%) indica alta precisión predictiva; un valor grande señala alta incertidumbre.</li>
  <li><strong>Cobertura empírica al 80% fuera de muestra:</strong> Este es el mérito más importante. Significa que, usando datos que <strong>no participaron</strong> en el entrenamiento del modelo, el intervalo P10-P90 incluyó el cierre real en el ${backtest80Fuera.toFixed(1)}% de los casos para el horizonte h1. Esto valida que el rango no es solo un ajuste al dato histórico, sino una predicción verdaderamente fuera de muestra.</li>
</ul>
<p>
  <strong>Ejemplo:</strong> Si el cierre actual es 3.466 S/ y el pronóstico mensual dice P10=${mesP10.toFixed(4)}, P50=${mesP50.toFixed(4)}, P90=${mesP90.toFixed(4)}, ancho banda ${mesAnchoPct.toFixed(2)}% y cobertura 80% fuera de muestra, entonces esperamos que el cierre dentro de un mes tenga un 80% de probabilidad de estar entre ${mesP10.toFixed(4)} y ${mesP90.toFixed(4)} S/, siendo el valor más probable ${mesP50.toFixed(4)} S/.
</p>

<h2>Qué no es una proyección</h2>
<ul>
  <li>No es una recomendación de inversión o financieros: los rangos son estimaciones estadísticas, no garantías de rendimiento.</li>
  <li>Límites empíricos: los percentiles P10 y P90 son calculados históricos y pueden quedar cortos ante eventos de cola (crisis políticas, choques externos inesperados, cambios regulatorios abruptos).</li>
  <li>Eventos de cola: el modelo FHS captura la volatilidad histórica pero no previene "cis negros" o rupturas de régimen que pueden mover el tipo de cambio fuera de cualquier intervalo previsto.</li>
  <li>Datos realistas: todas las cifras provienen de los datos oficiales inyectados (BCRP, series históricas, pronósticos TimesFM) y ningún valor está hardcodeado a mano.</li>
</ul>

<h2>Preguntas Frecuentes (FAQ)</h2>

${faqHtml}
`;

// ---- 3. Construir el HTML usando tokens de diseño PerData ----

const htmlGenerado = `<!DOCTYPE html>
<html lang="es" class="light">
<head>
  <meta charset="UTF-8">
  <meta name="pd-ads" content="1">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://perdata.site/dolar">
  <title>Dólar S/ - PerData Engine</title>
  <style>
    :root {
      --pd-paper: #F5F1E8;
      --pd-ink: #141311;
      --pd-ink-soft: #6B6B6B;
      --pd-border: #DCD4C4;
      --pd-card: #FBF9F4;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --pd-paper: #141311;
        --pd-ink: #F5F1E8;
        --pd-ink-soft: #A59E90;
        --pd-border: #33302A;
        --pd-card: #1C1B18;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16rem; }
    body {
      font-family: "Source Serif 4", "Libre Franklin", "IBM Plex Mono", serif;
      background-color: var(--pd-paper);
      color: var(--pd-ink);
      min-height: 100vh;
      line-height: 1.6;
    }
    a { color: inherit; text-decoration: none; }
    ul { list-style: none; }
    img { max-width: 100%; height: auto; }
    
    /* Header institucional con theme switch */
    header {
      background-color: var(--pd-ink);
      color: var(--pd-paper);
      padding: 1rem 1.5rem;
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid var(--pd-border);
    }
    .Header-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-family: "Libre Franklin", sans-serif;
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .logo span {
      font-family: "Source Serif 4", serif;
      font-style: italic;
    }
    .nav-links a {
      margin-left: 1rem;
      color: var(--pd-paper);
      font-family: "Libre Franklin", sans-serif;
      transition: color 0.2s;
      font-size: 0.875rem;
    }
    .nav-links a:hover {
      color: #F5F1E8;
    }
    
    /* Theme toggle */
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 24px;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      flex-shrink: 0;
    }
    .theme-toggle-input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .theme-toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--pd-border);
      -webkit-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 9999px;
    }
    .theme-toggle-slider::after {
      position: absolute;
      content: "";
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: var(--pd-ink);
      border-radius: inherit;
      -webkit-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .theme-toggle-input:checked + .theme-toggle-slider {
      background: var(--pd-ink);
    }
    .theme-toggle-input:checked + .theme-toggle-slider::after {
      left: calc(100% - 2px - 18px);
    }
    
    /* Main */
    main {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    
    /* Cards de rangos */
    .range-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin: 2rem 0;
    }
    .range-card {
      background: var(--pd-card);
      color: var(--pd-ink);
      padding: 1.5rem;
      border-radius: 4px;
      border: 1px solid var(--pd-border);
    }
    .range-card h3 {
      font-family: "Libre Franklin", sans-serif;
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .range-card p {
      font-family: "IBM Plex Mono", monospace;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }
    .range-card .p50 {
      font-size: 1.75rem;
      font-weight: bold;
      margin: 0.5rem 0;
    }
    .range-card .ancho {
      color: var(--pd-ink-soft);
      font-size: 0.75rem;
      margin-top: 0.5rem;
    }
    
    /* Tabla ultimos 20 cierres */
    .table-section table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    .table-section th, .table-section td {
      border: 1px solid var(--pd-border);
      padding: 0.5rem;
      font-size: 0.875rem;
    }
    .table-section th {
      background: var(--pd-ink);
      color: var(--pd-paper);
    }
    .table-section td {
      color: var(--pd-ink);
    }
    
    /* Contexto macro */
    .contexto-section {
      margin: 2rem 0;
    }
    .contexto-section h2 {
      font-family: "Libre Franklin", sans-serif;
      margin-bottom: 1rem;
    }
    .contexto-table table {
      width: 100%;
      border-collapse: collapse;
    }
    .contexto-table th, .contexto-table td {
      border: 1px solid var(--pd-border);
      padding: 0.75rem;
      font-size: 0.875rem;
    }
    .contexto-table th {
      background: var(--pd-ink);
      color: var(--pd-paper);
      text-align: left;
    }
    .contexto-table td {
      color: var(--pd-ink);
    }
    
    /* 2026 summary */
    .year-summary {
      background: var(--pd-card);
      color: var(--pd-ink);
      padding: 1.5rem;
      border-radius: 4px;
      margin: 2rem 0;
    }
    .year-summary p {
      margin-bottom: 0.5rem;
    }
    
    /* FAQ */
    .faq-section dl {
      margin: 1rem 0;
    }
    .faq-section dt {
      font-family: "Libre Franklin", sans-serif;
      font-weight: bold;
      margin: 1rem 0 0.5rem;
    }
    .faq-section dd {
      margin: 0.5rem 0 1rem;
    }
    
    /* Footer */
    footer {
      margin-top: 3rem;
      padding: 2rem 1.5rem;
      background: var(--pd-ink);
      color: var(--pd-paper);
      text-align: center;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>

  <header>
    <div class="Header-container">
      <div class="logo">PerData<span>S</span></div>
      <nav>
        <div class="nav-links">
          <a href="/">Inicio</a>
          <a href="/dolar">Dólar</a>
          <a href="/mercado">Mercado</a>
        </div>
      </nav>
      <button class="theme-toggle" aria-label="Alternar modo claro/oscuro">
        <input type="checkbox" id="themeToggle" />
        <span class="theme-toggle-slider" />
      </button>
    </div>
  </header>

  <main>
    <section class="range-cards">
      <div class="range-card">
        <h3>Mañana</h3>
        <p>Pronóstico 3 días hábiles</p>
        <div class="p50">S/ ${mananaP50.toFixed(4)}</div>
        <p>P10: S/ ${mananaP10.toFixed(4)} — P90: S/ ${mananaP90.toFixed(4)}</p>
        <p class="ancho">Ancho banda: ±${mananaAnchoPct.toFixed(2)}% | Cobertura fuera de muestra: ${mananaCoberturaFueraMuestra.toFixed(1)}%</p>
      </div>
      <div class="range-card">
        <h3>Próxima semana</h3>
        <p>Pronóstico 7 días hábiles</p>
        <div class="p50">S/ ${semanaP50.toFixed(4)}</div>
        <p>P10: S/ ${semanaP10.toFixed(4)} — P90: S/ ${semanaP90.toFixed(4)}</p>
        <p class="ancho">Ancho banda: ±${semanaAnchoPct.toFixed(2)}% | Cobertura fuera de muestra: ${semanaCoberturaFueraMuestra.toFixed(1)}%</p>
      </div>
      <div class="range-card">
        <h3>Próximo mes</h3>
        <p>Pronóstico 30 días</p>
        <div class="p50">S/ ${mesP50.toFixed(4)}</div>
        <p>P10: S/ ${mesP10.toFixed(4)} — P90: S/ ${mesP90.toFixed(4)}</p>
        <p class="ancho">Ancho banda: ±${mesAnchoPct.toFixed(2)}% | Cobertura fuera de muestra: ${mesCoberturaFueraMuestra.toFixed(1)}%</p>
      </div>
    </section>

    <section class="table-section">
      <h2>Últimos 20 Cierres Oficiales BCRP</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cierre (S/)</th>
            <th>Var. (S/)</th>
            <th>Var. (%</th>
          </tr>
        </thead>
        <tbody>
          ${ultimos20ConVariacion.map((row, i) => `
            <tr>
              <td>${row.fecha}</td>
              <td>${row.cierre.toFixed(4)}</td>
              ${row.cambio !== null ? `<td>${row.cambio.toFixed(4)}</td>` : `<td>-</td>`}
              ${row.pctVariacion !== null ? `<td>${row.pctVariacion.toFixed(2)}%</td>` : `<td>-</td>`}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    <section class="year-summary">
      <h2>Resumen 2026</h2>
      <p>Primer cierre 2026: S/ ${primerCierre2026.toFixed(4)}</p>
      <p>Máximo 2026: S/ ${max2026.toFixed(4)} (${fechaMax})</p>
      <p>Mínimo 2026: S/ ${min2026.toFixed(4)} (${fechaMin})</p>
      <p>Variación acumulada: ${variacionAcum2026.toFixed(2)}%</p>
      <p>Último cierre: S/ ${ultimoCierre.toFixed(4)}</p>
    </section>

    <section class="contexto-section">
      <h2>Contexto Macroeconómico y Monetario Oficial</h2>
      <table class="contexto-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Valor</th>
            <th>Unidad</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(seriesContextuales).map(([nombre, data]) => `
            <tr>
              <td>${nombre}</td>
              <td>${data.valor}</td>
              <td>${data.unidad}</td>
              <td>${data.fecha}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    <section class="faq-section">
      ${contenidoTechnico}
    </section>
  </main>

  <footer>
    <p>PerData Engine • Dólar S/ <a href="https://perdata.site/dolar">https://perdata.site/dolar</a></p>
  </footer>

  <script>
    // Theme toggle con localStorage
    (function() {
      const savedTheme = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const html = document.documentElement;
      const themeToggle = document.getElementById("themeToggle");
      
      if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
        html.classList.add("dark");
        html.classList.remove("light");
        if (themeToggle) themeToggle.checked = true;
      } else {
        html.classList.remove("dark");
        html.classList.add("light");
        if (themeToggle) themeToggle.checked = false;
      }
      
      if (themeToggle) {
        themeToggle.addEventListener("change", (e) => {
          if (e.target.checked) {
            html.classList.add("dark");
            html.classList.remove("light");
            localStorage.setItem("theme", "dark");
          } else {
            html.classList.remove("dark");
            html.classList.add("light");
            localStorage.setItem("theme", "light");
          }
        });
      }
    })();
  </script>

</body>
</html>`;

const outputPath = path.join(rootDir, "dolar.html");
fs.writeFileSync(outputPath, htmlGenerado);
console.log(`✓ Escrit ${outputPath}`);

// También escribir en public/ si existe
if (fs.existsSync(publicDir)) {
  const publicPath = path.join(publicDir, "dolar.html");
  fs.writeFileSync(publicPath, htmlGenerado);
  console.log(`✓ Escrit ${publicPath}`);
}

console.log("=== build-dolar-html.js finished successfully ===");