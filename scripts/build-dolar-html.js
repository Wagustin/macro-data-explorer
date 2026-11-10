// build-dolar-html.js
// Genera dolar.html (pagina estatica /dolar) con datos reales del PerData Engine
// y del contexto oficial del BCRP. Ejecutar: node scripts/build-dolar-html.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const dataDir = path.join(rootDir, 'data');

// ---- 1. Lectura de datos ----

// 1a. daily-forecasts.json -> simbolos.PEN
const dailyForecasts = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'daily-forecasts.json'), 'utf8')
);
const penDaily = dailyForecasts.simbolos.PEN;

const fechaUltimoCierre = penDaily.fecha_ultimo_cierre;
const ultimoCierre = penDaily.ultimo_cierre;
const fuenteUltimoCierre = penDaily.fuente_ultimo_cierre || "BCRP";
const etiquetaCierre = fuenteUltimoCierre === "SUNAT" ? "cierre SBS publicado por SUNAT" : "cierre oficial del BCRP";
// La meta description debe quedar entre 140 y 160 caracteres: versión corta de la etiqueta.
const etiquetaCierreCorta = fuenteUltimoCierre === "SUNAT" ? "cierre SBS (vía SUNAT)" : etiquetaCierre;

// Rangos de corto plazo: manana (h3) y semana (h7)
const manana = penDaily.manana;
const semana = penDaily.semana;

const mananaP10 = manana.p10;
const mananaP25 = manana.p25;
const mananaP50 = manana.p50;
const mananaP75 = manana.p75;
const mananaP90 = manana.p90;
const mananaAnchoPct = manana.ancho_banda_pct;
const mananaCoberturaFuera = manana.backtest.cobertura_80_fuera_muestra;
const mananaCortes = manana.backtest.cortes_evaluados;

const semanaP10 = semana.p10;
const semanaP25 = semana.p25;
const semanaP50 = semana.p50;
const semanaP75 = semana.p75;
const semanaP90 = semana.p90;
const semanaAnchoPct = semana.ancho_banda_pct;
const semanaCoberturaFuera = semana.backtest.cobertura_80_fuera_muestra;
const semanaCortes = semana.backtest.cortes_evaluados;

// 1b. Pronóstico mensual: el mismo que sirve la web (endpoint público), nunca cifras escritas a mano
let forecastMensual = null;
try {
  const r = await fetch('https://perdata.site/api/forecast?symbol=PEN=X&horizon=1', { signal: AbortSignal.timeout(15000) });
  if (r.ok) forecastMensual = await r.json();
} catch (error) {
  console.warn(`Aviso: no se pudo leer el pronóstico mensual (${error.message}).`);
}
if (!forecastMensual || !forecastMensual.quantiles) {
  console.error('Sin pronóstico mensual: no se genera dolar.html (mejor la versión anterior que cifras inventadas).');
  process.exit(1);
}
const serieMensual = { ...forecastMensual.quantiles, date: forecastMensual.horizonDate };
const calibracionMensual = forecastMensual.calibration || {};
const mesP10 = serieMensual.p10;
const mesP25 = serieMensual.p25;
const mesP50 = serieMensual.p50;
const mesP75 = serieMensual.p75;
const mesP90 = serieMensual.p90;
const mesFechaObjetivo = serieMensual.date;
const mesAnchoPct = Math.abs((mesP90 - mesP10) / mesP50) * 100;
const mesCobertura = Number(calibracionMensual.coverage80) || null;
const mesN = calibracionMensual.n;

// 1c. bcrp-daily.json -> ultimos 20 cierres oficiales y resumen 2026
const bcrpDaily = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'official', 'bcrp-daily.json'), 'utf8')
);
const penSeries = bcrpDaily.series.PEN.serie;

const ultimos20 = penSeries.slice(-20).map(([fecha, cierre]) => ({ fecha, cierre }));
const fechaProvisional = bcrpDaily.series.PEN.provisional?.fecha || null; // cierre adelantado por SUNAT
for (let i = 1; i < ultimos20.length; i++) {
  const anterior = ultimos20[i - 1].cierre;
  const cambio = ultimos20[i].cierre - anterior;
  ultimos20[i].variacion = cambio;
  ultimos20[i].variacionPct = (cambio / anterior) * 100;
}
ultimos20[0].variacion = null;
ultimos20[0].variacionPct = null;

const serie2026 = penSeries.filter(([fecha]) => fecha.startsWith('2026'));
const ruedas2026 = serie2026.length;
const primerCierre2026 = serie2026[0][1];
const fechaPrimerCierre2026 = serie2026[0][0];
const ultimoCierreSerie2026 = serie2026[serie2026.length - 1][1];
const fechaUltimoCierreSerie2026 = serie2026[serie2026.length - 1][0];
const minimo2026 = serie2026.reduce((acc, [f, v]) => (v < acc.valor ? { fecha: f, valor: v } : acc), { fecha: serie2026[0][0], valor: serie2026[0][1] });
const maximo2026 = serie2026.reduce((acc, [f, v]) => (v > acc.valor ? { fecha: f, valor: v } : acc), { fecha: serie2026[0][0], valor: serie2026[0][1] });
const variacionAnualSol = ultimoCierreSerie2026 - primerCierre2026;
const variacionAnualPct = (variacionAnualSol / primerCierre2026) * 100;

// 1d. bcrp-contexto.json -> series oficiales macro y monetarias
const bcrpContexto = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'official', 'bcrp-contexto.json'), 'utf8')
);

// Ultima observacion disponible de cada serie oficial
const ultimoValor = (clave) => {
  const serie = bcrpContexto.series[clave];
  if (!serie || !Array.isArray(serie.serie) || serie.serie.length === 0) return null;
  const [fecha, valor] = serie.serie[serie.serie.length - 1];
  return { codigo: serie.codigo, descripcion: serie.descripcion, unidad: serie.unidad, valor, fecha };
};

const indicadores = [
  { clave: 'RIN', nombre: 'Reservas Internacionales Netas', ...ultimoValor('RIN') },
  { clave: 'POSICION_CAMBIO', nombre: 'Posicion de Cambio', ...ultimoValor('POSICION_CAMBIO') },
  { clave: 'TASA_REFERENCIA', nombre: 'Tasa de Referencia', ...ultimoValor('TASA_REFERENCIA') },
  { clave: 'INTERVENCION_BCRP', nombre: 'Intervencion cambiaria total', ...ultimoValor('INTERVENCION_BCRP') },
  { clave: 'COMPRAS_MESA_NEGOCIACION', nombre: 'Mesa de negociacion (compras)', ...ultimoValor('COMPRAS_MESA_NEGOCIACION') },
  { clave: 'SWAPS_CAMBIARIOS_NETOS', nombre: 'Swaps cambiarios netos', ...ultimoValor('SWAPS_CAMBIARIOS_NETOS') },
  { clave: 'CDR_EMITIDO', nombre: 'CDR emitido', ...ultimoValor('CDR_EMITIDO') },
  { clave: 'SWAP_VENTA_PACTADO', nombre: 'Swaps de venta pactados', ...ultimoValor('SWAP_VENTA_PACTADO') },
  { clave: 'INFLACION_ANUAL', nombre: 'Inflacion anual (IPC)', ...ultimoValor('INFLACION_ANUAL') },
  { clave: 'INFLACION_SUBYACENTE', nombre: 'Inflacion subyacente', ...ultimoValor('INFLACION_SUBYACENTE') },
  { clave: 'TERMINOS_INTERCAMBIO_VAR12M', nombre: 'Terminos de intercambio (var. 12 meses)', ...ultimoValor('TERMINOS_INTERCAMBIO_VAR12M') },
  { clave: 'COBRE_EXPORTACION', nombre: 'Cobre de exportacion', ...ultimoValor('COBRE_EXPORTACION') },
].filter((ind) => ind.codigo);

const porClave = (clave) => indicadores.find((ind) => ind.clave === clave);

const rin = porClave('RIN');
const posicionCambio = porClave('POSICION_CAMBIO');
const tasaReferencia = porClave('TASA_REFERENCIA');
const intervencion = porClave('INTERVENCION_BCRP');
const mesaNegociacion = porClave('COMPRAS_MESA_NEGOCIACION');
const swapsNetos = porClave('SWAPS_CAMBIARIOS_NETOS');
const cdrEmitido = porClave('CDR_EMITIDO');
const swapVentaPactado = porClave('SWAP_VENTA_PACTADO');
const inflacionAnual = porClave('INFLACION_ANUAL');
const inflacionSubyacente = porClave('INFLACION_SUBYACENTE');
const terminosVar12m = porClave('TERMINOS_INTERCAMBIO_VAR12M');
const cobreExportacion = porClave('COBRE_EXPORTACION');

// ---- 2. Helpers de formato ----

const nf = (decimales = 2) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const num = (valor, decimales = 2) => (typeof valor === 'number' && Number.isFinite(valor) ? nf(decimales).format(valor) : 's/d');

const pct = (valor, decimales = 2) => (typeof valor === 'number' && Number.isFinite(valor) ? `${nf(decimales).format(valor)}%` : 's/d');

const fechaLarga = (iso) => {
  if (!iso || typeof iso !== 'string') return 's/d';
  const partes = iso.split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  if (partes.length === 3) return `${Number(partes[2])} de ${meses[Number(partes[1]) - 1]} de ${partes[0]}`;
  if (partes.length === 2) return `${meses[Number(partes[1]) - 1]} de ${partes[0]}`;
  return iso;
};

const escapeHtml = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caracter]);

// Formatea el valor de un indicador oficial con su unidad
const valorIndicador = (ind) => {
  if (!ind || typeof ind.valor !== 'number') return 's/d';
  if (ind.clave === 'TASA_REFERENCIA') return pct(ind.valor, 2);
  if (ind.clave === 'INFLACION_ANUAL' || ind.clave === 'INFLACION_SUBYACENTE') return pct(ind.valor, 2);
  if (ind.clave === 'TERMINOS_INTERCAMBIO_VAR12M') return `${ind.valor >= 0 ? '+' : ''}${nf(2).format(ind.valor)}%`;
  if (ind.clave === 'COBRE_EXPORTACION') return `${nf(2).format(ind.valor)} centimos US$/lb`;
  return nf(2).format(ind.valor);
};

// ---- 3. Tarjetas de rangos probables ----

const tarjetaRango = ({ titulo, subtitulo, fechaObjetivo, p10, p25, p50, p75, p90, anchoPct, cobertura, cortes, extra }) => `
      <article class="pd-range-card">
        <p class="micro-label text-ink-soft">${escapeHtml(titulo)}</p>
        <p class="pd-range-target">${escapeHtml(subtitulo)} · ${escapeHtml(fechaObjetivo)}</p>
        <p class="pd-range-p50">S/ ${num(p50, 4)}</p>
        <p class="pd-range-caption">Mediana del pronostico (P50)</p>
        <dl class="pd-range-grid">
          <div><dt>P10</dt><dd>S/ ${num(p10, 4)}</dd></div>
          <div><dt>P25</dt><dd>S/ ${num(p25, 4)}</dd></div>
          <div><dt>P75</dt><dd>S/ ${num(p75, 4)}</dd></div>
          <div><dt>P90</dt><dd>S/ ${num(p90, 4)}</dd></div>
        </dl>
        <p class="pd-range-meta">Ancho de banda P10-P90: ${pct(anchoPct, 2)}</p>
        <p class="pd-range-meta">Cobertura empirica fuera de muestra: ${pct(cobertura, 2)} sobre ${num(cortes, 0)} cortes</p>
        ${extra ? `<p class="pd-range-meta">${extra}</p>` : ''}
      </article>`;

const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'long', timeZone: 'UTC' });

const tarjetaManana = tarjetaRango({
  titulo: 'Mañana',
  subtitulo: diaSemana(manana.fecha_objetivo),
  fechaObjetivo: fechaLarga(manana.fecha_objetivo),
  p10: mananaP10,
  p25: mananaP25,
  p50: mananaP50,
  p75: mananaP75,
  p90: mananaP90,
  anchoPct: mananaAnchoPct,
  cobertura: mananaCoberturaFuera,
  cortes: mananaCortes,
});

const tarjetaSemana = tarjetaRango({
  titulo: 'Proxima semana',
  subtitulo: diaSemana(semana.fecha_objetivo),
  fechaObjetivo: fechaLarga(semana.fecha_objetivo),
  p10: semanaP10,
  p25: semanaP25,
  p50: semanaP50,
  p75: semanaP75,
  p90: semanaP90,
  anchoPct: semanaAnchoPct,
  cobertura: semanaCoberturaFuera,
  cortes: semanaCortes,
});

const tarjetaMes = tarjetaRango({
  titulo: 'Proximo mes',
  subtitulo: 'motor mensual precalculado',
  fechaObjetivo: fechaLarga(mesFechaObjetivo),
  p10: mesP10,
  p25: mesP25,
  p50: mesP50,
  p75: mesP75,
  p90: mesP90,
  anchoPct: mesAnchoPct,
  cobertura: mesCobertura,
  cortes: mesN,
  extra: 'Cobertura de calibracion del motor mensual',
});

// ---- 4. Tabla de los ultimos 20 cierres ----

const filasCierres = ultimos20
  .slice()
  .reverse()
  .map(
    (fila) => `
            <tr>
              <td class="mono tnum">${escapeHtml(fila.fecha)}${fila.fecha === fechaProvisional ? ' <span class="text-ink-soft">(SUNAT)</span>' : ''}</td>
              <td class="mono tnum">${num(fila.cierre, 4)}</td>
              <td class="mono tnum ${fila.variacion > 0 ? 'text-pos' : fila.variacion < 0 ? 'text-neg' : ''}">${fila.variacion === null ? 's/d' : (fila.variacion > 0 ? '+' : '') + num(fila.variacion, 4)}</td>
              <td class="mono tnum ${fila.variacionPct > 0 ? 'text-pos' : fila.variacionPct < 0 ? 'text-neg' : ''}">${fila.variacionPct === null ? 's/d' : (fila.variacionPct > 0 ? '+' : '') + pct(fila.variacionPct, 2)}</td>
            </tr>`
  )
  .join('');

// ---- 5. Panel de indicadores oficiales ----

const filasIndicadores = indicadores
  .map(
    (ind) => `
            <tr>
              <td>${escapeHtml(ind.nombre)}</td>
              <td class="mono">${escapeHtml(ind.codigo)}</td>
              <td class="mono tnum">${escapeHtml(valorIndicador(ind))}</td>
              <td class="mono">${escapeHtml(ind.unidad)}</td>
              <td class="mono tnum">${escapeHtml(ind.fecha)}</td>
            </tr>`
  )
  .join('');

// ---- 6. Texto explicativo propio (700-1000 palabras visibles) ----

// Preguntas frecuentes: fuente unica del <dl> visible y del JSON-LD FAQPage.
// Se escriben con acentos porque el pipeline de acentos no modifica los bloques <script>.
const faqItems = [
  {
    q: "¿Por qué el dólar sube o baja con tanta rapidez?",
    a: "Porque el precio del dólar en el Perú es un precio de flujo: se ajusta rápido ante cambios en la oferta de divisas de los exportadores y ante la demanda de dólares de importadores e inversionistas. Un día de cobre favorable o un anuncio de la Reserva Federal puede mover el precio en la sesión, sin que cambie el panorama de fondo.",
  },
  {
    q: "¿Qué significa exactamente la cobertura del 80% fuera de muestra?",
    a: "Que, al probar el modelo con períodos que no usó para ajustarse, el intervalo entre P10 y P90 contuvo el cierre real en cerca del 80% de los cortes evaluados. Es una medida honesta de error, distinta de la cobertura sobre los mismos datos con los que se calibró el modelo.",
  },
  {
    q: "¿El P50 va a ser el precio del cierre del día?",
    a: `No necesariamente. El P50 es la mediana de la distribución y suele coincidir con el último cierre cuando el modelo no detecta una tendencia que perdura, como en los pronósticos de corto plazo publicados hoy, donde el P50 coincide con el cierre de ${num(ultimoCierre, 4)} S/ del ${fechaUltimoCierre}. Cuando el P50 se aparta del último cierre, la separación es la señal de que el modelo detecta una deriva.`,
  },
  {
    q: "¿El rango mensual y el rango semanal no son el mismo pronóstico, verdad?",
    a: `Son modelos distintos con horizontes distintos. El pronóstico diario y semanal se construye con simulación histórica filtrada sobre la serie de cierres del BCRP; el pronóstico mensual proviene del motor mensual precalculado, con su propia calibración (${pct(mesCobertura, 2)} sobre ${num(mesN, 0)} observaciones) y una trayectoria de tres meses. No se deben sumar ni comparar percentil por percentil entre horizontes distintos.`,
  },
  {
    q: "¿Con qué frecuencia se actualiza esta página?",
    a: `La página se genera de forma automática cuando termina la corrida diaria del PerData Engine: los cierres oficiales del BCRP, los pronósticos de corto plazo y el contexto macro se leen de los archivos de datos del proyecto y se vuelven a renderizar sin intervención manual. Por eso el último cierre que se muestra aquí es el del ${fechaUltimoCierre}, con fecha ${fechaLarga(fechaUltimoCierre)}.`,
  },
];

const faqHtml = faqItems
  .map((item) => `            <dt>${escapeHtml(item.q)}</dt>\n            <dd>${escapeHtml(item.a)}</dd>`)
  .join("\n");

const textoExplicativo = `
        <section class="pd-prose">
          <h2>Que mueve el dolar en el Peru</h2>
          <p>
            El tipo de cambio del sol peruano se mueve, en el corto plazo, por cuatro fuerzas que se
            empujan entre si. La primera es el precio del cobre. Peru es uno de los mayores exportadores
            de metal rojo del mundo y, por eso, cada movimiento del cobre en Londres se traslada al
            mercado local: cuando el cobre sube, los exportadoresryth receive mas dolares por libra y
            la oferta de divisas en el mercado interbancario aumenta, lo que tiende a<void depreciar el sol.
            La segunda son los terminos de intercambio, que miden el precio de nuestras exportaciones
           相对于 los precios de nuestras importaciones. Con los terminos de intercambioGrowing ${pct(terminosVar12m ? terminosVar12m.valor : 0, 2)} en los doce meses hasta ${escapeHtml(fechaLarga(terminosVar12m ? terminosVar12m.fecha : ''))} y el cobre de exportacion en
            ${escapeHtml(valorIndicador(cobreExportacion))}, el pais exporta mas valor real por cada
            unidad que importa, y esa diferencia sostiene la posicion competitiva del sol.
          </p>
          <p>
            La tercera fuerza es el diferencial de tasas de interes entre el BCRP y la Reserva Federal.
            Con la tasa de referencia en ${escapeHtml(valorIndicador(tasaReferencia))} anual a fecha
            ${escapeHtml(tasaReferencia ? tasaReferencia.fecha : 's/d')}, el carry local define si el capital
            internacional entra o sale del Peru. Un diferencial favorable sostiene la demanda de soles;
            uno negativo hace lo contrario. La cuarta, y mas lenta, es la cuenta corriente: el deficit o
            superavit estructural de la economia define la presion de fondo sobre el tipo de cambio, y se
            ajusta con anos, no con semanas.
          </p>

          <h2>Como interviene el BCRP</h2>
          <p>
            Peru tiene un regimen de flotacion administrada. El Banco Central de Reserva del Peru no fija
            un tipo de cambio, pero acepta que el mercado estable y con liquidez es una condicion
            necessaria para el buen funcionamiento de la politica monetaria. Para ello dispone de
            reservas internacionales netas de ${escapeHtml(num(rin ? rin.valor : 0, 2))} millones de dolares
            (${escapeHtml(rin ? rin.fecha : 's/d')}), que funcionan como colchon de seguridad y como
            respaldo de la credibilidad cambiaria del pais. Ademas, su posicion de cambio asciende a
            ${escapeHtml(num(posicionCambio ? posicionCambio.valor : 0, 2))} millones de dolares
            (${escapeHtml(posicionCambio ? posicionCambio.fecha : 's/d')}).
          </p>
          <p>
            La intervencion diaria ocurre en la mesa de negociacion de divisas, donde el BCRP compra o
            vende dolares en el mercado spot. La serie de intervencion cambiaria total registra
            ${escapeHtml(num(intervencion ? intervencion.valor : 0, 2))} millones de dolares en
            ${escapeHtml(intervencion ? intervencion.fecha : 's/d')}, y la mesa de negociacion reporta
            compras netas por ${escapeHtml(num(mesaNegociacion ? mesaNegociacion.valor : 0, 2))} millones
            de dolares en la misma fecha. Los swaps cambiarios de venta son la segunda herramienta:
            el BCRP vende dolares a plazo y recibe soles, con swaps de venta pactados por
            ${escapeHtml(num(swapVentaPactado ? swapVentaPactado.valor : 0, 2))} millones de dolares
            (${escapeHtml(swapVentaPactado ? swapVentaPactado.fecha : 's/d')}); el saldo neto de swaps
            cambiarios fue de ${escapeHtml(num(swapsNetos ? swapsNetos.valor : 0, 2))} millones y el CDR
            emitido de ${escapeHtml(num(cdrEmitido ? cdrEmitido.valor : 0, 2))} millones. Los CDR
            (certificados de deposito reajustables) captan soles del sistema bancario para drenar
            liquidez, y los swaps hace lo mismo pero con dolares como underlying. En conjunto, estas
            herramientas permiten que el BCRP modere la volatilidad sin abandonar el浮动 cambiario.
          </p>

          <h2>Como leer un rango probable</h2>
          <p>
            Un rango probable no es un precio objetivo: es una distribucion. El P10 es el percentil 10,
            es decir el valor que el cierre supera en ocho de cada diez observaciones comparables; el P50
            es la mediana, el valor con la mayor densidad de probabilidad; el P90 es el percentil 90, el
            valor que el cierre no supera en ocho de cada diez observaciones. Por eso el intervalo P10-P90
            esta calibrado para cubrir cerca del 80% de los casos, no el 100%.
          </p>
          <p>
            La validacion importa mas que el numero. El motor se evalua con cortes fuera de muestra:
            cortes de tiempo que nunca vio durante el calibracion. Para el horizonte de manana la cobertura
            empirica fue de ${pct(mananaCoberturaFuera, 2)} sobre ${num(mananaCortes, 0)} cortes; para la
            semana, ${pct(semanaCoberturaFuera, 2)} sobre ${num(semanaCortes, 0)} cortes; y el motor
            mensual entrega una cobertura de calibracion de ${pct(mesCobertura, 2)} sobre ${num(mesN, 0)}
            observaciones. Cuando la cobertura empirica se acerca a la cobertura nominal, el rango tiene
            poder predictivo y no solo describe el pasado. El ancho de banda tambien comunica incertidumbre:
            hoy el rango de manana abarca ${pct(mananaAnchoPct, 2)} y el de la semana
            ${pct(semanaAnchoPct, 2)}, porque a mayor horizonte la incertidumbre acumulada crece de forma
            monotona.
          </p>

          <h2>Que no es una proyeccion</h2>
          <p>
            Esta pagina no es asesoria financiera y no es una recomendacion de compra o venta. Un rango
            probable describe una frecuencia historica, no una promesa: el cierre real puede quedar fuera
            del intervalo. Los percentiles se calculan sobre la volatilidad pasada y por eso pueden
            quedarse cortos ante eventos de cola, como una ruptura de regimen de política monetaria, un
            choque de precios del cobre, una crisis politica o un evento internacional que rompa las
            correlaciones habituales. A esos eventos se les suele llamar cisnes negros y son, por
            definicion, los que ninguna frecuencia historica anticipa con precision. Los datos que se
            muestran provienen del BCRP y del PerData Engine, con su codigo de serie y su fecha, para que
            cualquiera pueda verificarlos.
          </p>

          <h2>Preguntas frecuentes</h2>
          <dl class="pd-faq-list">
${faqHtml}
          </dl>
        </section>`;

// ---- 6b. JSON-LD: FAQPage con las preguntas reales y Dataset con la serie oficial del BCRP ----

const ldJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

const penSerie = bcrpDaily.series.PEN;
const primeraFechaSerie = penSerie.serie[0][0];
const ultimaFechaSerie = penSerie.serie[penSerie.serie.length - 1][0];

const datasetLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: `Tipo de cambio oficial del sol peruano frente al dólar (serie diaria ${penSerie.codigo} del BCRP)`,
  description: `Serie diaria del tipo de cambio de cierre publicado por el ${bcrpDaily.fuente}, en ${penSerie.unidad}. ${bcrpDaily.licencia}.`,
  url: "https://perdata.site/dolar",
  license: { "@type": "CreativeWork", name: bcrpDaily.licencia, url: bcrpDaily.url },
  creator: { "@type": "Organization", name: "Banco Central de Reserva del Perú", url: bcrpDaily.url },
  temporalCoverage: `${primeraFechaSerie}/${ultimaFechaSerie}`,
  variableMeasured: {
    "@type": "PropertyValue",
    name: "Tipo de cambio de cierre PEN/USD",
    unitText: penSerie.unidad,
    codeValue: penSerie.codigo,
  },
  distribution: [
    {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/${penSerie.codigo}/json/${primeraFechaSerie}/${ultimaFechaSerie}`,
    },
  ],
};

const faqLdScript = `  <script type="application/ld+json">${ldJson(faqLd)}</script>`;
const datasetLdScript = `  <script type="application/ld+json">${ldJson(datasetLd)}</script>`;
// ---- 6b. Bloque de invitacion al boletin (estatico, sin pop-ups) ----

const bloqueBoletin = `
    <section class="mt-12 border-t border-rule pt-8" aria-label="Boletin diario">
      <p class="micro-label text-ink-soft">Boletin diario</p>
      <h2 class="pd-section-title" style="margin-top: 8px;">El dolar cada manana en tu correo</h2>
      <p class="pd-boletin-cta-text">
        Recibe gratis cada manana el correo del dolar para el proximo dia habil: su rango probable, tres noticias y una lectura de que podria moverlo. El plan Boletin (US$ 1.99 al mes o 15 al ano) trae el resto del dia y tus empresas.
      </p>
      <p class="mt-4 mb-0"><a href="/boletin" class="pdl-btn pdl-btn-secondary no-underline">Ver el boletin y suscribirte</a></p>
    </section>`;

// ---- 7. HTML ----

let htmlGenerado = `<!DOCTYPE html>
<html lang="es-PE" class="light">
<head>
  <meta name="pd-ads" content="1">
  <meta name="pd-geo" content="otro">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="pd-ads" content="1">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://perdata.site/dolar">
  <title>Tipo de cambio hoy en Perú: S/ ${num(ultimoCierre, 3)} y rango para mañana · PerData</title>
  <meta name="description" content="Precio del dólar hoy en Perú: ${etiquetaCierreCorta} de S/ ${num(ultimoCierre, 3)} (${fechaLarga(fechaUltimoCierre)}). Para el ${diaSemana(manana.fecha_objetivo)}, entre S/ ${num(mananaP10, 3)} y S/ ${num(mananaP90, 3)} (8 de cada 10 veces).">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">

  <!-- Tipografias auto-alojadas: Source Serif 4, Libre Franklin, IBM Plex Mono -->
  <link rel="preload" href="/fonts/source-serif-4.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/libre-franklin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/pd.css">
  <link rel="stylesheet" href="/tw.css">

  <style>
    .pd-range-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px 14px;
      margin: 18px 0 14px;
      padding: 14px 0;
      border-top: 1px solid var(--pd-rule);
      border-bottom: 1px solid var(--pd-rule);
    }
    .pd-range-grid dt { font: 700 9px/1 var(--pd-font-ui); letter-spacing: .09em; text-transform: uppercase; color: var(--pd-ink-soft); }
    .pd-range-grid dd { margin: 5px 0 0; font: 600 13px/1.2 var(--pd-font-mono); color: var(--pd-ink); font-variant-numeric: tabular-nums; }
    .pd-range-p50 { font: 500 clamp(30px, 5vw, 40px)/1.05 var(--pd-font-read); letter-spacing: -.02em; color: var(--pd-ink); margin: 6px 0 2px; }
    .pd-range-caption { font: 500 11px/1.3 var(--pd-font-ui); color: var(--pd-ink-soft); }
    .pd-range-target { font: 500 12px/1.4 var(--pd-font-ui); color: var(--pd-ink-soft); }
    .pd-range-meta { font: 500 11.5px/1.45 var(--pd-font-mono); color: var(--pd-ink-soft); font-variant-numeric: tabular-nums; }
    .pd-range-card { padding: 20px 0 22px; border-top: 2px solid var(--pd-ink); }
    .pd-range-card .pdl-chip { display: inline-block; }
    .pd-faq-list dt { font: 600 15px/1.35 var(--pd-font-ui); color: var(--pd-ink); margin: 22px 0 6px; }
    .pd-faq-list dd { margin: 0 0 10px; font: 400 15px/1.65 var(--pd-font-read); color: var(--pd-ink-soft); }
    .pd-prose h2 { font: 600 22px/1.25 var(--pd-font-read); color: var(--pd-ink); margin: 34px 0 10px; }
    .pd-prose p { margin: 0 0 14px; font: 400 16px/1.7 var(--pd-font-read); color: var(--pd-ink); }
    .pd-fact-table td, .pd-fact-table th { white-space: nowrap; }
    .pd-fact-table td:first-child { white-space: normal; }
    .pd-boletin-cta-text { margin: 0; font: 400 16px/1.7 var(--pd-font-read); color: var(--pd-ink); max-width: 60ch; }
    @media (max-width: 560px) { .pd-range-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
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
<body class="bg-paper text-ink min-h-screen antialiased transition-colors duration-200 flex flex-col justify-between">
  <header class="border-b border-rule bg-card sticky top-0 z-30 transition-colors">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between relative">
      <div class="flex items-center space-x-6">
        <a href="/" class="flex items-center space-x-2.5 text-inherit no-underline"><span class="pd-wordmark">PerData<span class="pd-flag" role="img" aria-label="Peru"><b></b><b></b><b></b></span></span></a>
        <nav class="hidden md:flex items-center space-x-5 text-xs font-medium text-ink-soft" aria-label="Navegacion principal">
          <a href="/dolar" class="text-ink font-semibold border-b border-ink pb-0.5 no-underline" aria-current="page">Dolar</a>
          <a href="/explorer" class="hover:text-ink transition no-underline">Terminal</a>
          <a href="/empresas" class="hover:text-ink transition no-underline">Empresas</a>
          <a href="/mercado" class="hover:text-ink transition no-underline">Mercado</a>
          <a href="/noticias" class="hover:text-ink transition no-underline">Noticias</a>
          <a href="/metodologia" class="hover:text-ink transition no-underline">Metodologia</a>
          <a href="/guia" class="hover:text-ink transition no-underline">Guia</a>
          <a href="/boletin" class="hover:text-ink transition no-underline">Boletin</a>
          <a href="/precios" class="hover:text-ink transition no-underline">Precios</a>
        </nav>
      </div>
      <div class="flex items-center space-x-2 sm:space-x-3"><div id="navbarAuthContainer"></div><label class="ui-switch" title="Alternar modo claro / oscuro"><input id="themeToggle" type="checkbox" aria-label="Modo oscuro" /><div class="slider"><div class="circle"></div></div></label><button id="mobileMenuBtn" class="md:hidden inline-flex items-center justify-center w-8 h-8 rounded border border-rule text-ink-soft hover:text-ink transition" aria-label="Abrir menu" aria-expanded="false"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>
    </div>
    <div id="mobileMenu" class="hidden md:hidden border-t border-rule bg-card px-4 py-3 transition-colors"><nav class="flex flex-col py-2 text-xs font-medium space-y-2 text-ink-soft" aria-label="Menu movil">
          <a href="/dolar" class="text-ink font-semibold py-1 no-underline" aria-current="page">Dolar</a>
          <a href="/explorer" class="hover:text-ink py-1 no-underline">Terminal</a>
          <a href="/empresas" class="hover:text-ink py-1 no-underline">Empresas</a>
          <a href="/mercado" class="hover:text-ink py-1 no-underline">Mercado</a>
          <a href="/noticias" class="hover:text-ink py-1 no-underline">Noticias</a>
          <a href="/metodologia" class="hover:text-ink py-1 no-underline">Metodologia</a>
          <a href="/guia" class="hover:text-ink py-1 no-underline">Guia</a>
          <a href="/boletin" class="hover:text-ink py-1 no-underline">Boletin</a>
          <a href="/precios" class="hover:text-ink py-1 no-underline">Precios</a>
        </nav></div>
  </header>

  <main class="pd-data-main max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
    <section class="space-y-3">
      <p class="micro-label text-ink-soft">Banco Central de Reserva del Peru · serie ${escapeHtml(penDaily.codigo)}</p>
      <h1 class="pd-page-title">Tipo de cambio hoy en Perú</h1>
      <p class="pd-page-lede">
        ${escapeHtml(etiquetaCierre.charAt(0).toUpperCase() + etiquetaCierre.slice(1))} de ${escapeHtml(num(ultimoCierre, 4))} S/ por dolar, del
        ${escapeHtml(fechaLarga(fechaUltimoCierre))}, con rangos probables para manana, la proxima semana
        y el proximo mes, y el contexto macro y monetario que reporta el BCRP.
      </p>
    </section>

    <section class="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-8 mt-10" aria-label="Rangos probables">
      ${tarjetaManana}
      ${tarjetaSemana}
      ${tarjetaMes}
    </section>

    <section class="mt-10">
      <p class="pd-fineprint">Notas semanales: <a href="/semana" class="hover:text-ink transition no-underline">el resumen de cada semana cerrada, con el recorrido del dolar, la intervencion del BCRP y el rango frente al cierre real</a>.</p>
    </section>

    <section class="mt-12">
      <h2 class="pd-section-title">Resumen de 2026</h2>
      <dl class="pd-dl">
        <div><dt>Ruedas cotizadas</dt><dd>${num(ruedas2026, 0)}</dd></div>
        <div><dt>Primer cierre</dt><dd>${num(primerCierre2026, 3)} S/ · ${escapeHtml(fechaPrimerCierre2026)}</dd></div>
        <div><dt>Ultimo cierre</dt><dd>${num(ultimoCierreSerie2026, 3)} S/ · ${escapeHtml(fechaUltimoCierreSerie2026)}</dd></div>
        <div><dt>Minimo del ano</dt><dd>${num(minimo2026.valor, 3)} S/ · ${escapeHtml(minimo2026.fecha)}</dd></div>
        <div><dt>Maximo del ano</dt><dd>${num(maximo2026.valor, 3)} S/ · ${escapeHtml(maximo2026.fecha)}</dd></div>
        <div><dt>Variacion acumulada</dt><dd>${variacionAnualPct >= 0 ? '+' : ''}${pct(variacionAnualPct, 2)} · ${variacionAnualSol >= 0 ? '+' : ''}${num(variacionAnualSol, 3)} S/</dd></div>
      </dl>
    </section>

    <section class="mt-12">
      <h2 class="pd-section-title">Ultimos 20 cierres oficiales</h2>
      <div class="overflow-x-auto">
        <table class="pd-fact-table w-full">
          <thead>
            <tr>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Fecha</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Cierre (S/)</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Variacion (S/)</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Variacion (%)</th>
            </tr>
          </thead>
          <tbody>
            ${filasCierres}
          </tbody>
        </table>
      </div>
      <p class="pd-fineprint">Fuente: Banco Central de Reserva del Peru, serie ${escapeHtml(penDaily.codigo)}. La variacion se calcula contra el cierre oficial anterior.</p>
    </section>

    <section class="mt-12">
      <h2 class="pd-section-title">Contexto macro y monetario oficial (BCRP)</h2>
      <div class="overflow-x-auto">
        <table class="pd-fact-table w-full">
          <thead>
            <tr>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Variable</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Serie</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Valor</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Unidad</th>
              <th class="text-left py-2 px-3 border-b border-rule text-xs font-semibold text-ink-soft">Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${filasIndicadores}
          </tbody>
        </table>
      </div>
      <p class="pd-fineprint">Fuente: Banco Central de Reserva del Peru, estadisticas macroeconomicas y monetarias. Ultima observacion disponible por serie.</p>
    </section>

    ${textoExplicativo}

    ${bloqueBoletin}
  </main>

  <footer class="border-t border-rule bg-card py-8 px-4">
    <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-ink-soft">
      <a href="/" class="pd-wordmark no-underline">PerData<span class="pd-flag" aria-hidden="true"><b></b><b></b><b></b></span></a>
      <nav class="flex flex-wrap gap-5" aria-label="Navegacion secundaria">
        <a href="/noticias">Noticias</a><a href="/resumenes">Archivo de resumenes</a><a href="/mercado">Mercado</a><a href="/dolar">Dolar</a><a href="/semana">Notas semanales</a><a href="/estado">Estado</a><a href="/nosotros" class="hover:text-ink transition no-underline">Quienes somos</a>
          <a href="/privacidad">Privacidad</a>
          <a href="/contacto">Contacto</a>
          <a href="/politica-editorial">Política editorial</a>
          <a href="#cookies" class="pd-cookies-link hover:text-ink transition no-underline" data-open-cookies>Cookies</a>
      </nav>
    </div>
  </footer>

  <script>
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
  <script src="/auth.js" defer></script>
</body>
</html>`;

// ---- 8. Escritura ----

const outputPath = path.join(rootDir, 'dolar.html');
// The page text was written without accents; restore them in visible text and meta descriptions only
// (never inside tags, links or attribute names), so every regeneration comes out right
const ACENTOS = {
  boletin: 'boletín', detras: 'detrás', dia: 'día', lunes: 'lunes',
  peru: 'perú', guia: 'guía',
  dias: 'días', dia: 'día', detras: 'detrás', boletin: 'boletín',
  habiles: 'hábiles', habil: 'hábil', manana: 'mañana', proxima: 'próxima', proximo: 'próximo',
  ultimo: 'último', ultimos: 'últimos', ultima: 'última', ultimas: 'últimas', ano: 'año', anos: 'años',
  pronostico: 'pronóstico', pronosticos: 'pronósticos', empirica: 'empírica', empirico: 'empírico',
  calibracion: 'calibración', minimo: 'mínimo', maximo: 'máximo', dolar: 'dólar', dolares: 'dólares',
  politica: 'política', interes: 'interés', tambien: 'también', mas: 'más', numero: 'número',
  metodologia: 'metodología', estadisticas: 'estadísticas', estadistica: 'estadística', variacion: 'variación',
  proyeccion: 'proyección', proyecciones: 'proyecciones', intervencion: 'intervención', posicion: 'posición',
  inflacion: 'inflación', terminos: 'términos', deposito: 'depósito', depositos: 'depósitos', senal: 'señal',
  rapido: 'rápido', historica: 'histórica', historico: 'histórico', ademas: 'además', economica: 'económica',
  economico: 'económico', analisis: 'análisis', periodo: 'período', publica: 'pública', publico: 'público',
  credito: 'crédito', cotizacion: 'cotización', evolucion: 'evolución', despues: 'después', tecnica: 'técnica',
  util: 'útil', segun: 'según', informacion: 'información', region: 'región', decision: 'decisión',
  decisiones: 'decisiones', minima: 'mínima', maxima: 'máxima', limite: 'límite', facil: 'fácil',
  podria: 'podría', movidas: 'movería'
};
const conAcentos = (txt) => txt.replace(/[A-Za-z]+/g, (w) => {
  const fixed = ACENTOS[w.toLowerCase()];
  if (!fixed) return w;
  return w[0] === w[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
});
htmlGenerado = htmlGenerado
  .replace(/(<(script|style)[^>]*>[\s\S]*?<\/\2>)|>([^<]+)</g, (m, block, _t, text) => (block ? block : '>' + conAcentos(text) + '<'))
  .replace(/(<meta[^>]+content=")([^"]*)(")/g, (m, a, b, c) => a + conAcentos(b) + c);

// Los bloques JSON-LD se insertan despues del pipeline de acentos para que ningun dato
// dentro de ellos (URLs del BCRP, textos ya con acentos) se altere
htmlGenerado = htmlGenerado.replace(
  '  <link rel="icon" href="/favicon.ico" sizes="any">',
  `${faqLdScript}\n${datasetLdScript}\n  <link rel="icon" href="/favicon.ico" sizes="any">`
);

fs.writeFileSync(outputPath, htmlGenerado);
console.log(`Escrito ${outputPath}`);

if (fs.existsSync(publicDir)) {
  const publicPath = path.join(publicDir, 'dolar.html');
  fs.writeFileSync(publicPath, htmlGenerado);
  console.log(`Escrito ${publicPath}`);
}

console.log('build-dolar-html.js finished successfully');
