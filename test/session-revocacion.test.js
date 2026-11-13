import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.JWT_SECRET = "session-revocation-test-secret";
process.env.PERDATA_LOCAL_USERS = path.join(os.tmpdir(), `perdata-revocation-test-${process.pid}.json`);
const { getAuthUser, forgetCachedUser, _clearUserCache } = await import("../api/_lib/session.js");

function token(claims) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(content).digest("base64url");
  return `${content}.${signature}`;
}

function req(jwt) {
  return { headers: { authorization: `Bearer ${jwt}` } };
}

function writeUser(passwordChangedAt) {
  fs.writeFileSync(process.env.PERDATA_LOCAL_USERS, JSON.stringify([{
    id: "user-rev", email: "ana@example.com", name: "Ana", role: "user", plan: "free",
    password_changed_at: passwordChangedAt
  }]));
}

test("a token issued before a password change is rejected even from the profile cache", async () => {
  _clearUserCache();
  const now = Math.floor(Date.now() / 1000);
  const changedAt = new Date((now - 50) * 1000).toISOString();
  writeUser(changedAt);
  const exp = now + 3600;
  const oldToken = token({ sub: "user-rev", email: "ana@example.com", iat: now - 100, exp });
  const newToken = token({ sub: "user-rev", email: "ana@example.com", iat: now - 10, exp });

  // A session issued after the change fills the cache with the change date
  assert.ok(await getAuthUser(req(newToken)));
  // The old token must not get in through the cache
  assert.equal(await getAuthUser(req(oldToken)), null);
  assert.ok(await getAuthUser(req(newToken)));
});

test("forgetCachedUser makes the next lookup read the store again", async () => {
  _clearUserCache();
  const now = Math.floor(Date.now() / 1000);
  writeUser(null);
  const oldToken = token({ sub: "user-rev", email: "ana@example.com", iat: now - 100, exp: now + 3600 });
  assert.ok(await getAuthUser(req(oldToken)));

  writeUser(new Date((now - 50) * 1000).toISOString());
  forgetCachedUser("user-rev");
  assert.equal(await getAuthUser(req(oldToken)), null);
});

test.after(() => {
  fs.rmSync(process.env.PERDATA_LOCAL_USERS, { force: true });
});
