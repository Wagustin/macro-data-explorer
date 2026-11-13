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
// and are only written by billing code paths. Trial columns come from 0014;
// a deployment without that migration still reads the old column list.
const BASE_COLUMNS = ["id", "email", "name", "role", "salt", "hash", "iterations", "provider", "created_at"];
const USER_SELECT_COLUMNS = "id,email,name,role,salt,hash,iterations,provider,created_at,plan,stripe_customer_id,stripe_subscription_id,subscription_status,cancel_at_period_end,current_period_end,updated_at,reset_token_hash,reset_expires_at,password_changed_at";
const USER_SELECT_COLUMNS_TRIAL = `${USER_SELECT_COLUMNS},trial_usado,trial_hasta`;
// Migration 0015 (trial_interval). Tried first; if it is not applied yet the
// lookup falls back to the trial list above, so it never breaks user reads.
const USER_SELECT_COLUMNS_INTERVAL = `${USER_SELECT_COLUMNS_TRIAL},trial_interval`;

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
  }).catch((e) => {
    // Name the host so a paused/deleted Supabase project is obvious in the logs.
    throw new Error(`Supabase unreachable (${new URL(SUPABASE_URL).host}): ${e.cause?.code || e.message}`);
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  if (!res.ok) {
    throw new Error((json && json.message) || text.slice(0, 200) || `HTTP ${res.status}`);
  }
  return json;
}

let _memoryUsers = [];
function readLocal() {
  try {
    if (typeof fs?.readFileSync === "function") {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_PATH, "utf-8"));
      return Array.isArray(parsed) ? parsed : (parsed.users || []);
    }
  } catch (e) {
    return _memoryUsers;
  }
  return _memoryUsers;
}

function writeLocal(users) {
  _memoryUsers = users;
  try {
    if (typeof fs?.writeFileSync === "function") {
      fs.writeFileSync(LOCAL_PATH, JSON.stringify({ users }, null, 2), "utf-8");
    }
  } catch (e) {}
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
    // Prefer the trial columns (migration 0014); if the migration is not
    // applied yet the extended select fails and we fall back to the base list.
    let rows = await supabase("GET", `?${field}=eq.${encodeURIComponent(value)}&select=${USER_SELECT_COLUMNS_INTERVAL}&limit=1`).catch(() => null);
    if (!rows) rows = await supabase("GET", `?${field}=eq.${encodeURIComponent(value)}&select=${USER_SELECT_COLUMNS_TRIAL}&limit=1`).catch(() => null);
    if (!rows) rows = await supabase("GET", `?${field}=eq.${encodeURIComponent(value)}&select=${USER_SELECT_COLUMNS}&limit=1`).catch(() => ({}));
    if (!Array.isArray(rows)) return null;
    return rows.length ? rows[0] : null;
  }
  return readLocal().find(u => u[field] === value) || null;
}

// Reads only whether the user already used the 7-day trial. It throws when
// the column does not exist yet (migration 0014 not applied) so the caller
// can decide to offer no trial; findUserById above instead falls back silently.
export async function trialUsage(userId) {
  if (!userId) return null;
  assertStoreAvailable();
  if (USE_SUPABASE) {
    const rows = await supabase("GET", `?id=eq.${encodeURIComponent(userId)}&select=trial_usado,trial_hasta&limit=1`);
    if (!Array.isArray(rows) || !rows.length) return null;
    return { used: rows[0].trial_usado === true, until: rows[0].trial_hasta || null };
  }
  return null; // Local development never has the trial columns: no trial there either.
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
  const trialing = user.subscription_status === "trialing" && user.trial_hasta;
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email.split("@")[0],
    plan: user.plan === "pro" || user.plan === "boletin" ? user.plan : "free",
    subscriptionStatus: user.subscription_status || null,
    currentPeriodEnd: user.current_period_end || null,
    cancelAtPeriodEnd: !!user.cancel_at_period_end,
    hasBillingAccount: !!user.stripe_customer_id,
    trialUsed: user.trial_usado === true,
    trialUntil: trialing ? user.trial_hasta : null,
    trialInterval: trialing ? (user.trial_interval === "year" ? "year" : "month") : null,
    trialPrice: trialing ? { plan: user.plan === "boletin" ? "boletin" : "pro", monthly: user.plan === "boletin" ? "US$ 1.99" : null, yearly: user.plan === "boletin" ? "US$ 15" : null } : null
  };
}
