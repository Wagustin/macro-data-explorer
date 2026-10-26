/**
 * PerData - Public status for the watchdog: how fresh the forecasts and the news are.
 * No user data and no secrets, only timestamps and ages in hours.
 */
import { applyCors, handleRateLimit } from "./_lib/ratelimit.js";

const ageHours = (iso) => (iso ? Math.round(((Date.now() - Date.parse(iso)) / 36e5) * 10) / 10 : null);

async function latestForecastRun() {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return { error: "supabase_not_configured" };
  try {
    const r = await fetch(`${base}/rest/v1/forecasts?select=run_at&order=run_at.desc&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return { error: `supabase_${r.status}` };
    const rows = await r.json();
    const runAt = rows[0]?.run_at || null;
    return { runAt, ageHours: ageHours(runAt) };
  } catch (e) {
    return { error: "supabase_unreachable" };
  }
}

// Reads the feed file the news job publishes (a Worker cannot fetch its own domain)
async function latestNews() {
  try {
    const r = await fetch("https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/noticias.json", { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    return { updatedAt: d.actualizado || null, ageHours: ageHours(d.actualizado), count: (d.noticias || []).length };
  } catch (e) {
    return { error: "news_unreachable" };
  }
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, OPTIONS");
  if (handleRateLimit(req, res)) return;
  const [forecasts, news] = await Promise.all([latestForecastRun(), latestNews()]);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, now: new Date().toISOString(), forecasts, news }));
}
