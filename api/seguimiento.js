/**
 * PerData - Seguimiento de empresas y umbrales de alerta por usuario.
 *   GET    /api/seguimiento                -> { simbolos: [{simbolo, alerta_arriba, alerta_abajo}], limite: 20 }
 *   POST   /api/seguimiento                -> { ok: true, simbolos: [...] }
 *   DELETE /api/seguimiento?simbolo=XXX    -> { ok: true, simbolos: [...] }
 */

import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";
import { getAuthUser } from "./_lib/session.js";
import { planForUser, canFollow, followLimit } from "./_lib/plans.js";
import { CATALOG } from "./search.js";

const TABLE = "seguimiento";
const valid = new Set((CATALOG || []).map((c) => c.symbol));

function db(path, init = {}) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  return fetch(`${base}/rest/v1/${TABLE}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(6000),
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// La migración 0013 puede no estar aplicada todavía: si el select extendido falla,
// se cae al select antiguo para no romper la lista de seguimiento.
const FIELDS_FULL = "simbolo,alerta_arriba,alerta_abajo,alerta_pct_arriba,alerta_pct_abajo,alerta_diaria,precio_base";
const FIELDS_LEGACY = "simbolo,alerta_arriba,alerta_abajo";

async function listSeguimiento(userId) {
  const base = `?user_id=eq.${encodeURIComponent(userId)}&order=creado.asc&select=`;
  let r = await db(base + FIELDS_FULL);
  if (!r.ok) r = await db(base + FIELDS_LEGACY);
  if (!r.ok) return null;
  return r.json();
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch (e) {
    return {};
  }
}

// Porcentaje de aviso: número entre 0 y 90, o null si viene vacío.
function readPct(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 90) return { ok: false, value: null };
  return { ok: true, value: n };
}

// Precio de referencia: número mayor que 0, o null si viene vacío.
function readBase(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (handleRateLimit(req, res)) return;

  const user = await getAuthUser(req);
  if (!user || !user.id) {
    return send(res, 401, { error: "No autenticado" });
  }

  const plan = planForUser(user);

  if ((req.method === "POST" || req.method === "DELETE") && !canFollow(plan)) {
    return send(res, 403, { code: "plan_required", error: "Las empresas que sigues son parte del plan Boletín." });
  }

  if (req.method === "GET" && !canFollow(plan)) {
    return send(res, 200, { simbolos: [], limite: followLimit(plan), permitido: false, plan: plan.id });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return send(res, 503, { error: "Servicio no disponible" });
  }

  if (req.method === "GET") {
    try {
      const rows = await listSeguimiento(user.id);
      if (rows === null) {
        return send(res, 502, { error: "No se pudieron obtener los símbolos de seguimiento." });
      }
      return send(res, 200, { simbolos: rows || [], limite: followLimit(plan), permitido: canFollow(plan), plan: plan.id });
    } catch (e) {
      return send(res, 502, { error: "Error al consultar la base de datos." });
    }
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const rawSimbolo = String(body.simbolo || "").trim();
    if (!rawSimbolo || !valid.has(rawSimbolo)) {
      return send(res, 400, { error: "Símbolo no válido." });
    }

    let arriba = null;
    if (body.alerta_arriba !== undefined && body.alerta_arriba !== null && body.alerta_arriba !== "") {
      const n = Number(body.alerta_arriba);
      if (!Number.isFinite(n) || n <= 0) {
        return send(res, 400, { error: "El umbral de alerta superior debe ser un número mayor a 0." });
      }
      arriba = n;
    }

    let abajo = null;
    if (body.alerta_abajo !== undefined && body.alerta_abajo !== null && body.alerta_abajo !== "") {
      const n = Number(body.alerta_abajo);
      if (!Number.isFinite(n) || n <= 0) {
        return send(res, 400, { error: "El umbral de alerta inferior debe ser un número mayor a 0." });
      }
      abajo = n;
    }

    const pctArriba = readPct(body.alerta_pct_arriba);
    const pctAbajo = readPct(body.alerta_pct_abajo);
    if (!pctArriba.ok || !pctAbajo.ok) {
      return send(res, 400, { error: "El porcentaje de aviso debe estar entre 0 y 90." });
    }

    try {
      const currRes = await db(`?user_id=eq.${encodeURIComponent(user.id)}&select=simbolo`);
      if (!currRes.ok) {
        return send(res, 502, { error: "Error al consultar el límite de símbolos." });
      }
      const currRows = await currRes.json();
      const alreadyFollowing = (currRows || []).some((r) => r.simbolo === rawSimbolo);
      const max = followLimit(plan);
      if (!alreadyFollowing && (currRows || []).length >= max) {
        return send(res, 400, { error: `Puedes seguir hasta ${max} empresas o activos.` });
      }

      const row = {
        user_id: user.id,
        simbolo: rawSimbolo,
        alerta_arriba: arriba,
        alerta_abajo: abajo,
        alerta_pct_arriba: pctArriba.value,
        alerta_pct_abajo: pctAbajo.value,
        precio_base: readBase(body.precio_base),
        alerta_diaria: body.alerta_diaria === undefined ? true : Boolean(body.alerta_diaria),
      };

      let upsertRes = await db("?on_conflict=user_id,simbolo", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });

      // Si la migración 0013 aún no está aplicada, se guarda sólo lo que ya existía.
      if (!upsertRes.ok) {
        const legacy = {
          user_id: row.user_id,
          simbolo: row.simbolo,
          alerta_arriba: row.alerta_arriba,
          alerta_abajo: row.alerta_abajo,
        };
        upsertRes = await db("?on_conflict=user_id,simbolo", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(legacy),
        });
      }

      if (!upsertRes.ok) {
        return send(res, 502, { error: "No se pudo guardar el símbolo." });
      }

      const list = (await listSeguimiento(user.id)) || [];
      return send(res, 200, { ok: true, simbolos: list });
    } catch (e) {
      return send(res, 502, { error: "Error al actualizar el seguimiento." });
    }
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url, "http://localhost");
    const simbolo = (url.searchParams.get("simbolo") || req.query?.simbolo || "").trim();
    if (!simbolo) {
      return send(res, 400, { error: "Falta el parámetro simbolo." });
    }

    try {
      const delRes = await db(`?user_id=eq.${encodeURIComponent(user.id)}&simbolo=eq.${encodeURIComponent(simbolo)}`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });

      if (!delRes.ok) {
        return send(res, 502, { error: "No se pudo eliminar el símbolo." });
      }

      const list = (await listSeguimiento(user.id)) || [];
      return send(res, 200, { ok: true, simbolos: list });
    } catch (e) {
      return send(res, 502, { error: "Error al eliminar el símbolo." });
    }
  }

  return send(res, 405, { error: "Método no permitido" });
}
