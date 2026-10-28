import test from "node:test";
import assert from "node:assert/strict";
import { linkIssuerRucs, normalizeCompanyName, parseSmvShareholders } from "../api/_lib/empresas-match.js";

test("company matching folds accents, corporate suffixes, and former names", () => {
  assert.equal(normalizeCompanyName("AGRÍCOLA CAYALTÍ S.A.A."), "AGRICOLA CAYALTI");
  assert.equal(normalizeCompanyName("ACTIVO INMOBILIARIO PERUANO S.A.A. (antes FALABELLA PERÚ S.A.A.)"), "ACTIVO INMOBILIARIO PERUANO");
  const linked = linkIssuerRucs([
    { codigoBVL: "1", razonSocial: "AGRÍCOLA CAYALTÍ S.A.A." },
    { codigoBVL: "2", razonSocial: "ACTIVO INMOBILIARIO PERUANO S.A.A. (antes FALABELLA PERÚ S.A.A.)" },
  ], {
    "20109072177": { empresa: "AGRICOLA CAYALTI SOCIEDAD ANONIMA ABIERTA" },
    "20260172035": { empresa: "ACTIVO INMOBILIARIO PERUANO S.A.A. (ANTES FALABELLA PERU S.A.A.)" },
  });
  assert.deepEqual(linked, { "1": "20109072177", "2": "20260172035" });
});

test("SMV shareholder parser groups three real rows and sorts by ownership", () => {
  const emisores = parseSmvShareholders({
    ResponseCode: "0",
    Message: "Consulta generada",
    Resultado: [
      { RPJ: "020045", RUC: "20260172035", Empresa: "ACTIVO INMOBILIARIO PERUANO S.A.A. (ANTES FALABELLA PERU S.A.A.)", Accionista: "DESARROLLOS PERU SPA", Nacionalidad: "CHILE", Fecha_Inicio: "05/12/2024", Porcentaje_Participacion: "99.76741485", Serie: "" },
      { RPJ: "023106", RUC: "20332600592", Empresa: "AENZA S.A.A.", Accionista: "AFP HABITAT S.A.", Nacionalidad: "PERU", Fecha_Inicio: "31/12/2024", Porcentaje_Participacion: "6.76", Serie: "" },
      { RPJ: "023106", RUC: "20332600592", Empresa: "AENZA S.A.A.", Accionista: "AFP INTEGRA", Nacionalidad: "PERU", Fecha_Inicio: "31/12/2024", Porcentaje_Participacion: "9.53", Serie: "" },
    ],
  });
  assert.deepEqual(emisores["20260172035"].accionistas[0], {
    nombre: "DESARROLLOS PERU SPA", nacionalidad: "CHILE", desde: "2024-12-05", pct: 99.76741485,
  });
  assert.deepEqual(emisores["20332600592"].accionistas.map((row) => row.pct), [9.53, 6.76]);
  assert.throws(() => parseSmvShareholders({ ResponseCode: "1", Resultado: [] }), /inesperada/);
});
