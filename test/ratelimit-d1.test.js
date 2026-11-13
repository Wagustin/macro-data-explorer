import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { rateLimited } from "../api/_lib/session.js";

const MIN = 60 * 1000;

// Minimal D1 double: one in-memory table that understands the statements used by rateLimited
function fakeD1(store = new Map()) {
  const run = (sql, args) => {
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.startsWith("DELETE")) {
      for (const [k, row] of store) if (row.start < args[0]) store.delete(k);
      return { success: true };
    }
    const [k, now, windowMs] = args;
    const row = store.get(k);
    if (!row || now - row.start > windowMs) store.set(k, { start: now, count: 1 });
    else row.count += 1;
    return { count: store.get(k).count };
  };
  return {
    store,
    prepare(sql) {
      return {
        run: async () => run(sql, []),
        bind: (...args) => ({
          first: async () => run(sql, args),
          run: async () => run(sql, args),
        }),
      };
    },
  };
}

test("sin D1 se usa el límite en memoria de siempre, con ventana", async () => {
  delete globalThis.PERDATA_DB;
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-04-01T10:00:00Z") });
  try {
    const key = "mem-test:ventana";
    for (let i = 0; i < 3; i++) assert.equal(await rateLimited(key, 3, 15 * MIN), false);
    assert.equal(await rateLimited(key, 3, 15 * MIN), true);
    mock.timers.tick(15 * MIN + 1);
    assert.equal(await rateLimited(key, 3, 15 * MIN), false);
  } finally {
    mock.timers.reset();
  }
});

test("con D1 el contador vive en la base y se comparte entre servidores", async () => {
  const d1 = fakeD1();
  globalThis.PERDATA_DB = d1;
  try {
    // Two fresh module instances simulate two Cloudflare servers with empty in-memory Maps
    const serverA = await import("../api/_lib/session.js?server=a");
    const serverB = await import("../api/_lib/session.js?server=b");
    const key = "d1-test:compartido@ejemplo.pe";
    assert.equal(await serverA.rateLimited(key, 2), false);
    assert.equal(await serverB.rateLimited(key, 2), false);
    // Third attempt, seen by the other server, is over the limit only if the count came from D1
    assert.equal(await serverB.rateLimited(key, 2), true);
    assert.equal(await serverA.rateLimited(key, 2), true);
    // The stored key is a SHA-256 hex, never the plain key
    const stored = [...d1.store.keys()];
    assert.equal(stored.length, 1);
    assert.match(stored[0], /^[0-9a-f]{64}$/);
    assert.ok(!stored[0].includes("ejemplo.pe"));
  } finally {
    delete globalThis.PERDATA_DB;
  }
});

test("si D1 lanza, cae al Map en memoria sin lanzar la petición", async () => {
  const broken = {
    prepare() {
      throw new Error("D1 caída");
    },
  };
  globalThis.PERDATA_DB = broken;
  const errors = mock.method(console, "error", () => {});
  try {
    const key = "d1-caida-test:clave";
    assert.equal(await rateLimited(key, 1), false);
    assert.equal(await rateLimited(key, 1), true);
    assert.equal(errors.mock.callCount(), 1);
  } finally {
    delete globalThis.PERDATA_DB;
    mock.restoreAll();
  }
});
