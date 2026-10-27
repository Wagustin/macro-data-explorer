// Applies a model response to one batch without mutating the published feed.
export function classifyBatch(batch, response, { knownCompanies, marketTerms }) {
  if (!Array.isArray(batch) || !Array.isArray(response)) return { classified: [], discarded: [], seen: new Set() };

  const seen = new Set();
  const classified = [];
  const discarded = [];
  for (const label of response) {
    const index = label?.i;
    if (!Number.isInteger(index) || index < 0 || index >= batch.length || seen.has(index)) continue;
    const news = batch[index];
    if (!news || !["ALTA", "MEDIA", "BAJA", "NINGUNA"].includes(label.relevante)) continue;
    seen.add(index);
    if (label.relevante === "NINGUNA" && !marketTerms.test(news.titulo)) {
      discarded.push(news.id);
      continue;
    }
    classified.push({
      id: news.id,
      item: {
        relevancia: label.relevante,
        tema: label.tema,
        sentimiento: label.sentimiento,
        empresas: (Array.isArray(label.empresas) ? label.empresas : []).filter((company) => knownCompanies.has(company)),
      },
    });
  }
  return { classified, discarded, seen };
}
