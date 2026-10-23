import searchHandler from "./api/search.js";
import historicalHandler from "./api/historical.js";
import forecastHandler from "./api/forecast.js";
import interpretHandler from "./api/interpret.js";
import newsHandler, { refreshNewsCache } from "./api/news.js";
import authHandler from "./api/auth.js";
import billingHandler from "./api/billing.js";
import stripeWebhookHandler from "./api/stripe-webhook.js";

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
  "/privacidad": "privacidad.html"
};

function adaptNodeHandler(handler) {
  return async function(request, env, ctx) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
      if (env.PERDATA_KV) {
        globalThis.PERDATA_KV = env.PERDATA_KV;
        globalThis.__PERDATA_KV__ = env.PERDATA_KV;
      }
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
  "/api/stripe-webhook": adaptNodeHandler(stripeWebhookHandler)
};

const adaptedAuth = adaptNodeHandler(authHandler);

export default {
  async fetch(request, env, ctx) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
      if (env.PERDATA_KV) {
        globalThis.PERDATA_KV = env.PERDATA_KV;
        globalThis.__PERDATA_KV__ = env.PERDATA_KV;
      }
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

  async scheduled(event, env, ctx) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
      if (env.PERDATA_KV) {
        globalThis.PERDATA_KV = env.PERDATA_KV;
        globalThis.__PERDATA_KV__ = env.PERDATA_KV;
      }
    }
    console.log("[cron] Running scheduled macro news refresh at", new Date().toISOString());
    ctx.waitUntil(refreshNewsCache());
  }
};
