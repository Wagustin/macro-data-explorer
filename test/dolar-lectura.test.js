import test from "node:test";
import assert from "node:assert/strict";
import { hechosDolar, lecturaDolar, lecturaDeterminista, corregirDireccion } from "../scripts/dolar-lectura.js";

const DATOS = {
  series: {
    PEN: {
      serie: [
        ["2026-11-03", 3.4],
        ["2026-11-04", 3.41],
        ["2026-11-05", 3.42],
        ["2026-11-06", 3.43],
        ["2026-11-07", 3.44],
        ["2026-11-09", 3.45],
      ],
    },
    COBRE: {
      serie: [
        ["2026-11-03", 6.0],
        ["2026-11-04", 6.1],
        ["2026-11-05", 6.2],
        ["2026-11-06", 6.3],
        ["2026-11-07", 6.4],
        ["2026-11-09", 6.5],
      ],
    },
    ORO: {
      serie: [
        ["2026-11-03", 4000],
        ["2026-11-04", 4010],
        ["2026-11-05", 4020],
        ["2026-11-06", 4030],
        ["2026-11-07", 4040],
        ["2026-11-09", 4050],
      ],
    },
    WTI: {
      serie: [
        ["2026-11-03", 90],
        ["2026-11-04", 91],
        ["2026-11-05", 92],
        ["2026-11-06", 93],
        ["2026-11-07", 94],
        ["2026-11-09", 95],
      ],
    },
  },
  contexto: {
    INTERVENCION_BCRP: {
      serie: [
        ["2026-11-03", 10],
        ["2026-11-04", 20],
        ["2026-11-05", 0],
        ["2026-11-06", 5],
        ["2026-11-07", 15],
        ["2026-11-09", 10],
      ],
    },
    TASA_REFERENCIA: { serie: [["2026-11-09", 4.5]] },
    RIN: { serie: [["2026-11-09", 96500]] },
  },
  noticias: [
    {
      titulo: "El BCRP vendió dólares en la mesa cambiaria",
      fuente: "Reuters",
      fecha_iso: "2026-11-09T10:00:00Z",
    },
  ],
  rangos: {
    manana: { p10: 3.4, p50: 3.45, p90: 3.5, fecha: "2026-11-10" },
    semana: { p10: 3.38, p50: 3.45, p90: 3.52, fecha: "2026-11-14" },
    mes: { p10: 3.35, p50: 3.45, p90: 3.55, fecha: "2026-12-09" },
  },
};

test("hechosDolar calcula variaciones y sumas desde las series de ejemplo", () => {
  const hechos = hechosDolar(DATOS);
  const porId = Object.fromEntries(hechos.map((h) => [h.id, h.texto]));

  assert.equal(porId["dolar-1"], "El dólar cerró en S/ 3.450 el 9 de noviembre de 2026, con una variación de +0.29 % en una sesión.");
  assert.equal(porId["dolar-5"], "El dólar cambió +1.47 % en las últimas 5 sesiones (de S/ 3.400 el 3 de noviembre de 2026 a S/ 3.450).");
  assert.equal(porId["cobre-5"], "El cobre acumuló +8.33 % en cinco sesiones, a US$ 6.50 por libra el 9 de noviembre de 2026.");
  assert.equal(porId["oro-5"], "El oro acumuló +1.25 % en cinco sesiones, a US$ 4,050.00 por onza el 9 de noviembre de 2026.");
  assert.equal(porId["wti-5"], "El petróleo WTI acumuló +5.56 % en cinco sesiones, a US$ 95.00 por barril el 9 de noviembre de 2026.");
  assert.equal(porId["intervencion-5"], "La intervención cambiaria del BCRP sumó US$ 50.00 millones en las últimas 5 sesiones.");
  assert.equal(porId["tasa"], "La tasa de referencia del BCRP está en 4.50 % desde el 9 de noviembre de 2026.");
  assert.equal(porId["rin"], "Las reservas internacionales netas fueron de US$ 96,500.00 millones el 9 de noviembre de 2026.");
  assert.match(porId["titular-1"], /Reuters.*BCRP vendió dólares/);
});

test("un texto con cifra inventada se rechaza y cae a la versión determinista", async () => {
  let intentos = 0;
  const badOut = {
    al_alza: [{ texto: "El cobre subió 9.99 % en cinco sesiones, un factor que podría presionar al alza.", hechos: ["cobre-5"] }],
    a_la_baja: [],
    resumen: "El rango va entre S/ 3.400 y S/ 3.500; es una estadística.",
  };
  const out = await lecturaDolar(DATOS, {
    askJSON: async () => {
      intentos++;
      return { model: "llm-test", out: badOut };
    },
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  for (const h of ["manana", "semana", "mes"]) {
    assert.equal(out.horizontes[h].determinista, true, `${h} cae a determinista`);
    assert.equal(out.horizontes[h].revision.motivo, "versión determinista");
  }
  // cada horizonte intentó una vez y el reintento tampoco pasó el control de cifras
  assert.equal(intentos, 6);
});

test("un texto con «subirá» o «recomendamos comprar» se rechaza", async () => {
  const outSubira = await lecturaDolar(DATOS, {
    askJSON: async () => ({
      model: "llm-test",
      out: {
        al_alza: [{ texto: "El dólar subirá mañana por el cobre, según el modelo.", hechos: ["cobre-5"] }],
        a_la_baja: [],
        resumen: "El rango va entre S/ 3.400 y S/ 3.500; es una estadística.",
      },
    }),
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  for (const h of ["manana", "semana", "mes"]) {
    assert.equal(outSubira.horizontes[h].determinista, true, `${h} rechaza «subirá»`);
  }

  const outCompra = await lecturaDolar(DATOS, {
    askJSON: async () => ({
      model: "llm-test",
      out: {
        al_alza: [{ texto: "Recomendamos comprar dólares por el cobre.", hechos: ["cobre-5"] }],
        a_la_baja: [],
        resumen: "El rango va entre S/ 3.400 y S/ 3.500; es una estadística.",
      },
    }),
    revisar: async () => ({ modelo: "revisor-test", ok: true, motivo: "" }),
  });
  for (const h of ["manana", "semana", "mes"]) {
    assert.equal(outCompra.horizontes[h].determinista, true, `${h} rechaza «comprar»`);
  }
});

test("con el revisor caído, solo pasa lo que cumple forma y cifras", async () => {
  const resumenPara = (h) => {
    const r = DATOS.rangos[h];
    return `El rango de ${h} va entre S/ ${r.p10.toFixed(3).replace(".", ".")} y S/ ${r.p90.toFixed(3)}; es una estadística, no una promesa.`;
  };
  const out = await lecturaDolar(DATOS, {
    askJSON: async (prompt) => {
      const h = prompt.includes("mañana") ? "manana" : prompt.includes("próxima semana") ? "semana" : "mes";
      return {
        model: "llm-test",
        out: {
          al_alza: [{ texto: "El cobre subió 8.33 % en cinco sesiones, un factor que podría presionar al alza.", hechos: ["cobre-5"] }],
          a_la_baja: [],
          resumen: resumenPara(h),
        },
      };
    },
    revisar: async () => null,
  });
  for (const h of ["manana", "semana", "mes"]) {
    assert.equal(out.horizontes[h].determinista, false, `${h} pasa sin revisor`);
    assert.equal(out.horizontes[h].revision.ok, null);
    assert.equal(out.horizontes[h].revision.motivo, "revisor no disponible");
    assert.equal(out.horizontes[h].modelo, "llm-test");
  }

  const outMalo = await lecturaDolar(DATOS, {
    askJSON: async () => ({
      model: "llm-test",
      out: {
        al_alza: [{ texto: "El cobre subió 9.99 % en cinco sesiones, un factor que podría presionar al alza.", hechos: ["cobre-5"] }],
        a_la_baja: [],
        resumen: "El rango va entre S/ 3.400 y S/ 3.500; es una estadística.",
      },
    }),
    revisar: async () => null,
  });
  for (const h of ["manana", "semana", "mes"]) {
    assert.equal(outMalo.horizontes[h].determinista, true, `${h} sin revisor no pasa cifras inventadas`);
  }
});

// ---- Dirección económica: el cobre es el único factor con sentido documentado ----
const H = (id, texto) => ({ id, texto, fuente: "BCRP" });
const RANGO = { p10: 3.43, p50: 3.45, p90: 3.47 };

test("cobre a la baja presiona el dólar al alza; cobre al alza, a la baja", () => {
  const baja = lecturaDeterminista([H("cobre-5", "El cobre acumuló −3.23 % en cinco sesiones, a US$ 6.44 por libra el 4 de noviembre de 2026.")], RANGO, "manana");
  assert.equal(baja.al_alza.length, 1);
  assert.equal(baja.a_la_baja.length, 0);
  assert.match(baja.al_alza[0].texto, /sol más débil/);
  const sube = lecturaDeterminista([H("cobre-5", "El cobre acumuló +2.10 % en cinco sesiones, a US$ 6.60 por libra el 4 de noviembre de 2026.")], RANGO, "manana");
  assert.equal(sube.a_la_baja.length, 1);
  assert.equal(sube.al_alza.length, 0);
  assert.match(sube.a_la_baja[0].texto, /sol más fuerte/);
});

test("un cobre casi plano (menos de 1 %) no empuja a ningún lado", () => {
  const r = lecturaDeterminista([H("cobre-5", "El cobre acumuló +0.40 % en cinco sesiones, a US$ 6.50 por libra el 4 de noviembre de 2026.")], RANGO, "manana");
  assert.equal(r.al_alza.length + r.a_la_baja.length, 0);
});

test("oro, petróleo, la intervención del BCRP y los movimientos del dólar no tienen dirección: van a contexto", () => {
  const hechos = [
    H("oro-5", "El oro acumuló +3.10 % en cinco sesiones, a US$ 4,100.00 por onza el 4 de noviembre de 2026."),
    H("wti-5", "El petróleo WTI acumuló −14.26 % en cinco sesiones, a US$ 88.12 por barril el 4 de noviembre de 2026."),
    H("intervencion-5", "La intervención cambiaria del BCRP sumó US$ 9.00 millones en las últimas 5 sesiones."),
    H("dolar-5", "El dólar cambió −0.26 % en las últimas 5 sesiones (de S/ 3.461 el 29 de octubre de 2026 a S/ 3.452)."),
  ];
  const r = lecturaDeterminista(hechos, RANGO, "manana");
  assert.equal(r.al_alza.length + r.a_la_baja.length, 0);
  const ids = r.contexto.flatMap((p) => p.hechos);
  assert.ok(ids.includes("intervencion-5") && ids.includes("dolar-5"));
  assert.ok(!ids.includes("oro-5") && !ids.includes("wti-5"), "oro y petróleo ni se mencionan sin relación clara");
});

test("la guardia de dirección corrige al modelo: cobre al alza en la lista equivocada pasa a la correcta", () => {
  const hechos = [H("cobre-5", "El cobre acumuló +2.10 % en cinco sesiones, a US$ 6.60 por libra el 4 de noviembre de 2026."), H("oro-5", "El oro acumuló +3.10 % en cinco sesiones, a US$ 4,100.00 por onza el 4 de noviembre de 2026.")];
  const salida = corregirDireccion({
    al_alza: [{ texto: "El cobre subió 2,10 % en cinco sesiones.", hechos: ["cobre-5"] }, { texto: "El oro subió 3,10 % en cinco sesiones.", hechos: ["oro-5"] }],
    a_la_baja: [],
  }, hechos);
  assert.equal(salida.al_alza.length, 0);
  assert.equal(salida.a_la_baja.length, 1);
  assert.deepEqual(salida.a_la_baja[0].hechos, ["cobre-5"]);
  assert.deepEqual(salida.contexto.map((p) => p.hechos[0]), ["oro-5"]);
});
