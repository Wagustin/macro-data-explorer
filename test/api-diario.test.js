import test from "node:test";
import assert from "node:assert/strict";
import diarioHandler, { formatPreguntaObjetivo, formatFechaObjetivo } from "../api/diario.js";

function createMockReqRes({ url = "/api/diario?symbol=PEN", method = "GET", headers = {} } = {}) {
  const req = {
    url,
    method,
    headers,
    query: {}
  };
  try {
    const u = new URL(url, "http://localhost");
    req.query = Object.fromEntries(u.searchParams.entries());
  } catch {}

  const headersSent = {};
  let statusCode = 200;
  let body = null;

  const res = {
    statusCode,
    setHeader(k, v) {
      headersSent[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headersSent[k.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      body = data;
      this.ended = true;
      return this;
    },
    end(data) {
      if (data && !body) {
        try {
          body = JSON.parse(data);
        } catch {
          body = data;
        }
      }
      this.ended = true;
      return this;
    },
    get body() {
      return body;
    },
    get headersSent() {
      return headersSent;
    }
  };

  return { req, res };
}

test("GET /api/diario?symbol=PEN devuelve datos vigentes para el dólar", async () => {
  const { req, res } = createMockReqRes({ url: "/api/diario?symbol=PEN" });
  await diarioHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body, "Debe tener un cuerpo de respuesta");
  assert.equal(res.body.vigente, true);
  assert.equal(res.body.symbol, "PEN");
  assert.ok(typeof res.body.ultimo_cierre === "number");
  assert.ok(res.body.manana, "Debe incluir bloque manana");
  assert.ok(res.body.manana.p10 > 0);
  assert.ok(res.body.manana.p50 > 0);
  assert.ok(res.body.manana.p90 > 0);
  assert.ok(res.body.semana, "Debe incluir bloque semana");
  assert.ok(res.body.semana.p10 > 0);
  assert.ok(res.body.semana.p90 > 0);
  assert.ok(res.body.pregunta, "Debe incluir pregunta sincronizada");
});

test("formatPreguntaObjetivo genera preguntas según cercanía temporal", () => {
  assert.equal(formatPreguntaObjetivo("2026-11-04", "2026-11-04"), "¿A cuánto cerrará el dólar hoy?");
  assert.equal(formatPreguntaObjetivo("2026-11-05", "2026-11-04"), "¿A cuánto estará el dólar mañana?");
  assert.equal(formatPreguntaObjetivo("2026-11-09", "2026-11-06"), "¿A cuánto cerrará el dólar el lunes 9 nov?");
});

test("GET /api/diario con símbolo desconocido responde vigente: false", async () => {
  const { req, res } = createMockReqRes({ url: "/api/diario?symbol=NONEXISTENT" });
  await diarioHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vigente, false);
});

test("GET /api/diario maneja OPTIONS y CORS correctamente", async () => {
  const { req, res } = createMockReqRes({
    url: "/api/diario?symbol=PEN",
    method: "OPTIONS",
    headers: { origin: "https://perdata.site" }
  });
  await diarioHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headersSent["access-control-allow-origin"], "https://perdata.site");
});
