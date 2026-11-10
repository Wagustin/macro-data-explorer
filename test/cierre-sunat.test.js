import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parsearSunat,
  diaHabilAnterior,
  aplicarCierre,
  PERU_HOLIDAYS,
  referenciaMotor,
} from "../scripts/cierre-sunat.js";
import { generateDailyForecasts, addBusinessDays } from "../scripts/engine-daily.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("parsearSunat: formato válido devuelve objeto correcto", () => {
  const res = parsearSunat("10/11/2026|3.409|3.418|");
  assert.equal(res.fecha, "2026-11-10");
  assert.equal(res.compra, 3.409);
  assert.equal(res.venta, 3.418);
});

test("parsearSunat: formato inválido lanza error", () => {
  assert.throws(() => parsearSunat(""), { message: /texto_vacio/ });
  assert.throws(() => parsearSunat("10/11/2026|3.409|"), { message: /formato_invalido/ });
  assert.throws(() => parsearSunat("10-11-2026|3.409|3.418|"), { message: /fecha_invalida/ });
  assert.throws(() => parsearSunat("aa/bb/cccc|3.409|3.418|"), { message: /fecha_invalida/ });
  assert.throws(() => parsearSunat("10/11/2026|abc|3.418|"), { message: /valor_no_finito/ });
});

test("diaHabilAnterior: lunes -> viernes anterior", () => {
  // 2026-11-09 es lunes
  assert.equal(diaHabilAnterior("2026-11-09"), "2026-11-06");
});

test("diaHabilAnterior: salta feriado", () => {
  // 2026-07-28 es feriado (Fiestas Patrias), 2026-07-29 también
  // El día anterior a 2026-07-30 (jueves) debería ser 2026-07-27 (lunes)
  assert.equal(diaHabilAnterior("2026-07-30"), "2026-07-27");
  // El día anterior a 2026-07-28 (martes feriado) debería ser 2026-07-27 (lunes)
  assert.equal(diaHabilAnterior("2026-07-28"), "2026-07-27");
});

test("aplicarCierre: caso aplicado - serie termina 2026-11-06, punto 2026-11-10, hoy 2026-11-10", () => {
  const bcrp = {
    series: {
      PEN: {
        codigo: "PD04640PD",
        unidad: "S/ por US$",
        serie: [["2026-11-04", 3.41], ["2026-11-05", 3.412], ["2026-11-06", 3.415]],
      },
    },
  };
  const punto = { fecha: "2026-11-10", compra: 3.409, venta: 3.418 };
  const hoyLima = "2026-11-10";
  const res = aplicarCierre(bcrp, punto, hoyLima);
  assert.equal(res.aplicado, true);
  assert.equal(res.motivo, "aplicado");
  assert.equal(res.bcrp.series.PEN.serie.length, 4);
  assert.deepEqual(res.bcrp.series.PEN.serie[3], ["2026-11-09", 3.418]);
  assert.ok(res.bcrp.series.PEN.provisional);
  assert.equal(res.bcrp.series.PEN.provisional.fecha, "2026-11-09");
  assert.equal(res.bcrp.series.PEN.provisional.valor, 3.418);
  assert.equal(res.bcrp.series.PEN.provisional.fuente, "SUNAT");
  assert.equal(res.bcrp.series.PEN.provisional.publicado, "2026-11-10");
});

test("aplicarCierre: bcrp_ya_lo_tiene - y borra provisional si existía", () => {
  const bcrp = {
    series: {
      PEN: {
        codigo: "PD04640PD",
        unidad: "S/ por US$",
        serie: [["2026-11-04", 3.41], ["2026-11-05", 3.412], ["2026-11-06", 3.415], ["2026-11-09", 3.418]],
        provisional: { fecha: "2026-11-06", valor: 3.415, fuente: "SUNAT", url: "...", publicado: "2026-11-09" },
      },
    },
  };
  const punto = { fecha: "2026-11-10", compra: 3.409, venta: 3.418 };
  const hoyLima = "2026-11-10";
  const res = aplicarCierre(bcrp, punto, hoyLima);
  assert.equal(res.aplicado, false);
  assert.equal(res.motivo, "bcrp_ya_lo_tiene");
  assert.ok(!res.bcrp.series.PEN.provisional, "una marca de un día que ya no es el último se borra");
  assert.ok(bcrp.series.PEN.provisional, "no muta la entrada");
  // Segunda corrida de la misma madrugada: el último punto es el adelantado por SUNAT y su marca se queda.
  bcrp.series.PEN.provisional = { fecha: "2026-11-09", valor: 3.418, fuente: "SUNAT", url: "...", publicado: "2026-11-10" };
  const otra = aplicarCierre(bcrp, punto, hoyLima);
  assert.equal(otra.aplicado, false);
  assert.equal(otra.bcrp.series.PEN.provisional.fecha, "2026-11-09");
});

test("referenciaMotor: conserva la fecha de la corrida anterior mientras su mañana no haya pasado", () => {
  const daily = { referencia_lima: { hoy: "2026-11-09" } };
  assert.equal(referenciaMotor(daily, "2026-11-10"), "2026-11-09"); // martes de madrugada
  assert.equal(referenciaMotor({ referencia_lima: { hoy: "2026-11-06" } }, "2026-11-07"), "2026-11-06"); // sábado
  assert.equal(referenciaMotor(daily, "2026-11-11"), null); // la corrida anterior ya quedó vieja
  assert.equal(referenciaMotor({}, "2026-11-10"), null);
});

test("aplicarCierre: fecha_futura", () => {
  const bcrp = {
    series: {
      PEN: {
        codigo: "PD04640PD",
        unidad: "S/ por US$",
        serie: [["2026-11-04", 3.41], ["2026-11-05", 3.412], ["2026-11-06", 3.415]],
      },
    },
  };
  const punto = { fecha: "2026-11-11", compra: 3.409, venta: 3.418 };
  const hoyLima = "2026-11-10";
  const res = aplicarCierre(bcrp, punto, hoyLima);
  assert.equal(res.aplicado, false);
  assert.equal(res.motivo, "fecha_futura");
});

test("aplicarCierre: dato_viejo - P más de 4 días naturales anterior a hoyLima", () => {
  const bcrp = {
    series: {
      PEN: {
        codigo: "PD04640PD",
        unidad: "S/ por US$",
        serie: [["2026-11-04", 3.41], ["2026-11-05", 3.412], ["2026-11-06", 3.415]],
      },
    },
  };
  // Punto del 2026-11-10 -> P = 2026-11-09, hoyLima = 2026-11-15 (diff 6 días)
  const punto = { fecha: "2026-11-10", compra: 3.409, venta: 3.418 };
  const hoyLima = "2026-11-15";
  const res = aplicarCierre(bcrp, punto, hoyLima);
  assert.equal(res.aplicado, false);
  assert.equal(res.motivo, "dato_viejo");
});

test("aplicarCierre: valor_raro - venta difiere más de 3% del último valor", () => {
  const bcrp = {
    series: {
      PEN: {
        codigo: "PD04640PD",
        unidad: "S/ por US$",
        serie: [["2026-11-04", 3.41], ["2026-11-05", 3.412], ["2026-11-06", 3.415]],
      },
    },
  };
  // 3% de 3.415 = 0.10245, así que 3.52 es > 3%
  const punto = { fecha: "2026-11-10", compra: 3.409, venta: 3.52 };
  const hoyLima = "2026-11-10";
  const res = aplicarCierre(bcrp, punto, hoyLima);
  assert.equal(res.aplicado, false);
  assert.equal(res.motivo, "valor_raro");
});

test("aplicarCierre: no muta el objeto de entrada", () => {
  const bcrp = {
    series: {
      PEN: {
        codigo: "PD04640PD",
        unidad: "S/ por US$",
        serie: [["2026-11-04", 3.41], ["2026-11-05", 3.412], ["2026-11-06", 3.415]],
      },
    },
  };
  const bcrpOriginal = JSON.parse(JSON.stringify(bcrp));
  const punto = { fecha: "2026-11-10", compra: 3.409, venta: 3.418 };
  const hoyLima = "2026-11-10";
  aplicarCierre(bcrp, punto, hoyLima);
  assert.deepEqual(bcrp, bcrpOriginal);
});

test("generateDailyForecasts: con provisional en última fecha da fuente_ultimo_cierre: SUNAT", () => {
  const bcrpPath = path.join(ROOT, "data", "official", "bcrp-daily.json");
  const bcrp = JSON.parse(fs.readFileSync(bcrpPath, "utf8"));
  // Añadir provisional en la última fecha de la serie
  const lastDate = bcrp.series.PEN.serie[bcrp.series.PEN.serie.length - 1][0];
  bcrp.series.PEN.provisional = {
    fecha: lastDate,
    valor: bcrp.series.PEN.serie[bcrp.series.PEN.serie.length - 1][1],
    fuente: "SUNAT",
    url: "https://www.sunat.gob.pe/a/txt/tipoCambio.txt",
    publicado: lastDate,
  };
  const forecasts = generateDailyForecasts(bcrp, { todayInLima: "2026-11-10" });
  assert.equal(forecasts.simbolos.PEN.fuente_ultimo_cierre, "SUNAT");
});

test("generateDailyForecasts: sin provisional da fuente_ultimo_cierre: BCRP", () => {
  const bcrpPath = path.join(ROOT, "data", "official", "bcrp-daily.json");
  const bcrp = JSON.parse(fs.readFileSync(bcrpPath, "utf8"));
  // Asegurar que no hay provisional
  delete bcrp.series.PEN.provisional;
  const forecasts = generateDailyForecasts(bcrp, { todayInLima: "2026-11-10" });
  assert.equal(forecasts.simbolos.PEN.fuente_ultimo_cierre, "BCRP");
});