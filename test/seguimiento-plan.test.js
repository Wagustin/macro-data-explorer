import test from "node:test";
import assert from "node:assert/strict";

import { PLANS, canFollow, followLimit } from "../api/_lib/plans.js";
import handler from "../api/seguimiento.js";

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  };
}

test("follow entitlements match the plan limits", () => {
  assert.equal(canFollow(PLANS.free), false);
  assert.equal(followLimit(PLANS.free), 0);
  assert.equal(canFollow(PLANS.boletin), true);
  assert.equal(followLimit(PLANS.boletin), 15);
  assert.equal(canFollow(PLANS.pro), true);
  assert.equal(followLimit(PLANS.pro), 20);
});

test("seguimiento requires an authorization header", async () => {
  const res = response();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("plan seguimientoMax values", () => {
  assert.equal(PLANS.boletin.seguimientoMax, 15);
  assert.equal(PLANS.pro.seguimientoMax, 20);
});
