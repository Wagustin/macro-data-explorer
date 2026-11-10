/**
 * Auditoría FUERA DE MUESTRA del motor DIARIO real (scripts/engine-daily.js).
 *
 * Por qué esta auditoría: scripts/boletin.js publica el rango «mañana» que
 * scripts/engine-daily.js (generateDailyForecasts) escribe en data/daily-forecasts.json:
 *
 *   K       = runFHSBacktest(serie, h, { startDate, sym }).K          (calibración)
 *   q10/q90 = computeCurrentFHSQuantiles(serie, h)                   (cuantiles FHS + EWMA)
 *   p10/p90 = ultimo_cierre * exp(K * q10 / q90)                     (banda 80%)
 *
 * En producción K se calibra con toda la serie disponible hasta hoy (legítimo en tiempo real),
 * pero al auditar la cobertura histórica ese mismo K incluye el futuro: por eso la cobertura
 * «80,03 %» de auditar-diario.mjs sale por construcción y no prueba nada.
 * Aquí K se recalcula con la historia disponible en cada corte — solo datos hasta ese
 * día — igual que lo haría el boletín de esa mañana.
 *
 * Salidas:
 *   ~/v7/resultados/motor-diario-real.csv   una fila por día (fuera de git)
 *   resultados-diario-real.json              agregados (en git)
 *   tabla-diario-real.md                     tabla Markdown (en git)
 */

import { runFHSBacktest, computeCurrentFHSQuantiles, empiricalQuantile } from "../../../scripts/engine-daily.js";
import fs from "fs";
import path from "path";

// ---------- Config ----------
const PEN_START = "2019-01-01"; // mismo startDate que usa generateDailyForecasts para PEN
const EVAL_START = "2019-01-01";
const EVAL_END = "2026-12-31";
const K_RECALC_EVERY = 5; // días hábiles entre recálculos de K (el warm-up recalcula diario)
const MIN_CAL_CUTS = 60; // cortes de calibración mínimos para considerar estable el K
const RW_WINDOW = 250; // retornos de la línea base de paseo aleatorio

const OUT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const CSV_DIR = path.join(process.env.HOME || "/home/wagustin", "v7", "resultados");
const CSV_PATH = path.join(CSV_DIR, "motor-diario-real.csv");

// ---------- Utilidades ----------
function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Winkler score en su forma de puntuación de intervalo α-normalizada (Gneiting & Raftery 2007):
 *   IS_α = (U-L) + (2/α)(L-y)·1{y<L} + (2/α)(y-U)·1{y>U}
 *   W    = sqrt( mean(IS_α) )
 * Se calcula en espacio logarítmico (y = log(real/base), L/U = log(p10/p90)) para que la
 * magnitud sea adimensional. La forma gaussiana clásica (W = sqrt(mean(((y-m)/σ)² + 2 ln σ)))
 * no está definida con esta escala (σ implícito ≪ 1) y por eso se usa la forma normalizada.
 * Menor = mejor (penaliza bandas anchas y cierres fuera de banda).
 */
function winkler(rows, alpha = 0.80) {
  const usable = rows.filter(r => Number.isFinite(r.w));
  if (!usable.length) return { score: NaN, n: 0 };
  let acc = 0;
  for (const r of usable) {
    const penalty = r.y < r.lo ? (2 / alpha) * (r.lo - r.y) : r.y > r.hi ? (2 / alpha) * (r.y - r.hi) : 0;
    acc += r.w + penalty;
  }
  return { score: Math.sqrt(acc / usable.length), n: usable.length };
}

/**
 * Métricas de un grupo de cortes: cobertura 80%, ancho medio (% y soles) y Winkler.
 */
function summarize(rows) {
  if (!rows.length) return null;
  const n = rows.length;
  const hit = rows.filter(r => r.cierre_real >= r.p10 && r.cierre_real <= r.p90).length;
  const widths = rows.map(r => r.p90 - r.p10);
  const widthsPct = rows.map(r => ((r.p90 - r.p10) / r.cierre_base) * 100);
  const w = winkler(rows.map(r => ({
    y: Math.log(r.cierre_real / r.cierre_base),
    lo: Math.log(r.p10 / r.cierre_base),
    hi: Math.log(r.p90 / r.cierre_base),
    w: Math.log(r.p90 / r.cierre_base) - Math.log(r.p10 / r.cierre_base),
  })));
  return {
    n,
    cobertura: Number(((hit / n) * 100).toFixed(2)),
    ancho_pct: Number(mean(widthsPct).toFixed(4)),
    ancho_soles: Number(mean(widths).toFixed(4)),
    winkler: Number(w.score.toFixed(4)),
    winkler_n: w.n,
  };
}

// ---------- Main ----------
function main() {
  const BCRP_PATH = path.resolve(OUT_DIR, "../../../data/official/bcrp-daily.json");
  const bcrp = JSON.parse(fs.readFileSync(BCRP_PATH, "utf8"));
  const serie = bcrp.series.PEN.serie.filter(([d, p]) => Number.isFinite(p) && p > 0);
  console.log(`PEN diario: ${serie.length} observaciones (${serie[0][0]} a ${serie[serie.length - 1][0]})`);

  const dates = serie.map(r => r[0]);
  const prices = serie.map(r => r[1]);

  // Cortes evaluables: día hábil con cierre del día siguiente disponible
  const evalIdx = [];
  for (let i = 0; i + 1 < serie.length; i++) {
    if (dates[i] >= EVAL_START && dates[i] <= EVAL_END) evalIdx.push(i);
  }
  console.log(`Cortes evaluables ${EVAL_START}–${EVAL_END}: ${evalIdx.length}`);

  // ---------- Walk-forward: K con historia hasta cada corte ----------
  const rows = [];
  let K = null;
  let kCuts = 0;
  let lastRecalcPos = -Infinity;

  for (let pos = 0; pos < evalIdx.length; pos++) {
    const i = evalIdx[pos];
    const serieT = serie.slice(0, i + 1); // SOLO datos hasta el día i

    // Recalibrar K (cada K_RECALC_EVERY días hábiles; a diario durante el warm-up)
    if (pos - lastRecalcPos >= K_RECALC_EVERY || kCuts < MIN_CAL_CUTS) {
      const bt = runFHSBacktest(serieT, 1, { startDate: PEN_START, sym: "PEN" });
      K = bt.K;
      kCuts = bt.cuts;
      lastRecalcPos = pos;
    }

    const q = computeCurrentFHSQuantiles(serieT, 1);
    const pT = prices[i];
    const p10 = pT * Math.exp(K * q.q10);
    const p90 = pT * Math.exp(K * q.q90);

    // Línea base: paseo aleatorio con cuantil empírico 10-90 de los últimos 250 retornos
    const ret = [];
    for (let j = Math.max(1, i - RW_WINDOW + 1); j <= i; j++) ret.push(Math.log(prices[j] / prices[j - 1]));
    ret.sort((a, b) => a - b);
    const rq10 = empiricalQuantile(ret, 0.10);
    const rq90 = empiricalQuantile(ret, 0.90);
    const rw10 = pT * Math.exp(rq10);
    const rw90 = pT * Math.exp(rq90);

    // Volatilidad de 20 días (desv. estándar de retornos log, anualizada)
    const last20 = [];
    for (let j = Math.max(1, i - 19); j <= i; j++) last20.push(Math.log(prices[j] / prices[j - 1]));
    const vol20 = stdev(last20) * Math.sqrt(252) * 100;

    rows.push({
      fecha: dates[i],
      fecha_real: dates[i + 1],
      cierre_base: pT,
      p10,
      p90,
      cierre_real: prices[i + 1],
      k: K,
      k_cortes: kCuts,
      vol20,
      rw10,
      rw90,
    });

    if (pos % 250 === 0 || pos === evalIdx.length - 1) {
      console.log(`  ${pos + 1}/${evalIdx.length} cortes (${dates[i]}) K=${K} k_cortes=${kCuts}`);
    }
  }

  // ---------- Terciles de volatilidad de 20 días ----------
  const vols = rows.map(r => r.vol20).sort((a, b) => a - b);
  const q33 = vols[Math.floor(0.33 * (vols.length - 1))];
  const q67 = vols[Math.floor(0.67 * (vols.length - 1))];
  const tercil = r => (r.vol20 <= q33 ? 1 : r.vol20 <= q67 ? 2 : 3);
  for (const r of rows) r.tercil = tercil(r);

  // ---------- Agregados ----------
  const estable = rows.filter(r => r.k_cortes >= MIN_CAL_CUTS);
  const resumen = {
    asset: "USD/PEN",
    horizonte: "1 día hábil (siguiente cierre)",
    periodo: `${rows[0].fecha}–${rows[rows.length - 1].fecha}`,
    metodo: "FHS + EWMA(0.94), P50 = paseo aleatorio, K recalibrado con historia hasta cada corte",
    k_recalculo_dias_habiles: K_RECALC_EVERY,
    min_cortes_calibracion: MIN_CAL_CUTS,
    cortes: rows.length,
    cortes_estables: estable.length,
    k_por_ano: {},
  };

  console.log("\n=== MOTOR DIARIO FUERA DE MUESTRA (walk-forward) ===");
  const global = summarize(rows);
  const globalEstable = summarize(estable);
  console.log(`Global (${global.n} cortes): cobertura ${global.cobertura}%, ancho ${global.ancho_pct}% / ${global.ancho_soles} soles, Winkler ${global.winkler}`);
  console.log(`Estable (>=${MIN_CAL_CUTS} cortes, ${globalEstable.n}): cobertura ${globalEstable.cobertura}%, ancho ${globalEstable.ancho_pct}% / ${globalEstable.ancho_soles} soles, Winkler ${globalEstable.winkler}`);

  // Por año
  const porAnio = [];
  const anios = [...new Set(rows.map(r => r.fecha.slice(0, 4)))].sort();
  for (const a of anios) {
    const grp = rows.filter(r => r.fecha.startsWith(a));
    const fhs = summarize(grp);
    const rw = summarize(grp.map(r => ({ ...r, p10: r.rw10, p90: r.rw90 })));
    porAnio.push({ anio: a, ...fhs, rw_cobertura: rw.cobertura, rw_ancho_pct: rw.ancho_pct, rw_winkler: rw.winkler });
    resumen.k_por_ano[a] = { k_inicial: grp[0].k, k_final: grp[grp.length - 1].k };
  }

  // Por tercil de volatilidad
  const porTercil = [];
  for (const t of [1, 2, 3]) {
    const grp = rows.filter(r => r.tercil === t);
    const fhs = summarize(grp);
    const rw = summarize(grp.map(r => ({ ...r, p10: r.rw10, p90: r.rw90 })));
    porTercil.push({
      tercil: t,
      vol20_min: Number(Math.min(...grp.map(r => r.vol20)).toFixed(2)),
      vol20_max: Number(Math.max(...grp.map(r => r.vol20)).toFixed(2)),
      ...fhs,
      rw_cobertura: rw.cobertura,
      rw_ancho_pct: rw.ancho_pct,
      rw_winkler: rw.winkler,
    });
  }

  // Línea base de paseo aleatorio (global)
  const rwGlobal = summarize(rows.map(r => ({ ...r, p10: r.rw10, p90: r.rw90 })));
  const rwEstable = summarize(estable.map(r => ({ ...r, p10: r.rw10, p90: r.rw90 })));

  resumen.fhs = { global, estable: globalEstable, por_anio: porAnio, por_tercil: porTercil };
  resumen.paseo_aleatorio = { global: rwGlobal, estable: rwEstable };
  resumen.cortes_csv = CSV_PATH;

  // ---------- CSV (fuera de git) ----------
  fs.mkdirSync(CSV_DIR, { recursive: true });
  const csv = ["fecha,cierre_base,p10,p90,cierre_real"];
  for (const r of rows) {
    csv.push([
      r.fecha,
      r.cierre_base.toFixed(6),
      r.p10.toFixed(6),
      r.p90.toFixed(6),
      r.cierre_real.toFixed(6),
    ].join(","));
  }
  fs.writeFileSync(CSV_PATH, csv.join("\n") + "\n", "utf8");
  console.log(`\nCSV (fuera de git): ${CSV_PATH} (${rows.length} filas)`);

  // ---------- JSON + tabla (en git) ----------
  fs.writeFileSync(path.join(OUT_DIR, "resultados-diario-real.json"), JSON.stringify(resumen, null, 2) + "\n", "utf8");

  let md = "# Auditoría motor diario real — walk-forward fuera de muestra (1 día hábil)\n\n";
  md += `Período: ${resumen.periodo} · ${resumen.cortes} cortes · K recalibrado con historia hasta cada corte (cada ${K_RECALC_EVERY} días hábiles)\n\n`;
  md += "| Métrica | FHS+EWMA (K walk-forward) | Paseo aleatorio (q10-q90 de 250 retornos) |\n";
  md += "|---------|------------------------------|----------------------------------------------|\n";
  md += `| Cobertura 80% (global) | ${global.cobertura}% | ${rwGlobal.cobertura}% |\n`;
  md += `| Cobertura 80% (estable, ≥${MIN_CAL_CUTS} cortes) | ${globalEstable.cobertura}% | ${rwEstable.cobertura}% |\n`;
  md += `| Ancho medio | ${global.ancho_pct}% / ${global.ancho_soles} soles | ${rwGlobal.ancho_pct}% / ${rwGlobal.ancho_soles} soles |\n`;
  md += `| Winkler | ${global.winkler} | ${rwGlobal.winkler} |\n\n`;
  md += "## Por año\n\n";
  md += "| Año | Cortes | Cobertura FHS | Ancho FHS | Winkler FHS | Cobertura paseo aleatorio | Ancho paseo aleatorio | Winkler paseo aleatorio |\n";
  md += "|-----|--------|---------------|-----------|-------------|-------------------------|------------------------|--------------------------|\n";
  for (const r of porAnio) {
    md += `| ${r.anio} | ${r.n} | ${r.cobertura}% | ${r.ancho_pct}% / ${r.ancho_soles} soles | ${r.winkler} | ${r.rw_cobertura}% | ${r.rw_ancho_pct}% | ${r.rw_winkler} |\n`;
  }
  md += "\n## Por tercil de volatilidad de 20 días\n\n";
  md += "| Tercil | Vol. 20d anualizada | Cortes | Cobertura FHS | Ancho FHS | Winkler FHS | Cobertura paseo aleatorio | Ancho paseo aleatorio | Winkler paseo aleatorio |\n";
  md += "|--------|----------------------|--------|---------------|-----------|-------------|-------------------------|------------------------|--------------------------|\n";
  for (const r of porTercil) {
    md += `| ${r.tercil} | ${r.vol20_min}%–${r.vol20_max}% | ${r.n} | ${r.cobertura}% | ${r.ancho_pct}% / ${r.ancho_soles} soles | ${r.winkler} | ${r.rw_cobertura}% | ${r.rw_ancho_pct}% | ${r.rw_winkler} |\n`;
  }
  fs.writeFileSync(path.join(OUT_DIR, "tabla-diario-real.md"), md, "utf8");

  console.log("\n=== RESUMEN ===");
  console.log(JSON.stringify({ global, globalEstable, rwGlobal, rwEstable, por_anio: porAnio, por_tercil: porTercil }, null, 2));
}

main();
