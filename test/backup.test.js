import test from "node:test";
import assert from "node:assert/strict";
import { decryptBackup, encryptBackup, runBackup } from "../api/_lib/backup.js";

test("backup encryption round-trips with the configured secret", async () => {
  const value = { fecha: "2026-10-28", tablas: { users: [{ id: 1 }] } };
  const encrypted = await encryptBackup(value, "test-jwt-secret");
  assert.deepEqual(await decryptBackup(encrypted, "test-jwt-secret"), value);
  assert.equal(encrypted.includes("users@example.com"), false);
  await assert.rejects(decryptBackup(encrypted, "wrong-secret"));
});

test("runBackup stores encrypted data once per UTC day", async () => {
  const objects = new Map();
  let uploads = 0;
  const bucket = {
    async head(key) { return objects.has(key) ? { key } : null; },
    async put(key, value) { uploads++; objects.set(key, { key, value, size: value.length }); },
    async list({ prefix }) { return { objects: [...objects.values()].filter((object) => object.key.startsWith(prefix)), truncated: false }; },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); },
  };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const table = new URL(url).pathname.split("/").at(-1);
    calls.push(table);
    return new Response(JSON.stringify(table === "users" ? [{ email: "private@example.com" }] : [{ email: "subscriber@example.com" }]), { status: 200 });
  };
  try {
    const env = { BACKUPS: bucket, SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_KEY: "service-key", JWT_SECRET: "test-jwt-secret" };
    const now = new Date("2026-10-28T12:00:00Z");
    await runBackup(env, now);
    await runBackup(env, now);
    assert.equal(uploads, 1);
    assert.deepEqual(calls, ["users", "boletin_suscriptores"]);
    const stored = [...objects.values()][0].value;
    assert.equal(stored.includes("private@example.com"), false);
    assert.equal(stored.includes("subscriber@example.com"), false);
    assert.deepEqual(await decryptBackup(stored, env.JWT_SECRET), {
      fecha: "2026-10-28",
      tablas: {
        users: [{ email: "private@example.com" }],
        boletin_suscriptores: [{ email: "subscriber@example.com" }],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
