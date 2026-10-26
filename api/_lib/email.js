/**
 * PerData - Transactional email via Resend's REST API (no SDK).
 * Needs RESEND_API_KEY and EMAIL_FROM (a sender on a domain verified in Resend).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "";

export const EMAIL_ENABLED = !!(RESEND_API_KEY && EMAIL_FROM);

export async function sendEmail({ to, subject, html, text }) {
  if (!EMAIL_ENABLED) throw new Error("Email provider not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export function passwordResetEmail(name, link) {
  const greeting = name ? `Hola, ${name}:` : "Hola:";
  return {
    subject: "Restablece tu contraseña de PerData",
    text: `${greeting}\n\nRecibimos una solicitud para restablecer tu contraseña. Abre este enlace (vence en 1 hora):\n\n${link}\n\nSi no fuiste tú, ignora este correo; tu contraseña no cambiará.\n\nPerData`,
    html: `<div style="background:#F5F1E8;padding:28px 16px"><div style="max-width:480px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#1B1916">
  <p style="font-family:Georgia,serif;font-style:italic;font-weight:600;font-size:26px;margin:0 0 20px">PerData</p>
  <p style="margin:0 0 12px;font-size:16px">${greeting.replace(/</g, "&lt;")}</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.5">Recibimos una solicitud para restablecer tu contraseña. El enlace vence en 1 hora.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#1B1916;color:#F5F1E8;text-decoration:none;font-weight:600;padding:13px 24px">Elegir nueva contraseña</a></p>
  <p style="margin:0;color:#5E584E;font-size:13px;line-height:1.5">Si no fuiste tú, ignora este correo; tu contraseña no cambiará.<br>Equipo de PerData</p>
</div></div>`
  };
}
