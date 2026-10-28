const PREFIX = "backups/";
const TABLES = ["users", "boletin_suscriptores"];
const PAGE_SIZE = 1000;
const BACKUP_INFO = "perdata-backup-v2";
const MIN_BACKUP_KEY_LENGTH = 32;
const encoder = new TextEncoder();

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(secret, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(BACKUP_INFO) },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function encryptBackup(value, secret) {
  if (typeof secret !== "string" || secret.length < MIN_BACKUP_KEY_LENGTH) throw new Error("BACKUP_KEY must be at least 32 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 2, salt: base64(salt), iv: base64(iv), datos: base64(new Uint8Array(encrypted)) });
}

export async function fetchTable(env, table) {
  const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_KEY;
  if (!base || !key) throw new Error("Supabase backup credentials are unavailable");
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${base}/rest/v1/${table}?select=*`;
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + PAGE_SIZE - 1}`, Prefer: "count=none" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Supabase ${table}: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Supabase ${table}: invalid response`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function listAll(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
    objects.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  return objects;
}

export async function runBackup(env, now = new Date()) {
  try {
    if (typeof env?.BACKUP_KEY !== "string" || env.BACKUP_KEY.length < MIN_BACKUP_KEY_LENGTH) {
      console.error("Backup skipped: BACKUP_KEY is missing or too short");
      return;
    }
    const bucket = env?.BACKUPS;
    if (!bucket) throw new Error("R2 backup binding is unavailable");
    const date = now.toISOString().slice(0, 10);
    const key = `${PREFIX}${date}.json.enc`;
    if (await bucket.head(key)) return;
    const tablas = {};
    for (const table of TABLES) tablas[table] = await fetchTable(env, table);
    const encrypted = await encryptBackup({ fecha: date, tablas }, env.BACKUP_KEY);
    await bucket.put(key, encrypted, { httpMetadata: { contentType: "application/json" } });

    const cutoff = now.getTime() - 14 * 86400000;
    const expired = (await listAll(bucket, PREFIX)).filter((object) => {
      const match = object.key.match(/^backups\/(\d{4}-\d{2}-\d{2})\.json\.enc$/);
      return match && Date.parse(`${match[1]}T00:00:00Z`) < cutoff;
    }).map((object) => object.key);
    if (expired.length) await bucket.delete(expired);
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

export async function backupStatus(env) {
  try {
    if (typeof env?.BACKUP_KEY !== "string" || env.BACKUP_KEY.length < MIN_BACKUP_KEY_LENGTH) return { error: "falta_BACKUP_KEY" };
    const bucket = env?.BACKUPS || globalThis.PERDATA_BACKUPS;
    if (!bucket) return { error: "r2_unavailable" };
    const objects = await listAll(bucket, PREFIX);
    const latest = objects.filter((object) => /^backups\/\d{4}-\d{2}-\d{2}\.json\.enc$/.test(object.key))
      .sort((a, b) => b.key.localeCompare(a.key))[0];
    if (!latest) return { error: "backup_missing" };
    const fecha = latest.key.slice(PREFIX.length, PREFIX.length + 10);
    return { fecha, bytes: latest.size, edadHoras: Math.max(0, Math.round((Date.now() - Date.parse(`${fecha}T00:00:00Z`)) / 36000) / 100) };
  } catch {
    return { error: "backup_unavailable" };
  }
}

export async function decryptBackup(envelope, secret) {
  const parsed = typeof envelope === "string" ? JSON.parse(envelope) : envelope;
  if (parsed?.v !== 2 || typeof secret !== "string" || secret.length < MIN_BACKUP_KEY_LENGTH) throw new Error("Invalid backup envelope or missing/short BACKUP_KEY");
  const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const key = await encryptionKey(secret, fromBase64(parsed.salt));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(parsed.iv) }, key, fromBase64(parsed.datos));
  return JSON.parse(new TextDecoder().decode(plain));
}
