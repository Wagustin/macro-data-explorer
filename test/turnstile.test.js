import test from "node:test";
import assert from "node:assert/strict";
import { turnstileOk } from "../api/_lib/turnstile.js";

const conEnv = async (vars, fn) => {
  const prev = { ...process.env };
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const k of Object.keys(vars)) if (!(k in prev)) delete process.env[k]; else process.env[k] = prev[k];
  }
};

test("turnstile: sin clave secreta no bloquea nada", async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
  assert.equal(await turnstileOk("", "1.1.1.1"), true);
});

test("turnstile: sin token se acepta mientras no se exija, y se rechaza al exigirlo", async () => {
  await conEnv({ TURNSTILE_SECRET_KEY: "x", TURNSTILE_ENFORCE: "0" }, async () => assert.equal(await turnstileOk(""), true));
  await conEnv({ TURNSTILE_SECRET_KEY: "x", TURNSTILE_ENFORCE: "1" }, async () => assert.equal(await turnstileOk(""), false));
});

test("turnstile: un token inválido se rechaza según la respuesta de Cloudflare", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }));
  try {
    await conEnv({ TURNSTILE_SECRET_KEY: "x" }, async () => assert.equal(await turnstileOk("malo"), false));
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true }));
    await conEnv({ TURNSTILE_SECRET_KEY: "x" }, async () => assert.equal(await turnstileOk("bueno"), true));
  } finally { globalThis.fetch = orig; }
});
