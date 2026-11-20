import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  clasificarFallo, evaluarStatus, boletinPendiente, decidir, registrarPasada,
  clasificarConNemotron, interpretarRespuesta, elegirModelo, redactar, ejecutar,
  argumentosVolverAtras, parsearEnv, rutaEnv, cargarConfig, canalesAviso, avisar, textoAviso,
  debeEnviarResumen, textoResumen, evaluarLatido, enviarTelegram,
} from "../scripts/vigia.mjs";

const H = 36e5;
const ahora = new Date("2026-11-20T15:00:00Z"); // viernes 10:00 Lima, 15:00 UTC

test("clasificarFallo con mensajes reales del catálogo", () => {
  assert.equal(clasificarFallo({ workflowPath: ".github/workflows/smv-precios.yml", stepName: "Leer la página", logTail: "Error: HTTP 418 de la SMV" }), "SMV_BLOQUEO");
  assert.equal(clasificarFallo({ workflowPath: "smv.yml", stepName: "Leer la página", logTail: "respuesta inesperada de la SMV" }), "SMV_BLOQUEO");
  assert.equal(clasificarFallo({ workflowPath: "news.yml", stepName: "Guardar cambios si hay noticias nuevas o clasificaciones", logTail: "CONFLICT (content): Merge conflict in data/noticias.json" }), "CHOQUE_PUSH");
  assert.equal(clasificarFallo({ workflowPath: "deploy.yml", stepName: "Smoke de producción", logTail: "TypeError: fetch failed\nread ECONNRESET" }), "RED_PASAJERA");
  assert.equal(clasificarFallo({ workflowPath: "ci.yml", stepName: "Tests", logTail: "2 failing tests" }), "CI_ROJO");
  assert.equal(clasificarFallo({ workflowPath: "timesfm.yml", stepName: "Instalar", logTail: "cosas raras" }), "DESCONOCIDO");
});

test("el watchdog en el paso de la web es WATCHDOG_SMOKE aunque el log diga ECONNRESET", () => {
  assert.equal(clasificarFallo({ workflowPath: ".github/workflows/watchdog.yml", stepName: "Comprobar la web y los procesos diarios", logTail: "read ECONNRESET" }), "WATCHDOG_SMOKE");
  assert.equal(clasificarFallo({ workflowPath: "watchdog.yml", stepName: "Comprobar la web y los procesos diarios", logTail: "HTTP 503" }), "WATCHDOG_SMOKE");
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
  assert.ok(notas.every((n) => n.includes("[seco]")));
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
  const gh = async () => { throw Object.assign(new Error("HTTP 403"), { stderr: "HTTP 403: Resource not accessible" }); };
  const memoria = { contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, incidentes: {}, avisos: {}, despliegues: [], historial: [] };
  const avisados = [];
  const notas = await ejecutar([{ tipo: "VOLVER_ATRAS", codigo: "PAGINA_CAIDA", claves: [], incidente: {} }], memoria, {
    seco: false, ahora, gh, avisar: async (a) => { avisados.push(a.motivo); return { canal: "telegram" }; },
  });
  assert.ok(notas.some((n) => n.startsWith("VOLVER_ATRAS fallido")));
  assert.ok(avisados.some((m) => m.includes("el rollback ha fallado")));
  assert.equal(memoria.contadores.volverAtras, 0);
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
  assert.deepEqual(await avisar(a, { ...tg, ...mail }, { telegram, correo }), { canal: "telegram", detalle: "" });
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

test("resumen diario: una vez al día, desde las 08:00 de Lima, solo con VIGIA_ACTUAR=1 o VIGIA_RESUMEN=1", () => {
  const actuar = { actuar: "1" };
  assert.equal(debeEnviarResumen({}, new Date("2026-11-20T12:59:00Z"), actuar), false); // 07:59 Lima
  assert.equal(debeEnviarResumen({}, new Date("2026-11-20T13:00:00Z"), actuar), true); // 08:00 Lima
  assert.equal(debeEnviarResumen({ resumenDia: "2026-11-20" }, new Date("2026-11-20T18:00:00Z"), actuar), false);
  assert.equal(debeEnviarResumen({ resumenDia: "2026-11-20" }, new Date("2026-11-21T13:30:00Z"), actuar), true);
  assert.equal(debeEnviarResumen({}, new Date("2026-11-20T13:00:00Z"), {}), false);
  assert.equal(debeEnviarResumen({}, new Date("2026-11-20T13:00:00Z"), { resumen: "1" }), true);
});

test("textoResumen: una línea con runs, fallos, acciones de 24 h, web y pagos", () => {
  const historial = [
    { fecha: "2026-11-20T10:00:00Z", tipo: "RELANZAR", detalle: "news.yml" },
    { fecha: "2026-11-19T01:00:00Z", tipo: "DESPLEGAR", detalle: "deploy.yml" }, // fuera de 24 h
  ];
  const t = textoResumen({ fecha: "2026-11-20", runs: 12, fallos: 1, historial, ahora, web: "/api/status OK", pagos: "sí" });
  assert.equal(t, "PerData · 2026-11-20: 12 runs en 24 h, 1 fallos, acciones del vigía: RELANZAR 1, /api/status OK, pagos en pausa sí");
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
});
