// Validates candidate PerData Engine forecast rows before publication.
// Ensures numbers are positive and finite, quantiles are monotonic, widths are bounded,
// log changes are reasonable, coverage meets targets, and series are fresh.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ENGINE } from "../api/_lib/engine.js";
import { SOURCES } from "../api/_lib/sources.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function isPositiveFinite(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function maxLogReturnThreshold(horizon) {
  const h = Math.max(1, Math.min(48, Number(horizon) || 1));
  return 0.35 + (1.8 - 0.35) * ((h - 1) / 47);
}

export function validateRow(row) {
  // (a) All numbers finite and positive
  const quantiles = [row.last_close, row.p10, row.p25, row.p50, row.p75, row.p90];
  if (!quantiles.every(isPositiveFinite)) {
    return { valid: false, reason: "non_finite_or_non_positive_values" };
  }

  if (!Array.isArray(row.path) || row.path.length === 0) {
    return { valid: false, reason: "missing_or_empty_path" };
  }

  for (const pt of row.path) {
    if (!Number.isInteger(pt.step) || pt.step <= 0) {
      return { valid: false, reason: "invalid_path_step" };
    }
    const ptValues = [pt.p10, pt.p25, pt.p50, pt.p75, pt.p90];
    if (!ptValues.every(isPositiveFinite)) {
      return { valid: false, reason: "non_finite_or_non_positive_path_quantiles" };
    }
    // (b) Quantile monotonicity on each point of path
    if (!(pt.p10 <= pt.p25 && pt.p25 <= pt.p50 && pt.p50 <= pt.p75 && pt.p75 <= pt.p90)) {
      return { valid: false, reason: "crossed_path_quantiles" };
    }
  }

  // (b) Quantile monotonicity on row
  if (!(row.p10 <= row.p25 && row.p25 <= row.p50 && row.p50 <= row.p75 && row.p75 <= row.p90)) {
    return { valid: false, reason: "crossed_quantiles" };
  }

  // (c) Width (p90 / p10) between 1.0 and 40.0
  const width = row.p90 / row.p10;
  if (!Number.isFinite(width) || width < 1.0 || width > 40.0) {
    return { valid: false, reason: "absurd_width", width };
  }

  // (d) Suspicious check: |log(p50 / last_close)|
  const logRatio = Math.abs(Math.log(row.p50 / row.last_close));
  const threshold = maxLogReturnThreshold(row.horizon);
  const suspicious = logRatio > threshold;

  return { valid: true, suspicious, logRatio, threshold };
}

export function validateForecasts({ rows, history = {}, previousCount = null, previousModel = ENGINE.id, now = Date.now() }) {
  const t0 = Date.now();
  const totalRows = Array.isArray(rows) ? rows.length : 0;
  const validRows = [];
  const discarded = [];
  const suspicious = [];

  for (let i = 0; i < totalRows; i++) {
    const row = rows[i];
    const res = validateRow(row);
    if (!res.valid) {
      discarded.push({ index: i, symbol: row?.symbol, horizon: row?.horizon, reason: res.reason, width: res.width });
    } else {
      validRows.push(row);
      if (res.suspicious) {
        suspicious.push({ symbol: row.symbol, horizon: row.horizon, logRatio: Number(res.logRatio.toFixed(4)), threshold: Number(res.threshold.toFixed(4)) });
      }
    }
  }

  // Sufficient history assets (>= 24 monthly points)
  const sufficientSymbols = Object.entries(history)
    .filter(([_, s]) => Array.isArray(s) && s.length >= 24)
    .map(([sym]) => sym);

  const symbolsWithRows = new Set(validRows.map((r) => r.symbol));
  const missingSymbols = sufficientSymbols.filter((sym) => !symbolsWithRows.has(sym));
  const sinDatos = sufficientSymbols.filter((sym) => !rows.some((r) => r.symbol === sym));

  // (e) Cobertura check
  let cobertura_ok = true;
  if (missingSymbols.length > 0) {
    cobertura_ok = false;
  }
  const sameModelPreviousCount = previousModel === ENGINE.id && previousCount > 0 ? previousCount : null;
  const benchmarkCount = sameModelPreviousCount || (sufficientSymbols.length > 0 ? sufficientSymbols.length * 48 : totalRows);
  if (benchmarkCount > 0 && validRows.length < 0.9 * benchmarkCount) {
    cobertura_ok = false;
  }

  // (f) Frescura check
  const staleSymbols = [];
  const freshnessBySymbol = new Map();
  for (const sym of symbolsWithRows) {
    const series = history[sym];
    if (!Array.isArray(series) || series.length === 0) continue;
    const lastDate = series[series.length - 1]?.date;
    if (!lastDate) continue;
    const ageDays = (now - Date.parse(lastDate)) / 864e5;
    const thresholdDays = SOURCES[sym] ? 100 : 45;
    const stale = ageDays > thresholdDays;
    freshnessBySymbol.set(sym, !stale);
    if (stale) staleSymbols.push({ symbol: sym, lastDate, ageDays: Number(ageDays.toFixed(1)), thresholdDays });
  }
  const frescura_ok = symbolsWithRows.size === 0 || staleSymbols.length <= symbolsWithRows.size * 0.2;
  const publishableRows = validRows.filter((row) => freshnessBySymbol.get(row.symbol) !== false);

  const pctDescartadas = totalRows > 0 ? (discarded.length / totalRows) * 100 : 0;
  const discardedAcceptable = pctDescartadas <= 5.0;

  const exito = totalRows > 0 && discardedAcceptable && cobertura_ok && frescura_ok;

  const report = {
    actualizado: new Date(now).toISOString(),
    model: ENGINE.id,
    filas: totalRows,
    validas: publishableRows.length,
    descartadas: discarded.length,
    pct_descartadas: Number(pctDescartadas.toFixed(2)),
    sospechosas: suspicious.length,
    simbolos_sin_datos: sinDatos.length,
    simbolos_totales: sufficientSymbols.length,
    tiempo_ms: Date.now() - t0,
    cobertura_ok,
    frescura_ok,
    exito,
    detalles_descartadas: discarded.slice(0, 50),
    detalles_sospechosas: suspicious.slice(0, 50),
    simbolos_faltantes: missingSymbols,
    simbolos_viejos: staleSymbols,
  };

  return { validRows: publishableRows, report, exito };
}

function writeSummaryTable(report) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  const status = report.exito ? "Aprobado" : "Rechazado";
  const md = `### Validación de Proyecciones (PerData Engine)

| Métrica | Valor |
| --- | --- |
| Filas evaluadas | ${report.filas} |
| Filas válidas | ${report.validas} |
| Descartadas | ${report.descartadas} (${report.pct_descartadas}%) |
| Sospechosas (|log| elevado) | ${report.sospechosas} |
| Símbolos sin datos | ${report.simbolos_sin_datos} / ${report.simbolos_totales} |
| Cobertura (>= 90% y sin pérdidas totales) | ${report.cobertura_ok ? "OK" : "FALLÓ"} |
| Frescura (<= 45 / 100 días; máximo 20% de símbolos excluidos) | ${report.frescura_ok ? "OK" : "FALLÓ"} |
| Resultado | **${status}** |
| Tiempo de validación | ${report.tiempo_ms} ms |
`;

  try {
    fs.appendFileSync(summaryFile, md, "utf8");
  } catch (err) {
    console.warn("No se pudo escribir GITHUB_STEP_SUMMARY:", err.message);
  }
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const rowsPath = path.join(ROOT, "data", "engine-rows.json");
  const historyPath = path.join(ROOT, "data", "history-120.json");
  const reportPath = path.join(ROOT, "data", "engine-report.json");

  if (!fs.existsSync(rowsPath)) {
    console.error(`Error: archivo no encontrado: ${rowsPath}`);
    process.exit(1);
  }

  let previousCount = null;
  if (fs.existsSync(reportPath)) {
    try {
      const prevReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      if (prevReport.model === ENGINE.id) previousCount = prevReport.validas || null;
    } catch {
      // Ignorar error al leer reporte previo
    }
  }

  const rows = JSON.parse(fs.readFileSync(rowsPath, "utf8"));
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf8")) : {};

  const { validRows, report, exito } = validateForecasts({ rows, history, previousCount });

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // If validation succeeded or partially discarded, write back only valid rows for publication
  if (exito) {
    fs.writeFileSync(rowsPath, JSON.stringify(validRows, null, 2));
  }

  writeSummaryTable(report);

  console.log(`Validación completada: ${report.validas}/${report.filas} válidas, ${report.descartadas} descartadas (${report.pct_descartadas}%), ${report.sospechosas} sospechosas.`);

  if (!exito) {
    console.error(`FALLO DE VALIDACIÓN: descartadas=${report.pct_descartadas}%, cobertura=${report.cobertura_ok}, frescura=${report.frescura_ok}`);
    process.exit(1);
  }

  process.exit(0);
}
