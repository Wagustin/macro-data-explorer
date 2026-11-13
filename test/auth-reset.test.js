import test from "node:test";
import assert from "node:assert/strict";

// Changing the password through reset records password_changed_at, so older sessions stop working.
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-key-test";

const handler = (await import("../api/auth.js")).default;

const originalFetch = globalThis.fetch;
const state = { iat: 0, patchStatus: 200, patches: [] };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function jwtWithIat(iat) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc({ sub: "user-9", iat })}.sig`;
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const body = init.body ? JSON.parse(init.body) : {};
  if (u.pathname === "/auth/v1/verify") {
    return json({ access_token: state.token || jwtWithIat(state.iat), user: { id: "user-9", email: "reset@ejemplo.com" } });
  }
  if (u.pathname === "/auth/v1/user") {
    return json({ id: "user-9", email: "reset@ejemplo.com", user_metadata: { name: "Reset" } });
  }
  if (u.pathname === "/rest/v1/users" && init.method === "PATCH") {
    state.patches.push({ query: u.search, body });
    return json(state.patchStatus === 200 ? [{ id: "user-9", ...body }] : { message: "down" }, state.patchStatus);
  }
  if (u.pathname === "/rest/v1/users") return json([]);
  return json({ msg: `unmocked ${u.pathname}` }, 404);
};

let ipSeq = 0;
function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(body) { this.body = body; }
  };
}
async function reset() {
  const res = response();
  await handler({ method: "POST", url: "/api/auth", headers: { host: "perdata.site", "cf-connecting-ip": `10.3.0.${++ipSeq}` },
    body: { action: "reset", token: "token-de-recuperacion-valido-1", password: "clave-nueva-reset-1" } }, res);
  return { status: res.statusCode, data: JSON.parse(res.body) };
}

test("reset records password_changed_at one second after the issue time of the token it returns", async () => {
  state.iat = 1_800_000_000;
  state.patches = [];
  state.patchStatus = 200;
  const r = await reset();
  assert.equal(r.status, 200);
  assert.equal(r.data.token, jwtWithIat(state.iat));
  assert.equal(state.patches.length, 1);
  assert.match(state.patches[0].query, /id=eq\.user-9/);
  assert.equal(state.patches[0].body.password_changed_at, new Date((state.iat + 1) * 1000).toISOString());
});

test("reset without a readable iat uses a time just before now", async () => {
  state.token = "opaque-token-without-claims";
  state.patches = [];
  const before = Date.now();
  const r = await reset();
  delete state.token;
  assert.equal(r.status, 200);
  const at = Date.parse(state.patches[0].body.password_changed_at);
  assert.ok(at >= before - 5000 - 50 && at <= Date.now() - 4000, "about 5 seconds before now");
});

test("a failed password_changed_at write does not break reset", async () => {
  state.iat = 1_800_000_100;
  state.patches = [];
  state.patchStatus = 500;
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const r = await reset();
    assert.equal(r.status, 200);
    assert.equal(r.data.success, true);
    assert.ok(errors.some(e => /could not record password change/.test(e)));
  } finally {
    console.error = originalError;
    state.patchStatus = 200;
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
