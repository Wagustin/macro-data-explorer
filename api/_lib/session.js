/**
 * PerData - Sessions, passwords and request helpers (Web Crypto API for Edge / Cloudflare Workers).
 * Verifies Supabase Auth tokens (ES256 ECDSA P-256) and legacy tokens (HS256) via crypto.subtle (< 0.3 ms CPU).
 */

import crypto from "crypto";
import { findUserById, IS_PRODUCTION } from "./users.js";

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 210000;

// Supabase project public JWK for ES256 JWT signature verification
const SUPABASE_JWK = {
  alg: "ES256",
  crv: "P-256",
  ext: true,
  key_ops: ["verify"],
  kid: "2b7699aa-f0d3-4058-959c-fedf36340489",
  kty: "EC",
  use: "sig",
  x: "MUmcsQd9flWVh-U_7GGqpTCAqRTLl1x8RqnLATIIjx8",
  y: "0OCHs6mV11zvG-42Oc4BEHlxj-UBKaIoCHWocrbKtvc"
};

let _ecdsaKey = null;
async function getEcdsaVerifyKey() {
  if (_ecdsaKey) return _ecdsaKey;
  try {
    _ecdsaKey = await crypto.subtle.importKey(
      "jwk",
      SUPABASE_JWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    return _ecdsaKey;
  } catch (err) {
    console.warn("[session] Failed to import static ECDSA key:", err.message);
    return null;
  }
}

// Fallback HMAC secret for local dev or HS256 tokens
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.SUPABASE_SERVICE_KEY) {
    return crypto.createHmac("sha256", process.env.SUPABASE_SERVICE_KEY).update("perdata-session-v2").digest("hex");
  }
  if (IS_PRODUCTION) return null;
  return "perdata-local-dev-only-secret";
}
const JWT_SECRET = resolveSecret();

let _hmacKey = null;
async function getHmacVerifyKey(secret) {
  if (_hmacKey) return _hmacKey;
  try {
    const keyData = new TextEncoder().encode(secret);
    _hmacKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["verify", "sign"]
    );
    return _hmacKey;
  } catch (err) {
    return null;
  }
}

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

/**
 * Fast synchronous claims decoding (without cryptographic verification).
 * Used for non-authoritative checks like rate limiting.
 */
export function decodeJwtClaims(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (!claims.sub || (claims.exp && claims.exp < Math.floor(Date.now() / 1000))) return null;
    return claims;
  } catch (e) {
    return null;
  }
}

/**
 * Verifies JWT signature using Web Crypto API.
 * Supports Supabase Auth ES256 (P-256 ECDSA) and legacy HS256 HMAC.
 * Execution CPU time: < 0.3 ms.
 */
export async function verifySession(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (!claims.sub || (claims.exp && claims.exp < now)) {
      return null;
    }

    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2], "base64url");

    // 1. Supabase Auth ES256 (ECDSA P-256 + SHA-256)
    if (header.alg === "ES256") {
      const key = await getEcdsaVerifyKey();
      if (!key) return null;
      const valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        key,
        sig,
        data
      );
      return valid ? claims : null;
    }

    // 2. Legacy HS256 (HMAC-SHA256)
    if (header.alg === "HS256" && JWT_SECRET) {
      const key = await getHmacVerifyKey(JWT_SECRET);
      if (key) {
        const valid = await crypto.subtle.verify("HMAC", key, sig, data);
        if (valid) return claims;
      }
      // Node fallback for tests
      const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
      if (sig.length === expected.length && crypto.timingSafeEqual(sig, expected)) {
        return claims;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

export function extractToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

// In-memory cache for user plan lookups (TTL 5 minutes)
const userProfileCache = new Map();
const USER_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves the signed-in user from the Authorization header using Web Crypto.
 * Ensures venturasaldanaa@gmail.com is permanently Pro.
 */
export async function getAuthUser(req) {
  const token = extractToken(req);
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  const email = String(claims.email || "").toLowerCase();
  const isAgustin = email === "venturasaldanaa@gmail.com";
  let plan = isAgustin ? "pro" : (claims.app_metadata?.plan || claims.user_metadata?.plan || "free");
  let name = claims.user_metadata?.name || (email ? email.split("@")[0] : "Usuario");

  // Check cache or store
  const cached = userProfileCache.get(claims.sub);
  if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
    return cached.user;
  }

  try {
    const dbUser = await findUserById(claims.sub);
    if (dbUser) {
      if (dbUser.password_changed_at && claims.iat * 1000 < Date.parse(dbUser.password_changed_at) - 1000) {
        return null;
      }
      if (dbUser.plan) plan = isAgustin ? "pro" : dbUser.plan;
      if (dbUser.name) name = dbUser.name;
    }
  } catch (e) {
    // If database lookup times out, continue with verified JWT claims
  }

  const user = {
    id: claims.sub,
    email,
    name,
    plan,
    role: isAgustin ? "pro" : (claims.role || "user")
  };

  userProfileCache.set(claims.sub, { user, cachedAt: Date.now() });
  return user;
}

/** For data endpoints: an auth error degrades to anonymous access instead of failing the request. */
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

export function securityHeaders(res, methods = "GET, POST, OPTIONS", req = null) {
  if (req) {
    const origin = req.headers?.origin;
    const allowed = [
      /^https:\/\/(www\.)?perdata\.site$/i,
      /^https:\/\/[a-z0-9\-]+(\.[a-z0-9\-]+)*\.vercel\.app$/i,
      /^https:\/\/[a-z0-9\-]+(\.[a-z0-9\-]+)*\.workers\.dev$/i,
      /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/i
    ];
    if (origin && allowed.some(pat => pat.test(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      const v = res.getHeader?.("Vary");
      res.setHeader("Vary", v ? `${v}, Origin` : "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

/** Raw request body as a string; works with server.js (req.rawBody) and Vercel/Cloudflare. */
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
