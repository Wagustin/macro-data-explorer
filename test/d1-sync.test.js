import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { pruneD1, syncD1 } from "../scripts/d1-sync.js";
import { backfillD1 } from "../scripts/d1-backfill.js";

test("syncD1 and pruneD1 swallow errors by default so Supabase pipelines keep running", async () => {
  const prevSecret = process.env.SYNC_SECRET;
  const originalError = console.error;
  process.env.SYNC_SECRET = "secret-long-enough-for-test";
  console.error = () => {};
  try {
    const failingFetch = async () => new Response("boom", { status: 500 });
    const sent = await syncD1("forecasts", [{ symbol: "PEN=X" }], 200, { fetchImpl: failingFetch });
    assert.equal(sent, 0);
    await assert.doesNotReject(() => pruneD1("forecasts", { models: ["m"], before: "2026-11-20" }, { fetchImpl: failingFetch }));
  } finally {
    console.error = originalError;
    if (prevSecret === undefined) delete process.env.SYNC_SECRET;
    else process.env.SYNC_SECRET = prevSecret;
  }
});

test("syncD1 and pruneD1 reject when strict is true", async () => {
  const prevSecret = process.env.SYNC_SECRET;
  const originalError = console.error;
  process.env.SYNC_SECRET = "secret-long-enough-for-test";
  console.error = () => {};
  try {
    const failingFetch = async () => new Response("boom", { status: 500 });
    await assert.rejects(
      () => syncD1("cotizaciones_smv", [{ nemonico: "BAP" }], 500, { strict: true, fetchImpl: failingFetch }),
      /HTTP 500/,
    );
    await assert.rejects(
      () => pruneD1("forecasts", { models: ["m"], before: "2026-11-20" }, { strict: true, fetchImpl: failingFetch }),
      /HTTP 500/,
    );
    delete process.env.SYNC_SECRET;
    await assert.rejects(
      () => syncD1("cotizaciones_smv", [{ nemonico: "BAP" }], 500, { strict: true, fetchImpl: failingFetch }),
      /SYNC_SECRET/,
    );
  } finally {
    console.error = originalError;
    if (prevSecret === undefined) delete process.env.SYNC_SECRET;
    else process.env.SYNC_SECRET = prevSecret;
  }
});

test("backfillD1 rejects when D1 sync fails", async () => {
  const prevSecret = process.env.SYNC_SECRET;
  const originalError = console.error;
  const originalLog = console.log;
  process.env.SYNC_SECRET = "secret-long-enough-for-test";
  console.error = () => {};
  console.log = () => {};
  try {
    const fetchImpl = async (url) => {
      if (url.includes("/rest/v1/")) return new Response(JSON.stringify([{ nemonico: "BAP", fecha: "2026-11-20", cierre: 10 }]), { status: 200 });
      if (url.includes("/api/internal/sync")) return new Response("D1 down", { status: 503 });
      throw new Error(`Unexpected URL: ${url}`);
    };
    await assert.rejects(
      () => backfillD1({
        env: { SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_KEY: "service-key", SYNC_SECRET: process.env.SYNC_SECRET },
        fetchImpl,
      }),
      /HTTP 503/,
    );
  } finally {
    console.error = originalError;
    console.log = originalLog;
    if (prevSecret === undefined) delete process.env.SYNC_SECRET;
    else process.env.SYNC_SECRET = prevSecret;
  }
});

test("node scripts/d1-backfill.js exits non-zero when D1 sync returns HTTP 500", async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/rest/v1/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{ nemonico: "BAP", fecha: "2026-11-20", cierre: 10 }]));
      return;
    }
    res.writeHead(500);
    res.end("D1 error");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const code = await new Promise((resolve) => {
      const child = spawn("node", ["scripts/d1-backfill.js"], {
        env: { ...process.env, SUPABASE_URL: base, SUPABASE_SERVICE_KEY: "k", SYNC_SECRET: "secret-long-enough", APP_URL: base },
        stdio: "ignore",
      });
      child.on("close", resolve);
    });
    assert.notEqual(code, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
