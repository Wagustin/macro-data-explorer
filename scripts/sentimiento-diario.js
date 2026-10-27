// Daily news sentiment from Laya's classification, stored in Supabase (sentimiento_diario) so the
// engine can be tested with it once there are a few months of history. For each Lima day in the
// feed it counts positive, negative and neutral headlines per company (nemónico) and per topic
// ("tema:<tema>"). Recounts the feed each run (except its oldest, possibly partial, day).
// Runs after scripts/classify_news.py in news.yml.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return d; } };
const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) { console.log("Sin Supabase: no se guarda el sentimiento"); process.exit(0); }

const news = read("noticias.json", { noticias: [] }).noticias || [];
const laya = read("noticias-laya.json", { items: {} }).items || {};
const limaDay = (isoDate) => new Date(Date.parse(isoDate) - 5 * 36e5).toISOString().slice(0, 10);
const FIELD = { POSITIVO: "positivas", NEGATIVO: "negativas" };

const counts = new Map();
for (const n of news) {
  const c = laya[n.id];
  if (!c || !n.fecha_iso || !c.sentimiento) continue;
  const fecha = limaDay(n.fecha_iso);
  const field = FIELD[c.sentimiento] || "neutras";
  for (const clave of [...(c.empresas || []), ...(c.tema ? [`tema:${c.tema}`] : [])]) {
    const k = `${fecha}|${clave}`;
    if (!counts.has(k)) counts.set(k, { fecha, clave, positivas: 0, negativas: 0, neutras: 0 });
    counts.get(k)[field]++;
  }
}
// The oldest day may be only partly in the feed: leave its earlier, complete count alone
const oldest = [...counts.values()].reduce((m, x) => (x.fecha < m ? x.fecha : m), "9999");
const rows = [...counts.values()].filter((x) => x.fecha > oldest);
if (!rows.length) { console.log("Sin noticias clasificadas"); process.exit(0); }
const r = await fetch(`${base}/rest/v1/sentimiento_diario?on_conflict=fecha,clave`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(rows),
});
if (!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
console.log(`Sentimiento: ${rows.length} filas (${new Set(rows.map((x) => x.fecha)).size} días)`);
