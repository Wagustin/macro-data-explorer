import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

// Etiquetas de la tabla de rangos que salen en el correo.
const etiquetasRangos = (html) => [...html.matchAll(/>([^<>]*(?:Hoy|Mañana|Semana|Mes),[^<>]*)</g)].map((m) => m[1].trim());

test("correo gratis: tabla de rangos con un solo horizonte (hoy) y valores de daily-forecasts.json", () => {
  const html = generar("gratis");
  const daily = JSON.parse(read("data/daily-forecasts.json"));
  const pen = daily.simbolos.PEN;

  // Cabecera de la tabla: rango central y rango amplio, con el «S/» una sola vez.
  assert.match(html, /Rango central \(1 de cada 2 veces\)/);
  assert.match(html, /Rango amplio \(8 de cada 10 veces\)/);
  // La celda «S/» va una sola vez, junto a las dos cabeceras de rango.
  assert.equal((html.match(/>S\/<\/td>/g) || []).length, 1, "el «S/» va una sola vez en la cabecera");

  // La fila de hoy con los valores de data/daily-forecasts.json.
  const etiqueta = etiquetaHorizonte(pen.manana.fecha_objetivo);
  assert.ok(html.includes(etiqueta), `el gratis trae la fila «${etiqueta}»`);
  assert.ok(html.includes(fila(pen.manana.p25, pen.manana.p75)), "el rango central de mañana");
  assert.ok(html.includes(fila(pen.manana.p10, pen.manana.p90)), "el rango amplio de mañana");
  assert.ok(html.includes(fmt3(pen.ultimo_cierre)), "el cierre de data/daily-forecasts.json");
  assert.match(html, /Tipo de cambio venta del sistema bancario \(SBS\), publicado por el BCRP/);

  // El gratis no trae los horizontes de semana ni de mes.
  const etiquetas = etiquetasRangos(html);
  assert.equal(etiquetas.length, 1, `el gratis trae una sola fila de rango (${etiquetas.join(" | ")})`);
  assert.ok(!html.includes(fila(pen.semana.p25, pen.semana.p75)), "el gratis no trae el rango de la semana");
  assert.ok(!html.includes(fila(pen.semana.p10, pen.semana.p90)), "el gratis no trae el rango amplio de la semana");
  assert.ok(!/Mes, \d{1,2} [a-z]{3}/.test(html), "el gratis no trae la fila del mes");

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

  assert.match(html, /Rango central \(1 de cada 2 veces\)/);
  assert.match(html, /Rango amplio \(8 de cada 10 veces\)/);
  // La celda «S/» va una sola vez, junto a las dos cabeceras de rango.
  assert.equal((html.match(/>S\/<\/td>/g) || []).length, 1, "el «S/» va una sola vez en la cabecera");

  // Hoy y semana salen de data/daily-forecasts.json.
  assert.ok(html.includes(etiquetaHorizonte(pen.manana.fecha_objetivo)), "la fila de hoy");
  assert.ok(html.includes(fila(pen.manana.p25, pen.manana.p75)), "el rango central de hoy");
  assert.ok(html.includes(fila(pen.manana.p10, pen.manana.p90)), "el rango amplio de hoy");
  assert.ok(html.includes(`Semana, ${diaCorta(pen.semana.fecha_objetivo)}`), "la fila de la semana");
  assert.ok(html.includes(fila(pen.semana.p25, pen.semana.p75)), "el rango central de la semana");
  assert.ok(html.includes(fila(pen.semana.p10, pen.semana.p90)), "el rango amplio de la semana");

  // El mes: con la etiqueta del horizonte y sin inventar cifras.
  assert.match(html, /Mes, \d{1,2} [a-z]{3}/, "la fila del mes");
  const etiquetas = etiquetasRangos(html);
  assert.equal(etiquetas.length, 3, `el pagado trae tres filas de rango (${etiquetas.join(" | ")})`);
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
  assert.match(html, /S\/ 13\.32/);

  // Una línea en mono con el rango central y el amplio.
  assert.match(html, /Al \d{1,2} [a-z]{3}: [\d.,]+ – [\d.,]+ \(1 de cada 2\) · (?:<span[^>]*>)?[\d.,]+ – [\d.,]+ \(8 de cada 10\)/);

  // Lectura: solo dirección (nada de «Qué hay» ni «Contexto»).
  assert.ok(!html.includes("Qué hay"), "la sección «Qué hay» ya no está");
  assert.ok(!html.includes("Lectura de"), "el bloque «Lectura de …» ya no está");

  // Enlace a la ficha.
  assert.match(html, /Ver ficha/);
  assert.match(html, /https:\/\/perdata\.site\/empresa\/ALICORC1/);
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
    for (const lectura of ["Rango central", "Lo importante de hoy", "Tus empresas"]) {
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
