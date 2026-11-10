// Reconstructs pronosticos-dolar.json from the git history of data/daily-forecasts.json.
// Rule: for every key tipo|fecha_objetivo the book keeps the last version registered BEFORE
// 09:00 in Lima (14:00 UTC) of the target day, which is the range people actually receive
// in the morning. Run once, then commit the resulting pronosticos-dolar.json.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { buildPronosticosFromDaily, fechaLima } from "./aciertos-dolar.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRONOSTICOS_PATH = path.join(ROOT, "data", "official", "pronosticos-dolar.json");

const START_DATE = "2026-11-03"; // Start from this Lima date (inclusive)

function getGitLogCommits() {
  try {
    const output = execSync('git log --reverse --format="%H %cI" -- data/daily-forecasts.json', {
      cwd: ROOT,
      encoding: "utf8",
    });
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((linea) => {
        const [hash, fechaIso] = linea.split(" ");
        return { hash, fechaIso };
      });
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

function main() {
  console.log("Obteniendo historial de commits de data/daily-forecasts.json...");
  const commits = getGitLogCommits();
  console.log(`${commits.length} commits encontrados (del más antiguo al más reciente)`);

  let libro = [];

  for (const commit of commits) {
    const ahora = new Date(commit.fechaIso);

    // Only commits published from START_DATE onwards (Lima date) are taken into account
    if (fechaLima(ahora) < START_DATE) continue;

    const daily = getDailyForecastsAtCommit(commit.hash);
    if (!daily) continue;

    libro = buildPronosticosFromDaily(daily, libro, { ahora });
  }

  console.log(`Total entradas desde ${START_DATE}: ${libro.length}`);

  // Save
  fs.writeFileSync(PRONOSTICOS_PATH, `${JSON.stringify(libro, null, 2)}\n`);
  console.log(`Libro de pronósticos guardado en ${PRONOSTICOS_PATH}`);
}

main();
