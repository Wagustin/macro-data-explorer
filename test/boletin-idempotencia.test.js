import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ordenarDestinatarios,
  partirEnLotes,
  claveIdempotencia,
  esConflictoIdempotencia,
  cargarSuscriptores,
  leerYaEnviados,
  enviarLotes,
} from "../scripts/lib/boletin-envio.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Simulador mínimo de Resend /emails/batch con comportamiento real de Idempotency-Key:
// misma clave + mismo cuerpo -> 200 en caché sin reenviar;
// misma clave + distinto cuerpo -> 409 invalid_idempotent_request sin reenviar.
function crearMockResend({ fallarBatch = () => false } = {}) {
  const keys = new Map();
  const entregas = new Map();
  const llamadas = [];

  const fetchImpl = async (url, init = {}) => {
    if (!String(url).startsWith("https://api.resend.com/emails/batch")) {
      return new Response("Not found", { status: 404 });
    }
    const headers = init.headers || {};
    const key = headers["Idempotency-Key"] || headers["idempotency-key"] || null;
    const body = String(init.body || "");
    const items = JSON.parse(body);
    llamadas.push({ key, count: items.length, to: items.map((m) => m.to[0]) });

    if (fallarBatch({ key, items, llamadas })) {
      return new Response(JSON.stringify({ statusCode: 500, name: "internal_error", message: "boom" }), { status: 500 });
    }

    if (key && keys.has(key)) {
      const prev = keys.get(key);
      if (prev.body !== body) {
        return new Response(
          JSON.stringify({ statusCode: 409, name: "invalid_idempotent_request", message: "Idempotency key already used with a different payload" }),
          { status: 409 },
        );
      }
      return new Response(JSON.stringify(prev.res), { status: 200 });
    }

    for (const m of items) {
      const addr = m.to[0];
      entregas.set(addr, (entregas.get(addr) || 0) + 1);
    }
    const res = { data: items.map((_, i) => ({ id: `em_${i}` })) };
    if (key) keys.set(key, { body, res });
    return new Response(JSON.stringify(res), { status: 200 });
  };

  return { fetchImpl, entregas, llamadas };
}

test("ordenarDestinatarios: mantiene lotes estables ante altas nuevas y bajas de hoy", () => {
  const s1 = { email: "b@ejemplo.pe", token: "t2", empresas: [], estado: "activo", confirmado: "2026-11-02T10:00:00Z" };
  const s2 = { email: "a@ejemplo.pe", token: "t1", empresas: [], estado: "activo", confirmado: "2026-11-01T10:00:00Z" };
  const s3BajaHoy = { email: "c@ejemplo.pe", token: "t3", empresas: [], estado: "baja", confirmado: "2026-11-03T10:00:00Z" };
  const s4Nuevo = { email: "0nuevo@ejemplo.pe", token: "t4", empresas: [], estado: "activo", confirmado: "2026-11-27T11:10:00Z" };

  // Orden en la primera corrida (sin el alta nueva, con s3 activo)
  const corrida1 = ordenarDestinatarios([s1, s2, { ...s3BajaHoy, estado: "activo" }], ["owner@perdata.site"]);
  assert.deepEqual(
    corrida1.map((x) => x.email),
    ["owner@perdata.site", "a@ejemplo.pe", "b@ejemplo.pe", "c@ejemplo.pe"],
  );

  // En la segunda corrida, aunque s3 se dio de baja hoy y s4 ("0nuevo@...") confirmó,
  // los tres primeros conservan exactamente sus posiciones y s4 queda al final.
  const corrida2 = ordenarDestinatarios([s4Nuevo, s1, s3BajaHoy, s2], ["owner@perdata.site"]);
  assert.deepEqual(
    corrida2.map((x) => ({ email: x.email, activo: x.activo })),
    [
      { email: "owner@perdata.site", activo: true },
      { email: "a@ejemplo.pe", activo: true },
      { email: "b@ejemplo.pe", activo: true },
      { email: "c@ejemplo.pe", activo: false },
      { email: "0nuevo@ejemplo.pe", activo: true },
    ],
  );
});

test("Idempotency-Key es determinista por fecha y lote y no contiene correos", () => {
  const slots = [
    { email: "uno@ejemplo.pe", activo: true },
    { email: "dos@ejemplo.pe", activo: true },
  ];
  const k1 = claveIdempotencia({ fecha: "2026-11-27", indice: 0, loteSlots: slots, pendientes: slots });
  const k2 = claveIdempotencia({ fecha: "2026-11-27", indice: 0, loteSlots: slots, pendientes: slots });
  const kOtroDia = claveIdempotencia({ fecha: "2026-11-28", indice: 0, loteSlots: slots, pendientes: slots });

  assert.equal(k1, "boletin-2026-11-27-lote-0");
  assert.equal(k1, k2);
  assert.notEqual(k1, kOtroDia);
  assert.ok(!k1.includes("@"));

  // Si ya se filtró parte del lote por boletin_envios, la clave cambia sin exponer correos
  const kParcial = claveIdempotencia({ fecha: "2026-11-27", indice: 0, loteSlots: slots, pendientes: [slots[1]] });
  assert.match(kParcial, /^boletin-2026-11-27-lote-0-[a-f0-9]{12}$/);
  assert.ok(!kParcial.includes("@"));
});

test("relanzamiento tras fallo de lote intermedio con contenido cambiado: sin duplicados y sin bloquear el lote faltante", async () => {
  const slots = ordenarDestinatarios([
    { email: "u1@ejemplo.pe", confirmado: "2026-11-01T00:00:00Z" },
    { email: "u2@ejemplo.pe", confirmado: "2026-11-02T00:00:00Z" },
    { email: "u3@ejemplo.pe", confirmado: "2026-11-03T00:00:00Z" },
  ]);

  let intento = 1;
  const resend = crearMockResend({
    fallarBatch: ({ key }) => intento === 1 && key === "boletin-2026-11-27-lote-1",
  });

  // Intento 1: lote 0 (u1, u2) se envía; lote 1 (u3) falla con HTTP 500
  await assert.rejects(
    () =>
      enviarLotes({
        slots,
        fecha: "2026-11-27",
        buildMsg: (x) => ({ from: "PerData <boletin@perdata.site>", to: [x.email], subject: "S", html: "<p>version 1</p>" }),
        resendKey: "re_test",
        fetchImpl: resend.fetchImpl,
        batchSize: 2,
        log: () => {},
      }),
    /Resend: HTTP 500/,
  );

  assert.equal(resend.entregas.get("u1@ejemplo.pe"), 1);
  assert.equal(resend.entregas.get("u2@ejemplo.pe"), 1);
  assert.equal(resend.entregas.get("u3@ejemplo.pe"), undefined);

  // Intento 2: cambia el HTML (p. ej. distinta redacción de IA o noticias).
  // Resend responde 409 en lote 0, pero debe continuar y enviar lote 1 (u3).
  intento = 2;
  const res2 = await enviarLotes({
    slots,
    fecha: "2026-11-27",
    buildMsg: (x) => ({ from: "PerData <boletin@perdata.site>", to: [x.email], subject: "S", html: "<p>version 2</p>" }),
    resendKey: "re_test",
    fetchImpl: resend.fetchImpl,
    batchSize: 2,
    log: () => {},
  });

  assert.equal(resend.entregas.get("u1@ejemplo.pe"), 1, "u1 no debe recibir duplicado");
  assert.equal(resend.entregas.get("u2@ejemplo.pe"), 1, "u2 no debe recibir duplicado");
  assert.equal(resend.entregas.get("u3@ejemplo.pe"), 1, "u3 debe recibir el boletín en el reintento");
  assert.equal(res2.totalActivos, 3);
  assert.equal(res2.sent, 1);
  assert.equal(res2.omitidos, 2);
});

test("relanzamiento tras fallo de git push: ningún destinatario recibe doble envío (con contenido igual o distinto)", async () => {
  const slots = ordenarDestinatarios([
    { email: "a@ejemplo.pe", confirmado: "2026-11-01T00:00:00Z" },
    { email: "b@ejemplo.pe", confirmado: "2026-11-02T00:00:00Z" },
  ]);
  const resend = crearMockResend();

  // Intento 1: todo enviado, pero suponemos que git push falló
  const r1 = await enviarLotes({
    slots,
    fecha: "2026-11-27",
    buildMsg: (x) => ({ from: "PerData <boletin@perdata.site>", to: [x.email], subject: "S", html: "<p>v1</p>" }),
    resendKey: "re_test",
    fetchImpl: resend.fetchImpl,
    batchSize: 2,
    log: () => {},
  });
  assert.equal(r1.sent, 2);

  // Intento 2a: mismo contenido -> Resend devuelve caché sin reenviar
  await enviarLotes({
    slots,
    fecha: "2026-11-27",
    buildMsg: (x) => ({ from: "PerData <boletin@perdata.site>", to: [x.email], subject: "S", html: "<p>v1</p>" }),
    resendKey: "re_test",
    fetchImpl: resend.fetchImpl,
    batchSize: 2,
    log: () => {},
  });

  // Intento 2b: distinto contenido -> Resend devuelve 409, no falla ni reenvía
  const r2b = await enviarLotes({
    slots,
    fecha: "2026-11-27",
    buildMsg: (x) => ({ from: "PerData <boletin@perdata.site>", to: [x.email], subject: "S", html: "<p>v2</p>" }),
    resendKey: "re_test",
    fetchImpl: resend.fetchImpl,
    batchSize: 2,
    log: () => {},
  });

  assert.equal(resend.entregas.get("a@ejemplo.pe"), 1);
  assert.equal(resend.entregas.get("b@ejemplo.pe"), 1);
  assert.equal(r2b.totalActivos, 2);
});

test("boletin_envios en Supabase evita reenviar lotes ya entregados y entrega a altas nuevas sin colisión de clave", async () => {
  const enviosDb = new Set();
  const resend = crearMockResend();
  let failBatch1 = true;

  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/rest/v1/boletin_envios")) {
      if ((init.method || "GET") === "POST") {
        for (const row of JSON.parse(init.body)) enviosDb.add(`${row.fecha}:${row.email}`);
        return new Response("", { status: 201 });
      }
      const rows = [...enviosDb].map((k) => ({ email: k.split(":")[1] }));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return resend.fetchImpl(url, init);
  };

  const resendConFallo = async (url, init = {}) => {
    if (String(url).startsWith("https://api.resend.com") && failBatch1) {
      const key = init.headers?.["Idempotency-Key"] || "";
      if (key === "boletin-2026-11-27-lote-1") {
        return new Response("boom", { status: 500 });
      }
    }
    return fetchImpl(url, init);
  };

  const slots1 = ordenarDestinatarios([
    { email: "u1@ejemplo.pe", confirmado: "2026-11-01T00:00:00Z" },
    { email: "u2@ejemplo.pe", confirmado: "2026-11-02T00:00:00Z" },
    { email: "u3@ejemplo.pe", confirmado: "2026-11-03T00:00:00Z" },
  ]);

  await assert.rejects(() =>
    enviarLotes({
      slots: slots1,
      fecha: "2026-11-27",
      buildMsg: (x) => ({ from: "f", to: [x.email], subject: "s", html: "h1" }),
      resendKey: "re_test",
      supabaseUrl: "https://sb.invalid",
      supabaseKey: "sb_key",
      fetchImpl: resendConFallo,
      batchSize: 2,
      log: () => {},
    }),
  );

  // En el relanzamiento, u4 se suma al final (lote 1) y lote 0 ya está en boletin_envios
  failBatch1 = false;
  const alreadySent = await leerYaEnviados({
    supabaseUrl: "https://sb.invalid",
    supabaseKey: "sb_key",
    fecha: "2026-11-27",
    fetchImpl,
  });
  assert.deepEqual([...alreadySent].sort(), ["u1@ejemplo.pe", "u2@ejemplo.pe"]);

  const slots2 = ordenarDestinatarios([
    { email: "u1@ejemplo.pe", confirmado: "2026-11-01T00:00:00Z" },
    { email: "u2@ejemplo.pe", confirmado: "2026-11-02T00:00:00Z" },
    { email: "u3@ejemplo.pe", confirmado: "2026-11-03T00:00:00Z" },
    { email: "u4@ejemplo.pe", confirmado: "2026-11-27T11:20:00Z" },
  ]);

  const llamadasAntes = resend.llamadas.length;
  const res2 = await enviarLotes({
    slots: slots2,
    fecha: "2026-11-27",
    alreadySent,
    buildMsg: (x) => ({ from: "f", to: [x.email], subject: "s", html: "h2" }),
    resendKey: "re_test",
    supabaseUrl: "https://sb.invalid",
    supabaseKey: "sb_key",
    fetchImpl,
    batchSize: 2,
    log: () => {},
  });

  // Lote 0 no vuelve a llamar a Resend; lote 1 envía u3 y u4
  assert.equal(resend.llamadas.length - llamadasAntes, 1);
  assert.equal(res2.sent, 2);
  assert.equal(res2.omitidos, 2);
  for (const addr of ["u1@ejemplo.pe", "u2@ejemplo.pe", "u3@ejemplo.pe", "u4@ejemplo.pe"]) {
    assert.equal(resend.entregas.get(addr), 1, `${addr} debe recibir exactamente 1 correo`);
  }
});

test("409 concurrent_idempotent_requests no se oculta y fuerza reintento", () => {
  assert.equal(esConflictoIdempotencia(409, JSON.stringify({ name: "invalid_idempotent_request" })), true);
  assert.equal(esConflictoIdempotencia(409, JSON.stringify({ name: "concurrent_idempotent_requests" })), false);
  assert.equal(esConflictoIdempotencia(500, "{}"), false);
});

test("FORCE=true usa clave distinta para permitir envíos manuales de prueba", async () => {
  const slots = ordenarDestinatarios([{ email: "test@ejemplo.pe" }]);
  const resend = crearMockResend();
  await enviarLotes({
    slots,
    fecha: "2026-11-27",
    buildMsg: (x) => ({ from: "f", to: [x.email], subject: "s", html: "h1" }),
    resendKey: "re_test",
    fetchImpl: resend.fetchImpl,
    log: () => {},
  });
  await enviarLotes({
    slots,
    fecha: "2026-11-27",
    force: true,
    forceId: "run99",
    buildMsg: (x) => ({ from: "f", to: [x.email], subject: "s", html: "h2" }),
    resendKey: "re_test",
    fetchImpl: resend.fetchImpl,
    log: () => {},
  });
  assert.equal(resend.entregas.get("test@ejemplo.pe"), 2);
  assert.equal(resend.llamadas[1].key, "boletin-2026-11-27-force-run99-lote-0");
});

test("cargarSuscriptores cae al filtro clásico si la consulta con bajas de hoy falla y no escribe correos en boletin-last.json", async () => {
  const urls = [];
  const rows = await cargarSuscriptores({
    supabaseUrl: "https://sb.invalid",
    supabaseKey: "k",
    fecha: "2026-11-27",
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (urls.length === 1) return new Response("bad request", { status: 400 });
      return new Response(JSON.stringify([{ email: "a@ejemplo.pe", token: "t", empresas: [] }]), { status: 200 });
    },
    warn: () => {},
  });
  assert.equal(urls.length, 2);
  assert.equal(rows.length, 1);

  const last = JSON.parse(fs.readFileSync(path.join(rootDir, "data/boletin-last.json"), "utf8"));
  assert.ok(!("emails" in last) && !JSON.stringify(last).includes("@"), "data/boletin-last.json no debe contener correos");
  const boletinSrc = fs.readFileSync(path.join(rootDir, "scripts/boletin.js"), "utf8");
  assert.match(boletinSrc, /enviarLotes/);
  assert.match(boletinSrc, /ordenarDestinatarios/);
});
