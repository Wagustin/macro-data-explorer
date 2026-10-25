// Precomputes PerData Engine v4 for every asset and the standard horizons, right after the daily
// TimesFM batch (timesfm.yml), and upserts the rows into Supabase with model "perdata-engine-v4".
// The Cloudflare Worker cannot run Engine v3 at request time within the free CPU limit, so it serves
// these rows; the Vercel API can still blend live. Same blend as api/forecast.js (blendV4).
// Needs data/history-120.json (refresh-history.js) and data/timesfm-forecasts-cache.json (batch).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildForecast, blendV4 } from "../api/forecast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HORIZONS = [1, 3, 6, 12, 24, 36];
const BATCH = [3, 6, 12, 24, 36];

const history = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "history-120.json"), "utf8"));
const tfm = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "timesfm-forecasts-cache.json"), "utf8"));
const tfmBy = new Map(tfm.map((r) => [`${r.symbol}:${r.horizon}`, r]));
const runAt = new Date().toISOString();

const rows = [];
let skipped = 0;
for (const [symbol, series] of Object.entries(history)) {
  if (!Array.isArray(series) || series.length < 24) continue;
  for (const H of HORIZONS) {
    const row = tfmBy.get(`${symbol}:${BATCH.find((x) => x >= H)}`);
    if (!row || !Array.isArray(row.path) || row.path.length < H) { skipped++; continue; }
    const F = buildForecast(series.slice(-600), H);
    const blended = blendV4(row.path, F.forecastPoints, H);
    if (!blended) { skipped++; continue; }
    const fin = blended[blended.length - 1];
    rows.push({ symbol, horizon: H, model: "perdata-engine-v4", run_at: runAt, last_close: Number(F.lastClose.toFixed(4)),
      p10: fin.p10, p25: fin.p25, p50: fin.p50, p75: fin.p75, p90: fin.p90, path: blended });
  }
}
console.log(`Engine v4: ${rows.length} proyecciones (${skipped} sin datos de TimesFM)`);

const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY || "";
if (!base || !key) {
  console.log("Sin Supabase: no se guardan");
  process.exit(0);
}
for (let i = 0; i < rows.length; i += 200) {
  const r = await fetch(`${base}/rest/v1/forecasts?on_conflict=symbol,horizon,model`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows.slice(i, i + 200)),
  });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
console.log(`Guardadas ${rows.length} filas en Supabase`);
