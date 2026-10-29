const TOPICS = {
  currency: ["Dólar y BCRP", "Mundo", "Economía y fiscal"],
  metals: ["Minería y metales", "Mundo"],
  energy: ["Energía", "Mundo"],
  rates: ["Mundo"],
  equities: ["Bolsa y empresas"],
};

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function topicsForAsset(asset) {
  if (asset.symbol === "PEN=X" || asset.sector === "Divisas") return TOPICS.currency;
  if (asset.sector === "Metales" || asset.category === "commodity" && ["HG=F", "GC=F", "SI=F", "PL=F"].includes(asset.symbol)) return TOPICS.metals;
  if (asset.sector === "Energía" || ["CL=F", "BZ=F", "NG=F"].includes(asset.symbol)) return TOPICS.energy;
  if (asset.sector === "Tasas") return TOPICS.rates;
  if (asset.category === "bvl_pe") {
    const sectorTopic = asset.sector === "Minería" ? "Minería y metales"
      : asset.sector === "Energía" ? "Energía" : asset.sector === "Banca y Finanzas" ? "Economía y fiscal" : "Bolsa y empresas";
    return [asset.name, sectorTopic, ...TOPICS.equities];
  }
  return ["Mundo", "Economía y fiscal"];
}

export function selectHeadlines({ asset, news = [], labels = {}, since }) {
  const name = normalize(asset.name);
  const ticker = normalize(asset.symbol.replace(/\.LM$/, ""));
  const directTerms = [name, ticker].filter((term) => term.length > 2);
  const fresh = news.filter((item) => item.fecha_iso && item.fecha_iso.slice(0, 10) >= since && labels[item.id]);
  const direct = fresh.filter((item) => {
    const label = labels[item.id];
    const companies = (label.empresas || []).map(normalize);
    const text = normalize(`${item.titulo} ${item.resumen || ""}`);
    return companies.includes(ticker) || directTerms.some((term) => text.includes(term));
  });
  const candidates = direct.length ? direct : fresh.filter((item) => topicsForAsset(asset).some((topic) => normalize(topic) === normalize(labels[item.id]?.tema)));
  const relevance = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  return candidates.sort((a, b) => (relevance[labels[a.id]?.relevancia] ?? 3) - (relevance[labels[b.id]?.relevancia] ?? 3)
    || Date.parse(b.fecha_iso) - Date.parse(a.fecha_iso)).slice(0, 6).map((item) => ({
    id: item.id, titulo: item.titulo, fuente: item.fuente || "", fecha: item.fecha_iso,
    url: item.url, sentimiento: labels[item.id]?.sentimiento || "NEUTRO",
  }));
}

export function sentimentAverage(headlines = []) {
  if (!headlines.length) return "sin titulares";
  const score = headlines.reduce((sum, item) => sum + ({ POSITIVO: 1, NEGATIVO: -1 }[item.sentimiento] || 0), 0) / headlines.length;
  return score > 0.15 ? "positivo" : score < -0.15 ? "negativo" : "neutro";
}

export function validCitations(value, candidates) {
  if (!Array.isArray(value)) return [];
  const allowed = new Map(candidates.map((item) => [item.id, item]));
  const seen = new Set();
  return value.flatMap((item) => {
    const candidate = allowed.get(item?.id);
    if (!candidate || seen.has(candidate.id) || !/^https:\/\//i.test(candidate.url || "")) return [];
    seen.add(candidate.id);
    return [{ id: candidate.id, titulo: candidate.titulo, fuente: candidate.fuente, fecha: candidate.fecha, url: candidate.url }];
  }).slice(0, 3);
}
