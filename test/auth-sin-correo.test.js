import test from "node:test";
import assert from "node:assert/strict";

// With email off (no Resend), sign-up keeps the old behaviour: the account is confirmed at once.
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-key-test";

const handler = (await import("../api/auth.js")).default;
const { EMAIL_ENABLED } = await import("../api/_lib/email.js");

const originalFetch = globalThis.fetch;
const calls = [];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ path: u.pathname, body });
  if (u.pathname === "/rest/v1/users") return json([body]);
  if (u.pathname === "/auth/v1/admin/users") return json({ id: "user-1", email: body.email, user_metadata: body.user_metadata });
  if (u.pathname === "/auth/v1/token") return json({ access_token: "a.b.c", user: { id: "user-1", email: body.email } });
  return json({ msg: `unmocked ${u.pathname}` }, 404);
};

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(body) { this.body = body; }
  };
}

test("without Resend, sign-up creates a confirmed account and returns a session", async () => {
  assert.equal(EMAIL_ENABLED, false);
  const res = response();
  await handler({ method: "POST", url: "/api/auth", headers: { host: "perdata.site", "cf-connecting-ip": "10.2.0.1" },
    body: { action: "signup", email: "sin-correo@ejemplo.com", password: "clave-sin-correo-1", name: "Sin" } }, res);
  const data = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(data.token, "a.b.c");
  assert.equal(data.pendingConfirmation, undefined);
  const admin = calls.find(c => c.path === "/auth/v1/admin/users");
  assert.equal(admin.body.email_confirm, true);
  assert.equal(calls.some(c => c.path.includes("generate_link")), false);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
