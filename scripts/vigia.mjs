#!/usr/bin/env node
// El vigía de PerData: una pasada por cron (cada 30 min) que mira el estado del sitio y de los
// procesos diarios, clasifica los incidentes con el catálogo (handoff/vigia-catalogo.md) y aplica
// SOLO las acciones de ese catálogo. Corre en una máquina aparte, sin copia del repo y sin
// credenciales de Cloudflare: el único retroceso posible es disparar rollback.yml en GitHub Actions.
// Nunca edita archivos del repo, ni hace commits, ni toca variables, DNS o cuentas. Nemotron solo
// devuelve un código para los fallos DESCONOCIDO.
// Uso: node scripts/vigia.mjs [--seco]   (ver docs/VIGIA.md)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const REPO = "Wagustin/macro-data-explorer";
const BASE = "https://perdata.site";
const ESTADO = path.join(os.homedir(), ".local", "state");
const MEMORIA_FILE = path.join(ESTADO, "perdata-vigia.json");
const LOG_FILE = path.join(ESTADO, "perdata-vigia.log");
const LOCK_FILE = path.join(ESTADO, "perdata-vigia.lock");
const NIM = "https://integrate.api.nvidia.com/v1";

const MIN = 60e3;
const H = 36e5;
const TG_MAX = 3500;
const LATIDO_H = 4;
const RESUMEN_HORA = 8;
const SMV = new Set(["smv.yml", "smv-precios.yml"]);
const RED_RE = /ECONNRESET|ETIMEDOUT|socket hang up|\b50[234]\b|rate limit|fetch failed/i;
const DUENO = {
  forecasts: "timesfm.yml", news: "news.yml", smv: "smv-precios.yml", bcrp: "official-data.yml",
  eia: "official-data.yml", d1Sync: "d1-backfill.yml",
};
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
const SMOKE_RE = /FALLA\s+Pruebas completas \(smoke\)|Error fatal en smoke test/;
const HACE_RE = /hace (\d+(?:[.,]\d+)?) (h|días?)\b/i;

// Token de gh: se pasa solo en el entorno del proceso hijo, nunca en los argumentos.
const ghConfig = { token: null };

const nombreArchivo = (p = "") => path.posix.basename(String(p));
const esFallo = (run) => run?.status === "completed" && ["failure", "timed_out", "startup_failure"].includes(run.conclusion);
const cola = (texto, n) => String(texto ?? "").split(/\r?\n/).slice(-n).join("\n");

export function limaParts(instante) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(instante));
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { fecha: `${v.year}-${v.month}-${v.day}`, hora: Number(v.hour), dia: dias[v.weekday] };
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
  return "DESCONOCIDO";
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

// True si es lunes a sábado entre las 09:00 y las 19:00 de Lima y no hay commit
// "data(boletin): enviado <fecha UTC de hoy>" (el workflow usa `date -u`).
export function boletinPendiente(commits, ahora = new Date()) {
  const instante = new Date(ahora);
  const { hora, dia } = limaParts(instante);
  if (dia === 0 || hora < 9 || hora >= 19) return false;
  const prefijo = `data(boletin): enviado ${instante.toISOString().slice(0, 10)}`;
  return !(commits || []).some((c) => String(c?.commit?.message ?? c?.message ?? "").startsWith(prefijo));
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

export async function clasificarConNemotron({ workflow, paso, logTail }, { apiKey, modelo, fetchImpl = fetch } = {}) {
  if (!apiKey) return null;
  const t0 = Date.now();
  const cabeceras = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  try {
    let id = modelo || null;
    if (!id) {
      const r = await fetchImpl(`${NIM}/models`, { headers: cabeceras, signal: AbortSignal.timeout(30000) });
      if (!r.ok) return null;
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
    if (!r.ok) return null;
    const data = await r.json();
    return { ...interpretarRespuesta(data.choices?.[0]?.message?.content), modelo: id, ms: Date.now() - t0 };
  } catch {
    return null;
  }
}

// ---------- Memoria y pasadas ----------

const memoriaVacia = () => ({
  dia: null, contadores: { relanzar: {}, desplegar: 0, volverAtras: 0 }, fallos: {},
  incidentes: {}, runsVistos: {}, avisos: {}, despliegues: [], historial: [], resumenDia: null,
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
  }
  for (const inc of incidentes) {
    if (inc.runId && !m.runsVistos[inc.runId]) {
      m.runsVistos[inc.runId] = iso;
      if (inc.codigo === "RED_PASAJERA") m.fallos[inc.workflow] = (m.fallos[inc.workflow] || 0) + 1;
    }
  }
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

// Devuelve solo acciones: RELANZAR, DESPLEGAR, VOLVER_ATRAS, AVISAR. «Esperar» no produce nada.
export function decidir(incidentes, memoria = {}, ahora = new Date(), enCurso = new Set()) {
  const instante = new Date(ahora);
  const mem = memoria || {};
  const hoy = limaParts(instante).fecha;
  const contadores = mem.dia === hoy && mem.contadores ? mem.contadores : memoriaVacia().contadores;
  const estados = mem.incidentes || {};
  const relanzosHoy = { ...(contadores.relanzar || {}) };
  let desplegosHoy = contadores.desplegar || 0;
  let volverHoy = contadores.volverAtras || 0;
  const acciones = [];
  const hayCI = incidentes.some((i) => i.codigo === "CI_ROJO");
  const datoViejoDe = (wf) => incidentes.some((i) => i.codigo === "DATO_VIEJO" && i.workflow === wf);

  const aviso = (inc, motivo, accion = null) => acciones.push({ tipo: "AVISAR", codigo: inc.codigo, motivo, accion, incidente: inc, claves: [inc.clave] });

  function relanzar(inc, wf, motivo) {
    if (enCurso.has(wf)) return;
    const existente = acciones.find((a) => a.tipo === "RELANZAR" && a.workflow === wf);
    if (existente) { existente.claves.push(inc.clave); return; }
    if ((relanzosHoy[wf] || 0) >= 2) return aviso(inc, `${motivo}; límite de 2 RELANZAR de ${wf} hoy alcanzado`);
    acciones.push({ tipo: "RELANZAR", workflow: wf, codigo: inc.codigo, motivo, claves: [inc.clave] });
    relanzosHoy[wf] = (relanzosHoy[wf] || 0) + 1;
  }

  function desplegar(inc, motivo) {
    if (hayCI || enCurso.has("deploy.yml")) return;
    const existente = acciones.find((a) => a.tipo === "DESPLEGAR");
    if (existente) { existente.claves.push(inc.clave); return; }
    if (desplegosHoy >= 1) return aviso(inc, `${motivo}; límite de 1 DESPLEGAR por día alcanzado`);
    acciones.push({ tipo: "DESPLEGAR", workflow: "deploy.yml", codigo: inc.codigo, motivo, claves: [inc.clave] });
    desplegosHoy += 1;
  }

  function volverAtras(inc, motivo) {
    if (volverHoy >= 1) return aviso(inc, `${motivo}; límite de 1 VOLVER_ATRAS por día alcanzado`);
    acciones.push({ tipo: "VOLVER_ATRAS", codigo: inc.codigo, motivo, incidente: inc, claves: [inc.clave] });
    volverHoy += 1;
    aviso(inc, `${motivo}; se intenta volver a la versión anterior del Worker`, "VOLVER_ATRAS (rollback.yml en GitHub Actions)");
  }

  for (const inc of incidentes) {
    const est = estados[inc.clave] || {};
    switch (inc.codigo) {
      case "SMV_BLOQUEO": {
        const umbral = inc.umbralHoras ?? 72;
        if (typeof inc.ageHoras === "number" && inc.ageHoras > umbral) {
          aviso(inc, `${inc.proceso ?? "la SMV"} lleva ${inc.ageHoras} h sin datos (más de ${umbral} h)`);
          break;
        }
        // Detectado por el watchdog: ESPERAR. El plan B del servidor descarga los datos.
        if (inc.origen === "watchdog") break;
        if (est.relanzadoEn || instante - Date.parse(inc.desde) < 2 * H) break;
        relanzar(inc, inc.workflow, inc.motivo);
        break;
      }
      case "CHOQUE_PUSH":
        if (datoViejoDe(inc.workflow) && !est.relanzadoEn) relanzar(inc, inc.workflow, inc.motivo);
        break;
      case "RED_PASAJERA": {
        const n = (mem.fallos || {})[inc.workflow] || 0;
        if (n >= 3) { aviso(inc, `tercer fallo de red del día en ${inc.workflow}`); break; }
        if (n === 2 || est.relanzadoEn || instante - Date.parse(inc.desde) < 30 * MIN) break;
        relanzar(inc, inc.workflow, inc.motivo);
        break;
      }
      case "WATCHDOG_SMOKE":
        if (!est.desplegadoEn) {
          if ((inc.fallosSeguidos || 0) >= 2) desplegar(inc, "el watchdog falla dos ejecuciones seguidas en la comprobación de la web");
        } else if ((inc.fallosTrasDespliegue || 0) >= 2) {
          volverAtras(inc, "el watchdog sigue fallando tras desplegar");
        }
        break;
      case "DATO_VIEJO":
        if (inc.bloque === "backup") { aviso(inc, `${inc.motivo}; relanzar backup.yml no lo arregla, la copia la hace el Worker`); break; }
        if (enCurso.has(inc.workflow)) break;
        if (est.relanzadoEn) {
          if (est.desde && instante - Date.parse(est.desde) >= 6 * H) aviso(inc, "sigue viejo 6 h después del RELANZAR");
          break;
        }
        relanzar(inc, inc.workflow, inc.motivo);
        break;
      case "BOLETIN_NO_SALIO":
        if (limaParts(instante).hora >= 11) aviso(inc, "a las 11:00 de Lima el boletín sigue sin salir");
        else if (!est.relanzadoEn) relanzar(inc, "boletin.yml", inc.motivo);
        break;
      case "PAGINA_CAIDA":
        if (est.desplegadoEn) {
          if ((est.trasDespliegue || 0) >= 2) volverAtras(inc, `páginas caídas tras desplegar: ${inc.paginas.join(", ")}`);
        } else if ((est.pasadas || 0) >= 2) {
          desplegar(inc, `páginas caídas dos pasadas seguidas: ${inc.paginas.join(", ")}`);
        }
        break;
      case "CI_ROJO":
        aviso(inc, "CI en main en rojo: lo arregla Claude, no se despliega");
        break;
      case "PAGOS_ABIERTOS":
        aviso(inc, "los pagos aparecen abiertos durante la pausa");
        break;
      case "SIN_LATIDO":
        aviso(inc, inc.motivo);
        break;
      default:
        aviso(inc, inc.motivo || "fallo sin clasificar");
    }
  }
  return acciones;
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

// Texto del aviso (Telegram y correo): diagnóstico, acción y final del log, redactado y de 3500 caracteres como mucho.
export function textoAviso(a, secretos = [], ahora = new Date()) {
  const inc = a.incidente || {};
  const lineas = [
    `PerData vigía · ${a.codigo}`,
    `Diagnóstico: ${a.motivo}`,
    `Acción: ${a.accion || "ninguna, solo aviso"}`,
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

// Resumen diario: una sola línea con lo del último día.
export function textoResumen({ fecha, runs, fallos, historial = [], ahora = new Date(), web, pagos }) {
  const desde = new Date(ahora).getTime() - 24 * H;
  const cuentas = {};
  for (const h of historial) if (Date.parse(h.fecha) >= desde) cuentas[h.tipo] = (cuentas[h.tipo] || 0) + 1;
  const acciones = Object.entries(cuentas).map(([tipo, n]) => `${tipo} ${n}`).join(", ") || "ninguna";
  return `PerData · ${fecha}: ${runs} runs en 24 h, ${fallos} fallos, acciones del vigía: ${acciones}, ${web}, pagos en pausa ${pagos}`;
}

export function estadoWeb(status, ahora = new Date()) {
  if (!status) return "/api/status no responde";
  const viejos = evaluarStatus(status, ahora).map((i) => i.bloque);
  return viejos.length ? `datos viejos en ${viejos.join(", ")}` : "/api/status OK";
}

// True si toca enviar el resumen: con VIGIA_ACTUAR=1 o VIGIA_RESUMEN=1, a partir de las 08:00 de Lima
// y una sola vez por día.
export function debeEnviarResumen(memoria, ahora, cfg) {
  if (!(cfg.actuar === "1" || cfg.resumen === "1")) return false;
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

// Envía el aviso por el primer canal que funcione. Si no hay ninguno, devuelve canal null (queda en el log).
export async function avisar(a, cfg, { secretos = [], ahora = new Date(), telegram = enviarTelegram, correo = enviarCorreo } = {}) {
  const fallos = [];
  for (const canal of canalesAviso(cfg)) {
    try {
      if (canal === "telegram") await telegram(textoAviso(a, secretos, ahora), { token: cfg.telegramToken, chatId: cfg.telegramChat });
      else await correo(a, cfg, secretos);
      return { canal, detalle: "" };
    } catch (e) {
      fallos.push(`${canal}: ${redactar(e.message, secretos).split("\n")[0].slice(0, 120)}`);
    }
  }
  return { canal: null, detalle: fallos.join("; ") || "sin Telegram ni correo configurados" };
}

// Ejecuta las acciones. En modo seco solo registra lo que haría. Devuelve las notas para el log.
// `avisar` recibe la acción y devuelve { canal, detalle } (ver avisar()).
export async function ejecutar(acciones, memoria, { seco, ahora = new Date(), gh, avisar: enviarAviso, secretos = [] }) {
  const notas = [];
  const m = memoria;
  const iso = new Date(ahora).toISOString();
  const pendientes = [...acciones];
  const errorTexto = (e) => redactar(e?.stderr || e?.message || e, secretos).split("\n")[0].slice(0, 200);
  while (pendientes.length) {
    const a = pendientes.shift();
    if (a.tipo === "RELANZAR") {
      if (seco) { notas.push(`[seco] RELANZAR ${a.workflow}`); continue; }
      try {
        await gh(["workflow", "run", a.workflow, "-R", REPO]);
        m.contadores.relanzar[a.workflow] = (m.contadores.relanzar[a.workflow] || 0) + 1;
        for (const c of a.claves) if (m.incidentes[c]) m.incidentes[c].relanzadoEn = iso;
        anotar(m, iso, "RELANZAR", a.workflow);
        notas.push(`RELANZAR ${a.workflow}`);
      } catch (e) {
        notas.push(`RELANZAR ${a.workflow} fallido: ${errorTexto(e)}`);
      }
    } else if (a.tipo === "DESPLEGAR") {
      if (seco) { notas.push("[seco] DESPLEGAR deploy.yml"); continue; }
      try {
        await gh(["workflow", "run", "deploy.yml", "-R", REPO]);
        m.contadores.desplegar += 1;
        for (const c of a.claves) if (m.incidentes[c]) { m.incidentes[c].desplegadoEn = iso; m.incidentes[c].trasDespliegue = 0; }
        m.despliegues = [...m.despliegues, { fecha: iso, motivo: a.motivo }].slice(-20);
        anotar(m, iso, "DESPLEGAR", "deploy.yml");
        notas.push("DESPLEGAR deploy.yml");
      } catch (e) {
        notas.push(`DESPLEGAR fallido: ${errorTexto(e)}`);
      }
    } else if (a.tipo === "VOLVER_ATRAS") {
      if (seco) { notas.push(`[seco] VOLVER_ATRAS (rollback.yml, motivo ${a.codigo})`); continue; }
      try {
        await gh(argumentosVolverAtras(a.codigo));
        m.contadores.volverAtras += 1;
        anotar(m, iso, "VOLVER_ATRAS", a.codigo);
        notas.push("VOLVER_ATRAS disparado (rollback.yml)");
      } catch (e) {
        notas.push(`VOLVER_ATRAS fallido: ${errorTexto(e)}`);
        pendientes.unshift({ tipo: "AVISAR", codigo: a.codigo, motivo: `el rollback ha fallado (${errorTexto(e)})`, accion: "VOLVER_ATRAS fallido", incidente: a.incidente, claves: a.claves });
      }
    } else if (a.tipo === "AVISAR") {
      const previo = m.avisos[a.codigo];
      if (previo && new Date(ahora) - Date.parse(previo) < 6 * H) { notas.push(`AVISAR ${a.codigo} suprimido (ya se avisó en 6 h)`); continue; }
      if (seco) { notas.push(`[seco] AVISAR ${a.codigo}: ${a.motivo}`); continue; }
      const r = await enviarAviso(a);
      if (r.canal) { m.avisos[a.codigo] = iso; notas.push(`aviso ${a.codigo} por ${r.canal}`); }
      else notas.push(`AVISAR ${a.codigo} sin canal (${r.detalle}); queda en el log: ${a.motivo}`);
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
    actuar: pick("VIGIA_ACTUAR"), resumen: pick("VIGIA_RESUMEN"), email: pick("VIGIA_EMAIL"),
    resendKey: pick("RESEND_API_KEY"), emailFrom: pick("EMAIL_FROM"),
  };
}

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

function adquirirLock() {
  for (let intento = 0; intento < 2; intento++) {
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
      if (pid && vivo(pid)) return false;
      fs.rmSync(LOCK_FILE, { force: true });
    }
  }
  return false;
}

function liberarLock() {
  try {
    if (fs.readFileSync(LOCK_FILE, "utf8") === String(process.pid)) fs.rmSync(LOCK_FILE, { force: true });
  } catch { /* ya no existe */ }
}

function cargarMemoria() {
  try {
    return { ...memoriaVacia(), ...JSON.parse(fs.readFileSync(MEMORIA_FILE, "utf8")) };
  } catch {
    return memoriaVacia();
  }
}

function guardarMemoria(m) {
  const tmp = `${MEMORIA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, MEMORIA_FILE);
}

// ---------- Recogida de estado ----------

async function gh(args) {
  const env = ghConfig.token ? { ...process.env, GH_TOKEN: ghConfig.token } : process.env;
  const { stdout } = await execFileAsync("gh", args, { env, maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  return stdout;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "PerDataVigia/1.0" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function paginaOk(ruta) {
  const intento = async () => {
    try {
      const r = await fetch(BASE + ruta, { headers: { "User-Agent": "PerDataVigia/1.0" }, signal: AbortSignal.timeout(20000) });
      return r.status === 200;
    } catch {
      return false;
    }
  };
  if (await intento()) return true;
  await new Promise((r) => setTimeout(r, MIN));
  return intento();
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

// True si la ejecución fallida del watchdog falló en el smoke (y no solo en un proceso).
async function esFalloDeSmoke(run) {
  try {
    const d = await detalleFallo(run);
    return clasificarWatchdog(d.logTail)[0].codigo === "WATCHDOG_SMOKE";
  } catch {
    return false; // ante la duda, no contar: no se despliega ni se vuelve atrás por esto
  }
}

// Fallos seguidos del smoke, contando desde la ejecución más nueva (máximo `max` comprobaciones).
async function smokeSeguidos(corridas, max = 2) {
  let n = 0;
  for (const r of corridas.slice(0, max)) {
    if (!esFallo(r) || !(await esFalloDeSmoke(r))) break;
    n += 1;
  }
  return n;
}

// Fallos del smoke entre las ejecuciones fallidas dadas (máximo `max` comprobaciones).
async function contarSmoke(fallidas, max = 6) {
  let n = 0;
  for (const r of fallidas.slice(0, max)) if (await esFalloDeSmoke(r)) n += 1;
  return n;
}

async function detalleFallo(run) {
  const { jobs = [] } = JSON.parse(await gh(["run", "view", String(run.databaseId), "-R", REPO, "--json", "jobs"]));
  const job = jobs.find((j) => j.conclusion === "failure") || jobs.find((j) => j.conclusion && j.conclusion !== "success") || jobs[0];
  const paso = job?.steps?.find((s) => s.conclusion === "failure")?.name ?? "";
  const log = job?.databaseId ? await gh(["api", `repos/${REPO}/actions/jobs/${job.databaseId}/logs`]) : "";
  return { paso, jobName: job?.name ?? "", logTail: cola(log, 80) };
}

// ---------- Pasada ----------

async function pasada(ahora, { seco, cfg }) {
  const fallidas = [];
  const secretos = secretosDe(cfg);
  const intentar = async (nombre, fn) => {
    try { return await fn(); } catch (e) { fallidas.push(`${nombre} (${redactar(e.message, secretos).split("\n")[0].slice(0, 120)})`); return null; }
  };

  const [runsRaw, workflows, status, billing, paginas, commits] = await Promise.all([
    intentar("runs", async () => JSON.parse(await gh(["run", "list", "-R", REPO, "-L", "200", "--branch", "main", "--json", CAMPOS_RUNS]))),
    intentar("workflows", async () => JSON.parse(await gh(["workflow", "list", "-R", REPO, "-a", "--json", "id,name,path"]))),
    intentar("api/status", () => fetchJson(`${BASE}/api/status`)),
    intentar("api/billing", () => fetchJson(`${BASE}/api/billing?action=config`)),
    intentar("páginas", async () => {
      const rutas = ["/", "/dolar", "/precios", "/boletin"];
      const oks = await Promise.all(rutas.map((r) => paginaOk(r)));
      return rutas.filter((_, i) => !oks[i]);
    }),
    intentar("commits", async () => JSON.parse(await gh(["api", `repos/${REPO}/commits?per_page=50`]))),
  ]);

  const rutaPorId = new Map((workflows || []).map((w) => [w.id, nombreArchivo(w.path)]));
  const runs = (runsRaw || []).map((r) => ({ ...r, wf: rutaPorId.get(r.workflowDatabaseId) || r.workflowName }));
  const analisis = analizarRuns(runs, ahora);
  const incidentes = [];

  const memoriaPrevia = cargarMemoria();
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
      const r = await clasificarConNemotron({ workflow: wf, paso: detalle.paso, logTail: detalle.logTail }, { apiKey: cfg.apiKey, modelo: cfg.modelo });
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
    smoke.fallosSeguidos = await smokeSeguidos(analisis.watchdogCompletados);
    const desde = memoriaPrevia.incidentes?.WATCHDOG_SMOKE?.desplegadoEn;
    smoke.fallosTrasDespliegue = desde
      ? await contarSmoke(analisis.watchdogFallidos.filter((r) => Date.parse(r.createdAt) > Date.parse(desde)))
      : 0;
  }

  if (status) {
    for (const d of evaluarStatus(status, ahora)) incidentes.push({ ...d, desde: undefined, logTail: "" });
  }
  if (paginas?.length) {
    incidentes.push({ codigo: "PAGINA_CAIDA", clave: "PAGINA_CAIDA", workflow: "deploy.yml", paginas, motivo: `páginas sin 200: ${paginas.join(", ")}`, logTail: "" });
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

  const omitidos = [
    ...(runsRaw ? [] : PREFIJOS_RUNS),
    ...(status ? [] : ["DATO_VIEJO"]),
    ...(commits ? [] : ["BOLETIN_NO_SALIO"]),
    ...(billing ? [] : ["PAGOS_ABIERTOS"]),
  ];
  const memoria = registrarPasada(memoriaPrevia, incidentes, { ahora, omitidos });
  const acciones = decidir(incidentes, memoria, ahora, analisis.enCurso);
  const iso = ahora.toISOString();

  const notas = await ejecutar(acciones, memoria, {
    seco, ahora, secretos, gh,
    avisar: (a) => avisar(a, cfg, { secretos, ahora }),
  });

  const hoy = limaParts(ahora).fecha;
  if (debeEnviarResumen(memoria, ahora, cfg)) {
    const texto = textoResumen({
      fecha: hoy,
      runs: runsRaw ? analisis.recientes.length : "?",
      fallos: runsRaw ? analisis.recientes.filter(esFallo).length : "?",
      historial: memoria.historial, ahora,
      web: estadoWeb(status, ahora),
      pagos: billing ? (billing.paymentsEnabled === false ? "sí" : "no") : "no comprobado",
    });
    if (seco) notas.push(`[seco] resumen diario: ${texto}`);
    else if (cfg.telegramToken && cfg.telegramChat) {
      try {
        await enviarTelegram(texto, { token: cfg.telegramToken, chatId: cfg.telegramChat });
        memoria.resumenDia = hoy;
        notas.push("resumen diario enviado por Telegram");
      } catch (e) {
        notas.push(`resumen diario fallido: ${redactar(e.message, secretos).split("\n")[0].slice(0, 120)}`);
      }
    } else notas.push("resumen diario sin Telegram configurado");
  }
  if (!seco) guardarMemoria(memoria);

  const etiqueta = (i) => `${i.codigo}${i.workflow ? `@${i.workflow}` : ""}`;
  const resumen = [
    `${iso} ${seco ? "seco" : "ACTUAR"}`,
    `incidentes: ${incidentes.map(etiqueta).join(", ") || "ninguno"}`,
    `acciones: ${notas.join("; ") || "ninguna"}`,
    fallidas.length ? `fuentes fallidas: ${fallidas.join(", ")}` : null,
  ].filter(Boolean).join(" | ");
  return resumen;
}

export async function main(argv = process.argv.slice(2)) {
  fs.mkdirSync(ESTADO, { recursive: true });
  const ahora = new Date();
  const cfg = cargarConfig();
  ghConfig.token = cfg.ghToken ?? null;
  const seco = argv.includes("--seco") || cfg.actuar !== "1";
  if (!adquirirLock()) {
    fs.appendFileSync(LOG_FILE, `${ahora.toISOString()} omitida: otra pasada en marcha\n`);
    return 0;
  }
  try {
    const linea = await pasada(ahora, { seco, cfg });
    fs.appendFileSync(LOG_FILE, `${linea}\n`);
    console.log(linea);
    return 0;
  } catch (e) {
    const linea = `${ahora.toISOString()} ERROR ${redactar(e.message, secretosDe(cfg)).split("\n")[0].slice(0, 300)}`;
    fs.appendFileSync(LOG_FILE, `${linea}\n`);
    console.error(linea);
    return 1;
  } finally {
    liberarLock();
  }
}

const esPrincipal = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (esPrincipal) {
  main().then((codigo) => { process.exitCode = codigo; });
}
