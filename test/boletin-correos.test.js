import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const QA = path.join(rootDir, "..", "handoff", "qa");

// Same generator as the previews: spawn the script with PREVIEW_EMPRESAS and
// the preview path, then read the generated HTML. The script only writes a
// preview with --dry-run / PREVIEW_*; it never sends mail.
function generar(plan, extra = {}, empresas = "ALICORC1,BVN,CVERDEC1") {
  // Los mismos nombres que los artefactos finales de QA: así las rutas
  // relativas de las imágenes (<ruta-sin-ext>-img/) resuelven en la captura.
  const out = path.join(QA, plan === "gratis" ? "correo-gratis.html" : "correo-pagado.html");
  execFileSync(process.execPath, ["scripts/boletin.js", "--dry-run"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PREVIEW_EMPRESAS: empresas,
      PREVIEW_PLAN: plan,
      BOLETIN_PREVIEW_PATH: out,
      ...extra,
    },
  });
  return fs.readFileSync(out, "utf8");
}

const stripPlanBlock = (html) => html.replace(/<!-- plan-boletin -->[\s\S]*?<!-- \/plan-boletin -->/g, "");
const plano = (html) => html.replace(/\s+/g, " ").trim();

// Formato de cifras y etiquetas (mismo que usa el correo).
const DIAS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hoyLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const fmt3 = (v) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const diaCorta = (fecha) => {
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00Z`);
  return `${DIAS_ES[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_ES[d.getUTCMonth()]}`;
};
const etiquetaHorizonte = (fecha) => {
  const diff = Math.round((new Date(`${String(fecha).slice(0, 10)}T12:00:00Z`) - new Date(`${hoyLima}T12:00:00Z`)) / 864e5);
  if (diff === 0) return `Hoy, ${diaCorta(fecha)}`;
  if (diff === 1) return `Mañana, ${diaCorta(fecha)}`;
  return diaCorta(fecha);
};
const fila = (a, b) => `${fmt3(a)} – ${fmt3(b)}`;

// «Hoy, mié 11 nov» -> título «Hoy» y detalle «mié 11 nov» (la etiqueta entera
// es el título cuando no hay coma).
const parteEtiqueta = (etiqueta) => {
  const [titulo, ...resto] = String(etiqueta || "").split(",");
  return { titulo: titulo.trim(), detalle: resto.join(",").trim() };
};

// Títulos y fechas de las filas de la tabla de rangos («Hoy», «Semana», «Mes»).
const titulosRangos = (html) => [...html.matchAll(/font-size:13px;font-weight:600;color:#1B1916;white-space:nowrap">([^<]+)</g)].map((m) => m[1].trim());
const detallesRangos = (html) => [...html.matchAll(/font-size:11px;color:#5E584E;white-space:nowrap">([^<]+)</g)].map((m) => m[1].trim());

test("correo gratis: tabla de rangos con un solo horizonte (hoy) y valores de daily-forecasts.json", () => {
  const html = generar("gratis");
  const daily = JSON.parse(read("data/daily-forecasts.json"));
  const pen = daily.simbolos.PEN;

  // Cabecera de la tabla: dos bloques por rango, sin el paréntesis largo.
  assert.match(html, /Rango probable · en soles/);
  assert.match(html, />Central</);
  assert.match(html, />1 de cada 2 veces</);
  assert.match(html, />Amplio</);
  assert.match(html, />8 de cada 10 veces</);
  assert.doesNotMatch(html, /Rango central \(1 de cada 2 veces\)/);
  assert.doesNotMatch(html, /Rango amplio \(8 de cada 10 veces\)/);
  // Ninguna celda dice solo «S/»: la unidad va en el título de la tabla.
  assert.doesNotMatch(html, />\s*S\/\s*<\/td>/);

  // La fila de hoy con los valores de data/daily-forecasts.json.
  const { titulo, detalle } = parteEtiqueta(etiquetaHorizonte(pen.manana.fecha_objetivo));
  assert.ok(html.includes(`>${titulo}</`), `el gratis trae la fila «${titulo}»`);
  if (detalle) assert.ok(html.includes(`>${detalle}</`), `el gratis trae el detalle «${detalle}»`);
  assert.ok(html.includes(fila(pen.manana.p25, pen.manana.p75)), "el rango central de mañana");
  assert.ok(html.includes(fila(pen.manana.p10, pen.manana.p90)), "el rango amplio de mañana");
  assert.ok(html.includes(fmt3(pen.ultimo_cierre)), "el cierre de data/daily-forecasts.json");
  assert.match(html, /Tipo de cambio venta del sistema bancario \(SBS\), publicado por (el BCRP|SUNAT)/);

  // El gratis no trae los horizontes de semana ni de mes.
  const titulos = titulosRangos(html);
  assert.equal(titulos.length, 1, `el gratis trae una sola fila de rango (${titulos.join(" | ")})`);
  assert.ok(!html.includes(fila(pen.semana.p25, pen.semana.p75)), "el gratis no trae el rango de la semana");
  assert.ok(!html.includes(fila(pen.semana.p10, pen.semana.p90)), "el gratis no trae el rango amplio de la semana");
  assert.ok(!titulos.includes("Semana"), "el gratis no trae la fila de la semana");
  assert.ok(!titulos.includes("Mes"), "el gratis no trae la fila del mes");

  // Lectura (una sola vez), plan y pie.
  assert.match(html, /Qué podría presionar al dólar/);
  assert.equal((html.match(/Qué podría presionar al dólar/g) || []).length, 1);
  assert.match(html, /<!-- plan-boletin -->/);
  assert.match(html, /1\.99 al mes, 7 días de prueba con tarjeta/);
  assert.match(html, /Darme de baja/);
  assert.match(html, /Elegir mis empresas/);
  assert.match(html, /El rango es estadístico; los factores son contexto, no una predicción de dirección/);
  assert.ok(!html.includes("{{BAJA}}") && !html.includes("{{EMPRESAS}}") && !html.includes("{{PERSONAL}}"), "sin marcadores sin rellenar");
});

test("correo gratis: no trae empresas ni secciones de pago", () => {
  const html = generar("gratis");
  const sinPlan = stripPlanBlock(html);
  for (const empresa of ["ALICORC1", "BVN", "CVERDEC1", "Ver ficha"]) {
    assert.ok(!html.includes(empresa), `el gratis no trae «${empresa}»`);
  }
  for (const prohibida of ["Hechos de importancia", "Próxima semana", "Lectura de", "Cobre", "Petróleo"]) {
    assert.ok(!sinPlan.includes(prohibida), `el gratis trae «${prohibida}», sección de pago`);
  }
});

test("correo pagado: tabla de rangos con los tres horizontes", () => {
  const html = generar("boletin");
  const daily = JSON.parse(read("data/daily-forecasts.json"));
  const pen = daily.simbolos.PEN;

  // Cabecera de la tabla: dos bloques por rango, sin el paréntesis largo.
  assert.match(html, /Rango probable · en soles/);
  assert.match(html, />Central</);
  assert.match(html, />1 de cada 2 veces</);
  assert.match(html, />Amplio</);
  assert.match(html, />8 de cada 10 veces</);
  assert.doesNotMatch(html, /Rango central \(1 de cada 2 veces\)/);
  assert.doesNotMatch(html, /Rango amplio \(8 de cada 10 veces\)/);
  // Ninguna celda dice solo «S/»: la unidad va en el título de la tabla.
  assert.doesNotMatch(html, />\s*S\/\s*<\/td>/);
  // «Central» va antes que «Amplio».
  assert.ok(html.indexOf("Central") < html.indexOf("Amplio"), "«Central» va antes que «Amplio»");

  // Hoy y semana salen de data/daily-forecasts.json.
  const hoy = parteEtiqueta(etiquetaHorizonte(pen.manana.fecha_objetivo));
  assert.ok(html.includes(`>${hoy.titulo}</`), "la fila de hoy");
  if (hoy.detalle) assert.ok(html.includes(`>${hoy.detalle}</`), "la fecha de la fila de hoy");
  assert.ok(html.includes(fila(pen.manana.p25, pen.manana.p75)), "el rango central de hoy");
  assert.ok(html.includes(fila(pen.manana.p10, pen.manana.p90)), "el rango amplio de hoy");
  assert.ok(html.includes(`>${diaCorta(pen.semana.fecha_objetivo)}</`), "la fecha de la fila de la semana");
  assert.ok(html.includes(fila(pen.semana.p25, pen.semana.p75)), "el rango central de la semana");
  assert.ok(html.includes(fila(pen.semana.p10, pen.semana.p90)), "el rango amplio de la semana");

  // El mes: con la etiqueta del horizonte y sin inventar cifras.
  const titulos = titulosRangos(html);
  assert.ok(titulos.includes(hoy.titulo), `la fila «${hoy.titulo}»`);
  assert.ok(titulos.includes("Semana"), "la fila «Semana»");
  assert.ok(titulos.includes("Mes"), "la fila «Mes»");
  assert.equal(titulos.length, 3, `el pagado trae tres filas de rango (${titulos.join(" | ")})`);
  assert.match(html, /El rango es estadístico: no dice hacia dónde irá el dólar\./);
});

test("correo pagado: una sola lectura del dólar, máximo 4 historias, 3 hechos de la SMV y mercados en una tabla", () => {
  const html = generar("boletin");
  const digest = JSON.parse(read("data/noticias-resumen.json"));
  const buenas = (digest.historias || []).filter((h) => h.nota && h.revision?.ok !== false);

  // Lectura del dólar una sola vez (no tres bloques por horizonte).
  assert.equal((html.match(/Qué podría presionar al dólar/g) || []).length, 1, "la lectura del dólar va una sola vez");
  assert.ok(!html.includes("Próxima semana,"), "no hay bloque propio de la semana");
  assert.ok(!html.includes("Próximo mes,"), "no hay bloque propio del mes");

  // Historias: máximo 4 (título + una frase + fuente).
  assert.match(html, /Lo importante de hoy/);
  for (const h of buenas.slice(0, 4)) {
    assert.ok(plano(html).includes(plano(h.titulo)), `el pagado trae «${h.titulo.slice(0, 30)}…»`);
  }
  if (buenas.length > 4) {
    assert.ok(!plano(html).includes(plano(buenas[4].titulo)), "la quinta historia ya no entra");
  }

  // Mercados: una sola tabla con cobre, oro, WTI y Brent.
  assert.match(html, /Mercados/);
  for (const metal of ["Cobre", "Oro", "Petróleo WTI", "Petróleo Brent"]) {
    assert.ok(html.includes(metal), `el pagado trae «${metal}»`);
  }
  assert.ok(!html.includes("Titulares"), "la sección «Titulares» ya no está");

  // Hechos de la SMV: máximo 3.
  assert.match(html, /Hechos de importancia/);
  assert.match(html, /Superintendencia del Mercado de Valores/);
});

test("correo gratis: máximo 3 historias y el bloque del plan", () => {
  const html = generar("gratis");
  const digest = JSON.parse(read("data/noticias-resumen.json"));
  const buenas = (digest.historias || []).filter((h) => h.nota && h.revision?.ok !== false);
  assert.ok(buenas.length >= 3, "el digest trae al menos 3 publicables");
  for (const h of buenas.slice(0, 3)) {
    assert.ok(plano(html).includes(plano(h.titulo)), `el gratis trae «${h.titulo.slice(0, 30)}…»`);
  }
  if (buenas.length > 3) {
    assert.ok(!plano(html).includes(plano(buenas[3].titulo)), "la cuarta historia ya no entra en el gratis");
  }
  assert.match(html, /<!-- plan-boletin -->/);
});

test("correo pagado: «Tus empresas» con imagen, rango en mono, máximo 2 hechos y solo la lectura con dirección", () => {
  const html = generar("boletin");
  assert.match(html, /Tus empresas/);
  assert.ok(html.includes("ALICORC1") && html.includes("CVERDEC1"), "las empresas del preview");

  // Fila: nombre + nemónico a la izquierda; precio y variación a la derecha.
  assert.match(html, /Alicorp S\.A\.A\./);
  // El precio sale de data/empresas-estado.json (cambia cada día: no se escribe a mano).
  const estadoAlicorp = Object.values(JSON.parse(read("data/empresas-estado.json")).emisores).find((e) => e.nemonico === "ALICORC1");
  assert.ok(html.includes(`S/ ${Number(estadoAlicorp.ultimo_cierre).toFixed(2)}`), "el precio de Alicorp de data/empresas-estado.json");

  // Una línea en mono con el rango central y el amplio.
  assert.match(html, /Al \d{1,2} [a-z]{3}: [\d.,]+ – [\d.,]+ \(1 de cada 2\) · (?:<span[^>]*>)?[\d.,]+ – [\d.,]+ \(8 de cada 10\)/);

  // Lectura: solo dirección (nada de «Qué hay» ni «Contexto»).
  assert.ok(!html.includes("Qué hay"), "la sección «Qué hay» ya no está");
  assert.ok(!html.includes("Lectura de"), "el bloque «Lectura de …» ya no está");

  // Enlace a la ficha.
  assert.match(html, /Ver ficha/);
  assert.match(html, /https:\/\/perdata\.site\/empresa\/ALICORC1/);
});

test("correo pagado: «Tus empresas» usa el rango semanal calibrado de las acciones de Lima", () => {
  const valores = JSON.parse(read("data/acciones-rangos.json")).valores;

  // Elige dinámicamente empresas sin rango según los datos del día:
  // - corta: primera con semana.motivo === "historia_insuficiente"
  // - noConfiable: primera con semana.publicable === false y otro motivo
  let corta = null;
  let noConfiable = null;
  for (const [nemonico, v] of Object.entries(valores)) {
    const semana = v.semana;
    if (semana && semana.publicable === false) {
      if (semana.motivo === "historia_insuficiente" && !corta) {
        corta = nemonico;
      } else if (semana.motivo !== "historia_insuficiente" && !noConfiable) {
        noConfiable = nemonico;
      }
    }
    if (corta && noConfiable) break;
  }

  const empresas = ["ALICORC1", corta, noConfiable].filter(Boolean).join(",");
  const html = generar("boletin", {}, empresas);
  const sinTags = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const texto = sinTags(html);

  // El rango sale del motor calibrado (data/acciones-rangos.json), no de la
  // banda mensual vieja de /api/forecast.
  const fmt2 = (v) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = (f) => {
    const d = new Date(`${String(f).slice(0, 10)}T12:00:00Z`);
    return `${d.getUTCDate()} ${MESES_ES[d.getUTCMonth()]}`;
  };
  const semana = valores.ALICORC1.semana;
  assert.ok(
    texto.includes(`Al ${fecha(semana.fecha_objetivo)}: ${fmt2(semana.p25)} – ${fmt2(semana.p75)} (1 de cada 2) · ${fmt2(semana.p10)} – ${fmt2(semana.p90)} (8 de cada 10)`),
    "la línea de Alicorp es el rango de la semana del motor"
  );

  // El gráfico de la acción se anuncia como proyección de una semana.
  assert.match(html, /Alicorp S\.A\.A\.: últimos cierres y rango proyectado a una semana/);
  assert.ok(!html.includes("rango proyectado a un mes"), "ninguna acción de Lima se anuncia a un mes");

  // Cuando el motor no publica un rango, la tarjeta explica el motivo exacto.
  if (noConfiable) {
    assert.ok(
      texto.includes("Sin rango esta semana: en la prueba no fue lo bastante confiable y preferimos no mostrarlo."),
      `${noConfiable} explica por qué no hay rango`
    );
  }
  if (corta) {
    assert.ok(
      texto.includes("Aún sin rango: su historia en bolsa es corta para probarlo."),
      `${corta} explica que su prueba todavía es corta`
    );
  }
});

test("rango de empresa en el correo: los tres motivos y el caso publicable (sin depender de los datos del día)", async () => {
  const { rangoEmpresaCorreo } = await import("../scripts/lib/rango-empresa-correo.js");
  const hoy = "2026-11-11";

  // 1. valor undefined → motivo "Sin rango: esta acción casi no se negocia." y forecast null
  let r = rangoEmpresaCorreo(undefined, { hoy });
  assert.equal(r.forecast, null, "undefined → forecast null");
  assert.equal(r.motivo, "Sin rango: esta acción casi no se negocia.", "undefined → motivo sin rango");

  // 2. semana.motivo === "historia_insuficiente" → "Aún sin rango: su historia en bolsa es corta para probarlo."
  r = rangoEmpresaCorreo({ semana: { publicable: false, motivo: "historia_insuficiente" } }, { hoy });
  assert.equal(r.forecast, null, "historia_insuficiente → forecast null");
  assert.equal(r.motivo, "Aún sin rango: su historia en bolsa es corta para probarlo.", "historia_insuficiente → motivo historia corta");

  // 3. semana.motivo === "cobertura_fuera_de_rango" → "Sin rango esta semana: en la prueba no fue lo bastante confiable y preferimos no mostrarlo."
  r = rangoEmpresaCorreo({ semana: { publicable: false, motivo: "cobertura_fuera_de_rango" } }, { hoy });
  assert.equal(r.forecast, null, "cobertura_fuera_de_rango → forecast null");
  assert.equal(r.motivo, "Sin rango esta semana: en la prueba no fue lo bastante confiable y preferimos no mostrarlo.", "cobertura_fuera_de_rango → motivo confiabilidad");

  // 4. valor publicable con fecha objetivo futura → forecast con los cinco números y motivo null
  const valorPublicable = {
    semana: {
      publicable: true,
      motivo: null,
      fecha_objetivo: "2026-11-17",
      p10: 1, p25: 1.1, p50: 1.2, p75: 1.3, p90: 1.4,
    },
  };
  r = rangoEmpresaCorreo(valorPublicable, { hoy });
  assert.deepEqual(r.forecast, {
    p10: 1, p25: 1.1, p50: 1.2, p75: 1.3, p90: 1.4,
    date: "2026-11-17", horizonte: "semana",
  }, "publicable → forecast con cinco números");
  assert.equal(r.motivo, null, "publicable → motivo null");
});

test("correos: sin emojis, sin «subirá»/«bajará»/«interbancario» y sin fechas ISO", () => {
  const gratis = generar("gratis");
  const pagado = generar("boletin");
  for (const html of [gratis, pagado]) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(html), "sin emojis");
    assert.ok(!html.includes("undefined") && !html.includes("NaN"), "sin cifras inventadas (undefined/NaN)");
    assert.ok(!/subirá|bajará/i.test(html), "no dice «subirá» ni «bajará»");
    assert.ok(!html.toLowerCase().includes("interbancario"), "no dice «interbancario»");
    assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(html), "sin fechas ISO");
  }
});

test("vista previa: las imágenes se escriben en disco y se referencian con ruta relativa", () => {
  const html = generar("boletin");
  assert.match(html, /<img src="correo-pagado-img\/dolar\.png" width="560" height="150"/);
  const dir = path.join(QA, "correo-pagado-img");
  assert.ok(fs.existsSync(path.join(dir, "dolar.png")), "el PNG del dólar está en disco");
  assert.ok(fs.existsSync(path.join(dir, "ALICORC1.png")), "el PNG de la empresa está en disco");
  for (const archivo of fs.readdirSync(dir)) {
    if (!archivo.endsWith(".png")) continue;
    const bytes = fs.readFileSync(path.join(dir, archivo));
    assert.deepEqual(Array.from(bytes.subarray(0, 4)), [0x89, 0x50, 0x4e, 0x47], `${archivo} es un PNG`);
    assert.ok(bytes.length < 12 * 1024, `${archivo} pesa ${bytes.length} bytes (< 12 KB)`);
  }
});

test("envío real: sin BOLETIN_IMG_BASE el correo no lleva ninguna etiqueta <img>", () => {
  const out = path.join(QA, "correo-envio-test.html");
  generar("boletin", { BOLETIN_PREVIEW_SEND: "1", BOLETIN_PREVIEW_SEND_PATH: out });
  const html = fs.readFileSync(out, "utf8");
  assert.ok(!/<img/i.test(html), "el HTML de envío no lleva <img>");
  assert.ok(!html.includes("{{BAJA}}") && !html.includes("{{EMPRESAS}}") && !html.includes("{{PERSONAL}}"), "sin marcadores sin rellenar");
  assert.match(html, /Darme de baja/);
  // Con base de imágenes, el mismo HTML sí las lleva.
  const out2 = path.join(QA, "correo-envio-img-test.html");
  generar("boletin", { BOLETIN_PREVIEW_SEND: "1", BOLETIN_PREVIEW_SEND_PATH: out2, BOLETIN_IMG_BASE: "https://cdn.perdata.site/boletin" });
  const html2 = fs.readFileSync(out2, "utf8");
  assert.match(html2, /<img src="https:\/\/cdn\.perdata\.site\/boletin\/dolar\.png"/);
});

test("correo pagado con 14 empresas: el HTML no pasa de 70 000 bytes", () => {
  const empresas = "ALICORC1,CVERDEC1,BAP,BVN,SCCO,FERREYC1,VOLCABC1,IFS,CPACASC1,UNACEMC1,ENGIEC1,LUSURC1,MINSURI1,BBVAC1,CASAGRC1";
  const html = generar("boletin", {}, empresas);
  const fichas = (html.match(/Ver ficha/g) || []).length;
  assert.ok(fichas >= 14, `el correo trae ${fichas} empresas`);
  assert.ok(Buffer.byteLength(html) <= 70000, `el HTML pesa ${Buffer.byteLength(html)} bytes (<= 70 000)`);
});

test("correos: la cabecera precede a toda lectura y cada título de sección lleva cuerpo", () => {
  for (const plan of ["gratis", "boletin"]) {
    const html = generar(plan);
    const cabecera = html.indexOf("Boletín diario");
    assert.ok(cabecera !== -1, `${plan}: sin cabecera «Boletín diario»`);
    const presionar = html.indexOf("Podría presionar al dólar");
    assert.ok(presionar !== -1, `${plan}: sin «Podría presionar al dólar»`);
    assert.ok(cabecera < presionar, `${plan}: la lectura del dólar sale antes que la cabecera`);
    for (const lectura of ["Rango probable", "Lo importante de hoy", "Tus empresas"]) {
      const i = html.indexOf(lectura);
      if (i === -1) continue;
      assert.ok(i > cabecera, `${plan}: «${lectura}» aparece antes que la cabecera`);
    }
    // Cada título de sección (borde izquierdo) va seguido de contenido.
    const tituloRe = /border-left:3px solid #1B1916/g;
    const titulos = [];
    let m;
    while ((m = tituloRe.exec(html))) titulos.push(m.index);
    assert.ok(titulos.length >= 2, `${plan}: se esperaban varios títulos de sección`);
    const sinTags = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    for (let i = 0; i < titulos.length; i++) {
      const finTitulo = html.indexOf("</td>", titulos[i]);
      assert.ok(finTitulo !== -1, `${plan}: título de sección sin cierre`);
      const siguiente = titulos[i + 1] ?? html.length;
      const cuerpo = sinTags(html.slice(finTitulo + 5, siguiente));
      assert.ok(cuerpo.length > 0, `${plan}: el título de sección #${i + 1} queda sin contenido debajo`);
    }
  }
});

test("correos: sin tablas anidadas de dos celdas, la cabecera en una columna y las tablas al ancho completo", () => {
  for (const plan of ["gratis", "boletin"]) {
    const html = generar(plan);

    // La banderita ya no es una tabla (Gmail en iPhone aplasta las inline-table).
    assert.ok(!html.includes("inline-table"), `${plan}: el HTML aún lleva «inline-table»`);

    // La cabecera va en una sola columna: «Boletín diario · Edición» va DEBAJO
    // del logotipo, no al lado.
    const marca = html.indexOf(">PerData");
    const boletin = html.indexOf("Boletín diario · Edición");
    assert.ok(marca !== -1, `${plan}: sin el logotipo «PerData»`);
    assert.ok(boletin !== -1, `${plan}: sin «Boletín diario · Edición»`);
    assert.ok(marca < boletin, `${plan}: «Boletín diario · Edición» aparece antes que «PerData»`);

    // Toda tabla con width="100%" lleva también width:100% en su style (si no,
    // Gmail la encoge y el bloque se desarma).
    const tablas = html.match(/<table[^>]*width="100%"[^>]*>/g) || [];
    assert.ok(tablas.length > 0, `${plan}: no se encontró ninguna tabla con width="100%"`);
    for (const tabla of tablas) {
      assert.match(tabla, /style="[^"]*width:100%/, `${plan}: una tabla con width="100%" sin width:100% en el style`);
    }
  }
});

test("correo pagado: si pasaría el límite de tamaño, quita lecturas de empresa desde la última y conserva el pie", () => {
  const out = path.join(QA, "correo-limite.html");
  const gen = (extra) => {
    execFileSync(process.execPath, ["scripts/boletin.js", "--dry-run"], {
      cwd: rootDir,
      env: { ...process.env, PREVIEW_EMPRESAS: "ALICORC1,BVN,CVERDEC1", PREVIEW_PLAN: "boletin", BOLETIN_PREVIEW_PATH: out, ...extra },
    });
    return fs.readFileSync(out, "utf8");
  };
  const lecturas = (h) => (h.match(/Podría mover (al alza|a la baja)/g) || []).length;
  const normal = gen({});
  assert.ok(Buffer.byteLength(normal) < 98000, "el correo de tres empresas no debería acercarse al límite");
  if (lecturas(normal) === 0) return; // sin lecturas hoy: no hay nada que recortar
  const limite = Buffer.byteLength(normal) - 200;
  const recortado = gen({ BOLETIN_LIMITE_BYTES: String(limite) });
  assert.ok(Buffer.byteLength(recortado) <= limite, "el correo recortado sigue pasando el límite");
  assert.ok(lecturas(recortado) < lecturas(normal), "debe quitar al menos una lectura");
  assert.ok(lecturas(recortado) >= lecturas(normal) - 2, "debe quitar solo las lecturas necesarias (una empresa: uno o dos títulos)");
  assert.ok(recortado.includes("Darme de baja"), "el pie con la baja debe seguir");
});

test("envío real: solo se referencian los PNG publicados (el gratis usa «dolar-hoy.png»)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "boletin-render-"));
  process.env.BOLETIN_PREVIEW_PATH = path.join(tmp, "preview.html");
  process.argv.push("--dry-run");
  const { renderForTests } = await import("../scripts/boletin.js");
  const facts = {
    cierre: { valor: 3.42, fecha: "2026-11-10", fuente: "BCRP" },
    markets: [], smvFacts: [], historiasTodas: [], historiasTop3: [],
    daily: null, forecast: null, bcrp: { series: {} },
  };
  // Solo se publicó «dolar.png»: el pago lo lleva y el gratis (que usa
  // «dolar-hoy.png») no lleva ninguna imagen.
  const img = { base: "https://x.invalid/b", archivos: new Set(["dolar.png"]) };
  const { pagado, gratis } = renderForTests(facts, "martes, 10 de noviembre de 2026", { img });
  assert.match(pagado, /<img src="https:\/\/x\.invalid\/b\/dolar\.png"/);
  assert.ok(!/<img/i.test(gratis), "el gratis no lleva ninguna imagen");
});
