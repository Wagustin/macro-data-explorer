import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import interesHandler from "../api/interes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Minimal D1 double for testing
function fakeD1(store = new Map()) {
  const tables = {
    interes_funciones: store,
    rate_limits: new Map()
  };
  const run = (sql, args) => {
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.startsWith("DELETE")) {
      for (const [k, row] of tables.rate_limits.entries()) if (row.start < args[0]) tables.rate_limits.delete(k);
      return { success: true };
    }
    if (/insert or ignore into interes_funciones/i.test(sql)) {
      const [email, funcion, creado] = args;
      const key = email + "|" + funcion;
      if (!tables.interes_funciones.has(key)) {
        tables.interes_funciones.set(key, { email, funcion, creado });
      }
      return { success: true };
    }
    if (sql.startsWith("SELECT")) {
      const results = [];
      for (const [key, row] of tables.interes_funciones.entries()) {
        if (sql.includes("WHERE email = ?") && row.email !== args[0]) continue;
        results.push(row);
      }
      return { results };
    }
    return { success: true };
  };
  return {
    tables,
    prepare(sql) {
      return {
        run: async () => run(sql, []),
        bind: (...args) => ({
          first: async () => run(sql, args),
          run: async () => run(sql, args),
          all: async () => {
            const res = run(sql, args);
            return { results: res.results || [] };
          },
        }),
      };
    },
    batch: async (stmts) => {
      for (const stmt of stmts) {
        // stmts can be either prepared statements (with bind) or bound statements (with run)
        if (typeof stmt.run === 'function') {
          await stmt.run();
        } else if (typeof stmt.bind === 'function') {
          // It's a prepared statement, need to bind and run
          const bound = stmt.bind();
          await bound.run();
        }
      }
      return { success: true };
    },
  };
}

function makeReq(method, body = {}) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body,
    url: "/api/interes",
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    getHeader(name) { return this.headers[name]; },
    end(data) { this.body = data; return this; },
    json(data) { this.body = JSON.stringify(data); this.setHeader("Content-Type", "application/json; charset=utf-8"); return this; },
  };
  return res;
}

// 405
test("interes: 405 en GET", async () => {
  const req = makeReq("GET");
  const res = makeRes();
  await interesHandler(req, res);
  assert.equal(res.statusCode, 405);
  const body = JSON.parse(res.body);
  assert.equal(body.error, "Método no permitido");
});

// Honeypot: body.web no vacío -> 200 {ok:true} sin guardar
test("interes: honeypot (web con contenido) responde 200 ok sin guardar", async () => {
  const d1 = fakeD1();
  globalThis.PERDATA_DB = d1;
  try {
    const req = makeReq("POST", { email: "test@example.com", funciones: ["alertas"], web: "bot" });
    const res = makeRes();
    await interesHandler(req, res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    // No se guardó nada
    assert.equal(d1.tables.interes_funciones.size, 0);
  } finally {
    delete globalThis.PERDATA_DB;
  }
});

// Correo malo
test("interes: correo inválido -> 400", async () => {
  const d1 = fakeD1();
  globalThis.PERDATA_DB = d1;
  try {
    const req = makeReq("POST", { email: "no-es-email", funciones: ["alertas"], web: "" });
    const res = makeRes();
    await interesHandler(req, res);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "Correo no válido.");
  } finally {
    delete globalThis.PERDATA_DB;
  }
});

// Sin funciones
test("interes: sin funciones -> 400", async () => {
  const d1 = fakeD1();
  globalThis.PERDATA_DB = d1;
  try {
    const req = makeReq("POST", { email: "test@example.com", funciones: [], web: "" });
    const res = makeRes();
    await interesHandler(req, res);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "Elige al menos una opción.");
  } finally {
    delete globalThis.PERDATA_DB;
  }
});

// Funciones desconocidas filtradas
test("interes: funciones desconocidas se filtran, al menos una válida -> ok", async () => {
  const d1 = fakeD1();
  globalThis.PERDATA_DB = d1;
  try {
    const req = makeReq("POST", { email: "test@example.com", funciones: ["alertas", "inexistente", "mas_empresas"], web: "" });
    const res = makeRes();
    await interesHandler(req, res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    // Solo se guardaron las válidas
    assert.equal(d1.tables.interes_funciones.size, 2);
    const keys = [...d1.tables.interes_funciones.keys()];
    assert.ok(keys.some(k => k.includes("alertas")));
    assert.ok(keys.some(k => k.includes("mas_empresas")));
  } finally {
    delete globalThis.PERDATA_DB;
  }
});

// Inserción y deduplicado
test("interes: inserción y deduplicado (insert or ignore)", async () => {
  const d1 = fakeD1();
  globalThis.PERDATA_DB = d1;
  try {
    // Primera inserción
    const req1 = makeReq("POST", { email: "test@example.com", funciones: ["alertas", "excel"], web: "" });
    const res1 = makeRes();
    await interesHandler(req1, res1);
    assert.equal(res1.statusCode, 200);
    assert.equal(d1.tables.interes_funciones.size, 2);
    
    // Segunda inserción con la misma función (deduplicado)
    const req2 = makeReq("POST", { email: "test@example.com", funciones: ["alertas", "api"], web: "" });
    const res2 = makeRes();
    await interesHandler(req2, res2);
    assert.equal(res2.statusCode, 200);
    // alertas ya existía, solo se añade api
    assert.equal(d1.tables.interes_funciones.size, 3);
    const keys = [...d1.tables.interes_funciones.keys()];
    assert.ok(keys.some(k => k.includes("alertas")));
    assert.ok(keys.some(k => k.includes("excel")));
    assert.ok(keys.some(k => k.includes("api")));
  } finally {
    delete globalThis.PERDATA_DB;
  }
});

// Sin D1 (modo local) -> 503
test("interes: sin D1 -> 503", async () => {
  delete globalThis.PERDATA_DB;
  const req = makeReq("POST", { email: "test@example.com", funciones: ["alertas"], web: "" });
  const res = makeRes();
  await interesHandler(req, res);
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.error, "Servicio no disponible");
});

// Test de precios.html: comprobar origen "interes-boletin" e "interes-pro", honeypot y 5 claves
test("precios.html: botones tienen data-plan correcto y formulario incluye honeypot y 5 claves", async () => {
  const html = fs.readFileSync(path.join(rootDir, "precios.html"), "utf8");
  
  // Botones de interés con su plan
  assert.match(html, /id="pdBolCta"[^>]*data-plan="boletin"/);
  assert.match(html, /id="pdBolCta"[^>]*>Me interesa el Boletín<\/a>/);
  assert.match(html, /id="pdProCta"[^>]*data-plan="pro"/);
  assert.match(html, /id="pdProCta"[^>]*>Me interesa Pro<\/a>/);

  // Origen que se envía a /api/boletin según el plan elegido
  assert.match(html, /"interes-boletin"/);
  assert.match(html, /"interes-pro"/);

  // Honeypot oculto fuera de pantalla
  assert.match(html, /name="web"[^>]*tabindex="-1"[^>]*autocomplete="off"/);

  // Las 5 claves de funciones
  for (const clave of ["alertas", "mas_empresas", "excel", "whatsapp", "api"]) {
    assert.match(html, new RegExp(`name="funciones"[^>]*value="${clave}"`));
  }

  assert.match(html, /Lo que viene/);
  assert.match(html, /Qué quieres que construyamos después/);
});
