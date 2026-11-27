import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clasificarFallo, clasificarWatchdog, evaluarStatus, boletinPendiente, decidir, registrarPasada,
  clasificarConNemotron, interpretarRespuesta, elegirModelo, redactar, ejecutar,
  argumentosVolverAtras, parsearEnv, rutaEnv, cargarConfig, canalesAviso, avisar, textoAviso,
  debeEnviarResumen, textoResumen, evaluarLatido, enviarTelegram,
  estadoBoletin, resumenActividad, rachaDeFallos, codigosDeFallo, resumenWeb, estadoPagos,
  enHorasSilencio, lineaVeredicto, incidenteHechos, incidenteCasa, estadoTailscale, comprobarCasa,
  tcpAbierto, esErrorAuth, detectarVigiaRoto, esErrorCodigo, argumentosReparar, diagnosticoSmoke,
  adquirirLock, liberarLock, cargarMemoria, guardarMemoria,
  aceptarCodigoNemotron, fuenteCambio, motivoFuente, formatearDuracion, resolverAbiertos, registrarAbiertos,
  claveSeguimiento, permisoBloquea,
} from "../scripts/vigia.mjs";
import { checkAccionistasSmv } from "../scripts/watchdog.js";

const H = 36e5;
const MIN = 6e4;
const ahora = new Date("2026-11-20T15:00:00Z"); // viernes 10:00 Lima, 15:00 UTC

test("clasificarFallo con mensajes reales del catálogo", () => {
  assert.equal(clasificarFallo({ workflowPath: ".github/workflows/smv-precios.yml", stepName: "Leer la página", logTail: "Error: HTTP 418 de la SMV" }), "SMV_BLOQUEO");
  assert.equal(clasificarFallo({ workflowPath: "smv.yml", stepName: "Leer la página", logTail: "respuesta inesperada de la SMV" }), "SMV_BLOQUEO");
  assert.equal(clasificarFallo({ workflowPath: "news.yml", stepName: "Guardar cambios si hay noticias nuevas o clasificaciones", logTail: "CONFLICT (content): Merge conflict in data/noticias.json" }), "CHOQUE_PUSH");
  assert.equal(clasificarFallo({ workflowPath: "deploy.yml", stepName: "Smoke de producción", logTail: "TypeError: fetch failed\nread ECONNRESET" }), "RED_PASAJERA");
  assert.equal(clasificarFallo({ workflowPath: "ci.yml", stepName: "Tests", logTail: "2 failing tests" }), "CI_ROJO");
  assert.equal(clasificarFallo({ workflowPath: "timesfm.yml", stepName: "Instalar", logTail: "cosas raras" }), "DESCONOCIDO");
});

const LOG_HECHOS = [
  "OK     Portada: 120 ms",
  "FALLA  Hechos de importancia (SMV): última lectura hace 34 h (2026-11-21T02:31:30.130Z)",
  "OK     Pruebas completas (smoke): TOTAL: 165 pruebas | 165 OK | 0 FAIL",
].join("\n");
const PASO_WATCHDOG = "Comprobar la web y los procesos diarios";

test("watchdog: el log real (solo falla Hechos, smoke OK) es SMV_BLOQUEO y nunca DESPLEGAR", () => {
  const cod = clasificarFallo({ workflowPath: ".github/workflows/watchdog.yml", stepName: PASO_WATCHDOG, logTail: LOG_HECHOS });
  assert.equal(cod, "SMV_BLOQUEO");
  const [inc] = clasificarWatchdog(LOG_HECHOS);
  assert.equal(inc.workflow, "smv.yml");
  assert.equal(inc.ageHoras, 34);
  assert.equal(inc.umbralHoras, 48);
  const acc = decidir([{ ...inc, origen: "watchdog", desde: "2026-11-22T10:00:00Z", motivo: "x" }], {}, ahora);
  assert.ok(!acc.some((a) => a.tipo === "DESPLEGAR"));
  assert.deepEqual(acc.filter((a) => a.tipo === "RELANZAR"), []);
});

test("watchdog: SMV del watchdog espera y avisa solo por encima de 48 h (hechos)", () => {
  const base = { codigo: "SMV_BLOQUEO", origen: "watchdog", umbralHoras: 48, proceso: "Hechos de importancia (SMV)", clave: "k", motivo: "x" };
  assert.deepEqual(decidir([{ ...base, ageHoras: 47 }], {}, ahora), []);
  assert.deepEqual(decidir([{ ...base, ageHoras: 49 }], {}, ahora).map((a) => a.tipo), ["AVISAR"]);
});

test("watchdog: un fallo de proceso con «hace N h» es DATO_VIEJO con el workflow dueño", () => {
  const log = "FALLA  Noticias: actualizadas hace 40 h\nOK     Pruebas completas (smoke): TOTAL: 165 pruebas | 165 OK | 0 FAIL";
  const [inc] = clasificarWatchdog(log);
  assert.equal(inc.codigo, "DATO_VIEJO");
  assert.equal(inc.workflow, "news.yml");
  const acc = decidir([inc], {}, ahora);
  assert.deepEqual(acc.map((a) => [a.tipo, a.workflow]), [["RELANZAR", "news.yml"]]);
  assert.ok(!acc.some((a) => a.tipo === "DESPLEGAR"));
});

test("watchdog: FALLA del smoke es WATCHDOG_SMOKE aunque también falle un proceso", () => {
  const log = "FALLA  Hechos de importancia (SMV): última lectura hace 34 h (x)\nFALLA  Pruebas completas (smoke): Command failed: node scripts/smoke.js";
  assert.equal(clasificarFallo({ workflowPath: "watchdog.yml", stepName: PASO_WATCHDOG, logTail: log }), "WATCHDOG_SMOKE");
  assert.equal(clasificarWatchdog(log)[0].codigo, "WATCHDOG_SMOKE");
});

test("watchdog: «Error fatal en smoke test» cuenta como fallo del smoke aunque el log diga ECONNRESET", () => {
  const log = "Error fatal en smoke test: TypeError: fetch failed\n  [cause]: Error: read ECONNRESET";
  assert.equal(clasificarFallo({ workflowPath: "watchdog.yml", stepName: PASO_WATCHDOG, logTail: log }), "WATCHDOG_SMOKE");
});

test("watchdog: proceso sin dueño o sin edad, o log sin FALLA, es DESCONOCIDO", () => {
  assert.equal(clasificarWatchdog("FALLA  Copia de seguridad: última copia de 2026-11-20, hace 40 h")[0].codigo, "DESCONOCIDO");
  assert.equal(clasificarWatchdog("FALLA  Motor: descartadas: 7.0% (70/1000)")[0].codigo, "DESCONOCIDO");
  assert.equal(clasificarWatchdog("read ECONNRESET")[0].codigo, "DESCONOCIDO");
});

test("evaluarStatus: estado viejo y estado al día", () => {
  const alDia = {
    forecasts: { ageHours: 2.3, staleAfterHours: 30 }, news: { ageHours: 1.2, staleAfterHours: 6 },
    smv: { ageHours: 0, staleAfterHours: 96 }, bcrp: { ageHours: 21.4, staleAfterHours: 96 },
    eia: { ageHours: 69.4, staleAfterHours: 240 }, d1Sync: { ageHours: 0.2, staleAfterHours: 30 },
    backup: { fecha: "2026-11-20" },
  };
  assert.deepEqual(evaluarStatus(alDia, ahora), []);
  const viejo = { ...alDia, news: { ageHours: 40, staleAfterHours: 6 }, backup: { fecha: "2026-11-19" } };
  const r = evaluarStatus(viejo, ahora);
  const news = r.find((i) => i.bloque === "news");
  assert.equal(news.codigo, "DATO_VIEJO");
  assert.equal(news.workflow, "news.yml");
  assert.ok(r.some((i) => i.bloque === "backup"));
});

test("evaluarStatus: el backup solo cuenta después de las 12:00 UTC", () => {
  const status = { backup: { fecha: "2026-11-19" } };
  assert.deepEqual(evaluarStatus(status, new Date("2026-11-20T09:00:00Z")), []);
  assert.equal(evaluarStatus(status, new Date("2026-11-20T13:00:00Z")).length, 1);
});

test("boletinPendiente: domingo nunca, lunes 10:00 Lima sin commit sí", () => {
  assert.equal(boletinPendiente([], new Date("2026-11-22T15:00:00Z")), false); // domingo
  assert.equal(boletinPendiente([], new Date("2026-11-23T15:00:00Z")), true); // lunes 10:00 Lima
});

test("boletinPendiente: compara con la fecha UTC y respeta la ventana 09-19 Lima", () => {
  const conCommit = [{ commit: { message: "data(boletin): enviado 2026-11-23" } }];
  assert.equal(boletinPendiente(conCommit, new Date("2026-11-23T15:00:00Z")), false);
  assert.equal(boletinPendiente([], new Date("2026-11-23T13:00:00Z")), false); // 08:00 Lima
  assert.equal(boletinPendiente([], new Date("2026-11-24T23:30:00Z")), true); // 18:30 Lima, sigue dentro
  assert.equal(boletinPendiente([], new Date("2026-11-25T00:30:00Z")), false); // 19:30 Lima, fuera
});

test("decidir: tercer RELANZAR del mismo workflow pasa a AVISAR", () => {
  const mem = { dia: "2026-11-20", contadores: { relanzar: { "smv-precios.yml": 2 }, desplegar: 0, volverAtras: 0 } };
  const inc = { codigo: "SMV_BLOQUEO", clave: "s1", workflow: "smv-precios.yml", desde: "2026-11-20T10:00:00Z", ageHoras: 5, motivo: "x" };
  const acc = decidir([inc], mem, ahora);
  assert.deepEqual(acc.map((a) => a.tipo), ["AVISAR"]);
});

test("decidir: SMV con primer fallo de hace 3 h relanza; nada si el workflow está en curso", () => {
  const inc = { codigo: "SMV_BLOQUEO", clave: "s1", workflow: "smv-precios.yml", desde: "2026-11-20T12:00:00Z", ageHoras: 5, motivo: "x" };
  assert.deepEqual(decidir([inc], {}, ahora).map((a) => [a.tipo, a.workflow]), [["RELANZAR", "smv-precios.yml"]]);
  assert.deepEqual(decidir([inc], {}, ahora, new Set(["smv-precios.yml"])), []);
});

test("decidir: PAGOS_ABIERTOS solo AVISAR", () => {
  const acc = decidir([{ codigo: "PAGOS_ABIERTOS", clave: "PAGOS_ABIERTOS", motivo: "x" }], {}, ahora);
  assert.deepEqual(acc.map((a) => a.tipo), ["AVISAR"]);
});

test("decidir: WATCHDOG_SMOKE un fallo suelto no hace nada, dos seguidos DESPLEGAR", () => {
  const base = { codigo: "WATCHDOG_SMOKE", clave: "WATCHDOG_SMOKE", motivo: "x" };
  assert.deepEqual(decidir([{ ...base, fallosSeguidos: 1 }], {}, ahora), []);
  assert.deepEqual(decidir([{ ...base, fallosSeguidos: 2 }], {}, ahora).map((a) => a.tipo), ["DESPLEGAR"]);
});

test("decidir: DATO_VIEJO del backup solo AVISAR, nunca RELANZAR backup.yml", () => {
  const inc = { codigo: "DATO_VIEJO", clave: "DATO_VIEJO:backup", bloque: "backup", workflow: "backup.yml", motivo: "backup viejo" };
  assert.deepEqual(decidir([inc], {}, ahora).map((a) => a.tipo), ["AVISAR"]);
});

test("decidir: DATO_VIEJO de news relanza su workflow dueño", () => {
  const inc = { codigo: "DATO_VIEJO", clave: "DATO_VIEJO:news", bloque: "news", workflow: "news.yml", motivo: "x" };
  assert.deepEqual(decidir([inc], {}, ahora).map((a) => [a.tipo, a.workflow]), [["RELANZAR", "news.yml"]]);
});

test("decidir: páginas caídas: primera pasada espera, segunda despliega, tras desplegar dos pasadas volver atrás", () => {
  const inc = { codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA", workflow: "deploy.yml", paginas: ["/dolar"], motivo: "x" };
  assert.deepEqual(decidir([inc], { incidentes: { PAGINA_CAIDA: { pasadas: 1 } } }, ahora), []);
  assert.deepEqual(decidir([inc], { incidentes: { PAGINA_CAIDA: { pasadas: 2 } } }, ahora).map((a) => a.tipo), ["DESPLEGAR"]);
  const tras = { incidentes: { PAGINA_CAIDA: { pasadas: 4, desplegadoEn: "2026-11-20T14:30:00Z", trasDespliegue: 2 } } };
  assert.deepEqual(decidir([inc], tras, ahora).map((a) => a.tipo), ["VOLVER_ATRAS", "AVISAR"]);
});

test("decidir: como mucho un VOLVER_ATRAS al día aunque fallen dos incidentes a la vez", () => {
  const pagina = { codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA", workflow: "deploy.yml", paginas: ["/"], motivo: "x" };
  const wd = { codigo: "WATCHDOG_SMOKE", clave: "WATCHDOG_SMOKE", motivo: "x", fallosTrasDespliegue: 2 };
  const mem = { incidentes: {
    PAGINA_CAIDA: { pasadas: 4, desplegadoEn: "2026-11-20T14:30:00Z", trasDespliegue: 2 },
    WATCHDOG_SMOKE: { pasadas: 4, desplegadoEn: "2026-11-20T14:30:00Z" },
  } };
  const acc = decidir([pagina, wd], mem, ahora);
  assert.equal(acc.filter((a) => a.tipo === "VOLVER_ATRAS").length, 1);
});

test("decidir: CHOQUE_PUSH solo relanza si los datos del workflow siguen viejos", () => {
  const choque = { codigo: "CHOQUE_PUSH", clave: "c1", workflow: "news.yml", runId: 1, desde: "2026-11-20T10:00:00Z", motivo: "x" };
  const viejo = { codigo: "DATO_VIEJO", clave: "DATO_VIEJO:news", workflow: "news.yml", motivo: "x" };
  assert.deepEqual(decidir([choque], {}, ahora), []);
  assert.deepEqual(decidir([choque, viejo], {}, ahora).map((a) => a.tipo), ["RELANZAR"]);
});

test("decidir: RED_PASAJERA relanza tras 30 min, espera con dos fallos y avisa al tercero", () => {
  const red = (desde) => ({ codigo: "RED_PASAJERA", clave: "r", workflow: "news.yml", runId: 9, desde, motivo: "x" });
  assert.deepEqual(decidir([red("2026-11-20T14:50:00Z")], { fallos: { "news.yml": 1 } }, ahora), []);
  assert.deepEqual(decidir([red("2026-11-20T14:00:00Z")], { fallos: { "news.yml": 1 } }, ahora).map((a) => a.tipo), ["RELANZAR"]);
  assert.deepEqual(decidir([red("2026-11-20T14:00:00Z")], { fallos: { "news.yml": 2 } }, ahora), []);
  assert.deepEqual(decidir([red("2026-11-20T14:00:00Z")], { fallos: { "news.yml": 3 } }, ahora).map((a) => a.tipo), ["AVISAR"]);
});

test("decidir: DESCONOCIDO avisa", () => {
  assert.deepEqual(decidir([{ codigo: "DESCONOCIDO", clave: "d", motivo: "x" }], {}, ahora).map((a) => a.tipo), ["AVISAR"]);
});

test("decidir: SIN_LATIDO solo avisa, nunca actúa", () => {
  const inc = { codigo: "SIN_LATIDO", clave: "SIN_LATIDO", workflow: null, motivo: "sin latido", logTail: "" };
  assert.deepEqual(decidir([inc], {}, ahora).map((a) => a.tipo), ["AVISAR"]);
});

test("registrarPasada cuenta pasadas y borra los incidentes que ya no aparecen", () => {
  const inc = { codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA" };
  const m1 = registrarPasada({}, [inc], { ahora });
  assert.equal(m1.incidentes.PAGINA_CAIDA.pasadas, 1);
  const m2 = registrarPasada(m1, [inc], { ahora });
  assert.equal(m2.incidentes.PAGINA_CAIDA.pasadas, 2);
  const m3 = registrarPasada(m2, [], { ahora });
  assert.equal(m3.incidentes.PAGINA_CAIDA, undefined);
});

test("registrarPasada cuenta cada ejecución fallida de red una sola vez", () => {
  const red = { codigo: "RED_PASAJERA", clave: "r1", workflow: "news.yml", runId: 7 };
  const m1 = registrarPasada({}, [red], { ahora });
  const m2 = registrarPasada(m1, [red], { ahora });
  assert.equal(m2.fallos["news.yml"], 1);
});

test("Nemotron: elige el modelo nano y parsea la respuesta con un fetch simulado", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/models")) return { ok: true, json: async () => ({ data: [{ id: "nvidia/nemotron-4-340b" }, { id: "nvidia/nemotron-3-nano-30b" }, { id: "nvidia/llama" }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"codigo":"RED_PASAJERA","confianza":0.9,"motivo":"ECONNRESET"}' } }] }) };
  };
  const r = await clasificarConNemotron({ workflow: "news.yml", paso: "x", logTail: "read ECONNRESET" }, { apiKey: "k", fetchImpl });
  assert.equal(r.codigo, "RED_PASAJERA");
  assert.equal(r.modelo, "nvidia/nemotron-3-nano-30b");
  assert.equal(elegirModelo(["nvidia/llama"]), null);
});

test("Nemotron: confianza baja, JSON roto o código inexistente dan DESCONOCIDO; fallo de red da null", async () => {
  assert.equal(interpretarRespuesta('{"codigo":"RED_PASAJERA","confianza":0.5}').codigo, "DESCONOCIDO");
  assert.equal(interpretarRespuesta("no es json").codigo, "DESCONOCIDO");
  assert.equal(interpretarRespuesta('{"codigo":"PAGINA_CAIDA","confianza":0.99}').codigo, "DESCONOCIDO");
  const caido = async () => { throw new Error("sin red"); };
  assert.equal(await clasificarConNemotron({ workflow: "x", paso: "", logTail: "" }, { apiKey: "k", modelo: "m", fetchImpl: caido }), null);
});

test("redactar oculta claves conocidas", () => {
  const t = redactar("RESEND_API_KEY=re_abcdefghijklmnop y nvapi-abcdefghijklmn", ["secreto-largo-123"]);
  assert.ok(!t.includes("abcdefghijklmnop"));
  assert.ok(!t.includes("nvapi-abcdefghijklmn"));
});

test("redactar oculta tokens de GitHub (ghp_, github_pat_) y de bot de Telegram", () => {
  const ghp = "ghp_" + "Q".repeat(36);
  const pat = "github_pat_" + "Z".repeat(30);
  const tg = "123456789:AAFalsoTokenDePrueba0123456789";
  const t = redactar(`token ${ghp} y ${pat} y bot ${tg} fin`);
  assert.ok(!t.includes("QQQQQQQQ"));
  assert.ok(!t.includes("ZZZZZZZZ"));
  assert.ok(!t.includes("AAFalsoToken"));
  assert.ok(t.includes("fin"));
  assert.equal(redactar("12:34:56 hora"), "12:34:56 hora");
});

test("ejecutar en modo seco no llama a gh ni a los avisos", async () => {
  const llamadas = [];
  const gh = async (a) => { llamadas.push(a); };
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, despliegues: [], historial: [] };
  const notas = await ejecutar(
    [{ tipo: "RELANZAR", workflow: "news.yml", claves: [] }, { tipo: "VOLVER_ATRAS", codigo: "PAGINA_CAIDA", claves: [] }, { tipo: "AVISAR", codigo: "CI_ROJO", motivo: "x", claves: [] }],
    memoria, { seco: true, ahora, gh, avisar: async () => { llamadas.push("aviso"); return { canal: "telegram" }; } },
  );
  assert.equal(llamadas.length, 0);
  assert.ok(notas.every((n) => n.includes("simulado")));
});

test("VOLVER_ATRAS usa rollback.yml con el código como motivo y no toca wrangler", async () => {
  assert.deepEqual(argumentosVolverAtras("WATCHDOG_SMOKE"), [
    "workflow", "run", "rollback.yml", "-R", "Wagustin/macro-data-explorer", "-f", "motivo=WATCHDOG_SMOKE",
  ]);
  const llamadas = [];
  const gh = async (a) => { llamadas.push(a); };
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, despliegues: [], historial: [] };
  await ejecutar([{ tipo: "VOLVER_ATRAS", codigo: "PAGINA_CAIDA", claves: [], incidente: {} }], memoria, {
    seco: false, ahora, gh, avisar: async () => ({ canal: null, detalle: "" }),
  });
  assert.deepEqual(llamadas, [argumentosVolverAtras("PAGINA_CAIDA")]);
  assert.equal(memoria.contadores.volverAtras, 1);
  const fuente = fs.readFileSync(new URL("../scripts/vigia.mjs", import.meta.url), "utf8");
  assert.ok(!/wrangler|npx/.test(fuente), "el vigía no debe depender de wrangler ni de npx");
});

test("VOLVER_ATRAS fallido genera un AVISAR con el error", async () => {
  const gh = async () => { throw Object.assign(new Error("HTTP 500"), { stderr: "HTTP 500: Internal Server Error" }); };
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, despliegues: [], historial: [] };
  const avisados = [];
  const notas = await ejecutar([{ tipo: "VOLVER_ATRAS", codigo: "PAGINA_CAIDA", claves: [], incidente: {} }], memoria, {
    seco: false, ahora, gh, avisar: async (a) => { avisados.push(a.motivo); return { canal: "telegram" }; },
  });
  assert.ok(notas.some((n) => n.startsWith("VOLVER_ATRAS fallido")));
  assert.ok(avisados.some((m) => m.includes("el rollback ha fallado")));
  assert.equal(memoria.contadores.volverAtras, 0);
});

test("VOLVER_ATRAS con 403 de permisos no avisa del rollback fallido: abre VIGIA_ROTO crítico y deja el token marcado", async () => {
  const gh = async () => { throw Object.assign(new Error("HTTP 403"), { stderr: "HTTP 403: Resource not accessible by personal access token" }); };
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, despliegues: [], historial: [] };
  const avisados = [];
  const acciones = [{ tipo: "VOLVER_ATRAS", codigo: "PAGINA_CAIDA", claves: [], incidente: {} }];
  await ejecutar(acciones, memoria, {
    seco: false, ahora, gh, avisar: async (a) => { avisados.push(a); return { canal: "telegram" }; },
  });
  assert.deepEqual(avisados.map((a) => a.codigo), ["VIGIA_ROTO"]);
  assert.equal(avisados[0].critico, true);
  assert.match(avisados[0].motivo, /no tiene permiso para disparar rollback\.yml: en GitHub, Settings → Developer settings → Fine-grained tokens, edita el token del vigía y pon Actions: Read and write/);
  assert.equal(memoria.permisoRoto.accion, "disparar rollback.yml");
  assert.equal(memoria.contadores.volverAtras, 0);
});

test("esErrorAuth: 401 y 403 con frase de permiso cuentan; un 403 de límite nunca", () => {
  assert.equal(esErrorAuth("HTTP 403: Resource not accessible by personal access token"), true);
  assert.equal(esErrorAuth("HTTP 403: Must have admin rights to Repository"), true);
  assert.equal(esErrorAuth("HTTP 403: Permission denied"), true);
  assert.equal(esErrorAuth("HTTP 401: Bad credentials"), true);
  assert.equal(esErrorAuth("HTTP 403: You have exceeded a secondary rate limit"), false);
  assert.equal(esErrorAuth("HTTP 403: Forbidden"), false);
  assert.equal(esErrorAuth("HTTP 404: Not Found"), false);
});

test("Nemotron nunca decide SMV_BLOQUEO sin el patrón determinista en el log", async () => {
  const conRespuesta = (codigo) => async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ codigo, confianza: 0.95, motivo: "x" }) } }] }) });
  const sinPatron = await clasificarConNemotron({ workflow: "smv.yml", paso: "x", logTail: "Error: algo raro" }, { apiKey: "k", modelo: "m", fetchImpl: conRespuesta("SMV_BLOQUEO") });
  assert.equal(sinPatron.codigo, "DESCONOCIDO");
  const otroWorkflow = await clasificarConNemotron({ workflow: "news.yml", paso: "x", logTail: "fetch failed" }, { apiKey: "k", modelo: "m", fetchImpl: conRespuesta("SMV_BLOQUEO") });
  assert.equal(otroWorkflow.codigo, "DESCONOCIDO");
  const conPatron = await clasificarConNemotron({ workflow: "smv.yml", paso: "x", logTail: "Error: HTTP 418 de la SMV" }, { apiKey: "k", modelo: "m", fetchImpl: conRespuesta("SMV_BLOQUEO") });
  assert.equal(conPatron.codigo, "SMV_BLOQUEO");
  assert.equal(aceptarCodigoNemotron("SMV_BLOQUEO", { workflow: "smv-precios.yml", logTail: "respuesta inesperada de la SMV" }), "SMV_BLOQUEO");
});

test("FUENTE_CAMBIO: 404/410 de una fuente externa con su script y URL; las URL propias no cuentan", () => {
  const log = "Error: BCRP HTTP 410 en https://estadisticas.bcrp.gob.pe/serie/1 (scripts/fetch_official.py)";
  assert.deepEqual(fuenteCambio(log), { fuente: "BCRP", codigo: 410, url: "https://estadisticas.bcrp.gob.pe/serie/1", script: "scripts/fetch_official.py" });
  assert.equal(clasificarFallo({ workflowPath: "official-data.yml", stepName: "Datos", logTail: log }), "FUENTE_CAMBIO");
  assert.equal(fuenteCambio("HTTP 404 en https://perdata.site/api/status"), null);
  assert.equal(fuenteCambio("HTTP 404 en https://api.github.com/repos/x"), null);
  assert.equal(fuenteCambio("Error: HTTP 500 de la SMV"), null);
  assert.equal(clasificarFallo({ workflowPath: "smv.yml", stepName: "Leer", logTail: "Error: HTTP 500 de la SMV" }), "DESCONOCIDO");
  assert.equal(motivoFuente("SMV HTTP 404"), "fuente SMV responde HTTP 404: no se relanza, la fuente ha cambiado su URL y relanzar no lo arregla");
});

test("permisoBloquea: 6 h desde el último intento", () => {
  const intento = { ultimoIntento: "2026-11-26T07:00:00.000Z" };
  assert.equal(permisoBloquea(null, ahora), false);
  assert.equal(permisoBloquea(intento, new Date("2026-11-26T12:59:00Z")), true);
  assert.equal(permisoBloquea(intento, new Date("2026-11-26T13:00:00Z")), false);
});

test("formatearDuracion: minutos, horas y días", () => {
  assert.equal(formatearDuracion(30 * MIN), "30 min");
  assert.equal(formatearDuracion(2 * H + 15 * MIN), "2 h 15 min");
  assert.equal(formatearDuracion(3 * H), "3 h");
  assert.equal(formatearDuracion(50 * H + 5 * H), "2 d 7 h");
});

test("Resuelto: un incidente que se cierra con el run completo del workflow, con la duración desde el fallo", () => {
  const m = { abiertos: {} };
  const fallo = { codigo: "RED_PASAJERA", workflow: "news.yml", runId: 7, desde: "2026-11-20T14:00:00Z", clave: "RED_PASAJERA:news.yml:7", motivo: "x" };
  registrarAbiertos(m, [{ tipo: "AVISAR", codigo: "RED_PASAJERA", claves: [fallo.clave], veredicto: { resultado: "enviado por telegram" } }], [fallo], "2026-11-20T15:00:00Z");
  const clave = claveSeguimiento(fallo);
  assert.equal(clave, "RED_PASAJERA:news.yml");
  const runs = [{ wf: "news.yml", status: "completed", conclusion: "success", createdAt: "2026-11-20T15:20:00Z" }];
  assert.deepEqual(resolverAbiertos(m, { ahora: new Date("2026-11-20T15:30:00Z"), runs, actuales: new Set() }).map((r) => r.texto),
    ["Resuelto: RED_PASAJERA en news.yml — se resolvió solo, duró 1 h 20 min"]);
  assert.deepEqual(m.abiertos, {});
});

test("Resuelto de noche: va al resumen si el incidente no era crítico y sale al momento si era VIGIA_ROTO", async () => {
  const noche = new Date("2026-11-26T07:00:00Z"); // 02:00 Lima
  const mem = { contadores: cont(), incidentes: {}, avisos: {}, historial: [], silencio: [] };
  const avisados = [];
  const accion = (codigo, critico) => ({
    tipo: "AVISAR", codigo: "RESUELTO", resuelto: true, motivo: `Resuelto: ${codigo} en x — se resolvió solo, duró 1 h`, claves: [],
    avisoKey: `RESUELTO:${codigo}`, critico, veredicto: { etiqueta: codigo, codigo: "RESUELTO", accion: "AVISAR", motivo: "", regla: "" },
  });
  await ejecutar([accion("DESCONOCIDO", false), accion("VIGIA_ROTO", true)], mem, {
    seco: false, ahora: noche, gh: async () => "", avisar: async (a) => { avisados.push(a.motivo); return { canal: "telegram" }; },
  });
  assert.equal(avisados.length, 1);
  assert.match(avisados[0], /VIGIA_ROTO/);
  assert.equal(mem.silencio.length, 1);
  assert.equal(mem.silencio[0].codigo, "RESUELTO");
});

test("parsearEnv: comentarios, comillas, líneas vacías y claves mal escritas", () => {
  const texto = [
    "# comentario de cabecera",
    "",
    "VIGIA_ACTUAR=1",
    'GH_TOKEN="ghp_abc"',
    "TELEGRAM_CHAT_ID='-100123'",
    "  RESEND_API_KEY = re_x  ",
    "#CLAVE_COMENTADA=no",
    "minuscula=no",
    "TELEGRAM_BOT_TOKEN=123:abc # nota final",
    "EMAIL_FROM=",
  ].join("\r\n");
  const e = parsearEnv(texto);
  assert.equal(e.VIGIA_ACTUAR, "1");
  assert.equal(e.GH_TOKEN, "ghp_abc");
  assert.equal(e.TELEGRAM_CHAT_ID, "-100123");
  assert.equal(e.RESEND_API_KEY, "re_x");
  assert.equal(e.TELEGRAM_BOT_TOKEN, "123:abc");
  assert.equal(e.EMAIL_FROM, "");
  assert.equal("CLAVE_COMENTADA" in e, false);
  assert.equal("minuscula" in e, false);
});

test("rutaEnv: VIGIA_ENV_FILE, luego ~/perdata-vigia/env, luego ~/.config/perdata-vigia/env", () => {
  assert.equal(rutaEnv({ VIGIA_ENV_FILE: "/x/env" }, "/home/u", () => true), "/x/env");
  assert.equal(rutaEnv({}, "/home/u", () => true), "/home/u/perdata-vigia/env");
  assert.equal(rutaEnv({}, "/home/u", () => false), "/home/u/.config/perdata-vigia/env");
});

test("cargarConfig lee el archivo y deja que el entorno del proceso mande", () => {
  const texto = "GH_TOKEN=ghp_archivo_prueba_0000000000\nVIGIA_ACTUAR=0\nVIGIA_EMAIL=\"a@b.c\"\nVIGIA_NVIDIA_API_KEY=nvapi-xyz\n";
  const cfg = cargarConfig({ env: { VIGIA_ACTUAR: "1" }, home: "/home/u", leer: () => texto });
  assert.equal(cfg.actuar, "1");
  assert.equal(cfg.ghToken, "ghp_archivo_prueba_0000000000");
  assert.equal(cfg.email, "a@b.c");
  assert.equal(cfg.apiKey, "nvapi-xyz");
  assert.equal(cfg.resendKey, undefined);
});

test("canales de aviso: Telegram, si no correo, si no solo log", async () => {
  const tg = { telegramToken: "t:1234567890123456789012345", telegramChat: "42" };
  const mail = { email: "a@b.c", resendKey: "re_x", emailFrom: "vigia@b.c" };
  assert.deepEqual(canalesAviso({ ...tg, ...mail }), ["telegram", "correo"]);
  assert.deepEqual(canalesAviso(mail), ["correo"]);
  assert.deepEqual(canalesAviso({}), []);

  const a = { codigo: "CI_ROJO", motivo: "x", accion: null, incidente: {} };
  const llamadas = [];
  const telegram = async () => { llamadas.push("tg"); return "enviado"; };
  const correo = async () => { llamadas.push("mail"); return "enviado"; };
  assert.deepEqual(await avisar(a, { ...tg, ...mail }, { telegram, correo }), { canal: "telegram", detalle: "", telegramFallo: false });
  assert.deepEqual(llamadas, ["tg"]);

  const caidoTg = async () => { throw new Error("Telegram respondió 500"); };
  assert.equal((await avisar(a, { ...tg, ...mail }, { telegram: caidoTg, correo })).canal, "correo");

  const sinNada = await avisar(a, {}, { telegram, correo });
  assert.equal(sinNada.canal, null);
  assert.equal(sinNada.detalle, "sin Telegram ni correo configurados");
});

test("textoAviso: como mucho 3500 caracteres y sin secretos", () => {
  const token = "123456789:AAFalsoTokenDePrueba0123456789";
  const a = { codigo: "DESCONOCIDO", motivo: "x", incidente: { logTail: `GH_TOKEN=${"Y".repeat(36)} ${"línea de log\n".repeat(900)}` } };
  const texto = textoAviso(a, [token], ahora);
  assert.ok(texto.length <= 3500);
  assert.ok(texto.startsWith("PerData vigía · DESCONOCIDO"));
  assert.ok(!texto.includes("YYYYYYYY"));
});

test("enviarTelegram: POST a sendMessage con chat_id y texto plano; error si no es 200", async () => {
  const pedidos = [];
  const fetchOk = async (url, opts) => { pedidos.push({ url, body: JSON.parse(opts.body) }); return { ok: true }; };
  assert.equal(await enviarTelegram("hola", { token: "T", chatId: "42", fetchImpl: fetchOk }), "enviado");
  assert.equal(pedidos[0].url, "https://api.telegram.org/botT/sendMessage");
  assert.equal(pedidos[0].body.chat_id, "42");
  assert.equal(pedidos[0].body.text, "hola");
  const fetchMal = async () => ({ ok: false, status: 401 });
  await assert.rejects(enviarTelegram("x", { token: "T", chatId: "42", fetchImpl: fetchMal }), /401/);
});

test("SIN_LATIDO: último run de datos de hace más de 4 h, o /api/status caído", () => {
  const run = (wf, horas) => ({ wf, createdAt: new Date(ahora.getTime() - horas * H).toISOString() });
  assert.equal(evaluarLatido({ runs: [run("alertas.yml", 0.5), run("news.yml", 2)], ahora }), null);
  const viejo = evaluarLatido({ runs: [run("news.yml", 5), run("smv.yml", 9)], ahora });
  assert.equal(viejo.codigo, "SIN_LATIDO");
  assert.match(viejo.motivo, /news\.yml/);
  assert.equal(evaluarLatido({ runs: [run("ci.yml", 0.1)], ahora }).codigo, "SIN_LATIDO"); // ci.yml no es de datos
  assert.equal(evaluarLatido({ runs: null, statusFallo: true, ahora }).codigo, "SIN_LATIDO");
  assert.equal(evaluarLatido({ runs: [run("alertas.yml", 0.2)], statusFallo: false, ahora }), null);
  // watchdog.yml cuenta como latido: con watchdog reciente y news de hace 5 h no hay alarma
  assert.equal(evaluarLatido({ runs: [run("watchdog.yml", 0.3), run("news.yml", 5)], ahora }), null);
  assert.equal(evaluarLatido({ runs: [run("watchdog.yml", 5)], ahora }).codigo, "SIN_LATIDO");
});

test("modo seco: la memoria simulada aplica los límites; el segundo DESPLEGAR del día no aparece", async () => {
  const gh = async () => { throw new Error("en modo seco no se llama a gh"); };
  const avisos = [];
  const pasada = async (incs, mem, t) => {
    const m = registrarPasada(mem, incs, { ahora: t });
    const acc = decidir(incs, m, t, new Set(), []);
    const notas = await ejecutar(acc, m, { seco: true, ahora: t, gh, avisar: async (a) => { avisos.push(a.codigo); return { canal: "telegram" }; } });
    return { m, acc, notas };
  };
  const pag = [{ codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA", workflow: "deploy.yml", paginas: ["/"], motivo: "x" }];
  const wd = [{ codigo: "WATCHDOG_SMOKE", clave: "WATCHDOG_SMOKE", motivo: "x", fallosSeguidos: 2 }];
  const p1 = await pasada(pag, {}, new Date("2026-11-20T15:00:00Z"));
  assert.deepEqual(p1.acc, []);
  const p2 = await pasada(pag, p1.m, new Date("2026-11-20T15:30:00Z"));
  assert.deepEqual(p2.acc.map((a) => a.tipo), ["DESPLEGAR"]);
  assert.equal(p2.m.contadores.desplegar, 1);
  assert.deepEqual(p2.notas, ["DESPLEGAR deploy.yml (simulado)"]);
  const p3 = await pasada(wd, p2.m, new Date("2026-11-20T16:00:00Z"));
  assert.deepEqual(p3.acc.map((a) => a.tipo), ["AVISAR"]);
  assert.match(p3.acc[0].motivo, /límite de 1 DESPLEGAR por día/);
  assert.equal(p3.m.contadores.desplegar, 1);
  assert.deepEqual(avisos, []); // en seco no sale ningún aviso real
});

test("modo seco: un DATO_VIEJO se relanza una vez y no se repite cada 30 min; queda en el historial simulado", async () => {
  const gh = async () => { throw new Error("no"); };
  const news = { codigo: "DATO_VIEJO", clave: "DATO_VIEJO:news", bloque: "news", workflow: "news.yml", motivo: "x" };
  let m = {};
  const tipos = [];
  for (const minutos of [0, 30, 60]) {
    const t = new Date(ahora.getTime() + minutos * MIN);
    m = registrarPasada(m, [{ ...news }], { ahora: t });
    const acc = decidir([{ ...news }], m, t);
    tipos.push(acc.map((a) => a.tipo));
    await ejecutar(acc, m, { seco: true, ahora: t, gh, avisar: async () => ({ canal: "x" }) });
  }
  assert.deepEqual(tipos, [["RELANZAR"], [], []]);
  assert.equal(m.contadores.relanzar["news.yml"], 1);
  assert.equal(m.historial.filter((h) => h.tipo === "RELANZAR").length, 1);
});

test("motivo en cada decisión: una línea por incidente con la regla aplicada", () => {
  const incs = clasificarWatchdog(LOG_HECHOS).map((d) => ({ ...d, desde: "2026-11-22T10:00:00Z", motivo: "x" }));
  const veredictos = [];
  decidir(incs, {}, ahora, new Set(), veredictos);
  assert.equal(veredictos.length, 1);
  assert.match(lineaVeredicto(veredictos[0]), /^  · SMV_BLOQUEO@watchdog: ESPERAR — hechos 34 h < 48 h, el plan B del servidor lo cubre \(regla: .+\)$/);
});

test("motivo en cada decisión: un veredicto por incidente, con el resultado de la ejecución", async () => {
  const incs = [
    { codigo: "DATO_VIEJO", clave: "DATO_VIEJO:news", bloque: "news", workflow: "news.yml", motivo: "news con 40 h" },
    { codigo: "PAGOS_ABIERTOS", clave: "PAGOS_ABIERTOS", motivo: "x" },
    { codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA", workflow: "deploy.yml", paginas: ["/"], motivo: "x" },
  ];
  const veredictos = [];
  const acc = decidir(incs, {}, ahora, new Set(), veredictos);
  assert.equal(veredictos.length, 3);
  assert.deepEqual(veredictos.map((v) => v.accion), ["RELANZAR news.yml", "AVISAR", "ESPERAR"]);
  await ejecutar(acc, { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, historial: [] }, {
    seco: true, ahora, gh: async () => {}, avisar: async () => ({ canal: "x" }),
  });
  assert.equal(veredictos[0].resultado, "simulado (seco)");
  assert.match(lineaVeredicto(veredictos[0]), / — news con 40 h \(regla: .+\) => simulado \(seco\)$/);
});

test("SERVIDOR_CASA: avisa tras dos pasadas caídas y avisa de la recuperación", async () => {
  const caido = incidenteCasa({ arriba: false, detalle: "Tailscale: sin dato; TCP 22: sin respuesta" }, {});
  const m1 = registrarPasada({}, [caido], { ahora });
  assert.deepEqual(decidir([caido], m1, ahora), []);
  const m2 = registrarPasada(m1, [caido], { ahora: new Date(ahora.getTime() + 30 * MIN) });
  const acc = decidir([caido], m2, new Date(ahora.getTime() + 30 * MIN));
  assert.deepEqual(acc.map((a) => a.tipo), ["AVISAR"]);
  assert.match(acc[0].motivo, /no responde: los planes B de la SMV no correrán/);

  assert.equal(incidenteCasa({ arriba: true, detalle: "" }, m1), null); // una sola pasada caída no avisa al volver
  const rec = incidenteCasa({ arriba: true, detalle: "" }, m2);
  assert.equal(rec.recuperado, true);
  const t3 = new Date(ahora.getTime() + 60 * MIN);
  const m3 = registrarPasada(m2, [rec], { ahora: t3 });
  const accRec = decidir([rec], m3, t3);
  assert.deepEqual(accRec.map((a) => a.tipo), ["AVISAR"]);
  assert.match(accRec[0].motivo, /responde de nuevo/);
  // el aviso de recuperación no se confunde con el de caída dentro de las 6 h
  const enviados = [];
  await ejecutar(accRec, { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: { SERVIDOR_CASA: new Date(t3 - H).toISOString() }, historial: [] }, {
    seco: false, ahora: t3, gh: async () => {}, avisar: async (a) => { enviados.push(a.codigo); return { canal: "telegram" }; },
  });
  assert.deepEqual(enviados, ["SERVIDOR_CASA"]);
});

test("SERVIDOR_CASA: Tailscale primero, TCP de respaldo, y sin tailscale se salta sin error", async () => {
  assert.equal(estadoTailscale(JSON.stringify({ Peer: { a: { HostName: "wagus-server", Online: true } } })), true);
  assert.equal(estadoTailscale(JSON.stringify({ Peer: { a: { HostName: "wagus-server", Online: false } } })), false);
  assert.equal(estadoTailscale(JSON.stringify({ Peer: { a: { HostName: "otro", Online: true } } })), null);
  assert.equal(estadoTailscale("no es json"), null);
  let tcpLlamado = false;
  const tcp = async () => { tcpLlamado = true; return false; };
  assert.equal((await comprobarCasa({ tailscale: async () => true, tcp })).arriba, true);
  assert.equal(tcpLlamado, false);
  assert.equal((await comprobarCasa({ tailscale: async () => null, tcp: async () => false })).arriba, false);
  assert.equal((await comprobarCasa({ tailscale: async () => false, tcp: async () => true })).arriba, true);
  assert.equal(await tcpAbierto("127.0.0.1", 1, 500), false); // puerto cerrado en local: no hay red externa
});

test("hechos de la SMV: 47 h no avisa; 49 h avisa con SMV_BLOQUEO y el plan B; el watchdog no lo duplica", () => {
  const json = (h) => ({ actualizado: new Date(ahora.getTime() - h * H).toISOString() });
  assert.equal(incidenteHechos(json(47), ahora), null);
  const inc = incidenteHechos(json(49), ahora);
  assert.equal(inc.codigo, "SMV_BLOQUEO");
  const acc = decidir([inc], {}, ahora);
  assert.deepEqual(acc.map((a) => a.tipo), ["AVISAR"]);
  assert.match(acc[0].motivo, /^hechos de la SMV con 49 h: revisar el plan B del servidor, scripts\/smv-plan-b-hechos\.sh, y ~\/\.local\/state\/smv-plan-b\.log$/);
  assert.equal(incidenteHechos(json(49), ahora, [{ codigo: "SMV_BLOQUEO", proceso: "Hechos de importancia (SMV)", ageHoras: 49 }]), null);
  assert.equal(incidenteHechos(null, ahora), null);
});

test("horas de silencio: 02:00 Lima acumula el aviso normal; PAGOS_ABIERTOS se envía", async () => {
  const t = new Date("2026-11-20T07:00:00Z"); // 02:00 Lima
  assert.equal(enHorasSilencio(t), true);
  assert.equal(enHorasSilencio(new Date("2026-11-20T04:00:00Z")), true); // 23:00 Lima
  assert.equal(enHorasSilencio(new Date("2026-11-20T03:59:00Z")), false); // 22:59 Lima
  assert.equal(enHorasSilencio(new Date("2026-11-20T12:00:00Z")), false); // 07:00 Lima
  const enviados = [];
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, historial: [], silencio: [] };
  const acc = decidir([
    { codigo: "CI_ROJO", clave: "CI_ROJO", motivo: "CI en main en rojo" },
    { codigo: "PAGOS_ABIERTOS", clave: "PAGOS_ABIERTOS", motivo: "paymentsEnabled distinto de false" },
  ], memoria, t);
  const notas = await ejecutar(acc, memoria, { seco: false, ahora: t, gh: async () => {}, avisar: async (a) => { enviados.push(a.codigo); return { canal: "telegram" }; } });
  assert.deepEqual(enviados, ["PAGOS_ABIERTOS"]);
  assert.deepEqual(memoria.silencio.map((s) => s.codigo), ["CI_ROJO"]);
  assert.ok(notas.some((n) => n.startsWith("AVISAR CI_ROJO en silencio")));
  const resumen = textoResumen({ ...TODO_BIEN, ahora: t, silencio: memoria.silencio });
  assert.match(resumen, /Avisos acumulados en silencio: CI_ROJO \(CI en main en rojo: lo arregla Claude, no se despliega\)\./);
  assert.match(resumen, /^PerData · 2026-11-20: 1 asunto$/m);
});

test("de noche, el aviso de una vuelta atrás ya ejecutada sí se envía", async () => {
  const t = new Date("2026-11-20T07:00:00Z");
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: { WATCHDOG_SMOKE: { pasadas: 4, desplegadoEn: "2026-11-20T06:00:00Z", trasDespliegue: 2 } }, avisos: {}, historial: [], silencio: [] };
  const acc = decidir([{ codigo: "WATCHDOG_SMOKE", clave: "WATCHDOG_SMOKE", motivo: "x", fallosTrasDespliegue: 2 }], memoria, t);
  assert.deepEqual(acc.map((a) => a.tipo), ["VOLVER_ATRAS", "AVISAR"]);
  const enviados = [];
  await ejecutar(acc, memoria, { seco: false, ahora: t, gh: async () => {}, avisar: async (a) => { enviados.push(a.codigo); return { canal: "telegram" }; } });
  assert.deepEqual(enviados, ["WATCHDOG_SMOKE"]);
});

test("resumen diario: una vez al día desde las 08:00 de Lima, también en modo seco", () => {
  assert.equal(debeEnviarResumen({}, new Date("2026-11-20T12:59:00Z")), false); // 07:59 Lima
  assert.equal(debeEnviarResumen({}, new Date("2026-11-20T13:00:00Z")), true); // 08:00 Lima
  assert.equal(debeEnviarResumen({ resumenDia: "2026-11-20" }, new Date("2026-11-20T18:00:00Z")), false);
  assert.equal(debeEnviarResumen({ resumenDia: "2026-11-20" }, new Date("2026-11-21T13:30:00Z")), true);
});

// Datos de un resumen sano; cada test cambia solo lo que prueba.
const TODO_BIEN = {
  fecha: "2026-11-20", ahora,
  actividad: { runs: 84, fallos: 0, grupos: [] },
  boletin: "enviado",
  web: { viejos: [], hechosH: 5, smvH: 12, backupFecha: "2026-11-20" },
  pagos: { estado: "en pausa", detalle: "" },
  paginas: [{ ruta: "/", codigo: 200 }, { ruta: "/dolar", codigo: 200 }, { ruta: "/precios", codigo: 200 }, { ruta: "/boletin", codigo: 200 }],
  casa: { arriba: true, detalle: "Tailscale: en línea; TCP 22: no comprobado" },
  historial: [], silencio: [],
};
const corrida = (nombre, conclusion, minutos, codigos) => ({
  workflowName: nombre, wf: "x.yml", status: "completed", conclusion,
  createdAt: new Date(ahora.getTime() - minutos * MIN).toISOString(), codigos,
});

test("resumen: todo OK tiene veredicto OK y cada punto dice OK o su problema", () => {
  const t = textoResumen(TODO_BIEN);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: OK");
  assert.match(t, /^1\. Boletín: OK, commit «data\(boletin\): enviado 2026-11-20» en main\./m);
  assert.match(t, /^2\. GitHub Actions 24 h: 84 runs, 0 fallos\. OK\./m);
  assert.match(t, /^3\. \/api\/status OK: hechos SMV de hace 5 h, cotizaciones de hace 12 h, respaldo de hoy: sí\./m);
  assert.match(t, /^4\. Pagos: en pausa .*OK\./m);
  assert.match(t, /^5\. Páginas OK: \/ 200, \/dolar 200, \/precios 200, \/boletin 200\./m);
  assert.match(t, /^Servidor de casa: en línea \(.*\)\. Acciones del vigía \(24 h\): ninguna\. Avisos acumulados en silencio: ninguno\.$/m);
  assert.ok(t.length <= 3500);
});

test("resumen: domingo no toca el boletín y no cuenta como asunto", () => {
  assert.equal(estadoBoletin([], new Date("2026-11-22T15:00:00Z")), "domingo");
  const t = textoResumen({ ...TODO_BIEN, boletin: "domingo" });
  assert.match(t, /^1\. Boletín: domingo, no toca\.$/m);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: OK");
});

test("resumen: boletín que no salió es un asunto con su texto", () => {
  assert.equal(estadoBoletin([], new Date("2026-11-23T15:00:00Z")), "no salió");
  assert.equal(estadoBoletin(null, new Date("2026-11-23T15:00:00Z")), "sin dato");
  const t = textoResumen({ ...TODO_BIEN, boletin: "no salió" });
  assert.match(t, /^1\. Boletín: NO SALIÓ, no hay commit «data\(boletin\): enviado 2026-11-20» en main\.$/m);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: 1 asunto");
});

test("resumen: dos o más fallos seguidos sin éxito en medio van marcados «atención»", () => {
  const runs = [
    corrida("Watchdog", "failure", 60, ["SMV_BLOQUEO"]),
    corrida("Watchdog", "failure", 120, ["SMV_BLOQUEO"]),
    corrida("Watchdog", "failure", 180, ["SMV_BLOQUEO"]),
    corrida("Watchdog", "success", 240, undefined),
    corrida("News", "failure", 30, ["RED_PASAJERA"]),
    corrida("News", "success", 60, undefined),
    corrida("News", "failure", 90, ["RED_PASAJERA"]),
  ];
  const act = resumenActividad(runs, ahora);
  assert.equal(act.runs, 7);
  assert.equal(act.fallos, 5);
  const w = act.grupos.find((g) => g.nombre === "Watchdog");
  assert.equal(w.total, 3);
  assert.equal(w.seguidos, 3);
  assert.equal(act.grupos.find((g) => g.nombre === "News").seguidos, 1);
  const t = textoResumen({ ...TODO_BIEN, actividad: act });
  assert.match(t, /Watchdog ×3 \(SMV_BLOQUEO\) \[atención: 3 fallos seguidos\]/);
  assert.match(t, /News ×2 \(RED_PASAJERA\)\.$/m);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: 1 asunto");
});

test("resumen: rachas, códigos de watchdog y fallos sin clasificar", () => {
  assert.equal(rachaDeFallos([corrida("A", "failure", 1), corrida("A", "cancelled", 2), corrida("A", "failure", 3), corrida("A", "success", 4)]), 2);
  assert.deepEqual(codigosDeFallo("watchdog.yml", "Comprobar la web", "FALLA  Hechos de importancia (SMV): hace 60 h\nFALLA  Noticias: hace 2 h"), ["SMV_BLOQUEO", "DATO_VIEJO"]);
  assert.deepEqual(codigosDeFallo("news.yml", "Instalar", "read ECONNRESET"), ["RED_PASAJERA"]);
  const sin = resumenActividad([corrida("Noticias", "failure", 5)], ahora);
  assert.equal(sin.grupos[0].texto, "Noticias ×1 (sin clasificar)");
});

test("resumen: pagos abiertos es un asunto; en pausa exige el 503 payments_paused", () => {
  assert.equal(estadoPagos({ paymentsEnabled: false }, { status: 503, code: "payments_paused" }).estado, "en pausa");
  assert.equal(estadoPagos({ paymentsEnabled: false }, { status: 200, code: null }).estado, "discrepancia");
  assert.equal(estadoPagos({ paymentsEnabled: false }, null).estado, "sin dato");
  assert.equal(estadoPagos({ paymentsEnabled: true }, null).estado, "abiertos");
  const t = textoResumen({ ...TODO_BIEN, pagos: estadoPagos({ paymentsEnabled: true }, null) });
  assert.match(t, /^4\. Pagos ABIERTOS: paymentsEnabled distinto de false\. Avisar, no tocar\.$/m);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: 1 asunto");
});

test("resumen: página caída con su código HTTP", () => {
  const t = textoResumen({ ...TODO_BIEN, paginas: [{ ruta: "/", codigo: 200 }, { ruta: "/boletin", codigo: 503 }, { ruta: "/dolar", codigo: null }, { ruta: "/precios", codigo: 200 }] });
  assert.match(t, /^5\. Páginas CAÍDAS: \/boletin 503, \/dolar sin respuesta\. Todas: \/ 200, \/boletin 503, \/dolar sin respuesta, \/precios 200\.$/m);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: 1 asunto");
});

test("resumen: /api/status con bloques viejos, respaldo de hoy no hecho y servidor de casa caído", () => {
  const web = resumenWeb({
    news: { ageHours: 7.2, staleAfterHours: 6 }, smv: { ageHours: 20, staleAfterHours: 96 },
    bcrp: { error: "official_data_unreachable", ageHours: null, staleAfterHours: 96 },
    backup: { fecha: "2026-11-19" },
  }, { actualizado: "2026-11-18T13:00:00Z" }, ahora);
  assert.deepEqual(web.viejos, ["news 7.2 h (límite 6 h)", "bcrp (error official_data_unreachable)"]);
  assert.equal(web.hechosH, 50);
  const t = textoResumen({ ...TODO_BIEN, web, casa: { arriba: false, detalle: "Tailscale: sin conexión; TCP 22: sin respuesta" } });
  assert.match(t, /^3\. \/api\/status: bloques viejos: news 7\.2 h \(límite 6 h\); bcrp \(error official_data_unreachable\)\. hechos de la SMV con más de 48 h\. respaldo de hoy NO hecho \(último 2026-11-19\)\./m);
  assert.match(t, /^Servidor de casa: CAÍDO \(Tailscale: sin conexión; TCP 22: sin respuesta\)\./m);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: 5 asuntos");
});

test("resumen: sin /api/status ni GitHub se dice que no responde", () => {
  const t = textoResumen({ ...TODO_BIEN, web: null, actividad: null });
  assert.match(t, /^3\. \/api\/status: no responde\.$/m);
  assert.match(t, /^2\. GitHub Actions 24 h: no comprobado \(gh no responde\)\.$/m);
});

test("resumen en seco: marcado [modo prueba] y con lo que habría hecho", () => {
  const t = textoResumen({
    ...TODO_BIEN, modo: "seco",
    historial: [
      { fecha: "2026-11-20T10:00:00Z", tipo: "RELANZAR", detalle: "news.yml" },
      { fecha: "2026-11-19T01:00:00Z", tipo: "DESPLEGAR", detalle: "deploy.yml" }, // fuera de 24 h
    ],
  });
  assert.match(t, /^\[modo prueba\] PerData · 2026-11-20: OK$/m);
  assert.match(t, /Acciones que HABRÍA hecho \(memoria simulada, 24 h\): RELANZAR 1\./);
});

test("resumen: avisos en silencio cuentan como asuntos y se recortan a 10 en el texto", () => {
  const silencio = Array.from({ length: 12 }, (_, i) => ({ codigo: `DESCONOCIDO${i}`, motivo: "x" }));
  const t = textoResumen({ ...TODO_BIEN, silencio });
  assert.match(t, /y 2 más\./);
  assert.equal(t.split("\n")[0], "PerData · 2026-11-20: 12 asuntos");
});

test("VIGIA_ROTO: un 401 de gh o de NVIDIA se avisa, una vez al día", async () => {
  assert.equal(esErrorAuth("HTTP 401: Bad credentials"), true);
  assert.equal(esErrorAuth("gh: HTTP 403 Resource not accessible"), true);
  assert.equal(esErrorAuth("API rate limit exceeded (HTTP 403)"), false);
  assert.equal(esErrorAuth("read ECONNRESET"), false);
  const registro = new Set();
  const fetch401 = async () => ({ ok: false, status: 401 });
  assert.equal(await clasificarConNemotron({ workflow: "x", paso: "", logTail: "" }, { apiKey: "k", modelo: "m", fetchImpl: fetch401, senales: registro }), null);
  assert.ok(registro.has("nvidia-401"));
  const incs = detectarVigiaRoto({ senales: new Set(["gh-permiso"]) });
  assert.equal(incs.length, 1);
  assert.match(incs[0].motivo, /GH_TOKEN en ~\/perdata-vigia\/env/);
  assert.deepEqual(decidir(incs, {}, ahora).map((a) => a.tipo), ["AVISAR"]);
  // Como mucho un aviso cada 6 h: decidir lo propone siempre y ejecutar lo suprime dentro de la ventana.
  const enviados = [];
  const memoria = { contadores: cont(), incidentes: {}, avisos: { VIGIA_ROTO: new Date(ahora.getTime() - 5 * H).toISOString() }, historial: [], silencio: [] };
  await ejecutar(decidir(incs, memoria, ahora), memoria, { seco: false, ahora, gh: async () => "", avisar: async (a) => { enviados.push(a.codigo); return { canal: "telegram" }; } });
  assert.deepEqual(enviados, []);
  const despues = new Date(ahora.getTime() + 2 * H);
  await ejecutar(decidir(incs, memoria, despues), memoria, { seco: false, ahora: despues, gh: async () => "", avisar: async (a) => { enviados.push(a.codigo); return { canal: "telegram" }; } });
  assert.deepEqual(enviados, ["VIGIA_ROTO"]);
  assert.deepEqual(detectarVigiaRoto({ senales: new Set() }), []);
});

test("VIGIA_ROTO: Telegram que falla dos veces seguidas; avisar() informa del fallo de Telegram", async () => {
  assert.deepEqual(detectarVigiaRoto({ telegramFallos: 1 }), []);
  assert.equal(detectarVigiaRoto({ telegramFallos: 2 })[0].codigo, "VIGIA_ROTO");
  const r = await avisar({ codigo: "CI_ROJO", motivo: "x", accion: null, incidente: {} },
    { telegramToken: "t", telegramChat: "1", email: "a@b.c", resendKey: "re_x", emailFrom: "v@b.c" },
    { telegram: async () => { throw new Error("Telegram respondió 500"); }, correo: async () => "enviado" });
  assert.deepEqual(r, { canal: "correo", detalle: "", telegramFallo: true });
});

test("cada aviso lleva «Qué hacer a mano:» con el comando del RUNBOOK", () => {
  const t = textoAviso({ codigo: "SMV_BLOQUEO", motivo: "x", incidente: {} }, [], ahora);
  assert.match(t, /Qué hacer a mano: curl -s https:\/\/perdata\.site\/api\/status \| jq '\.smv\.ageHours'/);
  assert.match(textoAviso({ codigo: "CODIGO_RARO", motivo: "x", incidente: {} }, [], ahora), /Qué hacer a mano: leer el final del log/);
});

test("registrarPasada cuenta las pasadas del día y los incidentes distintos", () => {
  const inc = { codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA" };
  const m1 = registrarPasada({}, [inc], { ahora });
  const m2 = registrarPasada(m1, [inc], { ahora: new Date(ahora.getTime() + 30 * MIN) });
  assert.equal(m2.pasadasDia, 2);
  assert.deepEqual(m2.incidentesDia, { PAGINA_CAIDA: "PAGINA_CAIDA" });
});

test("de noche, un VOLVER_ATRAS que falla también se envía (la web puede seguir caída)", async () => {
  const t = new Date("2026-11-20T07:00:00Z"); // 02:00 Lima
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, historial: [], silencio: [] };
  const acc = [{ tipo: "VOLVER_ATRAS", codigo: "PAGINA_CAIDA", claves: [], incidente: {} }];
  const enviados = [];
  const notas = await ejecutar(acc, memoria, {
    seco: false, ahora: t, gh: async () => { throw Object.assign(new Error("HTTP 403"), { stderr: "HTTP 403" }); },
    avisar: async (a) => { enviados.push(a.motivo); return { canal: "telegram" }; },
  });
  assert.ok(notas.some((n) => n.startsWith("VOLVER_ATRAS fallido")));
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /el rollback ha fallado/);
  assert.deepEqual(memoria.silencio, []);
});

const cont = () => ({ relanzar: {}, desplegar: 0, volverAtras: 0, reparar: {} });
const fallo = (runId, createdAt) => ({ databaseId: runId, status: "completed", conclusion: "failure", createdAt });

test("clasificarFallo: error de código en un workflow de datos es ERROR_CODIGO; con red, no", () => {
  assert.equal(clasificarFallo({ workflowPath: "news.yml", stepName: "Generar", logTail: "TypeError: x is not a function" }), "ERROR_CODIGO");
  assert.equal(clasificarFallo({ workflowPath: "news.yml", stepName: "Generar", logTail: "TypeError: fetch failed\nread ECONNRESET" }), "RED_PASAJERA");
  assert.equal(clasificarFallo({ workflowPath: "deploy.yml", stepName: "Build", logTail: "TypeError: x is not a function" }), "DESCONOCIDO");
  assert.equal(clasificarFallo({ workflowPath: "ci.yml", stepName: "Tests", logTail: "TypeError: x" }), "CI_ROJO");
});

test("esErrorCodigo: detecta errores de código y excluye red, SMV, choque push y rate limit", () => {
  assert.equal(esErrorCodigo("TypeError: foo is not a function\n  at routes.js:12:4"), true);
  assert.equal(esErrorCodigo("ReferenceError: bar is not defined"), true);
  assert.equal(esErrorCodigo("SyntaxError: Unexpected token '}'"), true);
  assert.equal(esErrorCodigo("Cannot read properties of undefined (reading 'x')"), true);
  assert.equal(esErrorCodigo("Error: read ECONNRESET"), false);
  assert.equal(esErrorCodigo("TypeError: fetch failed\nread ECONNRESET"), false);
  assert.equal(esErrorCodigo("HTTP 418 de la SMV: respuesta inesperada"), false);
  assert.equal(esErrorCodigo("CONFLICT (content): Merge conflict in data/noticias.json"), false);
  assert.equal(esErrorCodigo("API rate limit exceeded"), false);
  assert.equal(esErrorCodigo("sin clasificar: algo raro"), false);
});

test("REPARAR: CI_ROJO avisa y pide REPARAR una vez; con el límite del workflow ya usado, no", () => {
  const ci = { codigo: "CI_ROJO", clave: "CI_ROJO:ci.yml:1", workflow: "ci.yml", runId: 1, motivo: "x" };
  const acc = decidir([ci], {}, ahora);
  assert.deepEqual(acc.map((a) => a.tipo), ["AVISAR", "REPARAR"]);
  assert.deepEqual(acc[1].claves, ["CI_ROJO:ci.yml:1"]);
  assert.deepEqual(decidir([ci], { dia: "2026-11-20", contadores: { ...cont(), reparar: { "ci.yml": 1 } } }, ahora).map((a) => a.tipo), ["AVISAR"]);
});

test("REPARAR: ERROR_CODIGO una vez por workflow en la pasada; máximo 2 al día en total; nunca con reparar.yml en curso", () => {
  const err = (wf, id) => ({ codigo: "ERROR_CODIGO", clave: `ERROR_CODIGO:${wf}:${id}`, workflow: wf, runId: id, motivo: "TypeError" });
  const dos = decidir([err("news.yml", 5), err("news.yml", 6)], {}, ahora);
  assert.equal(dos.filter((a) => a.tipo === "REPARAR").length, 1);
  const total = decidir([err("timesfm.yml", 7)], { dia: "2026-11-20", contadores: { ...cont(), reparar: { "news.yml": 1, "smv.yml": 1 } } }, ahora);
  assert.deepEqual(total.map((a) => a.tipo), ["AVISAR"]);
  const enCurso = decidir([err("news.yml", 8)], {}, ahora, new Set(["reparar.yml"]));
  assert.deepEqual(enCurso.map((a) => a.tipo), ["AVISAR"]);
});

test("REPARAR: el aviso de ERROR_CODIGO tiene clave por workflow y no silencia el de otro", async () => {
  const err = (wf, id) => ({ codigo: "ERROR_CODIGO", clave: `ERROR_CODIGO:${wf}:${id}`, workflow: wf, runId: id, motivo: "TypeError" });
  const memoria = { contadores: cont(), incidentes: {}, avisos: {}, historial: [], silencio: [] };
  const enviados = [];
  await ejecutar(decidir([err("news.yml", 1), err("smv.yml", 2)], memoria, ahora), memoria, {
    seco: false, ahora, gh: async () => {}, avisar: async (a) => { enviados.push(a.avisoKey); return { canal: "telegram" }; },
  });
  assert.deepEqual(enviados.sort(), ["ERROR_CODIGO:news.yml", "ERROR_CODIGO:smv.yml"]);
});

test("REPARAR: argumentos de gh y contador solo si gh lo ha disparado", async () => {
  assert.deepEqual(argumentosReparar({ codigo: "ERROR_CODIGO", workflow: "news.yml", runId: 42 }), [
    "workflow", "run", "reparar.yml", "-R", "Wagustin/macro-data-explorer", "-f", "codigo=ERROR_CODIGO", "-f", "workflow=news.yml", "-f", "run_id=42",
  ]);
  const llamadas = [];
  const memoria = { contadores: cont(), incidentes: {}, avisos: {}, historial: [], silencio: [] };
  const acc = [{ tipo: "REPARAR", workflow: "news.yml", codigo: "ERROR_CODIGO", runId: 42, claves: [], motivo: "x" }];
  await ejecutar(acc, memoria, { seco: false, ahora, gh: async (a) => { llamadas.push(a); }, avisar: async () => ({ canal: null }) });
  assert.equal(llamadas.length, 1);
  assert.equal(memoria.contadores.reparar["news.yml"], 1);
  const memFallida = { contadores: cont(), incidentes: {}, avisos: {}, historial: [], silencio: [] };
  const notas = await ejecutar([{ ...acc[0] }], memFallida, {
    seco: false, ahora, gh: async () => { throw Object.assign(new Error("HTTP 403 rate limit"), { stderr: "API rate limit exceeded" }); }, avisar: async () => ({ canal: null }),
  });
  assert.ok(notas.some((n) => n.startsWith("REPARAR news.yml fallido")));
  assert.equal(memFallida.contadores.reparar["news.yml"], undefined);
});

test("WATCHDOG_SMOKE: con fallos de red seguidos hacen falta 3; con uno que no es de red, 2", async () => {
  const smokeRed = { logTail: "FALLA  Pruebas completas (smoke): read ECONNRESET" };
  const smokeOtro = { logTail: "FALLA  Pruebas completas (smoke): HTTP 500 en /dolar" };
  const corridas = [fallo(3, "2026-11-20T14:30:00Z"), fallo(2, "2026-11-20T14:00:00Z"), fallo(1, "2026-11-20T13:30:00Z")];
  const todoRed = await diagnosticoSmoke(corridas, async () => smokeRed);
  assert.deepEqual(todoRed, { fallosSeguidos: 3, todosRed: true });
  const mixto = await diagnosticoSmoke(corridas, async (r) => (r.databaseId === 2 ? smokeOtro : smokeRed));
  assert.deepEqual(mixto, { fallosSeguidos: 3, todosRed: false });
  const dosRed = await diagnosticoSmoke(corridas.slice(0, 2), async () => smokeRed);
  assert.deepEqual(dosRed, { fallosSeguidos: 2, todosRed: true });
  const sinLog = await diagnosticoSmoke(corridas, async () => { throw new Error("gh caído"); });
  assert.deepEqual(sinLog, { fallosSeguidos: 0, todosRed: false });
  assert.deepEqual(decidir([{ codigo: "WATCHDOG_SMOKE", clave: "W", motivo: "x", fallosSeguidos: 2, todosRed: true }], {}, ahora).map((a) => a.tipo), []);
  assert.deepEqual(decidir([{ codigo: "WATCHDOG_SMOKE", clave: "W", motivo: "x", fallosSeguidos: 3, todosRed: true }], {}, ahora).map((a) => a.tipo), ["DESPLEGAR"]);
  assert.deepEqual(decidir([{ codigo: "WATCHDOG_SMOKE", clave: "W", motivo: "x", fallosSeguidos: 2, todosRed: false }], {}, ahora).map((a) => a.tipo), ["DESPLEGAR"]);
});

test("SMV_BLOQUEO de cotizaciones por encima de 72 h avisa, también con origen en el workflow", () => {
  const inc = { codigo: "SMV_BLOQUEO", clave: "SMV_BLOQUEO:smv-precios.yml:9", workflow: "smv-precios.yml", runId: 9, desde: "2026-11-20T10:00:00Z", ageHoras: 73, motivo: "x" };
  assert.deepEqual(decidir([inc], {}, ahora).map((a) => a.tipo), ["AVISAR"]);
  assert.deepEqual(decidir([{ ...inc, ageHoras: 60 }], {}, ahora).map((a) => a.tipo), ["RELANZAR"]); // 60 h: no avisa, relanza el workflow dueño
});

test("lock: uno vivo y fresco bloquea; uno de más de 35 min es huérfano y se libera; uno de un pid muerto también", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vigia-lock-"));
  const file = path.join(dir, "lock");
  try {
    assert.deepEqual(adquirirLock(file), { ok: true, huerfano: null });
    assert.equal(fs.readFileSync(file, "utf8"), String(process.pid));
    assert.equal(adquirirLock(file).ok, false);
    liberarLock(file);
    assert.equal(fs.existsSync(file), false);

    fs.writeFileSync(file, String(process.pid));
    const hace40 = new Date(Date.now() - 40 * MIN);
    fs.utimesSync(file, hace40, hace40);
    const viejo = adquirirLock(file);
    assert.equal(viejo.ok, true);
    assert.match(viejo.huerfano, /lock de hace 40 min/);
    liberarLock(file);

    fs.writeFileSync(file, "99999999");
    const muerto = adquirirLock(file);
    assert.equal(muerto.ok, true);
    assert.match(muerto.huerfano, /pid que ya no existe/);
    liberarLock(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("memoria: archivo que falta no es corrupto; JSON roto empieza vacía y deja la señal memoria-corrupta", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vigia-mem-"));
  try {
    const registro = new Set();
    assert.equal(cargarMemoria(path.join(dir, "no.json"), registro).dia, null);
    assert.equal(registro.size, 0);
    const roto = path.join(dir, "roto.json");
    fs.writeFileSync(roto, "{no es json");
    const m = cargarMemoria(roto, registro);
    assert.equal(m.dia, null);
    assert.deepEqual(m.contadores, cont());
    assert.ok(registro.has("memoria-corrupta"));
    const avisos = detectarVigiaRoto({ senales: registro });
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].motivo, /memoria del vigía/);
    assert.deepEqual(detectarVigiaRoto({ senales: new Set() }), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("guardarMemoria escribe con .tmp y renombra; no deja el .tmp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vigia-guarda-"));
  try {
    const file = path.join(dir, "memoria.json");
    guardarMemoria(file, { dia: "2026-11-24", contadores: cont() });
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).dia, "2026-11-24");
    assert.equal(fs.existsSync(`${file}.tmp`), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("RED_RE: los errores de red del smoke (sin distinguir mayúsculas) son RED_PASAJERA y no error de código", () => {
  const redes = [
    "This operation was aborted", "AbortError: The operation was aborted", "The operation was aborted due to timeout",
    "network timeout at: https://perdata.site", "getaddrinfo EAI_AGAIN perdata.site", "getaddrinfo ENOTFOUND perdata.site",
    "connect ECONNREFUSED 127.0.0.1:443", "UND_ERR_CONNECT_TIMEOUT", "other side closed", "this operation was ABORTED",
  ];
  for (const log of redes) {
    assert.equal(clasificarFallo({ workflowPath: "news.yml", stepName: "Generar", logTail: log }), "RED_PASAJERA", log);
    assert.equal(esErrorCodigo(`TypeError: x is not a function\n  at f (/r/macro-data-explorer/a.mjs:1:1)\n${log}`), false, log);
  }
});

test("smv-accionistas.json viejo (> 5 días): watchdog lo marca y vigia.mjs solo avisa (no despliega ni revierte)", async () => {
  const t = Date.parse("2026-11-26T15:00:00Z");
  const conFecha = (dias) => async () => new Response(JSON.stringify({ actualizado: new Date(t - dias * 864e5).toISOString() }), { status: 200 });
  assert.match(await checkAccionistasSmv({ fetchImpl: conFecha(4.9), now: t }), /^actualizado hace \d+ h$/);
  await assert.rejects(() => checkAccionistasSmv({ fetchImpl: conFecha(5.1), now: t }), /actualizado hace 5 días/);
  await assert.rejects(() => checkAccionistasSmv({ fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }), now: t }), /sin fecha/);

  const log = [
    "OK     Portada: 120 ms",
    "FALLA  Accionistas (SMV): actualizado hace 6 días (2026-11-20T15:00:00.000Z)",
    "OK     Pruebas completas (smoke): TOTAL: 165 pruebas | 165 OK | 0 FAIL",
  ].join("\n");
  assert.equal(clasificarFallo({ workflowPath: "watchdog.yml", stepName: PASO_WATCHDOG, logTail: log }), "DESCONOCIDO");
  const incs = clasificarWatchdog(log);
  assert.equal(incs.length, 1);
  assert.equal(incs[0].codigo, "DESCONOCIDO");
  const acc = decidir(incs, { incidentes: { [incs[0].clave]: { pasadas: 4, desplegadoEn: "2026-11-25T15:00:00Z", trasDespliegue: 2 } } }, ahora);
  assert.deepEqual(acc.map((a) => a.tipo), ["AVISAR"]);
  const diag = await diagnosticoSmoke([fallo(3, "2026-11-20T14:30:00Z"), fallo(2, "2026-11-20T14:00:00Z")], async () => ({ logTail: log }));
  assert.deepEqual(diag, { fallosSeguidos: 0, todosRed: false });
});
