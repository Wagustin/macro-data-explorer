/**
 * PerData - Minimal Stripe REST client (no SDK).
 */

import crypto from "crypto";

// Overridable only so the flow can be exercised against a local mock.
const STRIPE_API = process.env.STRIPE_API_BASE || "https://api.stripe.com/v1";
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
export const PRICE_IDS = {
  month: process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID || "",
  year: process.env.STRIPE_PRICE_ID_YEARLY || ""
};
export const STRIPE_ENABLED = !!(STRIPE_SECRET_KEY && PRICE_IDS.month);

/** Flattens {a:{b:[{c:1}]}} into Stripe's form encoding: a[b][0][c]=1 */
function encodeForm(obj, prefix, out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") encodeForm(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return out.join("&");
}

export async function stripe(method, endpoint, params) {
  const isGet = method === "GET";
  const query = params && isGet ? `?${encodeForm(params)}` : "";
  const res = await fetch(`${STRIPE_API}${endpoint}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Managed Payments requires basil or newer; basil moved current_period_end onto subscription items.
      "Stripe-Version": "2025-03-31.basil"
    },
    body: params && !isGet ? encodeForm(params) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json.error && json.error.message) || `Stripe HTTP ${res.status}`);
  }
  return json;
}

/** Verifies the Stripe-Signature header (v1 scheme, 5 minute tolerance). */
export function verifyWebhookSignature(rawBody, header, tolerance = 300) {
  if (!STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()])
  );
  const signatures = header.split(",").filter(p => p.trim().startsWith("v1=")).map(p => p.trim().slice(3));
  const timestamp = Number(parts.t);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) return false;
  const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some(sig => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
