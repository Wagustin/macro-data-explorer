import searchHandler from "./api/search.js";
import historicalHandler from "./api/historical.js";
import forecastHandler from "./api/forecast.js";
import interpretHandler from "./api/interpret.js";
import newsHandler from "./api/news.js";
import authHandler from "./api/auth.js";
import billingHandler from "./api/billing.js";
import stripeWebhookHandler from "./api/stripe-webhook.js";
import statusHandler from "./api/status.js";
import boletinHandler from "./api/boletin.js";
import syncHandler from "./api/sync.js";

// Clean URL route map for static subpages
const CLEAN_PAGES = {
  "/": "index.html",
  "/explorer": "explorer.html",
  "/metodologia": "metodologia.html",
  "/aprende": "aprende.html",
  "/guia": "guia.html",
  "/terms": "terms.html",
  "/noticias": "news.html",
  "/news": "news.html",
  "/precios": "precios.html",
  "/cuenta": "cuenta.html",
  "/restablecer": "restablecer.html",
  "/privacidad": "privacidad.html",
  "/boletin": "boletin.html",
  "/empresas": "empresas.html"
};

function adaptNodeHandler(handler) {
  return async function(request, env, ctx) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
      if (env.PERDATA_KV) {
        globalThis.PERDATA_KV = env.PERDATA_KV;
        globalThis.__PERDATA_KV__ = env.PERDATA_KV;
      }
      if (env.PERDATA_DB) globalThis.PERDATA_DB = env.PERDATA_DB;
    }

    const url = new URL(request.url);

    const req = {
      url: url.pathname + url.search,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      query: Object.fromEntries(url.searchParams.entries()),
      rawBody: "",
      body: null
    };

    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const raw = await request.text();
      req.rawBody = raw;
      if (raw) {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            req.body = JSON.parse(raw);
          } catch {
            req.body = raw;
          }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          req.body = Object.fromEntries(new URLSearchParams(raw).entries());
        } else {
          try {
            req.body = JSON.parse(raw);
          } catch {
            req.body = raw;
          }
        }
      } else {
        req.body = {};
      }
    }

    const startCpu = performance.now();

    return new Promise(async (resolve) => {
      let statusCode = 200;
      const headers = new Headers();
      let finished = false;

      function finalize() {
        // Handlers may set res.statusCode directly (e.g. 303 redirects) instead of calling status()
        statusCode = res.statusCode || statusCode;
        const dur = (performance.now() - startCpu).toFixed(3);
        headers.set("Server-Timing", `edge;dur=${dur}`);
        headers.set("X-Edge-Duration", `${dur}ms`);
      }

      const res = {
        statusCode: 200,
        status(code) {
          statusCode = code;
          res.statusCode = code;
          return res;
        },
        setHeader(name, value) {
          headers.set(name, value);
          return res;
        },
        getHeader(name) {
          return headers.get(name);
        },
        json(data) {
          if (finished) return;
          finished = true;
          finalize();
          headers.set("content-type", "application/json; charset=utf-8");
          resolve(new Response(JSON.stringify(data), { status: statusCode, headers }));
        },
        send(data) {
          if (finished) return;
          finished = true;
          finalize();
          if (typeof data === "object" && !(data instanceof Uint8Array)) {
            headers.set("content-type", "application/json; charset=utf-8");
            resolve(new Response(JSON.stringify(data), { status: statusCode, headers }));
          } else {
            resolve(new Response(data, { status: statusCode, headers }));
          }
        },
        end(data) {
          if (finished) return;
          finished = true;
          finalize();
          resolve(new Response(data || null, { status: statusCode, headers }));
        }
      };

      try {
        await handler(req, res);
      } catch (err) {
        console.error("Handler error:", err);
        if (!finished) {
          finished = true;
          finalize();
          resolve(new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" }
          }));
        }
      }
    });
  };
}

const routes = {
  "/api/search": adaptNodeHandler(searchHandler),
  "/api/historical": adaptNodeHandler(historicalHandler),
  "/api/forecast": adaptNodeHandler(forecastHandler),
  "/api/interpret": adaptNodeHandler(interpretHandler),
  "/api/news": adaptNodeHandler(newsHandler),
  "/api/billing": adaptNodeHandler(billingHandler),
  "/api/stripe-webhook": adaptNodeHandler(stripeWebhookHandler),
  "/api/status": adaptNodeHandler(statusHandler),
  "/api/boletin": adaptNodeHandler(boletinHandler),
  "/api/internal/sync": adaptNodeHandler(syncHandler)
};

const adaptedAuth = adaptNodeHandler(authHandler);

// Security headers on every response (Vercel set them in vercel.json)
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
};

export default {
  async fetch(request, env, ctx) {
    const response = await this.route(request, env, ctx);
    const r = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
    return r;
  },

  async route(request, env, ctx) {
    // One canonical address for search engines: https and no www (permanent redirects)
    const incoming = new URL(request.url);
    if (incoming.hostname === "www.perdata.site" || (incoming.protocol === "http:" && incoming.hostname === "perdata.site")) {
      incoming.protocol = "https:";
      incoming.hostname = "perdata.site";
      return Response.redirect(incoming.toString(), 301);
    }

    if (env && typeof env === "object") {
      Object.assign(process.env, env);
      if (env.PERDATA_KV) {
        globalThis.PERDATA_KV = env.PERDATA_KV;
        globalThis.__PERDATA_KV__ = env.PERDATA_KV;
      }
      if (env.PERDATA_DB) globalThis.PERDATA_DB = env.PERDATA_DB;
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. API routes
    if (routes[pathname]) {
      return routes[pathname](request, env, ctx);
    }
    if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
      return adaptedAuth(request, env, ctx);
    }

    // Ficha de empresa: one page that reads the ticker from the URL. The Worker writes the company's
    // title, description and canonical into the HTML so search engines don't depend on JavaScript,
    // and answers 404 for tickers that don't exist.
    const fichaMatch = /^\/empresa\/([^/]+)\/?$/.exec(pathname);
    if (fichaMatch) {
      const nemo = decodeURIComponent(fichaMatch[1]).toUpperCase();
      const page = await env.ASSETS.fetch(new Request(new URL("/empresa", request.url).toString(), request));
      const issuer = await findIssuer(env, request, nemo);
      if (!issuer) {
        const nf = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url).toString(), request));
        return new Response(nf.body, { status: 404, headers: nf.headers });
      }
      const name = prettyName(issuer.razonSocial);
      const title = `${name} (${nemo}): precio, proyección y hechos de importancia · PerData`;
      const kind = SECTOR_PHRASE[String(issuer.sector || "").toUpperCase()] || "empresa";
      const desc = `${name}, ${kind} que cotiza en la Bolsa de Valores de Lima: último precio, gráfico, proyección de PerData Engine y hechos de importancia de la SMV.`;
      const url = `https://perdata.site/empresa/${encodeURIComponent(nemo)}`;
      return new HTMLRewriter()
        .on("title", { element(e) { e.setInnerContent(title); } })
        .on('meta[name="description"]', { element(e) { e.setAttribute("content", desc); } })
        .on("head", { element(e) {
          e.append(`<link rel="canonical" href="${url}" />` +
            `<meta property="og:title" content="${escapeAttr(title)}" />` +
            `<meta property="og:description" content="${escapeAttr(desc)}" />` +
            `<meta property="og:url" content="${url}" /><meta property="og:type" content="website" />` +
            `<meta property="og:image" content="https://perdata.site/og-image.png" />`, { html: true });
        } })
        .transform(page);
    }

    // 2. Delegate to Static Assets (handles clean URLs, trailing slashes, etc.)
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404) {
      const notFoundUrl = new URL("/404.html", request.url);
      const notFoundReq = new Request(notFoundUrl.toString(), request);
      const notFoundRes = await env.ASSETS.fetch(notFoundReq);
      if (notFoundRes.status === 200) {
        return new Response(notFoundRes.body, {
          status: 404,
          headers: notFoundRes.headers
        });
      }
    }

    return assetResponse;
  },

  // Every 30 minutes (wrangler.jsonc). GitHub's free scheduler delays or skips jobs, so the Worker
  // starts the GitHub Actions workflows that are due and haven't run. Needs the GH_DISPATCH_TOKEN
  // secret (fine-grained token, Actions read and write on this repository); without it, does nothing.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchDueWorkflows(env));
  }
};

const REPO = "Wagustin/macro-data-explorer";
// due(now): whether the job should have run by now; minGapMin: don't start it again if it ran this recently
const JOBS = [
  { file: "watchdog.yml", minGapMin: 55, due: () => true },
  { file: "news.yml", minGapMin: 170, due: () => true },
  { file: "smv.yml", minGapMin: 350, due: () => true },
  // Lima closes (SMV) overnight, Tuesday to Saturday UTC, before the daily model run at 11:00 UTC
  { file: "smv-precios.yml", minGapMin: 600, due: (d) => d.getUTCHours() >= 1 && d.getUTCHours() < 10 && d.getUTCDay() >= 2 && d.getUTCDay() <= 6 },
  { file: "timesfm.yml", minGapMin: 1200, due: (d) => d.getUTCHours() >= 11 },
  { file: "official-data.yml", minGapMin: 600, due: (d) => d.getUTCHours() >= 22 && d.getUTCDay() >= 1 && d.getUTCDay() <= 5 },
  // Newsletter: weekdays from 05:50 Lima until noon, only if today's send isn't recorded yet
  { file: "boletin.yml", minGapMin: 25, due: (d) => {
      const lima = new Date(d.getTime() - 5 * 36e5);
      const mins = lima.getUTCHours() * 60 + lima.getUTCMinutes();
      return lima.getUTCDay() >= 1 && lima.getUTCDay() <= 5 && mins >= 350 && mins <= 720;
    }, check: async (d) => {
      const today = new Date(d.getTime() - 5 * 36e5).toISOString().slice(0, 10);
      const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/data/boletin-last.json?t=${d.getTime()}`);
      return !(r.ok && (await r.json()).date === today);
    } },
];

async function dispatchDueWorkflows(env) {
  const token = env && env.GH_DISPATCH_TOKEN;
  if (!token) return;
  const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "perdata-worker", ...(init.headers || {}) },
  });
  const now = new Date();
  for (const job of JOBS) {
    try {
      if (!job.due(now)) continue;
      if (job.check && !(await job.check(now))) continue;
      const runs = await (await gh(`/actions/workflows/${job.file}/runs?per_page=1`)).json();
      const last = runs.workflow_runs && runs.workflow_runs[0];
      const ageMin = last ? (now - Date.parse(last.created_at)) / 60000 : Infinity;
      if (ageMin < job.minGapMin) continue;
      const r = await gh(`/actions/workflows/${job.file}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
      console.log(`[cron] ${job.file}: last run ${Math.round(ageMin)} min ago -> dispatch ${r.status}`);
    } catch (e) {
      console.error(`[cron] ${job.file}: ${e.message}`);
    }
  }
}

// ---- Company pages (SEO) ----
let issuersCache = null;
async function findIssuer(env, request, nemo) {
  if (!issuersCache) {
    const r = await env.ASSETS.fetch(new Request(new URL("/data/empresas.json", request.url).toString()));
    issuersCache = r.ok ? ((await r.json()).emisores || []) : [];
  }
  return issuersCache.find((e) => (e.valores || []).some((v) => v.nemonico === nemo)) || null;
}

const SECTOR_PHRASE = {
  "MINERAS": "empresa minera", "BANCOS Y FINANCIERAS": "entidad financiera", "INDUSTRIALES": "empresa industrial",
  "SERVICIOS PÚBLICOS": "empresa de servicios públicos", "SEGUROS": "aseguradora", "AGRARIO": "empresa agraria",
  "ADMINISTRADORAS DE FONDOS DE PENSIONES": "administradora de fondos de pensiones", "DIVERSAS": "empresa"
};
const KEEP_UPPER = new Set(["BBVA", "AFP", "BVL", "FTE", "IDE", "SEAL", "AIB", "XP", "OH!"]);
const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
function prettyName(raw) {
  return String(raw || "").trim().split(/\s+/).map((w, i) => {
    if (KEEP_UPPER.has(w.toUpperCase()) || /^\(?([A-Za-z]\.){2,}[-)]*$/.test(w)) return w.toUpperCase();
    const lw = w.toLowerCase();
    return i > 0 && SMALL_WORDS.has(lw) ? lw : lw.replace(/(^|[-("])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }).join(" ");
}
function escapeAttr(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
