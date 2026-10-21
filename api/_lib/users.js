/**
 * PerData - User store.
 * Production: Supabase Postgres via PostgREST with the service key (server only).
 * Local development (no Supabase env): a JSON file under the OS temp dir, never
 * inside the repo, so it can't be committed or served as a static file.
 */

import fs from "fs";
import path from "path";
import os from "os";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const TABLE = process.env.SUPABASE_USERS_TABLE || "users";
const LOCAL_PATH = process.env.PERDATA_LOCAL_USERS || path.join(os.tmpdir(), "perdata-dev-users.json");

export const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);
export const IS_PRODUCTION = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

// Columns every deployment has (migration 0001). Billing columns come from 0002
// and are only written by billing code paths.
const BASE_COLUMNS = ["id", "email", "name", "role", "salt", "hash", "iterations", "provider", "created_at"];

async function supabase(method, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  if (!res.ok) {
    throw new Error((json && json.message) || text.slice(0, 200) || `HTTP ${res.status}`);
  }
  return json;
}

function readLocal() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed : (parsed.users || []);
  } catch (e) {
    return [];
  }
}

function writeLocal(users) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify({ users }, null, 2), "utf-8");
}

function assertStoreAvailable() {
  if (!USE_SUPABASE && IS_PRODUCTION) {
    // Writing to the instance's temp dir in production silently loses accounts.
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY no configurados en producción.");
  }
}

async function findOne(field, value) {
  if (!value) return null;
  assertStoreAvailable();
  if (USE_SUPABASE) {
    const rows = await supabase("GET", `?${field}=eq.${encodeURIComponent(value)}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  return readLocal().find(u => u[field] === value) || null;
}

export const findUserByEmail = (email) => findOne("email", String(email || "").toLowerCase());
export const findUserById = (id) => findOne("id", id);
export const findUserByCustomerId = (customerId) => findOne("stripe_customer_id", customerId);
export const findUserByResetHash = (hash) => findOne("reset_token_hash", hash);

export async function insertUser(user) {
  assertStoreAvailable();
  const row = {};
  for (const col of BASE_COLUMNS) if (user[col] !== undefined) row[col] = user[col];
  if (USE_SUPABASE) {
    const rows = await supabase("POST", "", row);
    return Array.isArray(rows) && rows.length ? rows[0] : row;
  }
  const users = readLocal();
  if (users.some(u => u.email === row.email)) throw new Error("duplicate key");
  users.push({ plan: "free", ...row });
  writeLocal(users);
  return users[users.length - 1];
}

export async function updateUser(id, patch) {
  assertStoreAvailable();
  const data = { ...patch, updated_at: new Date().toISOString() };
  if (USE_SUPABASE) {
    const rows = await supabase("PATCH", `?id=eq.${encodeURIComponent(id)}`, data);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  const users = readLocal();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...data };
  writeLocal(users);
  return users[idx];
}

/** Fields safe to send to the browser. */
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email.split("@")[0],
    plan: user.plan === "pro" ? "pro" : "free",
    subscriptionStatus: user.subscription_status || null,
    currentPeriodEnd: user.current_period_end || null,
    cancelAtPeriodEnd: !!user.cancel_at_period_end,
    hasBillingAccount: !!user.stripe_customer_id
  };
}
