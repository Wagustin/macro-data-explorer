// scripts/cierre-sunat.js
// Cierre de ayer (SUNAT): descarga el tipo de cambio publicado por SUNAT y,
// si procede, lo añade como punto provisional a la serie diaria del BCRP.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PERU_HOLIDAYS, addBusinessDays } from "./engine-daily.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BCRP_PATH = path.join(ROOT, "data", "official", "bcrp-daily.json");
const SUNAT_URL = "https://www.sunat.gob.pe/a/txt/tipoCambio.txt";
const USER_AGENT = "PerDataBot/1.0 (+https://perdata.site)";

export { PERU_HOLIDAYS };

/**
 * Parsea la línea SUNAT: "DD/MM/AAAA|compra|venta|"
 * Devuelve { fecha: "AAAA-MM-DD", compra: number, venta: number } o lanza Error.
 */
export function parsearSunat(texto) {
  const line = String(texto ?? "").trim();
  if (!line) throw new Error("texto_vacio");
  const partes = line.split("|");
  if (partes.length < 3) throw new Error("formato_invalido");
  const [fechaStr, compraStr, ventaStr] = partes;
  if (!fechaStr || !compraStr || !ventaStr) throw new Error("formato_invalido");
  const fechaPartes = fechaStr.split("/");
  if (fechaPartes.length !== 3) throw new Error("fecha_invalida");
  const [dia, mes, anio] = fechaPartes.map((s) => parseInt(s, 10));
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(anio)) {
    throw new Error("fecha_invalida");
  }
  const fecha = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const compra = Number(compraStr);
  const venta = Number(ventaStr);
  if (!Number.isFinite(compra) || !Number.isFinite(venta)) {
    throw new Error("valor_no_finito");
  }
  return { fecha, compra, venta };
}

/**
 * Devuelve el día hábil (lun-vie, sin feriados) estrictamente anterior a fecha.
 */
export function diaHabilAnterior(fecha, feriados = PERU_HOLIDAYS) {
  const [y, m, d] = fecha.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  while (true) {
    cur.setUTCDate(cur.getUTCDate() - 1);
    const day = cur.getUTCDay();
    const iso = cur.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && (!feriados || !feriados.has(iso))) {
      return iso;
    }
  }
}

/**
 * Aplica el cierre SUNAT a los datos del BCRP si procede.
 * No muta el argumento bcrp; devuelve una copia con los cambios.
 * Reglas en orden:
 * 1. Si punto.fecha > hoyLima -> no aplica ("fecha_futura")
 * 2. P = diaHabilAnterior(punto.fecha). Si P <= ultima fecha de series.PEN.serie -> no aplica ("bcrp_ya_lo_tiene"), y borra provisional si existía
 * 3. Si P es más de 4 días naturales anterior a hoyLima -> no aplica ("dato_viejo")
 * 4. Si venta no es finita o difiere más de 3% del último valor de la serie -> no aplica ("valor_raro")
 * 5. Si no: añade [P, venta] al final de series.PEN.serie y pone provisional
 */
export function aplicarCierre(bcrp, punto, hoyLima) {
  const bcrpCopy = JSON.parse(JSON.stringify(bcrp));
  const penSerie = bcrpCopy.series?.PEN?.serie;
  if (!penSerie || !Array.isArray(penSerie) || penSerie.length === 0) {
    return { aplicado: false, motivo: "sin_serie", bcrp: bcrpCopy };
  }

  // 1. fecha_futura
  if (punto.fecha > hoyLima) {
    return { aplicado: false, motivo: "fecha_futura", bcrp: bcrpCopy };
  }

  // 2. bcrp_ya_lo_tiene
  const P = diaHabilAnterior(punto.fecha);
  const ultimaFechaSerie = penSerie[penSerie.length - 1][0];
  if (P <= ultimaFechaSerie) {
    if (bcrpCopy.series.PEN.provisional && bcrpCopy.series.PEN.provisional.fecha !== ultimaFechaSerie) {
      delete bcrpCopy.series.PEN.provisional;
    }
    return { aplicado: false, motivo: "bcrp_ya_lo_tiene", bcrp: bcrpCopy };
  }

  // 3. dato_viejo (más de 4 días naturales anterior a hoyLima)
  const diffDias = Math.floor(
    (new Date(hoyLima).getTime() - new Date(P).getTime()) / 86400000
  );
  if (diffDias > 4) {
    return { aplicado: false, motivo: "dato_viejo", bcrp: bcrpCopy };
  }

  // 4. valor_raro
  const ultimoValor = penSerie[penSerie.length - 1][1];
  if (!Number.isFinite(punto.venta) || Math.abs(punto.venta - ultimoValor) / ultimoValor > 0.03) {
    return { aplicado: false, motivo: "valor_raro", bcrp: bcrpCopy };
  }

  // 5. aplicado
  penSerie.push([P, punto.venta]);
  bcrpCopy.series.PEN.provisional = {
    fecha: P,
    valor: punto.venta,
    fuente: "SUNAT",
    url: SUNAT_URL,
    publicado: punto.fecha,
  };
  return { aplicado: true, motivo: "aplicado", bcrp: bcrpCopy };
}

/**
 * Fecha de referencia para volver a correr el motor de madrugada: la misma de la corrida anterior
 * mientras su «mañana» siga siendo hoy o un día futuro, para que los objetivos (hoy y la semana)
 * no cambien y solo se afine el rango. Devuelve null si la corrida anterior ya quedó vieja.
 */
export function referenciaMotor(daily, hoyLima) {
  const r = daily?.referencia_lima?.hoy;
  return r && addBusinessDays(r, 1) >= hoyLima ? r : null;
}

/**
 * CLI: descarga SUNAT, aplica cierre, guarda bcrp-daily.json
 */
async function main() {
  const args = process.argv.slice(2);
  let texto = null;
  let hoyLima = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--texto" && i + 1 < args.length) {
      texto = args[i + 1];
      i++;
    } else if (args[i] === "--hoy" && i + 1 < args.length) {
      hoyLima = args[i + 1];
      i++;
    }
  }

  if (!hoyLima) {
    const now = new Date();
    hoyLima = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }

  let punto = null;

  if (texto) {
    try {
      punto = parsearSunat(texto);
    } catch (e) {
      console.log(`cierre-sunat: parse_error ${e.message}`);
      process.exit(0);
    }
  } else {
    // Descargar de SUNAT
    let response = null;
    for (let intento = 1; intento <= 2 && !response; intento++) {
      try {
        response = await fetch(SUNAT_URL, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
      } catch (e) {
        if (intento === 2) {
          console.log(`cierre-sunat: red_error ${e.message}`);
          process.exit(0);
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (!response.ok) {
      if (response.status === 429) {
        console.log(`cierre-sunat: rate_limited`);
        process.exit(0);
      }
      console.log(`cierre-sunat: http_${response.status}`);
      process.exit(0);
    }

    const body = await response.text();
    try {
      punto = parsearSunat(body);
    } catch (e) {
      console.log(`cierre-sunat: parse_error ${e.message}`);
      process.exit(0);
    }
  }

  // Leer bcrp-daily.json
  let bcrp = null;
  try {
    bcrp = JSON.parse(fs.readFileSync(BCRP_PATH, "utf8"));
  } catch (e) {
    console.log(`cierre-sunat: bcrp_read_error ${e.message}`);
    process.exit(0);
  }

  const resultado = aplicarCierre(bcrp, punto, hoyLima);

  if (resultado.aplicado) {
    fs.writeFileSync(BCRP_PATH, JSON.stringify(resultado.bcrp) + "\n", "utf8");
  }

  const P = diaHabilAnterior(punto.fecha);
  console.log(`cierre-sunat: ${resultado.motivo} ${P} ${punto.venta}`);

  if (resultado.aplicado && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "aplicado=true\n");
  }
  if (resultado.aplicado && args.includes("--referencia")) {
    const ref = referenciaMotor(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "daily-forecasts.json"), "utf8")), hoyLima);
    console.log(`cierre-sunat: referencia del motor ${ref || "hoy"}`);
    if (ref && process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `ENGINE_HOY=${ref}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Error en cierre-sunat:", err);
    process.exit(1);
  });
}