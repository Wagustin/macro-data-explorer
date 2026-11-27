import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { backupStatus, decryptBackup, encryptBackup, runBackup } from "../api/_lib/backup.js";

const TEST_BACKUP_KEY = "test-backup-key-with-at-least-32-characters";
const EXPECTED_WORKER_TABLES = [
  "users",
  "boletin_suscriptores",
  "seguimiento",
  "trial_tarjetas",
  "alertas_enviadas",
  "etiquetas_noticias",
];

test("backup encryption round-trips with the configured backup key", async () => {
  const value = { fecha: "2026-10-28", tablas: { users: [{ id: 1 }] } };
  const encrypted = await encryptBackup(value, TEST_BACKUP_KEY);
  assert.deepEqual(await decryptBackup(encrypted, TEST_BACKUP_KEY), value);
  assert.equal(encrypted.includes("users@example.com"), false);
  await assert.rejects(decryptBackup(encrypted, "wrong-secret"));
  await assert.rejects(encryptBackup(value, "too-short"), /BACKUP_KEY/);
});

test("runBackup does not access R2 or Supabase without a valid backup key", async () => {
  let accesses = 0;
  const bucket = {
    async head() { accesses++; },
    async put() { accesses++; },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await runBackup({ BACKUPS: bucket, BACKUP_KEY: "short" });
    await runBackup({ BACKUPS: bucket });
    assert.equal(accesses, 0);
    assert.deepEqual(await backupStatus({ BACKUPS: bucket }), { error: "falta_BACKUP_KEY" });
    assert.deepEqual(await backupStatus({ BACKUPS: bucket, BACKUP_KEY: "short" }), { error: "falta_BACKUP_KEY" });
  } finally {
    console.error = originalError;
  }
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
    return new Response(JSON.stringify([{ table }]), { status: 200 });
  };
  try {
    const env = { BACKUPS: bucket, SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_KEY: "service-key", BACKUP_KEY: TEST_BACKUP_KEY };
    const now = new Date("2026-10-28T12:00:00Z");
    await runBackup(env, now);
    await runBackup(env, now);
    assert.equal(uploads, 1);
    assert.deepEqual(calls, EXPECTED_WORKER_TABLES);
    const stored = [...objects.values()][0].value;
    assert.equal(stored.includes("boletin_suscriptores"), false);
    assert.equal(stored.includes("trial_tarjetas"), false);
    assert.deepEqual(await decryptBackup(stored, env.BACKUP_KEY), {
      fecha: "2026-10-28",
      tablas: Object.fromEntries(EXPECTED_WORKER_TABLES.map((table) => [table, [{ table }]])),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runBackup tolerates missing tables but aborts on real Supabase errors", async () => {
  const objects = new Map();
  const bucket = {
    async head(key) { return objects.has(key) ? { key } : null; },
    async put(key, value) { objects.set(key, { key, value, size: value.length }); },
    async list() { return { objects: [], truncated: false }; },
    async delete() {},
  };
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async (url) => {
      const table = new URL(url).pathname.split("/").at(-1);
      if (table === "trial_tarjetas") return new Response(JSON.stringify({ code: "PGRST205" }), { status: 404 });
      if (table === "etiquetas_noticias") return new Response('relation "public.etiquetas_noticias" does not exist', { status: 400 });
      return new Response(JSON.stringify([{ table }]), { status: 200 });
    };
    const env = { BACKUPS: bucket, SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_KEY: "service-key", BACKUP_KEY: TEST_BACKUP_KEY };
    await runBackup(env, new Date("2026-10-29T12:00:00Z"));
    assert.equal(objects.size, 1);
    const decrypted = await decryptBackup([...objects.values()][0].value, env.BACKUP_KEY);
    assert.deepEqual(Object.keys(decrypted.tablas), [
      "users",
      "boletin_suscriptores",
      "seguimiento",
      "alertas_enviadas",
    ]);

    objects.clear();
    globalThis.fetch = async (url) => {
      const table = new URL(url).pathname.split("/").at(-1);
      if (table === "seguimiento") return new Response("boom", { status: 500 });
      return new Response(JSON.stringify([{ table }]), { status: 200 });
    };
    await runBackup(env, new Date("2026-10-30T12:00:00Z"));
    assert.equal(objects.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("scripts/backup.sh backs up user tables and tolerates missing tables", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-sh-"));
  const binDir = path.join(dir, "bin");
  const outEnc = path.join(dir, "uploaded.tar.gz.enc");
  fs.mkdirSync(binDir);

  fs.writeFileSync(path.join(binDir, "curl"), `#!/usr/bin/env bash
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output|-o) out="$2"; shift 2 ;;
    --write-out|-w|-H) shift 2 ;;
    --silent|--show-error|--fail) shift ;;
    *) url="$1"; shift ;;
  esac
done
table="\${url##*/rest/v1/}"
table="\${table%%\\?*}"
if [[ "$table" == "trial_tarjetas" ]]; then
  printf '{"code":"PGRST205"}' > "$out"
  printf '404'
  exit 0
fi
if [[ "$table" == "forecast_history" ]]; then
  printf 'relation "public.forecast_history" does not exist' > "$out"
  printf '400'
  exit 0
fi
if [[ "$table" == "\${FAIL_TABLE:-}" ]]; then
  printf 'server error' > "$out"
  printf '500'
  exit 0
fi
printf '[{"table":"%s"}]\n' "$table" > "$out"
printf '200'
`, { mode: 0o755 });

  fs.writeFileSync(path.join(binDir, "aws"), `#!/usr/bin/env bash
if [[ "$1" == "s3" && "$2" == "cp" ]]; then
  cp "$3" "$TEST_OUT_ENC"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  try {
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      SUPABASE_URL: "https://db.example",
      SUPABASE_SERVICE_KEY: "service-key",
      BACKUP_KEY: TEST_BACKUP_KEY,
      R2_ACCESS_KEY_ID: "id",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_ENDPOINT: "https://r2.example",
      TEST_OUT_ENC: outEnc,
    };
    const ok = spawnSync("bash", ["scripts/backup.sh"], { env, encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    const tarGz = path.join(dir, "backup.tar.gz");
    execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-in", outEnc, "-out", tarGz, "-pass", "env:BACKUP_KEY"], { env });
    const files = execFileSync("tar", ["-tzf", tarGz], { encoding: "utf8" }).trim().split("\n").sort();
    assert.deepEqual(files, [
      "alertas_enviadas.json",
      "boletin_suscriptores.json",
      "cotizaciones_smv.json",
      "etiquetas_noticias.json",
      "forecasts.json",
      "seguimiento.json",
      "sentimiento_diario.json",
      "users.json",
    ]);

    const fail = spawnSync("bash", ["scripts/backup.sh"], { env: { ...env, FAIL_TABLE: "seguimiento" }, encoding: "utf8" });
    assert.notEqual(fail.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
