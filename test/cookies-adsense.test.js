import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const TEST_PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 4389;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("T82 - Cookies y carga condicional de AdSense", () => {
  let serverProcess = null;
  let browser = null;

  before(async () => {
    // Start local server
    serverProcess = spawn("node", ["server.js"], {
      env: { ...process.env, PORT: String(TEST_PORT) },
      stdio: "pipe"
    });

    // Wait for server ready
    const maxAttempts = 30;
    let ready = false;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`${BASE_URL}/`);
        if (res.ok || res.status === 200 || res.status === 304) {
          ready = true;
          break;
        }
      } catch {
        // Wait and retry
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!ready) {
      throw new Error(`Server failed to start on ${BASE_URL}`);
    }

    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverProcess) {
      try {
        serverProcess.kill("SIGTERM");
      } catch {}
    }
  });

  test("Visita / sin elegir: 0 cookies de doubleclick y no se carga AdSense", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requestedUrls = [];
    page.on("request", (req) => requestedUrls.push(req.url()));

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

    // Esperar a que el banner se renderice
    await page.waitForSelector("#pdConsentBanner", { state: "visible", timeout: 5000 });

    // Esperar 2.5s (mayor al timeout de 2s de requestIdleCallback) para verificar que no carga AdSense
    await page.waitForTimeout(2500);

    // 1. Cero cookies de doubleclick / Google
    const cookies = await context.cookies();
    const doubleclickCookies = cookies.filter(
      (c) => c.domain.includes("doubleclick") || c.name === "IDE" || c.name === "__gads" || c.name === "__gpi"
    );
    assert.strictEqual(doubleclickCookies.length, 0, "No debe existir ninguna cookie de doubleclick o AdSense sin eleccion");

    // 2. No se pide pagead2
    const pagead2Requests = requestedUrls.filter((u) => u.includes("pagead2.googlesyndication.com"));
    assert.strictEqual(pagead2Requests.length, 0, "No debe solicitarse pagead2 sin haber realizado una eleccion");

    // 3. No existe el script de adsbygoogle en el DOM
    const hasScript = await page.evaluate(() => !!document.querySelector('script[src*="adsbygoogle.js"]'));
    assert.strictEqual(hasScript, false, "El script de adsbygoogle no debe estar en el DOM sin consentimiento");

    await context.close();
  });

  test("Pulsa «Solo necesarias»: AdSense cargado con NPA (requestNonPersonalizedAds = 1)", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pdConsentBanner", { state: "visible", timeout: 5000 });

    // Pulsar «Solo necesarias»
    await page.click("#pdConsentNecessary");

    // El banner se remueve
    await page.waitForSelector("#pdConsentBanner", { state: "detached", timeout: 5000 });

    // Script de AdSense se inyecta en el DOM
    await page.waitForSelector('script[src*="adsbygoogle.js"]', { state: "attached", timeout: 5000 });

    // Comprobar estado en memoria de window.adsbygoogle
    const adsState = await page.evaluate(() => {
      return {
        hasScript: !!document.querySelector('script[src*="adsbygoogle.js"]'),
        npa: window.adsbygoogle ? window.adsbygoogle.requestNonPersonalizedAds : null
      };
    });

    assert.strictEqual(adsState.hasScript, true, "El script de AdSense debe haberse inyectado");
    assert.strictEqual(adsState.npa, 1, "requestNonPersonalizedAds debe ser 1");

    // Comprobar cookie pd_consent
    const cookies = await context.cookies();
    const consentCookie = cookies.find((c) => c.name === "pd_consent");
    assert(consentCookie, "La cookie pd_consent debe existir tras pulsar Solo necesarias");
    const decodedVal = decodeURIComponent(consentCookie.value);
    assert(decodedVal.includes("ads=0"), `La cookie pd_consent debe tener ads=0, valor actual: ${decodedVal}`);

    await context.close();
  });

  test("Con ?geo=eea nunca se pide pagead2", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requestedUrls = [];
    page.on("request", (req) => requestedUrls.push(req.url()));

    await page.goto(`${BASE_URL}/?geo=eea`, { waitUntil: "domcontentloaded" });

    // Verificar meta pd-geo
    const geoMeta = await page.getAttribute('meta[name="pd-geo"]', "content");
    assert.strictEqual(geoMeta, "eea", "El meta pd-geo debe ser eea");

    // Esperar a que el banner este visible
    await page.waitForSelector("#pdConsentBanner", { state: "visible", timeout: 5000 });

    // Pulsar «Aceptar» o «Solo necesarias»
    await page.click("#pdConsentAccept");
    await page.waitForSelector("#pdConsentBanner", { state: "detached", timeout: 5000 });

    // Esperar 2.5s para asegurar que ningun callback tardio intente cargar AdSense
    await page.waitForTimeout(2500);

    // Comprobar que NUNCA se pidio pagead2 ni nada de googlesyndication
    const pageadRequests = requestedUrls.filter(
      (u) => u.includes("pagead2") || u.includes("googlesyndication.com")
    );
    assert.strictEqual(pageadRequests.length, 0, "Con ?geo=eea NUNCA se debe pedir pagead2");

    // Comprobar que tampoco hay script de adsbygoogle en el DOM
    const hasScript = await page.evaluate(() => !!document.querySelector('script[src*="adsbygoogle.js"]'));
    assert.strictEqual(hasScript, false, "En EEE el script de adsbygoogle no debe inyectarse en el DOM");

    await context.close();
  });
});
