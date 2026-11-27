// Tests para scripts/reparador.mjs. Sin red, sin gh y sin git reales: todo se inyecta.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

import {
  recogerContexto,
  validarDiff,
  parsearRespuestaModelo,
  rutaPermitida,
  parsearDiff,
  verificarLimiteDiario,
  contarReparacionesRecientes,
  esCommitReparador,
  ultimoReparadorEnMain,
  deshacerUltimaReparacion,
  workflowAdmiteDispatch,
  pedirParche,
  pedirPropuesta,
  resolverModelos,
  leerConfig,
  ejecutarReparador,
  redactar,
  registrarSecretos,
  coincideGlob,
  rutaSegura
} from "../scripts/reparador.mjs";

// Comprobador de git apply simulado: siempre aplica.
const aplicaOk = async () => {};
// Comprobador simulado que falla como git apply --check.
const aplicaNo = async () => { throw new Error("error: patch failed"); };

// Diff de un archivo con cambios simples. `quitar` y `añadir` son líneas sin prefijo.
function diffArchivo(ruta, { quitar = [], añadir = [], nuevo = false, borrado = false, contexto = " // ctx" } = {}) {
  let d = `diff --git a/${ruta} b/${ruta}\n`;
  if (nuevo) d += "new file mode 100644\n--- /dev/null\n";
  else if (borrado) d += "deleted file mode 100644\n--- a/" + ruta + "\n";
  else d += `--- a/${ruta}\n`;
  d += borrado ? "+++ /dev/null\n" : `+++ b/${ruta}\n`;
  d += `@@ -1,3 +1,4 @@\n${contexto}\n`;
  for (const l of quitar) d += `-${l}\n`;
  for (const l of añadir) d += `+${l}\n`;
  return d;
}

function diffLineas(ruta, n) {
  return diffArchivo(ruta, { añadir: Array.from({ length: n }, (_, i) => `const x${i} = ${i};`) });
}

// Mock de gh: enruta por el contenido de los argumentos.
function ghFalso(respuestas) {
  const llamadas = [];
  const gh = async (args) => {
    llamadas.push(args.join(" "));
    for (const [patron, valor] of respuestas) {
      if (args.join(" ").includes(patron)) {
        if (valor instanceof Error) throw valor;
        return typeof valor === "function" ? valor(args) : valor;
      }
    }
    throw new Error(`gh no esperado: ${args.join(" ")}`);
  };
  gh.llamadas = llamadas;
  return gh;
}

const COMMIT_REPARADOR = { sha: "abc123", commit: { message: "fix(auto): algo [reparador]" } };
const COMMIT_NORMAL = { sha: "def456", commit: { message: "data(news): feeds" } };

describe("reparador - rutaPermitida", () => {
  it("permite scripts/foo.js", () => assert.strictEqual(rutaPermitida("scripts/foo.js"), true));
  it("permite scripts/sub/bar.mjs", () => assert.strictEqual(rutaPermitida("scripts/sub/bar.mjs"), true));
  it("deniega scripts/vigia.mjs", () => assert.strictEqual(rutaPermitida("scripts/vigia.mjs"), false));
  it("deniega scripts/reparador.mjs", () => assert.strictEqual(rutaPermitida("scripts/reparador.mjs"), false));
  it("deniega scripts/smv-plan-b.sh", () => assert.strictEqual(rutaPermitida("scripts/smv-plan-b.sh"), false));
  it("deniega scripts/smv-plan-b-hechos.sh", () => assert.strictEqual(rutaPermitida("scripts/smv-plan-b-hechos.sh"), false));
  it("deniega scripts/build-cf.js", () => assert.strictEqual(rutaPermitida("scripts/build-cf.js"), false));
  it("deniega scripts/boletin.js, scripts/lib/boletin-envio.js, scripts/alertas.js y scripts/alertas-reglas.js", () => {
    assert.strictEqual(rutaPermitida("scripts/boletin.js"), false);
    assert.strictEqual(rutaPermitida("scripts/lib/boletin-envio.js"), false);
    assert.strictEqual(rutaPermitida("scripts/alertas.js"), false);
    assert.strictEqual(rutaPermitida("scripts/alertas-reglas.js"), false);
  });
  it("permite api/forecast.js", () => assert.strictEqual(rutaPermitida("api/forecast.js"), true));
  it("permite api/_lib/otro.js", () => assert.strictEqual(rutaPermitida("api/_lib/otro.js"), true));
  it("deniega api/billing.js", () => assert.strictEqual(rutaPermitida("api/billing.js"), false));
  it("deniega api/auth.js", () => assert.strictEqual(rutaPermitida("api/auth.js"), false));
  it("deniega api/sync.js, api/boletin.js, api/_lib/backup.js y api/_lib/d1.js", () => {
    for (const r of ["api/sync.js", "api/boletin.js", "api/_lib/backup.js", "api/_lib/d1.js"]) {
      assert.strictEqual(rutaPermitida(r), false, r);
    }
  });
  it("deniega api/_lib/session.js", () => assert.strictEqual(rutaPermitida("api/_lib/session.js"), false));
  it("deniega api/_lib/stripe.js", () => assert.strictEqual(rutaPermitida("api/_lib/stripe.js"), false));
  it("deniega api/_lib/mercadopago.js", () => assert.strictEqual(rutaPermitida("api/_lib/mercadopago.js"), false));
  it("deniega api/_lib/turnstile.js", () => assert.strictEqual(rutaPermitida("api/_lib/turnstile.js"), false));
  it("deniega api/_lib/users.js", () => assert.strictEqual(rutaPermitida("api/_lib/users.js"), false));
  it("permite .github/workflows/smv.yml", () => assert.strictEqual(rutaPermitida(".github/workflows/smv.yml"), true));
  it("deniega .github/workflows/deploy.yml", () => assert.strictEqual(rutaPermitida(".github/workflows/deploy.yml"), false));
  it("deniega .github/workflows/rollback.yml", () => assert.strictEqual(rutaPermitida(".github/workflows/rollback.yml"), false));
  it("deniega .github/workflows/reparar.yml", () => assert.strictEqual(rutaPermitida(".github/workflows/reparar.yml"), false));
  it("deniega .github/workflows/ci.yml", () => assert.strictEqual(rutaPermitida(".github/workflows/ci.yml"), false));
  it("deniega workflows de boletín, alertas, backup y d1-backfill", () => {
    for (const w of ["boletin.yml", "alertas.yml", "backup.yml", "d1-backfill.yml"]) {
      assert.strictEqual(rutaPermitida(`.github/workflows/${w}`), false, w);
    }
  });
  it("permite test/nuevo.test.js (archivo nuevo en test/)", () => assert.strictEqual(rutaPermitida("test/nuevo.test.js"), true));
  it("deniega HTML en cualquier carpeta", () => {
    assert.strictEqual(rutaPermitida("index.html"), false);
    assert.strictEqual(rutaPermitida("api/pagina.html"), false);
  });
  it("deniega CSS en cualquier carpeta", () => {
    assert.strictEqual(rutaPermitida("styles.css"), false);
    assert.strictEqual(rutaPermitida("scripts/estilo.css"), false);
  });
  it("deniega test/ con HTML o CSS (la prohibición gana a la excepción de test/)", () => {
    assert.strictEqual(rutaPermitida("test/x.html"), false);
    assert.strictEqual(rutaPermitida("test/x.css"), false);
  });
  it("deniega data/** (contenido anidado)", () => {
    assert.strictEqual(rutaPermitida("data/algo.json"), false);
    assert.strictEqual(rutaPermitida("data/sub/deep.js"), false);
  });
  it("deniega wrangler.jsonc, package.json, package-lock.json, worker.js, server.js", () => {
    for (const r of ["wrangler.jsonc", "package.json", "package-lock.json", "worker.js", "server.js"]) {
      assert.strictEqual(rutaPermitida(r), false, r);
    }
  });
  it("deniega docs/**", () => assert.strictEqual(rutaPermitida("docs/algo.md"), false));
  it("deniega rutas absolutas o con ..", () => {
    assert.strictEqual(rutaPermitida("/etc/passwd.js"), false);
    assert.strictEqual(rutaPermitida("scripts/../package.json"), false);
    assert.strictEqual(rutaPermitida("api/../scripts/x.js"), false);
  });
  it("deniega extensiones que no están en la lista", () => {
    assert.strictEqual(rutaPermitida("scripts/tabla.csv"), false);
    assert.strictEqual(rutaPermitida("api/x.ts"), false);
  });
});

describe("reparador - coincideGlob", () => {
  it("** cubre cualquier profundidad al final del patrón", () => {
    assert.strictEqual(coincideGlob("data/a/b/c.json", "data/**"), true);
    assert.strictEqual(coincideGlob("datos/a.json", "data/**"), false);
  });
  it("* no cruza barras", () => {
    assert.strictEqual(coincideGlob("scripts/a/b.js", "scripts/*.js"), false);
    assert.strictEqual(coincideGlob("scripts/b.js", "scripts/*.js"), true);
  });
  it("los puntos son literales", () => {
    assert.strictEqual(coincideGlob("scriptsXjs", "scripts.js"), false);
  });
});

describe("reparador - rutaSegura", () => {
  it("rechaza traversal y rutas absolutas", () => {
    assert.strictEqual(rutaSegura("../fuera.js"), false);
    assert.strictEqual(rutaSegura("/etc/x.js"), false);
    assert.strictEqual(rutaSegura("scripts/x.js"), true);
  });
});

describe("reparador - parsearDiff", () => {
  it("parsea un diff simple y cuenta solo líneas de hunk", () => {
    const diff = `diff --git a/scripts/foo.js b/scripts/foo.js
--- a/scripts/foo.js
+++ b/scripts/foo.js
@@ -1,3 +1,4 @@
 function foo() {
+  console.log("hola");
   return 42;
 }
`;
    const archivos = parsearDiff(diff);
    assert.strictEqual(archivos.length, 1);
    assert.strictEqual(archivos[0].ruta, "scripts/foo.js");
    assert.strictEqual(archivos[0].lineasCambiadas, 1);
    assert.strictEqual(archivos[0].mas, 1);
    assert.strictEqual(archivos[0].menos, 0);
  });

  it("no cuenta como cambio una línea de contenido que empieza por ++ o --", () => {
    const diff = diffArchivo("scripts/a.js", { quitar: ["-- sql"], añadir: ["++i;"] });
    const [arch] = parsearDiff(diff);
    assert.strictEqual(arch.mas, 1);
    assert.strictEqual(arch.menos, 1);
  });

  it("parsea múltiples archivos", () => {
    const diff = diffArchivo("scripts/a.js", { añadir: ["a"] }) + diffArchivo("api/b.js", { añadir: ["b"] });
    const archivos = parsearDiff(diff);
    assert.deepStrictEqual(archivos.map(a => a.ruta), ["scripts/a.js", "api/b.js"]);
  });

  it("detecta archivos nuevos y borrados", () => {
    const diff = diffArchivo("test/n.test.js", { nuevo: true, añadir: ["x"] }) +
      diffArchivo("scripts/b.js", { borrado: true, quitar: ["y"] });
    const [n, b] = parsearDiff(diff);
    assert.strictEqual(n.nuevo, true);
    assert.strictEqual(b.borrado, true);
  });
});

describe("reparador - validarDiff", () => {
  it("acepta diff válido dentro de límites", async () => {
    const diff = diffArchivo("scripts/foo.js", { añadir: ['  console.log("hola");'] });
    assert.strictEqual(await validarDiff(diff, { comprobarAplica: aplicaOk }), null);
  });

  it("rechaza si toca ruta no permitida (html)", async () => {
    const diff = diffArchivo("index.html", { añadir: ["<p>hola</p>"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("no permitida"), err);
  });

  it("rechaza si toca billing.js", async () => {
    const diff = diffArchivo("api/billing.js", { añadir: ["x"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("no permitida"), err);
  });

  it("rechaza si toca package.json aunque sea un cambio mínimo", async () => {
    const diff = diffArchivo("package.json", { añadir: ['  "x": 1,'] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("no permitida"), err);
  });

  it("rechaza si supera 3 archivos (4 archivos)", async () => {
    let diff = "";
    for (let i = 0; i < 4; i++) diff += diffArchivo(`scripts/f${i}.js`, { añadir: ["x"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("Demasiados archivos"), err);
  });

  it("acepta exactamente 3 archivos", async () => {
    let diff = "";
    for (let i = 0; i < 3; i++) diff += diffArchivo(`scripts/f${i}.js`, { añadir: ["x"] });
    assert.strictEqual(await validarDiff(diff, { comprobarAplica: aplicaOk }), null);
  });

  it("rechaza si supera 60 líneas cambiadas (61)", async () => {
    const diff = diffArchivo("scripts/foo.js", {
      añadir: Array.from({ length: 31 }, (_, i) => `a${i}`),
      quitar: Array.from({ length: 30 }, (_, i) => `q${i}`)
    });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("Demasiadas líneas"), err);
  });

  it("acepta exactamente 60 líneas cambiadas", async () => {
    const diff = diffArchivo("scripts/foo.js", {
      añadir: Array.from({ length: 30 }, (_, i) => `a${i}`),
      quitar: Array.from({ length: 30 }, (_, i) => `q${i}`)
    });
    assert.strictEqual(await validarDiff(diff, { comprobarAplica: aplicaOk }), null);
  });

  it("rechaza si modifica un test existente", async () => {
    const diff = diffArchivo("test/foo.test.js", { quitar: ['import { test } from "node:test";'], añadir: ["x"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("tests existentes"), err);
  });

  it("rechaza si borra un test existente", async () => {
    const diff = diffArchivo("test/foo.test.js", { borrado: true, quitar: ["x"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("tests existentes"), err);
  });

  it("acepta crear un test nuevo en test/", async () => {
    const diff = diffArchivo("test/nuevo.test.js", { nuevo: true, añadir: ["x"] });
    assert.strictEqual(await validarDiff(diff, { comprobarAplica: aplicaOk }), null);
  });

  it("rechaza si borra un archivo de scripts/", async () => {
    const diff = diffArchivo("scripts/foo.js", { borrado: true, quitar: ["x"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("borrar archivos"), err);
  });

  it("rechaza renombrados", async () => {
    const diff = `diff --git a/scripts/a.js b/scripts/b.js
similarity index 90%
rename from scripts/a.js
rename to scripts/b.js
--- a/scripts/a.js
+++ b/scripts/b.js
@@ -1 +1 @@
-x
+y
`;
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("Renombrar"), err);
  });

  it("rechaza si quita una exportación pública sin volver a declararla", async () => {
    const diff = diffArchivo("scripts/lib.js", {
      quitar: ["export function calcular(a) {"],
      añadir: ["export function otra(a) {"]
    });
    const err = await validarDiff(diff, { comprobarAplica: aplicaOk });
    assert.ok(err?.includes("exportación pública: calcular"), err);
  });

  it("acepta cambiar la firma de una exportación manteniendo el nombre", async () => {
    const diff = diffArchivo("scripts/lib.js", {
      quitar: ["export function calcular(a) {"],
      añadir: ["export function calcular(a, b) {"]
    });
    assert.strictEqual(await validarDiff(diff, { comprobarAplica: aplicaOk }), null);
  });

  it("rechaza si git apply --check falla", async () => {
    const diff = diffArchivo("scripts/foo.js", { añadir: ["x"] });
    const err = await validarDiff(diff, { comprobarAplica: aplicaNo });
    assert.ok(err?.includes("no aplica"), err);
  });

  it("rechaza diff vacío", async () => {
    assert.ok((await validarDiff("", { comprobarAplica: aplicaOk }))?.includes("no contiene"));
  });
});

describe("reparador - parsearRespuestaModelo", () => {
  it("detecta NO_REPARAR con motivo", () => {
    const p = parsearRespuestaModelo("NO_REPARAR\nEl fallo es externo: red caída");
    assert.strictEqual(p.tipo, "no_reparar");
    assert.strictEqual(p.motivo, "El fallo es externo: red caída");
  });

  it("detecta diff válido con MOTIVO", () => {
    const resp = `diff --git a/scripts/foo.js b/scripts/foo.js
--- a/scripts/foo.js
+++ b/scripts/foo.js
@@ -1,3 +1,4 @@
 function foo() {
+  console.log("hola");
   return 42;
 }
---MOTIVO---
Añade log para diagnosticar el fallo`;
    const p = parsearRespuestaModelo(resp);
    assert.strictEqual(p.tipo, "diff");
    assert.ok(p.diff.includes("console.log"));
    assert.strictEqual(p.motivo, "Añade log para diagnosticar el fallo");
  });

  it("acepta el diff envuelto en valla de código", () => {
    const resp = "```diff\n" + diffArchivo("scripts/a.js", { añadir: ["x"] }) + "```\n---MOTIVO---\nMotivo";
    const p = parsearRespuestaModelo(resp);
    assert.strictEqual(p.tipo, "diff");
  });

  it("rechaza respuesta sin ---MOTIVO---", () => {
    const p = parsearRespuestaModelo(diffArchivo("scripts/foo.js", { añadir: ["x"] }));
    assert.strictEqual(p.tipo, "basura");
    assert.ok(p.motivo.includes("falta ---MOTIVO---"));
  });

  it("rechaza texto que no es diff", () => {
    const p = parsearRespuestaModelo("Hola, esto no es un diff.\n---MOTIVO---\nMotivo cualquiera");
    assert.strictEqual(p.tipo, "basura");
    assert.ok(p.motivo.includes("No es un diff válido"));
  });

  it("rechaza respuesta vacía", () => {
    assert.strictEqual(parsearRespuestaModelo("").tipo, "basura");
    assert.strictEqual(parsearRespuestaModelo(undefined).tipo, "basura");
  });
});

describe("reparador - pedirPropuesta (cadena de modelos)", () => {
  const contexto = { codigo: "CI_ROJO", workflow: "ci.yml", runId: "1", log: "", archivos: [] };
  const diffOk = diffArchivo("scripts/a.js", { añadir: ["x"] }) + "---MOTIVO---\nArreglo";

  it("pasa al siguiente modelo si el primero devuelve basura", async () => {
    const usados = [];
    const pedir = async (modelo) => {
      usados.push(modelo);
      return { modelo, respuesta: modelo === "m1" ? "texto suelto" : diffOk };
    };
    const p = await pedirPropuesta(contexto, { modelos: ["m1", "m2"], pedir });
    assert.deepStrictEqual(usados, ["m1", "m2"]);
    assert.strictEqual(p.tipo, "diff");
    assert.strictEqual(p.modelo, "m2");
  });

  it("pasa al siguiente modelo si el primero falla por error de API", async () => {
    const pedir = async (modelo) => {
      if (modelo === "m1") throw new Error("Error API NVIDIA (500)");
      return { modelo, respuesta: diffOk };
    };
    const p = await pedirPropuesta(contexto, { modelos: ["m1", "m2"], pedir });
    assert.strictEqual(p.modelo, "m2");
  });

  it("NO_REPARAR de un modelo corta la cadena", async () => {
    const usados = [];
    const pedir = async (modelo) => {
      usados.push(modelo);
      return { modelo, respuesta: "NO_REPARAR\nfallo externo" };
    };
    const p = await pedirPropuesta(contexto, { modelos: ["m1", "m2"], pedir });
    assert.deepStrictEqual(usados, ["m1"]);
    assert.strictEqual(p.tipo, "no_reparar");
  });

  it("si todos fallan devuelve basura con el motivo", async () => {
    const pedir = async () => { throw new Error("caído"); };
    const p = await pedirPropuesta(contexto, { modelos: ["m1"], pedir });
    assert.strictEqual(p.tipo, "basura");
    assert.ok(p.motivo.includes("caído"));
  });

  it("sin modelos disponibles devuelve basura", async () => {
    const p = await pedirPropuesta(contexto, { modelos: [], pedir: async () => ({}) });
    assert.strictEqual(p.tipo, "basura");
  });
});

describe("reparador - resolverModelos", () => {
  it("devuelve solo los ids que existen en GET /v1/models", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ id: "m2" }, { id: "otro" }] }) });
    assert.deepStrictEqual(await resolverModelos(["m1", "m2"], { fetchImpl, apiKey: "k" }), ["m2"]);
  });

  it("si la lista no se puede leer, usa los candidatos tal cual", async () => {
    const fetchImpl = async () => { throw new Error("red"); };
    assert.deepStrictEqual(await resolverModelos(["m1", "m2"], { fetchImpl, apiKey: "k" }), ["m1", "m2"]);
  });
});

describe("reparador - pedirParche (HTTP simulado)", () => {
  const contexto = { codigo: "CI_ROJO", workflow: "ci.yml", runId: "9", log: "log", archivos: [{ ruta: "scripts/a.js", inicio: 1, fin: 2, contenido: "x" }] };

  it("envía el modelo, temperature 0.1 y enable_thinking=false solo para Nemotron", async () => {
    const cuerpos = [];
    const fetchImpl = async (url, opts) => {
      cuerpos.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: "NO_REPARAR\nx" } }] }) };
    };
    await pedirParche("nvidia/nemotron-3-ultra-550b-a55b", contexto, { fetchImpl, apiKey: "k" });
    await pedirParche("minimaxai/minimax-m3.1-flash", contexto, { fetchImpl, apiKey: "k" });
    assert.strictEqual(cuerpos[0].temperature, 0.1);
    assert.strictEqual(cuerpos[0].max_tokens, 4000);
    assert.deepStrictEqual(cuerpos[0].chat_template_kwargs, { enable_thinking: false });
    assert.strictEqual(cuerpos[1].chat_template_kwargs, undefined);
  });

  it("incluye el error previo en el mensaje de usuario cuando se reintenta", async () => {
    let cuerpo;
    const fetchImpl = async (url, opts) => {
      cuerpo = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: "NO_REPARAR\nx" } }] }) };
    };
    await pedirParche("m", contexto, { fetchImpl, apiKey: "k", errorPrevio: "test X fallo" });
    assert.ok(cuerpo.messages[1].content.includes("test X fallo"));
    assert.ok(cuerpo.messages[1].content.includes("PROPUESTA ANTERIOR FALLÓ"));
  });

  it("no filtra la clave en el error de la API", async () => {
    registrarSecretos(["nvapi-CLAVEPRUEBA123456"]);
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "bad key nvapi-CLAVEPRUEBA123456" });
    await assert.rejects(
      pedirParche("m", contexto, { fetchImpl, apiKey: "nvapi-CLAVEPRUEBA123456" }),
      err => {
        assert.ok(err.message.includes("401"));
        assert.ok(!err.message.includes("CLAVEPRUEBA"));
        return true;
      }
    );
    registrarSecretos([]);
  });
});

describe("reparador - redactar", () => {
  it("oculta nvapi-, ghp_ y github_pat_", () => {
    const t = redactar("a nvapi-AbC_123xyz b ghp_ABCdef123 c github_pat_11ABC_xyz d");
    assert.ok(!t.includes("AbC_123xyz"));
    assert.ok(!t.includes("ABCdef123"));
    assert.ok(!t.includes("11ABC_xyz"));
    assert.ok(t.includes("nvapi-***"));
    assert.ok(t.includes("ghp_***"));
    assert.ok(t.includes("github_pat_***"));
  });

  it("oculta los secretos registrados aunque no tengan prefijo", () => {
    registrarSecretos(["secreto-muy-largo-123"]);
    assert.ok(!redactar("x secreto-muy-largo-123 y").includes("secreto-muy-largo-123"));
    registrarSecretos([]);
  });
});

describe("reparador - recogerContexto (gh simulado)", () => {
  it("extrae rutas del log, lee el archivo y recorta a 150 líneas", async () => {
    const lineas = Array.from({ length: 300 }, (_, i) => `linea ${i}`);
    lineas.splice(10, 0, "error en scripts/reparador.mjs:12: falla");
    const gh = ghFalso([["run view", lineas.join("\n")]]);
    const ctx = await recogerContexto({ runId: "1", workflow: "ci.yml", gh, raiz: REPO_ROOT });
    assert.strictEqual(ctx.log.split("\n").length, 150);
    const archivo = ctx.archivos.find(a => a.ruta === "scripts/reparador.mjs");
    assert.ok(archivo, "debe leer scripts/reparador.mjs");
    assert.ok(archivo.fin - archivo.inicio + 1 <= 400);
    assert.ok(archivo.inicio <= 12 && archivo.fin >= 12);
  });

  it("no lee rutas con traversal", async () => {
    const gh = ghFalso([["run view", "fallo en api/../../package.json.js y en scripts/x.js " + "z".repeat(120)]]);
    const ctx = await recogerContexto({ runId: "1", workflow: "ci.yml", gh, raiz: REPO_ROOT });
    assert.ok(ctx.archivos.every(a => !a.ruta.includes("..")));
  });

  it("redacta claves del log antes de devolverlo", async () => {
    const gh = ghFalso([["run view", "token ghp_SECRETOLARGO12345 " + "y".repeat(120)]]);
    const ctx = await recogerContexto({ runId: "1", workflow: "ci.yml", gh, raiz: REPO_ROOT });
    assert.ok(!ctx.log.includes("SECRETOLARGO12345"));
  });

  it("si gh run view falla, usa la API de jobs", async () => {
    const gh = ghFalso([
      ["run view", new Error("sin logs")],
      ["actions/runs/7/jobs", JSON.stringify({ jobs: [{ id: 5, conclusion: "failure" }] })],
      ["actions/jobs/5/logs", "log del job " + "w".repeat(150)]
    ]);
    const ctx = await recogerContexto({ runId: "7", workflow: "ci.yml", gh, raiz: REPO_ROOT });
    assert.ok(ctx.log.includes("log del job"));
  });
});

describe("reparador - límite diario", () => {
  it("cuenta commits de main con [reparador] en las últimas 24 h", async () => {
    const gh = ghFalso([["commits?sha=main", JSON.stringify([COMMIT_REPARADOR, COMMIT_NORMAL, COMMIT_REPARADOR])]]);
    assert.strictEqual(await contarReparacionesRecientes({ gh }), 2);
  });

  it("con 2 o más reparaciones el límite está alcanzado", async () => {
    const gh = ghFalso([["commits?sha=main", JSON.stringify([COMMIT_REPARADOR, COMMIT_REPARADOR])]]);
    assert.strictEqual(await verificarLimiteDiario({ gh }), true);
  });

  it("con 1 reparación todavía se puede reparar", async () => {
    const gh = ghFalso([["commits?sha=main", JSON.stringify([COMMIT_REPARADOR, COMMIT_NORMAL])]]);
    assert.strictEqual(await verificarLimiteDiario({ gh }), false);
  });

  it("la ventana es de 24 h (since)", async () => {
    const gh = ghFalso([["commits?sha=main", "[]"]]);
    await contarReparacionesRecientes({ gh, ahora: Date.parse("2026-11-24T12:00:00Z") });
    assert.ok(gh.llamadas[0].includes(encodeURIComponent("2026-11-23T12:00:00.000Z")));
  });

  it("si no puede contar, falla cerrado (lanza error)", async () => {
    const gh = ghFalso([["commits?sha=main", new Error("API caída")]]);
    await assert.rejects(verificarLimiteDiario({ gh }));
  });

  it("un feat(reparador) con [reparador] solo en el cuerpo NO cuenta", async () => {
    const commit = { sha: "f1", commit: { message: "feat(reparador): añade modo seco\n\nCo-Authored-By: x [reparador]" } };
    const gh = ghFalso([["commits?sha=main", JSON.stringify([commit, commit])]]);
    assert.strictEqual(await contarReparacionesRecientes({ gh }), 0);
    assert.strictEqual(await verificarLimiteDiario({ gh }), false);
  });

  it("fix(auto): x [reparador] sí cuenta", async () => {
    const commit = { sha: "f2", commit: { message: "fix(auto): x [reparador]" } };
    const gh = ghFalso([["commits?sha=main", JSON.stringify([commit])]]);
    assert.strictEqual(await contarReparacionesRecientes({ gh }), 1);
  });

  it("revert(auto): ... [reparador] sí cuenta", async () => {
    const commit = { sha: "f3", commit: { message: "revert(auto): deshacer reparación que rompió CI [reparador]\n\ncuerpo" } };
    const gh = ghFalso([["commits?sha=main", JSON.stringify([commit])]]);
    assert.strictEqual(await contarReparacionesRecientes({ gh }), 1);
  });

  it("un asunto que empieza bien pero no termina en [reparador] no cuenta", async () => {
    const commit = { sha: "f4", commit: { message: "fix(auto): x\n\n[reparador]" } };
    const gh = ghFalso([["commits?sha=main", JSON.stringify([commit])]]);
    assert.strictEqual(await contarReparacionesRecientes({ gh }), 0);
  });
});

describe("reparador - esCommitReparador", () => {
  it("solo mira el asunto (primera línea)", () => {
    assert.strictEqual(esCommitReparador("fix(auto): x [reparador]\ncuerpo"), true);
    assert.strictEqual(esCommitReparador("data(news): x\n\nfix(auto): x [reparador]"), false);
    assert.strictEqual(esCommitReparador(undefined), false);
  });
});

describe("reparador - decisión de deshacer (CI_ROJO)", () => {
  it("devuelve el sha del último commit de main si contiene [reparador]", async () => {
    const gh = ghFalso([["per_page=1", JSON.stringify([COMMIT_REPARADOR])]]);
    assert.strictEqual(await ultimoReparadorEnMain(gh), "abc123");
  });

  it("devuelve null si el último commit de main no es de reparador", async () => {
    const gh = ghFalso([["per_page=1", JSON.stringify([COMMIT_NORMAL])]]);
    assert.strictEqual(await ultimoReparadorEnMain(gh), null);
  });

  it("no deshace si [reparador] aparece solo en el cuerpo de un feat(reparador)", async () => {
    const commit = { sha: "g1", commit: { message: "feat(reparador): modo seco\n\nlínea con [reparador]" } };
    const gh = ghFalso([["per_page=1", JSON.stringify([commit])]]);
    assert.strictEqual(await ultimoReparadorEnMain(gh), null);
  });

  it("el deshacer no se ejecuta con asunto válido pero sin [reparador] al final", async () => {
    const commit = { sha: "g2", commit: { message: "fix(auto): x" } };
    const gh = ghFalso([["per_page=1", JSON.stringify([commit])]]);
    assert.strictEqual(await ultimoReparadorEnMain(gh), null);
  });

  it("si gh falla al contar, el resumen dice que no pudo contar (no 'límite alcanzado')", async () => {
    const gh = ghFalso([
      ["commits?sha=main&per_page=100", new Error("API caída")],
      ["per_page=1", JSON.stringify([COMMIT_NORMAL])]
    ]);
    const env = { CODIGO: "SMV_BLOQUEO", WORKFLOW: "smv.yml", RUN_ID: "42", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
    const salida = await ejecutarReparador(env, { gh });
    assert.strictEqual(salida, "no pude contar las reparaciones recientes: API caída");
  });

  it("el deshacer se ejecuta aunque el límite diario esté alcanzado", async () => {
    const gh = ghFalso([
      ["per_page=100", JSON.stringify([COMMIT_REPARADOR, COMMIT_REPARADOR])],
      ["per_page=1", JSON.stringify([COMMIT_REPARADOR])]
    ]);
    let deshechoCon = null;
    const deshacer = async (cfg, sha) => { deshechoCon = sha; return { detalle: "deshecho" }; };
    const env = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "42", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
    const salida = await ejecutarReparador(env, { gh, deshacer });
    assert.strictEqual(salida, "deshecho");
    assert.strictEqual(deshechoCon, "abc123");
    assert.ok(!gh.llamadas.some(l => l.includes("per_page=100")), "no debe contar el límite antes del deshacer");
  });

  it("sin commit del reparador al final de main, el límite diario sí bloquea la reparación", async () => {
    const gh = ghFalso([
      ["per_page=100", JSON.stringify([COMMIT_REPARADOR, COMMIT_REPARADOR])],
      ["per_page=1", JSON.stringify([COMMIT_NORMAL])]
    ]);
    const deshacer = async () => { throw new Error("no debía llamarse"); };
    const env = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "42", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
    assert.strictEqual(await ejecutarReparador(env, { gh, deshacer }), "límite diario alcanzado");
  });

  it("CI_ROJO sin reparador previo y sin límite: sigue al flujo normal", async () => {
    const gh = ghFalso([
      ["per_page=100", "[]"],
      ["per_page=1", JSON.stringify([COMMIT_NORMAL])],
      ["run view", "error en scripts/x.js:1: fallo externo " + "q".repeat(120)]
    ]);
    const pedir = async (modelo) => ({ modelo, respuesta: "NO_REPARAR\nfallo externo" });
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ id: "nvidia/nemotron-3-ultra-550b-a55b" }] }) });
    const env = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "42", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
    assert.strictEqual(await ejecutarReparador(env, { gh, pedir, fetchImpl }), "sin reparación: fallo externo");
  });

  it("nunca revierte un revert (revert(auto)) aunque CI_ROJO persista", async () => {
    const commitRevert = { sha: "rev123", commit: { message: "revert(auto): deshacer reparación que rompió CI [reparador]" } };
    const gh = ghFalso([
      ["per_page=1", JSON.stringify([commitRevert])],
      ["per_page=100", "[]"],
      ["run view", "error en scripts/x.js:1: fallo externo " + "q".repeat(120)]
    ]);
    assert.strictEqual(await ultimoReparadorEnMain(gh), null);
    let deshizo = false;
    const deshacer = async () => { deshizo = true; return { detalle: "deshecho" }; };
    const pedir = async (modelo) => ({ modelo, respuesta: "NO_REPARAR\nfallo externo" });
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ id: "nvidia/nemotron-3-ultra-550b-a55b" }] }) });
    const env = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "43", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
    const salida = await ejecutarReparador(env, { gh, deshacer, pedir, fetchImpl });
    assert.strictEqual(deshizo, false);
    assert.strictEqual(salida, "sin reparación: fallo externo");
  });

  it("deshacer una reparación que tocó api/ vuelve a lanzar deploy.yml tras fusionar", async () => {
    const gh = ghFalso([
      ["pr create", "https://github.com/x/pull/15"],
      ["pr merge", ""],
      ["workflow run deploy.yml", ""]
    ]);
    const gitFalso = async (args) => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") return "abc123\n";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
      if (args[0] === "diff-tree") return "api/forecast.js\nscripts/x.js\n";
      return "";
    };
    const cfg = { codigo: "CI_ROJO", workflow: "ci.yml", runId: "50", seco: false };
    const res = await deshacerUltimaReparacion(cfg, "abc123", { gh, git: gitFalso, probar: async () => {} });
    assert.ok(res.detalle.includes("https://github.com/x/pull/15"));
    assert.ok(gh.llamadas.some(l => l === "workflow run deploy.yml"));
  });

  it("deshacer una reparación que no tocó api/ no lanza deploy.yml", async () => {
    const gh = ghFalso([
      ["pr create", "https://github.com/x/pull/16"],
      ["pr merge", ""]
    ]);
    const gitFalso = async (args) => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") return "abc123\n";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
      if (args[0] === "diff-tree") return "scripts/news.js\n";
      return "";
    };
    const cfg = { codigo: "CI_ROJO", workflow: "ci.yml", runId: "51", seco: false };
    const res = await deshacerUltimaReparacion(cfg, "abc123", { gh, git: gitFalso, probar: async () => {} });
    assert.ok(res.detalle.includes("https://github.com/x/pull/16"));
    assert.ok(!gh.llamadas.some(l => l.startsWith("workflow run")));
  });

  it("deshacer en modo seco no publica ni despliega aunque tocara api/", async () => {
    const gh = ghFalso([]);
    const gitFalso = async (args) => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") return "abc123\n";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
      if (args[0] === "diff-tree") return "api/forecast.js\n";
      return "";
    };
    const cfg = { codigo: "CI_ROJO", workflow: "ci.yml", runId: "52", seco: true };
    const res = await deshacerUltimaReparacion(cfg, "abc123", { gh, git: gitFalso, probar: async () => {} });
    assert.ok(res.detalle.startsWith("Modo seco"));
    assert.strictEqual(gh.llamadas.length, 0);
  });
});

describe("reparador - ejecutarReparador (flujo sin efectos)", () => {
  const envBase = { CODIGO: "SMV_BLOQUEO", WORKFLOW: "smv.yml", RUN_ID: "12345", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
  const ghSinReparaciones = () => ghFalso([
    ["per_page=100", "[]"],
    ["run view", "error en scripts/x.js:1: fallo externo " + "q".repeat(120)],
    ["per_page=1", JSON.stringify([COMMIT_NORMAL])]
  ]);
  const modelosFetch = async () => ({ ok: true, json: async () => ({ data: [{ id: "nvidia/nemotron-3-ultra-550b-a55b" }] }) });

  it("NO_REPARAR termina con 'sin reparación: <motivo>' sin tocar git", async () => {
    const pedir = async (modelo) => ({ modelo, respuesta: "NO_REPARAR\nbloqueo de un tercero" });
    const salida = await ejecutarReparador(envBase, { gh: ghSinReparaciones(), pedir, fetchImpl: modelosFetch });
    assert.strictEqual(salida, "sin reparación: bloqueo de un tercero");
  });

  it("un diff inválido (ruta prohibida) termina sin reparación y sin tocar git", async () => {
    const diff = diffArchivo("package.json", { añadir: ["x"] });
    const pedir = async (modelo) => ({ modelo, respuesta: diff + "---MOTIVO---\nCambio" });
    const salida = await ejecutarReparador(envBase, { gh: ghSinReparaciones(), pedir, fetchImpl: modelosFetch, comprobarAplica: aplicaOk });
    assert.ok(salida.startsWith("sin reparación: Ruta no permitida"), salida);
  });

  it("si ningún modelo está disponible no pide parche", async () => {
    let llamado = false;
    const pedir = async () => { llamado = true; return { modelo: "x", respuesta: "NO_REPARAR\nx" }; };
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
    const salida = await ejecutarReparador(envBase, { gh: ghSinReparaciones(), pedir, fetchImpl });
    assert.strictEqual(llamado, false);
    assert.strictEqual(salida, "sin reparación: ningún modelo disponible");
  });
});

describe("reparador - modo seco y relanzado", () => {
  const env = { CODIGO: "SMV_BLOQUEO", WORKFLOW: "smv.yml", RUN_ID: "77", NVIDIA_API_KEY: "nvapi-claveprueba123", GH_TOKEN: "ghp_tokenprueba123" };
  const ghFlujo = () => ghFalso([
    ["per_page=100", "[]"],
    ["per_page=1", JSON.stringify([COMMIT_NORMAL])],
    ["run view", "error en scripts/x.js:1: fallo " + "q".repeat(120)],
    ["workflow run", ""]
  ]);
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ id: "nvidia/nemotron-3-ultra-550b-a55b" }] }) });
  const diff = diffArchivo("scripts/x.js", { añadir: ["// arreglo"] });
  const pedir = async (modelo) => ({ modelo, respuesta: diff + "---MOTIVO---\nArreglo de prueba" });

  it("sin seco: aplica, publica y relanza el workflow fallido", async () => {
    const gh = ghFlujo();
    const aplicar = async () => ({ ok: true, url: "https://github.com/x/pull/9", archivos: ["scripts/x.js"] });
    const salida = await ejecutarReparador(env, { gh, pedir, fetchImpl, comprobarAplica: aplicaOk, aplicar });
    assert.ok(salida.includes("https://github.com/x/pull/9"), salida);
    assert.ok(gh.llamadas.some(l => l === "workflow run smv.yml"));
  });

  it("si el workflow no admite workflow_dispatch (ci.yml), no falla tras fusionar y sí lanza deploy si toca api/", async () => {
    assert.strictEqual(workflowAdmiteDispatch("ci.yml"), false);
    assert.strictEqual(workflowAdmiteDispatch("smv.yml"), true);
    const gh = ghFalso([
      ["per_page=100", "[]"],
      ["per_page=1", JSON.stringify([COMMIT_NORMAL])],
      ["run view", "error en api/forecast.js:1: fallo " + "q".repeat(120)],
      ["workflow run deploy.yml", ""]
    ]);
    const diffApi = diffArchivo("api/forecast.js", { añadir: ["// arreglo"] });
    const pedirApi = async (modelo) => ({ modelo, respuesta: diffApi + "---MOTIVO---\nArreglo api" });
    const aplicar = async () => ({ ok: true, url: "https://github.com/x/pull/10", archivos: ["api/forecast.js"] });
    const salida = await ejecutarReparador({ ...env, CODIGO: "CI_ROJO", WORKFLOW: "ci.yml" }, { gh, pedir: pedirApi, fetchImpl, comprobarAplica: aplicaOk, aplicar });
    assert.ok(salida.includes("https://github.com/x/pull/10"), salida);
    assert.ok(!gh.llamadas.some(l => l === "workflow run ci.yml"));
    assert.ok(gh.llamadas.some(l => l === "workflow run deploy.yml"));
  });

  it("si gh workflow run falla porque el workflow no tiene workflow_dispatch, no falla tras fusionar", async () => {
    const gh = ghFalso([
      ["per_page=100", "[]"],
      ["per_page=1", JSON.stringify([COMMIT_NORMAL])],
      ["run view", "error en scripts/x.js:1: fallo " + "q".repeat(120)],
      ["workflow run inexistente-dispatch.yml", new Error("HTTP 422: Workflow does not have 'workflow_dispatch' trigger")]
    ]);
    const aplicar = async () => ({ ok: true, url: "https://github.com/x/pull/11", archivos: ["scripts/x.js"] });
    const salida = await ejecutarReparador({ ...env, WORKFLOW: "inexistente-dispatch.yml" }, { gh, pedir, fetchImpl, comprobarAplica: aplicaOk, aplicar });
    assert.ok(salida.includes("https://github.com/x/pull/11"), salida);
  });

  it("con seco: no relanza nada y devuelve el detalle del diff", async () => {
    const gh = ghFlujo();
    const aplicar = async () => ({ ok: true, seco: true, archivos: ["scripts/x.js"], detalle: "Modo seco (no se publica) DIFF" });
    const salida = await ejecutarReparador({ ...env, REPARADOR_SECO: "1" }, { gh, pedir, fetchImpl, comprobarAplica: aplicaOk, aplicar });
    assert.strictEqual(salida, "Modo seco (no se publica) DIFF");
    assert.ok(!gh.llamadas.some(l => l.startsWith("workflow run")));
  });

  it("con seco y tests en rojo en ambos intentos: sin reparación", async () => {
    const gh = ghFlujo();
    const aplicar = async () => ({ ok: false, error: "npm test fallo" });
    const salida = await ejecutarReparador({ ...env, REPARADOR_SECO: "1" }, { gh, pedir, fetchImpl, comprobarAplica: aplicaOk, aplicar });
    assert.strictEqual(salida, "sin reparación: tests en rojo");
  });

  it("REPARADOR_SECO por defecto es 0; 1 activa el modo seco", () => {
    const base = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "1", NVIDIA_API_KEY: "k", GH_TOKEN: "t" };
    assert.strictEqual(leerConfig(base).seco, false);
    assert.strictEqual(leerConfig({ ...base, REPARADOR_SECO: "1" }).seco, true);
    assert.strictEqual(leerConfig({ ...base, REPARADOR_SECO: "0" }).seco, false);
  });

  it("REPARADOR_SECO con otro valor se rechaza", () => {
    const base = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "1", NVIDIA_API_KEY: "k", GH_TOKEN: "t" };
    assert.throws(() => leerConfig({ ...base, REPARADOR_SECO: "yes" }), /REPARADOR_SECO/);
  });
});

describe("reparador - leerConfig", () => {
  const completo = { CODIGO: "CI_ROJO", WORKFLOW: "ci.yml", RUN_ID: "123", NVIDIA_API_KEY: "k", GH_TOKEN: "t" };

  it("acepta un entorno completo", () => {
    assert.strictEqual(leerConfig(completo).codigo, "CI_ROJO");
  });

  it("rechaza variables que faltan", () => {
    assert.throws(() => leerConfig({ ...completo, RUN_ID: "" }), /Faltan/);
  });

  it("rechaza códigos, workflows y run_id con formato raro (inyección)", () => {
    assert.throws(() => leerConfig({ ...completo, CODIGO: "CI; rm -rf" }), /Código/);
    assert.throws(() => leerConfig({ ...completo, WORKFLOW: "../x.yml" }), /workflow/);
    assert.throws(() => leerConfig({ ...completo, RUN_ID: "1 2" }), /RUN_ID/);
  });
});

describe("reparador - workflow reparar.yml", () => {
  const yml = fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/reparar.yml"), "utf-8");

  it("usa el secreto NVIDIA_API_KEY existente", () => {
    assert.ok(yml.includes("secrets.NVIDIA_API_KEY"));
    assert.ok(!yml.includes("VIGIA_NVIDIA_API_KEY"));
  });

  it("no interpola inputs dentro de run:", () => {
    const lineasRun = yml.split("\n").filter(l => /^\s*run:/.test(l));
    assert.ok(lineasRun.length > 0);
    assert.ok(lineasRun.every(l => !l.includes("${{")));
  });

  it("expone el input seco (choice 0/1, por defecto 0) pasado por env", () => {
    assert.ok(/seco:\n\s+description:[^\n]*\n\s+required: false\n\s+type: choice/.test(yml));
    assert.ok(yml.includes("default: '0'"));
    assert.ok(yml.includes("REPARADOR_SECO: ${{ github.event.inputs.seco }}"));
  });

  it("tiene concurrency sin cancelar y permisos de escritura", () => {
    assert.ok(yml.includes("group: reparar"));
    assert.ok(yml.includes("cancel-in-progress: false"));
    assert.ok(yml.includes("contents: write"));
  });
});
