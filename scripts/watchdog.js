// PerData watchdog: checks the live site and the daily jobs, and emails the owner when something breaks.
// Runs hourly on GitHub Actions (.github/workflows/watchdog.yml), outside our servers, so it also
// notices when Vercel, Supabase or the home server go down.
// One open GitHub issue (label "watchdog") per incident: email when it opens and when it recovers,
// never on every run.
// Usage: node scripts/watchdog.js [--base https://perdata.site] [--full] [--dry-run]
const args = process.argv.slice(2);
const bi = args.indexOf("--base");
const BASE = bi > -1 && args[bi + 1] ? args[bi + 1] : "https://perdata.site";
const DRY = args.includes("--dry-run");

const { GITHUB_TOKEN, GITHUB_REPOSITORY, RESEND_API_KEY, ALERT_EMAIL } = process.env;
const ALERT_FROM = process.env.ALERT_FROM || "PerData Watchdog <soporte@perdata.site>";
const LABEL = "watchdog";

const MAX_FORECAST_AGE_H = 30; // daily TimesFM batch at 11:00 UTC
const MAX_NEWS_AGE_H = 30; // daily news refresh at 05:00 UTC
const MAX_FX_AGE_DAYS = 5; // BCRP daily series (weekends and holidays)

async function get(path, { json = false, timeout = 20000 } = {}) {
  const t0 = Date.now();
  const r = await fetch(BASE + path, { headers: { "User-Agent": "PerDataWatchdog/1.0" }, signal: AbortSignal.timeout(timeout) });
  const body = json ? await r.json().catch(() => null) : await r.text();
  return { status: r.status, body, ms: Date.now() - t0 };
}

const checks = [
  ["Portada", async () => {
    const r = await get("/");
    if (r.status !== 200 || !r.body.includes("PerData")) throw new Error(`HTTP ${r.status}`);
    return `${r.ms} ms`;
  }],
  ["Terminal, Empresas y Precios", async () => {
    for (const p of ["/explorer", "/empresas", "/precios"]) {
      const r = await get(p);
      if (r.status !== 200) throw new Error(`${p}: HTTP ${r.status}`);
    }
    return "200";
  }],
  ["Datos del dólar (BCRP)", async () => {
    const r = await get("/api/historical?symbol=PEN%3DX", { json: true });
    const daily = r.body?.daily || r.body?.series || [];
    const last = daily[daily.length - 1]?.date;
    if (!last) throw new Error(`sin datos (HTTP ${r.status})`);
    const age = (Date.now() - Date.parse(last)) / 864e5;
    if (age > MAX_FX_AGE_DAYS) throw new Error(`último dato del ${last}`);
    return `último dato ${last}`;
  }],
  ["Proyección a 1 mes", async () => {
    const r = await get("/api/forecast?symbol=PEN%3DX&horizon=1", { json: true });
    if (r.status !== 200 || r.body?.success === false) throw new Error(r.body?.error || `HTTP ${r.status}`);
    return `${r.ms} ms`;
  }],
  ["Proyecciones diarias (TimesFM)", async () => {
    const r = await get("/api/status", { json: true });
    const f = r.body?.forecasts;
    if (!f || f.error) throw new Error(f?.error || `HTTP ${r.status}`);
    if (f.ageHours > MAX_FORECAST_AGE_H) throw new Error(`la última corrida fue hace ${f.ageHours} h (${f.runAt})`);
    return `hace ${f.ageHours} h`;
  }],
  ["Noticias", async () => {
    const r = await get("/api/status", { json: true });
    const n = r.body?.news;
    if (!n || n.error) throw new Error(n?.error || `HTTP ${r.status}`);
    if (n.ageHours > MAX_NEWS_AGE_H) throw new Error(`actualizadas hace ${n.ageHours} h`);
    if (!n.count) throw new Error("0 noticias");
    return `${n.count} noticias, hace ${n.ageHours} h`;
  }],
];

async function gh(method, path, body) {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    method,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}

async function email(subject, text) {
  if (!RESEND_API_KEY || !ALERT_EMAIL) return console.log("(sin RESEND_API_KEY/ALERT_EMAIL: no se envía correo)");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_EMAIL], subject, text }),
  });
  if (!r.ok) throw new Error(`Resend: HTTP ${r.status} ${await r.text()}`);
}

// Once a day the full smoke suite (107 checks) runs as one more check
if (args.includes("--full")) {
  checks.push(["Pruebas completas (smoke)", async () => {
    const { execFileSync } = await import("node:child_process");
    try {
      const out = execFileSync("node", ["scripts/smoke.js", "--base", BASE], { encoding: "utf8", timeout: 300000 });
      return (out.match(/TOTAL:.*$/m) || ["ok"])[0].replace(/\x1b\[[0-9;]*m/g, "");
    } catch (e) {
      const out = String(e.stdout || "").replace(/\x1b\[[0-9;]*m/g, "");
      const fails = out.split("\n").filter((l) => l.includes("FAIL")).slice(0, 6).join("; ");
      throw new Error(fails || e.message);
    }
  }]);
}

if (args.includes("--test-email")) {
  await email("PerData: prueba del vigilante", "Si lees esto, las alertas de PerData llegan bien a tu correo.\n\nNo hay que hacer nada.");
  console.log("Correo de prueba enviado");
  process.exit(0);
}

const results = [];
for (const [name, fn] of checks) {
  try {
    results.push({ name, ok: true, info: await fn() });
  } catch (e) {
    results.push({ name, ok: false, info: e.name === "TimeoutError" ? "no responde (timeout)" : e.message });
  }
}
const failed = results.filter((r) => !r.ok);
const report = results.map((r) => `${r.ok ? "OK   " : "FALLA"}  ${r.name}: ${r.info}`).join("\n");
console.log(report);

if (DRY || !GITHUB_TOKEN || !GITHUB_REPOSITORY) process.exit(failed.length ? 1 : 0);

const open = await gh("GET", `/issues?state=open&labels=${LABEL}&per_page=1`);
const runUrl = process.env.GITHUB_RUN_ID
  ? `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : "";

if (failed.length && !open.length) {
  const title = `Incidencia: ${failed.map((f) => f.name).join(", ")}`;
  const body = `${report}\n\nDetectado: ${new Date().toISOString()}\n${runUrl}`;
  const issue = await gh("POST", "/issues", { title, body: "```\n" + body + "\n```", labels: [LABEL] });
  await email(`PerData: ${title}`, `${body}\n\nIncidencia: ${issue.html_url}\n\nSe volverá a avisar cuando se recupere.`);
} else if (failed.length && open.length) {
  console.log(`Incidencia ya abierta: ${open[0].html_url} (sin correo nuevo)`);
} else if (!failed.length && open.length) {
  await gh("POST", `/issues/${open[0].number}/comments`, { body: "Recuperado:\n```\n" + report + "\n```" });
  await gh("PATCH", `/issues/${open[0].number}`, { state: "closed" });
  await email("PerData: recuperado", `Todo vuelve a funcionar.\n\n${report}\n\n${open[0].html_url}`);
}
process.exit(failed.length ? 1 : 0);
