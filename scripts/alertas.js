/**
 * PerData - Envío de avisos de precio por correo.
 * Revisa los umbrales de alerta definidos en la tabla seguimiento
 * contra los precios oficiales en data/official/ y cierres SMV en Supabase/D1.
 *
 * Variables de entorno:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   RESEND_API_KEY
 *   EMAIL_FROM
 *
 * Flags:
 *   --dry: Modo simulación, no envía correos ni modifica la base de datos.
 */

import path from "path";
import { pathToFileURL } from "url";

import { nemonicoOf, smvRows } from "../api/_lib/smv.js";
import { SOURCES, DATASETS, sourcePoints } from "../api/_lib/sources.js";
import { evaluarFila } from "./alertas-reglas.js";

const MAX_CORREOS = 40;
const MAX_DATASET_AGE_DAYS = 6;
const MAX_AGE_BY_SOURCE = {
  bcrp: 8,
  eia: 10,
  fed: 14,
  worldBank: 65,
  smv: 7
};
const SMV_LOOKBACK_DAYS = 30;
const SMV_BATCH_SIZE = 10;

function formatPrice(val, symbol = "") {
  const num = Number(val);
  const formatted = num.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (symbol === "PEN=X" || symbol.endsWith(".LM")) {
    return `S/ ${formatted}`;
  }
  return formatted;
}

function buildAlertEmail({ to, simbolo, tipo, nivel, precio, base }) {
  const isPct = tipo === "pct_arriba" || tipo === "pct_abajo";
  const priceText = formatPrice(precio, simbolo);

  let subject;
  let actionText;
  let bodyText;

  if (isPct) {
    const baseText = formatPrice(base, simbolo);
    const pctText = Number(nivel);
    const subio = tipo === "pct_arriba";
    subject = `PerData: ${simbolo} ${subio ? "subió" : "bajó"} ${pctText} % desde ${baseText}`;
    const referencia = subio ? "por encima" : "por debajo";
    bodyText = `El activo <strong>${simbolo}</strong> cotiza a <strong>${priceText}</strong>; son <strong>${pctText} %</strong> ${referencia} de tu referencia de <strong>${baseText}</strong>.`;
    actionText = `son ${pctText} % ${referencia} de tu referencia de ${baseText}`;
  } else {
    const levelText = formatPrice(nivel, simbolo);
    subject = tipo === "arriba"
      ? `PerData: ${simbolo} cruzó ${levelText}`
      : `PerData: ${simbolo} bajó de ${levelText}`;

    actionText = tipo === "arriba"
      ? `cruzó hacia arriba tu nivel de aviso de ${levelText}`
      : `bajó por debajo de tu nivel de aviso de ${levelText}`;

    bodyText = `El activo <strong>${simbolo}</strong> cotiza a <strong>${priceText}</strong> y ${actionText}.`;
  }

  const html = `<div style="background:#F5F1E8;padding:28px 16px;">
  <div style="max-width:480px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#1B1916;">
    <p style="font-family:Georgia,serif;font-style:italic;font-weight:600;font-size:26px;margin:0 0 20px;color:#1B1916;">PerData</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${bodyText}</p>
    <p style="margin:0 0 24px;">
      <a href="https://perdata.site/empresa/${encodeURIComponent(simbolo)}" style="display:inline-block;background:#1B1916;color:#F5F1E8;text-decoration:none;font-weight:600;padding:12px 20px;font-size:14px;">Ver la ficha</a>
    </p>
    <p style="margin:0;color:#5E584E;font-size:13px;line-height:1.5;">Recibes este aviso porque sigues este activo en PerData. Puedes quitarlo en tu cuenta: <a href="https://perdata.site/cuenta" style="color:#5E584E;text-decoration:underline;">/cuenta</a>.<br>Equipo de PerData</p>
  </div>
</div>`;

  const text = `PerData

El activo ${simbolo} cotiza a ${priceText} y ${actionText}.

Ver la ficha: https://perdata.site/empresa/${encodeURIComponent(simbolo)}

Recibes este aviso porque sigues este activo en PerData. Puedes quitarlo en tu cuenta: https://perdata.site/cuenta`;

  return { to, subject, html, text };
}

// Si la migración 0013 aún no está aplicada, PostgREST devuelve 400 por las columnas
// nuevas; en ese caso se lee con las columnas antiguas y los avisos por porcentaje
// quedan inactivos hasta que la migración exista.
const CAMPOS_SEGUIMIENTO = "user_id,simbolo,alerta_arriba,alerta_abajo,precio_base,alerta_pct_arriba,alerta_pct_abajo";
const CAMPOS_SEGUIMIENTO_BASE = "user_id,simbolo,alerta_arriba,alerta_abajo";

async function fetchSeguimiento(url, key) {
  const all = [];
  const pageSize = 1000;
  let campos = CAMPOS_SEGUIMIENTO;
  for (let offset = 0; ; offset += pageSize) {
    const to = offset + pageSize - 1;
    const res = await fetch(`${url}/rest/v1/seguimiento?select=${campos}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${to}`,
        "Range-Unit": "items"
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      if (res.status === 416) break;
      if (res.status === 400 && campos !== CAMPOS_SEGUIMIENTO_BASE) {
        campos = CAMPOS_SEGUIMIENTO_BASE;
        offset -= pageSize;
        continue;
      }
      const err = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} al leer seguimiento: ${err.slice(0, 100)}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
  }
  const esNumero = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  return all.filter((r) => {
    const absolutos = esNumero(r.alerta_arriba) || esNumero(r.alerta_abajo);
    const base = r.precio_base !== null && r.precio_base !== undefined && Number.isFinite(Number(r.precio_base)) && Number(r.precio_base) > 0;
    const porcentuales = base && (esNumero(r.alerta_pct_arriba) || esNumero(r.alerta_pct_abajo));
    return absolutos || porcentuales;
  });
}

async function fetchAlertasEnviadas(url, key) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const to = offset + pageSize - 1;
    const res = await fetch(`${url}/rest/v1/alertas_enviadas?select=user_id,simbolo,tipo,nivel`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${to}`,
        "Range-Unit": "items"
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      if (res.status === 416) break;
      const err = await res.text().catch(() => "");
      console.warn(`Aviso al leer alertas_enviadas (HTTP ${res.status}): ${err.slice(0, 100)}`);
      break;
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

async function fetchUserEmails(url, key, userIds) {
  const map = new Map();
  if (!userIds || userIds.length === 0) return map;
  const CHUNK_SIZE = 50;
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    const inFilter = `(${chunk.map((id) => `"${id.replaceAll('"', "")}"`).join(",")})`;
    const endpoint = `${url}/rest/v1/users?id=in.${encodeURIComponent(inFilter)}&select=id,email`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        for (const u of rows) {
          if (u.id && u.email) map.set(u.id, u.email);
        }
      }
    } else {
      console.warn(`No se pudieron consultar emails de usuarios (HTTP ${res.status})`);
    }
  }
  // Fallback: public.users puede no tener el correo (o no tener fila).
  // Se resuelve desde Auth para los que falten, con un tope por corrida.
  const missing = userIds.filter((id) => !map.has(id)).slice(0, 50);
  for (const id of missing) {
    try {
      const r = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) continue;
      const u = await r.json();
      if (u && u.email) map.set(id, u.email);
    } catch (e) {
      // se ignora: el aviso se saltará, como antes
    }
  }
  return map;
}

async function deleteAlertaEnviada(url, key, { user_id, simbolo, tipo, nivel }) {
  const query = `user_id=eq.${encodeURIComponent(user_id)}&simbolo=eq.${encodeURIComponent(simbolo)}&tipo=eq.${encodeURIComponent(tipo)}&nivel=eq.${encodeURIComponent(nivel)}`;
  const res = await fetch(`${url}/rest/v1/alertas_enviadas?${query}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Error al eliminar alerta enviada (HTTP ${res.status}): ${err.slice(0, 100)}`);
  }
}

async function insertAlertaEnviada(url, key, { user_id, simbolo, tipo, nivel, precio }) {
  const res = await fetch(`${url}/rest/v1/alertas_enviadas`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ user_id, simbolo, tipo, nivel, precio }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Error al registrar alerta enviada (HTTP ${res.status}): ${err.slice(0, 100)}`);
  }
}

async function sendEmail({ resendKey, from, to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

function isoDaysAgo(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function ageDays(fecha, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))) return Infinity;
  const obsMs = Date.parse(`${fecha}T00:00:00Z`);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!Number.isFinite(obsMs)) return Infinity;
  return (todayMs - obsMs) / 864e5;
}

function isDatasetFresh(dataset, now = new Date()) {
  if (!dataset || !dataset.actualizado) return false;
  const updatedMs = Date.parse(dataset.actualizado);
  if (!Number.isFinite(updatedMs)) return false;
  const ageMs = now.getTime() - updatedMs;
  return ageMs >= -864e5 && ageMs <= MAX_DATASET_AGE_DAYS * 864e5;
}

function latestOfficialPoint(simbolo, datasets = DATASETS) {
  if (datasets === DATASETS) {
    const pts = sourcePoints(simbolo);
    return pts && pts.length ? pts[pts.length - 1] : null;
  }
  const src = SOURCES[simbolo];
  if (!src) return null;
  const raw = datasets?.[src.fuente]?.series?.[src.clave];
  const values = Array.isArray(raw) ? raw : raw?.serie;
  if (!Array.isArray(values)) return null;
  const pts = values
    .filter(([date, value]) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(date) && Number.isFinite(Number(value)))
    .map(([date, value]) => [date.length === 7 ? `${date}-01` : date, Number(value)]);
  return pts.length ? pts[pts.length - 1] : null;
}

async function fetchLatestSmvDate(url, key) {
  const res = await fetch(`${url}/rest/v1/cotizaciones_smv?select=fecha&order=fecha.desc&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} al consultar cotizaciones_smv: ${err.slice(0, 100)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows[0]?.fecha ? String(rows[0].fecha).slice(0, 10) : null;
}

async function fetchSmvLatest(nemo, desde, { url, key }) {
  const envUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const envKey = process.env.SUPABASE_SERVICE_KEY || "";
  if (url === envUrl && key === envKey) {
    const rows = await smvRows(nemo, desde, { limit: 1, timeoutMs: 10000 });
    return rows[0] || null;
  }
  const endpoint = `${url}/rest/v1/cotizaciones_smv?nemonico=eq.${encodeURIComponent(nemo)}&fecha=gte.${desde}&select=fecha,cierre&order=fecha.desc&limit=1`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} al leer cotizaciones_smv: ${err.slice(0, 100)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? { fecha: rows[0].fecha, cierre: Number(rows[0].cierre) } : null;
}

async function checkBaseSources({ url, key, now, datasets }) {
  const errores = [];
  if (!isDatasetFresh(datasets?.bcrp, now)) {
    errores.push("bcrp-daily desactualizado");
  } else {
    const pen = latestOfficialPoint("PEN=X", datasets);
    const penAge = pen ? ageDays(pen[0], now) : Infinity;
    if (!pen || penAge < -1 || penAge > MAX_AGE_BY_SOURCE.bcrp) {
      errores.push("PEN=X sin precio reciente");
    }
  }
  try {
    const latestSmv = await fetchLatestSmvDate(url, key);
    const smvAge = ageDays(latestSmv, now);
    if (!latestSmv || smvAge < -1 || smvAge > MAX_AGE_BY_SOURCE.smv) {
      errores.push("cotizaciones_smv sin cierres recientes");
    }
  } catch (e) {
    errores.push(`cotizaciones_smv (${e.message})`);
  }
  return errores;
}

async function resolvePrices(symbols, { url, key, now, datasets }) {
  const prices = new Map();
  const problemas = [];
  const lmSymbols = [];

  for (const simbolo of symbols) {
    const source = SOURCES[simbolo];
    if (source) {
      if (!isDatasetFresh(datasets?.[source.fuente], now)) {
        problemas.push({ simbolo, motivo: `fuente ${source.fuente} desactualizada` });
        continue;
      }
      const pt = latestOfficialPoint(simbolo, datasets);
      const precio = Number(pt?.[1]);
      const days = pt ? ageDays(pt[0], now) : Infinity;
      const maxDays = MAX_AGE_BY_SOURCE[source.fuente] ?? MAX_AGE_BY_SOURCE.bcrp;
      if (!pt || !Number.isFinite(precio) || days < -1 || days > maxDays) {
        problemas.push({ simbolo, motivo: pt ? `precio viejo (${pt[0]})` : "sin precio" });
        continue;
      }
      prices.set(simbolo, precio);
      continue;
    }

    const nemo = nemonicoOf(simbolo);
    if (nemo) {
      lmSymbols.push({ simbolo, nemo });
    } else {
      problemas.push({ simbolo, motivo: "sin fuente de precio" });
    }
  }

  const desde = isoDaysAgo(SMV_LOOKBACK_DAYS, now);
  for (let i = 0; i < lmSymbols.length; i += SMV_BATCH_SIZE) {
    const batch = lmSymbols.slice(i, i + SMV_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ simbolo, nemo }) => {
        try {
          const row = await fetchSmvLatest(nemo, desde, { url, key });
          if (!row) return { simbolo, motivo: "sin precio reciente" };
          const precio = Number(row.cierre);
          const fecha = String(row.fecha || "").slice(0, 10);
          const days = ageDays(fecha, now);
          if (!Number.isFinite(precio) || precio <= 0) {
            return { simbolo, motivo: "cierre inválido" };
          }
          if (days < -1 || days > MAX_AGE_BY_SOURCE.smv) {
            return { simbolo, motivo: `precio viejo (${fecha})` };
          }
          return { simbolo, precio };
        } catch (e) {
          return { simbolo, motivo: e.message };
        }
      })
    );
    for (const r of results) {
      if (r.motivo) problemas.push({ simbolo: r.simbolo, motivo: r.motivo });
      else prices.set(r.simbolo, r.precio);
    }
  }

  return { prices, problemas };
}

export async function runAlertas({
  dry = process.argv.includes("--dry"),
  env = process.env,
  now = new Date(),
  datasets = DATASETS
} = {}) {
  const supabaseUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseKey = env.SUPABASE_SERVICE_KEY || "";
  const resendKey = env.RESEND_API_KEY || "";
  const emailFrom = env.EMAIL_FROM || "PerData <avisos@perdata.site>";

  if (dry) {
    console.log("Modo simulación activado (--dry).");
  }

  if (!supabaseUrl || !supabaseKey) {
    if (dry) {
      console.log("[DRY] Habría 0 avisos (faltan credenciales de Supabase).");
      return { exitCode: 0, sent: 0, failed: 0, dry, problemasPrecio: [] };
    }
    console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_KEY.");
    return { exitCode: 1, sent: 0, failed: 0, dry, problemasPrecio: [] };
  }

  const baseErrores = await checkBaseSources({ url: supabaseUrl, key: supabaseKey, now, datasets });
  if (baseErrores.length > 0) {
    console.error(`Faltan precios o son viejos: ${baseErrores.join(", ")}.`);
    return { exitCode: 1, sent: 0, failed: 0, dry, problemasPrecio: baseErrores };
  }

  let seguimientoRows = [];
  try {
    seguimientoRows = await fetchSeguimiento(supabaseUrl, supabaseKey);
  } catch (e) {
    // La tabla puede no existir todavía (migración 0010 pendiente): no es un fallo del trabajo.
    if (/HTTP 404|PGRST205/.test(e.message)) {
      console.log("La tabla seguimiento aún no existe; no hay avisos que enviar.");
      return { exitCode: 0, sent: 0, failed: 0, dry, problemasPrecio: [] };
    }
    console.error("Error leyendo seguimiento:", e.message);
    return { exitCode: 1, sent: 0, failed: 0, dry, problemasPrecio: [] };
  }

  if (seguimientoRows.length === 0) {
    console.log(dry ? "[DRY] Habría 0 avisos." : "0 avisos.");
    return { exitCode: 0, sent: 0, failed: 0, dry, problemasPrecio: [] };
  }

  const symbols = [...new Set(seguimientoRows.map((r) => r.simbolo).filter(Boolean))];
  const { prices, problemas: problemasPrecio } = await resolvePrices(symbols, {
    url: supabaseUrl,
    key: supabaseKey,
    now,
    datasets
  });

  let enviadasRows = [];
  try {
    enviadasRows = await fetchAlertasEnviadas(supabaseUrl, supabaseKey);
  } catch (e) {
    console.warn("No se pudo cargar alertas_enviadas:", e.message);
  }

  const enviadasSet = new Set(
    enviadasRows.map((r) => `${r.user_id}|${r.simbolo}|${r.tipo}|${Number(r.nivel)}`)
  );

  let toSend = [];
  const toRearm = [];

  for (const row of seguimientoRows) {
    const { user_id, simbolo } = row;
    if (!prices.has(simbolo)) continue;
    const precio = prices.get(simbolo);

    const { avisar, rearmar } = evaluarFila({ fila: row, precio, enviadas: enviadasSet });

    for (const item of avisar) {
      toSend.push({
        user_id,
        simbolo,
        tipo: item.tipo,
        nivel: item.nivel,
        precio,
        base: item.base
      });
    }

    for (const item of rearmar) {
      toRearm.push({ user_id, simbolo, tipo: item.tipo, nivel: item.nivel });
    }
  }

  // Rearmes (borrar alertas enviadas para que puedan volver a dispararse)
  if (toRearm.length > 0) {
    console.log(`Procesando ${toRearm.length} rearmes.`);
    for (const item of toRearm) {
      if (dry) {
        console.log(`[DRY] Rearme pendiente: ${item.simbolo} ${item.tipo}`);
      } else {
        try {
          await deleteAlertaEnviada(supabaseUrl, supabaseKey, item);
        } catch (e) {
          console.warn(`Error al borrar rearme (${item.simbolo} ${item.tipo}): ${e.message}`);
        }
      }
    }
  }

  if (toSend.length === 0) {
    if (problemasPrecio.length > 0) {
      console.error(`Faltan precios o son viejos: ${problemasPrecio.map((p) => `${p.simbolo} (${p.motivo})`).join(", ")}.`);
      return { exitCode: 1, sent: 0, failed: 0, dry, problemasPrecio };
    }
    console.log(dry ? "[DRY] Habría 0 avisos." : "0 avisos.");
    return { exitCode: 0, sent: 0, failed: 0, dry, problemasPrecio: [] };
  }

  if (toSend.length > MAX_CORREOS) {
    console.log(`Hay ${toSend.length} avisos pendientes; se limita a ${MAX_CORREOS} en esta corrida.`);
    toSend = toSend.slice(0, MAX_CORREOS);
  }

  const userIds = [...new Set(toSend.map((a) => a.user_id))];
  const userEmails = await fetchUserEmails(supabaseUrl, supabaseKey, userIds);

  let successCount = 0;
  let failCount = 0;

  for (const alert of toSend) {
    const email = userEmails.get(alert.user_id);
    if (!email) {
      console.warn(`Aviso sin correo registrado (${alert.simbolo}); se salta.`);
      failCount++;
      continue;
    }

    if (dry) {
      console.log(`[DRY] Aviso pendiente: ${alert.simbolo} ${alert.tipo} precio=${alert.precio}`);
      successCount++;
      continue;
    }

    if (!resendKey) {
      console.error("Falta RESEND_API_KEY para enviar correos.");
      failCount++;
      continue;
    }

    try {
      const emailPayload = buildAlertEmail({
        to: email,
        simbolo: alert.simbolo,
        tipo: alert.tipo,
        nivel: alert.nivel,
        precio: alert.precio,
        base: alert.base
      });

      await sendEmail({
        resendKey,
        from: emailFrom,
        to: emailPayload.to,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text
      });

      await insertAlertaEnviada(supabaseUrl, supabaseKey, alert);
      successCount++;
      console.log(`Aviso enviado: ${alert.simbolo} ${alert.tipo}`);
    } catch (e) {
      failCount++;
      console.error(`Error al enviar aviso (${alert.simbolo} ${alert.tipo}): ${e.message}`);
    }
  }

  if (dry) {
    console.log(`[DRY] Habría ${successCount} avisos (${failCount} fallidos).`);
  } else {
    console.log(`Resumen: ${successCount} enviados, ${failCount} fallidos.`);
  }

  if (problemasPrecio.length > 0) {
    console.error(`Faltan precios o son viejos: ${problemasPrecio.map((p) => `${p.simbolo} (${p.motivo})`).join(", ")}.`);
    return { exitCode: 1, sent: successCount, failed: failCount, dry, problemasPrecio };
  }

  if (toSend.length > 0 && successCount === 0) {
    return { exitCode: 1, sent: successCount, failed: failCount, dry, problemasPrecio: [] };
  }

  return { exitCode: 0, sent: successCount, failed: failCount, dry, problemasPrecio: [] };
}

const esPrincipal = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (esPrincipal) {
  runAlertas()
    .then((res) => process.exit(res.exitCode))
    .catch((err) => {
      console.error("Error fatal en scripts/alertas.js:", err);
      process.exit(1);
    });
}
