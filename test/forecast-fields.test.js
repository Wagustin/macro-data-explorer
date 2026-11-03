import test from "node:test";
import assert from "node:assert/strict";
import { formatForecastPayload } from "../api/forecast.js";

test("formatForecastPayload reports honest dates, label and band volatility", () => {
  const path = [{ step: 1, date: "2026-11-01", p10: 3.3, p25: 3.35, p50: 3.4, p75: 3.45, p90: 3.5 }];
  const f = formatForecastPayload({ model: "perdata-engine-v6", last_close: 3.4, p10: 3.3, p50: 3.4, p90: 3.5, path }, "PEN=X", 1);
  assert.equal(f.horizonLabel, "1 mes");
  assert.equal(f.horizonDate, "2026-11-01");
  assert.equal(f.lastObservedDate, "2026-10-01");
  assert.ok(f.volatilityAnnualized > 7 && f.volatilityAnnualized < 9, String(f.volatilityAnnualized));
  assert.equal(formatForecastPayload({ ...f, forecastSeries: null, quantiles: null, path: [{ date: "2026-01-01", p50: 1 }] }, "X", 3).lastObservedDate, "2025-12-01");
});
