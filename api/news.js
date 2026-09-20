import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, "../data/news-cache.json");

export const FALLBACK_NEWS = [
  {
    id: "news-1",
    impact: "BCRP",
    impactColor: "blue",
    title: "BCRP mantiene tasa de referencia en 5.00% y ratifica anclaje de expectativas de inflación en rango meta",
    source: "Reuters / BCRP",
    url: "https://www.bcrp.gob.pe",
    time: "hace 8m",
    symbol: "PEN=X"
  },
  {
    id: "news-2",
    impact: "ALTO IMPACTO",
    impactColor: "red",
    title: "Cobre COMEX repunta +2.4% superando los $4.48/lb ante restricciones de oferta en fundiciones globales",
    source: "Bloomberg",
    url: "https://www.bloomberg.com",
    time: "hace 15m",
    symbol: "HG=F"
  },
  {
    id: "news-3",
    impact: "MINERÍA",
    impactColor: "amber",
    title: "Minas Buenaventura (BVN) eleva guía de producción de plata y oro tras optimización en Yumpag y Uchucchacua",
    source: "Gestión",
    url: "https://gestion.pe",
    time: "hace 24m",
    symbol: "BVN"
  },
  {
    id: "news-4",
    impact: "DIVISAS",
    impactColor: "emerald",
    title: "Tipo de cambio USD/PEN consolida soporte en S/ 3.74 con flujo sostenido de ventas corporativas y mineras",
    source: "SEMANAeconómica",
    url: "https://semanaeconomica.com",
    time: "hace 35m",
    symbol: "PEN=X"
  },
  {
    id: "news-5",
    impact: "FED",
    impactColor: "purple",
    title: "Rendimiento del bono del Tesoro EE.UU. a 10 años modera a 4.22% tras datos laborales y de inflación",
    source: "Financial Times",
    url: "https://www.ft.com",
    time: "hace 42m",
    symbol: "^TNX"
  },
  {
    id: "news-6",
    impact: "COBRE",
    impactColor: "amber",
    title: "Southern Copper (SCCO) proyecta incremento del 8% en despacho de cátodos ante normalización logística",
    source: "Mining.com",
    url: "https://www.mining.com",
    time: "hace 55m",
    symbol: "SCCO"
  },
  {
    id: "news-7",
    impact: "MACRO",
    impactColor: "blue",
    title: "Producción minera peruana aporta 1.8 puntos porcentuales al crecimiento desestacionalizado del PBI",
    source: "INEI / BCRP",
    url: "https://www.inei.gob.pe",
    time: "hace 1h",
    symbol: "PERU_GDP"
  },
  {
    id: "news-8",
    impact: "ORO",
    impactColor: "amber",
    title: "Oro al contado registra nuevo máximo histórico impulsado por demanda de cobertura de bancos centrales",
    source: "LME / BullionVault",
    url: "https://www.bullionvault.com",
    time: "hace 1h 20m",
    symbol: "GC=F"
  }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let newsList = FALLBACK_NEWS;
  let updatedAt = new Date().toISOString();

  try {
    if (fs.existsSync(CACHE_PATH)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
      if (cached && Array.isArray(cached.news) && cached.news.length > 0) {
        newsList = cached.news;
        updatedAt = cached.updatedAt || updatedAt;
      }
    }
  } catch (e) {
    console.warn("No se pudo leer news-cache.json, utilizando fallback:", e.message);
  }

  return res.status(200).json({
    status: "ok",
    source: "MacroData Intelligence Feed Pipeline",
    updatedAt,
    count: newsList.length,
    news: newsList
  });
}
