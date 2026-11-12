import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  empiricalQuantile,
  computeEWMAVolatility,
  computeEWMADrift,
  addBusinessDays,
  PERU_HOLIDAYS,
  runFHSBacktest,
  generateDailyForecasts,
  cargarCierres,
  prepararCierre,
  rangoConCierre,
  rangoTarde,
} from "../scripts/engine-daily.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Serie sintética determinista de 900 días hábiles hacia atrás desde el
// 28-jun-2019: un seno más una tendencia suave. No usa Math.random.
function serieSinteticaPEN(n = 900) {
  const fechas = [];
  const d = new Date("2019-06-28T00:00:00Z");
  while (fechas.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) fechas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  fechas.reverse();
  return fechas.map((f, i) => [
    f,
    Number((3.5 + 0.05 * Math.sin((2 * Math.PI * i) / 60) + 0.0002 * i).toFixed(4)),
  ]);
}

// Cierres sintéticos: precio × (1 + desviación determinista y pequeña).
function cierresSinteticos(serie) {
  return Object.fromEntries(
    serie.map(([f, p], i) => [
      f,
      Number((p * (1 + 0.001 * Math.sin((2 * Math.PI * i) / 30))).toFixed(6)),
    ]),
  );
}

test("empiricalQuantile calcula cuantiles correctos en array ordenado", () => {
  const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(empiricalQuantile(xs, 0.10), 20);
  assert.equal(empiricalQuantile(xs, 0.50), 60);
  assert.equal(empiricalQuantile(xs, 0.90), 100);
  assert.equal(empiricalQuantile([], 0.5), 0);
});

test("addBusinessDays salta fines de semana correctamente", () => {
  // Lunes a Martes (1 día)
  assert.equal(addBusinessDays("2026-11-02", 1), "2026-11-03");
  // Lunes a Lunes siguiente (5 días hábiles)
  assert.equal(addBusinessDays("2026-11-02", 5), "2026-11-09");
  // Viernes a Lunes (1 día hábil)
  assert.equal(addBusinessDays("2026-11-06", 1), "2026-11-09");
  // Viernes a Viernes siguiente (5 días hábiles)
  assert.equal(addBusinessDays("2026-11-06", 5), "2026-11-13");
});

test("fecha objetivo con feriado y fin de semana (ej. último cierre viernes 24-jul-2026)", () => {
  // Viernes 24-jul-2026:
  // Mañana (1 día hábil): Sábado 25 y Domingo 26 son fin de semana -> Lunes 27-jul-2026
  const manana = addBusinessDays("2026-07-24", 1);
  assert.equal(manana, "2026-07-27");

  // Semana (5 días hábiles):
  // 1: Lun 27-jul
  // Mar 28-jul: Feriado Fiestas Patrias (omitido)
  // Mié 29-jul: Feriado Fiestas Patrias (omitido)
  // 2: Jue 30-jul
  // 3: Vie 31-jul
  // Sáb 01-ago y Dom 02-ago: Fin de semana (omitidos)
  // 4: Lun 03-ago
  // 5: Mar 04-ago
  const semana = addBusinessDays("2026-07-24", 5);
  assert.equal(semana, "2026-08-04");

  // Verificar que la lista de feriados de Perú contiene las fechas clave
  assert.ok(PERU_HOLIDAYS.has("2026-07-28"), "28 de julio debe ser feriado");
  assert.ok(PERU_HOLIDAYS.has("2026-07-29"), "29 de julio debe ser feriado");
  assert.ok(PERU_HOLIDAYS.has("2026-08-06"), "6 de agosto debe ser feriado");
  assert.ok(PERU_HOLIDAYS.has("2026-12-08"), "8 de diciembre debe ser feriado");
  assert.ok(PERU_HOLIDAYS.has("2026-12-09"), "9 de diciembre debe ser feriado");
});

test("WTI excluye precios <= 0 y su backtest no produce ancho desmedido", () => {
  const bcrpPath = path.join(ROOT, "data", "official", "bcrp-daily.json");
  const bcrp = JSON.parse(fs.readFileSync(bcrpPath, "utf8"));
  const rawWti = bcrp.series.WTI.serie;

  // Confirmar que la serie cruda contiene la anomalía histórica de abr-2020 (-36.98)
  const nonPos = rawWti.filter(([d, p]) => p <= 0);
  assert.ok(nonPos.length > 0, "La serie de WTI sin procesar contiene observaciones <= 0");
  assert.equal(nonPos[0][0], "2020-04-20");
  assert.equal(nonPos[0][1], -36.98);

  // Ejecutar backtest con exclusión de precios <= 0 e inicio en 2020-07-01
  const bt1 = runFHSBacktest(rawWti, 1, { sym: "WTI", startDate: "2020-07-01" });
  const bt5 = runFHSBacktest(rawWti, 5, { sym: "WTI", startDate: "2020-07-01" });

  // Comprobar que el ancho medio porcentual es razonable y nunca 2993%
  assert.ok(bt1.ancho_medio_pct < 15, `WTI h=1 ancho medio debe ser < 15%, dio ${bt1.ancho_medio_pct}%`);
  assert.ok(bt5.ancho_medio_pct < 25, `WTI h=5 ancho medio debe ser < 25%, dio ${bt5.ancho_medio_pct}%`);
  assert.ok(bt1.ancho_medio_pct > 2, "WTI h=1 ancho medio debe ser positivo y realista");

  // Cobertura nominal controlada al 80%
  assert.ok(bt1.cobertura_80 >= 79 && bt1.cobertura_80 <= 81, "Cobertura 80% de WTI h=1 debe rondar el 80%");
  assert.ok(bt5.cobertura_80 >= 79 && bt5.cobertura_80 <= 81, "Cobertura 80% de WTI h=5 debe rondar el 80%");
});

test("computeEWMAVolatility reacciona a incrementos de volatilidad", () => {
  // Serie tranquila de 100 días
  const quietPrices = Array.from({ length: 100 }, (_, i) => 100 + (i % 2 === 0 ? 0.05 : -0.05));
  const quietRes = computeEWMAVolatility(quietPrices, 0.94);
  const quietVol = quietRes.sigma[quietRes.sigma.length - 1];

  // Serie con salto abrupto al final
  const shockPrices = [...quietPrices];
  shockPrices[98] = 110;
  shockPrices[99] = 90;
  const shockRes = computeEWMAVolatility(shockPrices, 0.94);
  const shockVol = shockRes.sigma[shockRes.sigma.length - 1];

  assert.ok(shockVol > quietVol * 5, "La volatilidad EWMA debe dispararse ante un shock");
});

test("FHS y calibración con serie sintética de 1000 días", () => {
  // Simular paseo aleatorio geométrico
  const n = 1500;
  const serie = [];
  let price = 100;
  const startDate = new Date(Date.UTC(2012, 0, 1));

  // Generador pseudo-aleatorio determinista LCG
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed / 4294967296) * 2 - 1; // [-1, 1]
  };

  for (let i = 0; i < n; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const ret = 0.005 * rnd();
    price = price * Math.exp(ret);
    serie.push([dateStr, Number(price.toFixed(4))]);
  }

  const bt1 = runFHSBacktest(serie, 1, { startDate: "2015-01-01" });
  const bt5 = runFHSBacktest(serie, 5, { startDate: "2015-01-01" });

  assert.ok(bt1.cuts > 200, "Debe haber cortes evaluados suficientes");
  assert.ok(bt1.K > 0, "Factor K debe ser positivo");
  assert.ok(bt5.K > 0, "Factor K debe ser positivo en h=5");
  // Cobertura nominal cercana a 80%
  assert.ok(bt1.cobertura_80 >= 78 && bt1.cobertura_80 <= 82, "Cobertura debe estar en torno al 80%");
});

test("daily-forecasts.json existe, tiene horizontes h1..h8, manana/semana y monotonicidad", () => {
  const filePath = path.join(ROOT, "data", "daily-forecasts.json");
  assert.ok(fs.existsSync(filePath), "data/daily-forecasts.json debe existir");

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(data.version, "PerData Engine diario v1");
  assert.ok(data.referencia_lima, "Debe incluir referencia horaria de Lima");
  assert.match(data.referencia_lima.hoy, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(data.referencia_lima.siguiente_dia_habil_manana, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(data.referencia_lima.quinto_dia_habil_semana, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(data.simbolos.PEN, "Debe incluir pronóstico de PEN");

  const expectedHorizons = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];

  for (const [sym, item] of Object.entries(data.simbolos)) {
    assert.ok(item.ultimo_cierre > 0, `Último cierre de ${sym} debe ser positivo`);

    // Comprobar presencia de manana y semana
    assert.ok(item.manana, `Debe existir manana en ${sym}`);
    assert.ok(item.semana, `Debe existir semana en ${sym}`);
    assert.match(item.manana.horizonte, /^h[1-8]$/);
    assert.match(item.semana.horizonte, /^h[1-8]$/);
    assert.equal(item.manana.fecha_objetivo, data.referencia_lima.siguiente_dia_habil_manana);
    assert.equal(item.semana.fecha_objetivo, data.referencia_lima.quinto_dia_habil_semana);

    // Monotonicidad en manana y semana
    assert.ok(item.manana.p10 <= item.manana.p25 && item.manana.p25 <= item.manana.p50);
    assert.ok(item.manana.p50 <= item.manana.p75 && item.manana.p75 <= item.manana.p90);
    assert.ok(item.semana.p10 <= item.semana.p25 && item.semana.p25 <= item.semana.p50);
    assert.ok(item.semana.p50 <= item.semana.p75 && item.semana.p75 <= item.semana.p90);

    for (const h of expectedHorizons) {
      const fc = item.pronosticos[h];
      assert.ok(fc, `Debe existir ${h} para ${sym}`);
      assert.ok(fc.p10 <= fc.p25, `p10 <= p25 en ${sym} ${h}`);
      assert.ok(fc.p25 <= fc.p50, `p25 <= p50 en ${sym} ${h}`);
      assert.ok(fc.p50 <= fc.p75, `p50 <= p75 en ${sym} ${h}`);
      assert.ok(fc.p75 <= fc.p90, `p75 <= p90 en ${sym} ${h}`);
      assert.ok(
        fc.backtest.cobertura_80_real >= 78 && fc.backtest.cobertura_80_real <= 82,
        `Cobertura 80% debe ser ~80% en ${sym} ${h} (dio ${fc.backtest.cobertura_80_real}%)`
      );
      assert.ok(
        fc.backtest.cobertura_80_fuera_muestra >= 65 && fc.backtest.cobertura_80_fuera_muestra <= 95,
        `Cobertura fuera de muestra debe estar en rango honesto en ${sym} ${h}`
      );
      assert.match(fc.fecha_objetivo, /^\d{4}-\d{2}-\d{2}$/, "Fecha objetivo debe tener formato YYYY-MM-DD");

      if (sym === "WTI") {
        assert.ok(
          fc.backtest.ancho_medio_pct < 30,
          `Ancho medio de WTI debe ser razonable, no 2993% (dio ${fc.backtest.ancho_medio_pct}%)`
        );
      }
    }
  }
});

test("cargarCierres elige la fuente del cierre de la 1:30 según el contexto y la prensa", () => {
  const ULT = "2019-06-28";
  const contexto = {
    series: {
      TC_CIERRE_VENTA: {
        serie: [
          ["2019-06-27", 3.4],
          [ULT, 3.5],
          ["2019-06-29", null],
          ["2019-06-30", -1],
        ],
      },
    },
  };

  // El BCRP ya publicó el cierre del último día: manda la fuente oficial.
  let cc = cargarCierres(contexto, null, ULT, 3.5);
  assert.equal(cc.fuente, "BCRP");
  assert.equal(cc.cierres[ULT], 3.5);
  assert.equal(cc.cierres["2019-06-27"], 3.4);

  // Sin el cierre del BCRP, se usa el dato provisional de la prensa.
  cc = cargarCierres(
    { series: { TC_CIERRE_VENTA: { serie: [["2019-06-27", 3.4]] } } },
    { provisional: { fecha: ULT, valor: 3.49 } },
    ULT,
    3.5,
  );
  assert.equal(cc.fuente, "prensa");
  assert.equal(cc.cierres[ULT], 3.49);

  // Un provisional de otra fecha no se usa.
  cc = cargarCierres(
    { series: { TC_CIERRE_VENTA: { serie: [["2019-06-27", 3.4]] } } },
    { provisional: { fecha: "2019-06-27", valor: 3.49 } },
    ULT,
    3.5,
  );
  assert.equal(cc.fuente, null);
  assert.equal(cc.cierres[ULT], undefined);

  // Un provisional a más de 3 % del último precio no se usa.
  cc = cargarCierres(
    { series: { TC_CIERRE_VENTA: { serie: [["2019-06-27", 3.4]] } } },
    { provisional: { fecha: ULT, valor: 3.7 } },
    ULT,
    3.5,
  );
  assert.equal(cc.fuente, null);
  assert.equal(cc.cierres[ULT], undefined);

  // Sin contexto no hay cierres.
  cc = cargarCierres(null, null, ULT, 3.5);
  assert.equal(cc.fuente, null);
  assert.equal(Object.keys(cc.cierres).length, 0);
});

test("rangoConCierre exige cierres y devuelve un rango monotónico", () => {
  const serie = serieSinteticaPEN();
  const cierres = cierresSinteticos(serie);

  // Sin cierres no hay rango.
  assert.equal(rangoConCierre(prepararCierre(serie, {}), serie.length - 1), null);

  // Con cierres el rango es monotónico y beta es finito.
  const r = rangoConCierre(prepararCierre(serie, cierres), serie.length - 1);
  assert.ok(r, "Con cierres suficientes debe devolver un rango");
  assert.ok(Number.isFinite(r.beta), "beta debe ser finito");
  assert.ok(r.q10 < r.q25 && r.q25 < r.q50 && r.q50 < r.q75 && r.q75 < r.q90, "Los cuantiles deben crecer");
});

test("rangoTarde no usa datos posteriores al corte ni al cierre del día siguiente", () => {
  const serie = serieSinteticaPEN();
  const cierres = cierresSinteticos(serie);
  const fechas = serie.map(p => p[0]);
  const c = 700;

  // Se alteran los SBS posteriores a c y los cierres posteriores a c + 1; el cierre de c + 1 se conserva.
  const alterada = serie.map(([f, p], i) => [f, i > c ? p * 1.5 : p]);
  const cierresAlterados = Object.fromEntries(
    Object.entries(cierres).map(([f, v]) => [f, f > fechas[c + 1] ? v * 1.5 : v]),
  );

  const original = rangoTarde(prepararCierre(serie, cierres), c);
  const conFuturo = rangoTarde(prepararCierre(alterada, cierresAlterados), c);
  assert.ok(original, "En el corte de prueba debe haber rango");
  assert.deepEqual(conFuturo, original);
});

test("rangoTarde devuelve cuantiles ordenados y null sin el cierre del día siguiente", () => {
  const serie = serieSinteticaPEN();
  const cierres = cierresSinteticos(serie);
  const fechas = serie.map(p => p[0]);

  for (const c of [500, 700, 850]) {
    const r = rangoTarde(prepararCierre(serie, cierres), c);
    assert.ok(r, `En el corte ${c} debe haber rango`);
    assert.ok(r.q10 <= r.q25 && r.q25 <= r.q50 && r.q50 <= r.q75 && r.q75 <= r.q90, "Los cuantiles deben estar ordenados");
  }

  // Sin cierres no hay rango.
  assert.equal(rangoTarde(prepararCierre(serie, {}), 700), null);

  // Sin el cierre del día siguiente al corte no hay rango.
  const sinSiguiente = { ...cierres };
  delete sinSiguiente[fechas[701]];
  assert.equal(rangoTarde(prepararCierre(serie, sinSiguiente), 700), null);
});

test("generateDailyForecasts afina el dólar a 1 día sólo con el cierre de la 1:30", () => {
  const serie = serieSinteticaPEN();
  const cierres = cierresSinteticos(serie);
  const bcrp = { series: { PEN: { codigo: "PEN", unidad: "S/", serie } } };
  const hoy = "2019-06-28";

  // Sin contexto ni cierre de prensa no hay refinamiento.
  const sin = generateDailyForecasts(bcrp, { todayInLima: hoy });
  assert.equal(sin.simbolos.PEN.pronosticos.h1.afinado, undefined);
  assert.equal(sin.simbolos.PEN.manana.afinado, undefined);

  // Con contexto BCRP y cierre provisional de prensa, el h1 queda afinado.
  const contexto = { series: { TC_CIERRE_VENTA: { serie: Object.entries(cierres) } } };
  const cierre1330 = { provisional: { fecha: hoy, valor: cierres[hoy] } };
  const con = generateDailyForecasts(bcrp, { todayInLima: hoy, contexto, cierre1330 });

  const h1 = con.simbolos.PEN.pronosticos.h1;
  assert.ok(h1.afinado, "h1 debe llevar la clave «afinado»");
  assert.equal(h1.afinado.metodo, "cierre_1330");
  assert.equal(h1.afinado.fecha, hoy);
  assert.equal(h1.afinado.cierre, cierres[hoy]);
  assert.equal(h1.afinado.fuente, "BCRP");
  assert.ok(h1.p10 < h1.p50 && h1.p50 < h1.p90, "El rango afinado debe mantener el orden de los percentiles");

  // El resto de horizontes no cambia.
  assert.deepEqual(con.simbolos.PEN.pronosticos.h2, sin.simbolos.PEN.pronosticos.h2);
  assert.deepEqual(con.simbolos.PEN.semana, sin.simbolos.PEN.semana);
});
