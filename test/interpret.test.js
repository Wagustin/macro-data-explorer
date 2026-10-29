import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/interpret.js";

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test("interpret reads a fresh daily note from D1", async () => {
  const note = "Nota diaria disponible desde D1.";
  const updated = new Date().toISOString();
  let requestedSql = "";
  globalThis.PERDATA_DB = {
    prepare(sql) {
      requestedSql = sql;
      return {
        bind(symbol) {
          assert.equal(symbol, "PEN=X");
          return { async all() { return { results: [{ texto: note, actualizado: updated }] }; } };
        },
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("GitHub should not be requested"); };

  try {
    const res = response();
    await handler({ method: "GET", query: { symbol: "PEN=X" }, headers: { "x-forwarded-for": "192.0.2.42" } }, res);
    assert.match(requestedSql, /select texto, actualizado from interpretaciones where symbol = \?/);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.aiNote, note);
    assert.equal(res.body.model, "perdata-v6+ai-note");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.PERDATA_DB;
  }
});

test("interpret returns structured text and up to three HTTPS citations from D1", async () => {
  const updated = new Date().toISOString();
  const payload = { texto: "La proyección central apunta al alza.", noticias: [
    { titulo: "Titular citado", fuente: "Fuente", fecha: updated, url: "https://example.com/news" },
    { titulo: "URL insegura", url: "http://example.com" },
    ...Array.from({ length: 4 }, (_, i) => ({ titulo: `Titular ${i}`, url: `https://example.com/${i}` })),
  ] };
  globalThis.PERDATA_DB = { prepare() { return { bind() { return { async all() { return { results: [{ texto: JSON.stringify(payload), actualizado: updated }] }; } }; } }; } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("GitHub should not be requested"); };
  try {
    const res = response();
    await handler({ method: "GET", query: { symbol: "PEN=X" }, headers: { "x-forwarded-for": "192.0.2.43" } }, res);
    assert.equal(res.body.aiNote, payload.texto);
    assert.equal(res.body.aiNews.length, 3);
    assert.ok(res.body.aiNews.every((item) => item.url.startsWith("https://")));
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.PERDATA_DB;
  }
});
