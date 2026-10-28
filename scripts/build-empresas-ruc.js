import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { linkIssuerRucs, readAliasFile } from "../api/_lib/empresas-match.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const empresas = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "empresas.json"), "utf8"));
const shareholders = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "smv-accionistas.json"), "utf8"));
const aliases = readAliasFile(path.join(ROOT, "data", "smv-alias.json"));
const emisores = linkIssuerRucs(empresas.emisores, shareholders.emisores, aliases);
const out = path.join(ROOT, "data", "empresas-ruc.json");
fs.writeFileSync(out, JSON.stringify(emisores, null, 1) + "\n");
console.log(`RUC enlazados: ${Object.keys(emisores).length}/${empresas.emisores.length}`);
