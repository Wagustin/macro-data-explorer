import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function normalizeCompanyName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bANTES\b[\s\S]*$/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(SOCIEDAD\s+ANONIMA\s+ABIERTA|SOCIEDAD\s+ANONIMA\s+CERRADA|SOCIEDAD\s+ANONIMA|S\.?\s*A\.?\s*A\.?|S\.?\s*A\.?\s*C\.?|S\.?\s*A\.?)\b/g, " ")
    .replace(/\b(CORP(?:ORATION)?|INC(?:ORPORATED)?|LTD)\.?\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSmvShareholders(payload) {
  if (!payload || String(payload.ResponseCode) !== "0" || !Array.isArray(payload.Resultado)) {
    throw new Error("Respuesta inesperada del registro de accionistas de la SMV");
  }

  const emisores = {};
  for (const row of payload.Resultado) {
    const ruc = String(row.RUC || "").trim();
    const pct = Number(String(row.Porcentaje_Participacion || "").replace(/,/g, ""));
    const match = String(row.Fecha_Inicio || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!/^\d{11}$/.test(ruc) || !row.Empresa || !row.Accionista || !Number.isFinite(pct) || !match) continue;
    const desde = `${match[3]}-${match[2]}-${match[1]}`;
    const issuer = emisores[ruc] ||= { empresa: String(row.Empresa).trim(), accionistas: [] };
    issuer.accionistas.push({
      nombre: String(row.Accionista).trim(),
      nacionalidad: String(row.Nacionalidad || "").trim(),
      desde,
      pct,
    });
  }

  for (const issuer of Object.values(emisores)) {
    issuer.accionistas.sort((a, b) => b.pct - a.pct);
  }
  return emisores;
}

export function linkIssuerRucs(issuers, shareholderIssuers, aliases = {}) {
  const rucByName = new Map();
  for (const [ruc, issuer] of Object.entries(shareholderIssuers || {})) {
    const key = normalizeCompanyName(issuer.empresa);
    if (key && !rucByName.has(key)) rucByName.set(key, ruc);
  }

  const result = {};
  for (const issuer of issuers || []) {
    const explicit = String(aliases[issuer.codigoBVL] || "");
    const ruc = explicit || rucByName.get(normalizeCompanyName(issuer.razonSocial));
    if (ruc && shareholderIssuers[ruc]) result[issuer.codigoBVL] = ruc;
  }
  return result;
}

export function readAliasFile(file = path.join(ROOT, "data", "smv-alias.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
