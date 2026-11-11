import searchHandler from "./api/search.js";
import historicalHandler from "./api/historical.js";
import forecastHandler from "./api/forecast.js";
import interpretHandler from "./api/interpret.js";
import newsHandler from "./api/news.js";
import diarioHandler, { getDailyDollarSummary } from "./api/diario.js";
import authHandler from "./api/auth.js";
import billingHandler from "./api/billing.js";
import stripeWebhookHandler from "./api/stripe-webhook.js";
import statusHandler from "./api/status.js";
import boletinHandler from "./api/boletin.js";
import syncHandler from "./api/sync.js";
import mercadoHandler from "./api/mercado.js";
import seguimientoHandler from "./api/seguimiento.js";
import { runBackup } from "./api/_lib/backup.js";
import { ensureSchema } from "./api/_lib/d1.js";

// Clean URL route map for static subpages
const CLEAN_PAGES = {
  "/": "index.html",
  "/dolar": "dolar.html",
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
  "/terminos": "terms.html",
  "/cookies": "privacidad.html",
  "/nosotros": "nosotros.html",
  "/politica-editorial": "politica-editorial.html",
  "/contacto": "contacto.html",
  "/boletin": "boletin.html",
  "/empresas": "empresas.html",
  "/mercado": "mercado.html",
  "/estado": "estado.html",
  "/resumenes": "resumen.html",
  "/entrar": "entrar.html"
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
      if (env.BACKUPS) globalThis.PERDATA_BACKUPS = env.BACKUPS;
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

    return new Promise(async (resolve) => {
      let statusCode = 200;
      const headers = new Headers();
      let finished = false;

      function finalize() {
        // Handlers may set res.statusCode directly (e.g. 303 redirects) instead of calling status()
        statusCode = res.statusCode || statusCode;
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
  "/api/diario": adaptNodeHandler(diarioHandler),
  "/api/billing": adaptNodeHandler(billingHandler),
  "/api/stripe-webhook": adaptNodeHandler(stripeWebhookHandler),
  "/api/status": adaptNodeHandler(statusHandler),
  "/api/boletin": adaptNodeHandler(boletinHandler),
  "/api/mercado": adaptNodeHandler(mercadoHandler),
  "/api/seguimiento": adaptNodeHandler(seguimientoHandler),
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
  "Content-Security-Policy": "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
};

const NOINDEX_ROUTES = new Set([
  "/estado",
  "/resumenes",
  "/resumen",
  "/noticias",
  "/news",
  "/entrar",
  "/cuenta",
  "/restablecer",
  "/empresa",
  "/404"
]);

function shouldNoindex(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (NOINDEX_ROUTES.has(clean)) return true;
  // Daily AI summaries are for readers, not for search engines
  if (clean.startsWith("/resumen/")) return true;
  if (clean.endsWith(".html")) {
    const withoutHtml = clean.slice(0, -5);
    if (NOINDEX_ROUTES.has(withoutHtml)) return true;
  }
  return false;
}

function isIndexableBody(html) {
  return /<body[^>]*\bdata-indexable=["']?1["']?/i.test(html);
}

const API_CACHE_TTLS = new Map([
  ["/api/historical", 300],
  ["/api/forecast", 1800],
  ["/api/diario", 1800],
  ["/api/news", 180],
  ["/api/mercado", 600]
]);


const EEA_COUNTRIES = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA-EFTA
  "IS", "LI", "NO",
  // UK & Switzerland
  "GB", "CH"
]);

// Per-response CSP nonce: every <script> in our HTML gets it, and 'strict-dynamic' then trusts the
// scripts they load (Google sign-in, AdSense, Stripe). Enforced since 29-oct-2026, when no page reported violations.
function withScriptNonce(response, geo = "otro", isHome = false, dailyData = null) {
  if (response.status === 304 || !(response.headers.get("Content-Type") || "").includes("text/html")) return response;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...bytes));
  const headers = new Headers(response.headers);
  // A page is valid only with its own nonce: a 304 would pair the cached HTML with a new policy and
  // block every script, so HTML is never revalidated
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.set("Cache-Control", "private, no-cache");
  // Built here, not taken from _headers: two matching _headers rules arrived as one comma-joined
  // value, and the browser enforced the stale second policy
  headers.delete("Content-Security-Policy-Report-Only");
  headers.set("Content-Security-Policy", [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; "));
  const rewritten = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  let hasGeo = false;
  let rewriter = new HTMLRewriter()
    .on("script", { element(e) { e.setAttribute("nonce", nonce); } })
    .on('meta[name="pd-geo"]', {
      element(e) {
        e.setAttribute("content", geo);
        hasGeo = true;
      }
    })
    .on("head", {
      element(e) {
        if (!hasGeo) {
          e.append(`<meta name="pd-geo" content="${geo}">`, { html: true });
        }
      }
    });

  if (isHome && dailyData && dailyData.vigente && dailyData.manana) {
    const fmt = (v, dec) => (typeof v === "number" && !isNaN(v))
      ? v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : "—";
    const p10Str = fmt(dailyData.manana.p10, 3);
    const p50Str = fmt(dailyData.manana.p50, 3);
    const p90Str = fmt(dailyData.manana.p90, 3);
    const semP10Str = dailyData.semana ? fmt(dailyData.semana.p10, 3) : "";
    const semP90Str = dailyData.semana ? fmt(dailyData.semana.p90, 3) : "";
    const cierreStr = fmt(dailyData.ultimo_cierre, 3);

    rewriter = rewriter
      .on("#pdHeroQuestion", {
        element(e) {
          if (dailyData.pregunta) e.setInnerContent(dailyData.pregunta);
        }
      })
      .on(".pd-hero-answer", {
        element(e) {
          e.setInnerContent(
            `Entre <span class="pd-num font-mono tnum">S/&nbsp;${p10Str}</span> y <span class="pd-num font-mono tnum">S/&nbsp;${p90Str}</span> (8 de cada 10 veces). Valor central: <span class="pd-num font-mono tnum">S/&nbsp;${p50Str}</span>.`,
            { html: true }
          );
        }
      })
      .on("#pdCardDaily", {
        element(e) {
          const cls = (e.getAttribute("class") || "").replace(/\bhidden\b/g, "").trim();
          if (cls) e.setAttribute("class", cls);
          else e.removeAttribute("class");
        }
      })
      .on("#pdCardMonthly", {
        element(e) {
          const cls = (e.getAttribute("class") || "").trim();
          if (!/\bhidden\b/.test(cls)) {
            e.setAttribute("class", cls ? `${cls} hidden` : "hidden");
          }
        }
      })
      .on("#pdCardHorizon", {
        element(e) {
          e.setInnerContent("Horizonte: diario");
        }
      })
      .on("#pdCardHoyFecha", {
        element(e) {
          if (dailyData.etiqueta_cierre) e.setInnerContent(dailyData.etiqueta_cierre);
        }
      })
      .on("#pdCardHoyCierre", {
        element(e) {
          e.setInnerContent(cierreStr);
        }
      })
      .on("#pdCardDailyLabel", {
        element(e) {
          if (dailyData.etiqueta) e.setInnerContent(dailyData.etiqueta.toUpperCase());
        }
      })
      .on("#pdCardDailyP10", {
        element(e) {
          e.setInnerContent(p10Str);
        }
      })
      .on("#pdCardDailyP90", {
        element(e) {
          e.setInnerContent(p90Str);
        }
      })
      .on("#pdCardMananaP10", {
        element(e) {
          e.setInnerContent(p10Str);
        }
      })
      .on("#pdCardMananaP50", {
        element(e) {
          e.setInnerContent(p50Str);
        }
      })
      .on("#pdCardMananaP90", {
        element(e) {
          e.setInnerContent(p90Str);
        }
      });

    if (dailyData.semana) {
      rewriter = rewriter
        .on("#pdCardSemanaFecha", {
          element(e) {
            if (dailyData.etiqueta_semana) e.setInnerContent(dailyData.etiqueta_semana);
          }
        })
        .on("#pdCardSemanaP10", {
          element(e) {
            e.setInnerContent(semP10Str);
          }
        })
        .on("#pdCardSemanaP90", {
          element(e) {
            e.setInnerContent(semP90Str);
          }
        });
    }
  }

  return rewriter.transform(rewritten);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const country = request.cf?.country || request.headers.get("cf-ipcountry") || "";
    const geoQuery = url.searchParams.get("geo");
    const isEea = geoQuery ? geoQuery.toLowerCase() === "eea" : EEA_COUNTRIES.has(country.toUpperCase());
    const geo = isEea ? "eea" : "otro";

    const ttl = API_CACHE_TTLS.get(url.pathname);
    const canCache = ttl && request.method === "GET" && !request.headers.has("Authorization") && globalThis.caches?.default;
    if (canCache) {
      const cache = globalThis.caches.default;
      let cached = null;
      try { cached = await cache.match(request); } catch { /* Cache API is an optimization only. */ }
      if (cached) {
        const r = new Response(cached.body, cached);
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
        return r;
      }
      const response = await this.route(request, env, ctx);
      const cacheControl = response.headers.get("Cache-Control") || "";
      if (response.ok && /(?:^|,)\s*public\b/i.test(cacheControl) && !/no-store|private/i.test(cacheControl)) {
        const cacheHeaders = new Headers(response.headers);
        cacheHeaders.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}`);
        const cacheResponse = new Response(response.clone().body, { status: response.status, headers: cacheHeaders });
        ctx.waitUntil(cache.put(request, cacheResponse).catch(() => {}));
      }
      const r = new Response(response.body, response);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
      if (r.status === 404 || shouldNoindex(url.pathname)) {
        r.headers.set("X-Robots-Tag", "noindex, follow");
      }
      return r;
    }
    const fresh = new Headers(request.headers);
    fresh.delete("If-None-Match");
    fresh.delete("If-Modified-Since");
    const isHome = (url.pathname === "/" || url.pathname === "/index.html");
    let dailyData = null;
    if (isHome) {
      try {
        dailyData = await getDailyDollarSummary();
      } catch {
        dailyData = null;
      }
    }
    const response = withScriptNonce(await this.route(new Request(request, { headers: fresh }), env, ctx), geo, isHome, dailyData);
    const r = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
    if (r.status === 404 || shouldNoindex(url.pathname)) {
      r.headers.set("X-Robots-Tag", "noindex, follow");
    }
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
      if (env.BACKUPS) globalThis.PERDATA_BACKUPS = env.BACKUPS;
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
      let page = await env.ASSETS.fetch(new Request(new URL(`/empresa/${encodeURIComponent(nemo)}`, request.url).toString(), request));
      if (!page.ok) {
        page = await env.ASSETS.fetch(new Request(new URL("/empresa", request.url).toString(), request));
      }
      if (!page.ok) {
        page = await env.ASSETS.fetch(new Request(new URL("/empresa.html", request.url).toString(), request));
      }
      const issuer = await findIssuer(env, request, nemo);
      if (!issuer || !page.ok) {
        return notFound(env, request);
      }
      const html = await page.text();
      const isIndexable = isIndexableBody(html);
      const name = prettyName(issuer.razonSocial);
      const title = `${name} (${nemo}): precio, proyección y hechos de importancia · PerData`;
      const desc = buildDesc(name, nemo);
      const url = `https://perdata.site/empresa/${encodeURIComponent(nemo)}`;
      const structuredData = [
        {
          "@context": "https://schema.org",
          "@type": "Corporation",
          name,
          tickerSymbol: nemo,
          exchange: "BVL",
          industry: issuer.sector || "",
          url
        },
        // Indexable fichas already ship their BreadcrumbList from the generator; only inject one here otherwise
        ...(html.includes('"BreadcrumbList"') ? [] : [
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Inicio", item: "https://perdata.site/" },
              { "@type": "ListItem", position: 2, name: "Empresas", item: "https://perdata.site/empresas" },
              { "@type": "ListItem", position: 3, name, item: url }
            ]
          }
        ])
      ].map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`).join("");
      const transformed = new HTMLRewriter()
        .on("title", { element(e) { e.setInnerContent(title); } })
        .on('meta[name="description"]', { element(e) { e.setAttribute("content", desc); } })
        .on("head", { element(e) {
          e.append(`<link rel="canonical" href="${url}" />` +
            `<meta property="og:title" content="${escapeAttr(title)}" />` +
            `<meta property="og:description" content="${escapeAttr(desc)}" />` +
            `<meta property="og:url" content="${url}" /><meta property="og:type" content="website" />` +
            `<meta property="og:image" content="https://perdata.site/og-image.png" />` + structuredData, { html: true });
        } })
        .transform(new Response(html, { status: page.status, statusText: page.statusText, headers: page.headers }));
      const headers = new Headers(transformed.headers);
      headers.set("Cache-Control", "no-cache");
      if (!isIndexable) {
        headers.set("X-Robots-Tag", "noindex, follow");
      }
      return new Response(transformed.body, { status: transformed.status, statusText: transformed.statusText, headers });
    }

    // Notas semanales del dolar: un directorio por semana (semana/AAAA-MM-DD/index.html) y el
    // indice semanal (semana/index.html). Las rutas limpias las resuelve el Worker porque los
    // archivos viven en un subdirectorio.
    const semanaMatch = /^\/semana\/(\d{4}-\d{2}-\d{2})\/?$/.exec(pathname);
    if (pathname === "/semana" || pathname === "/semana/" || semanaMatch) {
      // Assets use drop-trailing-slash: a folder index is served at the path without «/» or «index.html»
      const destino = semanaMatch ? `/semana/${semanaMatch[1]}` : "/semana";
      const res = await env.ASSETS.fetch(new Request(new URL(destino, request.url).toString(), request));
      if (!res.ok) return notFound(env, request);
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-cache");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }

    const digestMatch = /^\/resumen\/(\d{4}-\d{2}-\d{2})\/?$/.exec(pathname);
    if (pathname === "/resumenes" || pathname === "/resumenes/") {
      const index = await env.ASSETS.fetch(new Request(new URL("/data/resumenes/index.json", request.url)));
      if (!index.ok) return notFound(env, request);
      const res = await env.ASSETS.fetch(new Request(new URL("/resumen.html", request.url), request));
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-cache");
      headers.set("X-Robots-Tag", "noindex, follow");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    if (digestMatch) {
      const date = digestMatch[1];
      const dataResponse = await env.ASSETS.fetch(new Request(new URL(`/data/resumenes/${date}.json`, request.url)));
      if (!dataResponse.ok) return notFound(env, request);
      let digest;
      try { digest = await dataResponse.json(); } catch { return notFound(env, request); }
      const page = await env.ASSETS.fetch(new Request(new URL("/resumen.html", request.url), request));
      const title = `Resumen del día, ${new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`))}`;
      const article = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: title,
        datePublished: digest.actualizado || `${date}T12:00:00-05:00`,
        inLanguage: "es-PE",
        mainEntityOfPage: `https://perdata.site/resumen/${date}`,
        publisher: { "@type": "Organization", name: "PerData", url: "https://perdata.site/" }
      };
      const structuredData = `<script type="application/ld+json">${JSON.stringify(article).replace(/</g, "\\u003c")}</script>`;
      const transformed = new HTMLRewriter()
        .on("title", { element(e) { e.setInnerContent(`${title} · PerData`); } })
        .on("#pageTitle", { element(e) { e.setInnerContent(title); } })
        .on('meta[name="description"]', { element(e) { e.setAttribute("content", title); } })
        .on("head", { element(e) { e.append(`<link rel="canonical" href="https://perdata.site/resumen/${date}" />${structuredData}`, { html: true }); } })
        .transform(page);
      const headers = new Headers(transformed.headers);
      headers.set("Cache-Control", "no-cache");
      return new Response(transformed.body, { status: transformed.status, statusText: transformed.statusText, headers });
    }

    // 2. Delegate to Static Assets (handles clean URLs, trailing slashes, etc.)
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404) {
      // Alias routes: /terminos -> terms.html, /cookies -> privacidad.html (CLEAN_PAGES).
      // El servidor de assets solo resuelve nombres de archivo (privacidad.html -> /privacidad),
      // asi que las rutas con otro nombre se sirven desde aqui.
      const cleanPath = pathname.replace(/\/+$/, "") || "/";
      const alias = CLEAN_PAGES[cleanPath];
      if (alias && !cleanPath.endsWith(".html")) {
        const aliasRes = await env.ASSETS.fetch(new Request(new URL(`/${alias}`, request.url).toString(), request));
        if (aliasRes.ok) {
          const headers = new Headers(aliasRes.headers);
          headers.set("Cache-Control", "no-cache");
          return new Response(aliasRes.body, { status: aliasRes.status, statusText: aliasRes.statusText, headers });
        }
      }
      const notFoundUrl = new URL("/404.html", request.url);
      const notFoundReq = new Request(notFoundUrl.toString(), request);
      const notFoundRes = await env.ASSETS.fetch(notFoundReq);
      if (notFoundRes.status === 200) {
        const headers = new Headers(notFoundRes.headers);
        headers.set("Cache-Control", "no-cache");
        headers.set("X-Robots-Tag", "noindex, follow");
        return new Response(notFoundRes.body, {
          status: 404,
          headers
        });
      }
      const headers = new Headers(assetResponse.headers);
      headers.set("X-Robots-Tag", "noindex, follow");
      return new Response(assetResponse.body, { status: 404, headers });
    }

    if (assetResponse.ok) {
      const hasVersion = url.searchParams.has("v");
      const isStaticAsset = /\.(?:css|js|woff2?|ttf|otf)$/i.test(pathname);
      if (hasVersion && isStaticAsset) {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers
        });
      }
      const ct = assetResponse.headers.get("content-type") || "";
      if (ct.includes("text/html") || pathname.endsWith(".html") || CLEAN_PAGES[pathname] || pathname === "/") {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "no-cache");
        if (shouldNoindex(pathname)) {
          headers.set("X-Robots-Tag", "noindex, follow");
        }
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers
        });
      }
    }

    return assetResponse;
  },

  // Every 30 minutes (wrangler.jsonc). GitHub's free scheduler delays or skips jobs, so the Worker
  // starts the GitHub Actions workflows that are due and haven't run. Needs the GH_DISPATCH_TOKEN
  // secret (fine-grained token, Actions read and write on this repository); without it, does nothing.
  async scheduled(event, env, ctx) {
    if (env.PERDATA_DB) {
      try { await ensureSchema(env.PERDATA_DB); } catch (error) {
        console.error("D1 schema initialization failed:", error.message);
      }
    }
    ctx.waitUntil(dispatchDueWorkflows(env));
    ctx.waitUntil(runBackup(env));
  }
};

async function notFound(env, request) {
  const response = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request));
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("X-Robots-Tag", "noindex, follow");
  return new Response(response.body, { status: 404, headers });
}

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
  { file: "alertas.yml", minGapMin: 25, due: () => true },
  // Newsletter: weekdays from 05:50 Lima until noon, only if today's send isn't recorded yet
  { file: "boletin.yml", minGapMin: 25, due: (d) => {
      const lima = new Date(d.getTime() - 5 * 36e5);
      const mins = lima.getUTCHours() * 60 + lima.getUTCMinutes();
      return lima.getUTCDay() >= 1 && lima.getUTCDay() <= 6 && mins >= 350 && mins <= 720;
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

// Meta description unica por ficha: cabeza con nombre y nemonico + el primer segmento
// (de mas largo a mas corto) que mantenga la descripcion dentro de 160 caracteres
const DESC_TAILS = [
  " cotiza en la Bolsa de Valores de Lima: último precio, gráfico, proyección de PerData Engine y hechos de importancia de la SMV.",
  " cotiza en la BVL: último precio, gráfico, proyección de PerData Engine y hechos de importancia de la SMV.",
  " en la BVL: último precio, proyección de PerData Engine y hechos de importancia de la SMV.",
  " en la BVL: precio, proyección de PerData Engine y hechos de importancia.",
  " en la BVL: precio, proyección y hechos de importancia.",
];
function buildDesc(name, nemo) {
  const head = `${name} (${nemo})`;
  for (const tail of DESC_TAILS) {
    const desc = head + tail;
    if (desc.length <= 160) return desc;
  }
  return head + DESC_TAILS[DESC_TAILS.length - 1];
}
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

export { shouldNoindex, isIndexableBody, withScriptNonce };

