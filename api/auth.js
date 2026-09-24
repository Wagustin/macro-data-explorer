/**
 * PerData - Serverless Institutional Authentication Backend
 * Built with native Node.js crypto (no external dependencies required).
 * Provides secure PBKDF2 password hashing with random salt, signed HS256 JWT sessions,
 * and resilient multi-tier persistence (Supabase Postgres -> data/users.json -> memory).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JWT Secret Key (Configurable via environment or institutional fallback)
const JWT_SECRET = process.env.JWT_SECRET || "mde_institutional_macro_secret_key_2026_jwt_token";
const TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days session validity

// Persistence file paths
const PRIMARY_DATA_PATH = path.join(__dirname, "../data/users.json");
const FALLBACK_DATA_PATH = path.join(os.tmpdir(), "mde_users.json");

// Supabase shared persistence (production mode)
// Set SUPABASE_URL + SUPABASE_SERVICE_KEY (service role, server-side only)
// or SUPABASE_ANON_KEY for environments without service access.
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_USERS_TABLE = process.env.SUPABASE_USERS_TABLE || "users";
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

// In-memory cache for fast lookups & read-only environment resilience
let inMemoryUsers = [];

/**
 * Supabase REST helper (PostgREST). No SDK required.
 */
async function supabaseRequest(method, path_, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path_}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  if (!res.ok) {
    const msg = (json && json.message) || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function supabaseFindUserByEmail(email) {
  const rows = await supabaseRequest("GET", `${SUPABASE_USERS_TABLE}?email=eq.${encodeURIComponent(email)}&select=*`);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function supabaseInsertUser(user) {
  const rows = await supabaseRequest("POST", SUPABASE_USERS_TABLE, user);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : user;
}

/**
 * Loads users from persistent store or fallbacks
 */
function loadUsers() {
  // 1. Primary data path: data/users.json
  try {
    if (fs.existsSync(PRIMARY_DATA_PATH)) {
      const content = fs.readFileSync(PRIMARY_DATA_PATH, "utf-8");
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.users) ? parsed.users : []);
      if (Array.isArray(list)) {
        inMemoryUsers = list;
        return inMemoryUsers;
      }
    }
  } catch (e) {
    console.warn("[Auth API] Warning reading primary users store:", e.message);
  }

  // 2. Fallback data path: /tmp/mde_users.json
  try {
    if (fs.existsSync(FALLBACK_DATA_PATH)) {
      const content = fs.readFileSync(FALLBACK_DATA_PATH, "utf-8");
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.users) ? parsed.users : []);
      if (Array.isArray(list)) {
        inMemoryUsers = list;
        return inMemoryUsers;
      }
    }
  } catch (e) {
    console.warn("[Auth API] Warning reading fallback users store:", e.message);
  }

  return inMemoryUsers;
}

/**
 * Persists users to disk and keeps in-memory state in sync
 */
function saveUsers(usersList) {
  inMemoryUsers = usersList;
  const payload = JSON.stringify({
    version: "1.0",
    updatedAt: new Date().toISOString(),
    count: usersList.length,
    users: usersList
  }, null, 2);

  let written = false;

  // 1. Try primary path
  try {
    const dir = path.dirname(PRIMARY_DATA_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PRIMARY_DATA_PATH, payload, "utf-8");
    written = true;
  } catch (e) {
    console.warn("[Auth API] Warning writing primary users store:", e.message);
  }

  // 2. Also mirror to fallback path
  try {
    fs.writeFileSync(FALLBACK_DATA_PATH, payload, "utf-8");
    written = true;
  } catch (e) {
    console.warn("[Auth API] Warning writing fallback users store:", e.message);
  }

  return written;
}

/**
 * Native PBKDF2 Password Hashing
 */
function hashPassword(password, salt) {
  const chosenSalt = salt || crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const keylen = 64;
  const digest = "sha512";
  const hash = crypto.pbkdf2Sync(password, chosenSalt, iterations, keylen, digest).toString("hex");
  return { salt: chosenSalt, hash, iterations };
}

/**
 * Timing-safe password verification
 */
function verifyPassword(password, salt, storedHash, iterations = 100000) {
  try {
    const keylen = 64;
    const digest = "sha512";
    const testHash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString("hex");
    const testBuf = Buffer.from(testHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (testBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(testBuf, storedBuf);
  } catch (e) {
    return false;
  }
}

/**
 * Base64URL string helpers
 */
function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf-8");
}

/**
 * Generates signed HS256 JWT session token
 */
function signJwt(payload, expiresInSeconds = TOKEN_EXPIRY_SECONDS) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies signed JWT token using timing-safe signature comparison
 */
function verifyJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Extracts session token from headers, body or query params
 */
function extractToken(req, body) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
    if (!authHeader.includes(" ")) return authHeader.trim();
  }
  if (body?.token && typeof body.token === "string") {
    return body.token.trim();
  }
  if (req.query?.token && typeof req.query.token === "string") {
    return req.query.token.trim();
  }
  return null;
}

/**
 * Unified response sender
 */
function sendJson(res, statusCode, data) {
  if (typeof res.status === "function") {
    const s = res.status(statusCode);
    if (s && typeof s.json === "function") {
      return s.json(data);
    }
  }
  if (typeof res.json === "function") {
    res.statusCode = statusCode;
    return res.json(data);
  }
  res.statusCode = statusCode;
  if (typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  if (typeof res.end === "function") {
    return res.end(JSON.stringify(data));
  }
}

/**
 * Main serverless request handler
 */
export default async function handler(req, res) {
  // CORS & Security Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Parse request body
  let body = {};
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        body = {};
      }
    } else if (typeof req.body === "object") {
      body = req.body;
    }
  } else if (req.method === "POST") {
    let bodyData = "";
    try {
      for await (const chunk of req) {
        bodyData += chunk;
      }
      body = JSON.parse(bodyData);
    } catch (e) {
      body = {};
    }
  } else {
    body = req.query || {};
  }

  // Determine requested action
  let action = (body.action || req.query?.action || "").toLowerCase().trim();
  if (!action) {
    try {
      const urlObj = new URL(req.url, "http://localhost");
      const segments = urlObj.pathname.split("/").filter(Boolean);
      const authIdx = segments.indexOf("auth");
      if (authIdx !== -1 && segments[authIdx + 1]) {
        action = segments[authIdx + 1].toLowerCase().trim();
      }
    } catch (e) {}
  }

  // Default GET requests without explicit action to 'session'
  if (!action && req.method === "GET") {
    action = "session";
  }

  // Make sure users list is loaded
  const users = loadUsers();

  // -------------------------------------------------------------
  // 1. ACTION: SIGNUP
  // -------------------------------------------------------------
  if (action === "signup") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || body.fullName || "").trim();

    if (!email || !email.includes("@") || email.length < 5) {
      return sendJson(res, 400, {
        success: false,
        error: "Ingresa un correo electrónico válido."
      });
    }

    if (!password || password.length < 6) {
      return sendJson(res, 400, {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres."
      });
    }

    // --- Supabase shared store (production) ---
    if (USE_SUPABASE) {
      try {
        const existing = await supabaseFindUserByEmail(email);
        if (existing) {
          return sendJson(res, 400, {
            success: false,
            error: "Esta cuenta ya está registrada. Por favor inicia sesión."
          });
        }
        const { salt, hash, iterations } = hashPassword(password);
        const displayName = name || email.split("@")[0];
        const newUser = {
          id: "usr_" + crypto.randomBytes(6).toString("hex"),
          email,
          name: displayName,
          role: "pro",
          salt,
          hash,
          iterations,
          created_at: new Date().toISOString()
        };
        const stored = await supabaseInsertUser(newUser);
        const safeUser = { id: stored.id, email: stored.email, name: stored.name, role: stored.role || "pro" };
        const token = signJwt(safeUser);
        return sendJson(res, 200, { success: true, user: safeUser, token });
      } catch (e) {
        console.warn("[Auth API] Supabase signup fallback to local:", e.message);
        // fall through to local file store
      }
    }

    // --- Local file store fallback ---
    // Check for duplicate email
    const duplicate = users.find(u => u.email.toLowerCase() === email);
    if (duplicate) {
      return sendJson(res, 400, {
        success: false,
        error: "Esta cuenta ya está registrada. Por favor inicia sesión."
      });
    }

    // Hash password with PBKDF2 and random salt
    const { salt, hash, iterations } = hashPassword(password);
    const displayName = name || email.split("@")[0];

    const newUser = {
      id: "usr_" + crypto.randomBytes(6).toString("hex"),
      email: email,
      name: displayName,
      role: "pro",
      salt,
      hash,
      iterations,
      created_at: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const safeUser = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role
    };

    const token = signJwt(safeUser);

    return sendJson(res, 200, {
      success: true,
      user: safeUser,
      token
    });
  }

  // -------------------------------------------------------------
  // 2. ACTION: SIGNIN
  // -------------------------------------------------------------
  if (action === "signin") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return sendJson(res, 400, {
        success: false,
        error: "Ingresa tu correo electrónico y contraseña."
      });
    }

    // --- Supabase shared store (production) ---
    if (USE_SUPABASE) {
      try {
        const user = await supabaseFindUserByEmail(email);
        if (user && verifyPassword(password, user.salt, user.hash, user.iterations || 100000)) {
          const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name || user.email.split("@")[0],
            role: user.role || "pro"
          };
          const token = signJwt(safeUser);
          return sendJson(res, 200, { success: true, user: safeUser, token });
        }
        // Not found in Supabase (or wrong password against Supabase copy):
        // fall through to the bundled local store so legacy accounts keep working.
      } catch (e) {
        console.warn("[Auth API] Supabase signin fallback to local:", e.message);
        // fall through to local file store
      }
    }

    // --- Local file store fallback ---
    const user = users.find(u => u.email.toLowerCase() === email);
    if (!user) {
      return sendJson(res, 400, {
        success: false,
        error: "No existe una cuenta registrada con este correo."
      });
    }

    const isMatch = verifyPassword(password, user.salt, user.hash, user.iterations);
    if (!isMatch) {
      return sendJson(res, 400, {
        success: false,
        error: "Contraseña incorrecta."
      });
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split("@")[0],
      role: user.role || "pro"
    };

    const token = signJwt(safeUser);

    return sendJson(res, 200, {
      success: true,
      user: safeUser,
      token
    });
  }

  // -------------------------------------------------------------
  // 3. ACTION: SESSION
  // -------------------------------------------------------------
  if (action === "session") {
    const token = extractToken(req, body);
    if (!token) {
      return sendJson(res, 401, {
        success: false,
        error: "Token de sesión no proporcionado."
      });
    }

    const payload = verifyJwt(token);
    if (!payload) {
      return sendJson(res, 401, {
        success: false,
        error: "Sesión inválida o expirada."
      });
    }

    // Refresh user profile details if available in store
    const user = users.find(u => u.id === payload.id || u.email === payload.email);
    const safeUser = {
      id: user ? user.id : payload.id,
      email: user ? user.email : payload.email,
      name: user ? user.name : (payload.name || payload.email.split("@")[0]),
      role: user ? (user.role || "pro") : (payload.role || "pro")
    };

    return sendJson(res, 200, {
      success: true,
      user: safeUser,
      token
    });
  }

  // -------------------------------------------------------------
  // 4. ACTION: SIGNOUT
  // -------------------------------------------------------------
  if (action === "signout") {
    return sendJson(res, 200, {
      success: true,
      message: "Sesión cerrada exitosamente."
    });
  }

  // -------------------------------------------------------------
  // 5. ACTION: SSO (Google / Apple / Facebook institutional federated login)
  // -------------------------------------------------------------
  if (action === "sso") {
    const provider = String(body.provider || "institucional").toLowerCase();
    const ssoEmail = String(body.email || `usuario@${provider}.institucional.pe`).trim().toLowerCase();
    const providerLabels = { google: "Google Workspace", apple: "Apple ID", facebook: "Meta Business" };
    const defaultName = `Usuario (${providerLabels[provider] || provider.toUpperCase()})`;
    const ssoName = String(body.name || defaultName).trim();

    let user = users.find(u => u.email.toLowerCase() === ssoEmail);
    if (!user) {
      const { salt, hash, iterations } = hashPassword(crypto.randomBytes(16).toString("hex"));
      user = {
        id: `sso_${provider}_` + crypto.randomBytes(4).toString("hex"),
        email: ssoEmail,
        name: ssoName,
        role: "pro",
        salt,
        hash,
        iterations,
        provider,
        created_at: new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || "pro"
    };

    const token = signJwt(safeUser);

    return sendJson(res, 200, {
      success: true,
      user: safeUser,
      token
    });
  }

  // Unknown action
  return sendJson(res, 400, {
    success: false,
    error: `Acción '${action || "desconocida"}' no es válida.`
  });
}
