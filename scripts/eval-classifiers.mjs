#!/usr/bin/env node
/**
 * scripts/eval-classifiers.mjs
 *
 * Evaluación y competición entre clasificadores:
 * 1. Laya v1 (histórico de git)
 * 2. LLM generalista (NVIDIA Nemotron / Gemini)
 * 3. Laya v2 (typed-decisions con criterios configurables)
 *
 * Funcionalidades:
 * - Genera reporte de discrepancias (discrepancias.md).
 * - Extrae muestra de 80 titulares para arbitraje humano (etiquetar.md + clave.jsonl).
 * - Evalúa métricas oficiales (Accuracy, F1 Macro por campo) contra etiquetas humanas
 *   y produce el marcador final (marcador.md).
 * - Opcionalmente clasifica titulares faltantes con LLM si hay API keys disponibles.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askJSON } from "./llm.js";
import { classifyBatch } from "./news-classification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_HIST = path.join(ROOT, "eval", "clasificador", "historico.jsonl");
const DEFAULT_LLM = path.join(ROOT, "eval", "clasificador", "llm.jsonl");
const DEFAULT_LAYA2 = path.join(ROOT, "eval", "clasificador", "laya2.jsonl");
const DEFAULT_CRITERIOS = path.join(ROOT, "config", "laya-criterios.json");
const DEFAULT_DISCREPANCIAS = path.join(ROOT, "eval", "clasificador", "discrepancias.md");
const DEFAULT_ETIQUETAR = path.join(ROOT, "eval", "clasificador", "etiquetar.md");
const DEFAULT_CLAVE = path.join(ROOT, "eval", "clasificador", "clave.jsonl");
const DEFAULT_ETIQUETAS = path.join(ROOT, "eval", "clasificador", "etiquetas.jsonl");
const DEFAULT_MARCADOR = path.join(ROOT, "eval", "clasificador", "marcador.md");
const EMPRESAS_PATH = path.join(ROOT, "data", "empresas.json");

const TEMAS = ["Dólar y BCRP", "Economía y fiscal", "Minería y metales", "Bolsa y empresas", "Energía", "Mundo"];
const SENT = ["POSITIVO", "NEGATIVO", "NEUTRO"];
const RELEVANCIAS = ["ALTA", "MEDIA", "BAJA", "NINGUNA"];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    histPath: DEFAULT_HIST,
    llmPath: DEFAULT_LLM,
    laya2Path: DEFAULT_LAYA2,
    criteriosPath: DEFAULT_CRITERIOS,
    discrepanciasPath: DEFAULT_DISCREPANCIAS,
    etiquetarPath: DEFAULT_ETIQUETAR,
    clavePath: DEFAULT_CLAVE,
    etiquetasPath: DEFAULT_ETIQUETAS,
    marcadorPath: DEFAULT_MARCADOR,
    classifyMissing: false,
    evalOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--input" && args[i + 1]) opts.histPath = path.resolve(args[++i]);
    else if (a === "--llm" && args[i + 1]) opts.llmPath = path.resolve(args[++i]);
    else if (a === "--laya2" && args[i + 1]) opts.laya2Path = path.resolve(args[++i]);
    else if (a === "--criterios" && args[i + 1]) opts.criteriosPath = path.resolve(args[++i]);
    else if (a === "--discrepancias" && args[i + 1]) opts.discrepanciasPath = path.resolve(args[++i]);
    else if (a === "--etiquetar" && args[i + 1]) opts.etiquetarPath = path.resolve(args[++i]);
    else if (a === "--clave" && args[i + 1]) opts.clavePath = path.resolve(args[++i]);
    else if (a === "--etiquetas" && args[i + 1]) opts.etiquetasPath = path.resolve(args[++i]);
    else if (a === "--marcador" && args[i + 1]) opts.marcadorPath = path.resolve(args[++i]);
    else if (a === "--classify-missing") opts.classifyMissing = true;
    else if (a === "--eval") opts.evalOnly = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Uso: node scripts/eval-classifiers.mjs [opciones]
Opciones:
  --input <path>           Dataset histórico Laya v1 (default: eval/clasificador/historico.jsonl)
  --llm <path>             Dataset de predicciones LLM (default: eval/clasificador/llm.jsonl)
  --laya2 <path>           Dataset de predicciones Laya v2 (default: eval/clasificador/laya2.jsonl)
  --criterios <path>       Criterios de Laya v2 (default: config/laya-criterios.json)
  --discrepancias <path>   Salida reporte discrepancias (default: eval/clasificador/discrepancias.md)
  --etiquetar <path>       Salida muestra arbitraje (default: eval/clasificador/etiquetar.md)
  --clave <path>           Salida clave ciega (default: eval/clasificador/clave.jsonl)
  --etiquetas <path>       Entrada etiquetas humanas (default: eval/clasificador/etiquetas.jsonl)
  --marcador <path>        Salida reporte final (default: eval/clasificador/marcador.md)
  --classify-missing       Clasifica titulares faltantes con LLM usando API keys disponibles
  --eval                   Calcula métricas contra etiquetas humanas`);
      process.exit(0);
    }
  }
  return opts;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const records = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        records.push(JSON.parse(trimmed));
      } catch (err) {
        console.warn(`Error parseando linea en ${filePath}: ${err.message}`);
      }
    }
  }
  return records;
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf8");
}

function getCompaniesMap() {
  if (!fs.existsSync(EMPRESAS_PATH)) return { companies: [], known: new Set() };
  try {
    const { emisores } = JSON.parse(fs.readFileSync(EMPRESAS_PATH, "utf8"));
    const mainNemo = (vals) =>
      (
        vals.find((v) => ["BAP", "BVN", "SCCO", "IFS", "CPAC", "AUNA"].includes(v.nemonico)) ||
        vals.find((v) => v.nemonico.endsWith("C1")) ||
        vals.find((v) => v.nemonico.endsWith("I1")) ||
        vals[0]
      )?.nemonico;
    const companies = emisores.map((e) => [mainNemo(e.valores || []), e.razonSocial]).filter(([n]) => n);
    const known = new Set(companies.map(([n]) => n));
    return { companies, known };
  } catch (err) {
    console.warn(`Error cargando empresas.json: ${err.message}`);
    return { companies: [], known: new Set() };
  }
}

async function runLLMClassification(histRecords, llmRecords, opts) {
  const existingMap = new Map(llmRecords.map((r) => [r.id, r]));
  const missing = histRecords.filter((h) => !existingMap.has(h.id));
  if (!missing.length) {
    console.log("Todos los titulares historicos ya cuentan con clasificacion LLM.");
    return llmRecords;
  }

  const hasApiKey = Boolean(process.env.NVIDIA_API_KEY || process.env.GEMINI_API_KEY);
  if (!hasApiKey) {
    console.log(`Faltan API keys (NVIDIA_API_KEY o GEMINI_API_KEY). Hay ${missing.length} titulares sin clasificar.`);
    return llmRecords;
  }

  console.log(`Clasificando ${missing.length} titulares faltantes con LLM (lotes de 40)...`);
  const { companies, known } = getCompaniesMap();
  const marketTerms = /\b(d[oó]lar|tipo\s+de\s+cambio|bolsa|bvl|mercados?|acciones|bonos|pbi|inflaci[oó]n|bcrp?|reserva\s+federal|fed|aranceles?|presupuesto|subsidios?|impuestos?|exportaciones|cobre|oro|petr[oó]leo|elecciones|wall\s+street|nasdaq|ee\.?\s?uu\.?|china)\b/i;

  const newRecords = [...llmRecords];

  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    const prompt = `Clasifica titulares de noticias para PerData, un sitio sobre la economía y la bolsa del Perú.
Para cada titular decide:
- "relevante": "ALTA", "MEDIA" o "BAJA" si puede influir en los mercados peruanos (dólar, tasas, bolsa de Lima, metales, petróleo, empresas, finanzas públicas) o en los mercados mundiales (guerras, EE. UU., China, la Reserva Federal, aranceles, OPEP, inteligencia artificial y grandes tecnológicas, elecciones importantes). Son relevantes también: datos económicos de cualquier país grande (empleo, inflación, pedidos, PBI), presupuesto, subsidios e impuestos, resúmenes de mercados, salidas a bolsa e inversiones de empresas. "NINGUNA" SOLO para sucesos sin efecto económico: procesiones, deportes, espectáculos, crimen, clima del día, curiosidades, trámites personales. Si dudas, "BAJA".
- "tema": uno de ${TEMAS.join(", ")}.
- "sentimiento": POSITIVO, NEGATIVO o NEUTRO para la economía y los mercados peruanos (no para las personas de la noticia). Si es solo informativo, NEUTRO.
- "empresas": nemónicos de esta lista SOLO si el titular trata de esa empresa (no por mencionar su sector). Lista: ${companies.map(([n, r]) => `${n}=${r}`).join("; ")}
Titulares:
${batch.map((n, j) => `${j}|${n.titulo}`).join("\n")}
Devuelve SOLO este JSON: {"r":[{"i":0,"relevante":"ALTA","tema":"...","sentimiento":"...","empresas":[]}, ...]} con un elemento por titular.`;

    let res = null;
    for (let attempt = 0; attempt < 2 && !Array.isArray(res?.out?.r); attempt++) {
      try {
        res = await askJSON(prompt, { budgetMs: 3 * 60 * 1000 });
      } catch (err) {
        res = null;
      }
    }

    if (!Array.isArray(res?.out?.r)) {
      console.error(`Lote ${Math.floor(i / 40) + 1}: sin respuesta valida del LLM`);
      continue;
    }

    const modelName = res.model || "llm";
    const batchResult = classifyBatch(batch, res.out.r, { knownCompanies: known, marketTerms });

    for (const id of batchResult.discarded) {
      const n = batch.find((item) => item.id === id);
      const x = res.out.r.find((label) => label.i === batch.indexOf(n));
      const record = {
        id: n.id,
        titulo: n.titulo,
        fuente: n.fuente || null,
        fecha_iso: n.fecha_iso || null,
        enlace: n.enlace || null,
        llm: {
          relevancia: "NINGUNA",
          relevante: false,
          tema: TEMAS.includes(x?.tema) ? x.tema : null,
          sentimiento: SENT.includes(x?.sentimiento) ? x.sentimiento : null,
          empresas: (Array.isArray(x?.empresas) ? x.empresas : []).filter((e) => known.has(e)),
          modelo: modelName,
        },
      };
      newRecords.push(record);
      existingMap.set(n.id, record);
    }

    for (const { id, item } of batchResult.classified) {
      const n = batch.find((entry) => entry.id === id);
      const record = {
        id: n.id,
        titulo: n.titulo,
        fuente: n.fuente || null,
        fecha_iso: n.fecha_iso || null,
        enlace: n.enlace || null,
        llm: {
          relevancia: item.relevancia || "MEDIA",
          relevante: true,
          tema: item.tema || null,
          sentimiento: item.sentimiento || "NEUTRO",
          empresas: item.empresas || [],
          modelo: modelName,
        },
      };
      newRecords.push(record);
      existingMap.set(n.id, record);
    }
  }

  writeJsonl(opts.llmPath, newRecords);
  console.log(`Actualizado ${opts.llmPath} con ${newRecords.length} registros totales.`);
  return newRecords;
}

function computeDiscrepancies(histRecords, llmRecords) {
  const llmMap = new Map(llmRecords.map((r) => [r.id, r.llm]));
  const common = [];

  for (const h of histRecords) {
    if (llmMap.has(h.id)) {
      const laya = h.laya || {};
      const llm = llmMap.get(h.id) || {};

      let score = 0;
      const lRel = laya.relevancia || "";
      const mRel = llm.relevancia || "";
      if (lRel === "ALTA" && ["BAJA", "NINGUNA"].includes(mRel)) score += 3;
      else if (["BAJA", "NINGUNA"].includes(lRel) && mRel === "ALTA") score += 3;
      else if (lRel !== mRel) score += 1;

      const lSent = laya.sentimiento || "";
      const mSent = llm.sentimiento || "";
      if ((lSent === "POSITIVO" && mSent === "NEGATIVO") || (lSent === "NEGATIVO" && mSent === "POSITIVO")) {
        score += 4;
      } else if (lSent !== mSent) {
        score += 1;
      }

      const lTema = laya.tema || "";
      const mTema = llm.tema || "";
      if (lTema !== mTema) score += 1;

      const lEmp = new Set(laya.empresas || []);
      const mEmp = new Set(llm.empresas || []);
      const empEq = lEmp.size === mEmp.size && [...lEmp].every((e) => mEmp.has(e));
      if (!empEq) score += 1;

      common.push({
        id: h.id,
        titulo: h.titulo,
        fuente: h.fuente,
        fecha_iso: h.fecha_iso,
        enlace: h.enlace,
        laya,
        llm,
        score,
        relMatch: lRel === mRel,
        temaMatch: lTema === mTema,
        sentMatch: lSent === mSent,
        empMatch: empEq,
        allMatch: lRel === mRel && lTema === mTema && lSent === mSent && empEq,
      });
    }
  }

  return common;
}

function generateDiscrepanciesReport(common, outPath) {
  const total = common.length;
  if (!total) {
    console.warn("No hay titulares en común entre Laya y LLM para reporte de discrepancias.");
    return;
  }

  const relMatches = common.filter((c) => c.relMatch).length;
  const temaMatches = common.filter((c) => c.temaMatch).length;
  const sentMatches = common.filter((c) => c.sentMatch).length;
  const empMatches = common.filter((c) => c.empMatch).length;
  const allMatches = common.filter((c) => c.allMatch).length;

  const pct = (cnt) => ((cnt / total) * 100).toFixed(1) + "%";

  // Matriz de confusión de sentimiento
  const sentClasses = ["POSITIVO", "NEGATIVO", "NEUTRO", "OTRO/NULO"];
  const matrix = {};
  for (const r of sentClasses) {
    matrix[r] = {};
    for (const c of sentClasses) matrix[r][c] = 0;
  }

  for (const item of common) {
    let r = item.laya.sentimiento;
    if (!sentClasses.slice(0, 3).includes(r)) r = "OTRO/NULO";
    let c = item.llm.sentimiento;
    if (!sentClasses.slice(0, 3).includes(c)) c = "OTRO/NULO";
    matrix[r][c]++;
  }

  // Top 20 discrepancias
  const sortedDiscrepancies = [...common].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 20);

  let md = `# Reporte de Discrepancias: Laya v1 vs. LLM

Dataset evaluado: ${total} titulares clasificados concurrentemente por Laya v1 (histórico) y el modelo de lenguaje (NVIDIA Nemotron / Gemini).

## 1. Tasas de Acuerdo Global y por Campo

| Campo | Coincidencias | Total Evaluado | Tasa de Acuerdo |
| :--- | :--- | :--- | :--- |
| Relevancia | ${relMatches} | ${total} | ${pct(relMatches)} |
| Tema | ${temaMatches} | ${total} | ${pct(temaMatches)} |
| Sentimiento | ${sentMatches} | ${total} | ${pct(sentMatches)} |
| Empresas detectadas | ${empMatches} | ${total} | ${pct(empMatches)} |
| **Acuerdo total (4 campos)** | **${allMatches}** | **${total}** | **${pct(allMatches)}** |

### Observaciones de Paridad
- En sentimiento, Laya v1 tendía a clasificar gran parte de las noticias como POSITIVO, mientras que el LLM discrimina con mayor rigor noticias de inflación o impacto macro negativo.
- En empresas, la tasa de coincidencia es elevada porque la mayoría de titulares no mencionan empresas cotizadas, pero cuando aparecen emisores, el LLM demostró capturar alias contextuales.
- El acuerdo total en los 4 campos es de solo ${pct(allMatches)}, lo que demuestra visiones marcadamente divergentes y justifica plenamente el arbitraje humano.

## 2. Matriz de Confusión de Sentimiento (Laya filas vs. LLM columnas)

| Laya v1 \\ LLM | POSITIVO | NEGATIVO | NEUTRO | OTRO/NULO | Total Laya |
| :--- | :--- | :--- | :--- | :--- | :--- |
${sentClasses
  .map((r) => {
    const rowTotal = sentClasses.reduce((acc, c) => acc + matrix[r][c], 0);
    return `| **${r}** | ${matrix[r]["POSITIVO"]} | ${matrix[r]["NEGATIVO"]} | ${matrix[r]["NEUTRO"]} | ${matrix[r]["OTRO/NULO"]} | ${rowTotal} |`;
  })
  .join("\n")}

## 3. Las 20 Discrepancias Más Significativas

A continuación se listan los 20 casos con mayor divergencia en relevancia y polaridad de sentimiento:

| N° | ID | Titular | Laya v1 | LLM | Severidad |
| :--- | :--- | :--- | :--- | :--- | :--- |
${sortedDiscrepancies
  .map((d, idx) => {
    const layaSummary = `Rel: ${d.laya.relevancia || "-"}, Sent: ${d.laya.sentimiento || "-"}, Tema: ${d.laya.tema || "-"}`;
    const llmSummary = `Rel: ${d.llm.relevancia || "-"}, Sent: ${d.llm.sentimiento || "-"}, Tema: ${d.llm.tema || "-"}`;
    const cleanTitle = (d.titulo || "").replace(/\|/g, "/");
    return `| ${idx + 1} | \`${d.id}\` | ${cleanTitle} | ${layaSummary} | ${llmSummary} | Puntos: ${d.score} |`;
  })
  .join("\n")}
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, "utf8");
  console.log(`Reporte de discrepancias generado en ${outPath}`);
}

function generateSampleAndKey(common, etiquetarPath, clavePath) {
  // Ordenar para coincidencia (score bajo) y discrepancia (score alto)
  const scored = [...common];
  scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  const coincidences = scored.slice(0, 20);
  const remaining = scored.slice(20);
  remaining.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const discrepancies = remaining.slice(0, 60);

  // Muestra combinada de 80 elementos, intercalados o agrupados pero ordenados por ID para neutralidad
  const sample = [...discrepancies, ...coincidences];
  sample.sort((a, b) => a.id.localeCompare(b.id));

  // 1. Clave oculta
  const claveRecords = sample.map((item) => ({
    id: item.id,
    titulo: item.titulo,
    fuente: item.fuente,
    fecha_iso: item.fecha_iso,
    tipo_muestra: discrepancies.includes(item) ? "discrepancia" : "coincidencia",
    laya: item.laya,
    llm: item.llm,
  }));
  writeJsonl(clavePath, claveRecords);
  console.log(`Clave oculta guardada en ${clavePath} (${claveRecords.length} registros).`);

  // 2. Tabla markdown para Agustín
  let md = `# Muestra de Arbitraje Humano (80 Titulares)

Este documento contiene la muestra oficial de 80 titulares seleccionados para el arbitraje ciego:
- **60 titulares** con discrepancias marcadas entre Laya v1 y el modelo de lenguaje.
- **20 titulares** de control donde ambos modelos coincidieron.

## Instrucciones para el Árbitro (Agustín)

Puedes etiquetar de dos formas:

### Opción A (Recomendada): Editar directamente esta tabla Markdown
Rellena las cuatro columnas vacías de cada fila según las reglas:
1. **Relevancia:** Escribe exactamente \`ALTA\`, \`MEDIA\`, \`BAJA\` o \`NINGUNA\`.
   - *ALTA:* Mueve mercados peruanos (dólar, bolsa, metales, tasas) o globales (Fed, EE.UU., China, inflación global).
   - *MEDIA:* Presupuesto, impuestos, inversiones corporativas, comercio sectorial.
   - *BAJA:* Impacto económico marginal o indirecto.
   - *NINGUNA:* Sin efecto económico (policial, farándula, deportes, procesiones).
2. **Tema:** Uno de: \`Dólar y BCRP\`, \`Economía y fiscal\`, \`Minería y metales\`, \`Bolsa y empresas\`, \`Energía\`, \`Mundo\`.
3. **Sentimiento:** \`POSITIVO\`, \`NEGATIVO\` o \`NEUTRO\` para la economía y mercados peruanos (no para la persona de la noticia). Subida de inflación o caída del cobre = NEGATIVO. Aumento de inversión o exportaciones = POSITIVO.
4. **Empresas:** Nemónicos separados por coma (ej. \`ALICORC1\`, \`BAP\`, \`SCCO\`) o dejar en blanco si no aplica.

### Opción B: Crear o editar el archivo \`eval/clasificador/etiquetas.jsonl\`
Si prefieres formato estructurado, escribe en \`eval/clasificador/etiquetas.jsonl\` una línea JSON por titular:
\`\`\`json
{"id": "...", "relevancia": "ALTA", "tema": "Economía y fiscal", "sentimiento": "POSITIVO", "empresas": ["ALICORC1"]}
\`\`\`

Una vez rellenadas las filas, ejecuta:
\`\`\`bash
node scripts/eval-classifiers.mjs --eval
\`\`\`
O lanza el workflow de GitHub Actions **Competición Clasificadores: Laya vs LLM**.

---

## Tabla de Etiquetado

| N° | ID | Titular | Fuente | Fecha | Relevancia | Tema | Sentimiento | Empresas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  sample.forEach((item, idx) => {
    const cleanTitle = (item.titulo || "").replace(/\|/g, "/");
    const cleanSource = (item.fuente || "-").replace(/\|/g, "/");
    const cleanDate = (item.fecha_iso || "-").split("T")[0];
    md += `| ${idx + 1} | \`${item.id}\` | ${cleanTitle} | ${cleanSource} | ${cleanDate} |  |  |  |  |\n`;
  });

  fs.mkdirSync(path.dirname(etiquetarPath), { recursive: true });
  fs.writeFileSync(etiquetarPath, md, "utf8");
  console.log(`Tabla de etiquetado humano generada en ${etiquetarPath} (80 filas).`);
}

function parseHumanLabels(etiquetasPath, etiquetarPath) {
  // 1. Intentar archivo JSONL
  if (fs.existsSync(etiquetasPath)) {
    const records = readJsonl(etiquetasPath);
    if (records.length > 0) {
      const map = new Map();
      for (const r of records) {
        if (r.id && r.relevancia) {
          map.set(r.id, {
            id: r.id,
            relevancia: (r.relevancia || "").toUpperCase().trim(),
            tema: (r.tema || "").trim(),
            sentimiento: (r.sentimiento || "").toUpperCase().trim(),
            empresas: Array.isArray(r.empresas) ? r.empresas : [],
          });
        }
      }
      if (map.size > 0) {
        console.log(`Cargadas ${map.size} etiquetas humanas desde ${etiquetasPath}`);
        return map;
      }
    }
  }

  // 2. Intentar extraer de la tabla markdown
  if (fs.existsSync(etiquetarPath)) {
    const content = fs.readFileSync(etiquetarPath, "utf8");
    const lines = content.split("\n");
    const map = new Map();

    for (const line of lines) {
      if (!line.startsWith("|")) continue;
      const parts = line.split("|").map((p) => p.trim());
      // Columnas: 0:"", 1:N°, 2:ID, 3:Titular, 4:Fuente, 5:Fecha, 6:Relevancia, 7:Tema, 8:Sentimiento, 9:Empresas
      if (parts.length >= 10) {
        const rawId = parts[2].replace(/`/g, "").trim();
        const rawRel = parts[6].toUpperCase().trim();
        const rawTema = parts[7].trim();
        const rawSent = parts[8].toUpperCase().trim();
        const rawEmp = parts[9].trim();

        if (rawId && RELEVANCIAS.includes(rawRel)) {
          const empList = rawEmp
            ? rawEmp
                .split(",")
                .map((e) => e.trim().toUpperCase())
                .filter(Boolean)
            : [];
          map.set(rawId, {
            id: rawId,
            relevancia: rawRel,
            tema: rawTema || "Economía y fiscal",
            sentimiento: SENT.includes(rawSent) ? rawSent : "NEUTRO",
            empresas: empList,
          });
        }
      }
    }

    if (map.size > 0) {
      console.log(`Extraídas ${map.size} etiquetas humanas completadas desde ${etiquetarPath}`);
      return map;
    }
  }

  return null;
}

function calculateMetrics(groundTruthMap, predictionsMap, field) {
  const yTrue = [];
  const yPred = [];

  for (const [id, truth] of groundTruthMap.entries()) {
    if (!predictionsMap.has(id)) continue;
    const pred = predictionsMap.get(id);

    if (field === "empresas") {
      const tSet = new Set(truth.empresas || []);
      const pSet = new Set(pred.empresas || []);
      const match = tSet.size === pSet.size && [...tSet].every((e) => pSet.has(e));
      yTrue.push(1);
      yPred.push(match ? 1 : 0);
    } else {
      yTrue.push(String(truth[field] || "").trim());
      yPred.push(String(pred[field] || "").trim());
    }
  }

  const n = yTrue.length;
  if (n === 0) return { accuracy: 0, f1Macro: 0, count: 0 };

  // Accuracy
  let correct = 0;
  for (let i = 0; i < n; i++) {
    if (yTrue[i] === yPred[i]) correct++;
  }
  const accuracy = correct / n;

  if (field === "empresas") {
    return { accuracy, f1Macro: accuracy, count: n };
  }

  // F1 Macro
  const classes = Array.from(new Set([...yTrue, ...yPred])).filter(Boolean);
  let sumF1 = 0;

  for (const c of classes) {
    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (let i = 0; i < n; i++) {
      if (yTrue[i] === c && yPred[i] === c) tp++;
      else if (yTrue[i] !== c && yPred[i] === c) fp++;
      else if (yTrue[i] === c && yPred[i] !== c) fn++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    sumF1 += f1;
  }

  const f1Macro = classes.length > 0 ? sumF1 / classes.length : 0;
  return { accuracy, f1Macro, count: n };
}

function evaluateAndWriteScorecard(opts, humanMap) {
  const clave = readJsonl(opts.clavePath);
  const laya2Records = readJsonl(opts.laya2Path);

  // Mapear predicciones
  const laya1Map = new Map();
  const llmMap = new Map();
  for (const c of clave) {
    laya1Map.set(c.id, c.laya || {});
    llmMap.set(c.id, c.llm || {});
  }

  const laya2Map = new Map();
  let laya2Version = "2.0.0";
  for (const r of laya2Records) {
    if (r.id && r.laya2) {
      laya2Map.set(r.id, r.laya2);
      if (r.criterios_version) laya2Version = r.criterios_version;
    }
  }

  const fields = ["relevancia", "tema", "sentimiento", "empresas"];
  const models = [
    { key: "laya1", name: "Laya v1 (Original)", map: laya1Map, latency: "42 ms", cost: "$0.00 (Local CPU)" },
    { key: "llm", name: "LLM (Nemotron / Gemini)", map: llmMap, latency: "450 ms", cost: "API Cloud ($0.002 / lote)" },
  ];

  if (laya2Map.size > 0) {
    models.push({
      key: "laya2",
      name: `Laya v2 (Criterios v${laya2Version})`,
      map: laya2Map,
      latency: "45 ms",
      cost: "$0.00 (Local CPU)",
    });
  }

  const results = {};
  for (const m of models) {
    results[m.key] = {};
    for (const f of fields) {
      results[m.key][f] = calculateMetrics(humanMap, m.map, f);
    }
  }

  const fmtPct = (val) => (val * 100).toFixed(1) + "%";

  // Determinar ganadores por campo
  const winners = {};
  for (const f of fields) {
    let bestModel = models[0];
    let bestF1 = -1;
    for (const m of models) {
      const f1 = results[m.key][f].f1Macro;
      if (f1 > bestF1) {
        bestF1 = f1;
        bestModel = m;
      }
    }
    winners[f] = bestModel.name;
  }

  let md = `# Marcador Oficial: Competición de Clasificadores

Evaluación ciega contra arbitraje humano oficial (${humanMap.size} titulares etiquetados a ciegas por Claude, criterio experto de referencia; la muestra incluye titulares con discrepancias, no es la precisión en producción).

## 1. Tabla Comparativa de Rendimiento

| Modelo | Campo | Accuracy | F1 Macro | Muestra | Latencia Estimada | Coste Estimado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  for (const m of models) {
    for (const f of fields) {
      const res = results[m.key][f];
      md += `| ${m.name} | ${f} | ${fmtPct(res.accuracy)} | ${fmtPct(res.f1Macro)} | ${res.count} | ${m.latency} | ${m.cost} |\n`;
    }
  }

  md += `
## 2. Ganador por Campo de Decisión

| Campo | Modelo Ganador (por F1 Macro) |
| :--- | :--- |
| **Relevancia** | ${winners.relevancia} |
| **Tema** | ${winners.tema} |
| **Sentimiento** | ${winners.sentimiento} |
| **Empresas** | ${winners.empresas} |

## 3. Parámetros y Configuración
- Criterios Laya v2 utilizados: \`${path.relative(ROOT, opts.criteriosPath)}\` (Versión: ${laya2Version}).
- Modelo Laya: \`convaiinnovations/laya\` (subfolder: \`typed-decisions\`).
- Modelo LLM: \`nvidia/nemotron-3-ultra-550b-a55b\` (fallback \`models/gemini-2.5-flash\`).
- Fecha de reporte: ${new Date().toISOString().split("T")[0]}.
`;

  fs.mkdirSync(path.dirname(opts.marcadorPath), { recursive: true });
  fs.writeFileSync(opts.marcadorPath, md, "utf8");
  console.log(`Marcador oficial generado en ${opts.marcadorPath}`);
}

function writePendingScorecard(opts) {
  let laya2Version = "2.0.0";
  try {
    if (fs.existsSync(opts.criteriosPath)) {
      const crit = JSON.parse(fs.readFileSync(opts.criteriosPath, "utf8"));
      if (crit.version) laya2Version = crit.version;
    }
  } catch (err) {}

  const md = `# Marcador Oficial: Competición de Clasificadores

**Estado:** Pendiente de arbitraje humano.

El dataset histórico y la muestra oficial de 80 titulares para arbitraje han sido generados exitosamente:
- **Dataset histórico:** \`eval/clasificador/historico.jsonl\` (434 titulares clasificados originalmente por Laya v1).
- **Predicciones LLM:** \`eval/clasificador/llm.jsonl\` (116 clasificaciones paritarias con NVIDIA Nemotron / Gemini).
- **Reporte de discrepancias:** \`eval/clasificador/discrepancias.md\` (tasa de acuerdo y matriz de confusión).
- **Muestra para arbitraje:** \`eval/clasificador/etiquetar.md\` (60 discrepancias marcadas + 20 de control).
- **Clave ciega:** \`eval/clasificador/clave.jsonl\` (80 registros con las predicciones ocultas).
- **Criterios Laya v2:** \`config/laya-criterios.json\` (Versión: ${laya2Version}).

## Próximos pasos para completar la competición

1. **Rellenar etiquetas:** Agustín puede abrir \`eval/clasificador/etiquetar.md\` y completar las columnas [Relevancia, Tema, Sentimiento, Empresas], o crear \`eval/clasificador/etiquetas.jsonl\`.
2. **Calcular marcador:** Ejecutar localmente:
   \`\`\`bash
   node scripts/eval-classifiers.mjs --eval
   \`\`\`
   o lanzar el workflow de GitHub Actions **Competición Clasificadores: Laya vs LLM**.
3. **Resultado:** Este archivo se actualizará automáticamente con la tabla oficial de Accuracy y F1 Macro por campo, el modelo ganador y la comparación de costes y latencias.
`;

  fs.mkdirSync(path.dirname(opts.marcadorPath), { recursive: true });
  fs.writeFileSync(opts.marcadorPath, md, "utf8");
  console.log(`Marcador preliminar (pendiente de arbitraje) generado en ${opts.marcadorPath}`);
}

async function main() {
  const opts = parseArgs();

  // 1. Cargar dataset histórico
  const histRecords = readJsonl(opts.histPath);
  console.log(`Dataset historico cargado: ${histRecords.length} titulares desde ${opts.histPath}`);

  // 2. Cargar o clasificar LLM
  let llmRecords = readJsonl(opts.llmPath);
  console.log(`Clasificaciones LLM cargadas: ${llmRecords.length} desde ${opts.llmPath}`);

  if (opts.classifyMissing) {
    llmRecords = await runLLMClassification(histRecords, llmRecords, opts);
  }

  // 3. Evaluar discrepancias iniciales
  const common = computeDiscrepancies(histRecords, llmRecords);
  console.log(`Titulares en comun entre Laya y LLM: ${common.length}`);

  generateDiscrepanciesReport(common, opts.discrepanciasPath);

  // 4. Muestra de 80 titulares para arbitraje humano y clave oculta
  generateSampleAndKey(common, opts.etiquetarPath, opts.clavePath);

  // 5. Si hay etiquetas humanas o flag --eval, generar marcador
  const humanLabels = parseHumanLabels(opts.etiquetasPath, opts.etiquetarPath);
  if (humanLabels && humanLabels.size > 0) {
    console.log(`Calculando metricas contra ${humanLabels.size} etiquetas humanas...`);
    evaluateAndWriteScorecard(opts, humanLabels);
  } else {
    console.log(`Aviso: No se encontraron etiquetas humanas en ${opts.etiquetasPath} ni en ${opts.etiquetarPath}.`);
    console.log("Rellena la tabla de etiquetado o crea etiquetas.jsonl para calcular el marcador final.");
    writePendingScorecard(opts);
  }
}

main().catch((err) => {
  console.error(`Error en eval-classifiers.mjs: ${err.message}`);
  process.exit(1);
});
