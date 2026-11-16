/**
 * PerData - Votos de "Lo que viene" (funciones que el lector querría).
 *   POST /api/interes  {email, funciones: string[], web?}  -> guarda en D1 (tabla interes_funciones)
 * Honeypot: si body.web no está vacío, responde 200 {ok:true} sin guardar.
 */
import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";
import { sendJson, readJsonBody } from "./_lib/session.js";
import { d1, ensureSchema } from "./_lib/d1.js";

const FUNCIONES_VALIDAS = ["alertas", "mas_empresas", "excel", "whatsapp", "api"];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export default async function handler(req, res) {
  applyCors(req, res, "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (handleRateLimit(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Método no permitido" });

  const body = await readJsonBody(req);
  const web = String(body.web || "").trim();
  // Honeypot: un bot que rellena el campo oculto recibe un OK sin que se guarde nada
  if (web) return sendJson(res, 200, { ok: true });

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: "Correo no válido." });

  const funciones = [...new Set((Array.isArray(body.funciones) ? body.funciones : []).filter((f) => FUNCIONES_VALIDAS.includes(f)))];
  if (funciones.length === 0) return sendJson(res, 400, { error: "Elige al menos una opción." });

  const db = d1();
  if (!db) return sendJson(res, 503, { error: "Servicio no disponible" });

  try {
    await ensureSchema(db);
    const creado = new Date().toISOString();
    const stmt = db.prepare("insert or ignore into interes_funciones (email, funcion, creado) values (?, ?, ?)");
    await db.batch(funciones.map((f) => stmt.bind(email, f, creado)));
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error("[interes] Error guardando:", e);
    return sendJson(res, 500, { error: "No pudimos guardar. Inténtalo más tarde." });
  }
}
