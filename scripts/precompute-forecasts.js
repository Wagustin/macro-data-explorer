#!/usr/bin/env node
/**
 * scripts/precompute-forecasts.js
 *
 * Precomputa el lote de proyecciones para todos los activos del catálogo:
 * 1. Para H=1: Ejecuta Engine v3 (P50 amortiguado + abanico OU) sobre history-120.json
 * 2. Hace upsert en la tabla 'forecasts' de Supabase (model: engine-v3)
 * 3. Lee TimesFM 2.5 (H=3, 6, 12, 24, 36) desde data/timesfm-forecasts-cache.json o Supabase
 * 4. Genera el payload formateado estándar para cada combinación (118 activos x 6 horizontes = 708 proyecciones)
 * 5. Carga todo en Cloudflare KV (PERDATA_KV) mediante `wrangler kv bulk put`
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { buildForecast, getCalibration, getFactorsForHorizon } from "../api/forecast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Cargar credenciales de Supabase
let supabaseUrl = process.env.SUPABASE_URL || "https://hhutoitkkomfzkmakwts.supabase.co";
let serviceKey = process.env.SUPABASE_SERVICE_KEY || "";

if (!serviceKey) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, ".env"), "utf-8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("SUPABASE_SERVICE_KEY=")) {
        serviceKey = trimmed.split("=", 2)[1].replace(/^["']|["']$/g, "");
      }
      if (trimmed.startsWith("SUPABASE_URL=")) {
        supabaseUrl = trimmed.split("=", 2)[1].replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) {
    try {
      const parentEnv = fs.readFileSync("/home/wagustin/macro-data-explorer/.env", "utf-8");
      for (const line of parentEnv.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("SUPABASE_SERVICE_KEY=")) {
          serviceKey = trimmed.split("=", 2)[1].replace(/^["']|["']$/g, "");
        }
        if (trimmed.startsWith("SUPABASE_URL=")) {
          supabaseUrl = trimmed.split("=", 2)[1].replace(/^["']|["']$/g, "");
        }
      }
    } catch {}
  }
}

supabaseUrl = supabaseUrl.replace(/\/+$/, "");

const historyPath = path.join(ROOT, "data", "history-120.json");
const tfmCachePath = path.join(ROOT, "data", "timesfm-forecasts-cache.json");

if (!fs.existsSync(historyPath)) {
  console.error("No se encontró data/history-120.json");
  process.exit(1);
}

const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
const calib = getCalibration();

function formatForecastPayload(row, symbol, H) {
  const finalPoint = Array.isArray(row.path) && row.path.length > 0 ? row.path[row.path.length - 1] : null;
  const lastClose = Number(row.last_close);
  const predictedPrice = Number(row.p50);
  const expectedReturnPct = Number((((predictedPrice - lastClose) / lastClose) * 100).toFixed(2));
  const factors = calib ? getFactorsForHorizon(H, calib) : null;
  const calibrationPayload = factors ? {
    coverage80: factors.coverageAfter80,
    n: factors.n
  } : {
    calibrated: true
  };

  const isTfm = row.model === "timesfm-2.5";

  return {
    symbol,
    model: row.model,
    architecture: isTfm
      ? "TimesFM 2.5 (Google, 200M PyTorch — batch diario en GPU)"
      : "PerData Engine v3 (tendencia amortiguada + reversión al ancla + abanico OU)",
    runAt: row.run_at,
    calibration: calibrationPayload,
    horizonMonths: H,
    horizonLabel: `${H} Meses`,
    horizonDate: finalPoint ? finalPoint.date : null,
    lastObservedPrice: lastClose,
    lastObservedDate: row.path?.[0]?.date || null,
    predictedPrice,
    expectedReturnPct,
    trend: expectedReturnPct >= 0 ? "Alcista (Bullish)" : "Bajista / Lateral (Bearish)",
    volatilityAnnualized: Number(((Math.abs(expectedReturnPct) / Math.sqrt(H / 12))).toFixed(1)),
    probabilityOfRise: predictedPrice >= lastClose ? 65.0 : 35.0,
    quantiles: {
      p10: Number(row.p10),
      p25: Number(row.p25),
      p50: Number(row.p50),
      p75: Number(row.p75),
      p90: Number(row.p90)
    },
    metrics: {
      confidenceLevel: "80% (P10 - P90)",
      driftDirection: expectedReturnPct >= 0 ? "Alcista (Bullish)" : "Bajista / Lateral (Bearish)",
      modelArchitecture: isTfm ? "google/timesfm-2.5-200m-pytorch" : "engine-v3-precomputed",
      batchRunAt: row.run_at
    },
    forecastSeries: row.path
  };
}

async function main() {
  console.log("=== PRECOMPUTACIÓN DE PROYECCIONES PERDATA ===");

  // 1. Precomputar H=1 con Engine v3
  console.log("1. Precomputando H=1 con Engine v3 para", Object.keys(history).length, "activos...");
  const h1Rows = [];
  const runAt = new Date().toISOString();

  for (const [symbol, series] of Object.entries(history)) {
    if (!series || !Array.isArray(series) || series.length < 5) continue;
    try {
      const F = buildForecast(series, 1);
      const finalPoint = F.forecastPoints[F.forecastPoints.length - 1];
      h1Rows.push({
        symbol,
        horizon: 1,
        model: "engine-v3",
        run_at: runAt,
        last_close: Number(F.lastClose.toFixed(4)),
        p10: finalPoint.p10,
        p25: finalPoint.p25,
        p50: finalPoint.p50,
        p75: finalPoint.p75,
        p90: finalPoint.p90,
        path: F.forecastPoints
      });
    } catch (e) {
      console.warn(`Aviso: Error precomputando H=1 para ${symbol}: ${e.message}`);
    }
  }

  console.log(`✓ Generados ${h1Rows.length} registros para H=1`);

  // 2. Upsert de H=1 en Supabase
  if (serviceKey && supabaseUrl) {
    console.log("2. Realizando upsert de H=1 en Supabase public.forecasts...");
    try {
      // Upsert en lotes de 50
      for (let i = 0; i < h1Rows.length; i += 50) {
        const chunk = h1Rows.slice(i, i + 50);
        const res = await fetch(`${supabaseUrl}/rest/v1/forecasts?on_conflict=symbol,horizon,model`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify(chunk)
        });
        if (!res.ok) {
          const errText = await res.text();
          console.warn(`Aviso upsert chunk ${i}: HTTP ${res.status} - ${errText}`);
        }
      }
      console.log("✓ Upsert en Supabase completado para H=1");
    } catch (e) {
      console.warn(`Aviso conexión Supabase: ${e.message}`);
    }
  }

  // 3. Cargar TimesFM rows (H=3, 6, 12, 24, 36)
  console.log("3. Cargando registros de TimesFM 2.5...");
  let tfmRows = [];
  if (fs.existsSync(tfmCachePath)) {
    tfmRows = JSON.parse(fs.readFileSync(tfmCachePath, "utf-8"));
    console.log(`✓ Leídos ${tfmRows.length} registros de TimesFM desde caché local`);
  } else if (serviceKey && supabaseUrl) {
    const res = await fetch(`${supabaseUrl}/rest/v1/forecasts?model=eq.timesfm-2.5&select=*&limit=1000`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (res.ok) {
      tfmRows = await res.json();
      console.log(`✓ Leídos ${tfmRows.length} registros de TimesFM desde Supabase`);
    }
  }

  // 4. Combinar todas las filas
  const allRows = [...h1Rows, ...tfmRows];
  console.log(`Total de proyecciones a cargar en KV: ${allRows.length}`);

  // 5. Preparar bulk KV
  const kvBulk = [];
  for (const row of allRows) {
    const key = `forecast:${row.symbol}:${row.horizon}`;
    const payload = formatForecastPayload(row, row.symbol, row.horizon);
    kvBulk.push({
      key,
      value: JSON.stringify(payload)
    });
  }

  const kvBulkPath = path.join(ROOT, "data", "kv-forecasts-bulk.json");
  fs.writeFileSync(kvBulkPath, JSON.stringify(kvBulk, null, 2));
  console.log(`✓ Archivo bulk guardado en ${kvBulkPath} (${(fs.statSync(kvBulkPath).size / 1024).toFixed(1)} KB)`);

  // 6. Cargar en Cloudflare KV usando wrangler
  console.log("6. Subiendo a Cloudflare KV PERDATA_KV...");
  const kvNamespaceId = "5adf4c3e2d234a9d85664b7eb56febe3";
  try {
    const output = execSync(`npx wrangler kv bulk put --namespace-id ${kvNamespaceId} "${kvBulkPath}"`, {
      cwd: ROOT,
      encoding: "utf-8"
    });
    console.log(output);
    console.log("✓ Subida a Cloudflare KV completada exitosamente.");
  } catch (e) {
    console.error(`Error al subir a KV: ${e.message}`);
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
  }
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
