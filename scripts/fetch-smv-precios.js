// Daily closes of the Lima stock exchange from the SMV public registry ("Estadísticas de
// cotizaciones", https://www.smv.gob.pe/simv/) into Supabase (cotizaciones_smv).
// For every security in data/empresas.json it asks for the days since the first of last month
// (at most ~45 sessions, under the page's 100-row limit) and rewrites them with the month-end flags,
// so the current month always has its latest close marked. One request every 3 s, identified
// User-Agent, nothing in parallel. Runs on GitHub Actions (smv-precios.yml).
// Usage: node scripts/fetch-smv-precios.js            daily update
//        node scripts/fetch-smv-precios.js --cargar DIR   one-time load of the 10-year files ({NEMO}.json)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { markMonthEnds } from "../api/_lib/smv.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_SMV = "https://www.smv.gob.pe/simv/Frm_EstadisticasCotizaciones?data=78BBEA2E92DD58D85BD256A49A1281F9EF5F1945C6";
const UA = "PerDataBot/1.0 (+https://perdata.site)";
const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) { console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function polite(url, init = {}) {
  const wait = lastCall + 3000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`SMV HTTP ${r.status}`);
  return r;
}

const num = (s) => { const v = Number(String(s).replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
const iso = (s) => { const [d, m, y] = s.split("/"); return `${y}-${m}-${d}`; };
const dmy = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

// A fresh page (and session) for every query: reusing a postback's state returns empty grids
async function query(nemo, desde, hasta) {
  const first = await polite(URL_SMV);
  const cookie = (first.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const html = await first.text();
  const form = new URLSearchParams();
  for (const [, n, v] of html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) form.set(n, v.replace(/&amp;/g, "&"));
  if (!form.has("__VIEWSTATE")) throw new Error("página de la SMV sin formulario");
  form.set("ctl00$MainContent$cboValor", nemo);
  form.set("ctl00$MainContent$txtFechDesde", desde);
  form.set("ctl00$MainContent$txtFechHasta", hasta);
  form.set("ctl00$MainContent$btnBuscar", "Buscar");
  const res = await polite(URL_SMV, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: URL_SMV, Cookie: cookie } });
  const page = await res.text();
  if (!page.includes("MainContent_cboValor")) throw new Error("respuesta inesperada de la SMV");
  const rows = [];
  for (const [, tr] of page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    if (c.length < 11 || !/^\d{2}\/\d{2}\/\d{4}$/.test(c[0]) || c[1] !== nemo) continue;
    const cierre = num(c[5]);
    if (!(cierre > 0)) continue;
    rows.push({ nemonico: nemo, fecha: iso(c[0]), cierre, apertura: num(c[6]), maximo: num(c[7]), minimo: num(c[8]), monto: num(c[10]) });
  }
  if (rows.length >= 100) throw new Error("100 filas: rango demasiado largo");
  return rows;
}

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await fetch(`${base}/rest/v1/cotizaciones_smv?on_conflict=nemonico,fecha`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 1000)),
    });
    if (!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === "--cargar") {
  const dir = args[1];
  let total = 0, valores = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const rows = (d.filas || []).filter((x) => x.cierre > 0).map((x) => ({
      nemonico: d.nemonico, fecha: x.fecha, cierre: x.cierre, apertura: x.apertura ?? null, maximo: x.maximo ?? null, minimo: x.minimo ?? null, monto: x.monto ?? null,
    }));
    if (!rows.length) continue;
    await upsert(markMonthEnds(rows));
    total += rows.length; valores++;
  }
  console.log(`Cargadas ${total} filas de ${valores} valores`);
  process.exit(0);
}

const { emisores } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "empresas.json"), "utf8"));
const nemos = [...new Set(emisores.flatMap((e) => e.valores.map((v) => v.nemonico)))];
const now = new Date();
const desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
let ok = 0, filas = 0;
const fallos = [];
for (const nemo of nemos) {
  try {
    const rows = await query(nemo, dmy(desde), dmy(now));
    if (rows.length) { await upsert(markMonthEnds(rows)); filas += rows.length; }
    ok++;
  } catch (e) {
    fallos.push(`${nemo} (${e.message})`);
  }
}
console.log(`SMV: ${ok}/${nemos.length} valores consultados, ${filas} filas guardadas${fallos.length ? ` · fallos: ${fallos.slice(0, 10).join(", ")}` : ""}`);
if (ok < nemos.length * 0.8) process.exit(1);
