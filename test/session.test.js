import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.JWT_SECRET = "session-test-secret";
const { verifySession, isOwnerEmail, securityHeaders } = await import("../api/_lib/session.js");

function token(claims) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(content).digest("base64url");
  return `${content}.${signature}`;
}

test("verifySession rejects missing or expired exp and incorrect issuer or audience", async () => {
  const now = Math.floor(Date.now() / 1000);
  const common = { sub: "user-1", exp: now + 3600 };
  for (const claims of [
    { sub: "user-1" },
    { ...common, exp: now - 1 },
    { ...common, iss: "https://wrong.example/auth/v1", aud: "authenticated" },
    { ...common, iss: "https://hhutoitkkomfzkmakwts.supabase.co/auth/v1", aud: "wrong" },
  ]) {
    assert.equal(await verifySession(token(claims)), null);
  }
});

test("isOwnerEmail is false for other addresses and empty input", async () => {
  assert.equal(await isOwnerEmail("otro@ejemplo.com"), false);
  assert.equal(await isOwnerEmail(""), false);
  assert.equal(await isOwnerEmail(undefined), false);
});

test("securityHeaders echoes only the production site and local origins in CORS", () => {
  const allowedOrigin = (origin) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; } };
    securityHeaders(res, "GET, OPTIONS", { headers: { origin } });
    return res.headers["Access-Control-Allow-Origin"] ?? null;
  };
  for (const origin of ["https://perdata.site", "https://www.perdata.site", "http://localhost:3000", "http://127.0.0.1:8080"]) {
    assert.equal(allowedOrigin(origin), origin);
  }
  for (const origin of ["https://evil.vercel.app", "https://otro.workers.dev", "https://perdata.site.evil.com", "http://perdata.site"]) {
    assert.equal(allowedOrigin(origin), null);
  }
});

