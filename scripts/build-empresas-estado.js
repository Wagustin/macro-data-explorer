import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG } from "../api/search.js";
import { buildIssuerStatuses } from "../api/_lib/empresas-estado.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY");

const { emisores } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "empresas.json"), "utf8"));
const symbols = [...new Set(emisores.flatMap((issuer) => (issuer.valores || []).map((value) => value.nemonico).filter(Boolean)))];
const since = new Date();
since.setUTCFullYear(since.getUTCFullYear() - 10);
const rows = [];

async function fetchRows(nemos) {
  const symbolsFilter = `in.(${nemos.map((symbol) => `"${symbol}"`).join(",")})`;
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`${base}/rest/v1/cotizaciones_smv`);
    url.searchParams.set("nemonico", symbolsFilter);
    url.searchParams.set("fecha", `gte.${since.toISOString().slice(0, 10)}`);
    url.searchParams.set("select", "nemonico,fecha,cierre,monto");
    url.searchParams.set("order", "nemonico.asc,fecha.asc");
    url.searchParams.set("limit", "1000");
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + 999}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Supabase cotizaciones_smv HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
}

for (let offset = 0; offset < symbols.length; offset += 30) {
  await fetchRows(symbols.slice(offset, offset + 30));
}

const projected = new Set(CATALOG.filter((item) => item.symbol.endsWith(".LM")).map((item) => item.symbol));
const output = {
  actualizado: new Date().toISOString(),
  emisores: buildIssuerStatuses(emisores, rows, projected),
};
fs.writeFileSync(path.join(ROOT, "data", "empresas-estado.json"), JSON.stringify(output, null, 1) + "\n");
console.log(`Estados SMV: ${Object.keys(output.emisores).length} emisores desde ${rows.length} cotizaciones`);
