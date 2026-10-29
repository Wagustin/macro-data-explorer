import test from "node:test";
import assert from "node:assert/strict";
import { bandFactor, blendEngine, engineWeight } from "../api/_lib/engine.js";

function points(price, mode = "normal") {
  return Array.from({ length: 48 }, (_, i) => {
    const odd = (factor) => i % 3 === 0 ? 0 : i % 3 === 1 ? -price * factor : NaN;
    return {
      p10: mode === "odd" ? odd(0.7) : price * 0.7,
      p25: mode === "odd" ? odd(0.85) : price * 0.85,
      p50: price,
      p75: mode === "odd" ? odd(1.15) : price * 1.15,
      p90: mode === "odd" ? odd(1.3) : price * 1.3,
    };
  });
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
  assert.equal(bandFactor(1), 1.04);
  assert.ok(Math.abs(bandFactor(2) - 1.11) < 1e-12);
  assert.equal(bandFactor(48), 1.72);
  assert.equal(bandFactor(60), bandFactor(48));
});
