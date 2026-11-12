#!/usr/bin/env node
// Descarga titulares de la lista pública de artículos de GDELT (GAL, un archivo por minuto,
// https://data.gdeltproject.org/gdeltv3/gal/AAAAMMDDHHMMSS.gal.json.gz) y guarda solo lo que
// sirve a PerData: todo lo publicado por medios peruanos y, del resto del mundo, los titulares
// en español o inglés sobre mercados o sobre el Perú.
// Es la vía que GDELT pide usar para descargas grandes (archivos estáticos), no su buscador.
// Reanudable: un día solo se da por hecho cuando se bajaron sus 1440 minutos.
//   NOTICIAS_DIR=/ruta/fuera/del/repo/gal node research/torneo/descargar_gal.mjs --desde 2024-01-01 --hasta 2025-12-31 [--conc 4] [--corte HH:MM]
// --corte HH:MM (UTC) vale solo para el último día: baja sus minutos anteriores a esa hora y lo anota como día con corte.
// Un día con corte se continúa desde ese minuto la próxima vez. Nada de lo que baja entra al repositorio.
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DESDE = arg("desde"), HASTA = arg("hasta"), CORTE = arg("corte"), CONC = Math.min(6, Math.max(1, Number(arg("conc", 4))));
if (!/^\d{4}-\d\d-\d\d$/.test(DESDE || "") || !/^\d{4}-\d\d-\d\d$/.test(HASTA || "")) { console.error("Uso: --desde AAAA-MM-DD --hasta AAAA-MM-DD [--corte HH:MM]"); process.exit(2); }
if (CORTE !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(CORTE)) { console.error("Uso: --corte HH:MM (UTC)"); process.exit(2); }
const DIR = process.env.NOTICIAS_DIR;
if (!DIR) { console.error("Falta NOTICIAS_DIR: la carpeta de salida, fuera del repositorio"); process.exit(2); }
const REF = process.env.NOTICIAS_REF || path.join(path.dirname(fileURLToPath(import.meta.url)), "dominios-pe.tsv");
const MIN_CORTE = CORTE ? Number(CORTE.slice(0, 2)) * 60 + Number(CORTE.slice(3)) : 1440;
// GDELT publishes each file a few minutes after its timestamp: never record as seen what may still be missing
if (Date.parse(HASTA + "T00:00:00Z") + (MIN_CORTE + 15) * 60000 > Date.now()) { console.error(`Todavía no se puede bajar hasta ${HASTA} ${CORTE || "24:00"} UTC`); process.exit(3); }
const UA = "PerDataBot/1.0 (+https://perdata.site)";
const BASE = "https://data.gdeltproject.org/gdeltv3/gal/";
const DIAS = path.join(DIR, "dias.jsonl"), ESTADO = path.join(DIR, "estado.json");
for (const d of ["peru", "mundo"]) fs.mkdirSync(path.join(DIR, d), { recursive: true });

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- qué es un medio peruano ---
const PE = new Set(fs.readFileSync(REF, "utf8").split("\n").map((l) => l.split("\t")).filter((c) => c[1] === "PE").map((c) => c[0].toLowerCase()));
for (const d of ["rumbominero.com", "semanaeconomica.com", "energiminas.com", "lampadia.com", "ojo-publico.com", "trome.com", "depor.com", "peru.com", "deperu.com", "perureports.com", "tiempominero.com", "mineriaenlinea.com", "rcrperu.com", "peruinforma.com", "diariolaregion.com"]) PE.add(d);
const SECCION_PERU = /^https?:\/\/(www\.)?(infobae\.com|bloomberglinea\.com|elpais\.com|cnnespanol\.cnn\.com|france24\.com|swissinfo\.ch|dw\.com)\/[^?#]*\bperu\b/i;
function esPeruano(dominio, url) {
  if (dominio.endsWith(".pe")) return true;
  for (let d = dominio; d.includes("."); d = d.slice(d.indexOf(".") + 1)) if (PE.has(d)) return true;
  return SECCION_PERU.test(url);
}
// --- qué titulares del resto del mundo interesan ---
const ES = /(\bcobre\b|\bzinc\b|\bpetr[oó]leo\b|\bbrent\b|\bwti\b|\breserva federal\b|\bfed\b|\baranceles?\b|\btipo de cambio\b|\bd[oó]lar\b|\binflaci[oó]n\b|\btasas? de inter[eé]s\b|\bbonos del tesoro\b|\bwall street\b|\bprecio del oro\b|\bel oro\b|\bonza\b|\bmaterias primas\b|\bcommodities\b|\brecesi[oó]n\b|\bmercados emergentes\b|\bbcrp\b|\bper[uú]\b|\bperuan[oa]s?\b)/i;
const EN = /(\bcopper\b|\bzinc\b|\bcrude\b|\bbrent\b|\bwti\b|\boil prices?\b|\bfederal reserve\b|\bfed\b|\btariffs?\b|\bdollar\b|\binflation\b|\binterest rates?\b|\brate (cut|hike)s?\b|\btreasury yields?\b|\bwall street\b|\bgold (price|prices|futures|rises|falls|hits|slips|gains|rallies|climbs|drops|steadies|edges)\b|\bbullion\b|\bsilver prices?\b|\bcommodit(y|ies)\b|\brecession\b|\bemerging markets?\b|\bperu\b|\bperuvian\b)/i;

const limpio = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
let esperarHasta = 0; // pausa compartida por todos los hilos cuando el servidor pide calma

async function bajar(nombre) {
  let espera = 30000;
  for (let intento = 1; ; intento++) {
    while (Date.now() < esperarHasta) await sleep(esperarHasta - Date.now());
    try {
      const r = await fetch(BASE + nombre, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180000) });
      if (r.status === 404) return null;
      if (r.ok) return zlib.gunzipSync(Buffer.from(await r.arrayBuffer()));
      const ra = Number(r.headers.get("Retry-After")) || 0;
      throw Object.assign(new Error(`HTTP ${r.status}`), { ra });
    } catch (e) {
      const ms = Math.max(espera, (e.ra || 0) * 1000);
      log(`aviso ${nombre} intento ${intento}: ${e.message}; espero ${Math.round(ms / 1000)} s`);
      esperarHasta = Math.max(esperarHasta, Date.now() + ms);
      espera = Math.min(espera * 2, intento >= 8 ? 1800000 : 600000);
    }
  }
}

async function dia(fecha, desdeMin, hastaMin) {
  const ymd = fecha.replaceAll("-", "");
  const minutos = []; for (let m = desdeMin; m < hastaMin; m++) minutos.push(`${ymd}${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`);
  const peru = [], mundo = []; let i = 0, archivos = 0, registros = 0, bytes = 0;
  const hilo = async () => {
    while (i < minutos.length) {
      const sello = minutos[i++];
      const buf = await bajar(`${sello}.gal.json.gz`);
      if (!buf) continue;
      archivos++; bytes += buf.length;
      const visto = `${sello.slice(0, 4)}-${sello.slice(4, 6)}-${sello.slice(6, 8)}T${sello.slice(8, 10)}:${sello.slice(10, 12)}:00Z`;
      for (const linea of buf.toString("utf8").split("\n")) {
        if (!linea) continue;
        let a; try { a = JSON.parse(linea); } catch { continue; }
        registros++;
        const titulo = limpio(a.title, 400), url = String(a.url || "").trim(), dominio = String(a.domain || "").toLowerCase();
        if (!titulo || !url) continue;
        const reg = { visto, fecha: a.date || null, titulo, resumen: limpio(a.desc, 300), dominio, url, idioma: a.lang || "" };
        if (esPeruano(dominio, url)) peru.push(reg);
        else if ((reg.idioma === "es" && ES.test(titulo)) || (reg.idioma === "en" && EN.test(titulo))) mundo.push(reg);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, hilo));
  const cuenta = {};
  for (const [nombre, lista] of [["peru", peru], ["mundo", mundo]]) {
    const archivo = path.join(DIR, nombre, `${fecha.slice(0, 7)}.jsonl`);
    const vistos = new Set();
    if (fs.existsSync(archivo)) for (const l of fs.readFileSync(archivo, "utf8").split("\n")) { if (l) try { vistos.add(JSON.parse(l).url); } catch { /* línea cortada */ } }
    lista.sort((x, y) => x.visto.localeCompare(y.visto) || x.url.localeCompare(y.url));
    const nuevas = [];
    for (const r of lista) if (!vistos.has(r.url)) { vistos.add(r.url); nuevas.push(JSON.stringify(r)); }
    if (nuevas.length) fs.appendFileSync(archivo, nuevas.join("\n") + "\n");
    cuenta[nombre] = nuevas.length;
  }
  return { dia: fecha, ...(hastaMin < 1440 ? { corte: CORTE } : {}), archivos, registros, peru: cuenta.peru, mundo: cuenta.mundo, mb: Math.round(bytes / 1e6), hecho: new Date().toISOString() };
}

// hechos: whole days. parciales: day → minute up to which a cut day was already downloaded
const hechos = new Map(), parciales = new Map();
const minutoDe = (c) => Number(c.slice(0, 2)) * 60 + Number(c.slice(3));
if (fs.existsSync(DIAS)) for (const l of fs.readFileSync(DIAS, "utf8").split("\n")) {
  if (l) try { const d = JSON.parse(l); if (d.corte) parciales.set(d.dia, Math.max(parciales.get(d.dia) || 0, minutoDe(d.corte))); else hechos.set(d.dia, d); } catch { /* */ }
}
const todos = []; for (let t = Date.parse(DESDE + "T00:00:00Z"); t <= Date.parse(HASTA + "T00:00:00Z"); t += 86400000) todos.push(new Date(t).toISOString().slice(0, 10));
const hastaMin = (d) => (d === HASTA ? MIN_CORTE : 1440);
const pendientes = todos.filter((d) => !hechos.has(d) && (parciales.get(d) || 0) < hastaMin(d));
log(`INICIO ${DESDE}..${HASTA}: ${pendientes.length} días pendientes de ${todos.length}, ${CONC} conexiones, salida ${DIR}`);
const t0 = Date.now(); let n = 0;
for (const fecha of pendientes) {
  const r = await dia(fecha, parciales.get(fecha) || 0, hastaMin(fecha));
  fs.appendFileSync(DIAS, JSON.stringify(r) + "\n");
  if (r.corte) parciales.set(fecha, hastaMin(fecha)); else hechos.set(fecha, r);
  n++;
  const porDia = (Date.now() - t0) / n / 1000, faltan = pendientes.length - n;
  const tot = [...hechos.values()].reduce((s, d) => ({ peru: s.peru + d.peru, mundo: s.mundo + d.mundo }), { peru: 0, mundo: 0 });
  fs.writeFileSync(ESTADO, JSON.stringify({ desde: DESDE, hasta: HASTA, dias_total: todos.length, dias_hechos: todos.length - faltan, ultimo_dia: fecha, titulares_peru: tot.peru, titulares_mundo: tot.mundo, segundos_por_dia: Math.round(porDia), horas_restantes: Math.round(faltan * porDia / 360) / 10, actualizado: new Date().toISOString() }, null, 1) + "\n");
  log(`OK ${fecha}: ${r.archivos} archivos, ${r.registros} artículos, peru +${r.peru}, mundo +${r.mundo}, ${r.mb} MB, ${Math.round(porDia)} s/día, faltan ${faltan} días`);
}
log("FIN");
