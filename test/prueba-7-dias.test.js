import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy_with_enough_length";
process.env.STRIPE_PRICE_ID_MONTHLY = "price_test_monthly_pro";
process.env.STRIPE_PRICE_ID_YEARLY = "price_test_yearly_pro";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy_webhook_secret_for_tests";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-key-test";
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "PerData <no-reply@perdata.site>";
process.env.JWT_SECRET = "trial-test-secret";

const billingHandler = (await import("../api/billing.js")).default;
const webhookHandler = (await import("../api/stripe-webhook.js")).default;
const { signSession, _clearUserCache } = await import("../api/_lib/session.js");
const { ACTIVE_STATUSES } = await import("../api/_lib/plans.js");
const { trialEndingEmail } = await import("../api/_lib/email.js");

const originalFetch = globalThis.fetch;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(body) { this.body = body; }
  };
}

function decodeForm(body) {
  const out = {};
  for (const part of String(body).split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

// Builds a fake fetch with a small in-memory PostgREST for the tables the
// handlers touch, plus mocked Stripe and Resend endpoints.
function installMock({ users, trialCards, usedTrialOnce, subscriptionList, subscriptionListFails, trialIntervalMissing, subscriptionInterval = "month" } = {}) {
  _clearUserCache();
  const stripeCalls = [];
  const emails = [];
  const trialTarjetas = new Map((trialCards || []).map((r) => [r.fingerprint, r]));
  const usersById = new Map((users || []).map((u) => [u.id, { ...u }]));
  const usedOnce = usedTrialOnce || new Set();
  const patches = [];

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    const body = init.body;

    // Stripe API
    if (u.hostname === "api.stripe.com") {
      stripeCalls.push({ method, path: u.pathname + u.search, body: body ? decodeForm(body) : {} });
      if (u.pathname === "/v1/subscriptions" && method === "GET") {
        if (subscriptionListFails) return jsonResponse({ error: { message: "Stripe caído" } }, 500);
        return jsonResponse({ object: "list", data: subscriptionList || [] });
      }
      const isSubscriptionRead = u.pathname === "/v1/subscriptions/sub_test" && method === "GET";
      if (isSubscriptionRead && u.search.includes("default_payment_method")) {
        return jsonResponse({
          id: "sub_test",
          default_payment_method: { card: { fingerprint: "fp_test_card" } }
        });
      }
      if (u.pathname === "/v1/prices/price_test_monthly_pro" || u.pathname.startsWith("/v1/prices/")) {
        return jsonResponse({ unit_amount: 199, currency: "usd" });
      }
      if (u.pathname.startsWith("/v1/customers") && method === "POST") {
        return jsonResponse({ id: "cus_test_1" });
      }
      if (u.pathname === "/v1/checkout/sessions" && method === "POST") {
        const form = decodeForm(body);
        return jsonResponse({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1", _form: form });
      }
      if (isSubscriptionRead) {
        const periodEnd = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
        return jsonResponse({
          id: "sub_test",
          customer: "cus_test_1",
          status: "trialing",
          current_period_end: periodEnd,
          trial_end: periodEnd,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: "price_1UUZSwPohxxHwL5eJPNVQba1", recurring: { interval: subscriptionInterval } }, current_period_end: periodEnd }] }
        });
      }
      if (u.pathname.startsWith("/v1/subscriptions/sub_test") && method === "POST") {
        const form = decodeForm(body);
        if (form.trial_end === "now") {
          stripeCalls.push({ method, path: "TRIAL_END_NOW" });
        }
        return jsonResponse({ id: "sub_test", status: "active" });
      }
      return jsonResponse({ id: "unknown" });
    }

    // Resend
    if (u.hostname === "api.resend.com") {
      const payload = JSON.parse(body || "{}");
      emails.push(payload);
      return jsonResponse({ id: "email_test_1" });
    }

    // Supabase PostgREST users
    if (u.pathname.startsWith("/rest/v1/users")) {
      const select = u.searchParams.get("select") || "";
      const id = u.searchParams.get("id")?.replace(/^eq\./, "") || "";
      const email = u.searchParams.get("email")?.replace(/^eq\./, "") || "";
      const customer = u.searchParams.get("stripe_customer_id")?.replace(/^eq\./, "") || "";
      let rows = [...usersById.values()];
      if (id) rows = rows.filter((r) => r.id === decodeURIComponent(id));
      if (email) rows = rows.filter((r) => r.email === decodeURIComponent(email));
      if (customer) rows = rows.filter((r) => r.stripe_customer_id === decodeURIComponent(customer));
      if (method === "GET") {
        if (trialIntervalMissing && select.includes("trial_interval")) {
          return jsonResponse({ message: "column users.trial_interval does not exist" }, 400);
        }
        if (select.includes("trial_usado")) {
          if (usedOnce.has("__error__")) throw new Error("column trial_usado does not exist");
          const mapped = rows.map((r) => ({
            ...r,
            trial_usado: usedOnce.has(r.id),
            trial_hasta: r.trial_hasta || null
          }));
          return jsonResponse(mapped);
        }
        return jsonResponse(rows);
      }
      if (method === "PATCH") {
        const patch = JSON.parse(body || "{}");
        patches.push(patch);
        if (trialIntervalMissing && "trial_interval" in patch) {
          return jsonResponse({ message: "column users.trial_interval does not exist" }, 400);
        }
        const target = usersById.get(decodeURIComponent(id));
        if (target) Object.assign(target, patch);
        return jsonResponse(target ? [target] : []);
      }
      return jsonResponse([]);
    }

    // Supabase PostgREST trial_tarjetas
    if (u.pathname.startsWith("/rest/v1/trial_tarjetas")) {
      if (method === "GET") {
        const fp = u.searchParams.get("fingerprint")?.replace(/^eq\./, "") || "";
        const row = trialTarjetas.get(decodeURIComponent(fp));
        return jsonResponse(row ? [row] : []);
      }
      if (method === "POST") {
        const row = JSON.parse(body || "{}");
        if (!trialTarjetas.has(row.fingerprint)) trialTarjetas.set(row.fingerprint, row);
        return jsonResponse([row]);
      }
      return jsonResponse([]);
    }

    return jsonResponse({ error: "not mocked" }, 404);
  };

  return { stripeCalls, emails, trialTarjetas, usersById, patches };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function checkoutReq({ plan = "boletin", interval = "month" } = {}) {
  const id = "user_trial_1";
  const token = signSession({ id, email: "trial@example.com" });
  return {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, host: "localhost", "x-forwarded-proto": "http" },
    body: { action: "checkout", plan, interval },
    query: {}
  };
}

function webhookReq(type, obj) {
  const event = { type, data: { object: obj } };
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return {
    method: "POST",
    headers: { host: "localhost", "stripe-signature": `t=${t},v1=${sig}` },
    rawBody: raw,
    query: {}
  };
}


test("eligible boletin user: checkout carries trial_period_days=7 and payment_method_collection=always", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: []
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "boletin" }), res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.url);
    const call = mock.stripeCalls.find((c) => c.path === "/v1/checkout/sessions");
    assert.ok(call, "checkout session call expected");
    assert.equal(call.body["subscription_data[trial_period_days]"], "7");
    assert.ok(!Object.keys(call.body).some((k) => k.startsWith("subscription_data[custom_text]")), "custom_text no va dentro de subscription_data");
    // payment_method_collection is a top-level session field in our code
    assert.equal(call.body["payment_method_collection"], "always");
    assert.equal(call.body["custom_text[submit][message]"], undefined, "Managed Payments rechaza custom_text");
  } finally {
    restore();
  }
});

test("already used the trial: checkout without trial", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: [],
    usedTrialOnce: new Set(["user_trial_1"])
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "boletin" }), res);
    assert.equal(res.statusCode, 200);
    const call = mock.stripeCalls.find((c) => c.path === "/v1/checkout/sessions");
    assert.ok(call);
    assert.equal(call.body["subscription_data[trial_period_days]"], undefined);
  } finally {
    restore();
  }
});

test("plan Pro: no trial offered", async () => {
  const mock = installMock({
    users: [{ id: "other_id", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: []
  });
  // The mocked user id is the signed-in id (user_trial_1); simulate a pro plan via webhook state:
  // instead call checkout with plan pro and check the session has no trial fields.
  try {
    const res = response();
    // billing checks user.plan from the DB user; seed a pro user with the signed-in id
    mock.usersById.set("user_trial_1", { id: "user_trial_1", email: "trial@example.com", plan: "pro", stripe_subscription_id: null });
    const req = checkoutReq({ plan: "pro" });
    await billingHandler(req, res);
    // Pro already subscribed returns 409; that also proves no trial session was created.
    assert.equal(res.statusCode, 409);
    assert.equal(mock.stripeCalls.some((c) => c.path === "/v1/checkout/sessions"), false);
  } finally {
    restore();
  }
});

test("Pro checkout for free user: no trial fields in session", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: []
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "pro" }), res);
    assert.equal(res.statusCode, 200);
    const call = mock.stripeCalls.find((c) => c.path === "/v1/checkout/sessions");
    assert.ok(call);
    assert.equal(call.body["subscription_data[trial_period_days]"], undefined);
    assert.equal(call.body["custom_text[submit][message]"], undefined);
  } finally {
    restore();
  }
});

test("reading trial_usado fails: checkout without trial", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: [],
    usedTrialOnce: new Set(["__error__"])
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "boletin" }), res);
    assert.equal(res.statusCode, 200);
    const call = mock.stripeCalls.find((c) => c.path === "/v1/checkout/sessions");
    assert.ok(call);
    assert.equal(call.body["subscription_data[trial_period_days]"], undefined);
  } finally {
    restore();
  }
});

function trialingSub(userId) {
  const periodEnd = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  return {
    id: "sub_test",
    customer: "cus_test_1",
    status: "trialing",
    current_period_end: periodEnd,
    trial_end: periodEnd,
    cancel_at_period_end: false,
    metadata: { user_id: userId, plan: "boletin" },
    items: { data: [{ price: { id: "price_1UUZSwPohxxHwL5eJPNVQba1", recurring: { interval: "month" } }, current_period_end: periodEnd }] }
  };
}

test("suscripción past_due existente: checkout responde 409 y no crea sesión", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_customer_id: "cus_test_1", stripe_subscription_id: "sub_old" }],
    trialCards: [],
    subscriptionList: [{ id: "sub_old", status: "past_due" }]
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "pro" }), res);
    assert.equal(res.statusCode, 409);
    assert.match(JSON.parse(res.body).error, /Gestionar suscripción/);
    assert.equal(mock.stripeCalls.some((c) => c.path === "/v1/checkout/sessions"), false);
  } finally {
    restore();
  }
});

test("sin suscripciones en Stripe: checkout sigue como antes", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: [],
    subscriptionList: []
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "pro" }), res);
    assert.equal(res.statusCode, 200);
    assert.ok(mock.stripeCalls.some((c) => c.path === "/v1/checkout/sessions"));
    const list = mock.stripeCalls.find((c) => c.path.startsWith("/v1/subscriptions?"));
    assert.ok(list, "debe consultar las suscripciones antes de crear la sesión");
    assert.match(list.path, /status=all/);
  } finally {
    restore();
  }
});

test("suscripción cancelada no bloquea el checkout", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: [],
    subscriptionList: [{ id: "sub_old", status: "canceled" }]
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "pro" }), res);
    assert.equal(res.statusCode, 200);
  } finally {
    restore();
  }
});

test("si Stripe no responde al listar suscripciones: 502 y sin sesión", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null }],
    trialCards: [],
    subscriptionListFails: true
  });
  try {
    const res = response();
    await billingHandler(checkoutReq({ plan: "pro" }), res);
    assert.equal(res.statusCode, 502);
    assert.equal(JSON.parse(res.body).error, "No pudimos comprobar tu suscripción. Inténtalo en unos minutos.");
    assert.equal(mock.stripeCalls.some((c) => c.path === "/v1/checkout/sessions"), false);
  } finally {
    restore();
  }
});

test("webhook new fingerprint: inserts and marks trial used", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null, stripe_customer_id: "cus_test_1" }],
    trialCards: []
  });
  try {
    const res = response();
    await webhookHandler(webhookReq("customer.subscription.created", trialingSub("user_trial_1")), res);
    assert.equal(res.statusCode, 200);
    assert.ok(mock.trialTarjetas.has("fp_test_card"));
    assert.equal(mock.trialTarjetas.get("fp_test_card").user_id, "user_trial_1");
    const updated = mock.usersById.get("user_trial_1");
    assert.equal(updated.trial_usado, true);
    assert.ok(updated.trial_hasta);
  } finally {
    restore();
  }
});

test("webhook repeated fingerprint from another user: ends trial now", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_2", email: "trial2@example.com", plan: "free", stripe_subscription_id: null, stripe_customer_id: "cus_test_1" }],
    trialCards: [{ fingerprint: "fp_test_card", user_id: "other_user" }]
  });
  try {
    const res = response();
    await webhookHandler(webhookReq("customer.subscription.created", trialingSub("user_trial_2")), res);
    assert.equal(res.statusCode, 200);
    assert.ok(mock.stripeCalls.some((c) => c.path === "TRIAL_END_NOW" || c.body.trial_end === "now"));
    const updated = mock.usersById.get("user_trial_2");
    assert.equal(updated.trial_usado, true);
  } finally {
    restore();
  }
});

test("webhook retry of same event: no duplicate insert", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null, stripe_customer_id: "cus_test_1" }],
    trialCards: []
  });
  try {
    await webhookHandler(webhookReq("customer.subscription.created", trialingSub("user_trial_1")), response());
    await webhookHandler(webhookReq("customer.subscription.created", trialingSub("user_trial_1")), response());
    assert.equal(mock.trialTarjetas.size, 1);
    // The second handling sees the fingerprint already tied to the same user and does not end the trial.
    assert.equal(mock.stripeCalls.some((c) => c.path === "TRIAL_END_NOW"), false);
  } finally {
    restore();
  }
});

test("trialing counts as an active plan", () => {
  assert.equal(ACTIVE_STATUSES.has("trialing"), true);
  assert.equal(ACTIVE_STATUSES.has("active"), true);
});

test("trial_will_end sends a mail with the end date", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", name: "Ana", plan: "boletin", stripe_subscription_id: "sub_test", stripe_customer_id: "cus_test_1" }],
    trialCards: []
  });
  const periodEnd = Math.floor(Date.now() / 1000) + 2 * 24 * 3600;
  try {
    const res = response();
    const obj = {
      id: "sub_test",
      customer: "cus_test_1",
      status: "trialing",
      trial_end: periodEnd,
      current_period_end: periodEnd,
      metadata: { user_id: "user_trial_1", plan: "boletin" },
      items: { data: [{ price: { id: "price_1UUZSwPohxxHwL5eJPNVQba1", recurring: { interval: "month" } }, current_period_end: periodEnd }] }
    };
    await webhookHandler(webhookReq("customer.subscription.trial_will_end", obj), res);
    assert.equal(res.statusCode, 200);
    assert.equal(mock.emails.length, 1);
    const mail = mock.emails[0];
    assert.equal(mail.subject, "Tu prueba del plan Boletín termina pronto");
    const expectedDate = new Date(periodEnd * 1000).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
    assert.ok(mail.text.includes(expectedDate), `mail text should contain ${expectedDate}`);
    assert.ok(mail.html.includes(expectedDate));
    const msg = trialEndingEmail("Ana", expectedDate, "month");
    assert.equal(mail.text, msg.text);
  } finally {
    restore();
  }
});

test("account page shows the free trial notice with the amount", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../cuenta.html", import.meta.url), "utf8");
  assert.match(html, /Estás en prueba gratuita hasta el/);
  assert.match(html, /Después se cobrará/);
  assert.match(html, /Puedes cancelar antes\./);
});

test("cuenta muestra US$ 15 al año para la prueba anual", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../cuenta.html", import.meta.url), "utf8");
  assert.match(html, /trialInterval === "year"/);
  assert.match(html, /US\$ 15 al año/);
});

test("precios y boletin muestran la divulgación de la prueba; Pro no promete prueba", async () => {
  const fs = await import("node:fs");
  const precios = fs.readFileSync(new URL("../precios.html", import.meta.url), "utf8");
  const boletin = fs.readFileSync(new URL("../boletin.html", import.meta.url), "utf8");
  const terms = fs.readFileSync(new URL("../terms.html", import.meta.url), "utf8");
  const disclosure = /Se pide tarjeta\. Si no cancelas antes del día 8, se cobra US\$ 1\.99 al mes \(o US\$ 15 al año\)\./;
  assert.match(precios, disclosure);
  assert.match(precios, /Probar 7 días gratis/);
  assert.match(boletin, disclosure);
  assert.match(boletin, /Prueba de 7 días gratis/);
  assert.match(terms, /Prueba gratuita del plan Boletín/);
  assert.match(terms, /una sola vez por cuenta y por tarjeta/);
  assert.match(terms, /3 días antes/);
  assert.match(terms, /9 de noviembre de 2026/);
  // La tarjeta Pro no promete prueba: solo la copia del plan Boletín la lleva.
  const proCard = precios.slice(precios.indexOf('<h2 class="pd-plan-name">Pro</h2>'));
  assert.doesNotMatch(proCard.slice(0, proCard.indexOf("</article>")), /Probar 7 días|prueba gratuita|Prueba de 7 días/);
});

test("publicUser expone trialInterval para la prueba del Boletín", async () => {
  const users = await import("../api/_lib/users.js");
  const base = {
    id: "u1",
    email: "trial@example.com",
    name: "Ana",
    plan: "boletin",
    subscription_status: "trialing",
    current_period_end: "2026-11-16T00:00:00.000Z",
    cancel_at_period_end: false,
    stripe_customer_id: "cus_x",
    trial_hasta: "2026-11-16T00:00:00.000Z"
  };
  assert.equal(users.publicUser({ ...base, trial_interval: "year" }).trialInterval, "year");
  assert.equal(users.publicUser({ ...base, trial_interval: "month" }).trialInterval, "month");
  assert.equal(users.publicUser({ ...base, trial_interval: undefined }).trialInterval, "month");
  assert.equal(users.publicUser({ ...base, subscription_status: "active" }).trialInterval, null);
});

test("migration 0014 is idempotent and registers the trial tables", async () => {
  const fs = await import("node:fs");
  const sql = fs.readFileSync(new URL("../supabase/migrations/0014_prueba_7_dias.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.users add column if not exists trial_usado/);
  assert.match(sql, /create table if not exists public\.trial_tarjetas/);
  assert.match(sql, /enable row level security/);
});

test("ops doc explains the manual steps", async () => {
  const fs = await import("node:fs");
  const doc = fs.readFileSync(new URL("../docs/PRUEBA_7_DIAS.md", import.meta.url), "utf8");
  assert.match(doc, /0014/);
  assert.match(doc, /trial_will_end/);
});

test("webhook trialing annual: stores trial_interval in a separate update after the main one", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null, stripe_customer_id: "cus_test_1" }],
    trialCards: [],
    subscriptionInterval: "year"
  });
  try {
    const sub = trialingSub("user_trial_1");
    sub.items.data[0].price.recurring.interval = "year";
    const res = response();
    await webhookHandler(webhookReq("customer.subscription.created", sub), res);
    assert.equal(res.statusCode, 200);
    const mainIdx = mock.patches.findIndex((p) => "plan" in p);
    const intervalIdx = mock.patches.findIndex((p) => "trial_interval" in p);
    assert.ok(mainIdx >= 0 && intervalIdx > mainIdx, "trial_interval must go in its own update after the main one");
    assert.equal("trial_interval" in mock.patches[mainIdx], false);
    assert.equal(mock.patches[intervalIdx].trial_interval, "year");
    assert.equal(mock.usersById.get("user_trial_1").subscription_status, "trialing");
  } finally {
    restore();
  }
});

test("webhook: if trial_interval update fails (migration 0015 not applied), plan and status are still saved", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null, stripe_customer_id: "cus_test_1" }],
    trialCards: [],
    trialIntervalMissing: true
  });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const res = response();
    await webhookHandler(webhookReq("customer.subscription.created", trialingSub("user_trial_1")), res);
    assert.equal(res.statusCode, 200);
    const updated = mock.usersById.get("user_trial_1");
    assert.equal(updated.subscription_status, "trialing");
    assert.equal(updated.trial_usado, true);
    assert.equal(updated.plan, "boletin");
    assert.equal(updated.trial_interval, undefined);
    assert.ok(errors.some((e) => e.includes("trial_interval update failed")));
  } finally {
    console.error = originalError;
    restore();
  }
});

test("users: reads still work when trial_interval column is missing", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "boletin", subscription_status: "trialing", trial_hasta: "2026-11-16T00:00:00.000Z", stripe_customer_id: "cus_x" }],
    trialCards: [],
    trialIntervalMissing: true
  });
  try {
    const users = await import("../api/_lib/users.js");
    const user = await users.findUserById("user_trial_1");
    assert.ok(user, "user must be found even without trial_interval");
    assert.equal(user.email, "trial@example.com");
    assert.equal(users.publicUser(user).trialInterval, "month");
  } finally {
    restore();
  }
});

test("migration 0015 adds trial_interval idempotently", async () => {
  const fs = await import("node:fs");
  const sql = fs.readFileSync(new URL("../supabase/migrations/0015_trial_interval.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.users add column if not exists trial_interval text;/);
});

test("webhook: un evento viejo de suscripción no pisa el estado actual (se relee de Stripe)", async () => {
  const mock = installMock({
    users: [{ id: "user_trial_1", email: "trial@example.com", plan: "free", stripe_subscription_id: null, stripe_customer_id: "cus_test_1" }],
    trialCards: []
  });
  try {
    // El aviso llega con un estado viejo («canceled»), pero en Stripe la suscripción sigue en prueba
    const viejo = { ...trialingSub("user_trial_1"), status: "canceled" };
    const res = response();
    await webhookHandler(webhookReq("customer.subscription.updated", viejo), res);
    assert.equal(res.statusCode, 200);
    assert.ok(mock.stripeCalls.some((c) => c.method === "GET" && c.path.startsWith("/v1/subscriptions/sub_test")), "relee la suscripción en Stripe");
    assert.equal(mock.usersById.get("user_trial_1").subscription_status, "trialing");
    assert.notEqual(mock.usersById.get("user_trial_1").plan, "free");
  } finally {
    restore();
  }
});
