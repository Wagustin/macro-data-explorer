import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dispatchDueWorkflows } from "../worker.js";
import { runAlertas } from "../scripts/alertas.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = new Date("2026-11-27T20:00:00Z");

const ENV = {
  SUPABASE_URL: "https://sb.example",
  SUPABASE_SERVICE_KEY: "sb-secret",
  RESEND_API_KEY: "re-secret",
  EMAIL_FROM: "PerData <avisos@perdata.site>"
};

function makeFetchMock({
  seguimiento = [],
  enviadas = [],
  users = [{ id: "user-secret-uuid-1", email: "cliente@ejemplo.pe" }],
  smvLatestDate = "2026-11-26",
  smvByNemo = {}
} = {}) {
  const sentEmails = [];
  const recorded = [];
  const deleted = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();

    if (u.startsWith("https://api.resend.com/emails")) {
      sentEmails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "mail-1" }), { status: 200 });
    }
    if (u.includes("/rest/v1/cotizaciones_smv?select=fecha&order=fecha.desc&limit=1")) {
      const rows = smvLatestDate ? [{ fecha: smvLatestDate }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (u.includes("/rest/v1/cotizaciones_smv?nemonico=eq.")) {
      const parsed = new URL(u);
      const eqParam = parsed.searchParams.get("nemonico") || "";
      const nemo = eqParam.replace(/^eq\./, "");
      const row = smvByNemo[nemo];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (u.includes("/rest/v1/seguimiento")) {
      return new Response(JSON.stringify(seguimiento), { status: 200 });
    }
    if (u.includes("/rest/v1/alertas_enviadas")) {
      if (method === "POST") {
        recorded.push(JSON.parse(init.body));
        return new Response("", { status: 201 });
      }
      if (method === "DELETE") {
        deleted.push(u);
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(enviadas), { status: 200 });
    }
    if (u.includes("/rest/v1/users")) {
      return new Response(JSON.stringify(users), { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  };

  return {
    sentEmails,
    recorded,
    deleted,
    restore: () => { globalThis.fetch = originalFetch; }
  };
}

async function captureLogs(fn) {
  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(" "));
  console.warn = (...a) => logs.push(a.join(" "));
  console.error = (...a) => logs.push(a.join(" "));
  try {
    const result = await fn();
    return { result, output: logs.join("\n") };
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
  }
}

test("worker.js despacha alertas.yml con inputs.dry = 'false' y el workflow conserva default true", async () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/alertas.yml"), "utf8");
  assert.match(workflow, /dry:\s*\n[\s\S]*default:\s*true/);

  const dispatches = [];
  const originalFetch = globalThis.fetch;
  const origLog = console.log;
  const origError = console.error;
  console.log = () => {};
  console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/runs?per_page=1")) {
      return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 });
    }
    if (u.includes("/dispatches")) {
      dispatches.push({ url: u, body: JSON.parse(init.body) });
      return new Response(null, { status: 204 });
    }
    if (u.includes("tipoCambio.txt")) {
      return new Response("", { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    await dispatchDueWorkflows({ GH_DISPATCH_TOKEN: "gh-tok" });
  } finally {
    globalThis.fetch = originalFetch;
    console.log = origLog;
    console.error = origError;
  }

  const alertas = dispatches.find((d) => d.url.includes("/workflows/alertas.yml/dispatches"));
  assert.ok(alertas, "debe despachar alertas.yml");
  assert.deepEqual(alertas.body, { ref: "main", inputs: { dry: "false" } });
});

test("alertas envía usando precios oficiales versionados (PEN=X) sin history-120.json ni datos personales en logs", async () => {
  const mock = makeFetchMock({
    seguimiento: [{ user_id: "user-secret-uuid-1", simbolo: "PEN=X", alerta_arriba: 3.4 }]
  });
  try {
    const { result, output } = await captureLogs(() =>
      runAlertas({ dry: false, env: ENV, now: NOW })
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.sent, 1);
    assert.equal(mock.sentEmails.length, 1);
    assert.equal(mock.sentEmails[0].to[0], "cliente@ejemplo.pe");
    assert.equal(mock.recorded.length, 1);
    assert.equal(output.includes("cliente@ejemplo.pe"), false);
    assert.equal(output.includes("user-secret-uuid-1"), false);
  } finally {
    mock.restore();
  }
});

test("alertas envía usando cierres de cotizaciones_smv para acciones .LM", async () => {
  const mock = makeFetchMock({
    seguimiento: [{ user_id: "user-secret-uuid-1", simbolo: "ALICORC1.LM", alerta_arriba: 7.0 }],
    smvByNemo: { ALICORC1: { fecha: "2026-11-26", cierre: 7.5 } }
  });
  try {
    const { result, output } = await captureLogs(() =>
      runAlertas({ dry: false, env: ENV, now: NOW })
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.sent, 1);
    assert.equal(mock.sentEmails.length, 1);
    assert.match(mock.sentEmails[0].subject, /ALICORC1\.LM/);
    assert.equal(output.includes("cliente@ejemplo.pe"), false);
  } finally {
    mock.restore();
  }
});

test("alertas en modo --dry imprime cuántos avisos habría sin enviar ni registrar ni filtrar PII", async () => {
  const mock = makeFetchMock({
    seguimiento: [
      { user_id: "user-secret-uuid-1", simbolo: "PEN=X", alerta_arriba: 3.4 },
      { user_id: "user-secret-uuid-1", simbolo: "HG=F", alerta_arriba: 100 }
    ],
    enviadas: [{ user_id: "user-secret-uuid-1", simbolo: "HG=F", tipo: "arriba", nivel: 100 }]
  });
  try {
    const { result, output } = await captureLogs(() =>
      runAlertas({ dry: true, env: ENV, now: NOW })
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.sent, 1);
    assert.equal(mock.sentEmails.length, 0);
    assert.equal(mock.recorded.length, 0);
    assert.equal(mock.deleted.length, 0);
    assert.match(output, /Habría 1 avisos/);
    assert.equal(output.includes("cliente@ejemplo.pe"), false);
    assert.equal(output.includes("user-secret-uuid-1"), false);
  } finally {
    mock.restore();
  }
});

test("si faltan precios o son viejos, sale con código != 0, no dice '0 avisos' y no envía con precios viejos", async () => {
  // Caso 1: acción .LM con precio viejo (más de 7 días)
  const mockOldLm = makeFetchMock({
    seguimiento: [{ user_id: "user-secret-uuid-1", simbolo: "ALICORC1.LM", alerta_arriba: 7.0 }],
    smvByNemo: { ALICORC1: { fecha: "2026-11-10", cierre: 7.5 } }
  });
  try {
    const { result, output } = await captureLogs(() =>
      runAlertas({ dry: false, env: ENV, now: NOW })
    );
    assert.notEqual(result.exitCode, 0);
    assert.equal(mockOldLm.sentEmails.length, 0);
    assert.equal(output.includes("0 avisos"), false);
  } finally {
    mockOldLm.restore();
  }

  // Caso 2: falta precio para un símbolo seguido
  const mockMissing = makeFetchMock({
    seguimiento: [{ user_id: "user-secret-uuid-1", simbolo: "SINPRECIO.LM", alerta_arriba: 1.0 }],
    smvByNemo: {}
  });
  try {
    const { result, output } = await captureLogs(() =>
      runAlertas({ dry: false, env: ENV, now: NOW })
    );
    assert.notEqual(result.exitCode, 0);
    assert.equal(mockMissing.sentEmails.length, 0);
    assert.equal(output.includes("0 avisos"), false);
  } finally {
    mockMissing.restore();
  }

  // Caso 3: fuente base vieja (fecha actual muy posterior a los archivos)
  const mockStaleBase = makeFetchMock({ seguimiento: [] });
  try {
    const { result, output } = await captureLogs(() =>
      runAlertas({ dry: false, env: ENV, now: new Date("2027-01-15T20:00:00Z") })
    );
    assert.notEqual(result.exitCode, 0);
    assert.equal(mockStaleBase.sentEmails.length, 0);
    assert.equal(output.includes("0 avisos"), false);
  } finally {
    mockStaleBase.restore();
  }
});
