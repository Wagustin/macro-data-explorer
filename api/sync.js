/**
 * PerData - Internal write endpoint for the D1 copy (api/_lib/d1.js).
 *   POST /api/internal/sync  Authorization: Bearer <SYNC_SECRET>
 *   { "table": "forecasts" | "cotizaciones_smv", "rows": [...] }   (at most 500 rows per call)
 * Called by the GitHub Actions pipelines right after they write to Supabase. Without the
 * SYNC_SECRET secret or the D1 binding, it answers 404/503 and writes nothing.
 */
import crypto from "crypto";
import { d1, ensureSchema } from "./_lib/d1.js";
import { readJsonBody } from "./_lib/session.js";

const TABLES = {
  forecasts: {
    cols: ["symbol", "horizon", "model", "run_at", "last_close", "p10", "p25", "p50", "p75", "p90", "path"],
    key: ["symbol", "horizon", "model"],
    map: (r) => ({ ...r, path: r.path == null ? null : JSON.stringify(r.path) }),
  },
  cotizaciones_smv: {
    cols: ["nemonico", "fecha", "cierre", "apertura", "maximo", "minimo", "monto", "fin_de_mes"],
    key: ["nemonico", "fecha"],
    map: (r) => ({ ...r, fin_de_mes: r.fin_de_mes ? 1 : 0 }),
  },
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const secret = process.env.SYNC_SECRET || "";
  const got = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (secret.length < 32 || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export default async function handler(req, res) {
  if (req.method !== "POST" || !authorized(req)) return send(res, 404, { error: "No encontrado." });
  const db = d1();
  if (!db) return send(res, 503, { error: "Sin base D1." });
  const body = await readJsonBody(req);
  const spec = TABLES[body?.table];
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!spec || !rows.length || rows.length > 500) return send(res, 400, { error: "Tabla o filas no válidas." });

  await ensureSchema(db);
  const { cols, key } = spec;
  const sql = `insert into ${body.table} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")}) ` +
    `on conflict (${key.join(", ")}) do update set ${cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")}`;
  const stmt = db.prepare(sql);
  await db.batch(rows.map(spec.map).map((r) => stmt.bind(...cols.map((c) => (r[c] === undefined ? null : r[c])))));
  return send(res, 200, { ok: true, rows: rows.length });
}
