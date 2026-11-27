// Envío por lotes del boletín con lotes estables, Idempotency-Key de Resend
// y registro opcional por destinatario en Supabase (boletin_envios).
import crypto from "crypto";

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

// Orden estable: dueños (BOLETIN_TO que no están activos en suscriptores) primero,
// luego suscriptores por fecha de confirmación (o creación) y correo. Así las altas
// nuevas quedan al final y las bajas de hoy conservan su posición en el lote.
export function ordenarDestinatarios(suscriptores = [], ownersEmails = []) {
  const rows = (Array.isArray(suscriptores) ? suscriptores : [])
    .map((r) => ({
      email: String(r?.email || "").trim().toLowerCase(),
      token: r?.token ?? null,
      empresas: Array.isArray(r?.empresas) ? r.empresas : [],
      activo: r?.estado == null ? true : r.estado === "activo",
      creado: r?.creado || "",
      confirmado: r?.confirmado || "",
    }))
    .filter((r) => r.email);

  rows.sort((a, b) => {
    const ta = String(a.confirmado || a.creado || "");
    const tb = String(b.confirmado || b.creado || "");
    return ta.localeCompare(tb) || a.email.localeCompare(b.email);
  });

  const activosSet = new Set(rows.filter((r) => r.activo).map((r) => r.email));
  const owners = [...new Set((Array.isArray(ownersEmails) ? ownersEmails : [])
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean))]
    .filter((email) => !activosSet.has(email))
    .sort((a, b) => a.localeCompare(b))
    .map((email) => ({ email, token: null, empresas: [], activo: true, creado: "", confirmado: "" }));

  return [...owners, ...rows];
}

export function partirEnLotes(slots = [], tamano = 100) {
  const lotes = [];
  for (let i = 0; i < slots.length; i += tamano) {
    lotes.push({ indice: lotes.length, slots: slots.slice(i, i + tamano) });
  }
  return lotes;
}

export function claveIdempotencia({ fecha, indice, loteSlots, pendientes, force = false, forceId = "" }) {
  if (force) return `boletin-${fecha}-force-${forceId || Date.now()}-lote-${indice}`;
  const huboFiltrado = Array.isArray(loteSlots) && pendientes.length < loteSlots.filter((x) => x.activo).length;
  if (!huboFiltrado) return `boletin-${fecha}-lote-${indice}`;
  const huella = crypto.createHash("sha256")
    .update(pendientes.map((x) => x.email).sort().join(","))
    .digest("hex")
    .slice(0, 12);
  return `boletin-${fecha}-lote-${indice}-${huella}`;
}

// Resend devuelve 409 invalid_idempotent_request si la clave ya se usó en las
// últimas 24 h con otro contenido o lista de destinatarios. No debe detener
// ni reenviar ese lote ni bloquear los lotes posteriores que faltaron.
export function esConflictoIdempotencia(status, bodyText = "") {
  if (status !== 409) return false;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.name === "concurrent_idempotent_requests") return false;
  } catch {}
  return !/concurrent_idempotent_requests/i.test(bodyText);
}

export async function cargarSuscriptores({ supabaseUrl, supabaseKey, fecha, fetchImpl = fetch, warn = console.error }) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  if (!base || !supabaseKey) return [];
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const desdeHoy = `${fecha}T00:00:00Z`;
  const conBajasDeHoy = `${base}/rest/v1/boletin_suscriptores?or=(estado.eq.activo,and(estado.eq.baja,baja.gte.${encodeURIComponent(desdeHoy)}))&select=email,token,empresas,estado,creado,confirmado&order=confirmado.asc.nullsfirst,creado.asc,email.asc`;
  const soloActivos = `${base}/rest/v1/boletin_suscriptores?estado=eq.activo&select=email,token,empresas,estado,creado,confirmado&order=confirmado.asc.nullsfirst,creado.asc,email.asc`;
  try {
    let r = await fetchImpl(conBajasDeHoy, { headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) r = await fetchImpl(soloActivos, { headers, signal: AbortSignal.timeout(15000) });
    if (r.ok) return await r.json();
    warn(`Suscriptores no disponibles (HTTP ${r.status}); se envía solo a BOLETIN_TO`);
  } catch (e) {
    warn(`Suscriptores no disponibles (${e.message}); se envía solo a BOLETIN_TO`);
  }
  return [];
}

export async function leerYaEnviados({ supabaseUrl, supabaseKey, fecha, fetchImpl = fetch, warn = console.error }) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  if (!base || !supabaseKey) return new Set();
  try {
    const r = await fetchImpl(`${base}/rest/v1/boletin_envios?fecha=eq.${encodeURIComponent(fecha)}&select=email`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return new Set();
    const rows = await r.json();
    return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x?.email || "").trim().toLowerCase()).filter(Boolean));
  } catch (e) {
    warn(`No se pudo leer boletin_envios (${e.message}); se confía en Idempotency-Key`);
    return new Set();
  }
}

export async function registrarEnviados({ supabaseUrl, supabaseKey, fecha, emails, fetchImpl = fetch, warn = console.error }) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  if (!base || !supabaseKey || !emails?.length) return;
  try {
    const r = await fetchImpl(`${base}/rest/v1/boletin_envios?on_conflict=fecha,email`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(emails.map((email) => ({ fecha, email }))),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok && r.status !== 404) {
      warn(`No se pudo registrar boletin_envios (HTTP ${r.status})`);
    }
  } catch (e) {
    warn(`No se pudo registrar boletin_envios (${e.message})`);
  }
}

export async function enviarLotes({
  slots,
  fecha,
  alreadySent = new Set(),
  buildMsg,
  resendKey,
  force = false,
  forceId = "",
  supabaseUrl = "",
  supabaseKey = "",
  fetchImpl = fetch,
  log = console.log,
  warn = console.error,
  batchSize = 100,
}) {
  let sent = 0;
  let omitidos = 0;
  const lotes = partirEnLotes(slots, batchSize);
  const fId = force ? (forceId || String(Date.now())) : "";

  for (const { indice, slots: loteSlots } of lotes) {
    const activosLote = loteSlots.filter((x) => x.activo);
    const pendientes = force ? activosLote : activosLote.filter((x) => !alreadySent.has(x.email));
    omitidos += activosLote.length - pendientes.length;
    if (!pendientes.length) continue;

    const idempotencyKey = claveIdempotencia({
      fecha,
      indice,
      loteSlots,
      pendientes,
      force,
      forceId: fId,
    });

    const payload = pendientes.map(buildMsg);
    const r = await fetchImpl(RESEND_BATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (r.ok) {
      sent += pendientes.length;
      if (!force) {
        await registrarEnviados({
          supabaseUrl,
          supabaseKey,
          fecha,
          emails: pendientes.map((x) => x.email),
          fetchImpl,
          warn,
        });
      }
      continue;
    }

    const bodyText = await r.text().catch(() => "");
    if (!force && esConflictoIdempotencia(r.status, bodyText)) {
      log(`Lote ${indice} ya enviado hoy con otro contenido (Resend HTTP 409); se omite para no repetir ni bloquear los demás lotes`);
      omitidos += pendientes.length;
      continue;
    }

    throw new Error(`Resend: HTTP ${r.status} ${bodyText}`);
  }

  return { sent, omitidos, totalActivos: sent + omitidos };
}
