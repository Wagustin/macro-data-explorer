import test from "node:test";
import assert from "node:assert/strict";
import { fetchPrecomputedForecast } from "../api/forecast.js";

test("fetchPrecomputedForecast tries a previous engine when the active model has no row", async () => {
  const originalDb = globalThis.PERDATA_DB;
  const path = [{ step: 1, date: "2026-11-01", p10: 90, p25: 95, p50: 100, p75: 105, p90: 110 }];
  globalThis.PERDATA_DB = {
    prepare() {
      return {
        bind(symbol, horizon, model) {
          return {
            async all() {
              return { results: model === "perdata-engine-v5" ? [{
                symbol, horizon, model, run_at: new Date().toISOString(), last_close: 100,
                p10: 90, p25: 95, p50: 100, p75: 105, p90: 110, path: JSON.stringify(path),
              }] : [] };
            },
          };
        },
      };
    },
  };

  try {
    const result = await fetchPrecomputedForecast("^TNX", 47);
    assert.equal(result.model, "perdata-engine-v5");
  } finally {
    if (originalDb === undefined) delete globalThis.PERDATA_DB;
    else globalThis.PERDATA_DB = originalDb;
  }
});
