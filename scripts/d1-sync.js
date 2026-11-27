// Copies rows to the Worker's D1 database through /api/internal/sync (api/sync.js), right after
// a pipeline writes them to Supabase. Needs SYNC_SECRET; without it, does nothing (unless strict).
// By default failures are reported without stopping the pipeline (Supabase stays the fallback);
// pass { strict: true } when D1 sync is the job itself (e.g. d1-backfill.js).
const APP = (process.env.APP_URL || "https://perdata.site").replace(/\/+$/, "");

export async function syncD1(table, rows, chunk = 200, { strict = false, fetchImpl = fetch } = {}) {
  const secret = process.env.SYNC_SECRET || "";
  if (!secret) {
    if (strict) throw new Error("Falta SYNC_SECRET");
    return 0;
  }
  if (!rows.length) return 0;
  let sent = 0;
  try {
    for (let i = 0; i < rows.length; i += chunk) {
      const r = await fetchImpl(`${APP}/api/internal/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ table, rows: rows.slice(i, i + chunk) }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      sent += Math.min(chunk, rows.length - i);
    }
    console.log(`D1 ${table}: ${sent} filas`);
  } catch (e) {
    console.error(`D1 ${table}: falló tras ${sent} filas (${e.message})${strict ? "" : "; queda Supabase"}`);
    if (strict) throw e;
  }
  return sent;
}

export async function pruneD1(table, prune, { strict = false, fetchImpl = fetch } = {}) {
  const secret = process.env.SYNC_SECRET || "";
  if (!secret) {
    if (strict) throw new Error("Falta SYNC_SECRET");
    return;
  }
  try {
    const r = await fetchImpl(`${APP}/api/internal/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ table, prune }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log(`D1 ${table}: limpieza hecha`, await r.json());
  } catch (e) {
    console.error(`D1 ${table}: limpieza falló (${e.message})`);
    if (strict) throw e;
  }
}
