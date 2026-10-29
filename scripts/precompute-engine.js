// Precomputes PerData Engine v6 for every asset and every horizon from 1 to 48 months, right after
// the daily Chronos-2 batch (timesfm.yml), and writes them to data/engine-rows.json for validation.
// The Cloudflare Worker cannot run Engine v3 at request time within the free CPU limit, so it serves these rows.
// Needs data/history-120.json (refresh-history.js) and data/model-forecasts-cache.json (chronos_batch.py).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildForecast } from "../api/forecast.js";
import { ENGINE, blendEngine } from "../api/_lib/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HORIZONS = Array.from({ length: 48 }, (_, i) => i + 1);

const history = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "history-120.json"), "utf8"));
const batch = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "model-forecasts-cache.json"), "utf8"));
const pathBy = new Map(batch.map((r) => [r.symbol, r]));
const runAt = new Date().toISOString();

const rows = [];
let skipped = 0;
for (const [symbol, series] of Object.entries(history)) {
  if (!Array.isArray(series) || series.length < 24) continue;
  const cached = pathBy.get(symbol);
  if (!cached?.chronos2) { skipped += HORIZONS.length; continue; }
  const modelPath = cached.chronos2;
  modelPath.last_close = cached.last_close;
  // v3 is run once at 48 months: its first H points are the H-month path
  const F = buildForecast(series.slice(-600), 48);
  for (const H of HORIZONS) {
    const blended = blendEngine(modelPath, F.forecastPoints, H, { timesfmPath: cached.timesfm });
    if (!blended) { skipped++; continue; }
    const fin = blended[blended.length - 1];
    rows.push({ symbol, horizon: H, model: ENGINE.id, run_at: runAt, last_close: Number(F.lastClose.toFixed(4)),
      p10: fin.p10, p25: fin.p25, p50: fin.p50, p75: fin.p75, p90: fin.p90, path: blended });
  }
}
const outPath = path.join(ROOT, "data", "engine-rows.json");
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
console.log(`${ENGINE.label}: ${rows.length} proyecciones escritas en data/engine-rows.json (${skipped} sin datos del modelo)`);
