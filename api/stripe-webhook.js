/**
 * PerData - Stripe webhook. Keeps users.plan in sync with the subscription.
 * Subscribe the endpoint to:
 *   checkout.session.completed, customer.subscription.created,
 *   customer.subscription.updated, customer.subscription.deleted
 */

import { findUserById, findUserByCustomerId, updateUser } from "./_lib/users.js";
import { ACTIVE_STATUSES } from "./_lib/plans.js";
import { sendJson, readRawBody } from "./_lib/session.js";
import { stripe, verifyWebhookSignature } from "./_lib/stripe.js";

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
      await applySubscription(sub, obj.client_reference_id || (obj.metadata && obj.metadata.user_id));
    } else if (event.type.startsWith("customer.subscription.")) {
      await applySubscription(obj, obj.metadata && obj.metadata.user_id);
    }
  } catch (e) {
    console.error(`[stripe-webhook] ${event.type} failed:`, e.message);
    // 500 makes Stripe retry with backoff.
    return sendJson(res, 500, { error: "Processing failed" });
  }

  return sendJson(res, 200, { received: true });
}

async function applySubscription(sub, userIdHint) {
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
  await updateUser(user.id, {
    plan: ACTIVE_STATUSES.has(sub.status) ? "pro" : "free",
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null
  });
}
