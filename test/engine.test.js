import test from "node:test";
import assert from "node:assert/strict";
import { K, blendEngine, interpK, w } from "../api/_lib/engine.js";
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

test("w por plazo y grupo", () => {
  // Lima (.LM): always 0
  for (const h of [1, 3, 6, 12, 24, 36, 48, 60]) {
    assert.equal(w(h, "BVN.LM"), 0);
    assert.equal(w(h, "CREDICORP.LM"), 0);
  }
  // Resto: min(1, h / 36)
  assert.equal(w(1, "SPY"), 1 / 36);
  assert.equal(w(18, "GLD"), 0.5);
  assert.equal(w(36, "USDPEN"), 1);
  assert.equal(w(48, "COPPER"), 1);
  assert.equal(w(60, "COPPER"), 1);
});

test("P50 = último cierre para .LM", () => {
  const price = 100;
  const lastClose = 95;
  const chronos = points(price);
  chronos.last_close = lastClose;
  const tfm = points(price * 1.2);
  const result = blendEngine(chronos, points(price), 48, { timesfmPath: tfm, symbol: "BAP.LM" });
  assert.ok(result);
  for (const row of result) {
    assert.equal(row.p50, lastClose);
  }
});

test("K no decreciente en ambas tablas y en interpolacion", () => {
  for (const group of ["lima", "resto"]) {
    const entries = Object.entries(params.K[group]).map(([h, val]) => [Number(h), val]);
    for (let i = 1; i < entries.length; i++) {
      assert.ok(entries[i][1] >= entries[i - 1][1], `${group} K at h=${entries[i][0]} should be >= h=${entries[i - 1][0]}`);
    }
  }
  // Check continuous interpolation from h=1 to h=48
  for (const sym of ["BAP.LM", "SPY"]) {
    let prev = K(1, sym);
    for (let h = 2; h <= 48; h++) {
      const cur = K(h, sym);
      assert.ok(cur >= prev, `K(${h}, ${sym}) should be >= K(${h - 1}, ${sym})`);
      prev = cur;
    }
    assert.equal(K(60, sym), K(48, sym));
  }
});

test("cuantiles ordenados, finitos y positivos con distintos precios y modos", () => {
  for (const price of [0.11, 1.25, 27.4, 5000, 180000]) {
    for (const mode of ["normal", "odd"]) {
      for (const symbol of ["BAP.LM", "SPY"]) {
        const chronos = points(price);
        const tfm = points(price * 1.1, mode);
        const result = blendEngine(chronos, points(price), 48, { timesfmPath: tfm, symbol });
        assert.ok(result && result.length === 48);
        for (const row of result) {
          const values = [row.p10, row.p25, row.p50, row.p75, row.p90];
          assert.ok(values.every((v) => Number.isFinite(v) && v > 0));
          for (let i = 1; i < values.length; i++) {
            assert.ok(values[i] >= values[i - 1], `Quantiles must be non-decreasing: ${values}`);
          }
        }
      }
    }
  }
});

test("caida a Chronos sin TimesFM", () => {
  const price = 50;
  const lastClose = 48;
  const chronos = points(price);
  chronos.last_close = lastClose;
  const withFallback = blendEngine(chronos, points(price), 48, { timesfmPath: null, symbol: "SPY" });
  assert.ok(withFallback && withFallback.length === 48);
  for (const row of withFallback) {
    // P50 adopts last close
    assert.equal(row.p50, lastClose);
    const q = [row.p10, row.p25, row.p50, row.p75, row.p90];
    assert.ok(q.every((n) => Number.isFinite(n) && n > 0));
    for (let i = 1; i < q.length; i++) {
      assert.ok(q[i] >= q[i - 1]);
    }
  }
});

test("sin ambos devuelve null", () => {
  assert.equal(blendEngine(null, points(100), 48, { timesfmPath: null, symbol: "SPY" }), null);
  assert.equal(blendEngine([], points(100), 48, { timesfmPath: [], symbol: "SPY" }), null);
  const badPoints = [{ p50: 0 }];
  assert.equal(blendEngine(badPoints, points(100), 1, { timesfmPath: badPoints, symbol: "SPY" }), null);
});
