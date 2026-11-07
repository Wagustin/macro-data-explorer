/**
 * PerData - Envío de avisos de precio por correo.
 * Revisa los umbrales de alerta definidos en la tabla seguimiento
 * contra el último precio disponible en data/history-120.json.
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

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { evaluarFila } from "./alertas-reglas.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "PerData <avisos@perdata.site>";

const MAX_CORREOS = 40;

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

async function fetchSeguimiento(url, key) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const to = offset + pageSize - 1;
    const res = await fetch(`${url}/rest/v1/seguimiento?select=user_id,simbolo,alerta_arriba,alerta_abajo,precio_base,alerta_pct_arriba,alerta_pct_abajo`, {
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

async function main() {
  if (DRY) {
    console.log("Modo simulación activado (--dry).");
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    if (DRY) {
      console.log("0 avisos.");
      process.exit(0);
    }
    console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_KEY.");
    process.exit(1);
  }

  const historyPath = path.join(ROOT, "data", "history-120.json");
  let history = {};
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    } catch (e) {
      console.error("Error al leer data/history-120.json:", e.message);
    }
  }

  let seguimientoRows = [];
  try {
    seguimientoRows = await fetchSeguimiento(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  } catch (e) {
    // La tabla puede no existir todavía (migración 0010 pendiente): no es un fallo del trabajo.
    if (DRY || /HTTP 404|PGRST205/.test(e.message)) {
      console.log(DRY ? "0 avisos." : "La tabla seguimiento aún no existe; no hay avisos que enviar.");
      process.exit(0);
    }
    console.error("Error leyendo seguimiento:", e.message);
    process.exit(1);
  }

  if (seguimientoRows.length === 0) {
    console.log("0 avisos.");
    process.exit(0);
  }

  let enviadasRows = [];
  try {
    enviadasRows = await fetchAlertasEnviadas(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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
    const series = history[simbolo];
    if (!Array.isArray(series) || series.length === 0) continue;
    const lastPoint = series[series.length - 1];
    const precio = Number(lastPoint?.close);
    if (!Number.isFinite(precio)) continue;

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
      if (DRY) {
        console.log(`[DRY] Rearme a borrar: usuario=${item.user_id}, simbolo=${item.simbolo}, tipo=${item.tipo}, nivel=${item.nivel}`);
      } else {
        try {
          await deleteAlertaEnviada(SUPABASE_URL, SUPABASE_SERVICE_KEY, item);
        } catch (e) {
          console.warn(`Error al borrar rearme: ${e.message}`);
        }
      }
    }
  }

  if (toSend.length === 0) {
    console.log("0 avisos.");
    process.exit(0);
  }

  if (toSend.length > MAX_CORREOS) {
    console.log(`Hay ${toSend.length} avisos pendientes; se limita a ${MAX_CORREOS} en esta corrida.`);
    toSend = toSend.slice(0, MAX_CORREOS);
  }

  const userIds = [...new Set(toSend.map((a) => a.user_id))];
  const userEmails = await fetchUserEmails(SUPABASE_URL, SUPABASE_SERVICE_KEY, userIds);

  let successCount = 0;
  let failCount = 0;

  for (const alert of toSend) {
    const email = userEmails.get(alert.user_id);
    if (!email) {
      console.warn(`Usuario ${alert.user_id} no tiene correo registrado; se salta.`);
      failCount++;
      continue;
    }

    if (DRY) {
      console.log(`[DRY] Aviso a enviar a ${email}: ${alert.simbolo} ${alert.tipo} nivel=${alert.nivel} precio=${alert.precio}`);
      successCount++;
      continue;
    }

    if (!RESEND_API_KEY) {
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
        resendKey: RESEND_API_KEY,
        from: EMAIL_FROM,
        to: emailPayload.to,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text
      });

      await insertAlertaEnviada(SUPABASE_URL, SUPABASE_SERVICE_KEY, alert);
      successCount++;
      console.log(`Aviso enviado a ${email}: ${alert.simbolo} ${alert.tipo} ${alert.nivel}`);
    } catch (e) {
      failCount++;
      console.error(`Error al enviar aviso a ${email}: ${e.message}`);
    }
  }

  console.log(`Resumen: ${successCount} enviados/simulados, ${failCount} fallidos.`);

  if (toSend.length > 0 && successCount === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error fatal en scripts/alertas.js:", err);
  process.exit(1);
});
