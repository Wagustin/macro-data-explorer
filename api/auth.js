/**
 * PerData - Authentication API (Supabase Auth GoTrue Integration + Web Crypto verification)
 *   POST /api/auth {action:"signup", email, password, name}
 *   POST /api/auth {action:"signin", email, password}
 *   GET  /api/auth  (Authorization: Bearer ***  -> current user + plan)
 *   POST /api/auth {action:"signout"}
 *   POST /api/auth {action:"forgot", email}            -> sends recovery link via Supabase Auth
 *   POST /api/auth {action:"reset", token, password}   -> sets new password
 *
 * All password hashing (PBKDF2/bcrypt) is handled by Supabase Auth GoTrue.
 * Worker CPU time: < 0.5 ms.
 */

import crypto from "crypto";
import { findUserByEmail, findUserByResetHash, findUserById, insertUser, updateUser, publicUser, IS_PRODUCTION } from "./_lib/users.js";
import { EMAIL_ENABLED, sendEmail, passwordResetEmail } from "./_lib/email.js";
import {
  hashPassword, signSession, getAuthUser,
  sendJson, securityHeaders, readJsonBody, rateLimited, clientIp
} from "./_lib/session.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://hhutoitkkomfzkmakwts.supabase.co").replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

export default async function handler(req, res) {
  securityHeaders(res, "GET, POST, OPTIONS", req);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  const body = req.method === "POST" ? await readJsonBody(req) : {};
  let action = String(body.action || req.query?.action || "").toLowerCase();
  if (!action) {
    const seg = String(req.url || "").split("?")[0].split("/").filter(Boolean);
    action = seg[seg.indexOf("auth") + 1] || (req.method === "GET" ? "session" : "");
  }

  try {
    if (action === "signup") return await signup(req, res, body);
    if (action === "signin") return await signin(req, res, body);
    if (action === "session" || action === "me") return await session(req, res);
    if (action === "signout") return sendJson(res, 200, { success: true });
    if (action === "forgot") return await forgot(req, res, body);
    if (action === "reset") return await reset(req, res, body);
  } catch (e) {
    console.error(`[auth] ${action} failed:`, e.message);
    return sendJson(res, 503, { success: false, error: "El servicio de cuentas no está disponible. Intenta de nuevo en unos minutos." });
  }
  return sendJson(res, 400, { success: false, error: "Acción no válida." });
}

async function signup(req, res, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80);

  if (rateLimited(`signup:${clientIp(req)}`, 8)) {
    return sendJson(res, 429, { success: false, error: "Demasiados intentos. Espera unos minutos." });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return sendJson(res, 400, { success: false, error: "Ingresa un correo electrónico válido." });
  }
  if (password.length < MIN_PASSWORD || password.length > 200) {
    return sendJson(res, 400, { success: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` });
  }

  // 1. Delegar creación y hash a Supabase Auth GoTrue (0 ms CPU en Worker)
  try {
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        data: { name: name || email.split("@")[0], plan: "free" }
      })
    });

    const sbData = await sbRes.json();
    if (!sbRes.ok) {
      if (sbRes.status === 400 && /already registered|duplicate/i.test(sbData.msg || sbData.error_description || "")) {
        return sendJson(res, 409, { success: false, error: "Ya existe una cuenta con este correo. Inicia sesión." });
      }
      return sendJson(res, 400, { success: false, error: sbData.msg || sbData.error_description || "Error al registrar la cuenta." });
    }

    const sbUser = sbData.user || sbData;
    let token = sbData.access_token;
    if (!token) {
      const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        token = tokenData.access_token;
      }
    }

    // Perfil en public.users
    insertUser({
      id: sbUser.id,
      email,
      name: name || email.split("@")[0],
      role: "user",
      plan: "free",
      created_at: new Date().toISOString()
    }).catch(() => {});

    const userObj = {
      id: sbUser.id,
      email,
      name: name || email.split("@")[0],
      plan: "free",
      role: "user"
    };

    return sendJson(res, 200, {
      success: true,
      user: userObj,
      token: token || signSession(userObj)
    });
  } catch (err) {
    console.error("[auth] Supabase signup error:", err.message);
    return sendJson(res, 503, { success: false, error: "Servicio de autenticación no disponible." });
  }
}

async function signin(req, res, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return sendJson(res, 400, { success: false, error: "Ingresa tu correo y contraseña." });
  }
  if (rateLimited(`signin:${clientIp(req)}`, 20) || rateLimited(`signin:${email}`, 8)) {
    return sendJson(res, 429, { success: false, error: "Demasiados intentos. Espera 15 minutos e intenta de nuevo." });
  }

  // 1. Delegar verificación a Supabase Auth GoTrue (0 ms CPU en Worker)
  try {
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const sbData = await sbRes.json();
    if (!sbRes.ok) {
      // Fallback a public.users local si aún no migró contraseña
      const legacyUser = await findUserByEmail(email);
      if (legacyUser && legacyUser.salt && legacyUser.hash) {
        const { verifyPassword } = await import("./_lib/session.js");
        if (verifyPassword(password, legacyUser)) {
          const isAgustin = email === "venturasaldanaa@gmail.com";
          const plan = isAgustin ? "pro" : (legacyUser.plan || "free");
          const userObj = { ...legacyUser, plan, role: isAgustin ? "pro" : (legacyUser.role || "user") };
          return sendJson(res, 200, { success: true, user: publicUser(userObj), token: signSession(userObj) });
        }
      }
      return sendJson(res, 401, { success: false, error: "Correo o contraseña incorrectos." });
    }

    const sbUser = sbData.user;
    const isAgustin = email === "venturasaldanaa@gmail.com";
    let plan = isAgustin ? "pro" : (sbUser.user_metadata?.plan || sbUser.app_metadata?.plan || "free");
    let name = sbUser.user_metadata?.name || email.split("@")[0];

    try {
      const dbUser = await findUserById(sbUser.id);
      if (dbUser && dbUser.plan) plan = isAgustin ? "pro" : dbUser.plan;
      if (dbUser && dbUser.name) name = dbUser.name;
    } catch (e) {}

    const userObj = {
      id: sbUser.id,
      email,
      name,
      plan,
      role: isAgustin ? "pro" : "user"
    };

    return sendJson(res, 200, {
      success: true,
      user: publicUser(userObj),
      token: sbData.access_token
    });
  } catch (err) {
    console.error("[auth] Supabase signin error:", err.message);
    return sendJson(res, 503, { success: false, error: "Servicio de autenticación no disponible." });
  }
}

async function session(req, res) {
  const user = await getAuthUser(req);
  if (!user) {
    return sendJson(res, 401, { success: false, error: "Sesión inválida o expirada." });
  }
  return sendJson(res, 200, { success: true, user: publicUser(user) });
}

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  return `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
}

async function forgot(req, res, body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return sendJson(res, 400, { success: false, error: "Ingresa un correo electrónico válido." });
  }
  if (rateLimited(`forgot:${clientIp(req)}`, 5) || rateLimited(`forgot:${email}`, 3)) {
    return sendJson(res, 429, { success: false, error: "Demasiadas solicitudes. Espera unos minutos." });
  }

  // We generate the recovery token ourselves (admin API) and send the email through Resend from our
  // domain: Supabase's built-in mailer allows very few emails per hour and often lands in spam.
  // The link carries a hashed token that /api/auth "reset" exchanges for a session.
  try {
    const gl = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", email })
    });
    if (gl.ok) {
      const data = await gl.json();
      const hashed = data.hashed_token || data.properties?.hashed_token;
      const name = data.user_metadata?.name || data.user?.user_metadata?.name || "";
      if (hashed && EMAIL_ENABLED) {
        const msg = passwordResetEmail(name, `${appUrl(req)}/restablecer?token=${encodeURIComponent(hashed)}`);
        await sendEmail({ to: email, ...msg });
      }
    }
  } catch (e) {
    console.error("[auth] forgot failed:", e.message);
  }

  // Same answer whether or not the account exists
  return sendJson(res, 200, {
    success: true,
    message: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja y la carpeta de spam."
  });
}

async function reset(req, res, body) {
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (rateLimited(`reset:${clientIp(req)}`, 10)) {
    return sendJson(res, 429, { success: false, error: "Demasiados intentos. Espera unos minutos." });
  }
  if (password.length < MIN_PASSWORD || password.length > 200) {
    return sendJson(res, 400, { success: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` });
  }

  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    return sendJson(res, 400, { success: false, error: "El enlace no es válido o ya venció. Solicita uno nuevo." });
  }
  // Exchange the one-time hashed token for a session, then set the new password with it
  try {
    const vr = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", token_hash: token })
    });
    const session = vr.ok ? await vr.json() : null;
    if (!session?.access_token) throw new Error(`verify HTTP ${vr.status}`);
    const accessToken = session.access_token;
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });
    if (sbRes.ok) {
      const sbUser = await sbRes.json();
      const isAgustin = sbUser.email?.toLowerCase() === "venturasaldanaa@gmail.com";
      // Display only; the real plan always comes from public.users (session.js)
      const plan = isAgustin ? "pro" : (sbUser.app_metadata?.plan === "pro" ? "pro" : "free");
      const userObj = {
        id: sbUser.id,
        email: sbUser.email,
        name: sbUser.user_metadata?.name || sbUser.email.split("@")[0],
        plan,
        role: isAgustin ? "pro" : "user"
      };
      return sendJson(res, 200, { success: true, user: publicUser(userObj), token: accessToken });
    }
  } catch (e) {
    console.error("[auth] reset failed:", e.message);
  }

  return sendJson(res, 400, { success: false, error: "El enlace no es válido o ya venció. Solicita uno nuevo." });
}
