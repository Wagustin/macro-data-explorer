import bcrp from "../../data/official/bcrp-daily.json" with { type: "json" };
import eia from "../../data/official/eia-oil.json" with { type: "json" };
import worldBank from "../../data/official/wb-metals.json" with { type: "json" };
import fed from "../../data/official/fed-fx-rates.json" with { type: "json" };

// `mensual` describes how daily observations become monthly chart/history values.
export const SOURCES = {
  "PEN=X": { fuente: "bcrp", clave: "PEN", etiqueta: "BCRP (tipo de cambio SBS, venta)", unidad: "PEN por USD", mensual: "ultimo" },
  "HG=F": { fuente: "bcrp", clave: "COBRE", etiqueta: "BCRP (cobre, Londres)", unidad: "USD por tonelada métrica", mensual: "ultimo" },
  "GC=F": { fuente: "bcrp", clave: "ORO", etiqueta: "BCRP (oro, Londres)", unidad: "USD por onza troy", mensual: "ultimo" },
  "SI=F": { fuente: "bcrp", clave: "PLATA", etiqueta: "BCRP (plata, Londres)", unidad: "USD por onza troy", mensual: "ultimo" },
  "CL=F": { fuente: "eia", clave: "WTI", etiqueta: "EIA (petróleo WTI spot)", unidad: "USD por barril", mensual: "ultimo" },
  "BZ=F": { fuente: "eia", clave: "BRENT", etiqueta: "EIA (petróleo Brent spot)", unidad: "USD por barril", mensual: "ultimo" },
  "PL=F": { fuente: "worldBank", clave: "PLATINO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por onza troy", mensual: "media" },
  "NG=F": { fuente: "worldBank", clave: "GAS_US", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por millón de BTU", mensual: "media" },
  "ZW=F": { fuente: "worldBank", clave: "TRIGO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  "ZC=F": { fuente: "worldBank", clave: "MAIZ", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  "ZS=F": { fuente: "worldBank", clave: "SOYA", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  "SB=F": { fuente: "worldBank", clave: "AZUCAR", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por kilogramo", mensual: "media" },
  "CC=F": { fuente: "worldBank", clave: "CACAO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por kilogramo", mensual: "media" },
  "KC=F": { fuente: "worldBank", clave: "CAFE", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por kilogramo", mensual: "media" },
  "EURUSD=X": { fuente: "fed", clave: "EURUSD", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "USD por EUR", mensual: "ultimo" },
  "USDJPY=X": { fuente: "fed", clave: "USDJPY", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "JPY por USD", mensual: "ultimo" },
  "USDMXN=X": { fuente: "fed", clave: "USDMXN", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "MXN por USD", mensual: "ultimo" },
  "USDBRL=X": { fuente: "fed", clave: "USDBRL", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "BRL por USD", mensual: "ultimo" },
  "USDCNY=X": { fuente: "fed", clave: "USDCNY", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "CNY por USD", mensual: "ultimo" },
  "USDCAD=X": { fuente: "fed", clave: "USDCAD", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "CAD por USD", mensual: "ultimo" },
  "USDCHF=X": { fuente: "fed", clave: "USDCHF", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "CHF por USD", mensual: "ultimo" },
  "GBPUSD=X": { fuente: "fed", clave: "GBPUSD", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "USD por GBP", mensual: "ultimo" },
  "AUDUSD=X": { fuente: "fed", clave: "AUDUSD", etiqueta: "Junta de la Reserva Federal (H.10)", unidad: "USD por AUD", mensual: "ultimo" },
  "DX-Y.NYB": { fuente: "fed", clave: "DXY_AMPLIO", etiqueta: "Índice amplio del dólar (Reserva Federal)", unidad: "Índice, enero de 1997 = 100", mensual: "ultimo" },
  "^TNX": { fuente: "fed", clave: "UST10Y", etiqueta: "Junta de la Reserva Federal (H.15)", unidad: "% anual", mensual: "ultimo" },
  "^TYX": { fuente: "fed", clave: "UST30Y", etiqueta: "Junta de la Reserva Federal (H.15)", unidad: "% anual", mensual: "ultimo" },
  "^FVX": { fuente: "fed", clave: "UST5Y", etiqueta: "Junta de la Reserva Federal (H.15)", unidad: "% anual", mensual: "ultimo" },
  ALUMINIO: { fuente: "worldBank", clave: "ALUMINIO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  ESTANO: { fuente: "worldBank", clave: "ESTANO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  NIQUEL: { fuente: "worldBank", clave: "NIQUEL", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  PLOMO: { fuente: "worldBank", clave: "PLOMO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  ZINC: { fuente: "worldBank", clave: "ZINC", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por tonelada métrica", mensual: "media" },
  MINERAL_HIERRO: { fuente: "worldBank", clave: "MINERAL_HIERRO", etiqueta: "Banco Mundial (CC BY 4.0)", unidad: "USD por unidad de hierro seco", mensual: "media" },
};

export const DATASETS = { bcrp, eia, worldBank, fed };

export function sourcePoints(symbol) {
  const source = SOURCES[symbol];
  if (!source) return null;
  const raw = DATASETS[source.fuente]?.series?.[source.clave];
  const values = Array.isArray(raw) ? raw : raw?.serie;
  if (!Array.isArray(values)) return null;
  return values
    .filter(([date, value]) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(date) && Number.isFinite(Number(value)))
    .map(([date, value]) => [date.length === 7 ? `${date}-01` : date, Number(value)]);
}

export function monthlyPoints(points, method = "ultimo") {
  const months = new Map();
  for (const [date, value] of points || []) {
    const month = date.slice(0, 7);
    const row = months.get(month) || { last: value, sum: 0, count: 0 };
    row.last = value;
    row.sum += value;
    row.count++;
    months.set(month, row);
  }
  return [...months].map(([month, row]) => [month, method === "media" ? row.sum / row.count : row.last]);
}
