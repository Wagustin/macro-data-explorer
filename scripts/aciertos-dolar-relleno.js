// Initial backfill script: reconstructs pronosticos-dolar.json from git history of data/daily-forecasts.json
// Starting from 2026-11-04. Run once, then commit the resulting pronosticos-dolar.json.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAILY_FORECASTS_PATH = path.join(ROOT, "data", "daily-forecasts.json");
const PRONOSTICOS_PATH = path.join(ROOT, "data", "official", "pronosticos-dolar.json");

const START_DATE = "2026-11-04"; // Start from this date (inclusive)

const HORIZONS_OF_INTEREST = ["h1", "h5", "h6", "h8"];

function getGitLogCommits() {
  try {
    const output = execSync("git log --format=%H -- data/daily-forecasts.json", {
      cwd: ROOT,
      encoding: "utf8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch (e) {
    console.error("Error getting git log:", e.message);
    process.exit(1);
  }
}

function getDailyForecastsAtCommit(commitHash) {
  try {
    const output = execSync(`git show ${commitHash}:data/daily-forecasts.json`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    return JSON.parse(output);
  } catch (e) {
    console.error(`Error reading daily-forecasts.json at commit ${commitHash}:`, e.message);
    return null;
  }
}

function extractPronosticosFromDaily(dailyForecasts) {
  const pen = dailyForecasts?.simbolos?.PEN;
  if (!pen) return [];

  const fechaBase = pen.fecha_ultimo_cierre;
  const cierreBase = pen.ultimo_cierre;
  const pronosticos = pen.pronosticos;

  const entries = [];

  for (const key of HORIZONS_OF_INTEREST) {
    const value = pronosticos[key];
    if (!value) continue;

    entries.push({
      fecha_base: fechaBase,
      horizonte: key,
      fecha_objetivo: value.fecha_objetivo,
      cierre_base: Number(cierreBase.toFixed(4)),
      p10: Number(value.p10.toFixed(4)),
      p50: Number(value.p50.toFixed(4)),
      p90: Number(value.p90.toFixed(4)),
    });
  }

  return entries;
}

function main() {
  console.log("Obteniendo historial de commits de data/daily-forecasts.json...");
  const commits = getGitLogCommits();
  console.log(`${commits.length} commits encontrados (del más reciente al más antiguo)`);

  // We need to process from oldest to newest, so reverse
  const commitsChronological = [...commits].reverse();

  const allPronosticos = [];
  const seenKeys = new Set();

  for (const commit of commitsChronological) {
    const daily = getDailyForecastsAtCommit(commit);
    if (!daily) continue;

    const entries = extractPronosticosFromDaily(daily);
    for (const entry of entries) {
      const key = `${entry.fecha_base}|${entry.horizonte}`;
      if (seenKeys.has(key)) continue;

      // Only include from START_DATE onwards
      if (entry.fecha_base < START_DATE) continue;

      seenKeys.add(key);
      allPronosticos.push(entry);
    }
  }

  // Sort by fecha_base then horizonte
  const horizonOrder = { h1: 1, h5: 2, h6: 3, h8: 4 };
  allPronosticos.sort((a, b) => {
    const dateCmp = a.fecha_base.localeCompare(b.fecha_base);
    if (dateCmp !== 0) return dateCmp;
    return (horizonOrder[a.horizonte] || 99) - (horizonOrder[b.horizonte] || 99);
  });

  console.log(`Total entradas únicas desde ${START_DATE}: ${allPronosticos.length}`);

  // Save
  fs.writeFileSync(PRONOSTICOS_PATH, `${JSON.stringify(allPronosticos, null, 2)}\n`);
  console.log(`Libro de pronósticos guardado en ${PRONOSTICOS_PATH}`);
}

main();