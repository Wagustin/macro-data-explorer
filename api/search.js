// PerData search catalog: SMV-listed Peruvian companies, macro indicators, and
// assets backed by the official datasets in data/official/.
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";

export const CATALOG = [
  { symbol: "SCCO.LM", name: "Southern Copper Corporation", sector: "Minería", country: "Perú / México", category: "bvl_pe", tags: ["cobre", "toquepala", "cuajone", "bvl", "spcc"] },
  { symbol: "VOLCABC1.LM", name: "Volcan Compañía Minera S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["zinc", "plata", "plomo", "cerro", "de", "pasco", "chungar"] },
  { symbol: "MINSURI1.LM", name: "Minsur S.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["estano", "oro", "san", "rafael", "pucamarca"] },
  { symbol: "NEXAPEC1.LM", name: "Nexa Resources Perú S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["zinc", "plomo", "cerro", "lindo", "nexa"] },
  { symbol: "CPACASC1.LM", name: "Cementos Pacasmayo S.A.A.", sector: "Construcción / Cemento", country: "Perú", category: "bvl_pe", tags: ["cemento", "concreto", "norte"] },
  { symbol: "UNACEMC1.LM", name: "UNACEM Corp S.A.A.", sector: "Construcción / Cemento", country: "Perú", category: "bvl_pe", tags: ["cemento", "lima", "unacem"] },
  { symbol: "SIDERC1.LM", name: "Empresa Siderúrgica del Perú S.A.A.", sector: "Industriales / Aceros", country: "Perú", category: "bvl_pe", tags: ["aceros", "siderurgia", "chimbote"] },
  { symbol: "ALICORC1.LM", name: "Alicorp S.A.A.", sector: "Consumo Masivo", country: "Perú", category: "bvl_pe", tags: ["alimentos", "primor", "don", "vittorio", "aceites", "fideos"] },
  { symbol: "BACKUSI1.LM", name: "Unión de Cervecerías Peruanas Backus y Johnston S.A.A.", sector: "Consumo Masivo", country: "Perú", category: "bvl_pe", tags: ["cerveza", "pilsen", "cristal", "backus", "abinbev"] },
  { symbol: "FERREYC1.LM", name: "Ferreycorp S.A.A.", sector: "Bienes de Capital", country: "Perú", category: "bvl_pe", tags: ["caterpillar", "maquinaria", "minera", "ferreyros"] },
  { symbol: "AUSTRAC1.LM", name: "Austral Group S.A.A.", sector: "Pesca / Consumo", country: "Perú", category: "bvl_pe", tags: ["pesca", "anchoveta", "harina", "austral"] },
  { symbol: "AENZAC1.LM", name: "AENZA S.A.A.", sector: "Industriales / Infraestructura", country: "Perú", category: "bvl_pe", tags: ["construccion","infraestructura","energia"] },
  { symbol: "ATACOBC1.LM", name: "Nexa Resources Atacocha S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["oro","zinc","plata","mineria"] },
  { symbol: "BBVAC1.LM", name: "Banco BBVA Perú", sector: "Banca y Finanzas", country: "Perú", category: "bvl_pe", tags: ["banco","bbva","finanzas"] },
  { symbol: "BROCALC1.LM", name: "Sociedad Minera El Brocal S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["mineria","plata","zinc","brocal"] },
  { symbol: "CARTAVC1.LM", name: "Cartavio S.A.A.", sector: "Agroindustria", country: "Perú", category: "bvl_pe", tags: ["azucar","agroindustria","cartavio"] },
  { symbol: "CASAGRC1.LM", name: "Casa Grande S.A.A.", sector: "Agroindustria", country: "Perú", category: "bvl_pe", tags: ["azucar","agroindustria","casa","grande"] },
  { symbol: "CORAREI1.LM", name: "Corporación Aceros Arequipa S.A.", sector: "Industriales / Aceros", country: "Perú", category: "bvl_pe", tags: ["acero","siderurgia","arequipa"] },
  { symbol: "CREDITC1.LM", name: "Banco de Crédito del Perú", sector: "Banca y Finanzas", country: "Perú", category: "bvl_pe", tags: ["banco","credito","bcp","finanzas"] },
  { symbol: "CVERDEC1.LM", name: "Sociedad Minera Cerro Verde S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["cobre","mineria","arequipa","cerro"] },
  { symbol: "ENGIEC1.LM", name: "Engie Energía Perú S.A.A.", sector: "Energía", country: "Perú", category: "bvl_pe", tags: ["energia","electricidad","engie"] },
  { symbol: "FIBPRIME.LM", name: "FIBRA Prime", sector: "Bienes Raíces", country: "Perú", category: "bvl_pe", tags: ["fibra","inmobiliario","renta"] },
  { symbol: "HIDRA2C1.LM", name: "Hidrandina S.A.", sector: "Servicios Públicos", country: "Perú", category: "bvl_pe", tags: ["electricidad","energia","hidrandina"] },
  { symbol: "INRETC1.LM", name: "InRetail Perú Corp.", sector: "Consumo / Retail", country: "Perú", category: "bvl_pe", tags: ["retail","tiendas","consumo"] },
  { symbol: "IPCHBC1.LM", name: "Inversiones Portuarias Chancay S.A.A.", sector: "Industriales / Infraestructura", country: "Perú", category: "bvl_pe", tags: ["puerto","chancay","logistica"] },
  { symbol: "LUSURC1.LM", name: "Luz del Sur S.A.A.", sector: "Servicios Públicos", country: "Perú", category: "bvl_pe", tags: ["electricidad","energia","lima"] },
  { symbol: "PODERC1.LM", name: "Compañía Minera Poderosa S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["oro","mineria","poderosa"] },
  { symbol: "POMALCC1.LM", name: "Empresa Agroindustrial Pomalca S.A.A.", sector: "Agroindustria", country: "Perú", category: "bvl_pe", tags: ["azucar","agroindustria","pomalca"] },
  { symbol: "SPCCPI1.LM", name: "Southern Peru Copper Corporation - Sucursal del Perú", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["cobre","mineria","southern","peru"] },
  { symbol: "PERU_CPI", name: "Inflación Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro_pe", tags: ["inflacion", "cpi", "ipc", "bcrp", "banco", "mundial"] },
  { symbol: "PERU_GDP", name: "Crecimiento PBI Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro_pe", tags: ["pbi", "gdp", "crecimiento", "banco", "mundial"] },
  { symbol: "COSAPI", name: "Cosapi S.A.", sector: "Conglomerado Industrial y Construcción", country: "Perú", category: "unlisted", tags: ["cosapi", "construccion", "ingenieria", "mineria", "aviacion", "real", "estate"] },
  { symbol: "ANTAMINA-PRIV", name: "Compañía Minera Antamina", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["antamina", "cobre", "zinc", "joint", "venture"] },
  { symbol: "CERROVERDE-PRIV", name: "Sociedad Minera Cerro Verde", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["cerro", "verde", "cobre", "arequipa", "freeport"] },
  { symbol: "TINTAYA-PRIV", name: "Constancia / Tintaya (Hudbay)", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["tintaya", "constancia", "hudbay", "cobre"] },
  { symbol: "TALMA-PRIV", name: "Talma Servicios Aeroportuarios", sector: "Servicios y Logística (privada)", country: "Perú", category: "unlisted", tags: ["talma", "aeropuertos", "logistica"] },
  { symbol: "DANPER-PRIV", name: "Danper Trujillo", sector: "Agroindustria (privada)", country: "Perú", category: "unlisted", tags: ["danper", "agro", "esparragos", "palta", "exportacion"] },
  { symbol: "CAMPOSOL-PRIV", name: "Camposol Holding", sector: "Agroindustria (privada)", country: "Perú", category: "unlisted", tags: ["camposol", "palta", "mango", "arandano", "agro"] },
  { symbol: "NEWMONT-PRIV", name: "Minera Yanacocha (Newmont)", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["yanacocha", "oro", "cajamarca", "newmont"] },
  { symbol: "GloriaPRIV", name: "Gloria Foods International", sector: "Consumo (matriz offshore)", country: "Perú", category: "unlisted", tags: ["gloria", "matriz", "offshore"] },
  { symbol: "PAMOLPER-PRIV", name: "Palmas del Espino (Grupo Romero)", sector: "Agroindustria (privada)", country: "Perú", category: "unlisted", tags: ["palmas", "espino", "romero", "palma", "aceite"] },
  { symbol: "FERREYROS-PRIV", name: "Ferreyros S.A. (Caterpillar Perú)", sector: "Bienes de Capital (privada)", country: "Perú", category: "unlisted", tags: ["ferreyros", "caterpillar"] },
  { symbol: "QUIMPAC-PRIV", name: "Quimpac S.A. (química)", sector: "Química (privada)", country: "Perú", category: "unlisted", tags: ["quimpac", "quimica", "cloro", "sosa"] },
  { symbol: "LUCH-PRIV", name: "Lucchetti Perú (Adriano Lucchetti)", sector: "Consumo Masivo (BVL suspendida)", country: "Perú", category: "unlisted", tags: ["lucchetti", "fideos", "pasta", "consumo"] },
  { symbol: "CAJAARE-PRIV", name: "Caja Municipal Arequipa (CMAC)", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "arequipa", "cmac", "cmac-arequipa", "banca"] },
  { symbol: "CAJACUS-PRIV", name: "Caja Municipal Cusco", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "cusco", "cmac"] },
  { symbol: "CAJAHUA-PRIV", name: "Caja Municipal Huancayo", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "huancayo", "cmac"] },
  { symbol: "CAJAPIU-PRIV", name: "Caja Municipal Piura", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "piura", "cmac"] },
  { symbol: "CAJASUL-PRIV", name: "Caja Municipal Sullana", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "sullana", "cmac"] },
  { symbol: "CAJATRU-PRIV", name: "Caja Municipal Trujillo", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "trujillo", "cmac"] },
  { symbol: "SIDERPERU-PRIV", name: "Siderperu (Siderurgia)", sector: "Industriales (ver ticker SIDERC1.LM)", country: "Perú", category: "unlisted", tags: ["siderperu", "sider", "aceros", "chimbote"] },
  { symbol: "DIREKTP-PRIV", name: "Distribuidora Dtcar (DTC)", sector: "Retail automotriz (privada)", country: "Perú", category: "unlisted", tags: ["dtcar", "dtc", "autos", "retail"] },
  { symbol: "PLUZENER-PRIV", name: "Pluz Energía Perú (ex Enso)", sector: "Utilities (privada)", country: "Perú", category: "unlisted", tags: ["pluz", "energia", "electricidad", "enoso"] },
  { symbol: "GILATPER-PRIV", name: "Gilat Perú (satelital)", sector: "Telecom (privada)", country: "Perú", category: "unlisted", tags: ["gilat", "satelital", "telecom"] },
  { symbol: "ALUMINIO", name: "Aluminio", sector: "Metales", country: "Global", category: "macro_pe", tags: ['aluminio'] },
  { symbol: "ESTANO", name: "Estaño", sector: "Metales", country: "Global", category: "macro_pe", tags: ['estano'] },
  { symbol: "NIQUEL", name: "Níquel", sector: "Metales", country: "Global", category: "macro_pe", tags: ['niquel'] },
  { symbol: "PLOMO", name: "Plomo", sector: "Metales", country: "Global", category: "macro_pe", tags: ['plomo'] },
  { symbol: "ZINC", name: "Zinc", sector: "Metales", country: "Global", category: "macro_pe", tags: ['zinc'] },
  { symbol: "MINERAL_HIERRO", name: "Mineral de hierro", sector: "Metales", country: "Global", category: "macro_pe", tags: ['hierro'] },
  { symbol: "PEN=X", name: "Tipo de cambio USD/PEN", sector: "Divisas", country: "Global", category: "fx", tags: ['dolar', 'sol', 'cambio'] },
  { symbol: "HG=F", name: "Cobre (serie oficial)", sector: "Metales", country: "Global", category: "commodity", tags: ['cobre'] },
  { symbol: "GC=F", name: "Oro (serie oficial)", sector: "Metales", country: "Global", category: "commodity", tags: ['oro'] },
  { symbol: "SI=F", name: "Plata (serie oficial)", sector: "Metales", country: "Global", category: "commodity", tags: ['plata'] },
  { symbol: "CL=F", name: "Petróleo WTI", sector: "Energía", country: "Global", category: "commodity", tags: ['petroleo', 'wti'] },
  { symbol: "BZ=F", name: "Petróleo Brent", sector: "Energía", country: "Global", category: "commodity", tags: ['petroleo', 'brent'] },
  { symbol: "PL=F", name: "Platino", sector: "Metales", country: "Global", category: "commodity", tags: ['platino'] },
  { symbol: "NG=F", name: "Gas natural de EE.UU.", sector: "Energía", country: "Global", category: "commodity", tags: ['gas', 'natural'] },
  { symbol: "ZW=F", name: "Trigo", sector: "Agricultura", country: "Global", category: "commodity", tags: ['trigo'] },
  { symbol: "ZC=F", name: "Maíz", sector: "Agricultura", country: "Global", category: "commodity", tags: ['maiz'] },
  { symbol: "ZS=F", name: "Soja", sector: "Agricultura", country: "Global", category: "commodity", tags: ['soya', 'soja'] },
  { symbol: "SB=F", name: "Azúcar", sector: "Agricultura", country: "Global", category: "commodity", tags: ['azucar'] },
  { symbol: "CC=F", name: "Cacao", sector: "Agricultura", country: "Global", category: "commodity", tags: ['cacao'] },
  { symbol: "KC=F", name: "Café arábica", sector: "Agricultura", country: "Global", category: "commodity", tags: ['cafe'] },
  { symbol: "EURUSD=X", name: "Euro / Dólar (EUR/USD)", sector: "Divisas", country: "Global", category: "fx", tags: ['euro', 'dolar'] },
  { symbol: "USDJPY=X", name: "Dólar / Yen (USD/JPY)", sector: "Divisas", country: "Global", category: "fx", tags: ['dolar', 'yen'] },
  { symbol: "USDMXN=X", name: "Dólar / Peso mexicano", sector: "Divisas", country: "Global", category: "fx", tags: ['mexico', 'peso'] },
  { symbol: "USDBRL=X", name: "Dólar / Real brasileño", sector: "Divisas", country: "Global", category: "fx", tags: ['brasil', 'real'] },
  { symbol: "USDCNY=X", name: "Dólar / Yuan chino", sector: "Divisas", country: "Global", category: "fx", tags: ['china', 'yuan'] },
  { symbol: "USDCAD=X", name: "Dólar canadiense por USD", sector: "Divisas", country: "Global", category: "fx", tags: ['canada'] },
  { symbol: "USDCHF=X", name: "Franco suizo por USD", sector: "Divisas", country: "Global", category: "fx", tags: ['suiza', 'franco'] },
  { symbol: "GBPUSD=X", name: "Libra / Dólar (GBP/USD)", sector: "Divisas", country: "Global", category: "fx", tags: ['libra'] },
  { symbol: "AUDUSD=X", name: "Dólar australiano / USD", sector: "Divisas", country: "Global", category: "fx", tags: ['australia'] },
  { symbol: "DX-Y.NYB", name: "Índice amplio del dólar (Reserva Federal)", sector: "Divisas", country: "Global", category: "fx", tags: ['dolar', 'indice'] },
  { symbol: "^TNX", name: "Rendimiento del Tesoro de EE.UU. a 10 años", sector: "Tasas", country: "Global", category: "fx", tags: ['tesoro', 'bonos'] },
  { symbol: "^TYX", name: "Rendimiento del Tesoro de EE.UU. a 30 años", sector: "Tasas", country: "Global", category: "fx", tags: ['tesoro', 'bonos'] },
  { symbol: "^FVX", name: "Rendimiento del Tesoro de EE.UU. a 5 años", sector: "Tasas", country: "Global", category: "fx", tags: ['tesoro', 'bonos'] },
];

export default async function handler(req, res) {
  applyCors(req, res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (handleRateLimit(req, res)) {
    return;
  }

  const hasAuth = Boolean(req.headers?.authorization);
  setCdnCache(res, hasAuth);

  const tradable = CATALOG.filter(c => c.category !== "unlisted").length;
  const total = CATALOG.length;

  if (req.query.stats === "1" || req.query.stats === "true") {
    return res.status(200).json({ tradable, total });
  }

  let q = String(req.query.q || "").trim().toLowerCase();
  if (q.length > 50) q = q.slice(0, 50);

  if (!q) {
    return res.status(200).json({ results: CATALOG.filter(c => c.category !== "unlisted").slice(0, 15), total, tradable });
  }

  // Split query into words: every word must match somewhere (AND search)
  const words = q.split(/\s+/).filter(Boolean);
  const matchesWord = (item, w) =>
    item.symbol.toLowerCase().includes(w) ||
    item.name.toLowerCase().includes(w) ||
    item.sector.toLowerCase().includes(w) ||
    item.country.toLowerCase().includes(w) ||
    item.tags.some(t => t.toLowerCase().includes(w));
  const localMatches = CATALOG.filter(item => words.every(w => matchesWord(item, w)));

  // Ranked: exact-name & BVL first, unlisted last (so tradable assets surface first)
  localMatches.sort((a, b) => {
    const score = (x) => (x.category === "unlisted" ? 2 : 0) + (x.name.toLowerCase().startsWith(q) ? -1 : 0);
    return score(a) - score(b);
  });

  if (localMatches.length >= 8) {
    return res.status(200).json({ results: localMatches.slice(0, 15), total, tradable });
  }


  return res.status(200).json({ results: localMatches.slice(0, 15), total, tradable });
}
