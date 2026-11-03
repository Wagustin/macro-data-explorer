import test from "node:test";
import assert from "node:assert/strict";
import { mencionaEmpresa } from "../scripts/empresa-mencion.js";

const bvn = { razonSocial: "COMPAÑÍA DE MINAS BUENAVENTURA S.A.A.", valores: [{ nemonico: "BUENAVI1" }, { nemonico: "BVN" }] };
const alicorp = { razonSocial: "ALICORP S.A.A.", valores: [{ nemonico: "ALICORC1" }, { nemonico: "ALICORI1" }] };
const sinAlias = { razonSocial: "EMPRESA AGROINDUSTRIAL TUMAN S.A.A.", valores: [{ nemonico: "TUMANC1" }] };

test("a company tag needs the headline to name the company", () => {
  assert.equal(mencionaEmpresa("Con una inversión de US$ 10 millones anuales, InterNexa busca extender su red en Perú", bvn), false);
  assert.equal(mencionaEmpresa("Línea de emergencia 1820 cruza fronteras: ahora puedes bloquear tus tarjetas", bvn), false);
  assert.equal(mencionaEmpresa("Buenaventura eleva su producción de oro en el tercer trimestre", bvn), true);
  assert.equal(mencionaEmpresa("Alicorp adquiere Flora Food Group: compañía fortalece su presencia", alicorp), true);
  assert.equal(mencionaEmpresa("Agroindustrial Tumán reporta pérdidas", sinAlias), true);
  assert.equal(mencionaEmpresa("La agroindustria crece en el norte", sinAlias), false);
});
