import test from "node:test";
import assert from "node:assert/strict";
import { bandFactor, blendEngine, engineWeight } from "../api/_lib/engine.js";
import params from "../api/_lib/engine-params.json" with { type: "json" };

function points(price, mode = "normal") {
  const out = Array.from({ length: 48 }, (_, i) => {
    const odd = (factor) => i % 3 === 0 ? 0 : i % 3 === 1 ? -price * factor : NaN;
    return {
      p10: mode === "odd" ? odd(0.7) : price * 0.7,
      p25: mode === "odd" ? odd(0.85) : price * 0.85,
      p50: price,
      p75: mode === "odd" ? odd(1.15) : price * 1.15,
      p90: mode === "odd" ? odd(1.3) : price * 1.3,
    };
  });
  out.last_close = price * 0.95;
  return out;
}

for (const price of [0.11, 5000]) {
  for (const mode of ["normal", "odd"]) {
    test(`blendEngine keeps ${price} ${mode} inputs positive, finite and monotone`, () => {
      const result = blendEngine(points(price), points(price * 1.1, mode), 48);
      assert.equal(result.length, 48);
      for (const row of result) {
        const values = [row.p10, row.p25, row.p50, row.p75, row.p90];
        assert.ok(values.every((value) => Number.isFinite(value) && value > 0));
        assert.deepEqual(values, [...values].sort((a, b) => a - b));
      }
    });
  }
}

test("engineWeight and bandFactor interpolate and stay flat after month 48", () => {
  assert.equal(engineWeight(1), 0.75);
  assert.equal(engineWeight(3.5), 0.775);
  assert.equal(engineWeight(48), 0.95);
  assert.equal(engineWeight(60), engineWeight(48));
  assert.equal(bandFactor(1), 0.94);
  assert.ok(Math.abs(bandFactor(2) - 1.055) < 1e-12);
  assert.equal(bandFactor(48), 1.72);
  assert.equal(bandFactor(60), bandFactor(48));
});

test("hybrid parameters have valid weights and monotone K80 within each source", () => {
  const entries = Object.entries(params.horizons);
  assert.equal(params.adoptar, true);
  assert.match(params.explicacion, /híbrido por plazo/);
  for (const [h, p] of entries) {
    assert.equal(p.fuente, Number(h) <= 24 ? "v6" : "v5");
    assert.ok(p.a >= 0 && p.b >= 0 && p.c >= 0 && p.a + p.b + p.c <= 1);
  }
  for (const source of ["v6", "v5"]) {
    const values = entries.filter(([, p]) => p.fuente === source).map(([, p]) => p.K80);
    assert.deepEqual(values, [...values].sort((a, b) => a - b));
  }
});

test("hybrid forecasts are positive and ordered for five symbols and fall back when TimesFM is absent", () => {
  for (const price of [0.11, 1.25, 27.4, 5000, 180000]) {
    const chronos = points(price), tfm = points(price * 1.08), own = points(price * 1.02);
    const withTfm = blendEngine(chronos, own, 48, { timesfmPath: tfm });
    const withoutTfm = blendEngine(chronos, own, 48, { timesfmPath: null });
    for (const rows of [withTfm, withoutTfm]) for (const row of rows) {
      const q = [row.p10, row.p25, row.p50, row.p75, row.p90];
      assert.ok(q.every((n) => Number.isFinite(n) && n > 0));
      assert.deepEqual(q, [...q].sort((a, b) => a - b));
    }
    assert.notEqual(withTfm[5].p50, withoutTfm[5].p50);
    // Missing TimesFM means its 25% share is absorbed by the last-close component.
    const expected = params.horizons["6"].a * chronos[5].p50 + params.horizons["6"].b * own[5].p50
      + (1 - params.horizons["6"].a - params.horizons["6"].b) * chronos.last_close;
    assert.equal(withoutTfm[5].p50, Number(expected.toFixed(expected < 10 ? 4 : 2)));
  }
});

test("v6 to v5 transition reaches the exact calibrated endpoints at months 24 and 36", () => {
  const result = blendEngine(points(100), points(105), 48, { timesfmPath: points(110) });
  assert.equal(result[23].p50, Number((0.1 * 100 + 0.6 * 110 + 0.3 * 95).toFixed(2)));
  assert.equal(result[35].p50, Number((engineWeight(36) * 100 + (1 - engineWeight(36)) * 105).toFixed(2)));
  assert.ok(Math.abs((result[34].p50 - result[33].p50) - (result[35].p50 - result[34].p50)) < 1e-8);
});
