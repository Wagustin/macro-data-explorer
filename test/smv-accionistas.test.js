import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { actualizarAccionistas } from "../scripts/fetch-smv-open.js";

const PREVIO = { actualizado: "2026-11-25T22:31:36.307Z", emisores: { "20100000001": { empresa: "PREVIA S.A.A.", accionistas: [] } } };

function tmpFile(contenido) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smv-acc-"));
  const file = path.join(dir, "smv-accionistas.json");
  if (contenido !== undefined) fs.writeFileSync(file, contenido);
  return file;
}

function respuestaValida(n = 150) {
  const Resultado = [];
  for (let i = 0; i < n; i++) {
    Resultado.push({
      RPJ: String(i), RUC: String(20100000000 + i), Empresa: `EMISOR ${i} S.A.A.`, Accionista: `ACCIONISTA ${i}`,
      Nacionalidad: "PERU", Fecha_Inicio: "05/12/2024", Porcentaje_Participacion: "10.5", Serie: "",
    });
  }
  return { ResponseCode: "0", Message: "Consulta generada", Resultado };
}

function fetchFalso(status, cuerpo) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof cuerpo === "string") return JSON.parse(cuerpo);
      return cuerpo;
    },
  });
}

async function conAvisos(fn) {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    return { result: await fn(), logs };
  } finally {
    console.log = original;
  }
}

test("404 de la SMV conserva los datos previos y avisa con warning", async () => {
  const out = tmpFile(JSON.stringify(PREVIO));
  const antes = fs.readFileSync(out, "utf8");
  const { result, logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(404, {}) }));
  assert.equal(result.actualizado, false);
  assert.equal(fs.readFileSync(out, "utf8"), antes);
  assert.ok(logs.includes(`::warning::Accionistas de la SMV no disponibles (HTTP 404); se mantienen los datos de ${PREVIO.actualizado}`));
});

test("410 y 5xx tambien conservan los datos", async () => {
  for (const status of [410, 503]) {
    const out = tmpFile(JSON.stringify(PREVIO));
    const antes = fs.readFileSync(out, "utf8");
    const { logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(status, {}) }));
    assert.equal(fs.readFileSync(out, "utf8"), antes);
    assert.ok(logs.some((l) => l.includes(`no disponibles (HTTP ${status})`)), `status ${status}`);
  }
});

test("error de red (sin respuesta) conserva los datos", async () => {
  const out = tmpFile(JSON.stringify(PREVIO));
  const antes = fs.readFileSync(out, "utf8");
  const red = async () => { throw new TypeError("fetch failed"); };
  const { result, logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: red }));
  assert.equal(result.actualizado, false);
  assert.equal(fs.readFileSync(out, "utf8"), antes);
  assert.ok(logs.some((l) => l.startsWith("::warning::Accionistas de la SMV no disponibles (HTTP sin respuesta)")));
});

test("JSON roto conserva los datos y no lanza", async () => {
  const out = tmpFile(JSON.stringify(PREVIO));
  const antes = fs.readFileSync(out, "utf8");
  const { result, logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(200, "{ esto no es json") }));
  assert.equal(result.actualizado, false);
  assert.equal(fs.readFileSync(out, "utf8"), antes);
  assert.ok(logs.some((l) => l.startsWith("::warning::Accionistas de la SMV no disponibles (HTTP 200, respuesta no interpretable")));
});

test("respuesta con formato inesperado (ResponseCode distinto de 0) conserva los datos", async () => {
  const out = tmpFile(JSON.stringify(PREVIO));
  const antes = fs.readFileSync(out, "utf8");
  const { result } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(200, { ResponseCode: "1", Resultado: [] }) }));
  assert.equal(result.actualizado, false);
  assert.equal(fs.readFileSync(out, "utf8"), antes);
});

test("menos de 150 emisores validos conserva los datos", async () => {
  const out = tmpFile(JSON.stringify(PREVIO));
  const antes = fs.readFileSync(out, "utf8");
  const { result, logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(200, respuestaValida(10)) }));
  assert.equal(result.actualizado, false);
  assert.equal(fs.readFileSync(out, "utf8"), antes);
  assert.ok(logs.some((l) => l.includes("solo 10 emisores válidos")));
});

test("sin archivo previo y fuente caida avisa sin crear archivo y no lanza", async () => {
  const out = tmpFile();
  const { result, logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(404, {}) }));
  assert.equal(result.actualizado, false);
  assert.equal(fs.existsSync(out), false);
  assert.ok(logs.some((l) => l.includes("se mantienen los datos de fecha desconocida")));
});

test("respuesta valida actualiza el archivo con el formato esperado", async () => {
  const out = tmpFile(JSON.stringify(PREVIO));
  const { result, logs } = await conAvisos(() => actualizarAccionistas({ out, fetchImpl: fetchFalso(200, respuestaValida(150)) }));
  assert.equal(result.actualizado, true);
  assert.ok(logs.includes("SMV: 150 emisores con accionistas guardados"));
  assert.ok(!logs.some((l) => l.startsWith("::warning::")));
  const guardado = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(guardado.fuente, "Superintendencia del Mercado de Valores (SMV), datos abiertos");
  assert.equal(guardado.licencia, "Open Data Commons Attribution License (ODC-BY 1.0)");
  assert.equal(guardado.url_licencia, "https://opendefinition.org/licenses/odc-by/");
  assert.match(guardado.url_conjunto, /^https:\/\/www\.datosabiertos\.gob\.pe\/dataset\//);
  assert.notEqual(guardado.actualizado, PREVIO.actualizado);
  assert.equal(Object.keys(guardado.emisores).length, 150);
  assert.deepEqual(guardado.emisores["20100000000"].accionistas[0], {
    nombre: "ACCIONISTA 0", nacionalidad: "PERU", desde: "2024-12-05", pct: 10.5,
  });
});
