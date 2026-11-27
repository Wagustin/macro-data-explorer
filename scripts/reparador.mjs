#!/usr/bin/env node
// Reparador automático de PerData: analiza fallos de CI y propone/aplica parches mínimos.
// Uso: node scripts/reparador.mjs
// Entradas por variables de entorno: CODIGO, WORKFLOW, RUN_ID, NVIDIA_API_KEY, GH_TOKEN,
// REPARADOR_MODELO (opcional). Nunca se interpolan en shell: todo va por argv o stdin.

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MODELO_POR_DEFECTO = "nvidia/nemotron-3-ultra-550b-a55b";
const MODELOS_FALLBACK = [
  "nvidia/nemotron-3.5-super-vl-120b-a12b",
  "minimaxai/minimax-m3.1-flash"
];
const URL_CHAT = "https://integrate.api.nvidia.com/v1/chat/completions";
const URL_MODELOS = "https://integrate.api.nvidia.com/v1/models";

const MAX_ARCHIVOS = 3;
const MAX_LINEAS_CAMBIADAS = 60;
const MAX_ARCHIVOS_CONTEXTO = 5;
const LINEAS_CONTEXTO = 400;
const LIMITE_REPARACIONES_DIA = 2;
const TIMEOUT_TESTS_MS = 15 * 60 * 1000;

const CODIGO_RE = /^[A-Z0-9_]{1,40}$/;
const WORKFLOW_RE = /^[A-Za-z0-9._-]+\.ya?ml$/;
const RUN_ID_RE = /^\d{1,20}$/;
const MODELO_RE = /^[A-Za-z0-9._\/-]{1,120}$/;

const IDENTIDAD_BOT = {
  GIT_AUTHOR_NAME: "perdata-bot",
  GIT_AUTHOR_EMAIL: "perdata-bot@users.noreply.github.com",
  GIT_COMMITTER_NAME: "perdata-bot",
  GIT_COMMITTER_EMAIL: "perdata-bot@users.noreply.github.com"
};

// Rutas permitidas: se aplican a las rutas REALES del diff (no al prompt).
const RUTAS_PERMITIDAS = {
  scripts: {
    allow: ["scripts/**/*.js", "scripts/**/*.mjs"],
    deny: [
      "scripts/vigia.mjs",
      "scripts/reparador.mjs",
      "scripts/smv-plan-b*.sh",
      "scripts/build-cf.js",
      "scripts/boletin.js",
      "scripts/alertas.js"
    ]
  },
  api: {
    allow: ["api/**/*.js"],
    deny: [
      "api/billing.js",
      "api/auth.js",
      "api/sync.js",
      "api/boletin.js",
      "api/_lib/session.js",
      "api/_lib/stripe.js",
      "api/_lib/mercadopago.js",
      "api/_lib/turnstile.js",
      "api/_lib/users.js",
      "api/_lib/backup.js",
      "api/_lib/d1.js"
    ]
  },
  workflows: {
    allow: [".github/workflows/*.yml"],
    deny: [
      ".github/workflows/deploy.yml",
      ".github/workflows/rollback.yml",
      ".github/workflows/reparar.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/boletin.yml",
      ".github/workflows/alertas.yml",
      ".github/workflows/backup.yml",
      ".github/workflows/d1-backfill.yml"
    ]
  },
  test: {
    allow: ["test/**/*"],
    deny: []
  }
};

// Patrones sin barra se comparan contra el nombre del archivo en cualquier carpeta.
const RUTAS_PROHIBIDAS = [
  "*.html",
  "*.css",
  "data/**",
  "wrangler.jsonc",
  "package.json",
  "package-lock.json",
  "worker.js",
  "server.js",
  "docs/**"
];

const PROMPT_SISTEMA = `Eres el técnico de mantenimiento de PerData. Arreglas el fallo con el cambio MÁS PEQUEÑO posible. No rediseñas, no refactorizas, no cambias textos ni diseño, no tocas datos. Si el fallo es externo (red, servicio caído, bloqueo de un tercero) o no estás seguro, responde exactamente NO_REPARAR y una línea con el motivo. Si reparas, responde SOLO un diff unificado válido para \`git apply\` (rutas a/ y b/) y, después de una línea \`---MOTIVO---\`, una explicación de 1 a 3 frases en español.`;

// ---------------------------------------------------------------------------
// Utilidades: redacción de secretos, salida, procesos
// ---------------------------------------------------------------------------

let secretosConocidos = [];

export function registrarSecretos(valores) {
  secretosConocidos = valores.filter(v => typeof v === "string" && v.length >= 8);
}

export function redactar(texto) {
  let limpio = String(texto ?? "");
  for (const s of secretosConocidos) limpio = limpio.split(s).join("***");
  return limpio
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_***")
    .replace(/ghp_[A-Za-z0-9]+/g, "ghp_***");
}

function informar(msg, rutaResumen) {
  const limpio = redactar(msg);
  console.log(limpio);
  if (rutaResumen) fs.appendFileSync(rutaResumen, limpio + "\n");
  return limpio;
}

function ejecutar(cmd, args, { cwd = REPO_ROOT, input = "", env, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      const cola = (texto, n) => texto.slice(-n);
      reject(new Error(`${cmd} ${args.join(" ")} salió con código ${code}\n${cola(out, 3000)}\n${cola(err, 2000)}`));
    });
    child.stdin.end(input);
  });
}

// gh con token por entorno (GH_TOKEN ya está en process.env)
async function ghReal(args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 50 * 1024 * 1024 });
  return stdout.trim();
}

const git = (args, opciones = {}) => ejecutar("git", args, opciones);

// ---------------------------------------------------------------------------
// Contexto del fallo
// ---------------------------------------------------------------------------

function escaparRe(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ruta relativa, sin ".." ni barras invertidas.
export function rutaRelativaSegura(ruta) {
  return typeof ruta === "string" && ruta.length > 0 && !path.posix.isAbsolute(ruta) &&
    !ruta.includes("\\") && !ruta.split("/").includes("..");
}

// Ruta relativa que además cae dentro de la raiz indicada.
export function rutaSegura(ruta, raiz = REPO_ROOT) {
  if (!rutaRelativaSegura(ruta)) return false;
  const resuelta = path.resolve(raiz, ruta);
  return resuelta.startsWith(path.resolve(raiz) + path.sep);
}

export async function recogerContexto({ runId, workflow, gh = ghReal, raiz = REPO_ROOT } = {}) {
  let log = "";
  try {
    log = await gh(["run", "view", runId, "--log-failed"]);
  } catch {
    log = "";
  }
  if (log.length < 100) {
    try {
      const jobs = JSON.parse(await gh(["api", `repos/{owner}/{repo}/actions/runs/${runId}/jobs`]));
      const fallido = jobs.jobs?.find(j => j.conclusion === "failure");
      if (fallido) {
        log = await gh(["api", `repos/{owner}/{repo}/actions/jobs/${fallido.id}/logs`]);
      }
    } catch {
      // sin log alternativo: se trabaja con lo que haya
    }
  }
  log = redactar(log);

  const logRecortado = log.split("\n").slice(-150).join("\n");

  const rutas = new Set();
  const regexRuta = /(?:scripts|api|\.github\/workflows|test)\/[^\s:)'"`]+\.(?:js|mjs|yml)/g;
  for (const m of log.matchAll(regexRuta)) rutas.add(m[0]);
  if (workflow) rutas.add(`.github/workflows/${workflow}`);

  const archivos = [];
  for (const ruta of rutas) {
    if (archivos.length >= MAX_ARCHIVOS_CONTEXTO) break;
    if (!rutaSegura(ruta, raiz)) continue;
    const completa = path.join(raiz, ruta);
    if (!fs.existsSync(completa)) continue;

    const lineasArchivo = fs.readFileSync(completa, "utf-8").split("\n");
    const citas = [...log.matchAll(new RegExp(`${escaparRe(ruta)}:(\\d+)`, "g"))]
      .map(m => parseInt(m[1], 10))
      .filter(l => l > 0 && l <= lineasArchivo.length);

    // Ventana de LINEAS_CONTEXTO líneas centrada en la primera cita (o el inicio del archivo).
    let inicio = 0;
    if (citas.length > 0) {
      const centro = Math.min(...citas) - 1;
      inicio = Math.max(0, centro - Math.floor(LINEAS_CONTEXTO / 2));
    }
    const fin = Math.min(lineasArchivo.length, inicio + LINEAS_CONTEXTO);
    archivos.push({
      ruta,
      contenido: lineasArchivo.slice(inicio, fin).join("\n"),
      inicio: inicio + 1,
      fin
    });
  }

  return { log: logRecortado, archivos };
}

// ---------------------------------------------------------------------------
// Barreras sobre el diff
// ---------------------------------------------------------------------------

// Glob mínimo: ** (cualquier profundidad), * (sin barra), ? (un carácter sin barra).
export function coincideGlob(ruta, patron) {
  const re = globARegExp(patron);
  // Sin barra en el patrón: se compara el nombre del archivo, en cualquier carpeta.
  return re.test(patron.includes("/") ? ruta : path.posix.basename(ruta));
}

function globARegExp(patron) {
  let re = "^";
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i];
    if (c === "*" && patron[i + 1] === "*") {
      if (patron[i + 2] === "/") { re += "(?:.*/)?"; i += 2; }
      else { re += ".*"; i += 1; }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += escaparRe(c);
    }
  }
  return new RegExp(re + "$");
}

export function rutaPermitida(ruta) {
  if (!rutaRelativaSegura(ruta)) return false;
  for (const prohibida of RUTAS_PROHIBIDAS) {
    if (coincideGlob(ruta, prohibida)) return false;
  }
  for (const config of Object.values(RUTAS_PERMITIDAS)) {
    if (config.deny.some(d => coincideGlob(ruta, d))) return false;
    if (config.allow.some(a => coincideGlob(ruta, a))) return true;
  }
  return false;
}

// Separa el diff por archivo y cuenta solo las líneas +/- dentro de los hunks.
export function parsearDiff(diff) {
  const secciones = diff.split(/^(?=diff --git )/m).filter(s => s.startsWith("diff --git "));
  return secciones.map(seccion => {
    const cabecera = seccion.split("\n")[0].match(/^diff --git a\/(.+?) b\/(.+)$/);
    const lineas = seccion.split("\n");
    const inicioHunk = lineas.findIndex(l => l.startsWith("@@"));
    let mas = 0;
    let menos = 0;
    if (inicioHunk !== -1) {
      for (const l of lineas.slice(inicioHunk)) {
        if (l.startsWith("+")) mas++;
        else if (l.startsWith("-")) menos++;
      }
    }
    return {
      ruta: cabecera ? cabecera[2] : null,
      rutaOrigen: cabecera ? cabecera[1] : null,
      nuevo: /^new file mode/m.test(seccion) || /^--- \/dev\/null$/m.test(seccion),
      borrado: /^deleted file mode/m.test(seccion) || /^\+\+\+ \/dev\/null$/m.test(seccion),
      renombrado: /^rename (from|to) /m.test(seccion),
      binario: /^(GIT binary patch|Binary files )/m.test(seccion),
      mas,
      menos,
      lineasCambiadas: mas + menos,
      seccion
    };
  });
}

// Exportaciones con nombre: si el diff quita una exportación y no la vuelve a declarar, se rechaza.
function nombresExportados(texto) {
  const nombres = new Set();
  for (const m of texto.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/gm)) nombres.add(m[1]);
  for (const m of texto.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const parte of m[1].split(",")) {
      const nombre = parte.trim().split(/\s+as\s+/).pop();
      if (nombre) nombres.add(nombre);
    }
  }
  return nombres;
}

async function comprobarAplicaReal(diff) {
  await ejecutar("git", ["apply", "--check", "-"], { input: diff });
}

// Devuelve null si el diff pasa todas las barreras, o el motivo del rechazo.
export async function validarDiff(diff, { comprobarAplica = comprobarAplicaReal } = {}) {
  const archivos = parsearDiff(diff);
  if (archivos.length === 0) return "El diff no contiene archivos";
  if (archivos.length > MAX_ARCHIVOS) {
    return `Demasiados archivos modificados: ${archivos.length} (máx ${MAX_ARCHIVOS})`;
  }

  let totalLineas = 0;
  for (const arch of archivos) {
    if (arch.binario) return `Diff binario no permitido: ${arch.ruta}`;
    if (arch.renombrado || arch.rutaOrigen !== arch.ruta) {
      return `Renombrar archivos no permitido: ${arch.rutaOrigen} -> ${arch.ruta}`;
    }
    if (!rutaPermitida(arch.ruta)) {
      return `Ruta no permitida: ${arch.ruta}`;
    }
    if (arch.ruta.startsWith("test/") && !arch.nuevo) {
      return `Se prohíbe borrar o modificar tests existentes: ${arch.ruta}`;
    }
    if (arch.borrado) {
      return `Se prohíbe borrar archivos: ${arch.ruta}`;
    }
    totalLineas += arch.lineasCambiadas;
  }

  if (totalLineas > MAX_LINEAS_CAMBIADAS) {
    return `Demasiadas líneas cambiadas: ${totalLineas} (máx ${MAX_LINEAS_CAMBIADAS})`;
  }

  const quitadas = new Set();
  const añadidas = new Set();
  for (const arch of archivos) {
    for (const l of arch.seccion.split("\n")) {
      if (l.startsWith("-") && !l.startsWith("---")) quitadas.add(l.slice(1));
      if (l.startsWith("+") && !l.startsWith("+++")) añadidas.add(l.slice(1));
    }
  }
  const exportacionesAntes = nombresExportados([...quitadas].join("\n"));
  const exportacionesDespues = nombresExportados([...añadidas].join("\n"));
  for (const nombre of exportacionesAntes) {
    if (!exportacionesDespues.has(nombre)) {
      return `Cambia el nombre o elimina una exportación pública: ${nombre}`;
    }
  }

  try {
    await comprobarAplica(diff);
  } catch (e) {
    return `El diff no aplica: ${redactar(e.message.split("\n")[0])}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Límite diario y modelos
// ---------------------------------------------------------------------------

// Una reparación es un commit cuyo asunto (primera línea) empieza por fix(auto): o revert(auto:)
// y termina en [reparador]. El cuerpo no cuenta: los commits del propio reparador lo mencionan.
export function esCommitReparador(mensaje) {
  const asunto = (mensaje || "").split("\n")[0].trimEnd();
  return /^(fix|revert)\(auto\):.*\[reparador\]$/.test(asunto);
}

export async function contarReparacionesRecientes({ gh = ghReal, ahora = Date.now() } = {}) {
  const desde = new Date(ahora - 24 * 3600 * 1000).toISOString();
  const json = await gh(["api", `repos/{owner}/{repo}/commits?sha=main&per_page=100&since=${encodeURIComponent(desde)}`]);
  const commits = JSON.parse(json);
  return commits.filter(c => esCommitReparador(c.commit?.message)).length;
}

// Falla cerrado: si no se puede contar, no se repara (el error se propaga al llamador).
export async function verificarLimiteDiario(deps = {}) {
  return (await contarReparacionesRecientes(deps)) >= LIMITE_REPARACIONES_DIA;
}

export async function resolverModelos(candidatos, { fetchImpl = fetch, apiKey } = {}) {
  try {
    const res = await fetchImpl(URL_MODELOS, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return candidatos;
    const data = await res.json();
    const existentes = new Set((data.data || []).map(m => m.id));
    const disponibles = candidatos.filter(c => existentes.has(c));
    return disponibles;
  } catch {
    return candidatos;
  }
}

export async function pedirParche(modelo, contexto, { errorPrevio, fetchImpl = fetch, apiKey } = {}) {
  const bloqueError = errorPrevio
    ? `\n\nLA PROPUESTA ANTERIOR FALLÓ. Error de la validación o de los tests:\n\`\`\`\n${redactar(errorPrevio).slice(-4000)}\n\`\`\`\nPropón un diff corregido, igual de mínimo.`
    : "";

  const mensajeUsuario = `Código de incidente: ${contexto.codigo}
Workflow: ${contexto.workflow}
Run ID: ${contexto.runId}

LOG (últimas 150 líneas):
\`\`\`
${contexto.log}
\`\`\`

ARCHIVOS RELEVANTES:
${contexto.archivos.map(a => `=== ${a.ruta} (líneas ${a.inicio}-${a.fin}) ===\n${a.contenido}`).join("\n\n")}${bloqueError}`;

  const cuerpo = {
    model: modelo,
    messages: [
      { role: "system", content: PROMPT_SISTEMA },
      { role: "user", content: redactar(mensajeUsuario) }
    ],
    temperature: 0.1,
    max_tokens: 4000,
    ...(modelo.startsWith("nvidia/nemotron") && { chat_template_kwargs: { enable_thinking: false } })
  };

  const res = await fetchImpl(URL_CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error API NVIDIA (${res.status}): ${redactar(err).slice(0, 500)}`);
  }
  const data = await res.json();
  const respuesta = data.choices?.[0]?.message?.content?.trim() || "";
  return { modelo, respuesta };
}

// Quita vallas ``` que algunos modelos añaden alrededor del diff.
function quitarVallas(texto) {
  return texto.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
}

export function parsearRespuestaModelo(respuesta) {
  const texto = String(respuesta ?? "").trim();
  if (texto.startsWith("NO_REPARAR")) {
    const motivo = texto.split("\n").slice(1).join(" ").trim() || "sin motivo";
    return { tipo: "no_reparar", motivo };
  }
  const idx = texto.indexOf("---MOTIVO---");
  if (idx === -1) {
    return { tipo: "basura", motivo: "Formato inválido: falta ---MOTIVO---" };
  }
  const diff = quitarVallas(texto.slice(0, idx));
  const motivo = texto.slice(idx + "---MOTIVO---".length).trim().replace(/\s+/g, " ");
  if (!diff.startsWith("diff --git ") || !diff.includes("\n@@")) {
    return { tipo: "basura", motivo: "No es un diff válido" };
  }
  return { tipo: "diff", diff: diff + "\n", motivo: motivo || "Ver diff" };
}

// Prueba cada modelo en orden. NO_REPARAR es una respuesta válida y corta la cadena.
export async function pedirPropuesta(contexto, { modelos, pedir = pedirParche, errorPrevio } = {}) {
  let ultimo = "sin modelos disponibles";
  for (const modelo of modelos) {
    try {
      const { respuesta } = await pedir(modelo, contexto, { errorPrevio });
      const parseado = parsearRespuestaModelo(respuesta);
      if (parseado.tipo === "basura") {
        ultimo = `${modelo}: ${parseado.motivo}`;
        continue;
      }
      return { ...parseado, modelo };
    } catch (e) {
      ultimo = `${modelo}: ${e.message}`;
    }
  }
  return { tipo: "basura", motivo: `ningún modelo devolvió una propuesta válida (${ultimo})` };
}

// ---------------------------------------------------------------------------
// Aplicar, probar, publicar y deshacer
// ---------------------------------------------------------------------------

class ErrorTests extends Error {}

function resumenCorto(motivo) {
  const primera = motivo.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, "");
  return primera.length > 60 ? primera.slice(0, 57).trimEnd() + "..." : primera;
}

async function npmTest() {
  try {
    await ejecutar("npm", ["test"], { timeoutMs: TIMEOUT_TESTS_MS });
  } catch (e) {
    throw new ErrorTests(e.message);
  }
}

async function limpiar(ramaOriginal, rama, runGit = git) {
  await runGit(["reset", "--hard", "HEAD"]).catch(() => {});
  await runGit(["clean", "-fd", "-e", "node_modules"]).catch(() => {});
  await runGit(["checkout", ramaOriginal]).catch(() => {});
  await runGit(["branch", "-D", rama]).catch(() => {});
}

// Crea la rama, aplica el diff y ejecuta node --check y npm test. Limpia si algo falla.
async function aplicarYProbar(diff, rama, ramaOriginal) {
  await git(["checkout", "-b", rama]);
  try {
    await git(["apply", "-"], { input: diff });
    const archivos = parsearDiff(diff).map(a => a.ruta);
    await git(["add", "--", ...archivos]);
    for (const arch of archivos) {
      if (arch.endsWith(".js") || arch.endsWith(".mjs")) {
        await ejecutar("node", ["--check", arch]);
      }
    }
    await npmTest();
    return { ok: true, archivos };
  } catch (e) {
    await limpiar(ramaOriginal, rama);
    return { ok: false, error: redactar(e.message) };
  }
}

async function publicar({ rama, asunto, cuerpo, cuerpoPr, ramaOriginal, cfg, gh = ghReal, git: runGit = git }) {
  await runGit(["push", "origin", rama]);
  const url = await gh(["pr", "create", "--title", asunto, "--body", cuerpoPr, "--head", rama, "--base", "main"]);
  const numero = url.match(/\/pull\/(\d+)/)?.[1] || url.match(/#(\d+)/)?.[1];
  if (!numero) throw new Error(`No se pudo obtener el número del PR: ${redactar(url)}`);
  await gh(["pr", "merge", numero, "--squash", "--delete-branch", "--subject", asunto, "--body", cuerpo]);
  return url;
}

function enlaceRun(cfg) {
  const repo = process.env.GITHUB_REPOSITORY || "Wagustin/macro-data-explorer";
  return `https://github.com/${repo}/actions/runs/${cfg.runId}`;
}

async function aplicarPropuesta(cfg, propuesta, deps) {
  const fecha = new Date().toISOString().slice(0, 10);
  const rama = `reparar/${fecha}-${cfg.codigo}-${cfg.runId}`;
  const ramaOriginal = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const archivos = parsearDiff(propuesta.diff).map(a => a.ruta);

  const asunto = `fix(auto): ${resumenCorto(propuesta.motivo)} [reparador]`;
  const cuerpo = `${propuesta.motivo}

Incidente: ${cfg.codigo}
Workflow fallido: ${cfg.workflow} (run ${cfg.runId})

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`;
  const estadisticas = parsearDiff(propuesta.diff)
    .map(a => `- ${a.ruta}: +${a.mas} -${a.menos}`).join("\n");
  const cuerpoPr = `${cuerpo}

Diff stat:
${estadisticas}

Enlace al run fallido: ${enlaceRun(cfg)}`;

  const prueba = await aplicarYProbar(propuesta.diff, rama, ramaOriginal);
  if (!prueba.ok) return { ok: false, error: prueba.error, archivos };

  if (cfg.seco) {
    await limpiar(ramaOriginal, rama);
    return {
      ok: true,
      seco: true,
      archivos,
      detalle: `Modo seco (no se publica). Motivo: ${propuesta.motivo}\nTests: superados (node --check y npm test).\n\nDiff propuesto:\n\`\`\`diff\n${propuesta.diff}\`\`\``
    };
  }

  await git(["commit", "-F", "-"], { input: `${asunto}\n\n${cuerpo}\n`, env: IDENTIDAD_BOT });
  const url = await publicar({ rama, asunto, cuerpo, cuerpoPr, ramaOriginal, cfg, gh: deps.gh });
  return { ok: true, url, archivos };
}

function requiereDespliegue(archivos) {
  return archivos.some(a => a.startsWith("api/"));
}

export function workflowAdmiteDispatch(workflow, raiz = REPO_ROOT) {
  const ruta = path.posix.join(".github/workflows", workflow);
  if (!rutaSegura(ruta, raiz)) return false;
  const completa = path.join(raiz, ruta);
  if (!fs.existsSync(completa)) return true;
  const yml = fs.readFileSync(completa, "utf-8");
  const bloqueOn = yml.match(/^on:(.*(?:\r?\n(?:[ \t]+.*|\s*#.*|\s*))*)/m)?.[0] || "";
  return /\bworkflow_dispatch\b/.test(bloqueOn.replace(/#[^\n]*/g, ""));
}

async function relanzar(cfg, archivos, gh, { raiz = REPO_ROOT } = {}) {
  if (cfg.workflow !== "reparar.yml" && workflowAdmiteDispatch(cfg.workflow, raiz)) {
    try {
      await gh(["workflow", "run", cfg.workflow]);
    } catch (e) {
      if (!/workflow_dispatch|workflow dispatch|does not have.*trigger/i.test(e?.message || "")) throw e;
    }
  }
  if (requiereDespliegue(archivos)) {
    await gh(["workflow", "run", "deploy.yml"]);
  }
}

function esRevert(mensaje) {
  const asunto = (mensaje || "").split("\n")[0].trimStart();
  return /^revert(\(|:|\s)/i.test(asunto);
}

// Busca el último commit de main; si su asunto es de reparación (y no es un revert) devuelve su sha.
export async function ultimoReparadorEnMain(gh) {
  const lista = JSON.parse(await gh(["api", "repos/{owner}/{repo}/commits?sha=main&per_page=1"]));
  const ultimo = lista[0];
  const mensaje = ultimo?.commit?.message;
  if (!ultimo || !esCommitReparador(mensaje) || esRevert(mensaje)) return null;
  return ultimo.sha;
}

export async function deshacerUltimaReparacion(cfg, sha, deps = {}) {
  const runGit = deps.git || git;
  const probar = deps.probar || npmTest;
  const gh = deps.gh || ghReal;

  const local = (await runGit(["rev-parse", "HEAD"])).trim();
  if (local !== sha) throw new Error("el HEAD local no coincide con el último commit de main");

  const archivosSalida = await runGit(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha]);
  const archivos = archivosSalida.split("\n").map(s => s.trim()).filter(Boolean);

  const fecha = new Date().toISOString().slice(0, 10);
  const rama = `reparar/revert-${fecha}-${cfg.runId}`;
  const ramaOriginal = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  await runGit(["checkout", "-b", rama]);
  try {
    await runGit(["revert", "--no-edit", sha], { env: IDENTIDAD_BOT });
    await probar();
  } catch (e) {
    await limpiar(ramaOriginal, rama, runGit);
    throw new Error(`el revert no supera los tests: ${redactar(e.message).slice(0, 500)}`);
  }

  if (cfg.seco) {
    await limpiar(ramaOriginal, rama, runGit);
    return { detalle: `Modo seco (no se publica): el revert de ${sha} supera los tests.` };
  }

  const asunto = "revert(auto): deshacer reparación que rompió CI [reparador]";
  const cuerpo = `Revertido commit ${sha} (reparador anterior) porque rompió CI.
Run fallido: ${enlaceRun(cfg)}

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`;
  const url = await publicar({ rama, asunto, cuerpo, cuerpoPr: cuerpo, ramaOriginal, cfg, gh, git: runGit });
  if (requiereDespliegue(archivos)) {
    await gh(["workflow", "run", "deploy.yml"]);
  }
  return { detalle: `Reparación deshecha (revert) y fusionada: ${url}` };
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function leerConfig(env) {
  const cfg = {
    codigo: env.CODIGO,
    workflow: env.WORKFLOW,
    runId: env.RUN_ID,
    nvidiaKey: env.NVIDIA_API_KEY,
    ghToken: env.GH_TOKEN,
    modeloPrincipal: env.REPARADOR_MODELO || MODELO_POR_DEFECTO,
    resumen: env.GITHUB_STEP_SUMMARY,
    seco: false
  };
  const seco = env.REPARADOR_SECO || "0";
  if (seco !== "0" && seco !== "1") throw new Error("REPARADOR_SECO debe ser 0 o 1");
  cfg.seco = seco === "1";
  const faltan = ["codigo", "workflow", "runId", "nvidiaKey", "ghToken"].filter(k => !cfg[k]);
  if (faltan.length) throw new Error(`Faltan variables de entorno requeridas: ${faltan.join(", ")}`);
  if (!CODIGO_RE.test(cfg.codigo)) throw new Error("Código de incidente no válido");
  if (!WORKFLOW_RE.test(cfg.workflow)) throw new Error("Nombre de workflow no válido");
  if (!RUN_ID_RE.test(cfg.runId)) throw new Error("RUN_ID no válido");
  if (!MODELO_RE.test(cfg.modeloPrincipal)) throw new Error("REPARADOR_MODELO no válido");
  return cfg;
}

export async function ejecutarReparador(env = process.env, deps = {}) {
  const gh = deps.gh || ghReal;
  const cfg = leerConfig(env);
  registrarSecretos([cfg.nvidiaKey, cfg.ghToken]);
  const salida = msg => informar(msg, cfg.resumen);
  const deshacer = deps.deshacer || ((c, sha, d) => deshacerUltimaReparacion(c, sha, d));
  const aplicar = deps.aplicar || (p => aplicarPropuesta(cfg, p, { gh }));

  // El deshacer va antes del límite diario: revertir una reparación que rompió CI es seguridad.
  // Solo se deshace si el último commit de main es del reparador.
  if (cfg.codigo === "CI_ROJO") {
    const sha = await ultimoReparadorEnMain(gh);
    if (sha) {
      try {
        const { detalle } = await deshacer(cfg, sha, { gh, git: deps.git, probar: deps.probar });
        return salida(detalle);
      } catch (e) {
        return salida(`sin reparación: ${e.message}`);
      }
    }
  }

  let limiteAlcanzado;
  try {
    limiteAlcanzado = await verificarLimiteDiario({ gh });
  } catch (e) {
    return salida(`no pude contar las reparaciones recientes: ${redactar(e.message.split("\n")[0])}`);
  }
  if (limiteAlcanzado) {
    return salida("límite diario alcanzado");
  }

  const contexto = { ...(await recogerContexto({ runId: cfg.runId, workflow: cfg.workflow, gh })), codigo: cfg.codigo, workflow: cfg.workflow, runId: cfg.runId };
  const candidatos = [cfg.modeloPrincipal, ...MODELOS_FALLBACK.filter(m => m !== cfg.modeloPrincipal)];
  const modelos = await resolverModelos(candidatos, { apiKey: cfg.nvidiaKey, fetchImpl: deps.fetchImpl });
  if (modelos.length === 0) return salida("sin reparación: ningún modelo disponible");
  const pedir = deps.pedir || ((modelo, ctx, opts) => pedirParche(modelo, ctx, { ...opts, apiKey: cfg.nvidiaKey, fetchImpl: deps.fetchImpl }));

  let propuesta = await pedirPropuesta(contexto, { modelos, pedir });
  if (propuesta.tipo === "no_reparar") return salida(`sin reparación: ${propuesta.motivo}`);
  if (propuesta.tipo === "basura") return salida(`sin reparación: respuesta inválida del modelo (${propuesta.motivo})`);

  let errorValidacion = await validarDiff(propuesta.diff, deps);
  if (errorValidacion) return salida(`sin reparación: ${errorValidacion}`);

  let resultado = await aplicar(propuesta);
  if (!resultado.ok) {
    // Una sola segunda propuesta, con el error como contexto.
    const segunda = await pedirPropuesta(contexto, { modelos, pedir, errorPrevio: resultado.error });
    if (segunda.tipo !== "diff") return salida("sin reparación: tests en rojo");
    errorValidacion = await validarDiff(segunda.diff, deps);
    if (errorValidacion) return salida(`sin reparación: ${errorValidacion}`);
    propuesta = segunda;
    resultado = await aplicar(propuesta);
    if (!resultado.ok) return salida("sin reparación: tests en rojo");
  }

  if (resultado.seco) return salida(resultado.detalle);

  await relanzar(cfg, resultado.archivos, gh, { raiz: deps.raiz });
  return salida(`Reparación aplicada y fusionada: ${propuesta.motivo} (${resultado.url})`);
}

const esEjecucionDirecta = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (esEjecucionDirecta) {
  ejecutarReparador()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(redactar(e?.stack || e));
      process.exit(1);
    });
}
