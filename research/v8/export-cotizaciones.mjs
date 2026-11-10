// Exporta los cierres diarios de la SMV (tabla cotizaciones_smv) a un CSV para investigación del motor.
// Solo se ejecuta en GitHub Actions (flujo manual «Exportar cotizaciones»); el CSV sale como artefacto y no se guarda en el repositorio.
import fs from "node:fs";

const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY");

const out = fs.createWriteStream(process.argv[2] || "cotizaciones_smv.csv");
out.write("nemonico,fecha,cierre,monto\n");
let total = 0;
for (let offset = 0; ; offset += 1000) {
  const url = new URL(`${base}/rest/v1/cotizaciones_smv`);
  url.searchParams.set("select", "nemonico,fecha,cierre,monto");
  url.searchParams.set("order", "nemonico.asc,fecha.asc");
  url.searchParams.set("limit", "1000");
  url.searchParams.set("offset", String(offset));
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Supabase cotizaciones_smv HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const page = await r.json();
  for (const q of page) out.write(`${q.nemonico},${q.fecha},${q.cierre ?? ""},${q.monto ?? ""}\n`);
  total += page.length;
  if (page.length < 1000) break;
}
await new Promise((resolve) => out.end(resolve));
console.log(`Exportadas ${total} cotizaciones`);
