/**
 * PerData - Sessions, passwords and request helpers (native crypto, no deps).
 */

import crypto from "crypto";
import { findUserById, IS_PRODUCTION } from "./users.js";

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 210000;

// JWT_SECRET is preferred. Without it, production derives a stable secret from the
// Supabase service key (never shipped to browsers) instead of a public constant.
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.SUPABASE_SERVICE_KEY) {
    return crypto.createHmac("sha256", process.env.SUPABASE_SERVICE_KEY).update("perdata-session-v2").digest("hex");
  }
  if (IS_PRODUCTION) return null;
  return "perdata-local-dev-only-secret";
}
const JWT_SECRET = resolveSecret();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
  return { salt, hash, iterations: PBKDF2_ITERATIONS };
}

export function verifyPassword(password, user) {
  if (!user || !user.salt || !user.hash) return false;
  try {
    const test = crypto.pbkdf2Sync(password, user.salt, user.iterations || 100000, 64, "sha512");
    const stored = Buffer.from(user.hash, "hex");
    return test.length === stored.length && crypto.timingSafeEqual(test, stored);
  } catch (e) {
    return false;
  }
}

export function signSession(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado.");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, iat: now, exp: now + TOKEN_TTL_SECONDS })).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifySession(token) {
  if (!JWT_SECRET || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (!claims.sub || (claims.exp && claims.exp < Math.floor(Date.now() / 1000))) return null;
    return claims;
  } catch (e) {
    return null;
  }
}

export function extractToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/**
 * Resolves the signed-in user from the Authorization header, re-reading the store
 * so plan changes apply immediately. Throws if the store is unreachable, so callers
 * can tell "signed out" (null) from "try again" (error).
 */
export async function getAuthUser(req) {
  const claims = verifySession(extractToken(req));
  if (!claims) return null;
  const user = await findUserById(claims.sub);
  // Changing the password signs out every session issued before the change.
  if (user && user.password_changed_at && claims.iat * 1000 < Date.parse(user.password_changed_at) - 1000) return null;
  return user;
}

/** For data endpoints: a store outage degrades to anonymous access instead of failing the request. */
export async function getAuthUserOrNull(req) {
  try {
    return await getAuthUser(req);
  } catch (e) {
    console.warn("[session] user lookup failed:", e.message);
    return null;
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function securityHeaders(res, methods = "GET, POST, OPTIONS") {
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

/** Raw request body as a string; works with server.js (req.rawBody) and Vercel (stream). */
export async function readRawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  let data = "";
  for await (const chunk of req) data += chunk;
  req.rawBody = data;
  return data;
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  try { return JSON.parse(await readRawBody(req)); } catch (e) { return {}; }
}

// Best-effort brute-force throttle. Per instance only; Supabase/Vercel firewall
// rules are the durable layer, this just blunts scripted guessing.
const attempts = new Map();
export function rateLimited(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.start > windowMs) {
    attempts.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function clientIp(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) || req.socket?.remoteAddress || "unknown";
}
