import test from "node:test";
import assert from "node:assert/strict";

process.env.SYNC_SECRET = "test-secret-that-is-long-enough-for-sync";
const { default: handler } = await import("../api/sync.js");

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  };
}

function database() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return { sql, bind(...values) { return { sql, values }; } };
    },
    async batch(statements) { writes.push(statements); return []; },
  };
}

test("sync hides missing and incorrect credentials", async () => {
  for (const authorization of [undefined, "Bearer wrong-secret-that-is-long-enough"]) {
    const res = response();
    await handler({ method: "POST", headers: { authorization }, body: { table: "forecasts", rows: [{}] } }, res);
    assert.equal(res.statusCode, 404);
  }
});

test("sync writes supported rows and rejects unknown tables or over 500 rows", async () => {
  const db = database();
  globalThis.PERDATA_DB = db;
  const request = (body) => ({ method: "POST", headers: { authorization: `Bearer ${process.env.SYNC_SECRET}` }, body });
  const ok = response();
  await handler(request({ table: "forecasts", rows: [{ symbol: "BVN", horizon: 1, model: "test" }] }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).rows, 1);
  assert.ok(db.writes.flat().some((statement) => statement.sql.includes("insert into forecasts")));

  for (const body of [
    { table: "users", rows: [{ id: 1 }] },
    { table: "forecasts", rows: Array.from({ length: 501 }, () => ({})) },
  ]) {
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400);
  }
  delete globalThis.PERDATA_DB;
});
