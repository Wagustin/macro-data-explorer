/**
 * PerData - Stripe webhook. Keeps users.plan in sync with the subscription.
 * Subscribe the endpoint to:
 *   checkout.session.completed, customer.subscription.created,
 *   customer.subscription.updated, customer.subscription.deleted,
 *   customer.subscription.trial_will_end
 */

import { findUserById, findUserByCustomerId, updateUser } from "./_lib/users.js";
import { ACTIVE_STATUSES } from "./_lib/plans.js";
import { sendJson, readRawBody } from "./_lib/session.js";
import { stripe, verifyWebhookSignature, BOLETIN_PRICE_IDS } from "./_lib/stripe.js";
import { sendEmail, trialEndingEmail } from "./_lib/email.js";

// Signature verification needs the exact bytes Stripe sent.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const raw = await readRawBody(req);
  if (!verifyWebhookSignature(raw, req.headers["stripe-signature"])) {
    return sendJson(res, 400, { error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    return sendJson(res, 400, { error: "Invalid payload" });
  }

  try {
    const obj = event.data && event.data.object;
    if (event.type === "checkout.session.completed" && obj.mode === "subscription" && obj.subscription) {
      // Re-fetch so we act on the subscription's current state, not the event snapshot.
      const sub = await stripe("GET", `/subscriptions/${obj.subscription}`);
      await applySubscription(sub, obj.client_reference_id || (obj.metadata && obj.metadata.user_id), event.type);
    } else if (event.type === "customer.subscription.trial_will_end") {
      await trialWillEnd(obj, obj.metadata && obj.metadata.user_id);
    } else if (event.type.startsWith("customer.subscription.")) {
      await applySubscription(obj, obj.metadata && obj.metadata.user_id, event.type);
    }
  } catch (e) {
    console.error(`[stripe-webhook] ${event.type} failed:`, e.message);
    // 500 makes Stripe retry with backoff.
    return sendJson(res, 500, { error: "Processing failed" });
  }

  return sendJson(res, 200, { received: true });
}

async function applySubscription(sub, userIdHint, eventType) {
  const user = (userIdHint && await findUserById(userIdHint)) || await findUserByCustomerId(sub.customer);
  if (!user) {
    console.warn(`[stripe-webhook] no user for customer ${sub.customer}`);
    return;
  }
  // Ignore stale events for an older subscription once the user has a newer one.
  if (user.stripe_subscription_id && user.stripe_subscription_id !== sub.id && sub.status !== "active" && sub.status !== "trialing") {
    return;
  }
  const periodEnd = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end);
  // The plan follows the price that was bought: Boletín prices grant "boletin", the rest "pro"
  const priceIds = ((sub.items && sub.items.data) || []).map((i) => i.price && i.price.id);
  const paidPlan = priceIds.some((id) => Object.values(BOLETIN_PRICE_IDS).includes(id)) ? "boletin" : "pro";
  await updateUser(user.id, {
    plan: ACTIVE_STATUSES.has(sub.status) ? paidPlan : "free",
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    ...(sub.status === "trialing" ? { trial_usado: true, trial_hasta: periodEnd ? new Date(periodEnd * 1000).toISOString() : null } : {})
  });
  // One trial per card: register the default payment method fingerprint. A
  // fingerprint already tied to another user ends the trial immediately.
  // Only the creation events register the card; later updates must not insert again.
  // Retries of the creation event still check first, so they never duplicate.
  if (sub.status === "trialing" && (eventType === "customer.subscription.created" || eventType === "checkout.session.completed")) {
    await oncePerCard(sub, user);
  }
}

async function oncePerCard(sub, user) {
  try {
    let expanded;
    try {
      expanded = await stripe("GET", `/subscriptions/${sub.id}?expand[]=default_payment_method`);
    } catch (e) {
      expanded = await stripe("GET", `/subscriptions/${sub.id}`, { "expand[]": "default_payment_method" });
    }
    const fingerprint = expanded.default_payment_method?.card?.fingerprint;
    if (!fingerprint) return;
    const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_KEY || "";
    if (!base || !key) return;
    const check = await fetch(`${base}/rest/v1/trial_tarjetas?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=user_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!check.ok) return;
    const rows = await check.json();
    const existing = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (existing && existing.user_id !== user.id) {
      console.warn(`[stripe-webhook] trial fingerprint reused by user ${user.id} (already used by ${existing.user_id}); ending trial now`);
      await stripe("POST", `/subscriptions/${sub.id}`, { trial_end: "now" });
      return;
    }
    if (!existing) {
      await fetch(`${base}/rest/v1/trial_tarjetas`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ fingerprint, user_id: user.id }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[stripe-webhook] trial fingerprint check failed:", e.message);
  }
}

async function trialWillEnd(sub, userIdHint) {
  const user = (userIdHint && await findUserById(userIdHint)) || await findUserByCustomerId(sub.customer);
  if (!user || !user.email) return;
  const periodEnd = sub.trial_end || sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  if (!periodEnd) return;
  const date = new Date(periodEnd * 1000).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval || "month";
  const msg = trialEndingEmail(user.name || "", date, interval);
  try {
    await sendEmail({ to: user.email, ...msg });
  } catch (e) {
    console.error("[stripe-webhook] trial_will_end email failed:", e.message);
  }
}
