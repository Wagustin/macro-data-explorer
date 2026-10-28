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
      return {
        sql,
        bind(...values) {
          return {
            sql,
            values,
            async run() { writes.push([{ sql, values }]); return {}; },
          };
        },
      };
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

test("sync writes rows for every supported table and rejects unknown tables or over 500 rows", async () => {
  const db = database();
  globalThis.PERDATA_DB = db;
  const request = (body) => ({ method: "POST", headers: { authorization: `Bearer ${process.env.SYNC_SECRET}` }, body });

  const cases = [
    {
      table: "forecasts",
      row: { symbol: "BVN", horizon: 1, model: "test", path: [1, 2] },
      expectedValues: ["BVN", 1, "test", null, null, null, null, null, null, null, "[1,2]"],
    },
    {
      table: "cotizaciones_smv",
      row: { nemonico: "BVN", fecha: "2025-01-31", cierre: 10, fin_de_mes: true },
      expectedValues: ["BVN", "2025-01-31", 10, null, null, null, null, 1],
    },
    {
      table: "interpretaciones",
      row: { symbol: "BVN", texto: "Nota", actualizado: "2025-01-31T00:00:00.000Z" },
      expectedValues: ["BVN", "Nota", "2025-01-31T00:00:00.000Z"],
    },
  ];

  for (const { table, row, expectedValues } of cases) {
    const before = db.writes.length;
    const res = response();
    await handler(request({ table, rows: [row] }), res);
    assert.equal(res.statusCode, 200, table);
    assert.equal(JSON.parse(res.body).rows, 1, table);
    const statements = db.writes.slice(before).flat();
    const insert = statements.find((statement) => statement.sql.includes(`insert into ${table} `));
    assert.ok(insert, `${table} insert statement`);
    assert.deepEqual(insert.values, expectedValues, `${table} bound values`);
  }

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
