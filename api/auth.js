/**
 * PerData - Authentication API (Supabase Auth GoTrue Integration + Web Crypto verification)
 *   POST /api/auth {action:"signup", email, password, name}
 *   POST /api/auth {action:"signin", email, password}
 *   GET  /api/auth  (Authorization: Bearer ***  -> current user + plan)
 *   POST /api/auth {action:"signout"}
 *   POST /api/auth {action:"forgot", email}            -> sends recovery link via Supabase Auth
 *   POST /api/auth {action:"reset", token, password}   -> sets new password
 *   POST /api/auth {action:"confirm", token}           -> exchanges a sign-up confirmation link for a session
 *   GET  /api/auth?action=providers                    -> {google: bool}, whether Google sign-in is on
 *   GET  /api/auth?action=google&next=/path            -> redirect to Google through Supabase Auth;
 *        Supabase sends the user back to /path with the session in the URL hash (auth.js reads it)
 *
 * All password hashing (PBKDF2/bcrypt) is handled by Supabase Auth GoTrue.
 * Worker CPU time: < 0.5 ms.
 */

import crypto from "crypto";
import { findUserByEmail, findUserByResetHash, findUserById, insertUser, updateUser, publicUser, IS_PRODUCTION } from "./_lib/users.js";
import { EMAIL_ENABLED, sendEmail, passwordResetEmail, confirmEmailEmail } from "./_lib/email.js";
import {
  hashPassword, signSession, getAuthUser, isOwnerEmail, forgetCachedUser,
  sendJson, securityHeaders, readJsonBody, rateLimited, clientIp
} from "./_lib/session.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://hhutoitkkomfzkmakwts.supabase.co").replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const NOT_CONFIRMED_ERROR = "Aún no confirmas tu correo. Abre el enlace que te enviamos (revisa spam). Si no te llegó, regístrate de nuevo con el mismo correo y te enviamos otro.";
const CONFIRM_SEND_ERROR = "No pudimos enviarte el correo de confirmación. Inténtalo de nuevo en unos minutos.";

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
    if (action === "confirm") return await confirm(req, res, body);
    if (action === "providers") return await providers(res);
    if (action === "google") return await google(req, res);
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

  if (await rateLimited(`signup:${clientIp(req)}`, 8)) {
    return sendJson(res, 429, { success: false, error: "Demasiados intentos. Espera unos minutos." });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return sendJson(res, 400, { success: false, error: "Ingresa un correo electrónico válido." });
  }
  if (password.length < MIN_PASSWORD || password.length > 200) {
    return sendJson(res, 400, { success: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` });
  }

  if (EMAIL_ENABLED) return signupWithConfirmation(req, res, { email, password, name });

  // 1. Create the account with the admin API, already confirmed: no email from Supabase's limited
  //    mailer, and the user gets a normal Supabase session right away (password grant below).
  try {
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || email.split("@")[0] }
      })
    });

    const sbData = await sbRes.json();
    if (!sbRes.ok) {
      if (sbRes.status === 422 || /already|registered|exists|duplicate/i.test(sbData.msg || sbData.message || sbData.error_description || "")) {
        return sendJson(res, 409, { success: false, error: "Ya existe una cuenta con este correo. Inicia sesión." });
      }
      return sendJson(res, 400, { success: false, error: "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo." });
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

    if (!token) {
      return sendJson(res, 200, { success: true, user: userObj, needsLogin: true, message: "Cuenta creada. Inicia sesión con tu correo y contraseña." });
    }
    return sendJson(res, 200, { success: true, user: userObj, token });
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
  if (await rateLimited(`signin:${clientIp(req)}`, 20) || await rateLimited(`signin:${email}`, 8)) {
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
      const notConfirmed = sbData.error_code === "email_not_confirmed" || /not confirmed/i.test(sbData.msg || sbData.message || sbData.error_description || "");
      if (notConfirmed) return sendJson(res, 403, { success: false, code: "email_not_confirmed", error: NOT_CONFIRMED_ERROR });
      // Accounts from before the move to Supabase Auth set a new password with "¿Olvidaste tu contraseña?"
      // (checking the old PBKDF2 hashes costs ~150 ms of CPU, far above the Worker's free limit)
      return sendJson(res, 401, { success: false, error: "Correo o contraseña incorrectos. Si tu cuenta es anterior al 26 de octubre de 2026, crea una contraseña nueva con «¿Olvidaste tu contraseña?»." });
    }

    const sbUser = sbData.user;
    // Only an explicit null/empty value blocks; a missing field (undefined) does not
    if (sbUser.email_confirmed_at === null || sbUser.email_confirmed_at === "") {
      return sendJson(res, 403, { success: false, code: "email_not_confirmed", error: NOT_CONFIRMED_ERROR });
    }
    const isOwner = await isOwnerEmail(email);
    // The plan comes from public.users; app_metadata only as a fallback (users can't write it)
    let plan = isOwner ? "pro" : (sbUser.app_metadata?.plan === "pro" ? "pro" : "free");
    let name = sbUser.user_metadata?.name || email.split("@")[0];

    try {
      const dbUser = (await findUserById(sbUser.id)) || (await findUserByEmail(email));
      if (dbUser && dbUser.plan) plan = isOwner ? "pro" : dbUser.plan;
      if (dbUser && dbUser.name) name = dbUser.name;
    } catch (e) {}

    const userObj = {
      id: sbUser.id,
      email,
      name,
      plan,
      role: isOwner ? "pro" : "user"
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

let providersCache = null; // { at, google }
async function googleEnabled() {
  if (!providersCache || Date.now() - providersCache.at > 10 * 60 * 1000) {
    let google = false;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_SERVICE_KEY }, signal: AbortSignal.timeout(3000) });
      google = r.ok && !!(await r.json()).external?.google;
    } catch (e) {}
    providersCache = { at: Date.now(), google };
  }
  return providersCache.google;
}

async function providers(res) {
  return sendJson(res, 200, { success: true, google: await googleEnabled() });
}

async function google(req, res) {
  // Only same-site paths, so the redirect can't be used to send people elsewhere
  const raw = String(req.query?.next || "/");
  const next = /^\/(?![\/\\])[\w\-./?=&%]*$/.test(raw) ? raw : "/";
  if (!(await googleEnabled())) {
    res.statusCode = 302;
    res.setHeader("Location", `${next}#error=google_disabled`);
    return res.end();
  }
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(appUrl(req) + next)}`;
  res.statusCode = 302;
  res.setHeader("Location", url);
  return res.end();
}

async function forgot(req, res, body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return sendJson(res, 400, { success: false, error: "Ingresa un correo electrónico válido." });
  }
  if (await rateLimited(`forgot:${clientIp(req)}`, 5) || await rateLimited(`forgot:${email}`, 3)) {
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
  if (await rateLimited(`reset:${clientIp(req)}`, 10)) {
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
      // Sessions issued before now stop working (session.js compares each token's iat with this date).
      // The token returned below was issued just before this date, so it keeps working.
      const issuedMs = tokenIssuedAtMs(accessToken);
      const changedAt = new Date(issuedMs ? issuedMs + 1000 : Date.now() - 5000).toISOString();
      try {
        await updateUser(sbUser.id, { password_changed_at: changedAt });
      } catch (e) {
        console.error("[auth] could not record password change:", e.message);
      }
      forgetCachedUser(sbUser.id);
      const isOwner = await isOwnerEmail(sbUser.email);
      // Display only; the real plan always comes from public.users (session.js)
      const plan = isOwner ? "pro" : (sbUser.app_metadata?.plan === "pro" ? "pro" : "free");
      const userObj = {
        id: sbUser.id,
        email: sbUser.email,
        name: sbUser.user_metadata?.name || sbUser.email.split("@")[0],
        plan,
        role: isOwner ? "pro" : "user"
      };
      return sendJson(res, 200, { success: true, user: publicUser(userObj), token: accessToken });
    }
  } catch (e) {
    console.error("[auth] reset failed:", e.message);
  }

  return sendJson(res, 400, { success: false, error: "El enlace no es válido o ya venció. Solicita uno nuevo." });
}

// Sign-up when email is on: the account stays unconfirmed until the person opens the link we send.
// Nothing is logged in here; the "confirm" action exchanges the link's token for a session.
async function signupWithConfirmation(req, res, { email, password, name }) {
  if (await rateLimited(`confirm:${email}`, 3, 10 * 60 * 1000)) {
    return sendJson(res, 429, { success: false, error: "Ya te enviamos un correo de confirmación. Revisa tu bandeja y la carpeta de spam, o inténtalo en unos minutos." });
  }
  const displayName = name || email.split("@")[0];
  const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" };
  try {
    // generate_link creates the unconfirmed account with this password and returns the link token
    const gl = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "signup", email, password, data: { name: displayName } })
    });
    const data = await gl.json().catch(() => ({}));
    if (!gl.ok) {
      if (gl.status === 422 || /already|registered|exists|duplicate/i.test(data.msg || data.message || data.error_description || "")) {
        return sendJson(res, 409, { success: false, error: "Ya existe una cuenta con este correo. Inicia sesión." });
      }
      return sendJson(res, 400, { success: false, error: "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo." });
    }

    const sbUser = data.user || data;
    if (sbUser.email_confirmed_at) {
      return sendJson(res, 409, { success: false, error: "Ya existe una cuenta con este correo. Inicia sesión." });
    }

    // An account created more than 30 minutes ago and still unconfirmed takes the newest password (last sign-up wins).
    // Within 30 minutes the password is kept, so someone registering a third party's address
    // can't change the password of an account that is still waiting for its owner to confirm.
    const createdMs = Date.parse(sbUser.created_at || "");
    const existed = Number.isFinite(createdMs) && Date.now() - createdMs > 30 * 60 * 1000;
    if (existed && sbUser.id) {
      const up = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(sbUser.id)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ password })
      });
      if (!up.ok) throw new Error(`update password HTTP ${up.status}`);
    }

    insertUser({
      id: sbUser.id,
      email,
      name: displayName,
      role: "user",
      plan: "free",
      created_at: new Date().toISOString()
    }).catch(() => {});

    const hashed = data.hashed_token || data.properties?.hashed_token;
    if (!hashed) return sendJson(res, 502, { success: false, error: CONFIRM_SEND_ERROR });
    try {
      const msg = confirmEmailEmail(displayName, `${appUrl(req)}/entrar?confirmar=${encodeURIComponent(hashed)}`);
      await sendEmail({ to: email, ...msg });
    } catch (e) {
      console.error("[auth] confirmation email failed:", e.message);
      return sendJson(res, 502, { success: false, error: CONFIRM_SEND_ERROR });
    }

    return sendJson(res, 200, {
      success: true,
      pendingConfirmation: true,
      message: `Te enviamos un correo a ${email}. Abre el enlace para activar tu cuenta. Si no lo ves, revisa la carpeta de spam.`
    });
  } catch (err) {
    console.error("[auth] signup confirmation failed:", err.message);
    return sendJson(res, 503, { success: false, error: "Servicio de autenticación no disponible." });
  }
}

// Exchanges the one-time token from the confirmation link for a session. Nothing is granted before this.
async function confirm(req, res, body) {
  const token = String(body.token || "");
  if (await rateLimited(`confirm-ip:${clientIp(req)}`, 20)) {
    return sendJson(res, 429, { success: false, error: "Demasiados intentos. Espera unos minutos." });
  }
  const invalid = () => sendJson(res, 400, { success: false, error: "El enlace no es válido o ya venció. Regístrate de nuevo con el mismo correo y te enviamos otro." });
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return invalid();

  try {
    const vr = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "signup", token_hash: token })
    });
    const session = vr.ok ? await vr.json() : null;
    if (!session?.access_token) return invalid();

    const sbUser = session.user || {};
    const email = String(sbUser.email || "");
    const isOwner = await isOwnerEmail(email);
    const plan = isOwner ? "pro" : (sbUser.app_metadata?.plan === "pro" ? "pro" : "free");
    const userObj = {
      id: sbUser.id,
      email,
      name: sbUser.user_metadata?.name || email.split("@")[0],
      plan,
      role: isOwner ? "pro" : "user"
    };
    return sendJson(res, 200, { success: true, user: publicUser(userObj), token: session.access_token });
  } catch (e) {
    console.error("[auth] confirm failed:", e.message);
  }
  return invalid();
}

// Issue time (ms) from a JWT payload. No signature check: the token comes straight from Supabase.
function tokenIssuedAtMs(token) {
  try {
    const iat = JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64url").toString("utf-8")).iat;
    return typeof iat === "number" && Number.isFinite(iat) ? iat * 1000 : null;
  } catch (e) {
    return null;
  }
}
