// Cloudflare Turnstile: comprueba el token que manda el formulario.
// Sin TURNSTILE_SECRET_KEY no hace nada. Mientras TURNSTILE_ENFORCE no sea "1",
// un token ausente se acepta y se anota (solo se rechaza un token inválido),
// para poder activarlo sin romper formularios que aún no lo envían.
export async function turnstileOk(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) {
    if (process.env.TURNSTILE_ENFORCE === "1") return false;
    console.warn("[turnstile] petición sin token");
    return true;
  }
  try {
    const body = new URLSearchParams({ secret, response: String(token).slice(0, 2048) });
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const d = await r.json();
    return d.success === true;
  } catch (e) {
    // Si la verificación de Cloudflare no responde, no bloqueamos a la gente
    console.error("[turnstile]", e.message);
    return true;
  }
}
