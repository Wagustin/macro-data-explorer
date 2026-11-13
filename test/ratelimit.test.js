import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../api/_lib/ratelimit.js";

test("isAllowedOrigin acepta perdata.site, www y localhost", () => {
  for (const origin of ["https://perdata.site", "https://www.perdata.site", "http://localhost:3000", "http://127.0.0.1:8080"]) {
    assert.equal(isAllowedOrigin(origin), true, origin);
  }
});

test("isAllowedOrigin rechaza dominios de Vercel y otros", () => {
  for (const origin of ["https://algo.vercel.app", "https://perdata.site.evil.com", "http://perdata.site", null, ""]) {
    assert.equal(isAllowedOrigin(origin), false, String(origin));
  }
});
