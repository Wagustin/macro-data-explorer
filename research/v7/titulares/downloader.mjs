#!/usr/bin/env node
/**
 * V7 titulares: descarga estable de titulares GDELT DOC 2.0 para Perú (sourcecountry:PE).
 * - Un solo proceso, una petición a la vez, pausa configurable (GDELT_PAUSA_S, default 6s) ±20% jitter.
 * - Backoff exponencial en 429/5xx/timeout/JSON inválido: 30s, 60s, 120s, 300s (máx 6 reintentos).
 * - En 429 duplica la pausa base (hasta 30s) y la reduce -10% cada 20 éxitos hasta volver al valor base.
 * - Respeta Retry-After. 20 fallos seguidos → duerme 30 min y continúa (nunca termina por error de red).
 * - Ventanas adaptativas: empieza 1 día; si llega a 250, divide a la mitad (hasta 1 hora); si pocos, ensancha.
 * - Reanudable e idempotente: manifiesto JSONL (~/v7/data/titulares/manifiesto.jsonl), escritura atómica, dedupe por URL.
 * - Estado en ~/v7/data/titulares/estado.json (ventanas hechas/total, peticiones/hora, errores, ETA).
 * - Ejecución desatendida via run.sh con flock, nice -n 19, ionice -c3, y systemd --user timer cada 15 min.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = process.env.TITULARES_DATA_DIR || path.join("/home/wagustin/v7/data/titulares");
const LOG_DIR = path.join("/home/wagustin/v7/logs");
const MANIFIESTO_PATH = path.join(DATA_DIR, "manifiesto.jsonl");
const ESTADO_PATH = path.join(DATA_DIR, "estado.json");
const LOCK_PATH = path.join(DATA_DIR, ".lock");

const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const UA = "PerDataBot/1.0 (+https://perdata.site)";
const MAXRECORDS = 250;
const START_DATE = new Date("2019-01-01T00:00:00Z");
const END_DATE = new Date();

// Configurable via env
const BASE_PAUSA_S = Math.max(4, Number(process.env.GDELT_PAUSA_S) || 6); // min 4s
const JITTER_PCT = 0.20;
const BACKOFF_STEPS = [30, 60, 120, 300]; // seconds
const MAX_RETRIES = 6;
const MAX_BASE_PAUSA_AFTER_429 = 30; // seconds
const REDUCE_PAUSA_AFTER_SUCCESSES = 20; // reduce after this many successes
const REDUCE_PAUSA_PCT = 0.10; // -10%
const CONSECUTIVE_FAILURES_LIMIT = 20;
const CONSECUTIVE_FAILURES_SLEEP_MS = 30 * 60 * 1000; // 30 min
const MIN_WINDOW_HOURS = 1;
const INITIAL_WINDOW_DAYS = 1;

// Spanish language codes from GDELT
const SPANISH_LANGS = new Set(["spanish", "español", "espanol", "es"]);

// Economy keywords regex (same as Python version)
const ECONOMIA_RE = /(\bd[oó]lar(?:es)?\b|\btipo\s+de\s+cambio\b|\bbcrp\b|\bbanco\s+central\b|\binflaci[oó]n\b|mining\b|miner[ií]a\b|\bcobre\b|\bcopper\b|\boro\b|\bgold\b|\bplata\b|\bsilver\b|\bzinc\b|\bpetr[oó]leo\b|\bwti\b|\bbrent\b|\bgas\s+natural\b|\bglp\b|\bconflicto\s+minero\b|\breinfo\b|\bsnmpe\b|bolsa\s+de\s+valores\b|\bbvl\b|\bacciones\b|\bbonos\b|\bdividendos\b|\bsmv\b|\breserva\s+federal\b|\bfed\b|\btasa\s+de\s+inter[eé]s\b|\barancel\w*\b|\belecciones\b|\bsegunda\s+vuelta\b|\bcongreso\b|\bvacancia\b|\bproyecto\s+de\s+ley\b|\bministro\s+de\s+econom[ií]a\b|\bmef\b|\bpol[ií]tica\s+econ[oó]mica\b|\bpbi\b|\bipc\b|\bsoles\b|\bsunat\b|\binei\b|\bpresupuesto\b|\bdeuda\s+p[uú]blica\b|\bd[eé]ficit\s+fiscal\b|\bexportaci\w+\b|\bimportaci\w+\b|\bbalanza\s+comercial\b|\binversi\w+\b|\brecesi\w+\b|\bwall\s+street\b|\bnasdaq\b|\bfmi\b|\bbanco\s+mundial\b|\brating\b|\briesgo\s+pa[ií]s\b|\bembig\b|\bcr[eé]dito\b|\bbanca\b|\bafp\b|\bpensi\w+\b|\bremesas?\b|\bpobreza\b|\bbono\w*\b|\bproinversi\w+\b|\bfinanciero\b|\bafectac\w+\b|\bvivienda\b|\bconstrucci\w+\b|\bagro\w+\b|\bpesca\b|\bturismo\b|\bsalario\b|\bempleo\b|\bdesempleo\b|\bprecios\s+al\s+consumidor\b|\bcanasta\s+b[aá]sica\b|\bdevaluaci\w*\b|\bapreciaci\w*\b|\breserva\s+internacional(?:es)?\b|\bposici[oó]n\s+de\s+cambio\b|\binterbancario\b|\bcambio\s+interbancario\b|\bempresa\b|\bantamina\b|\bcerro\s+verde\b|\blas\s+bambas\b|\bsouthern\b|\bbuenaventura\b|\bquellaveco\b|\btoromocho\b|\bvolc[aá]n\b|\bchinalco\b|\bminsur\b|\bhudbay\b|\bmarcona\b|\bpetroper[uú]\b|\bcamisea\b|\btalara\b|\bgasolina\b|\bdi[eé]sel\b|\boleoducto\b|\belectr\w+\b|\benerg[ií]a\b|\be[oó]lica\b|\bsolar\b|\bminas\b|\bmineral(?:es)?\b|\bútil\b|\butilidad(?:es)?\b|\bganancia\b|\bingreso\b|\bcancela\w+\b|\bparalizaci\w+\b|\bpierde\b|\bp[eé]rdidas\b|\bdeuda\b)/i;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, "titulares.log"), line + "\n");
  } catch { /* ignore */ }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function gdeltUrl(query, start, end, maxrecords = MAXRECORDS) {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(maxrecords),
    startdatetime: start.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z",
    enddatetime: end.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z",
  });
  return `${API}?${params}`;
}

function seendateToFecha(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  try {
    return `${m[1]}-${m[2]}-${m[3]}`;
  } catch {
    return null;
  }
}

function articleToRecord(art) {
  if (!art) return null;
  const title = (art.title || "").trim();
  const url = (art.url || "").trim();
  if (!title || !url) return null;
  const fecha = seendateToFecha(art.seendate);
  if (!fecha) return null;
  const lang = (art.language || "").trim();
  const langOk = SPANISH_LANGS.has(lang.toLowerCase()) || (!lang && ECONOMIA_RE.test(title));
  if (!langOk) return null;
  if (!ECONOMIA_RE.test(title)) return null;
  return {
    fecha_disponible: fecha,
    titulo: title.replace(/\s+/g, " "),
    dominio: (art.domain || "").trim(),
    url,
    idioma: lang || "Spanish",
  };
}

function windowKey(start, end) {
  return `${start.toISOString().slice(0,10)}/${end.toISOString().slice(0,10)}`;
}

function loadManifiesto() {
  const done = new Set();
  const failed = new Map(); // key -> attempts
  if (!fs.existsSync(MANIFIESTO_PATH)) return { done, failed };
  const content = fs.readFileSync(MANIFIESTO_PATH, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.status === "done") done.add(rec.key);
      else if (rec.status === "failed") failed.set(rec.key, rec.attempts || 1);
    } catch { /* ignore */ }
  }
  return { done, failed };
}

function appendManifiesto(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = MANIFIESTO_PATH + ".tmp";
  fs.appendFileSync(tmp, JSON.stringify(entry) + "\n");
  fs.renameSync(tmp, MANIFIESTO_PATH);
}

function loadSeenUrls() {
  const seen = new Set();
  if (!fs.existsSync(DATA_DIR)) return seen;
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".jsonl") || file.startsWith("_") || file === "manifiesto.jsonl") continue;
    try {
      const content = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          if (rec.url) seen.add(normalizeUrl(rec.url));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  return seen;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.searchParams.sort();
    return u.toString();
  } catch {
    return url;
  }
}

function appendRecords(records, seen) {
  if (!records.length) return 0;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const byMonth = new Map();
  for (const rec of records) {
    const month = rec.fecha_disponible.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(rec);
  }
  let written = 0;
  for (const [month, recs] of byMonth) {
    recs.sort((a, b) => a.fecha_disponible.localeCompare(b.fecha_disponible) || a.url.localeCompare(b.url));
    const filePath = path.join(DATA_DIR, `${month}.jsonl`);
    const tmp = filePath + ".tmp";
    let existingContent = "";
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, "utf8");
    }
    const out = [existingContent];
    for (const rec of recs) {
      const normUrl = normalizeUrl(rec.url);
      if (seen.has(normUrl)) continue;
      seen.add(normUrl);
      out.push(JSON.stringify(rec));
      written++;
    }
    fs.writeFileSync(tmp, out.join("\n") + "\n");
    fs.renameSync(tmp, filePath);
  }
  return written;
}

function loadEstado() {
  if (!fs.existsSync(ESTADO_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ESTADO_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveEstado(estado) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = ESTADO_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(estado, null, 1) + "\n");
  fs.renameSync(tmp, ESTADO_PATH);
}

function updateEstado(updates) {
  const estado = loadEstado() || {
    inicio: new Date().toISOString(),
    ventanas_hechas: 0,
    ventanas_total: 0,
    peticiones_hora: [],
    errores_recientes: [],
    eta_horas: null,
    pausa_actual_s: BASE_PAUSA_S,
    racha_exitos: 0,
    racha_fallos: 0,
  };
  Object.assign(estado, updates);
  saveEstado(estado);
}

function calcJitteredPause(basePause) {
  const jitter = basePause * JITTER_PCT * (Math.random() * 2 - 1);
  return Math.max(100, Math.round((basePause + jitter) * 1000)); // min 100ms
}

async function fetchWindow(query, start, end, pausaActual, maxRetries = MAX_RETRIES) {
  const url = gdeltUrl(query, start, end);
  let wait = BACKOFF_STEPS[0] * 1000;
  let lastErr = null;
  let consecutive429 = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status === 503) {
        const retryAfter = res.headers.get("Retry-After");
        let extra = 0;
        if (retryAfter && /^\d+$/.test(retryAfter)) extra = parseInt(retryAfter, 10) * 1000;
        const sleepMs = Math.max(wait, extra);
        log(`429/503 ventana ${start.toISOString().slice(0,10)}->${end.toISOString().slice(0,10)} intento ${attempt}/${maxRetries}, espera ${(sleepMs/1000).toFixed(0)}s`);
        await sleep(sleepMs);
        wait = Math.min(wait * 2, BACKOFF_STEPS[BACKOFF_STEPS.length - 1] * 1000);
        consecutive429++;
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const text = await res.text();
      if (!text || text.trim() === "{}") {
        return { articles: [], attempts: attempt, full: false };
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`JSON inválido: ${e.message}`);
      }

      const articles = data.articles || [];
      return { articles, attempts: attempt, full: articles.length >= MAXRECORDS };

    } catch (e) {
      lastErr = e;
      const isTimeout = e.name === "AbortError" || e.name === "TimeoutError";
      const isNetwork = e instanceof TypeError && e.message.includes("fetch");
      if ((isTimeout || isNetwork || e.message.includes("JSON")) && attempt < maxRetries) {
        log(`Error ventana ${start.toISOString().slice(0,10)} intento ${attempt}/${maxRetries}: ${e.message}`);
        await sleep(wait);
        wait = Math.min(wait * 2, BACKOFF_STEPS[BACKOFF_STEPS.length - 1] * 1000);
        continue;
      }
      throw e;
    }
  }

  // All retries exhausted
  log(`ERROR ventana ${start.toISOString().slice(0,10)}->${end.toISOString().slice(0,10)} tras ${maxRetries} intentos: ${lastErr?.message}`);
  return { articles: null, attempts: maxRetries, full: false };
}

function splitWindow(start, end) {
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= MIN_WINDOW_HOURS * 3600 * 1000) {
    return [{ start, end }]; // cannot split further
  }
  const mid = new Date(start.getTime() + durationMs / 2);
  return [
    { start, end: mid },
    { start: new Date(mid.getTime() + 1), end },
  ];
}

function shouldWidenWindow(articleCount) {
  // Widen if we got less than 50 articles (arbitrary threshold)
  return articleCount < 50;
}

function generateWindows(startDate, endDate, windowDays) {
  const windows = [];
  let curEnd = new Date(endDate);
  curEnd.setHours(23, 59, 59, 999);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  while (curEnd >= start) {
    const curStart = new Date(Math.max(start.getTime(), curEnd.getTime() - (windowDays - 1) * 24 * 3600 * 1000));
    curStart.setHours(0, 0, 0, 0);
    windows.push({ start: curStart, end: curEnd });
    curEnd = new Date(curStart.getTime() - 1);
  }
  return windows;
}

async function acquireLock() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    // Use O_EXCL for atomic lock creation
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code === "EEXIST") {
      // Check if lock is stale (older than 1 hour)
      try {
        const stats = fs.statSync(LOCK_PATH);
        if (Date.now() - stats.mtimeMs > 3600 * 1000) {
          fs.unlinkSync(LOCK_PATH);
          const fd = fs.openSync(LOCK_PATH, "wx");
          fs.closeSync(fd);
          return true;
        }
      } catch { /* ignore */ }
    }
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* ignore */ }
}

async function main() {
  const args = process.argv.slice(2);
  const probe = args.includes("--probe");
  const full = args.includes("--full") || !probe; // default to full run
  const windowDays = parseInt(args.find(a => a.startsWith("--window-days="))?.split("=")[1] || String(INITIAL_WINDOW_DAYS), 10);

  // Acquire lock (single instance)
  const hasLock = await acquireLock();
  if (!hasLock) {
    log("Otra instancia en ejecución (lock activo). Saliendo.");
    process.exit(0);
  }

  // Setup cleanup
  const cleanup = () => { releaseLock(); process.exit(0); };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", releaseLock);

  log(`INICIO ${probe ? "probe" : "full"} ventana_dias=${windowDays} pausa_base=${BASE_PAUSA_S}s`);

  const { done, failed } = loadManifiesto();
  const seen = loadSeenUrls();
  const windows = generateWindows(START_DATE, END_DATE, windowDays);
  const pendingWindows = windows.filter(w => !done.has(windowKey(w.start, w.end)));

  updateEstado({
    ventanas_total: windows.length,
    ventanas_hechas: done.size,
    pausa_actual_s: BASE_PAUSA_S,
  });

  let totalRequests = 0;
  let totalRaw = 0;
  let totalKept = 0;
  let totalSplits = 0;
  let totalErrors = 0;
  let consecutiveFailures = 0;
  let currentPause = BASE_PAUSA_S;
  let successStreak = 0;

  const requestTimes = [];

  // Process windows newest-first (already sorted that way by generateWindows)
  for (const window of pendingWindows) {
    const key = windowKey(window.start, window.end);
    if (done.has(key)) continue;

    let stack = [window];
    let windowAttempts = failed.get(key) || 0;

    while (stack.length > 0) {
      const { start, end } = stack.pop();
      const subKey = windowKey(start, end);
      if (done.has(subKey)) continue;

      // Rate limiting
      const pauseMs = calcJitteredPause(currentPause);
      await sleep(pauseMs);
      requestTimes.push(Date.now());

      // Keep only last hour of requests for rate calculation
      const oneHourAgo = Date.now() - 3600 * 1000;
      while (requestTimes.length && requestTimes[0] < oneHourAgo) requestTimes.shift();

      const result = await fetchWindow("sourcecountry:PE", start, end, currentPause);

      totalRequests++;
      windowAttempts++;

      if (result.articles === null) {
        // Failed after all retries
        totalErrors++;
        consecutiveFailures++;
        successStreak = 0;
        log(`FALLO ventana ${subKey} tras ${result.attempts} intentos`);

        appendManifiesto({
          key: subKey,
          start: start.toISOString(),
          end: end.toISOString(),
          status: "failed",
          attempts: windowAttempts,
          titulares: 0,
          timestamp: new Date().toISOString(),
        });

        if (consecutiveFailures >= CONSECUTIVE_FAILURES_LIMIT) {
          log(`${CONSECUTIVE_FAILURES_LIMIT} fallos seguidos. Durmiendo ${CONSECUTIVE_FAILURES_SLEEP_MS / 60000} min...`);
          await sleep(CONSECUTIVE_FAILURES_SLEEP_MS);
          consecutiveFailures = 0;
        }
        continue;
      }

      // Success
      consecutiveFailures = 0;
      successStreak++;

      // Reduce pause after 429-induced increase
      if (successStreak >= REDUCE_PAUSA_AFTER_SUCCESSES && currentPause > BASE_PAUSA_S) {
        currentPause = Math.max(BASE_PAUSA_S, Math.round(currentPause * (1 - REDUCE_PAUSA_PCT)));
        updateEstado({ pausa_actual_s: currentPause });
        log(`Reduciendo pausa base a ${currentPause}s tras ${successStreak} éxitos`);
        successStreak = 0;
      }

      const articles = result.articles;
      totalRaw += articles.length;

      if (result.full) {
        // Window full - split and retry
        const parts = splitWindow(start, end);
        if (parts.length === 1 && parts[0].start.getTime() === start.getTime() && parts[0].end.getTime() === end.getTime()) {
          // Cannot split further (at minimum window size)
          log(`MAXFILL ventana mínima ${subKey} (${articles.length} artículos); se guarda lo obtenido`);
        } else {
          totalSplits++;
          log(`MAXFILL ${subKey} = ${articles.length}; se divide en ${parts.length} subventanas`);
          // Push in reverse order to process newest first
          for (const p of parts.reverse()) stack.push(p);
          continue;
        }
      }

      // Process articles
      const records = [];
      for (const art of articles) {
        const rec = articleToRecord(art);
        if (rec) records.push(rec);
      }

      const written = appendRecords(records, seen);
      totalKept += written;

      // Mark as done
      appendManifiesto({
        key: subKey,
        start: start.toISOString(),
        end: end.toISOString(),
        status: "done",
        attempts: windowAttempts,
        titulares: written,
        timestamp: new Date().toISOString(),
      });
      done.add(subKey);
      windowAttempts = 0;

      // Update estado
      const peticionesHora = requestTimes.length;
      const ventanasHechas = done.size;
      const ventanasRestantes = windows.length - done.size;
      const etaHoras = peticionesHora > 0 ? (ventanasRestantes * (currentPause / 3600)) : null;

      updateEstado({
        ventanas_hechas: ventanasHechas,
        peticiones_hora: peticionesHora,
        eta_horas: etaHoras ? Math.round(etaHoras * 10) / 10 : null,
        pausa_actual_s: currentPause,
        ultimo_progreso: new Date().toISOString(),
      });

      log(`OK ${subKey}: ${articles.length} raw, ${written} kept, pausa=${currentPause}s, peticiones/hora=${peticionesHora}, ETA=${etaHoras?.toFixed(1) ?? "?"}h`);
    }
  }

  log(`FIN: requests=${totalRequests} raw=${totalRaw} kept=${totalKept} splits=${totalSplits} errors=${totalErrors}`);
  updateEstado({ fin: new Date().toISOString() });
  releaseLock();
}

main().catch(err => {
  log(`ERROR FATAL: ${err.message}`);
  releaseLock();
  process.exit(1);
});