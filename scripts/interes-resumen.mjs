import { execSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function db(path, init = {}) {
  const base = (SUPABASE_URL || "").replace(/\/+$/, "");
  const key = SUPABASE_SERVICE_KEY || "";
  return fetch(`${base}/rest/v1/boletin_suscriptores${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
}

async function contarSuscriptores() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY" };
  }

  const origenes = ["acceso-anticipado", "interes-boletin", "interes-pro"];
  const resultados = {};

  for (const origen of origenes) {
    // Total
    const total = await db(`?origen=eq.${origen}&select=estado`);
    const totalRows = total.ok ? await total.json() : [];
    const confirmados = totalRows.filter((r) => r.estado === "activo").length;
    const pendientes = totalRows.filter((r) => r.estado === "pendiente").length;
    resultados[origen] = { total: totalRows.length, confirmados, pendientes };
  }

  return resultados;
}

async function contarVotos() {
  const databaseName = "perdata-data";
  const sql = `select funcion, count(*) n from interes_funciones group by funcion`;
  const cmd = `npx wrangler d1 execute ${databaseName} --remote --json --command "${sql}"`;

  try {
    const output = execSync(cmd, { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
    const parsed = JSON.parse(output);
    // wrangler devuelve un array con un objeto { results: [...] }
    const rows = parsed?.[0]?.results || [];
    const votos = {};
    for (const row of rows) {
      votos[row.funcion] = row.n;
    }
    return votos;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export function formatearResumen(datos) {
  if (!datos) return "Sin datos";

  const { suscriptores, votos } = datos;
  if (!suscriptores) return "Sin datos de suscriptores";

  const partes = [];

  // Boletín (interes-boletin)
  if (suscriptores["interes-boletin"]) {
    const { total, confirmados } = suscriptores["interes-boletin"];
    partes.push(`Boletín ${total} (${confirmados} confirmados)`);
  }

  // Pro (interes-pro)
  if (suscriptores["interes-pro"]) {
    const { total, confirmados } = suscriptores["interes-pro"];
    partes.push(`Pro ${total} (${confirmados} confirmados)`);
  }

  // Sin plan (acceso-anticipado)
  if (suscriptores["acceso-anticipado"]) {
    const { total, confirmados } = suscriptores["acceso-anticipado"];
    partes.push(`sin plan ${total} (${confirmados} confirmados)`);
  }

  let resumen = `Interés: ${partes.join(", ")}.`;

  if (votos && !votos.error && Object.keys(votos).length > 0) {
    const votosOrdenados = Object.entries(votos)
      .sort((a, b) => b[1] - a[1])
      .map(([funcion, n]) => `${funcion} ${n}`)
      .join(", ");
    resumen += ` Votos: ${votosOrdenados}.`;
  } else if (votos && votos.error) {
    resumen += ` Votos: error al consultar D1 (${votos.error}).`;
  }

  return resumen;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY");
    process.exit(0);
  }

  const [suscriptores, votos] = await Promise.all([contarSuscriptores(), contarVotos()]);
  console.log(formatearResumen({ suscriptores, votos }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});