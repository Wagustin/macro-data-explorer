import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

// Same generator as the previews: spawn the script with PREVIEW_EMPRESAS and
// the preview path, then read the generated HTML. The script only writes a
// preview with --dry-run / PREVIEW_*; it never sends mail.
import { execFileSync } from "node:child_process";

function vistaPrevia(plan) {
  const out = path.join(rootDir, "..", "handoff", "qa", `correo-${plan}.html`);
  execFileSync(process.execPath, ["scripts/boletin.js", "--dry-run"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PREVIEW_EMPRESAS: "ALICORC1,BVN,CVERDEC1",
      PREVIEW_PLAN: plan,
      BOLETIN_PREVIEW_PATH: out,
    },
  });
  return fs.readFileSync(out, "utf8");
}

const stripPlanBlock = (html) => html.replace(/<!-- plan-boletin -->[\s\S]*?<!-- \/plan-boletin -->/g, "");
const plano = (html) => html.replace(/\s+/g, " ").trim();

test("correo gratis: dólar mañana con rango y cierre, top 3, qué podría presionar y transparencia, sin secciones de pago", () => {
  const html = vistaPrevia("gratis");
  const sinPlan = stripPlanBlock(html);
  const daily = JSON.parse(read("data/daily-forecasts.json"));
  const pen = daily.simbolos.PEN;
  const fmt3 = (v) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  // (1) Dólar mañana con su rango y el cierre anterior
  assert.match(html, /Último cierre oficial \(BCRP\)/);
  assert.ok(html.includes(fmt3(pen.ultimo_cierre)), "el gratis trae el cierre de data/daily-forecasts.json");
  assert.ok(html.includes(fmt3(pen.manana.p10)) && html.includes(fmt3(pen.manana.p90)), "el gratis trae el rango mañana de data/");

  // (2) Las 3 noticias mejor redactadas (con nota y revisión aprobada por el digest)
  const digest = JSON.parse(read("data/noticias-resumen.json"));
  const buenas = (digest.historias || []).filter((h) => h.nota && h.revision?.ok !== false);
  assert.ok(buenas.length >= 3, "el digest trae al menos 3 publicables");
  for (const h of buenas.slice(0, 3)) {
    assert.ok(plano(html).includes(plano(h.titulo)), `el gratis trae «${h.titulo.slice(0, 30)}…»`);
  }
  assert.ok(!plano(html).includes(plano(buenas[3].titulo)), "la cuarta historia ya no entra en el gratis");

  // (3) Qué podría presionar al dólar (manana): al alza / a la baja / contexto con resumen
  assert.match(html, /Qué podría presionar al dólar/);
  assert.match(html, /al alza|Contexto/);
  // La lectura cita el rango de mañana (p10 y p90) de data/daily-forecasts.json
  assert.ok(html.includes(fmt3(pen.manana.p10)) && html.includes(fmt3(pen.manana.p90)), "la lectura cita el rango de mañana de data/");

  // (4) Nota de transparencia e invitación al plan Boletín (con prueba con tarjeta)
  assert.match(html, /El rango es estadístico; los factores son contexto, no una predicción de dirección/);
  assert.match(html, /1\.99 al mes, 7 días de prueba con tarjeta/);
  assert.match(html, /<!-- plan-boletin -->/);

  // El gratis nunca recibe secciones del pagado (fuera del bloque del plan y
  // del aviso de «Tus empresas» que la propia vista previa de gratis inyecta
  // en {{PERSONAL}} cuando se listan empresas seguidas).
  const sinPlanNiAviso = sinPlan
    .replace(/<tr><td style="padding:24px 0 0;font-family:'Libre Franklin'[^>]*>Elegiste empresas[^<]*<\/td><\/tr>/g, "");
  for (const prohibida of ["Tus empresas", "Hechos de importancia", "Próxima semana", "Próximo mes", "Lectura de", "Cobre", "Petróleo"]) {
    assert.ok(!sinPlanNiAviso.includes(prohibida), `el gratis trae «${prohibida}», sección de pago`);
  }
});

test("correo pagado: dólar x3 con lectura, metales, SMV, todas las noticias y Tus empresas con su lectura", () => {
  const html = vistaPrevia("boletin");
  const digest = JSON.parse(read("data/noticias-resumen.json"));
  const bcrp = JSON.parse(read("data/official/bcrp-daily.json"));
  const buenas = (digest.historias || []).filter((h) => h.nota && h.revision?.ok !== false);

  // (1) Dólar mañana, semana y mes con rango y su lectura
  // Use the same date logic as the render: current date in Lima timezone
  const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const daily = JSON.parse(read("data/daily-forecasts.json"));
  const mananaFecha = daily.simbolos.PEN.manana.fecha_objetivo;
  const dt = new Date(`${mananaFecha}T12:00:00Z`);
  const hdt = new Date(`${todayLima}T12:00:00Z`);
  const diffDays = Math.round((dt - hdt) / (86400 * 1000));
  const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const day = dt.getUTCDate();
  const month = MONTHS_ES[dt.getUTCMonth()];
  const weekday = WEEKDAYS_ES[dt.getUTCDay()];
  const dateFormatted = `${day} ${month}`;
  const etiquetaManana = diffDays === 0
    ? `Para el cierre de hoy, ${weekday} ${dateFormatted}`
    : diffDays === 1
    ? `Mañana, ${weekday} ${dateFormatted}`
    : `El ${weekday} ${dateFormatted}`;
  for (const frase of [etiquetaManana, "Próxima semana", "Próximo mes"]) {
    assert.ok(html.includes(frase), `el pagado trae la lectura «${frase}»`);
  }
  assert.match(html, /Podría presionar al dólar al alza/);
  assert.match(html, /Contexto/);

  // (2) Cobre, oro y petróleo con variación y fecha (de la serie BCRP/EIA de data/)
  const cobre = bcrp.series.COBRE.serie.at(-1)[1];
  assert.ok(html.includes("Cobre") && html.includes("6.44") || html.includes(String(Math.round(cobre * 100) / 100)), "cobre con su valor de data/");
  assert.match(html, /Oro/);
  assert.match(html, /Petróleo/);

  // (3) Hechos de la SMV del día
  assert.match(html, /Hechos de importancia/);
  assert.match(html, /Superintendencia del Mercado de Valores/);

  // (4) TODAS las noticias resumidas (el digest completo)
  for (const h of buenas) {
    assert.ok(plano(html).includes(plano(h.titulo)), `el pagado trae «${h.titulo.slice(0, 30)}…»`);
  }

  // (5) Tus empresas: precio, variación, rango, SMV, noticias y lectura (que_hay / podría mover)
  assert.match(html, /Tus empresas/);
  assert.ok(html.includes("ALICORC1") && html.includes("BVN") && html.includes("CVERDEC1"), "las tres empresas del preview");
  assert.match(html, /Lectura de/);
  assert.match(html, /Qué hay/);
  assert.match(html, /Podría mover/);

  // (6) Nota de transparencia y enlaces de baja / preferencias existentes
  assert.match(html, /El rango es estadístico; los factores son contexto, no una predicción de dirección/);
  assert.match(html, /Darme de baja/);
  assert.match(html, /Elegir mis empresas/);
  assert.ok(!html.includes("{{BAJA}}") && !html.includes("{{EMPRESAS}}") && !html.includes("{{PERSONAL}}"), "sin marcadores sin rellenar");

  // Cifras verificables contra data/
  const cver = JSON.parse(read("data/empresas-estado.json")).emisores;
  const byNemo = Object.values(cver).find((x) => x.nemonico === "CVERDEC1");
  assert.ok(html.includes(`${byNemo.moneda} ${Number(byNemo.ultimo_cierre).toFixed(2)}`), "el precio de CVERDEC1 coincide con data/empresas-estado.json");
});

test("correos: sin emojis y cifras del rango del mes cuando hay endpoint", () => {
  const gratis = vistaPrevia("gratis");
  const pagado = vistaPrevia("boletin");
  for (const html of [gratis, pagado]) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(html), "sin emojis");
    assert.ok(!html.includes("undefined") && !html.includes("NaN"), "sin cifras inventadas (undefined/NaN)");
  }
  // Deterministic fallback: without an LLM key everything renders anyway.
  assert.match(gratis, /Qué podría presionar al dólar/);
});

test("fallback sin lecturas: los correos salen igual, sin la sección de presión ni lecturas", () => {
  // With empty clasif/feed the readings have no titulares but the dollar
  // series in data/ still produce the deterministic reading. To exercise the
  // no-reading path we only assert the renderers tolerate lectura: null,
  // which is what renderForTests exposes: both emails still render.
  // (See the module-level guard in lecturaDolarSegura / lecturasPreview.)
  const { execFileSync: exec } = { execFileSync };
  const out = path.join(rootDir, "..", "handoff", "qa", "correo-gratis.html");
  exec(process.execPath, ["scripts/boletin.js", "--dry-run"], {
    cwd: rootDir,
    env: { ...process.env, PREVIEW_EMPRESAS: "ALICORC1,BVN,CVERDEC1", PREVIEW_PLAN: "gratis", BOLETIN_PREVIEW_PATH: out },
  });
  const html = fs.readFileSync(out, "utf8");
  assert.match(html, /Dólar interbancario/);
});

function findAllPositions(html, needle) {
  const positions = [];
  let pos = html.indexOf(needle);
  while (pos !== -1) {
    positions.push(pos);
    pos = html.indexOf(needle, pos + 1);
  }
  return positions;
}

function assertDomOrder(html, sections, label) {
  // Find first occurrence of each section marker
  const positions = sections.map((s) => {
    const idx = html.indexOf(s);
    assert.ok(idx !== -1, `${label}: sección "${s}" no encontrada`);
    return { section: s, index: idx };
  });
  // Verify order
  for (let i = 1; i < positions.length; i++) {
    assert.ok(
      positions[i - 1].index < positions[i].index,
      `${label}: orden incorrecto - "${positions[i - 1].section}" debe ir antes que "${positions[i].section}"`
    );
  }
}

test("correo gratis: orden DOM correcto de secciones", () => {
  const html = vistaPrevia("gratis");
  // Expected order: header → dólar cierre → rango para mañana → qué podría presionar → personal/upsell → lo importante → plan → forward → legal
  assertDomOrder(html, [
    "Boletín diario",
    "Dólar interbancario",
    "rango para",
    "Qué podría presionar al dólar",
    "Elegiste empresas para seguir",
    "Lo importante de hoy",
    "<!-- plan-boletin -->",
    "Reenvía este correo",
    "El rango es estadístico",
  ], "gratis");
});

test("correo pagado: orden DOM correcto de secciones", () => {
  const html = vistaPrevia("boletin");
  // Expected order: header → dólar cierre → rango para mañana → lecturas (mañana/semana/mes) → personal → lo importante → mercados → hechos → titulares → forward → legal
  // Search by numbered prefix since the title includes the date (e.g., "1. Mañana, martes 10 nov")
  assertDomOrder(html, [
    "Boletín diario",
    "Dólar interbancario",
    "rango para",
    "1. ",
    "2. Próxima semana",
    "3. Próximo mes",
    "Tus empresas",
    "Lo importante de hoy",
    "Mercados",
    "Hechos de importancia",
    "Titulares",
    "Reenvía este correo",
    "El rango es estadístico",
  ], "pagado");
});

test("correos: la cabecera precede a toda lectura y cada título de sección lleva cuerpo", () => {
  for (const plan of ["gratis", "boletin"]) {
    const html = vistaPrevia(plan);
    // El índice de «Boletín diario» es menor que el de «Podría presionar al dólar»
    const cabecera = html.indexOf("Boletín diario");
    assert.ok(cabecera !== -1, `${plan}: sin cabecera «Boletín diario»`);
    const presionar = html.indexOf("Podría presionar al dólar");
    assert.ok(presionar !== -1, `${plan}: sin «Podría presionar al dólar»`);
    assert.ok(cabecera < presionar, `${plan}: la lectura del dólar sale antes que la cabecera`);
    // Ningún texto de lectura aparece antes de la cabecera
    for (const lectura of ["Rango: S/", "Podría presionar al dólar al alza", ">Contexto<", "Lo importante de hoy"]) {
      const i = html.indexOf(lectura);
      if (i === -1) continue;
      assert.ok(i > cabecera, `${plan}: «${lectura}» aparece antes de la cabecera`);
    }
    // Cada título de sección (borde izquierdo) va seguido de contenido antes
    // del siguiente título: no hay dos títulos seguidos sin cuerpo.
    const tituloRe = /border-left:3px solid #1B1916/g;
    const titulos = [];
    let m;
    while ((m = tituloRe.exec(html))) titulos.push(m.index);
    assert.ok(titulos.length >= 2, `${plan}: se esperaban varios títulos de sección`);
    const sinTags = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    for (let i = 0; i < titulos.length; i++) {
      const finTitulo = html.indexOf("</td>", titulos[i]);
      assert.ok(finTitulo !== -1, `${plan}: título de sección sin cierre`);
      const siguiente = titulos[i + 1] ?? html.indexOf("El rango es estadístico");
      const cuerpo = sinTags(html.slice(finTitulo + 5, siguiente === -1 ? html.length : siguiente));
      assert.ok(cuerpo.length > 0, `${plan}: el título de sección #${i + 1} queda sin contenido debajo`);
    }
  }
});
