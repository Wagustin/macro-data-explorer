import test from "node:test";
import assert from "node:assert/strict";
import worker, { shouldNoindex, isIndexableBody } from "../worker.js";

// Mock HTMLRewriter if not present in Node
if (typeof globalThis.HTMLRewriter === "undefined") {
  globalThis.HTMLRewriter = class {
    on() { return this; }
    transform(response) { return response; }
  };
}

test("shouldNoindex identifies noindex routes and their variants", () => {
  const noindexPaths = [
    "/estado", "/estado/", "/estado.html",
    "/resumenes", "/resumenes/", "/resumen.html", "/resumen", "/resumen/",
    "/noticias", "/noticias/", "/noticias.html",
    "/news", "/news/", "/news.html",
    "/entrar", "/entrar/", "/entrar.html",
    "/cuenta", "/cuenta/", "/cuenta.html",
    "/restablecer", "/restablecer/", "/restablecer.html",
    "/empresa", "/empresa/", "/empresa.html",
    "/404", "/404/", "/404.html"
  ];

  for (const p of noindexPaths) {
    assert.equal(shouldNoindex(p), true, `Expected ${p} to be noindex`);
  }
});

test("shouldNoindex leaves indexable routes indexable", () => {
  const indexablePaths = [
    "/",
    "/dolar", "/dolar.html",
    "/explorer", "/explorer.html",
    "/empresas", "/empresas.html",
    "/aprende", "/aprende.html",
    "/metodologia", "/metodologia.html",
    "/guia", "/guia.html",
    "/precios", "/precios.html",
    "/boletin", "/boletin.html",
    "/nosotros", "/nosotros.html",
    "/politica-editorial", "/politica-editorial.html",
    "/privacidad", "/privacidad.html",
    "/terms", "/terms.html",
    "/mercado", "/mercado.html",
    "/contacto", "/contacto.html",
    "/empresa/ALICORC1"
  ];

  for (const p of indexablePaths) {
    assert.equal(shouldNoindex(p), false, `Expected ${p} NOT to be in shouldNoindex`);
  }
});

test("isIndexableBody accurately detects data-indexable=\"1\" on <body>", () => {
  assert.equal(isIndexableBody('<body class="bg-paper" data-indexable="1">'), true);
  assert.equal(isIndexableBody('<body data-indexable="1">'), true);
  assert.equal(isIndexableBody("<body data-indexable='1'>"), true);
  assert.equal(isIndexableBody('<body\n  class="bg-paper"\n  data-indexable="1"\n>'), true);

  // Non-indexable cases
  assert.equal(isIndexableBody('<body class="bg-paper text-ink">'), false);
  assert.equal(isIndexableBody('<body data-indexable="0">'), false);
  assert.equal(isIndexableBody('<div data-indexable="1"><body></body></div>'), false);
  assert.equal(isIndexableBody(''), false);
});

test("worker.fetch sets X-Robots-Tag: noindex, follow on noindex routes and 404s", async () => {
  function createMockEnv(customHtml = null) {
    return {
      ASSETS: {
        async fetch(req) {
          const u = new URL(req.url);
          if (u.pathname === "/404.html") {
            return new Response("<html><body>404 Not Found</body></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" }
            });
          }
          if (u.pathname === "/empresa" || u.pathname.startsWith("/empresa/")) {
            const body = customHtml || '<html><body class="bg-paper"><h1>Ficha</h1></body></html>';
            return new Response(body, {
              status: 200,
              headers: { "Content-Type": "text/html" }
            });
          }
          if (u.pathname === "/data/empresas.json") {
            return new Response(JSON.stringify({
              emisores: [
                {
                  razonSocial: "ALICORP S.A.A.",
                  sector: "INDUSTRIALES",
                  valores: [{ nemonico: "ALICORC1" }]
                }
              ]
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          if (u.pathname === "/data/resumenes/index.json") {
            return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          if (u.pathname === "/resumen.html") {
            return new Response("<html><body>Resumenes</body></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" }
            });
          }
          if (["/estado", "/noticias", "/news", "/entrar", "/cuenta", "/restablecer"].includes(u.pathname)) {
            return new Response("<html><body>Page content</body></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" }
            });
          }
          if (["/", "/empresas", "/aprende"].includes(u.pathname)) {
            return new Response("<html><body>Rich content</body></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" }
            });
          }
          return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
        }
      }
    };
  }

  const mockCtx = { waitUntil() {} };

  // 1. /estado should have noindex, follow
  {
    const req = new Request("https://perdata.site/estado");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 2. /resumenes should have noindex, follow
  {
    const req = new Request("https://perdata.site/resumenes");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 3. /noticias should have noindex, follow
  {
    const req = new Request("https://perdata.site/noticias");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 4. /news should have noindex, follow
  {
    const req = new Request("https://perdata.site/news");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 5. /entrar should have noindex, follow
  {
    const req = new Request("https://perdata.site/entrar");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 6. /cuenta should have noindex, follow
  {
    const req = new Request("https://perdata.site/cuenta");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 7. /restablecer should have noindex, follow
  {
    const req = new Request("https://perdata.site/restablecer");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 8. 404 should have noindex, follow
  {
    const req = new Request("https://perdata.site/non-existent-page-12345");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 9. /empresa/ALICORC1 without data-indexable="1" MUST have noindex, follow
  {
    const req = new Request("https://perdata.site/empresa/ALICORC1");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, follow");
  }

  // 10. /empresa/ALICORC1 WITH data-indexable="1" MUST NOT have noindex, follow
  {
    const richHtml = '<html><body class="bg-paper" data-indexable="1"><h1>Ficha Rica</h1></body></html>';
    const req = new Request("https://perdata.site/empresa/ALICORC1");
    const res = await worker.fetch(req, createMockEnv(richHtml), mockCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Robots-Tag"), null);
  }

  // 11. Indexable pages like /, /empresas, /aprende MUST NOT have noindex, follow
  {
    const req = new Request("https://perdata.site/");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Robots-Tag"), null);
  }
  {
    const req = new Request("https://perdata.site/empresas");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Robots-Tag"), null);
  }
  {
    const req = new Request("https://perdata.site/aprende");
    const res = await worker.fetch(req, createMockEnv(), mockCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Robots-Tag"), null);
  }
});
