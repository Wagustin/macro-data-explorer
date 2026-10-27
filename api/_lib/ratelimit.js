/**
 * PerData API Protection: CORS allowlist, CDN caching and in-memory rate limiting.
 * Zero external dependencies.
 */

import { decodeJwtClaims, extractToken } from "./session.js";

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(www\.)?perdata\.site$/i,
  /^https:\/\/[a-z0-9\-]+(\.[a-z0-9\-]+)*\.vercel\.app$/i,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/i
];

export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  return ALLOWED_ORIGIN_PATTERNS.some(pat => pat.test(origin));
}

/**
 * Applies strict CORS headers. Allows requests without Origin (curl, server-to-server, same-origin).
 * If Origin is present, matches against allowlist and sets Vary: Origin.
 */
export function applyCors(req, res, methods = "GET, POST, OPTIONS") {
  const origin = req.headers?.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    appendVary(res, "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function appendVary(res, headerName) {
  const current = res.getHeader?.("Vary") || "";
  if (!current) {
    res.setHeader("Vary", headerName);
  } else if (typeof current === "string" && !current.toLowerCase().includes(headerName.toLowerCase())) {
    res.setHeader("Vary", `${current}, ${headerName}`);
  }
}

/**
 * Sets CDN Cache-Control headers.
 * Public responses get s-maxage=600 and stale-while-revalidate=3600 with Vary: Origin.
 * Authenticated or user-dependent responses must NEVER have s-maxage (private, no-store).
 */
export function setCdnCache(res, hasAuth = false, maxAge = 600) {
  if (hasAuth) {
    res.setHeader("Cache-Control", "private, no-store");
  } else {
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=3600`);
    appendVary(res, "Origin");
  }
}

export function getClientIp(req) {
  const cfIp = req.headers?.["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string") {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

// In-memory per-IP buckets: `${ip}:${type}` -> { count, resetAt }
const buckets = new Map();
let lastCleanup = 0;

function cleanupExpiredBuckets(now) {
  if (now - lastCleanup < 60 * 1000) return;
  lastCleanup = now;
  for (const [key, b] of buckets.entries()) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Per-IP rate limiter (120 req/min anon, 300 req/min with a Bearer token).
 * If rate limit exceeded, handles response with HTTP 429 and returns true.
 * Otherwise returns false.
 */
export function handleRateLimit(req, res) {
  const ip = getClientIp(req);
  const authHeader = req.headers?.authorization;
  // La web solo autentica con "Authorization: Bearer <token>" (auth.js); no hay cookies de sesión,
  // así que una cookie no puede subir el límite (si no, cualquier scraper la falsificaría).
  const hasAuthHint = typeof authHeader === "string" && /^Bearer\s+\S{20,}$/.test(authHeader.trim());

  // 120 req/min for anonymous, 300 req/min with a Bearer token
  const limit = hasAuthHint ? 300 : 120; // 120: en Perú muchos móviles comparten IP (CGNAT)
  const now = Date.now();
  cleanupExpiredBuckets(now);
  const windowMs = 60 * 1000;

  const key = `${ip}:${hasAuthHint ? "auth" : "anon"}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > limit) {
    // If request had an auth hint and exceeded 300/min, verify session
    if (hasAuthHint) {
      const token = extractToken(req);
      const claims = token ? decodeJwtClaims(token) : null;
      if (!claims) {
        // Invalid session, reject immediately with 429
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({
          error: "Límite de peticiones excedido (sesión no válida). Intenta de nuevo en unos momentos.",
          retryAfter
        });
        return true;
      }
    }

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Demasiadas peticiones. Espera un momento y vuelve a intentarlo.",
      retryAfter
    });
    return true;
  }

  return false;
}
