import test from "node:test";
import assert from "node:assert/strict";
import { hechosDolar, lecturaDolar } from "../scripts/dolar-lectura.js";

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
