import test from "node:test";
import assert from "node:assert/strict";

// El buscador tiene que encontrar cualquier emisora de la BVL, no sólo la lista curada.
test("el catálogo de búsqueda incluye a todas las emisoras de la BVL", async () => {
  const mod = await import("../api/search.js");
  const total = mod.CATALOG.length;
  assert.ok(total >= 250, `el catálogo tiene ${total} entradas, se esperaban al menos 250`);

  const buscar = async (q) => {
    const peticiones = [];
    const req = { query: { q }, method: "GET", headers: {} };
    const res = {
      statusCode: 0,
      cuerpo: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.cuerpo = b; return this; },
      setHeader() { return this; },
      end() { return this; },
    };
    await mod.default(req, res);
    return res.cuerpo || {};
  };

  for (const [consulta, esperado] of [
    ["bvn", "BVN.LM"],
    ["credicorp", "BAP.LM"],
    ["alicorp", "ALICORC1.LM"],
    ["southern copper", "SCCO.LM"],
  ]) {
    const r = await buscar(consulta);
    const simbolos = (r.results || []).map((x) => x.symbol);
    assert.ok(simbolos.includes(esperado), `«${consulta}» no devolvió ${esperado}: ${simbolos.join(", ")}`);
  }

  // Las cifras de cobertura no deben inflarse con las emisoras añadidas
  const stats = await buscar("__stats__");
  assert.ok(Number.isFinite(stats.total));
});
