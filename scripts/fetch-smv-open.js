// Download the SMV open dataset of current shareholders owning more than 4%.
// If the source fails (HTTP error, network error, unparseable body or too few issuers), the previous
// data file is kept untouched and the script exits 0 with a workflow warning, so the hechos workflow goes on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSmvShareholders } from "../api/_lib/empresas-match.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "smv-accionistas.json");
const URL_SMV = "https://mvnet.smv.gob.pe/SMV.OData.Api/api/registro/AccionistaSMVEmisor";
const DATASET = "https://www.datosabiertos.gob.pe/dataset/listado-de-accionistas-mayores-al-4-vigentes-comunicados-la-superintendencia-del-mercado-de";
const LICENSE = "https://opendefinition.org/licenses/odc-by/";
const MIN_EMISORES = 150;

function mantenerDatos(motivo, out) {
  let fecha = "fecha desconocida";
  try {
    fecha = JSON.parse(fs.readFileSync(out, "utf8")).actualizado || fecha;
  } catch {
    // Sin archivo previo o ilegible: se informa igualmente y no se toca nada.
  }
  console.log(`::warning::Accionistas de la SMV no disponibles (${motivo}); se mantienen los datos de ${fecha}`);
  return { actualizado: false, motivo };
}

// Returns { actualizado: true, emisores } or { actualizado: false, motivo }. Never throws on source problems.
export async function actualizarAccionistas({ url = URL_SMV, out = OUT, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": "PerDataBot/1.0 (+https://perdata.site)" },
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    return mantenerDatos("HTTP sin respuesta", out);
  }
  if (!response.ok) return mantenerDatos(`HTTP ${response.status}`, out);

  let emisores;
  try {
    const payload = await response.json();
    emisores = parseSmvShareholders(payload);
  } catch (error) {
    return mantenerDatos(`HTTP ${response.status}, respuesta no interpretable: ${error.message}`, out);
  }
  const total = Object.keys(emisores).length;
  if (total < MIN_EMISORES) {
    return mantenerDatos(`HTTP ${response.status}, solo ${total} emisores válidos`, out);
  }

  const output = {
    fuente: "Superintendencia del Mercado de Valores (SMV), datos abiertos",
    licencia: "Open Data Commons Attribution License (ODC-BY 1.0)",
    url_licencia: LICENSE,
    url_conjunto: DATASET,
    actualizado: new Date().toISOString(),
    emisores,
  };
  fs.writeFileSync(out, JSON.stringify(output, null, 1) + "\n");
  console.log(`SMV: ${total} emisores con accionistas guardados`);
  return { actualizado: true, emisores };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  actualizarAccionistas().then(() => process.exit(0));
}
