/**
 * PerData - Newsletter sign-up with double opt-in.
 *   POST /api/boletin  {email, origen?}         -> stores a pending subscriber and emails a confirm link
 *   GET  /api/boletin?accion=confirmar&t=TOKEN  -> activates and redirects to /boletin?estado=confirmado
 *   GET  /api/boletin?accion=baja&t=TOKEN       -> unsubscribes and redirects to /boletin?estado=baja
 *   POST /api/boletin?accion=baja&t=TOKEN       -> one-click unsubscribe (List-Unsubscribe-Post)
 * The answer to POST never says whether an address was already subscribed.
 */
import crypto from "crypto";
import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";
import { sendEmail, EMAIL_ENABLED } from "./_lib/email.js";

const TABLE = "boletin_suscriptores";
const SITE = process.env.APP_URL || "https://perdata.site";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

function db(path, init = {}) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  return fetch(`${base}/rest/v1/${TABLE}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
    signal: AbortSignal.timeout(6000),
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function redirect(res, estado) {
  res.statusCode = 303;
  res.setHeader("Location", `/boletin?estado=${estado}`);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (e) { return {}; }
}

function confirmEmail(link) {
  const ink = "#1B1916", paper = "#F5F1E8", soft = "#5E584E";
  return {
    subject: "Confirma tu suscripción al boletín de PerData",
    text: `Hola:\n\nPara recibir el boletín diario de PerData (lunes a viernes, 06:00 en Lima), confirma tu correo con este enlace:\n\n${link}\n\nSi no te suscribiste, ignora este mensaje y no recibirás nada.\n\nEquipo de PerData`,
    html: `<div style="background:${paper};padding:28px 16px"><div style="max-width:480px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:${ink}">
  <p style="font-family:Georgia,serif;font-style:italic;font-weight:600;font-size:26px;margin:0 0 20px">PerData</p>
  <p style="font-family:Georgia,serif;font-size:18px;line-height:1.5;margin:0 0 16px">Confirma tu correo para recibir el boletín diario: mercados, hechos de importancia y titulares del Perú, de lunes a viernes a las 06:00 (hora de Lima).</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:${ink};color:${paper};text-decoration:none;font-weight:600;padding:13px 24px">Confirmar suscripción</a></p>
  <p style="margin:0;color:${soft};font-size:13px;line-height:1.5">Si no te suscribiste, ignora este mensaje y no recibirás nada.<br>Equipo de PerData</p>
</div></div>`,
  };
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (handleRateLimit(req, res)) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return send(res, 503, { error: "Servicio no disponible" });

  const url = new URL(req.url, SITE);
  const accion = url.searchParams.get("accion");
  const token = url.searchParams.get("t") || "";

  if (accion === "confirmar" || accion === "baja") {
    if (!/^[a-f0-9]{48}$/.test(token)) return redirect(res, "invalido");
    const patch = accion === "confirmar"
      ? { estado: "activo", confirmado: new Date().toISOString(), baja: null }
      : { estado: "baja", baja: new Date().toISOString() };
    const r = await db(`?token=eq.${token}`, { method: "PATCH", body: JSON.stringify(patch) });
    const rows = r.ok ? await r.json() : [];
    if (req.method === "POST") return send(res, rows.length ? 200 : 404, { ok: rows.length > 0 });
    return redirect(res, rows.length ? (accion === "confirmar" ? "confirmado" : "baja") : "invalido");
  }

  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  const body = await readBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: "Escribe un correo válido." });
  const generic = { ok: true, mensaje: "Te enviamos un correo para confirmar. Revisa tu bandeja de entrada (y la de spam)." };

  const found = await db(`?email=eq.${encodeURIComponent(email)}&select=estado,token`);
  const existing = found.ok ? (await found.json())[0] : null;
  if (existing?.estado === "activo") return send(res, 200, generic);

  const newToken = crypto.randomBytes(24).toString("hex");
  const row = { email, estado: "pendiente", token: newToken, origen: String(body.origen || "").slice(0, 60) || null, baja: null };
  const saved = await db("?on_conflict=email", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  if (!saved.ok) return send(res, 500, { error: "No pudimos guardar tu correo. Inténtalo más tarde." });

  if (EMAIL_ENABLED) {
    try {
      const m = confirmEmail(`${SITE}/api/boletin?accion=confirmar&t=${newToken}`);
      await sendEmail({ to: email, ...m });
    } catch (e) {
      return send(res, 502, { error: "No pudimos enviar el correo de confirmación. Inténtalo más tarde." });
    }
  }
  return send(res, 200, generic);
}
