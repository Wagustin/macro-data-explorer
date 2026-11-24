#!/usr/bin/env node
// El vigía de PerData: una pasada por cron (cada 30 min) que mira el estado del sitio y de los
// procesos diarios, clasifica los incidentes con el catálogo (handoff/vigia-catalogo.md) y aplica
// SOLO las acciones de ese catálogo. Corre en una máquina aparte, sin copia del repo y sin
// credenciales de Cloudflare: el único retroceso posible es disparar rollback.yml en GitHub Actions.
// Nunca edita archivos del repo, ni hace commits, ni toca variables, DNS o cuentas. Nemotron solo
// devuelve un código para los fallos DESCONOCIDO. En modo seco usa una memoria simulada aparte
// (perdata-vigia.seco.json) donde registra lo que haría en real, con sus mismos límites.
// Uso: node scripts/vigia.mjs [--seco]   (ver docs/VIGIA.md)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const REPO = "Wagustin/macro-data-explorer";
const BASE = "https://perdata.site";
const HECHOS_URL = `https://raw.githubusercontent.com/${REPO}/main/data/smv-hechos.json`;
const ESTADO = path.join(os.homedir(), ".local", "state");
const MEMORIA_FILE = path.join(ESTADO, "perdata-vigia.json");
const MEMORIA_SECO_FILE = path.join(ESTADO, "perdata-vigia.seco.json");
const LOG_FILE = path.join(ESTADO, "perdata-vigia.log");
const LOCK_FILE = path.join(ESTADO, "perdata-vigia.lock");
const NIM = "https://integrate.api.nvidia.com/v1";
// Servidor de casa: los planes B de la SMV corren ahí. Se mira por Tailscale y, de respaldo, por TCP.
const CASA = { nombre: "wagus-server", ip: "100.120.75.115", puerto: 22, ms: 5000 };

const MIN = 60e3;
const H = 36e5;
const TG_MAX = 3500;
const LATIDO_H = 4;
const RESUMEN_HORA = 8;
const SILENCIO_DESDE = 23;
const SILENCIO_HASTA = 7;
const HECHOS_UMBRAL_H = 48;
// Resumen de las 08:00: tope de fallos clasificados (cada uno cuesta dos llamadas a gh) y de líneas de silencio.
const FALLOS_RESUMEN_MAX = 40;
const SILENCIO_RESUMEN_MAX = 10;
const PAGINAS_VIGIADAS = ["/", "/dolar", "/precios", "/boletin"];
// Avisos que se envían de noche. El resto se acumula y va en el resumen de las 08:00.
const CRITICOS_SILENCIO = new Set(["PAGOS_ABIERTOS", "PAGINA_CAIDA", "SIN_LATIDO"]);
const SMV = new Set(["smv.yml", "smv-precios.yml"]);
const RED_RE = /ECONNRESET|ETIMEDOUT|socket hang up|\b50[234]\b|rate limit|fetch failed/i;
const DUENO = {
  forecasts: "timesfm.yml", news: "news.yml", smv: "smv-precios.yml", bcrp: "official-data.yml",
  eia: "official-data.yml", d1Sync: "d1-backfill.yml",
};
// REPARAR: reparar.yml pide un parche al modelo y, si tiene éxito, relanza el workflow afectado.
const REPARAR_WF = "reparar.yml";
const REPARAR_MAX_DIA = 2;
// Workflows de datos: un fallo de código en ellos es ERROR_CODIGO (AVISAR y REPARAR).
const WORKFLOWS_DATOS = new Set([
  "timesfm.yml", "news.yml", "smv.yml", "smv-precios.yml", "official-data.yml", "cierre-ayer.yml",
  "cierre-tarde.yml", "boletin.yml", "alertas.yml", "d1-backfill.yml",
]);
const CODIGO_LOG_RE = [
  /TypeError:|ReferenceError:|SyntaxError:/, /is not a function/, /Cannot read propert(?:y|ies)/,
  /Unexpected token/, /\bat .*macro-data-explorer\//,
];
// Un lock con más de 35 min se considera huérfano (una pasada tarda pocos minutos).
const LOCK_HUERFANO_MIN = 35;
// Workflows de datos que corren solo (cron de GitHub o relanzados). Si el último run de cualquiera
// es de hace más de LATIDO_H horas, el servidor de casa ha dejado de latir.
const LATIDO = new Set([
  "timesfm.yml", "noticias-dia.yml", "news.yml", "smv.yml", "smv-precios.yml", "official-data.yml",
  "cierre-ayer.yml", "cierre-tarde.yml", "boletin.yml", "alertas.yml", "d1-backfill.yml",
  // watchdog.yml corre cada hora (cron de GitHub y relanzado por el Worker): sin él, de noche
  // news.yml puede pasar más de 4 h sin correr por retrasos de GitHub y daría falsas alarmas.
  "watchdog.yml",
]);
const CODIGOS_NEMOTRON = ["SMV_BLOQUEO", "CHOQUE_PUSH", "RED_PASAJERA", "DESCONOCIDO"];
const PREFIJOS_RUNS = ["SMV_BLOQUEO", "CHOQUE_PUSH", "RED_PASAJERA", "WATCHDOG_SMOKE", "CI_ROJO", "DESCONOCIDO"];
const CAMPOS_RUNS = "name,workflowName,workflowDatabaseId,conclusion,status,createdAt,databaseId";
// Procesos del watchdog (nombre del check en scripts/watchdog.js) -> workflow que los reparte.
// Sin entrada, el proceso no tiene dueño y su fallo se avisa (DESCONOCIDO). La copia de seguridad
// no tiene dueño a propósito: la hace el Worker, relanzar backup.yml no la arregla.
const PROCESO_DUENO = [
  [/^Hechos de importancia \(SMV\)/, "smv.yml"],
  [/^Cotizaciones de Lima \(SMV\)/, "smv-precios.yml"],
  [/^Proyecciones diarias/, "timesfm.yml"],
  [/^Motor:/, "timesfm.yml"],
  [/^Noticias$/, "news.yml"],
  [/^Resumen de noticias/, "news.yml"],
  [/^Datos oficiales/, "official-data.yml"],
];
// Comprobación a mano por código (copiada de docs/RUNBOOK.md). Va en cada aviso como «Qué hacer a mano:».
const QUE_HACER = {
  SMV_BLOQUEO: "curl -s https://perdata.site/api/status | jq '.smv.ageHours' ; tail -n 5 ~/.local/state/smv-plan-b.log",
  CHOQUE_PUSH: "curl -s https://perdata.site/api/status | jq '.news.ageHours' ; gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E \"CONFLICT|rejected|non-fast-forward|could not apply\"",
  RED_PASAJERA: "gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E \"ECONNRESET|ETIMEDOUT|socket hang up|502|503|504|rate limit|fetch failed\"",
  WATCHDOG_SMOKE: "gh run list -R Wagustin/macro-data-explorer --workflow watchdog.yml --limit 4 --json conclusion,createdAt ; npm run smoke:prod",
  BOLETIN_NO_SALIO: "gh api \"repos/Wagustin/macro-data-explorer/commits?sha=main&per_page=40\" --jq '.[].commit.message' | grep -F \"data(boletin): enviado $(TZ=America/Lima date +%F)\"",
  DATO_VIEJO: "curl -s https://perdata.site/api/status | jq 'map_values({ageHours, staleAfterHours, error, fecha, edadHoras})'",
  PAGINA_CAIDA: "for p in / /dolar /precios /boletin; do echo \"$p $(curl -s -o /dev/null -w '%{http_code}' https://perdata.site$p)\"; done",
  PAGOS_ABIERTOS: "curl -s \"https://perdata.site/api/billing?action=config\" | jq .paymentsEnabled",
  CI_ROJO: "gh run list -R Wagustin/macro-data-explorer --workflow ci.yml --branch main --limit 3 --json conclusion,createdAt,databaseId",
  SIN_LATIDO: "gh run list -R Wagustin/macro-data-explorer --limit 20 --json workflowName,createdAt,status,conclusion ; curl -s -o /dev/null -w '%{http_code}\\n' https://perdata.site/api/status",
  DESCONOCIDO: "gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | tail -n 100",
  SERVIDOR_CASA: "tailscale status | grep wagus-server ; timeout 5 bash -c '</dev/tcp/100.120.75.115/22' && echo puerto 22 abierto",
  VIGIA_ROTO: "cd ~/perdata-vigia && node vigia.mjs --seco ; tail -n 5 ~/.local/state/perdata-vigia.log",
};
const QUE_HACER_DEFECTO = "leer el final del log y docs/RUNBOOK.md";
const SMOKE_RE = /FALLA\s+Pruebas completas \(smoke\)|Error fatal en smoke test/;
const HACE_RE = /hace (\d+(?:[.,]\d+)?) (h|días?)\b/i;

// Token de gh: se pasa solo en el entorno del proceso hijo, nunca en los argumentos.
const ghConfig = { token: null };
// Señales de credenciales rotas en esta pasada: "gh-401" y "nvidia-401".
const senales = new Set();

const nombreArchivo = (p = "") => path.posix.basename(String(p));
const esFallo = (run) => run?.status === "completed" && ["failure", "timed_out", "startup_failure"].includes(run.conclusion);
const cola = (texto, n) => String(texto ?? "").split(/\r?\n/).slice(-n).join("\n");
const queHacer = (codigo) => QUE_HACER[codigo] ?? QUE_HACER_DEFECTO;
const etiquetaDe = (inc) => {
  const donde = inc.origen || inc.workflow || inc.bloque;
  return donde ? `${inc.codigo}@${donde}` : inc.codigo;
};

export function limaParts(instante) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(instante));
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { fecha: `${v.year}-${v.month}-${v.day}`, hora: Number(v.hour), dia: dias[v.weekday] };
}

// True entre las 23:00 y las 07:00 de Lima (horas de silencio: los avisos no críticos se acumulan).
export function enHorasSilencio(instante = new Date()) {
  const { hora } = limaParts(new Date(instante));
  return hora >= SILENCIO_DESDE || hora < SILENCIO_HASTA;
}

// ---------- Clasificación determinista (catálogo, sección «Cómo se detecta») ----------

function horasDe(detalle) {
  const m = String(detalle).match(HACE_RE);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return /^d/i.test(m[2]) ? n * 24 : n;
}

// Un fallo del watchdog es WATCHDOG_SMOKE solo si falla el smoke. Si no, cada línea «FALLA  <proceso>: <detalle>»
// se clasifica por su nombre: SMV -> SMV_BLOQUEO (espera), proceso con dueño y «hace N h» -> DATO_VIEJO,
// el resto -> DESCONOCIDO. Devuelve una lista (un incidente por proceso que falla).
export function clasificarWatchdog(logTail) {
  const lineas = String(logTail ?? "").split(/\r?\n/);
  if (lineas.some((l) => SMOKE_RE.test(l))) return [{ codigo: "WATCHDOG_SMOKE", clave: "WATCHDOG_SMOKE" }];
  const procesos = [];
  for (const l of lineas) {
    const m = l.match(/FALLA\s+(.+?):\s*(.*)$/);
    if (m) procesos.push({ proceso: m[1].trim(), detalle: m[2].trim() });
  }
  if (!procesos.length) return [{ codigo: "DESCONOCIDO", clave: "DESCONOCIDO:watchdog" }];
  return procesos.map(({ proceso, detalle }) => {
    const workflow = PROCESO_DUENO.find(([re]) => re.test(proceso))?.[1];
    const motivo = `${proceso}: ${detalle}`;
    if (/SMV/.test(proceso)) {
      return {
        codigo: "SMV_BLOQUEO", proceso, workflow, origen: "watchdog", motivo,
        ageHoras: horasDe(detalle), umbralHoras: /Hechos/.test(proceso) ? 48 : 72,
        clave: `SMV_BLOQUEO:watchdog:${proceso}`,
      };
    }
    const horas = horasDe(detalle);
    if (workflow && horas !== null) {
      return { codigo: "DATO_VIEJO", proceso, workflow, origen: "watchdog", motivo, ageHoras: horas, clave: `DATO_VIEJO:${workflow}` };
    }
    return { codigo: "DESCONOCIDO", proceso, motivo, clave: `DESCONOCIDO:watchdog:${proceso}` };
  });
}

export function clasificarFallo({ workflowPath = "", stepName = "", logTail = "" } = {}) {
  const wf = nombreArchivo(workflowPath);
  const paso = String(stepName);
  const log = String(logTail);
  if (wf === "watchdog.yml" && /Comprobar la web/i.test(paso)) return clasificarWatchdog(log)[0].codigo;
  if (wf === "ci.yml") return "CI_ROJO";
  if (/^Guardar/i.test(paso) && /CONFLICT|rejected|non-fast-forward|could not apply/i.test(log)) return "CHOQUE_PUSH";
  if (SMV.has(wf) && /HTTP 418|HTTP 403|fetch failed|respuesta inesperada de la SMV/i.test(log)) return "SMV_BLOQUEO";
  if (!SMV.has(wf) && RED_RE.test(log)) return "RED_PASAJERA";
  if (WORKFLOWS_DATOS.has(wf) && esErrorCodigo(log)) return "ERROR_CODIGO";
  return "DESCONOCIDO";
}

// Error de código (TypeError, SyntaxError, stack trace del repo...) y no de red, SMV, choque de push ni rate limit.
export function esErrorCodigo(logTail) {
  const log = String(logTail ?? "");
  const hayCodigo = CODIGO_LOG_RE.some((re) => re.test(log));
  const otraCosa = /ECONNRESET|ETIMEDOUT|socket hang up|\b50[234]\b|rate limit|fetch failed|HTTP 418|HTTP 403|respuesta inesperada de la SMV|CONFLICT|rejected|non-fast-forward|could not apply/i.test(log);
  return hayCodigo && !otraCosa;
}

// Devuelve los DATO_VIEJO (ageHours > staleAfterHours) y, después de las 12:00 UTC, el backup de hoy.
export function evaluarStatus(status, ahora = new Date()) {
  if (!status) return [];
  const instante = new Date(ahora);
  const out = [];
  for (const [bloque, workflow] of Object.entries(DUENO)) {
    const b = status[bloque];
    if (typeof b?.ageHours === "number" && typeof b.staleAfterHours === "number" && b.ageHours > b.staleAfterHours) {
      out.push({
        codigo: "DATO_VIEJO", clave: `DATO_VIEJO:${bloque}`, bloque, workflow, ageHours: b.ageHours,
        motivo: `${bloque} con ${b.ageHours} h (límite ${b.staleAfterHours} h)`,
      });
    }
  }
  const hoy = instante.toISOString().slice(0, 10);
  if (instante.getUTCHours() >= 12 && status.backup?.fecha !== hoy) {
    out.push({
      codigo: "DATO_VIEJO", clave: "DATO_VIEJO:backup", bloque: "backup", workflow: "backup.yml",
      motivo: `backup de ${status.backup?.fecha ?? "fecha desconocida"}, se esperaba ${hoy}`,
    });
  }
  return out;
}

// True si hay un commit "data(boletin): enviado <fecha UTC de hoy>" en la lista (el workflow usa `date -u`).
export function boletinEnviado(commits, ahora = new Date()) {
  const prefijo = `data(boletin): enviado ${new Date(ahora).toISOString().slice(0, 10)}`;
  return (commits || []).some((c) => String(c?.commit?.message ?? c?.message ?? "").startsWith(prefijo));
}

// True si es lunes a sábado entre las 09:00 y las 19:00 de Lima y todavía no hay commit de hoy.
export function boletinPendiente(commits, ahora = new Date()) {
  const { hora, dia } = limaParts(new Date(ahora));
  if (dia === 0 || hora < 9 || hora >= 19) return false;
  return !boletinEnviado(commits, ahora);
}

// Estado del boletín para el resumen de las 08:00: «domingo», «enviado», «no salió» o «sin dato» (GitHub no responde).
export function estadoBoletin(commits, ahora = new Date()) {
  if (limaParts(new Date(ahora)).dia === 0) return "domingo";
  if (!Array.isArray(commits)) return "sin dato";
  return boletinEnviado(commits, ahora) ? "enviado" : "no salió";
}

// Latido del servidor de casa: falla si /api/status no responde o si el último run de cualquier
// workflow de datos es de hace más de LATIDO_H horas. Solo avisa (SIN_LATIDO).
export function evaluarLatido({ runs = null, statusFallo = false, ahora = new Date() } = {}) {
  const instante = new Date(ahora);
  const motivos = [];
  if (statusFallo) motivos.push("/api/status no responde");
  if (Array.isArray(runs)) {
    const ultimo = runs
      .filter((r) => LATIDO.has(r.wf))
      .reduce((mejor, r) => (!mejor || Date.parse(r.createdAt) > Date.parse(mejor.createdAt) ? r : mejor), null);
    if (!ultimo) motivos.push("ningún run reciente de los workflows de datos");
    else if (instante - Date.parse(ultimo.createdAt) > LATIDO_H * H) {
      motivos.push(`el último run de datos (${ultimo.wf}) es de hace ${Math.round((instante - Date.parse(ultimo.createdAt)) / H)} h`);
    }
  }
  if (!motivos.length) return null;
  return { codigo: "SIN_LATIDO", clave: "SIN_LATIDO", workflow: null, motivo: `sin latido del servidor: ${motivos.join("; ")}`, logTail: "" };
}

// Hechos de importancia leídos directamente (data/smv-hechos.json, campo raíz «actualizado»). Si tienen más
// de 48 h, SMV_BLOQUEO. Si el watchdog ya avisa de hechos por encima de 48 h, no se duplica.
export function incidenteHechos(json, ahora = new Date(), previos = []) {
  const yaAvisado = previos.some((i) => i.codigo === "SMV_BLOQUEO" && /Hechos/.test(i.proceso ?? "") && i.ageHoras > HECHOS_UMBRAL_H);
  if (yaAvisado) return null;
  const t = Date.parse(json?.actualizado);
  if (Number.isNaN(t)) return null;
  const horas = Math.floor((new Date(ahora) - t) / H);
  if (horas <= HECHOS_UMBRAL_H) return null;
  const motivo = `hechos de la SMV con ${horas} h: revisar el plan B del servidor, scripts/smv-plan-b-hechos.sh, y ~/.local/state/smv-plan-b.log`;
  return {
    codigo: "SMV_BLOQUEO", clave: "SMV_BLOQUEO:hechos", origen: "directo", workflow: "smv.yml",
    proceso: "Hechos de importancia (SMV)", ageHoras: horas, umbralHoras: HECHOS_UMBRAL_H,
    motivo, motivoAviso: motivo, logTail: "",
  };
}

// ---------- Nemotron (solo para DESCONOCIDO; nunca decide acciones) ----------

export function elegirModelo(ids) {
  const nem = (ids || []).filter((id) => /nemotron/i.test(id) && !/embed|rerank|reward|guard|vision|\bvl\b/i.test(id));
  for (const re of [/lightning/i, /nano/i, /mini/i, /\b[48]b\b/i]) {
    const hit = nem.find((id) => re.test(id));
    if (hit) return hit;
  }
  return nem[0] ?? null;
}

export function interpretarRespuesta(texto) {
  const bruto = String(texto ?? "").match(/\{[\s\S]*\}/)?.[0] ?? "";
  let obj;
  try { obj = JSON.parse(bruto); } catch { return { codigo: "DESCONOCIDO", confianza: 0, motivo: "respuesta no válida" }; }
  const confianza = Number(obj?.confianza);
  const motivo = String(obj?.motivo ?? "");
  const codigo = CODIGOS_NEMOTRON.includes(obj?.codigo) ? obj.codigo : "DESCONOCIDO";
  if (codigo === "DESCONOCIDO" || !(confianza >= 0.7)) return { codigo: "DESCONOCIDO", confianza: confianza || 0, motivo };
  return { codigo, confianza, motivo };
}

export async function clasificarConNemotron({ workflow, paso, logTail }, { apiKey, modelo, fetchImpl = fetch, senales: registro = null } = {}) {
  if (!apiKey) return null;
  const t0 = Date.now();
  const cabeceras = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  try {
    let id = modelo || null;
    if (!id) {
      const r = await fetchImpl(`${NIM}/models`, { headers: cabeceras, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { if (r.status === 401) registro?.add("nvidia-401"); return null; }
      id = elegirModelo((await r.json()).data?.map((m) => m.id));
      if (!id) return null;
    }
    const prompt = [
      "Clasifica el fallo de GitHub Actions de PerData en UNO de estos códigos:",
      "SMV_BLOQUEO: la SMV bloquea la descarga (HTTP 418/403, fetch failed, respuesta inesperada de la SMV).",
      "CHOQUE_PUSH: al guardar datos hay conflicto o push rechazado (CONFLICT, rejected, non-fast-forward).",
      "RED_PASAJERA: error de red transitorio (ECONNRESET, ETIMEDOUT, 502/503/504, rate limit).",
      "DESCONOCIDO: no encaja en ninguno.",
      `Workflow: ${workflow}. Paso que falló: ${paso || "desconocido"}.`,
      "Final del log:", '"""', redactar(cola(logTail, 60).slice(-4000)), '"""',
      'Responde solo con JSON: {"codigo": "...", "confianza": 0.0-1.0, "motivo": "frase corta"}.',
    ].join("\n");
    const r = await fetchImpl(`${NIM}/chat/completions`, {
      method: "POST",
      headers: { ...cabeceras, "Content-Type": "application/json" },
      body: JSON.stringify({ model: id, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 400, chat_template_kwargs: { enable_thinking: false } }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) { if (r.status === 401) registro?.add("nvidia-401"); return null; }
    const data = await r.json();
    return { ...interpretarRespuesta(data.choices?.[0]?.message?.content), modelo: id, ms: Date.now() - t0 };
  } catch {
    return null;
  }
}

// ---------- Memoria y pasadas ----------

const memoriaVacia = () => ({
  dia: null, contadores: { relanzar: {}, desplegar: 0, volverAtras: 0, reparar: {} }, fallos: {},
  incidentes: {}, runsVistos: {}, avisos: {}, despliegues: [], historial: [], resumenDia: null,
  pasadasDia: 0, incidentesDia: {}, silencio: [], telegramFallos: 0, rotoDia: null,
});

// Anota una acción ejecutada para el resumen diario. Guarda 48 h y, como mucho, 200 entradas.
function anotar(m, iso, tipo, detalle) {
  const corte = Date.parse(iso) - 48 * H;
  m.historial = [...(m.historial || []), { fecha: iso, tipo, detalle }].filter((h) => Date.parse(h.fecha) >= corte).slice(-200);
}

// Devuelve una copia de la memoria con los contadores del día, las pasadas de cada incidente y los
// fallos de red nuevos. Los incidentes que ya no aparecen se borran, salvo los de fuentes omitidas.
export function registrarPasada(memoria, incidentes, { ahora = new Date(), omitidos = [] } = {}) {
  const instante = new Date(ahora);
  const iso = instante.toISOString();
  const m = { ...memoriaVacia(), ...structuredClone(memoria || {}) };
  const hoy = limaParts(instante).fecha;
  if (m.dia !== hoy) {
    m.dia = hoy;
    m.contadores = memoriaVacia().contadores;
    m.fallos = {};
    m.pasadasDia = 0;
    m.incidentesDia = {};
  }
  m.pasadasDia = (m.pasadasDia || 0) + 1;
  m.incidentesDia = { ...(m.incidentesDia || {}) };
  for (const inc of incidentes) {
    if (inc.runId && !m.runsVistos[inc.runId]) {
      m.runsVistos[inc.runId] = iso;
      if (inc.codigo === "RED_PASAJERA") m.fallos[inc.workflow] = (m.fallos[inc.workflow] || 0) + 1;
    }
  }
  for (const inc of incidentes) m.incidentesDia[inc.clave] = inc.codigo;
  for (const [id, visto] of Object.entries(m.runsVistos)) {
    if (instante - Date.parse(visto) > 3 * 24 * H) delete m.runsVistos[id];
  }
  const siguientes = {};
  for (const inc of incidentes) {
    const previo = m.incidentes[inc.clave];
    if (!previo) {
      siguientes[inc.clave] = { desde: inc.desde || iso, pasadas: 1 };
      continue;
    }
    siguientes[inc.clave] = { ...previo, pasadas: previo.pasadas + 1 };
    if (previo.desplegadoEn) siguientes[inc.clave].trasDespliegue = (previo.trasDespliegue || 0) + 1;
  }
  for (const [clave, previo] of Object.entries(m.incidentes)) {
    if (!(clave in siguientes) && omitidos.some((p) => clave.startsWith(p))) siguientes[clave] = previo;
  }
  m.incidentes = siguientes;
  return m;
}

// ---------- Decisión (función pura) ----------

// Devuelve solo acciones: RELANZAR, DESPLEGAR, VOLVER_ATRAS, AVISAR. «Esperar» no produce acción, pero sí
// deja un veredicto en `veredictos` (un objeto por incidente: etiqueta, accion, motivo y regla aplicada).
export function decidir(incidentes, memoria = {}, ahora = new Date(), enCurso = new Set(), veredictos = []) {
  const instante = new Date(ahora);
  const mem = memoria || {};
  const hoy = limaParts(instante).fecha;
  const contadores = mem.dia === hoy && mem.contadores ? mem.contadores : memoriaVacia().contadores;
  const estados = mem.incidentes || {};
  const relanzosHoy = { ...(contadores.relanzar || {}) };
  let desplegosHoy = contadores.desplegar || 0;
  let volverHoy = contadores.volverAtras || 0;
  let rotoHoy = mem.rotoDia === hoy;
  const repararHoy = { ...(contadores.reparar || {}) };
  const acciones = [];
  const hayCI = incidentes.some((i) => i.codigo === "CI_ROJO");
  const datoViejoDe = (wf) => incidentes.some((i) => i.codigo === "DATO_VIEJO" && i.workflow === wf);
  const minutos = (desde) => Math.round((instante - Date.parse(desde)) / MIN);
  const horas = (desde) => Math.round((instante - Date.parse(desde)) / H);

  const veredicto = (inc, accion, motivo, regla) => {
    const v = { etiqueta: etiquetaDe(inc), codigo: inc.codigo, accion, motivo, regla };
    veredictos.push(v);
    return v;
  };

  function aviso(inc, motivo, regla) {
    const v = veredicto(inc, "AVISAR", motivo, regla);
    acciones.push({ tipo: "AVISAR", codigo: inc.codigo, motivo, accion: null, incidente: inc, claves: [inc.clave], avisoKey: inc.avisoKey, veredicto: v });
  }

  function relanzar(inc, wf, motivo, regla) {
    if (enCurso.has(wf)) return veredicto(inc, "ESPERAR", `${wf} ya tiene una ejecución en curso`, "no relanzar con una ejecución en curso");
    const existente = acciones.find((a) => a.tipo === "RELANZAR" && a.workflow === wf);
    if (existente) {
      existente.claves.push(inc.clave);
      return veredicto(inc, `RELANZAR ${wf}`, "ya pedido en esta pasada por otro incidente", regla);
    }
    if ((relanzosHoy[wf] || 0) >= 2) return aviso(inc, `${motivo}; límite de 2 RELANZAR de ${wf} hoy alcanzado`, "límite de 2 RELANZAR por workflow y día");
    const v = veredicto(inc, `RELANZAR ${wf}`, motivo, regla);
    acciones.push({ tipo: "RELANZAR", workflow: wf, codigo: inc.codigo, motivo, claves: [inc.clave], veredicto: v });
    relanzosHoy[wf] = (relanzosHoy[wf] || 0) + 1;
  }

  function desplegar(inc, motivo, regla) {
    if (hayCI) return veredicto(inc, "ESPERAR", "CI en main en rojo: no se despliega", "no desplegar con CI en rojo");
    if (enCurso.has("deploy.yml")) return veredicto(inc, "ESPERAR", "deploy.yml ya tiene una ejecución en curso", "no desplegar con un despliegue en curso");
    const existente = acciones.find((a) => a.tipo === "DESPLEGAR");
    if (existente) {
      existente.claves.push(inc.clave);
      return veredicto(inc, "DESPLEGAR", "ya pedido en esta pasada por otro incidente", regla);
    }
    if (desplegosHoy >= 1) return aviso(inc, `${motivo}; límite de 1 DESPLEGAR por día alcanzado`, "límite de 1 DESPLEGAR por día");
    const v = veredicto(inc, "DESPLEGAR", motivo, regla);
    acciones.push({ tipo: "DESPLEGAR", workflow: "deploy.yml", codigo: inc.codigo, motivo, claves: [inc.clave], veredicto: v });
    desplegosHoy += 1;
  }

  // REPARAR: una vez por workflow y día, máximo 2 al día en total, nunca con reparar.yml o el workflow en curso.
  function reparar(inc, wf, motivo, regla) {
    if (enCurso.has(REPARAR_WF)) return veredicto(inc, "ESPERAR", `${REPARAR_WF} ya tiene una ejecución en curso`, "REPARAR: nunca con reparar.yml en curso");
    if (enCurso.has(wf)) return veredicto(inc, "ESPERAR", `${wf} tiene una ejecución en curso`, "REPARAR: nunca con el workflow en curso");
    if (repararHoy[wf]) return veredicto(inc, "ESPERAR", `ya se pidió REPARAR de ${wf} hoy`, "REPARAR: una vez por workflow y día");
    const total = Object.values(repararHoy).reduce((s, n) => s + n, 0);
    if (total >= REPARAR_MAX_DIA) return veredicto(inc, "ESPERAR", `límite de ${REPARAR_MAX_DIA} REPARAR al día alcanzado`, "REPARAR: máximo 2 al día en total");
    const v = veredicto(inc, `REPARAR ${wf}`, motivo, regla);
    acciones.push({ tipo: "REPARAR", workflow: wf, codigo: inc.codigo, runId: inc.runId, motivo, claves: [inc.clave], veredicto: v });
    repararHoy[wf] = 1;
  }

  function volverAtras(inc, motivo, regla) {
    if (volverHoy >= 1) return aviso(inc, `${motivo}; límite de 1 VOLVER_ATRAS por día alcanzado`, "límite de 1 VOLVER_ATRAS por día");
    const v = veredicto(inc, "VOLVER_ATRAS", motivo, regla);
    acciones.push({ tipo: "VOLVER_ATRAS", codigo: inc.codigo, motivo, incidente: inc, claves: [inc.clave], veredicto: v });
    volverHoy += 1;
    // Aviso propio de la vuelta atrás: no añade veredicto (el del incidente ya lo recoge).
    acciones.push({
      tipo: "AVISAR", codigo: inc.codigo, motivo: `${motivo}; se intenta volver a la versión anterior del Worker`,
      accion: "VOLVER_ATRAS (rollback.yml en GitHub Actions)", incidente: inc, claves: [inc.clave], vuelta: true,
    });
  }

  for (const inc of incidentes) {
    const est = estados[inc.clave] || {};
    switch (inc.codigo) {
      case "SMV_BLOQUEO": {
        const umbral = inc.umbralHoras ?? 72;
        if (typeof inc.ageHoras === "number" && inc.ageHoras > umbral) {
          aviso(inc, inc.motivoAviso ?? `${inc.proceso ?? "la SMV"} lleva ${inc.ageHoras} h sin datos (más de ${umbral} h)`,
            inc.origen === "directo" ? "hechos de la SMV con más de 48 h (lectura directa)" : `SMV: dato con más de ${umbral} h`);
          break;
        }
        // Detectado por el watchdog: ESPERAR. El plan B del servidor descarga los datos.
        if (inc.origen === "watchdog") {
          const dato = /Hechos/.test(inc.proceso ?? "") ? "hechos" : "cotizaciones";
          const edad = typeof inc.ageHoras === "number" ? `${dato} ${inc.ageHoras} h < ${umbral} h` : `${dato} sin edad conocida`;
          veredicto(inc, "ESPERAR", `${edad}, el plan B del servidor lo cubre`, "SMV en el watchdog: esperar, no relanzar");
          break;
        }
        if (est.relanzadoEn) { veredicto(inc, "ESPERAR", "ya relanzado en una pasada anterior", "SMV: relanzar una sola vez"); break; }
        if (instante - Date.parse(inc.desde) < 2 * H) {
          veredicto(inc, "ESPERAR", `fallo hace ${horas(inc.desde)} h < 2 h`, "SMV: esperar 2 h antes de relanzar");
          break;
        }
        relanzar(inc, inc.workflow, inc.motivo, "SMV: esperar 2 h y relanzar (máx. 2 al día)");
        break;
      }
      case "CHOQUE_PUSH":
        if (!datoViejoDe(inc.workflow)) veredicto(inc, "ESPERAR", "los datos del workflow están al día: otra ejecución ya publicó", "CHOQUE_PUSH: relanzar solo si los datos siguen viejos");
        else if (est.relanzadoEn) veredicto(inc, "ESPERAR", "ya relanzado una vez", "CHOQUE_PUSH: relanzar una sola vez");
        else relanzar(inc, inc.workflow, inc.motivo, "CHOQUE_PUSH: relanzar una vez si los datos siguen viejos");
        break;
      case "RED_PASAJERA": {
        const n = (mem.fallos || {})[inc.workflow] || 0;
        if (n >= 3) { aviso(inc, `tercer fallo de red del día en ${inc.workflow}`, "RED_PASAJERA: al tercer fallo del día, avisar"); break; }
        if (n === 2) { veredicto(inc, "ESPERAR", `${n} fallos de red hoy en ${inc.workflow}`, "RED_PASAJERA: con dos fallos se espera; el tercero avisa"); break; }
        if (est.relanzadoEn) { veredicto(inc, "ESPERAR", "ya relanzado tras este fallo", "RED_PASAJERA: relanzar una vez"); break; }
        if (instante - Date.parse(inc.desde) < 30 * MIN) {
          veredicto(inc, "ESPERAR", `fallo hace ${minutos(inc.desde)} min < 30 min`, "RED_PASAJERA: relanzar tras 30 min");
          break;
        }
        relanzar(inc, inc.workflow, inc.motivo, "RED_PASAJERA: relanzar una vez tras 30 min");
        break;
      }
      case "WATCHDOG_SMOKE":
        if (!est.desplegadoEn) {
          // Si todos los fallos seguidos del smoke son de red (ECONNRESET, 502, rate limit...), hacen falta 3.
          const n = inc.fallosSeguidos || 0;
          const umbral = inc.todosRed ? 3 : 2;
          if (n >= umbral) desplegar(inc, `el watchdog falla ${n} ejecuciones seguidas en la comprobación de la web`, `WATCHDOG_SMOKE: desplegar tras ${umbral} fallos seguidos del smoke`);
          else veredicto(inc, "ESPERAR", `${n} fallo seguido del smoke${inc.todosRed ? " de red" : ""}: se despliega con ${umbral}`, `WATCHDOG_SMOKE: desplegar tras ${umbral} fallos seguidos (${inc.todosRed ? "todos de red" : "no todos de red"})`);
        } else if ((inc.fallosTrasDespliegue || 0) >= 2) {
          volverAtras(inc, "el watchdog sigue fallando tras desplegar", "WATCHDOG_SMOKE: dos fallos más del smoke tras desplegar");
        } else {
          veredicto(inc, "ESPERAR", `${inc.fallosTrasDespliegue || 0} fallo del smoke tras desplegar: se vuelve atrás con 2`, "WATCHDOG_SMOKE: volver atrás tras dos fallos más");
        }
        break;
      case "DATO_VIEJO":
        if (inc.bloque === "backup") { aviso(inc, `${inc.motivo}; relanzar backup.yml no lo arregla, la copia la hace el Worker`, "backup: solo avisar, lo hace el Worker"); break; }
        if (enCurso.has(inc.workflow)) { veredicto(inc, "ESPERAR", `${inc.workflow} ya tiene una ejecución en curso`, "no relanzar con el workflow en curso"); break; }
        if (est.relanzadoEn) {
          if (est.desde && instante - Date.parse(est.desde) >= 6 * H) aviso(inc, "sigue viejo 6 h después del RELANZAR", "DATO_VIEJO: sigue viejo 6 h después del RELANZAR");
          else veredicto(inc, "ESPERAR", "ya relanzado; se mira en la siguiente pasada", "DATO_VIEJO: avisar si sigue 6 h después del RELANZAR");
          break;
        }
        relanzar(inc, inc.workflow, inc.motivo, "DATO_VIEJO: relanzar el workflow dueño");
        break;
      case "BOLETIN_NO_SALIO":
        if (limaParts(instante).hora >= 11) aviso(inc, "a las 11:00 de Lima el boletín sigue sin salir", "BOLETIN_NO_SALIO: a las 11:00 avisar");
        else if (!est.relanzadoEn) relanzar(inc, "boletin.yml", inc.motivo, "BOLETIN_NO_SALIO: relanzar (es seguro, envía una vez al día)");
        else veredicto(inc, "ESPERAR", "ya relanzado hoy", "BOLETIN_NO_SALIO: avisar a las 11:00");
        break;
      case "PAGINA_CAIDA":
        if (est.desplegadoEn) {
          if ((est.trasDespliegue || 0) >= 2) volverAtras(inc, `páginas caídas tras desplegar: ${inc.paginas.join(", ")}`, "PAGINA_CAIDA: dos pasadas caídas tras desplegar");
          else veredicto(inc, "ESPERAR", `caídas tras desplegar: ${est.trasDespliegue || 0} pasada(s), se vuelve atrás con 2`, "PAGINA_CAIDA: volver atrás tras dos pasadas");
        } else if ((est.pasadas || 0) >= 2) {
          desplegar(inc, `páginas caídas dos pasadas seguidas: ${inc.paginas.join(", ")}`, "PAGINA_CAIDA: desplegar tras dos pasadas seguidas");
        } else {
          veredicto(inc, "ESPERAR", "primera pasada con páginas caídas: se espera otra", "PAGINA_CAIDA: esperar la primera vez");
        }
        break;
      case "CI_ROJO":
        aviso(inc, "CI en main en rojo: lo arregla Claude, no se despliega", "CI_ROJO: avisar");
        reparar(inc, "ci.yml", "CI en main en rojo: pedir un parche a reparar.yml", "CI_ROJO: REPARAR una vez al día, además de avisar");
        break;
      case "PAGOS_ABIERTOS":
        aviso(inc, "los pagos aparecen abiertos durante la pausa", "PAGOS_ABIERTOS: avisar de inmediato, nunca tocar");
        break;
      case "SIN_LATIDO":
        aviso(inc, inc.motivo, "SIN_LATIDO: solo avisar");
        break;
      case "SERVIDOR_CASA":
        if (inc.recuperado) aviso(inc, inc.motivo, "SERVIDOR_CASA: aviso de recuperación");
        else if ((est.pasadas || 0) >= 2) aviso(inc, inc.motivo, "SERVIDOR_CASA: dos pasadas seguidas sin respuesta");
        else veredicto(inc, "ESPERAR", "primera pasada sin respuesta: se espera otra", "SERVIDOR_CASA: avisar con dos pasadas seguidas");
        break;
      case "VIGIA_ROTO":
        if (rotoHoy) veredicto(inc, "ESPERAR", "ya se avisó hoy de un fallo del vigía", "VIGIA_ROTO: máximo un aviso al día");
        else {
          rotoHoy = true;
          aviso(inc, inc.motivo, "VIGIA_ROTO: un aviso al día por el canal que funcione");
        }
        break;
      case "ERROR_CODIGO":
        // El aviso va con clave propia por workflow: un error en un workflow no silencia el de otro.
        aviso({ ...inc, avisoKey: `ERROR_CODIGO:${inc.workflow}` }, inc.motivo, "ERROR_CODIGO: avisar");
        reparar(inc, inc.workflow, `error de código en ${inc.workflow}: pedir un parche a reparar.yml`, "ERROR_CODIGO: REPARAR una vez por workflow y día, además de avisar");
        break;
      case "DESCONOCIDO":
      default:
        aviso(inc, inc.motivo || "fallo sin clasificar", "DESCONOCIDO: avisar con el final del log");
    }
  }
  return acciones;
}

// Una línea de log por incidente: «  · <etiqueta>: <acción> — <motivo> (regla: ...)», con el resultado si lo hay.
export function lineaVeredicto(v) {
  const base = `  · ${v.etiqueta}: ${v.accion} — ${v.motivo} (regla: ${v.regla})`;
  return v.resultado ? `${base} => ${v.resultado}` : base;
}

// ---------- Utilidades de ejecución ----------

export function redactar(texto, secretos = []) {
  let t = String(texto ?? "");
  for (const s of secretos) if (s && s.length >= 8) t = t.split(s).join("[oculto]");
  return t
    .replace(/re_[A-Za-z0-9_]{12,}/g, "[oculto]")
    .replace(/nvapi-[A-Za-z0-9_-]{10,}/g, "[oculto]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[oculto]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[oculto]")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{25,}/g, "[oculto]")
    .replace(/sk_(live|test)_[A-Za-z0-9]{10,}/g, "[oculto]")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "[oculto]")
    .replace(/((?:KEY|TOKEN|SECRET|PASSWORD)\s*[=:]\s*)\S+/gi, "$1[oculto]");
}

export function secretosDe(cfg) {
  return [cfg.apiKey, cfg.resendKey, cfg.ghToken, cfg.telegramToken];
}

// Argumentos de gh para VOLVER_ATRAS: el workflow rollback.yml, con el código como motivo.
export function argumentosVolverAtras(codigo) {
  return ["workflow", "run", "rollback.yml", "-R", REPO, "-f", `motivo=${codigo}`];
}

// Argumentos de gh para REPARAR: reparar.yml con el código, el workflow afectado y la ejecución fallida.
export function argumentosReparar({ codigo, workflow, runId }) {
  return ["workflow", "run", REPARAR_WF, "-R", REPO, "-f", `codigo=${codigo}`, "-f", `workflow=${workflow}`, "-f", `run_id=${runId}`];
}

// Texto del aviso (Telegram y correo): diagnóstico, acción, comprobación a mano y final del log,
// redactado y de 3500 caracteres como mucho.
export function textoAviso(a, secretos = [], ahora = new Date()) {
  const inc = a.incidente || {};
  const lineas = [
    `PerData vigía · ${a.codigo}`,
    `Diagnóstico: ${a.motivo}`,
    `Acción: ${a.accion || "ninguna, solo aviso"}`,
    `Qué hacer a mano: ${queHacer(a.codigo)}`,
    `Momento: ${new Date(ahora).toISOString()} (UTC)`,
    inc.workflow ? `Workflow: ${inc.workflow}` : null,
    inc.runId ? `Ejecución: ${inc.runId} (gh run view ${inc.runId} -R ${REPO})` : null,
    inc.paso ? `Paso fallido: ${inc.paso}` : null,
    "",
    "Final del log:",
    inc.logTail ? cola(inc.logTail, 40) : "(sin log disponible)",
  ].filter((l) => l !== null);
  return redactar(lineas.join("\n"), secretos).slice(0, TG_MAX);
}

// Racha de fallos seguidos, contando desde la corrida más nueva. Un éxito la corta; lo cancelado o saltado no cuenta.
export function rachaDeFallos(corridas) {
  let n = 0;
  for (const r of corridas) {
    if (r.status !== "completed") continue;
    if (r.conclusion === "success") break;
    if (esFallo(r)) n += 1;
  }
  return n;
}

// Códigos del catálogo de una ejecución fallida. Si falló el smoke o un proceso del watchdog, puede tener varios.
export function codigosDeFallo(workflowPath, paso, logTail) {
  if (nombreArchivo(workflowPath) === "watchdog.yml" && /Comprobar la web/i.test(String(paso))) {
    return [...new Set(clasificarWatchdog(logTail).map((d) => d.codigo))];
  }
  return [clasificarFallo({ workflowPath, stepName: paso, logTail })];
}

// Resumen de los runs de main: totales de 24 h, fallos agrupados por workflow con su código y racha seguida.
// `runs` lleva `codigos` en los fallos del día (ver clasificarFallosDia); sin él, el fallo sale «sin clasificar».
export function resumenActividad(runs, ahora = new Date()) {
  const instante = new Date(ahora);
  const todos = [...runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const recientes = todos.filter((r) => instante - Date.parse(r.createdAt) <= 24 * H);
  const fallidos = recientes.filter(esFallo);
  const nombreDe = (r) => r.workflowName || r.wf || "?";
  const grupos = new Map();
  for (const r of fallidos) {
    const nombre = nombreDe(r);
    const g = grupos.get(nombre) || { nombre, total: 0, codigos: new Map() };
    g.total += 1;
    for (const c of (r.codigos?.length ? r.codigos : ["sin clasificar"])) g.codigos.set(c, (g.codigos.get(c) || 0) + 1);
    grupos.set(nombre, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.total - a.total).map((g) => {
    const codigos = [...g.codigos].map(([c, n]) => (n === g.total ? c : `${c} ${n}`)).join(", ");
    const seguidos = rachaDeFallos(todos.filter((r) => nombreDe(r) === g.nombre));
    return { nombre: g.nombre, total: g.total, texto: `${g.nombre} ×${g.total} (${codigos})`, seguidos };
  });
  return { runs: recientes.length, fallos: fallidos.length, grupos: lista };
}

// Clasifica con gh los fallos de las últimas 24 h (como mucho FALLOS_RESUMEN_MAX; el resto, «sin clasificar»).
export async function clasificarFallosDia(runs, ahora = new Date()) {
  const instante = new Date(ahora);
  const fallidos = runs.filter((r) => esFallo(r) && instante - Date.parse(r.createdAt) <= 24 * H);
  for (const [i, r] of fallidos.entries()) {
    if (i >= FALLOS_RESUMEN_MAX) { r.codigos = ["sin clasificar"]; continue; }
    try {
      const d = await detalleFallo(r);
      r.codigos = codigosDeFallo(r.wf, d.paso, d.logTail);
    } catch {
      r.codigos = ["sin clasificar"];
    }
  }
  return runs;
}

// Estado de los datos de /api/status: bloques viejos (con su edad o su error), hechos y cotizaciones, y el respaldo.
export function resumenWeb(status, hechos, ahora = new Date()) {
  if (!status) return null;
  const viejos = [];
  for (const nombre of Object.keys(DUENO)) {
    const b = status[nombre];
    if (!b) continue;
    if (b.error) viejos.push(`${nombre} (error ${b.error})`);
    else if (typeof b.ageHours === "number" && typeof b.staleAfterHours === "number" && b.ageHours > b.staleAfterHours) {
      viejos.push(`${nombre} ${b.ageHours} h (límite ${b.staleAfterHours} h)`);
    }
  }
  const t = Date.parse(hechos?.actualizado);
  const hechosH = Number.isNaN(t) ? null : Math.round(((new Date(ahora) - t) / H) * 10) / 10;
  const smvH = typeof status.smv?.ageHours === "number" ? status.smv.ageHours : null;
  return { viejos, hechosH, smvH, backupFecha: status.backup?.fecha ?? null };
}

// Pagos: «en pausa» si paymentsEnabled es false y el checkout responde 503 payments_paused.
export function estadoPagos(billing, checkout) {
  if (!billing) return { estado: "sin dato", detalle: "billing no responde" };
  if (billing.paymentsEnabled !== false) return { estado: "abiertos", detalle: "paymentsEnabled distinto de false" };
  if (!checkout) return { estado: "sin dato", detalle: "config en pausa, checkout no responde" };
  if (checkout.status === 503 && checkout.code === "payments_paused") return { estado: "en pausa", detalle: "" };
  return { estado: "discrepancia", detalle: `paymentsEnabled false, pero checkout responde ${checkout.status}${checkout.code ? ` ${checkout.code}` : ""}` };
}

// Resumen diario de las 08:00 (Telegram; también en modo seco, marcado «[modo prueba]», y con --resumen-ahora).
// Cinco puntos, cada uno «OK» o con su problema, más una línea final de casa, acciones y silencio.
// La cabecera cuenta los asuntos: cada punto con problema y cada aviso acumulado en silencio.
export function textoResumen({
  fecha, modo = "real", actividad = null, boletin = "sin dato", web = null, pagos = null,
  paginas = null, casa = null, historial = [], silencio = [], ahora = new Date(),
}) {
  const seco = modo === "seco";
  const hoyUtc = new Date(ahora).toISOString().slice(0, 10);
  const asuntos = [];
  const lineas = [];
  const fmt = (h) => (typeof h === "number" ? `${h} h` : "sin dato");

  // 1. Boletín (lunes a sábado: commit «data(boletin): enviado <fecha UTC de hoy>» en main)
  if (boletin === "domingo") lineas.push("1. Boletín: domingo, no toca.");
  else if (boletin === "enviado") lineas.push(`1. Boletín: OK, commit «data(boletin): enviado ${hoyUtc}» en main.`);
  else if (boletin === "no salió") {
    asuntos.push("boletín");
    lineas.push(`1. Boletín: NO SALIÓ, no hay commit «data(boletin): enviado ${hoyUtc}» en main.`);
  } else {
    asuntos.push("boletín");
    lineas.push("1. Boletín: no comprobado (GitHub no responde).");
  }

  // 2. GitHub Actions 24 h
  if (!actividad) {
    asuntos.push("GitHub Actions");
    lineas.push("2. GitHub Actions 24 h: no comprobado (gh no responde).");
  } else {
    const atencion = actividad.grupos.filter((g) => g.seguidos >= 2);
    asuntos.push(...atencion.map((g) => `${g.nombre} con fallos seguidos`));
    const grupos = actividad.grupos.slice(0, 10).map((g) => (g.seguidos >= 2 ? `${g.texto} [atención: ${g.seguidos} fallos seguidos]` : g.texto));
    let texto = `2. GitHub Actions 24 h: ${actividad.runs} runs, ${actividad.fallos} ${actividad.fallos === 1 ? "fallo" : "fallos"}`;
    if (!grupos.length) texto += ". OK.";
    else {
      texto += `: ${grupos.join("; ")}.`;
      if (!atencion.length) texto += " Ningún workflow con dos fallos seguidos.";
    }
    lineas.push(texto);
  }

  // 3. /api/status: bloques viejos con su edad, hechos y cotizaciones, y el respaldo de hoy
  if (!web) {
    asuntos.push("/api/status");
    lineas.push("3. /api/status: no responde.");
  } else {
    const problemas = [];
    asuntos.push(...web.viejos);
    if (web.viejos.length) problemas.push(`bloques viejos: ${web.viejos.join("; ")}`);
    if (typeof web.hechosH === "number" && web.hechosH > HECHOS_UMBRAL_H) {
      asuntos.push("hechos de la SMV");
      problemas.push(`hechos de la SMV con más de ${HECHOS_UMBRAL_H} h`);
    }
    const backupHoy = web.backupFecha === hoyUtc;
    if (!backupHoy) {
      asuntos.push("respaldo de hoy");
      problemas.push(`respaldo de hoy NO hecho (último ${web.backupFecha ?? "desconocido"})`);
    }
    const datos = `hechos SMV de hace ${fmt(web.hechosH)}, cotizaciones de hace ${fmt(web.smvH)}, respaldo de hoy: ${backupHoy ? "sí" : "no"}`;
    lineas.push(problemas.length ? `3. /api/status: ${problemas.join(". ")}. ${datos}.` : `3. /api/status OK: ${datos}.`);
  }

  // 4. Pagos
  if (!pagos || pagos.estado === "sin dato") {
    asuntos.push("pagos");
    lineas.push(`4. Pagos: no comprobados (${pagos?.detalle ?? "sin datos"}).`);
  } else if (pagos.estado === "en pausa") {
    lineas.push("4. Pagos: en pausa (paymentsEnabled false; checkout responde 503 payments_paused). OK.");
  } else if (pagos.estado === "abiertos") {
    asuntos.push("pagos abiertos");
    lineas.push(`4. Pagos ABIERTOS: ${pagos.detalle}. Avisar, no tocar.`);
  } else {
    asuntos.push("pagos");
    lineas.push(`4. Pagos: ${pagos.detalle}.`);
  }

  // 5. Páginas: códigos HTTP
  if (!paginas) {
    asuntos.push("páginas");
    lineas.push("5. Páginas: no comprobadas.");
  } else {
    const codigo = (p) => `${p.ruta} ${p.codigo ?? "sin respuesta"}`;
    const caidas = paginas.filter((p) => p.codigo !== 200);
    if (caidas.length) {
      asuntos.push("páginas caídas");
      lineas.push(`5. Páginas CAÍDAS: ${caidas.map(codigo).join(", ")}. Todas: ${paginas.map(codigo).join(", ")}.`);
    } else lineas.push(`5. Páginas OK: ${paginas.map(codigo).join(", ")}.`);
  }

  // Final: servidor de casa, acciones del vigía (o las que habría hecho) y avisos acumulados en silencio
  const casaTexto = casa ? `${casa.arriba ? "en línea" : "CAÍDO"} (${casa.detalle})` : "sin dato";
  if (casa && !casa.arriba) asuntos.push("servidor de casa");
  const desde = new Date(ahora).getTime() - 24 * H;
  const cuentas = {};
  for (const h of historial) if (Date.parse(h.fecha) >= desde) cuentas[h.tipo] = (cuentas[h.tipo] || 0) + 1;
  const acciones = Object.entries(cuentas).map(([tipo, n]) => `${tipo} ${n}`).join(", ") || "ninguna";
  asuntos.push(...silencio.map((s) => `aviso en silencio ${s.codigo}`));
  const enSilencio = silencio.slice(0, SILENCIO_RESUMEN_MAX).map((s) => `${s.codigo} (${s.motivo})`);
  if (silencio.length > SILENCIO_RESUMEN_MAX) enSilencio.push(`y ${silencio.length - SILENCIO_RESUMEN_MAX} más`);
  lineas.push(
    `Servidor de casa: ${casaTexto}. ${seco ? "Acciones que HABRÍA hecho (memoria simulada, 24 h)" : "Acciones del vigía (24 h)"}: ${acciones}. `
    + `Avisos acumulados en silencio: ${enSilencio.join("; ") || "ninguno"}.`,
  );

  const veredicto = asuntos.length ? `${asuntos.length} ${asuntos.length === 1 ? "asunto" : "asuntos"}` : "OK";
  return [`${seco ? "[modo prueba] " : ""}PerData · ${fecha}: ${veredicto}`, ...lineas].join("\n").slice(0, TG_MAX);
}

// True si toca enviar el resumen: a partir de las 08:00 de Lima y una sola vez por día (con o sin modo seco).
export function debeEnviarResumen(memoria, ahora) {
  const { fecha, hora } = limaParts(new Date(ahora));
  return hora >= RESUMEN_HORA && memoria?.resumenDia !== fecha;
}

function construirCorreo(a) {
  const inc = a.incidente || {};
  const cuerpo = [
    `Código: ${a.codigo}`,
    `Momento: ${new Date().toISOString()} (UTC)`,
    `Diagnóstico: ${a.motivo}`,
    `Acción: ${a.accion || "ninguna, solo aviso"}`,
    `Qué hacer a mano: ${queHacer(a.codigo)}`,
    inc.workflow ? `Workflow: ${inc.workflow}` : null,
    inc.runId ? `Ejecución: ${inc.runId} (gh run view ${inc.runId} -R ${REPO})` : null,
    inc.paso ? `Paso fallido: ${inc.paso}` : null,
    "",
    "Final del log:",
    inc.logTail ? cola(inc.logTail, 40) : "(sin log disponible)",
  ].filter((l) => l !== null);
  return cuerpo.join("\n");
}

// Envía un mensaje de texto plano por Telegram. Lanza error si Telegram no responde 200.
export async function enviarTelegram(texto, { token, chatId, fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: String(texto).slice(0, TG_MAX), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Telegram respondió ${r.status}`);
  return "enviado";
}

async function enviarCorreo(a, cfg, secretos) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.emailFrom, to: [cfg.email], subject: `[PerData vigía] ${a.codigo}`,
      text: redactar(construirCorreo(a), secretos),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}`);
  return "enviado";
}

// Canales configurados, por orden de preferencia: Telegram y después correo.
export function canalesAviso(cfg) {
  const canales = [];
  if (cfg.telegramToken && cfg.telegramChat) canales.push("telegram");
  if (cfg.email && cfg.resendKey && cfg.emailFrom) canales.push("correo");
  return canales;
}

// Envía el aviso por el primer canal que funcione. Si no hay ninguno, canal null (queda en el log).
// `telegramFallo` indica que Telegram estaba configurado y falló (cuenta para VIGIA_ROTO).
export async function avisar(a, cfg, { secretos = [], ahora = new Date(), telegram = enviarTelegram, correo = enviarCorreo } = {}) {
  const fallos = [];
  let telegramFallo = false;
  for (const canal of canalesAviso(cfg)) {
    try {
      if (canal === "telegram") await telegram(textoAviso(a, secretos, ahora), { token: cfg.telegramToken, chatId: cfg.telegramChat });
      else await correo(a, cfg, secretos);
      return { canal, detalle: "", telegramFallo };
    } catch (e) {
      if (canal === "telegram") telegramFallo = true;
      fallos.push(`${canal}: ${redactar(e.message, secretos).split("\n")[0].slice(0, 120)}`);
    }
  }
  return { canal: null, detalle: fallos.join("; ") || "sin Telegram ni correo configurados", telegramFallo };
}

// Ejecuta las acciones. En modo seco no llama a gh ni envía avisos: actualiza la memoria simulada como si
// lo hiciera, con sus mismos límites. Devuelve las notas para la cabecera del log y deja el resultado de
// cada acción en su veredicto.
export async function ejecutar(acciones, memoria, { seco, ahora = new Date(), gh, avisar: enviarAviso, secretos = [] }) {
  const notas = [];
  const m = memoria;
  m.silencio = m.silencio || [];
  m.avisos = m.avisos || {};
  m.despliegues = m.despliegues || [];
  m.contadores.reparar = m.contadores.reparar || {};
  const iso = new Date(ahora).toISOString();
  const hoy = limaParts(new Date(ahora)).fecha;
  const pendientes = [...acciones];
  const errorTexto = (e) => redactar(e?.stderr || e?.message || e, secretos).split("\n")[0].slice(0, 200);
  const marca = (a, texto) => { if (a.veredicto) a.veredicto.resultado = texto; };
  let volverHecho = false;
  while (pendientes.length) {
    const a = pendientes.shift();
    if (a.tipo === "RELANZAR") {
      try {
        if (!seco) await gh(["workflow", "run", a.workflow, "-R", REPO]);
        m.contadores.relanzar[a.workflow] = (m.contadores.relanzar[a.workflow] || 0) + 1;
        for (const c of a.claves) if (m.incidentes[c]) m.incidentes[c].relanzadoEn = iso;
        anotar(m, iso, "RELANZAR", a.workflow);
        notas.push(`RELANZAR ${a.workflow}${seco ? " (simulado)" : ""}`);
        marca(a, seco ? "simulado (seco)" : "hecho");
      } catch (e) {
        notas.push(`RELANZAR ${a.workflow} fallido: ${errorTexto(e)}`);
        marca(a, `fallido: ${errorTexto(e)}`);
      }
    } else if (a.tipo === "DESPLEGAR") {
      try {
        if (!seco) await gh(["workflow", "run", "deploy.yml", "-R", REPO]);
        m.contadores.desplegar += 1;
        for (const c of a.claves) if (m.incidentes[c]) { m.incidentes[c].desplegadoEn = iso; m.incidentes[c].trasDespliegue = 0; }
        m.despliegues = [...m.despliegues, { fecha: iso, motivo: a.motivo }].slice(-20);
        anotar(m, iso, "DESPLEGAR", "deploy.yml");
        notas.push(`DESPLEGAR deploy.yml${seco ? " (simulado)" : ""}`);
        marca(a, seco ? "simulado (seco)" : "hecho");
      } catch (e) {
        notas.push(`DESPLEGAR fallido: ${errorTexto(e)}`);
        marca(a, `fallido: ${errorTexto(e)}`);
      }
    } else if (a.tipo === "VOLVER_ATRAS") {
      try {
        if (!seco) await gh(argumentosVolverAtras(a.codigo));
        m.contadores.volverAtras += 1;
        volverHecho = true;
        anotar(m, iso, "VOLVER_ATRAS", a.codigo);
        notas.push(seco ? "VOLVER_ATRAS (simulado)" : "VOLVER_ATRAS disparado (rollback.yml)");
        marca(a, seco ? "simulado (seco)" : "hecho");
      } catch (e) {
        notas.push(`VOLVER_ATRAS fallido: ${errorTexto(e)}`);
        marca(a, `fallido: ${errorTexto(e)}`);
        pendientes.unshift({ tipo: "AVISAR", codigo: a.codigo, motivo: `el rollback ha fallado (${errorTexto(e)})`, accion: "VOLVER_ATRAS fallido", incidente: a.incidente, claves: a.claves, critico: true });
      }
    } else if (a.tipo === "REPARAR") {
      // Solo cuenta si gh ha disparado reparar.yml: un fallo (red, rate limit...) no gasta el límite del día.
      try {
        if (!seco) await gh(argumentosReparar(a));
        m.contadores.reparar[a.workflow] = (m.contadores.reparar[a.workflow] || 0) + 1;
        anotar(m, iso, "REPARAR", `${a.codigo} en ${a.workflow} (run ${a.runId})`);
        notas.push(`REPARAR ${a.workflow} (${a.codigo})${seco ? " (simulado)" : ""}`);
        marca(a, seco ? "simulado (seco)" : "hecho");
      } catch (e) {
        notas.push(`REPARAR ${a.workflow} fallido: ${errorTexto(e)}`);
        marca(a, `fallido: ${errorTexto(e)}`);
      }
    } else if (a.tipo === "AVISAR") {
      const clave = a.avisoKey ?? a.codigo;
      const previo = m.avisos[clave];
      if (previo && new Date(ahora) - Date.parse(previo) < 6 * H) {
        notas.push(`AVISAR ${a.codigo} suprimido (ya se avisó en 6 h)`);
        marca(a, "suprimido: ya avisado en las últimas 6 h");
        continue;
      }
      const critico = a.critico || CRITICOS_SILENCIO.has(a.codigo) || (a.vuelta && volverHecho);
      if (!critico && enHorasSilencio(ahora)) {
        m.silencio = [...m.silencio.filter((s) => s.clave !== clave), { clave, codigo: a.codigo, motivo: a.motivo, fecha: iso }].slice(-50);
        notas.push(`AVISAR ${a.codigo} en silencio (va en el resumen de las 08:00)`);
        marca(a, "en silencio: va en el resumen de las 08:00");
        if (a.codigo === "VIGIA_ROTO") m.rotoDia = hoy;
        continue;
      }
      if (seco) {
        m.avisos[clave] = iso;
        notas.push(`AVISAR ${a.codigo} simulado (seco, no se envía)`);
        marca(a, "simulado (seco): no enviado");
      } else {
        const r = await enviarAviso(a);
        if (r.canal) {
          m.avisos[clave] = iso;
          notas.push(`aviso ${a.codigo} por ${r.canal}`);
          marca(a, `enviado por ${r.canal}`);
        } else {
          notas.push(`AVISAR ${a.codigo} sin canal (${r.detalle}); queda en el log: ${a.motivo}`);
          marca(a, "sin canal: queda en el log");
        }
        if (r.telegramFallo) m.telegramFallos = (m.telegramFallos || 0) + 1;
        else if (r.canal === "telegram") m.telegramFallos = 0;
      }
      if (a.codigo === "VIGIA_ROTO") m.rotoDia = hoy;
    }
  }
  return notas;
}

// ---------- Entorno, bloqueo y memoria en disco ----------

// Lee líneas CLAVE=valor. Ignora comentarios (#), líneas vacías y claves mal escritas. Las comillas
// simples o dobles que envuelven el valor se quitan; en valores sin comillas, un espacio y # final es comentario.
export function parsearEnv(texto) {
  const out = {};
  for (const linea of String(texto ?? "").split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const comillas = m[2].match(/^(["'])(.*)\1$/);
    out[m[1]] = comillas ? comillas[2] : m[2].replace(/\s+#.*$/, "").trim();
  }
  return out;
}

// Archivo de entorno: VIGIA_ENV_FILE; si no, ~/perdata-vigia/env; si no existe, ~/.config/perdata-vigia/env.
export function rutaEnv(env = process.env, home = os.homedir(), existe = fs.existsSync) {
  if (env.VIGIA_ENV_FILE) return env.VIGIA_ENV_FILE;
  const principal = path.join(home, "perdata-vigia", "env");
  if (existe(principal)) return principal;
  return path.join(home, ".config", "perdata-vigia", "env");
}

function leerTexto(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

// Las variables del entorno del proceso mandan sobre el archivo de entorno.
export function cargarConfig({ env = process.env, home = os.homedir(), leer = leerTexto } = {}) {
  const fichero = parsearEnv(leer(rutaEnv(env, home)));
  const pick = (k) => env[k] || fichero[k] || undefined;
  return {
    apiKey: pick("VIGIA_NVIDIA_API_KEY"), modelo: pick("VIGIA_MODELO"), ghToken: pick("GH_TOKEN"),
    telegramToken: pick("TELEGRAM_BOT_TOKEN"), telegramChat: pick("TELEGRAM_CHAT_ID"),
    actuar: pick("VIGIA_ACTUAR"), email: pick("VIGIA_EMAIL"),
    resendKey: pick("RESEND_API_KEY"), emailFrom: pick("EMAIL_FROM"),
  };
}

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

// Devuelve { ok, huerfano }: ok false si otra pasada vive; huerfano describe el lock viejo que se ha liberado.
// Un lock de más de LOCK_HUERFANO_MIN minutos o cuyo pid ya no existe es huérfano.
export function adquirirLock(file = LOCK_FILE, ahora = Date.now()) {
  let huerfano = null;
  for (let intento = 0; intento < 2; intento++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: "wx" });
      return { ok: true, huerfano };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let edadMin;
      let pid;
      try {
        edadMin = (ahora - fs.statSync(file).mtimeMs) / MIN;
        pid = Number(fs.readFileSync(file, "utf8"));
      } catch { continue; } // el lock ha desaparecido entre medias: reintentar
      if (edadMin <= LOCK_HUERFANO_MIN && pid && vivo(pid)) return { ok: false, huerfano: null };
      huerfano = edadMin > LOCK_HUERFANO_MIN
        ? `lock de hace ${Math.round(edadMin)} min (pid ${pid || "desconocido"})`
        : `lock de un pid que ya no existe (${pid || "vacío"})`;
      fs.rmSync(file, { force: true });
    }
  }
  return { ok: false, huerfano };
}

export function liberarLock(file = LOCK_FILE) {
  try {
    if (fs.readFileSync(file, "utf8") === String(process.pid)) fs.rmSync(file, { force: true });
  } catch { /* ya no existe */ }
}

// Memoria del vigía. Si el archivo existe pero no se puede leer o parsear, se empieza vacía y se
// anota la señal «memoria-corrupta» (VIGIA_ROTO). Si no existe, es la primera pasada: sin señal.
export function cargarMemoria(file = MEMORIA_FILE, registro = null) {
  let texto;
  try {
    texto = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") registro?.add("memoria-corrupta");
    return memoriaVacia();
  }
  try {
    return { ...memoriaVacia(), ...JSON.parse(texto) };
  } catch {
    registro?.add("memoria-corrupta");
    return memoriaVacia();
  }
}

export function guardarMemoria(file, m) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, file);
}

// ---------- Recogida de estado ----------

// Un 401/403 de gh (sin ser límite de peticiones) o «Bad credentials» marca el token como roto.
export function esErrorAuth(texto) {
  const t = String(texto ?? "");
  return /\bHTTP 40[13]\b|Bad credentials/i.test(t) && !/rate limit/i.test(t);
}

async function gh(args) {
  const env = ghConfig.token ? { ...process.env, GH_TOKEN: ghConfig.token } : process.env;
  try {
    const { stdout } = await execFileAsync("gh", args, { env, maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
    return stdout;
  } catch (e) {
    if (esErrorAuth(`${e.stderr ?? ""}\n${e.message ?? ""}`)) senales.add("gh-401");
    throw e;
  }
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "PerDataVigia/1.0" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Código HTTP de una página, o null si no hay respuesta.
async function codigoPagina(ruta) {
  try {
    const r = await fetch(BASE + ruta, { headers: { "User-Agent": "PerDataVigia/1.0" }, signal: AbortSignal.timeout(20000) });
    return r.status;
  } catch {
    return null;
  }
}

// Códigos de las páginas vigiladas. Las que no den 200 se repiten una vez al cabo de 1 min.
async function comprobarPaginas() {
  return Promise.all(PAGINAS_VIGIADAS.map(async (ruta) => {
    let codigo = await codigoPagina(ruta);
    if (codigo !== 200) {
      await new Promise((r) => setTimeout(r, MIN));
      codigo = await codigoPagina(ruta);
    }
    return { ruta, codigo };
  }));
}

// POST de comprobación de pagos: con los pagos en pausa responde 503 con code payments_paused.
// Con body «{}» no crea nada: sin sesión, el servidor responde antes de llamar a Stripe.
async function comprobarCheckout() {
  const r = await fetch(`${BASE}/api/billing?action=checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "PerDataVigia/1.0" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(20000),
  });
  const texto = await r.text();
  let code = null;
  try { code = JSON.parse(texto).code ?? null; } catch { /* respuesta no JSON */ }
  return { status: r.status, code };
}

// Analiza los runs de main de las últimas 24 h: en curso, último run por workflow y racha del watchdog.
export function analizarRuns(runs, ahora = new Date()) {
  const instante = new Date(ahora);
  const recientes = runs.filter((r) => instante - Date.parse(r.createdAt) <= 24 * H)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const enCurso = new Set(recientes.filter((r) => r.status !== "completed").map((r) => r.wf));
  const ultimos = new Map();
  for (const r of recientes) if (!ultimos.has(r.wf)) ultimos.set(r.wf, r);
  const wd = runs.filter((r) => r.wf === "watchdog.yml" && r.status === "completed").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { recientes, enCurso, ultimos, watchdogCompletados: wd, watchdogFallidos: wd.filter(esFallo) };
}

// Si la ejecución fallida del watchdog falló en el smoke (y no solo en un proceso) y si el log habla de red.
async function infoSmoke(run, detalleDe = detalleFallo) {
  try {
    const d = await detalleDe(run);
    return { smoke: clasificarWatchdog(d.logTail)[0].codigo === "WATCHDOG_SMOKE", red: RED_RE.test(d.logTail) };
  } catch {
    return { smoke: false, red: false }; // ante la duda, no contar: no se despliega ni se vuelve atrás por esto
  }
}

// Fallos seguidos del smoke desde la ejecución más nueva (máximo `max`). `todosRed`: todos son de red.
export async function diagnosticoSmoke(corridas, detalleDe = detalleFallo, max = 3) {
  let n = 0;
  let red = 0;
  for (const r of corridas.slice(0, max)) {
    if (!esFallo(r)) break;
    const info = await infoSmoke(r, detalleDe);
    if (!info.smoke) break;
    n += 1;
    if (info.red) red += 1;
  }
  return { fallosSeguidos: n, todosRed: n > 0 && red === n };
}

// Fallos del smoke entre las ejecuciones fallidas dadas (máximo `max` comprobaciones).
async function contarSmoke(fallidas, max = 6) {
  let n = 0;
  for (const r of fallidas.slice(0, max)) if ((await infoSmoke(r)).smoke) n += 1;
  return n;
}

async function detalleFallo(run) {
  const { jobs = [] } = JSON.parse(await gh(["run", "view", String(run.databaseId), "-R", REPO, "--json", "jobs"]));
  const job = jobs.find((j) => j.conclusion === "failure") || jobs.find((j) => j.conclusion && j.conclusion !== "success") || jobs[0];
  const paso = job?.steps?.find((s) => s.conclusion === "failure")?.name ?? "";
  const log = job?.databaseId ? await gh(["api", `repos/${REPO}/actions/jobs/${job.databaseId}/logs`]) : "";
  return { paso, jobName: job?.name ?? "", logTail: cola(log, 80) };
}

// Servidor de casa: Tailscale (par «wagus-server», campo Online) y, de respaldo, TCP al puerto 22.
// Devuelve true/false si el par existe, o null si no hay tailscale o no aparece el par (se salta).
export function estadoTailscale(texto) {
  let datos;
  try { datos = JSON.parse(String(texto ?? "")); } catch { return null; }
  const par = Object.values(datos?.Peer ?? {}).find((p) => String(p?.HostName ?? "").includes(CASA.nombre));
  return par ? par.Online === true : null;
}

async function consultarTailscale() {
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], { timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
    return estadoTailscale(stdout);
  } catch {
    return null; // sin tailscale o sin respuesta: se salta el chequeo sin error
  }
}

export function tcpAbierto(host, puerto, ms = 5000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: puerto });
    const fin = (ok) => { clearTimeout(timer); socket.destroy(); resolve(ok); };
    const timer = setTimeout(() => fin(false), ms);
    socket.once("connect", () => fin(true));
    socket.once("error", () => fin(false));
  });
}

export async function comprobarCasa({ tailscale = consultarTailscale, tcp = tcpAbierto } = {}) {
  const online = await tailscale();
  const abierto = online === true ? null : await tcp(CASA.ip, CASA.puerto, CASA.ms);
  const arriba = online === true || abierto === true;
  const ts = online === null ? "sin dato" : online ? "en línea" : "sin conexión";
  const tcpTexto = abierto === null ? "no comprobado" : abierto ? "responde" : "sin respuesta";
  return { arriba, detalle: `Tailscale: ${ts}; TCP ${CASA.puerto}: ${tcpTexto}` };
}

// Incidente SERVIDOR_CASA a partir de la comprobación: aviso si cae (dos pasadas seguidas lo decide decidir())
// y aviso de recuperación si la pasada anterior ya había avisado de la caída.
export function incidenteCasa(casa, memoriaPrevia = {}) {
  if (!casa.arriba) {
    return { codigo: "SERVIDOR_CASA", clave: "SERVIDOR_CASA", workflow: null, motivo: `el servidor de casa no responde: los planes B de la SMV no correrán (${casa.detalle})`, logTail: "" };
  }
  if ((memoriaPrevia.incidentes?.SERVIDOR_CASA?.pasadas || 0) >= 2) {
    return {
      codigo: "SERVIDOR_CASA", clave: "SERVIDOR_CASA:recuperado", avisoKey: "SERVIDOR_CASA:recuperado", recuperado: true,
      workflow: null, motivo: "el servidor de casa responde de nuevo: los planes B de la SMV vuelven a correr", logTail: "",
    };
  }
  return null;
}

// Credenciales rotas o Telegram caído dos veces: un solo aviso al día (VIGIA_ROTO). Solo avisa.
export function detectarVigiaRoto({ senales: registro = new Set(), telegramFallos = 0 } = {}) {
  const motivos = [];
  if (registro.has("gh-401")) motivos.push("gh responde 401/403 o «Bad credentials»: el token de GitHub ha caducado o le faltan permisos; renovar GH_TOKEN en ~/perdata-vigia/env (fine-grained, solo Wagustin/macro-data-explorer)");
  if (registro.has("nvidia-401")) motivos.push("la API de NVIDIA responde 401: renovar VIGIA_NVIDIA_API_KEY en ~/perdata-vigia/env");
  if (registro.has("memoria-corrupta")) motivos.push("el archivo de memoria del vigía (~/.local/state/perdata-vigia*.json) no se puede leer: esta pasada empieza vacía y lo sobrescribe; revisarlo antes de borrarlo");
  if (telegramFallos >= 2) motivos.push("Telegram falla dos envíos seguidos: revisar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en ~/perdata-vigia/env");
  if (!motivos.length) return [];
  return [{ codigo: "VIGIA_ROTO", clave: "VIGIA_ROTO", workflow: null, motivo: motivos.join(". "), logTail: "" }];
}

// ---------- Pasada ----------

// soloResumen: solo recoge datos y devuelve el texto del resumen (--resumen-ahora). No actúa ni escribe memoria.
async function pasada(ahora, { seco, cfg, memoriaFile, soloResumen = false }) {
  const fallidas = [];
  const secretos = secretosDe(cfg);
  const intentar = async (nombre, fn) => {
    try { return await fn(); } catch (e) { fallidas.push(`${nombre} (${redactar(e.message, secretos).split("\n")[0].slice(0, 120)})`); return null; }
  };
  const memoriaPrevia = cargarMemoria(memoriaFile, senales);
  // El POST de pagos y el repaso de fallos solo se hacen en el resumen de las 08:00 (o con --resumen-ahora).
  const conTelegram = Boolean(cfg.telegramToken && cfg.telegramChat);
  const hacerResumen = soloResumen || (conTelegram && debeEnviarResumen(memoriaPrevia, ahora));

  const [runsRaw, workflows, status, billing, paginas, commits, hechos, casa, checkout] = await Promise.all([
    intentar("runs", async () => JSON.parse(await gh(["run", "list", "-R", REPO, "-L", "200", "--branch", "main", "--json", CAMPOS_RUNS]))),
    intentar("workflows", async () => JSON.parse(await gh(["workflow", "list", "-R", REPO, "-a", "--json", "id,name,path"]))),
    intentar("api/status", () => fetchJson(`${BASE}/api/status`)),
    intentar("api/billing", () => fetchJson(`${BASE}/api/billing?action=config`)),
    intentar("páginas", comprobarPaginas),
    intentar("commits", async () => JSON.parse(await gh(["api", `repos/${REPO}/commits?per_page=50`]))),
    intentar("hechos de la SMV", () => fetchJson(`${HECHOS_URL}?t=${Date.now()}`)),
    comprobarCasa(),
    hacerResumen ? intentar("checkout", comprobarCheckout) : null,
  ]);

  const rutaPorId = new Map((workflows || []).map((w) => [w.id, nombreArchivo(w.path)]));
  const runs = (runsRaw || []).map((r) => ({ ...r, wf: rutaPorId.get(r.workflowDatabaseId) || r.workflowName }));
  const analisis = analizarRuns(runs, ahora);
  const incidentes = [];

  const construirResumen = async (memoria) => {
    await clasificarFallosDia(runs, ahora);
    return textoResumen({
      fecha: limaParts(ahora).fecha, modo: seco ? "seco" : "real", ahora,
      actividad: runsRaw ? resumenActividad(runs, ahora) : null,
      boletin: estadoBoletin(commits, ahora),
      web: resumenWeb(status, hechos, ahora),
      pagos: estadoPagos(billing, checkout),
      paginas, casa,
      historial: memoria.historial || [], silencio: memoria.silencio || [],
    });
  };
  if (soloResumen) return construirResumen(memoriaPrevia);

  for (const [wf, run] of analisis.ultimos) {
    if (!esFallo(run)) continue;
    let detalle = { paso: "", jobName: "", logTail: "" };
    try { detalle = await detalleFallo(run); } catch (e) { fallidas.push(`log de ${wf}`); }
    const motivoBase = `${wf} falló en «${detalle.paso || "paso desconocido"}» (ejecución ${run.databaseId})`;

    if (wf === "watchdog.yml" && /Comprobar la web/i.test(detalle.paso)) {
      // El watchdog se clasifica por el smoke o por el proceso que falla, nunca por el paso entero.
      for (const d of clasificarWatchdog(detalle.logTail)) {
        const ageHoras = d.ageHoras ?? (d.codigo === "SMV_BLOQUEO" && /Cotizaciones/.test(d.proceso) ? status?.smv?.ageHours : undefined);
        incidentes.push({
          ...d, ageHoras, workflow: d.workflow, runId: run.databaseId, desde: run.createdAt,
          paso: detalle.paso, logTail: detalle.logTail, via: "reglas",
          motivo: d.motivo ? `${d.motivo} (watchdog, ejecución ${run.databaseId})` : `${motivoBase}; smoke`,
        });
      }
      continue;
    }

    let codigo = clasificarFallo({ workflowPath: wf, stepName: detalle.paso, logTail: detalle.logTail });
    let via = "reglas";
    if (codigo === "DESCONOCIDO" && cfg.apiKey) {
      const r = await clasificarConNemotron({ workflow: wf, paso: detalle.paso, logTail: detalle.logTail }, { apiKey: cfg.apiKey, modelo: cfg.modelo, senales });
      if (r) { codigo = r.codigo; via = `Nemotron ${r.modelo} (${r.ms} ms, confianza ${r.confianza ?? 0})`; }
    }
    const clave = `${codigo}:${wf}:${run.databaseId}`;
    incidentes.push({
      codigo, workflow: wf, runId: run.databaseId, desde: run.createdAt, paso: detalle.paso, logTail: detalle.logTail,
      clave, via, motivo: `${motivoBase}; clasificado por ${via}`,
      ...(codigo === "SMV_BLOQUEO" ? { ageHoras: status?.smv?.ageHours } : {}),
    });
  }

  const smoke = incidentes.find((i) => i.codigo === "WATCHDOG_SMOKE");
  if (smoke) {
    const diag = await diagnosticoSmoke(analisis.watchdogCompletados);
    smoke.fallosSeguidos = diag.fallosSeguidos;
    smoke.todosRed = diag.todosRed;
    const desde = memoriaPrevia.incidentes?.WATCHDOG_SMOKE?.desplegadoEn;
    smoke.fallosTrasDespliegue = desde
      ? await contarSmoke(analisis.watchdogFallidos.filter((r) => Date.parse(r.createdAt) > Date.parse(desde)))
      : 0;
  }

  if (status) {
    for (const d of evaluarStatus(status, ahora)) incidentes.push({ ...d, desde: undefined, logTail: "" });
  }
  const caidas = paginas ? paginas.filter((p) => p.codigo !== 200).map((p) => p.ruta) : null;
  if (caidas?.length) {
    incidentes.push({ codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA", workflow: "deploy.yml", paginas: caidas, motivo: `páginas sin 200: ${caidas.join(", ")}`, logTail: "" });
  }
  if (billing && "paymentsEnabled" in billing && billing.paymentsEnabled !== false) {
    incidentes.push({ codigo: "PAGOS_ABIERTOS", clave: "PAGOS_ABIERTOS", workflow: null, motivo: "paymentsEnabled distinto de false", logTail: "" });
  }
  if (commits && boletinPendiente(commits, ahora)) {
    const hoy = ahora.toISOString().slice(0, 10);
    incidentes.push({ codigo: "BOLETIN_NO_SALIO", clave: `BOLETIN_NO_SALIO:${hoy}`, workflow: "boletin.yml", motivo: `no hay commit «data(boletin): enviado ${hoy}» en main`, logTail: "" });
  }
  const latido = evaluarLatido({ runs: runsRaw && workflows ? runs : null, statusFallo: status === null, ahora });
  if (latido) incidentes.push(latido);
  const directo = incidenteHechos(hechos, ahora, incidentes);
  if (directo) incidentes.push(directo);
  const incCasa = incidenteCasa(casa, memoriaPrevia);
  if (incCasa) incidentes.push(incCasa);
  incidentes.push(...detectarVigiaRoto({ senales, telegramFallos: memoriaPrevia.telegramFallos || 0 }));

  const omitidos = [
    ...(runsRaw ? [] : PREFIJOS_RUNS),
    ...(status ? [] : ["DATO_VIEJO"]),
    ...(commits ? [] : ["BOLETIN_NO_SALIO"]),
    ...(billing ? [] : ["PAGOS_ABIERTOS"]),
  ];
  const memoria = registrarPasada(memoriaPrevia, incidentes, { ahora, omitidos });
  const veredictos = [];
  const acciones = decidir(incidentes, memoria, ahora, analisis.enCurso, veredictos);
  const iso = ahora.toISOString();

  const notas = await ejecutar(acciones, memoria, {
    seco, ahora, secretos, gh,
    avisar: (a) => (seco ? null : avisar(a, cfg, { secretos, ahora })),
  });

  if (hacerResumen && conTelegram) {
    const hoy = limaParts(ahora).fecha;
    const texto = await construirResumen(memoria);
    try {
      await enviarTelegram(texto, { token: cfg.telegramToken, chatId: cfg.telegramChat });
      memoria.resumenDia = hoy;
      memoria.silencio = [];
      memoria.telegramFallos = 0;
      notas.push(`resumen diario enviado por Telegram${seco ? " [modo prueba]" : ""}`);
    } catch (e) {
      memoria.telegramFallos = (memoria.telegramFallos || 0) + 1;
      notas.push(`resumen diario fallido: ${redactar(e.message, secretos).split("\n")[0].slice(0, 120)}`);
    }
  }
  guardarMemoria(memoriaFile, memoria);

  const cabecera = [
    `${iso} ${seco ? "seco" : "ACTUAR"}`,
    `incidentes: ${incidentes.map(etiquetaDe).join(", ") || "ninguno"}`,
    `acciones: ${notas.join("; ") || "ninguna"}`,
    fallidas.length ? `fuentes fallidas: ${fallidas.join(", ")}` : null,
  ].filter(Boolean).join(" | ");
  return [cabecera, ...veredictos.map(lineaVeredicto)].join("\n");
}

// Registra un error en el log (sin secretos) y en la consola. No lanza: es el último recurso.
function registrarError(origen, e) {
  let secretos = [];
  try { secretos = secretosDe(cargarConfig()); } catch { /* sin configuración: se registra sin redactar claves */ }
  const linea = `${new Date().toISOString()} ERROR ${origen}: ${redactar(e?.message ?? e, secretos).split("\n")[0].slice(0, 300)}`;
  try { fs.appendFileSync(LOG_FILE, `${linea}\n`); } catch { /* sin disco: queda en la consola */ }
  console.error(linea);
}

export async function main(argv = process.argv.slice(2)) {
  // Un fallo fuera de las promesas controladas no debe dejar el lock tomado ni la pasada a medias sin rastro.
  const salirPorError = (origen) => (e) => { registrarError(origen, e); liberarLock(); process.exit(1); };
  process.on("uncaughtException", salirPorError("uncaughtException"));
  process.on("unhandledRejection", salirPorError("unhandledRejection"));
  const ahora = new Date();
  try {
    fs.mkdirSync(ESTADO, { recursive: true });
    const cfg = cargarConfig();
    ghConfig.token = cfg.ghToken ?? null;
    const seco = argv.includes("--seco") || cfg.actuar !== "1";
    const memoriaFile = seco ? MEMORIA_SECO_FILE : MEMORIA_FILE;
    if (argv.includes("--resumen-ahora")) {
      // Solo lectura: imprime el resumen que se enviaría ahora, sin actuar, sin enviar y sin tocar la memoria.
      console.log(await pasada(ahora, { seco, cfg, memoriaFile, soloResumen: true }));
      return 0;
    }
    const lock = adquirirLock();
    if (!lock.ok) {
      fs.appendFileSync(LOG_FILE, `${ahora.toISOString()} omitida: otra pasada en marcha\n`);
      return 0;
    }
    if (lock.huerfano) fs.appendFileSync(LOG_FILE, `${ahora.toISOString()} lock huérfano liberado: ${lock.huerfano}\n`);
    try {
      const texto = await pasada(ahora, { seco, cfg, memoriaFile });
      fs.appendFileSync(LOG_FILE, `${texto}\n`);
      console.log(texto);
      return 0;
    } finally {
      liberarLock();
    }
  } catch (e) {
    registrarError("pasada", e);
    return 1;
  }
}

const esPrincipal = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (esPrincipal) {
  main().then((codigo) => { process.exitCode = codigo; });
}
