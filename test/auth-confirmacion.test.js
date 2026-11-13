import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Sign-up with email on: the account waits for the confirmation link. Supabase and Resend are faked.
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-key-test";
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "PerData <no-reply@perdata.site>";
process.env.APP_URL = "https://perdata.site";

const handler = (await import("../api/auth.js")).default;

const originalFetch = globalThis.fetch;
const sb = { users: new Map(), tokens: new Map(), sent: [], passwordSets: [], resendFails: false, generateCalls: 0 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function findByEmail(email) {
  return [...sb.users.values()].find(u => u.email === email) || null;
}
function newUser(email, password, name, extra = {}) {
  const user = { id: crypto.randomUUID(), email, password, created_at: new Date().toISOString(), email_confirmed_at: null, user_metadata: { name }, ...extra };
  sb.users.set(user.id, user);
  return user;
}
function publicFields(user) {
  const out = { id: user.id, email: user.email, created_at: user.created_at, user_metadata: user.user_metadata };
  if ("email_confirmed_at" in user) out.email_confirmed_at = user.email_confirmed_at;
  return out;
}
function fakeJwt(sub) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc({ sub, iat: Math.floor(Date.now() / 1000) })}.sig`;
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : {};

  if (u.hostname === "api.resend.com") {
    if (sb.resendFails) return json({ message: "boom" }, 500);
    sb.sent.push(body);
    return json({ id: "email_1" });
  }
  if (u.pathname === "/rest/v1/users") {
    return json(method === "GET" ? [] : [body]);
  }
  if (u.pathname === "/auth/v1/admin/generate_link") {
    sb.generateCalls += 1;
    let user = findByEmail(body.email);
    if (user && user.email_confirmed_at) return json({ msg: "User already registered" }, 422);
    if (!user) user = newUser(body.email, body.password, body.data?.name);
    const hashed = crypto.randomBytes(24).toString("base64url");
    sb.tokens.set(hashed, user.id);
    return json({ ...publicFields(user), hashed_token: hashed });
  }
  if (u.pathname.startsWith("/auth/v1/admin/users/") && method === "PUT") {
    const user = sb.users.get(u.pathname.split("/").pop());
    if (!user) return json({ msg: "not found" }, 404);
    user.password = body.password;
    sb.passwordSets.push(user.id);
    return json(publicFields(user));
  }
  if (u.pathname === "/auth/v1/verify") {
    const id = sb.tokens.get(body.token_hash);
    if (!id || body.type !== "signup") return json({ msg: "Token has expired or is invalid" }, 403);
    sb.tokens.delete(body.token_hash);
    const user = sb.users.get(id);
    user.email_confirmed_at = new Date().toISOString();
    return json({ access_token: fakeJwt(user.id), token_type: "bearer", user: publicFields(user) });
  }
  if (u.pathname === "/auth/v1/token") {
    const user = findByEmail(body.email);
    if (!user || user.password !== body.password) return json({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
    if (user.email_confirmed_at === null) return json({ error_code: "email_not_confirmed", msg: "Email not confirmed" }, 400);
    return json({ access_token: fakeJwt(user.id), user: publicFields(user) });
  }
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
async function call(body) {
  const res = response();
  const req = { method: "POST", url: "/api/auth", headers: { host: "perdata.site", "cf-connecting-ip": `10.1.0.${++ipSeq}` }, body };
  await handler(req, res);
  return { status: res.statusCode, data: JSON.parse(res.body) };
}
function linkFromLastEmail() {
  const text = sb.sent.at(-1).text;
  return new URL(text.match(/https:\/\/\S+/)[0]);
}

test("signup with email on: no session, a confirmation email goes out, and sign-in is blocked until confirmed", async () => {
  const email = "nueva-cuenta@ejemplo.com";
  const r = await call({ action: "signup", email, password: "clave-segura-1", name: "Ana" });
  assert.equal(r.status, 200);
  assert.equal(r.data.pendingConfirmation, true);
  assert.equal(r.data.token, undefined);
  assert.equal(r.data.user, undefined);
  assert.match(r.data.message, /Te enviamos un correo/);
  assert.equal(sb.generateCalls, 1);
  assert.equal(sb.sent.length, 1);
  assert.deepEqual(sb.sent[0].to, [email]);
  assert.equal(sb.sent[0].subject, "Confirma tu correo de PerData");
  assert.equal(linkFromLastEmail().pathname, "/entrar");

  const s = await call({ action: "signin", email, password: "clave-segura-1" });
  assert.equal(s.status, 403);
  assert.equal(s.data.code, "email_not_confirmed");
  assert.equal(s.data.token, undefined);
});

test("confirm with the emailed token gives a session; the link works once", async () => {
  const email = "confirma-ok@ejemplo.com";
  await call({ action: "signup", email, password: "clave-segura-2", name: "Luis" });
  const token = linkFromLastEmail().searchParams.get("confirmar");
  const c = await call({ action: "confirm", token });
  assert.equal(c.status, 200);
  assert.equal(typeof c.data.token, "string");
  assert.equal(c.data.user.email, email);
  assert.equal(c.data.user.plan, "free");

  const again = await call({ action: "confirm", token });
  assert.equal(again.status, 400);
  assert.equal(again.data.token, undefined);

  const s = await call({ action: "signin", email, password: "clave-segura-2" });
  assert.equal(s.status, 200);
  assert.equal(typeof s.data.token, "string");
});

test("confirm rejects malformed and unknown tokens", async () => {
  const short = await call({ action: "confirm", token: "corto" });
  assert.equal(short.status, 400);
  const unknown = await call({ action: "confirm", token: "token-que-nadie-emitio-123456" });
  assert.equal(unknown.status, 400);
  assert.match(unknown.data.error, /ya venció/);
  assert.equal(unknown.data.token, undefined);
});

test("signup with an already confirmed email gives 409", async () => {
  const email = "ya-existe@ejemplo.com";
  await call({ action: "signup", email, password: "clave-segura-3", name: "Eva" });
  const token = linkFromLastEmail().searchParams.get("confirmar");
  await call({ action: "confirm", token });
  const r = await call({ action: "signup", email, password: "otra-clave-3", name: "Eva" });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "Ya existe una cuenta con este correo. Inicia sesión.");
});

test("failed confirmation email gives 502 and no session", async () => {
  sb.resendFails = true;
  try {
    const r = await call({ action: "signup", email: "sin-envio@ejemplo.com", password: "clave-segura-4", name: "Sin" });
    assert.equal(r.status, 502);
    assert.equal(r.data.token, undefined);
    assert.equal(r.data.pendingConfirmation, undefined);
    assert.match(r.data.error, /Inténtalo de nuevo/);
  } finally {
    sb.resendFails = false;
  }
});

test("unconfirmed account older than 30 minutes takes the newest password", async () => {
  const old = newUser("vieja-espera@ejemplo.com", "clave-vieja-1", "Vieja", {
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  });
  const r = await call({ action: "signup", email: old.email, password: "clave-nueva-1", name: "Vieja" });
  assert.equal(r.status, 200);
  assert.ok(sb.passwordSets.includes(old.id));
  assert.equal(old.password, "clave-nueva-1");
});

test("unconfirmed account younger than 30 minutes keeps its password", async () => {
  const fresh = newUser("reciente-espera@ejemplo.com", "clave-original-1", "Reciente");
  const r = await call({ action: "signup", email: fresh.email, password: "clave-intruso-1", name: "Reciente" });
  assert.equal(r.status, 200);
  assert.equal(r.data.pendingConfirmation, true);
  assert.ok(!sb.passwordSets.includes(fresh.id));
  assert.equal(fresh.password, "clave-original-1");
});

test("confirmed accounts sign in as before", async () => {
  const user = newUser("cuenta-antigua@ejemplo.com", "clave-antigua-1", "Antigua", { email_confirmed_at: "2026-01-10T10:00:00Z" });
  const r = await call({ action: "signin", email: user.email, password: "clave-antigua-1" });
  assert.equal(r.status, 200);
  assert.equal(typeof r.data.token, "string");
  assert.equal(r.data.user.email, user.email);
});

test("a sign-in response without the email_confirmed_at field is not blocked", async () => {
  const user = newUser("sin-campo@ejemplo.com", "clave-campo-1", "Campo", {});
  delete user.email_confirmed_at;
  const r = await call({ action: "signin", email: user.email, password: "clave-campo-1" });
  assert.equal(r.status, 200);
  assert.equal(typeof r.data.token, "string");
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
