import test from "node:test";
import assert from "node:assert/strict";
import { hechosEmpresa, lecturaEmpresa, lecturaEmpresaDeterminista, lecturasEmpresas, corregirDireccionEmpresa } from "../scripts/empresa-lectura.js";

const DATOS = {
  nemo: "TESTC1",
  nombre: "Mineral Peruana S.A.A.",
  sector: "MINERAS",
  precio: 10.5,
  moneda: "S/",
  fecha_precio: "2026-11-05",
  variacion_dia: 1.2,
  rango: { p10: 10.1, p50: 10.5, p90: 11.0, fecha: "2026-11-10" },
  hechos_smv: [
    { fecha: "2026-11-03", titulo: "Designación de representante bursátil suplente." },
  ],
  noticias: [
    { titular: "Cerna anuncia expansión de operaciones.", fuente: "Gestión", fecha: "2026-11-04", sentimiento: "POSITIVO" },
  ],
  macro: {
    cobre: { valor: 6.44, variacion_5: 2.1, fecha: "2026-11-04" },
    oro: { valor: 4060.7, variacion_5: -1.5, fecha: "2026-11-04" },
    wti: { valor: 88.12, variacion_5: 0.5, fecha: "2026-11-04" },
    dolar: { valor: 3.452, variacion_5: -0.3, fecha: "2026-11-05" },
    tasa_referencia: { valor: 4.25, fecha: "2026-11-06" },
  },
};

test("hechosEmpresa calcula precio, rango y macro desde los datos de ejemplo", () => {
  const hechos = hechosEmpresa(DATOS);
  const porId = Object.fromEntries(hechos.map((h) => [h.id, h.texto]));

  assert.equal(porId["precio"], "La acción de Mineral Peruana S.A.A. cerró en S/ 10.50 el 5 de noviembre de 2026, con una variación de +1.20 % en la última sesión.");
  assert.equal(porId["rango"], "El rango estadístico de Mineral Peruana S.A.A. va entre S/ 10.10 y S/ 11.00, con centro en S/ 10.50, con fecha objetivo 10 de noviembre de 2026; su ancho es de 8.57 % y es una estadística, no una promesa.");
  assert.equal(porId["smv-1"], "Hecho de importancia de la SMV del 3 de noviembre de 2026: Designación de representante bursátil suplente.");
  assert.match(porId["titular-1"], /Gestión \(en tono positivo\) del 4 de noviembre de 2026: Cerna anuncia expansión/);
  assert.equal(porId["macro-cobre"], "El cobre acumuló +2.10 % en cinco sesiones y está a US$ 6.44 por libra el 4 de noviembre de 2026.");
  assert.equal(porId["macro-wti"], "El petróleo WTI acumuló +0.50 % en cinco sesiones y está a US$ 88.12 por barril el 4 de noviembre de 2026.");
  assert.equal(porId["macro-dolar"], "El dólar acumuló −0.30 % en cinco sesiones y está a S/ 3.45 por US$ el 5 de noviembre de 2026.");
  assert.equal(porId["macro-tasa"], "La tasa de referencia del BCRP está en 4.25 % desde el 6 de noviembre de 2026.");
});

test("el determinista registra qué hay y da dirección solo al metal de la minera", () => {
  const r = lecturaEmpresaDeterminista(DATOS, hechosEmpresa(DATOS));
  assert.equal(r.que_hay.length, 2);
  assert.equal(r.podria_mover.al_alza.length, 1);
  assert.match(r.podria_mover.al_alza[0].texto, /cobre subió 2\.10 %/);
  assert.equal(r.podria_mover.a_la_baja.length, 1);
  assert.match(r.podria_mover.a_la_baja[0].texto, /oro bajó 1\.50 %/);
  // WTI y dólar no llevan dirección: el determinista los registra a contexto sin empujones
  // (el máx. de 2 puntos por lista deja fuera el dólar, que va el último de los macro)
  const ids = r.contexto.flatMap((p) => p.hechos);
  assert.ok(ids.includes("macro-wti"), "el WTI sin dirección va a contexto");
  assert.ok(!ids.includes("macro-cobre") && !ids.includes("macro-oro"), "cobre y oro ya fueron usados como factor con dirección");
  assert.equal(r.contexto.length, 2, "contexto respeta el máximo de 2 puntos");
  assert.equal(r.que_hay.length + r.podria_mover.al_alza.length + r.podria_mover.a_la_baja.length + r.contexto.length <= 8, true);
  assert.ok(r.resumen.split(/\s+/).length <= 40);
});

test("una no minera no lleva dirección: cobre y oro van a contexto", () => {
  const noMinera = { ...DATOS, sector: "INDUSTRIALES" };
  const r = lecturaEmpresaDeterminista(noMinera, hechosEmpresa(noMinera));
  assert.equal(r.podria_mover.al_alza.length + r.podria_mover.a_la_baja.length, 0);
  const ids = r.contexto.flatMap((p) => p.hechos);
  assert.ok(ids.includes("macro-cobre") && ids.includes("macro-oro"), "los metales sin relación documentada van a contexto");
});

test("un texto con cifra inventada se rechaza y cae a la versión determinista", async () => {
  const badOut = {
    resumen: "La empresa cerró en S/ 10.50; es una estadística, no una promesa.",
    que_hay: [{ texto: "La acción cerró en S/ 99.99 el 5 de noviembre de 2026, según el modelo.", hechos: ["precio"] }],
    podria_mover: { al_alza: [], a_la_baja: [] },
    contexto: [],
  };
  const out = await lecturaEmpresa(DATOS, {
    askJSON: async () => ({ model: "llm-test", out: badOut }),
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  assert.equal(out.determinista, true);
  assert.equal(out.revision.motivo, "versión determinista");
  assert.equal(out.modelo, null, "sin salida confirmada, el modelo no se registra");
});

test("un texto con «subirá» o «recomendamos comprar» se rechaza", async () => {
  const outSubira = await lecturaEmpresa(DATOS, {
    askJSON: async () => ({
      model: "llm-test",
      out: {
        resumen: "La empresa muestra hechos importantes hoy, según el modelo.",
        que_hay: [{ texto: "La acción subirá mañana por el cobre, según el modelo.", hechos: ["macro-cobre"] }],
        podria_mover: { al_alza: [], a_la_baja: [] },
        contexto: [],
      },
    }),
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  assert.equal(outSubira.determinista, true, "«subirá» cae a determinista");

  const outCompra = await lecturaEmpresa(DATOS, {
    askJSON: async () => ({
      model: "llm-test",
      out: {
        resumen: "La empresa muestra hechos importantes hoy, según el modelo.",
        que_hay: [{ texto: "Recomendamos comprar la acción por el cobre.", hechos: ["macro-cobre"] }],
        podria_mover: { al_alza: [], a_la_baja: [] },
        contexto: [],
      },
    }),
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  assert.equal(outCompra.determinista, true, "«comprar» cae a determinista");
});

test("empresa sin hechos: respuesta determinista sin llamar al LLM", async () => {
  let llamadas = 0;
  const out = await lecturaEmpresa(
    { nemo: "VACIA", nombre: "Vacia S.A.A.", hechos_smv: [], noticias: [] },
    {
      askJSON: async () => {
        llamadas++;
        return { model: "llm-test", out: { resumen: "Algo" } };
      },
      revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
    },
  );
  assert.equal(llamadas, 0, "sin hechos no se llama al modelo");
  assert.equal(out.resumen, "Sin hechos de importancia ni noticias en los últimos 7 días.");
  assert.equal(out.determinista, true);
  assert.equal(out.modelo, null);
});

test("un factor con dirección sin relación documentada se mueve a contexto", () => {
  const hechos = hechosEmpresa(DATOS);
  const salida = corregirDireccionEmpresa(
    {
      al_alza: [{ texto: "El petróleo WTI subió 0.50 % en cinco sesiones.", hechos: ["macro-wti"] }],
      a_la_baja: [],
      contexto: [],
    },
    hechos,
    DATOS,
  );
  assert.equal(salida.al_alza.length, 0, "el WTI no empuja a ningún lado");
  assert.equal(salida.contexto.length, 1);
  assert.deepEqual(salida.contexto[0].hechos, ["macro-wti"]);

  const noMinera = { ...DATOS, sector: "INDUSTRIALES" };
  const hechos2 = hechosEmpresa(noMinera);
  const salida2 = corregirDireccionEmpresa(
    {
      al_alza: [{ texto: "El cobre subió 2.10 % en cinco sesiones.", hechos: ["macro-cobre"] }],
      a_la_baja: [],
      contexto: [],
    },
    hechos2,
    noMinera,
  );
  assert.equal(salida2.al_alza.length, 0, "sin sector minero, el cobre no tiene dirección");
  assert.equal(salida2.contexto.length, 1);
});

test("con el revisor caído, solo pasa lo que cumple forma y cifras", async () => {
  const okOut = {
    resumen: "La acción de Mineral Peruana cerró en S/ 10.50 el 5 de noviembre de 2026; es una estadística.",
    que_hay: [{ texto: "La acción de Mineral Peruana cerró en S/ 10.50 el 5 de noviembre de 2026, con una variación de +1.20 % en la última sesión.", hechos: ["precio"] }],
    podria_mover: { al_alza: [], a_la_baja: [] },
    contexto: [],
  };
  const out = await lecturaEmpresa(DATOS, {
    askJSON: async () => ({ model: "llm-test", out: okOut }),
    revisar: async () => null,
  });
  assert.equal(out.determinista, false);
  assert.equal(out.revision.ok, null);
  assert.equal(out.revision.motivo, "revisor no disponible");
  assert.equal(out.modelo, "llm-test");

  const outMalo = await lecturaEmpresa(DATOS, {
    askJSON: async () => ({
      model: "llm-test",
      out: {
        resumen: "La acción de Mineral Peruana cerró en S/ 99.99; es una estadística.",
        que_hay: [{ texto: "La acción cerró en S/ 99.99 el 5 de noviembre de 2026, según el modelo.", hechos: ["precio"] }],
        podria_mover: { al_alza: [], a_la_baja: [] },
        contexto: [],
      },
    }),
    revisar: async () => null,
  });
  assert.equal(outMalo.determinista, true, "sin revisor tampoco pasa la cifra inventada");
});

test("si el revisor rechaza dos veces, la lectura cae a la versión determinista", async () => {
  let intentos = 0;
  const out = await lecturaEmpresa(DATOS, {
    askJSON: async () => {
      intentos++;
      return {
        model: "llm-test",
        out: {
          resumen: "La acción de Mineral Peruana cerró en S/ 10.50 el 5 de noviembre de 2026; es una estadística.",
          que_hay: [{ texto: "La acción de Mineral Peruana cerró en S/ 10.50 el 5 de noviembre de 2026.", hechos: ["precio"] }],
          podria_mover: { al_alza: [], a_la_baja: [] },
          contexto: [],
        },
      };
    },
    revisar: async () => ({ modelo: "revisor-test", ok: false, motivo: "no es fiel a los hechos" }),
  });
  assert.equal(intentos, 2, "el primer intento y un reintento");
  assert.equal(out.determinista, true);
});

test("sin LLM disponible, todo sale determinista", async () => {
  const out = await lecturaEmpresa(DATOS, {});
  assert.equal(out.determinista, true);
  assert.equal(out.modelo, null);
  assert.ok(out.que_hay.length + out.podria_mover.al_alza.length + out.podria_mover.a_la_baja.length + out.contexto.length > 0);
});

test("lecturasEmpresas procesa el lote con concurrencia limitada y devuelve un Map", async () => {
  let enVuelo = 0;
  let pico = 0;
  const lista = ["A", "B", "C", "D", "E"].map((nemo) => ({ ...DATOS, nemo }));
  const salida = await lecturasEmpresas(lista, {
    askJSON: async () => {
      enVuelo++;
      pico = Math.max(pico, enVuelo);
      await new Promise((r) => setTimeout(r, 25));
      enVuelo--;
      return {
        model: "llm-test",
        out: {
          resumen: "La acción de Mineral Peruana cerró en S/ 10.50 el 5 de noviembre de 2026; es una estadística.",
          que_hay: [{ texto: "La acción de Mineral Peruana cerró en S/ 10.50 el 5 de noviembre de 2026.", hechos: ["precio"] }],
          podria_mover: { al_alza: [], a_la_baja: [] },
          contexto: [],
        },
      };
    },
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  assert.equal(salida.size, 5);
  for (const nemo of ["A", "B", "C", "D", "E"]) assert.ok(salida.has(nemo), `falta ${nemo}`);
  assert.ok(pico <= 3, `concurrencia ${pico} supera el límite de 3`);
});
