import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pasada as pasadaVigia } from "../scripts/vigia.mjs";

// Simulacros: secuencias de pasadas reales del vigía. Las dependencias externas son falsas (gh, fetch,
// Tailscale/TCP, espera de 1 min y avisos); el reloj lo marca cada escenario y la memoria es un archivo temporal.
// Cada pasada devuelve las acciones que el vigía ejecutaría: RELANZAR/DESPLEGAR/VOLVER_ATRAS/REPARAR y AVISAR.

const REPO = "Wagustin/macro-data-explorer";
const BASE = "https://perdata.site";
const MIN = 6e4;
const H = 36e5;
const JOB_OFFSET = 100000;
const WF_FILES = [
  "watchdog.yml", "news.yml", "smv.yml", "smv-precios.yml", "ci.yml", "timesfm.yml", "boletin.yml",
  "alertas.yml", "reparar.yml", "deploy.yml", "rollback.yml", "official-data.yml", "d1-backfill.yml", "backup.yml",
];
const WORKFLOWS = WF_FILES.map((f, i) => ({ id: i + 1, name: f.replace(/\.yml$/, ""), path: `.github/workflows/${f}` }));
const idDeWorkflow = (wf) => WF_FILES.indexOf(wf) + 1;

const WD_PASO = "Comprobar la web (smoke y procesos)";
// Log real del smoke del 23-nov (fallo de red) y uno que no es de red.
const SMOKE_RED = "FALLA  Pruebas completas (smoke): FAIL | Página / | Error: This operation was aborted; FAIL | Indexable /dolar ...";
const SMOKE_NO_RED = "FALLA  Pruebas completas (smoke): FAIL | Página / | Error: 500 Internal Server Error; FAIL | Indexable /dolar ...";
const ERROR_CODIGO_LOG = [
  "TypeError: Cannot read properties of undefined (reading 'items')",
  "    at parse (/home/runner/work/macro-data-explorer/macro-data-explorer/scripts/news.mjs:42:17)",
].join("\n");

const utcDia = (t) => new Date(t).toISOString().slice(0, 10);
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

// Acción que ejecuta gh: RELANZAR:<wf>, DESPLEGAR, VOLVER_ATRAS o REPARAR:<wf>.
function accionDe(args) {
  const wf = args[2];
  if (wf === "deploy.yml") return "DESPLEGAR";
  if (wf === "rollback.yml") return "VOLVER_ATRAS";
  if (wf === "reparar.yml") return `REPARAR:${args.find((x) => x.startsWith("workflow=")).slice("workflow=".length)}`;
  return `RELANZAR:${wf}`;
}

class Mundo {
  constructor(iso, cfg = {}) {
    this.t = Date.parse(iso);
    this.cfg = cfg;
    this.nextId = 1;
    this.runs = [];
    this.logs = new Map();
    this.commits = null; // null: el boletín de hoy (UTC) está enviado
    this.status = {
      forecasts: { ageHours: 1, staleAfterHours: 30 }, news: { ageHours: 0.5, staleAfterHours: 3 },
      smv: { ageHours: 2, staleAfterHours: 30 }, bcrp: { ageHours: 1, staleAfterHours: 30 },
      eia: { ageHours: 1, staleAfterHours: 30 }, d1Sync: { ageHours: 1, staleAfterHours: 30 },
    };
    this.backupFecha = null; // null: copia de hoy (UTC)
    this.statusCaido = false;
    this.hechosHoras = 1;
    this.billing = { paymentsEnabled: false };
    this.checkout = { status: 503, body: { code: "payments_paused" } };
    this.caidas = new Set();
    this.casaArriba = true;
    this.gh401 = false;
    this.acc = [];
    this.resumenes = [];
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), "vigia-sim-"));
    this.memoriaFile = path.join(this.dir, "perdata-vigia.json");
  }

  at(iso) { this.t = Date.parse(iso); return this; }

  limpiar() { fs.rmSync(this.dir, { recursive: true, force: true }); }

  memoria() { return JSON.parse(fs.readFileSync(this.memoriaFile, "utf8")); }

  // Añade una ejecución de main creada en el instante simulado (menos `hace` minutos).
  run(wf, { conclusion = "failure", paso = null, log = "", status = "completed", hace = 0 } = {}) {
    const id = this.nextId++;
    this.runs.push({
      databaseId: id, workflowDatabaseId: idDeWorkflow(wf), workflowName: wf.replace(/\.yml$/, ""), name: wf,
      status, conclusion: status === "completed" ? conclusion : "",
      createdAt: new Date(this.t - hace * MIN).toISOString(),
    });
    if (paso) this.logs.set(id, { paso, log });
    return id;
  }

  falla(log) { return this.run("watchdog.yml", { paso: WD_PASO, log }); }
  ok(wf = "watchdog.yml") { return this.run(wf, { conclusion: "success" }); }

  // Una pasada. Por defecto añade un latido (alertas.yml correcto), que el vigía exige cada 4 h.
  async pasada({ latido = true } = {}) {
    if (latido) this.ok("alertas.yml");
    this.acc = [];
    this.texto = await pasadaVigia(new Date(this.t), { seco: false, cfg: this.cfg, memoriaFile: this.memoriaFile, io: this.io() });
    return this.acc.slice();
  }

  io() {
    return {
      gh: (args) => this.gh(args),
      fetch: (url, init) => this.fetch(url, init),
      esperar: async () => {},
      tailscale: async () => this.casaArriba,
      tcp: async () => this.casaArriba,
      avisar: async (a) => {
        this.acc.push(`AVISAR:${a.avisoKey ?? a.codigo}`);
        return { canal: "correo", detalle: "", telegramFallo: false };
      },
      telegram: async (texto) => { this.resumenes.push(texto); },
    };
  }

  async gh(args) {
    if (this.gh401) throw Object.assign(new Error("HTTP 401: Bad credentials"), { stderr: "HTTP 401: Bad credentials" });
    const [a, b] = args;
    if (a === "run" && b === "list") return JSON.stringify(this.runs);
    if (a === "workflow" && b === "list") return JSON.stringify(WORKFLOWS);
    if (a === "workflow" && b === "run") { this.acc.push(accionDe(args)); return ""; }
    if (a === "run" && b === "view") {
      const id = Number(args[2]);
      const r = this.runs.find((x) => x.databaseId === id);
      const e = this.logs.get(id);
      return JSON.stringify({ jobs: [{
        databaseId: id + JOB_OFFSET, name: "job", conclusion: r?.conclusion ?? "",
        steps: e ? [{ name: e.paso, conclusion: "failure" }] : [],
      }] });
    }
    if (a === "api" && b.includes("/actions/jobs/")) {
      const jid = Number(b.match(/jobs\/(\d+)\//)[1]);
      return this.logs.get(jid - JOB_OFFSET)?.log ?? "";
    }
    if (a === "api" && b.includes("/commits")) {
      return JSON.stringify(this.commits ?? [{ commit: { message: `data(boletin): enviado ${utcDia(this.t)}` } }]);
    }
    throw new Error(`gh no previsto: ${args.join(" ")}`);
  }

  async fetch(url) {
    const u = new URL(url);
    if (u.hostname === "raw.githubusercontent.com") {
      return res(200, { actualizado: new Date(this.t - this.hechosHoras * H).toISOString() });
    }
    if (u.origin !== BASE) throw new Error(`fetch no previsto: ${url}`);
    if (u.pathname === "/api/status") {
      if (this.statusCaido) throw new TypeError("fetch failed");
      return res(200, { ...this.status, backup: { fecha: this.backupFecha ?? utcDia(this.t) } });
    }
    if (u.pathname === "/api/billing") {
      if (u.searchParams.get("action") === "checkout") {
        return { status: this.checkout.status, ok: this.checkout.status < 300, text: async () => JSON.stringify(this.checkout.body) };
      }
      return res(200, this.billing);
    }
    return { status: this.caidas.has(u.pathname) ? 503 : 200 };
  }
}

// ---------- a) smoke y umbral de red ----------

test("a) smoke de red: un fallo suelto y dos seguidos no hacen nada; tres seguidos despliegan una sola vez", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T15:30:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T16:00:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), ["DESPLEGAR"]);
  // Tras desplegar, un fallo de red más no vuelve atrás todavía (hacen falta dos).
  m.at("2026-11-25T16:30:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), []);
});

test("a) un 4.º fallo de red el mismo día, tras recuperarse, no despliega otra vez: avisa", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  for (const hora of ["15:00", "15:30"]) { m.at(`2026-11-25T${hora}:00Z`).falla(SMOKE_RED); assert.deepEqual(await m.pasada(), []); }
  m.at("2026-11-25T16:00:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), ["DESPLEGAR"]);
  m.at("2026-11-25T16:30:00Z").ok();
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T17:00:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T17:30:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T18:00:00Z").falla(SMOKE_RED);
  assert.deepEqual(await m.pasada(), ["AVISAR:WATCHDOG_SMOKE"]); // límite de 1 DESPLEGAR al día
  assert.equal(m.memoria().contadores.desplegar, 1);
});

test("b) smoke sin red: dos seguidos despliegan; dos fallos más tras desplegar vuelven atrás y avisan de noche", async (t) => {
  // 22:00 a 23:30 de Lima (03:00 a 04:30 UTC): la vuelta atrás avisa de noche.
  const m = new Mundo("2026-11-25T03:00:00Z");
  t.after(() => m.limpiar());
  m.falla(SMOKE_NO_RED);
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T03:30:00Z").falla(SMOKE_NO_RED);
  assert.deepEqual(await m.pasada(), ["DESPLEGAR"]);
  m.at("2026-11-25T04:00:00Z").falla(SMOKE_NO_RED);
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T04:30:00Z").falla(SMOKE_NO_RED);
  assert.deepEqual(await m.pasada(), ["VOLVER_ATRAS", "AVISAR:WATCHDOG_SMOKE"]);
  assert.equal(m.memoria().contadores.volverAtras, 1);
});

// ---------- c) páginas caídas ----------

test("c) página caída: primera pasada espera, segunda despliega, sigue caída tras desplegar vuelve atrás y avisa", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.caidas.add("/");
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T15:30:00Z");
  assert.deepEqual(await m.pasada(), ["DESPLEGAR"]);
  m.at("2026-11-25T16:00:00Z");
  assert.deepEqual(await m.pasada(), ["VOLVER_ATRAS", "AVISAR:PAGINA_CAIDA"]);
});

// ---------- d) SMV bloqueada ----------

test("d) SMV 418 en smv-precios.yml: espera 2 h, relanza como mucho 2 al día y luego avisa", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  const smv418 = "Error: HTTP 418 de la SMV (cotizaciones)";
  m.run("smv-precios.yml", { paso: "Leer la página de cotizaciones", log: smv418 }); // A, 15:00
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T15:30:00Z");
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T17:00:00Z");
  assert.deepEqual(await m.pasada(), ["RELANZAR:smv-precios.yml"]); // 1.ª relanzada
  m.at("2026-11-25T17:30:00Z").run("smv-precios.yml", { paso: "Leer la página de cotizaciones", log: smv418 }); // B
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T19:30:00Z");
  assert.deepEqual(await m.pasada(), ["RELANZAR:smv-precios.yml"]); // 2.ª relanzada
  m.at("2026-11-25T20:00:00Z").run("smv-precios.yml", { paso: "Leer la página de cotizaciones", log: smv418 }); // C
  m.at("2026-11-25T22:00:00Z");
  assert.deepEqual(await m.pasada(), ["AVISAR:SMV_BLOQUEO"]); // tercera: sin relanzar, solo aviso
  assert.equal(m.memoria().contadores.relanzar["smv-precios.yml"], 2);
});

test("d) cotizaciones de Lima a 73 h (watchdog) avisan", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.falla("FALLA  Cotizaciones de Lima (SMV): dato de hace 73 h");
  assert.deepEqual(await m.pasada(), ["AVISAR:SMV_BLOQUEO"]);
});

test("d) hechos de la SMV a 47 h (watchdog) esperan; a 49 h avisan una sola vez", async (t) => {
  const uno = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => uno.limpiar());
  uno.hechosHoras = 47;
  uno.falla("FALLA  Hechos de importancia (SMV): dato de hace 47 h");
  assert.deepEqual(await uno.pasada(), []);

  const dos = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => dos.limpiar());
  dos.hechosHoras = 49; // el JSON directo también marca 49 h: no debe duplicar el aviso
  dos.falla("FALLA  Hechos de importancia (SMV): dato de hace 49 h");
  assert.deepEqual(await dos.pasada(), ["AVISAR:SMV_BLOQUEO"]);
});

// ---------- e) choque de push ----------

test("e) CHOQUE_PUSH: con datos frescos no hace nada; con datos viejos relanza news.yml una sola vez", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.run("news.yml", { paso: "Guardar cambios de noticias", log: "! [rejected] main -> main (non-fast-forward)" });
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T15:30:00Z");
  m.status.news.ageHours = 5;
  assert.deepEqual(await m.pasada(), ["RELANZAR:news.yml"]);
  m.at("2026-11-25T16:00:00Z");
  assert.deepEqual(await m.pasada(), []);
});

// ---------- f) datos viejos y respaldo ----------

test("f) DATO_VIEJO de news relanza news.yml una vez y no se repite cada 30 min", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.status.news.ageHours = 7;
  assert.deepEqual(await m.pasada(), ["RELANZAR:news.yml"]);
  m.at("2026-11-25T15:30:00Z");
  assert.deepEqual(await m.pasada(), []);
});

test("f) respaldo de hoy sin hacer: antes de las 12:00 UTC nada; después solo avisa, no relanza backup.yml", async (t) => {
  const m = new Mundo("2026-11-25T11:00:00Z");
  t.after(() => m.limpiar());
  m.backupFecha = "2026-11-24";
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T14:00:00Z");
  assert.deepEqual(await m.pasada(), ["AVISAR:DATO_VIEJO"]);
  m.at("2026-11-25T14:30:00Z");
  assert.deepEqual(await m.pasada(), []);
});

// ---------- g) boletín ----------

test("g) boletín: lunes 09:30 de Lima sin commit relanza boletin.yml; 11:00 avisa; domingo no hace nada", async (t) => {
  const lunes = new Mundo("2026-11-30T14:30:00Z"); // lunes 09:30 Lima
  t.after(() => lunes.limpiar());
  lunes.commits = [];
  assert.deepEqual(await lunes.pasada(), ["RELANZAR:boletin.yml"]);
  lunes.at("2026-11-30T15:00:00Z");
  assert.deepEqual(await lunes.pasada(), []);
  lunes.at("2026-11-30T16:00:00Z"); // 11:00 Lima
  assert.deepEqual(await lunes.pasada(), ["AVISAR:BOLETIN_NO_SALIO"]);

  const domingo = new Mundo("2026-11-29T14:30:00Z"); // domingo 09:30 Lima
  t.after(() => domingo.limpiar());
  domingo.commits = [];
  assert.deepEqual(await domingo.pasada(), []);
  domingo.at("2026-11-29T16:00:00Z");
  assert.deepEqual(await domingo.pasada(), []);
});

// ---------- h) pagos ----------

test("h) pagos abiertos: solo avisa, también a las 02:00 de Lima, y no toca nada más", async (t) => {
  const m = new Mundo("2026-11-25T07:00:00Z"); // 02:00 Lima
  t.after(() => m.limpiar());
  m.billing = { paymentsEnabled: true };
  assert.deepEqual(await m.pasada(), ["AVISAR:PAGOS_ABIERTOS"]);
  m.at("2026-11-25T07:30:00Z");
  assert.deepEqual(await m.pasada(), []); // ya avisado en las últimas 6 h
});

// ---------- i) CI y errores de código ----------

test("i) CI rojo: avisa y repara ci.yml", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.run("ci.yml", { paso: "Tests", log: "2 failing tests" });
  assert.deepEqual(await m.pasada(), ["AVISAR:CI_ROJO", "REPARAR:ci.yml"]);
});

test("i) ERROR_CODIGO: repara news.yml una vez al día; un tercer REPARAR del día no repara y avisa", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.run("ci.yml", { paso: "Tests", log: "2 failing tests" });
  assert.deepEqual(await m.pasada(), ["AVISAR:CI_ROJO", "REPARAR:ci.yml"]);
  m.at("2026-11-25T16:00:00Z").run("news.yml", { paso: "Generar resumen", log: ERROR_CODIGO_LOG });
  assert.deepEqual(await m.pasada(), ["AVISAR:ERROR_CODIGO:news.yml", "REPARAR:news.yml"]);
  m.at("2026-11-25T16:30:00Z");
  assert.deepEqual(await m.pasada(), []); // mismo fallo: ni otro aviso ni otra reparación
  m.at("2026-11-25T17:00:00Z").run("timesfm.yml", { paso: "Generar proyección", log: ERROR_CODIGO_LOG });
  assert.deepEqual(await m.pasada(), ["AVISAR:ERROR_CODIGO:timesfm.yml"]); // límite de 2 REPARAR al día
  assert.equal(m.memoria().contadores.reparar["timesfm.yml"], undefined);
});

test("i) con reparar.yml en curso no se repara, aunque el error de código sí avisa", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.run("reparar.yml", { status: "in_progress" });
  m.run("news.yml", { paso: "Generar resumen", log: ERROR_CODIGO_LOG });
  assert.deepEqual(await m.pasada(), ["AVISAR:ERROR_CODIGO:news.yml"]);
});

// ---------- j) latido y servidor de casa ----------

test("j) sin latido (ningún run en 4 h, incluido watchdog) avisa de noche", async (t) => {
  const m = new Mundo("2026-11-25T07:00:00Z"); // 02:00 Lima
  t.after(() => m.limpiar());
  m.run("alertas.yml", { conclusion: "success", hace: 5 * 60 });
  assert.deepEqual(await m.pasada({ latido: false }), ["AVISAR:SIN_LATIDO"]);
});

test("j) servidor de casa: una pasada caído no hace nada; dos avisan; al volver avisa de la recuperación", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.casaArriba = false;
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T15:30:00Z");
  assert.deepEqual(await m.pasada(), ["AVISAR:SERVIDOR_CASA"]);
  m.at("2026-11-25T16:00:00Z").casaArriba = true;
  assert.deepEqual(await m.pasada(), ["AVISAR:SERVIDOR_CASA:recuperado"]);
});

test("j) servidor de casa caído una sola pasada y de vuelta: no avisa", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.casaArriba = false;
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-25T15:30:00Z").casaArriba = true;
  assert.deepEqual(await m.pasada(), []);
});

// ---------- k) vigía roto ----------

test("k) gh 401: avisa una vez al día y no repite en la misma jornada", async (t) => {
  const m = new Mundo("2026-11-25T15:00:00Z");
  t.after(() => m.limpiar());
  m.gh401 = true;
  assert.deepEqual(await m.pasada(), ["AVISAR:VIGIA_ROTO"]);
  m.at("2026-11-25T15:30:00Z");
  assert.deepEqual(await m.pasada(), []);
  m.at("2026-11-26T15:00:00Z");
  assert.deepEqual(await m.pasada(), ["AVISAR:VIGIA_ROTO"]); // otro día, otro aviso
});

// ---------- l) horas de silencio y resumen ----------

test("l) aviso a las 02:00 de Lima se acumula, sale en el resumen de las 08:00 y el resumen sale una sola vez", async (t) => {
  const m = new Mundo("2026-11-25T07:00:00Z", { telegramToken: "token-simulado", telegramChat: "chat-simulado" });
  t.after(() => m.limpiar());
  m.falla("FALLA  Copia de seguridad: copia de ayer");
  assert.deepEqual(await m.pasada(), []); // DESCONOCIDO de noche: silencio, sin envío
  assert.equal(m.memoria().silencio.length, 1);
  assert.equal(m.resumenes.length, 0);

  m.at("2026-11-25T13:00:00Z"); // 08:00 Lima: sale el resumen
  await m.pasada();
  assert.equal(m.resumenes.length, 1);
  assert.match(m.resumenes[0], /: 1 asunto\n/); // el aviso acumulado cuenta como asunto
  assert.match(m.resumenes[0], /Avisos acumulados en silencio: DESCONOCIDO/);
  assert.equal(m.memoria().silencio.length, 0);

  m.at("2026-11-25T13:30:00Z");
  await m.pasada();
  assert.equal(m.resumenes.length, 1); // no se repite el resumen del día
});
