/**
 * PerData - Billing API (Stripe Checkout + Customer Portal)
 *   GET  /api/billing?action=config            -> plans, prices, whether billing is live
 *   POST /api/billing {action:"checkout", interval:"month"|"year"}  (auth) -> {url}
 *   POST /api/billing {action:"portal"}                             (auth) -> {url}
 */

import { PLANS } from "./_lib/plans.js";
import { updateUser } from "./_lib/users.js";
import { getAuthUser, sendJson, securityHeaders, readJsonBody } from "./_lib/session.js";
import { stripe, STRIPE_ENABLED, PRICE_IDS } from "./_lib/stripe.js";

let priceCache = { at: 0, prices: [] };

async function loadPrices() {
  if (!STRIPE_ENABLED) return [];
  if (Date.now() - priceCache.at < 10 * 60 * 1000) return priceCache.prices;
  const prices = [];
  for (const [interval, id] of Object.entries(PRICE_IDS)) {
    if (!id) continue;
    try {
      const p = await stripe("GET", `/prices/${id}`);
      prices.push({
        interval,
        amount: p.unit_amount,
        currency: p.currency,
        trialDays: Number(process.env.STRIPE_TRIAL_DAYS || 0) || null
      });
    } catch (e) {
      console.error(`[billing] price ${id} lookup failed:`, e.message);
    }
  }
  priceCache = { at: Date.now(), prices };
  return prices;
}

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host}`;
}

export default async function handler(req, res) {
  securityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  const body = req.method === "POST" ? await readJsonBody(req) : {};
  const action = String(body.action || req.query?.action || "config").toLowerCase();

  if (action === "config") {
    return sendJson(res, 200, {
      enabled: STRIPE_ENABLED,
      plans: PLANS,
      prices: await loadPrices()
    });
  }

  if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Método no permitido." });
  if (!STRIPE_ENABLED) {
    return sendJson(res, 503, { success: false, error: "Los pagos aún no están habilitados. Vuelve pronto." });
  }

  let user;
  try {
    user = await getAuthUser(req);
  } catch (e) {
    return sendJson(res, 503, { success: false, error: "El servicio de cuentas no está disponible. Intenta de nuevo." });
  }
  if (!user) return sendJson(res, 401, { success: false, code: "auth_required", error: "Inicia sesión para continuar." });

  try {
    if (action === "checkout") {
      if (user.plan === "pro") {
        return sendJson(res, 409, { success: false, error: "Tu cuenta ya tiene el plan Pro." });
      }
      const interval = body.interval === "year" && PRICE_IDS.year ? "year" : "month";
      const customerId = await ensureCustomer(user);
      const trialDays = Number(process.env.STRIPE_TRIAL_DAYS || 0);
      const session = await stripe("POST", "/checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: PRICE_IDS[interval], quantity: 1 }],
        allow_promotion_codes: "true",
        billing_address_collection: "auto",
        locale: "es",
        subscription_data: {
          metadata: { user_id: user.id },
          trial_period_days: trialDays > 0 ? trialDays : undefined
        },
        metadata: { user_id: user.id },
        success_url: `${appUrl(req)}/cuenta?checkout=success`,
        cancel_url: `${appUrl(req)}/precios?checkout=cancelled`
      });
      return sendJson(res, 200, { success: true, url: session.url });
    }

    if (action === "portal") {
      if (!user.stripe_customer_id) {
        return sendJson(res, 400, { success: false, error: "Tu cuenta aún no tiene una suscripción." });
      }
      const portal = await stripe("POST", "/billing_portal/sessions", {
        customer: user.stripe_customer_id,
        return_url: `${appUrl(req)}/cuenta`
      });
      return sendJson(res, 200, { success: true, url: portal.url });
    }
  } catch (e) {
    console.error(`[billing] ${action} failed:`, e.message);
    return sendJson(res, 502, { success: false, error: "No pudimos conectar con el procesador de pagos. Intenta de nuevo." });
  }

  return sendJson(res, 400, { success: false, error: "Acción no válida." });
}

async function ensureCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripe("POST", "/customers", {
    email: user.email,
    name: user.name || undefined,
    metadata: { user_id: user.id }
  });
  await updateUser(user.id, { stripe_customer_id: customer.id });
  return customer.id;
}
