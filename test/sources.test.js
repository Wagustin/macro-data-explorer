import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG } from "../api/search.js";
import historical, { monthlyPointsInRange } from "../api/historical.js";
import { DATASETS, SOURCES, monthlyPoints, sourcePoints } from "../api/_lib/sources.js";

test("each mapped source has official data and a catalog entry", () => {
  for (const [symbol, source] of Object.entries(SOURCES)) {
    assert.ok(CATALOG.some((asset) => asset.symbol === symbol), `${symbol} is searchable`);
    assert.ok(sourcePoints(symbol)?.length > 0, `${symbol} has observations`);
    assert.ok(DATASETS[source.fuente].series[source.clave], `${symbol} maps to its dataset series`);
    assert.ok(["ultimo", "media"].includes(source.mensual));
  }
});

test("daily monthly aggregation takes the final observation", () => {
  assert.deepEqual(monthlyPoints([["2026-01-02", 3], ["2026-01-30", 7], ["2026-02-02", 9]]), [
    ["2026-01", 7], ["2026-02", 9],
  ]);
});

test("monthly aggregation averages observations within each month", () => {
  assert.deepEqual(monthlyPoints([["2026-01-01", 3], ["2026-01-01", 5], ["2026-02-01", 8]], "media"), [
    ["2026-01", 4], ["2026-02", 8],
  ]);
});

test("production API and scripts no longer contain a market-provider endpoint", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const dir of ["api", "scripts"]) {
    const files = fs.readdirSync(path.join(root, dir), { recursive: true })
      .filter((file) => typeof file === "string" && file.endsWith(".js"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, dir, file), "utf8");
      assert.ok(!source.includes("finance.yahoo.com"), `${dir}/${file} has no market-provider URL`);
    }
  }
});

test("official monthly and daily histories carry their source attribution", async () => {
  for (const symbol of ["NG=F", "EURUSD=X"]) {
    let payload;
    const res = {
      setHeader() {},
      status() { return this; },
      json(value) { payload = value; return this; },
      end() { return this; },
    };
    await historical({ method: "GET", query: { symbol, range: "1y" }, headers: {} }, res);
    assert.ok(payload.series.length > 0, `${symbol} has a monthly series`);
    assert.ok(payload.dailySource.includes(symbol === "NG=F" ? "Banco Mundial" : "Reserva Federal"));
    if (symbol === "EURUSD=X") assert.ok(payload.daily.length > 0);
    else assert.equal("daily" in payload, false);
  }
});

test("one-year daily range includes a cutoff month that ends after the cutoff day", () => {
  const daily = [["2024-10-31", 3], ["2025-10-31", 7]];
  assert.deepEqual(monthlyPointsInRange(daily, "ultimo", "2025-10-28"), [["2025-10", 7]]);
});

test("history returns 404 for symbols without a legal source", async () => {
  let statusCode;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; },
  };
  await historical({ method: "GET", query: { symbol: "AAPL", range: "1y" }, headers: {} }, res);
  assert.equal(statusCode, 404);
  assert.equal(payload.error, "Activo no disponible.");
});
