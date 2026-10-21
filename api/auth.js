/**
 * PerData - Authentication API
 *   POST /api/auth {action:"signup", email, password, name}
 *   POST /api/auth {action:"signin", email, password}
 *   GET  /api/auth  (Authorization: Bearer <token>)  -> current user + plan
 *   POST /api/auth {action:"signout"}
 *   POST /api/auth {action:"forgot", email}            -> emails a reset link
 *   POST /api/auth {action:"reset", token, password}   -> sets the password, returns a session
 */

import crypto from "crypto";
import { findUserByEmail, findUserByResetHash, insertUser, updateUser, publicUser, IS_PRODUCTION } from "./_lib/users.js";
import { EMAIL_ENABLED, sendEmail, passwordResetEmail } from "./_lib/email.js";
import {
  hashPassword, verifyPassword, signSession, getAuthUser,
  sendJson, securityHeaders, readJsonBody, rateLimited, clientIp
} from "./_lib/session.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

export default async function handler(req, res) {
  securityHeaders(res);
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
  if (await findUserByEmail(email)) {
    return sendJson(res, 409, { success: false, error: "Ya existe una cuenta con este correo. Inicia sesión." });
  }

  const { salt, hash, iterations } = hashPassword(password);
  const user = await insertUser({
    id: "usr_" + crypto.randomBytes(8).toString("hex"),
    email,
    name: name || email.split("@")[0],
    role: "user",
    salt,
    hash,
    iterations,
    created_at: new Date().toISOString()
  });
  return sendJson(res, 200, { success: true, user: publicUser(user), token: signSession(user) });
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

  const user = await findUserByEmail(email);
  // Same message for unknown email and wrong password so accounts can't be enumerated.
  if (!user || !verifyPassword(password, user)) {
    return sendJson(res, 401, { success: false, error: "Correo o contraseña incorrectos." });
  }
  return sendJson(res, 200, { success: true, user: publicUser(user), token: signSession(user) });
}

async function session(req, res) {
  const user = await getAuthUser(req);
  if (!user) {
    return sendJson(res, 401, { success: false, error: "Sesión inválida o expirada." });
  }
  return sendJson(res, 200, { success: true, user: publicUser(user) });
}

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  return `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
}

async function forgot(req, res, body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return sendJson(res, 400, { success: false, error: "Ingresa un correo electrónico válido." });
  }
  // Without an email provider in production there is no way to deliver the link; say so plainly.
  if (!EMAIL_ENABLED && IS_PRODUCTION) {
    return sendJson(res, 503, { success: false, error: "La recuperación por correo aún no está activa. Escríbenos desde el correo de tu cuenta y la restablecemos." });
  }
  if (rateLimited(`forgot:${clientIp(req)}`, 5) || rateLimited(`forgot:${email}`, 3)) {
    return sendJson(res, 429, { success: false, error: "Demasiadas solicitudes. Espera unos minutos." });
  }

  const user = await findUserByEmail(email);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await updateUser(user.id, {
      reset_token_hash: sha256(token),
      reset_expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString()
    });
    const link = `${appUrl(req)}/restablecer?token=${token}`;
    if (EMAIL_ENABLED) {
      await sendEmail({ to: user.email, ...passwordResetEmail(user.name, link) });
    } else {
      console.log(`[auth] (dev) enlace de restablecimiento para ${user.email}: ${link}`);
    }
  }
  // Same answer whether or not the account exists, so emails can't be enumerated.
  return sendJson(res, 200, { success: true, message: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja y la carpeta de spam." });
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
  const user = token.length >= 32 ? await findUserByResetHash(sha256(token)) : null;
  if (!user || !user.reset_expires_at || Date.parse(user.reset_expires_at) < Date.now()) {
    return sendJson(res, 400, { success: false, error: "El enlace no es válido o ya venció. Solicita uno nuevo." });
  }
  const { salt, hash, iterations } = hashPassword(password);
  const updated = await updateUser(user.id, {
    salt, hash, iterations,
    reset_token_hash: null,
    reset_expires_at: null,
    password_changed_at: new Date().toISOString()
  });
  const fresh = updated || user;
  return sendJson(res, 200, { success: true, user: publicUser(fresh), token: signSession(fresh) });
}
