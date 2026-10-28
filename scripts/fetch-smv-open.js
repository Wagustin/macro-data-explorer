// Download the SMV open dataset of current shareholders owning more than 4%.
// Keep the previous data file untouched when the single source request fails or is malformed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSmvShareholders } from "../api/_lib/empresas-match.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "smv-accionistas.json");
const URL = "https://mvnet.smv.gob.pe/SMV.OData.Api/api/registro/AccionistaSMVEmisor";
const DATASET = "https://www.datosabiertos.gob.pe/dataset/listado-de-accionistas-mayores-al-4-vigentes-comunicados-la-superintendencia-del-mercado-de";
const LICENSE = "https://opendefinition.org/licenses/odc-by/";

async function main() {
  const response = await fetch(URL, {
    headers: { "User-Agent": "PerDataBot/1.0 (+https://perdata.site)" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`SMV HTTP ${response.status}`);
  const payload = await response.json();
  const emisores = parseSmvShareholders(payload);
  if (Object.keys(emisores).length < 150) throw new Error("La respuesta de la SMV contiene menos de 150 emisores válidos");

  const output = {
    fuente: "Superintendencia del Mercado de Valores (SMV), datos abiertos",
    licencia: "Open Data Commons Attribution License (ODC-BY 1.0)",
    url_licencia: LICENSE,
    url_conjunto: DATASET,
    actualizado: new Date().toISOString(),
    emisores,
  };
  fs.writeFileSync(OUT, JSON.stringify(output, null, 1) + "\n");
  console.log(`SMV: ${Object.keys(emisores).length} emisores con accionistas guardados`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
