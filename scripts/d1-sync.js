// Copies rows to the Worker's D1 database through /api/internal/sync (api/sync.js), right after
// a pipeline writes them to Supabase. Needs SYNC_SECRET; without it, does nothing. Failures are
// reported but don't stop the pipeline: Supabase stays the fallback.
const APP = (process.env.APP_URL || "https://perdata.site").replace(/\/+$/, "");

export async function syncD1(table, rows, chunk = 200) {
  const secret = process.env.SYNC_SECRET || "";
  if (!secret || !rows.length) return 0;
  let sent = 0;
  try {
    for (let i = 0; i < rows.length; i += chunk) {
      const r = await fetch(`${APP}/api/internal/sync`, {
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
    console.error(`D1 ${table}: falló tras ${sent} filas (${e.message}); queda Supabase`);
  }
  return sent;
}

export async function pruneD1(table, prune) {
  const secret = process.env.SYNC_SECRET || "";
  if (!secret) return;
  try {
    const r = await fetch(`${APP}/api/internal/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ table, prune }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log(`D1 ${table}: limpieza hecha`, await r.json());
  } catch (e) {
    console.error(`D1 ${table}: limpieza falló (${e.message})`);
  }
}
