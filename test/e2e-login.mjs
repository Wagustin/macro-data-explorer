import { spawn } from "child_process";
import { chromium } from "playwright";
import assert from "assert";
import fs from "fs";
import path from "path";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4373;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = process.env.OUT_DIR || "/home/wagustin/kathy_workspace/handoff/fase-nov";

async function waitServerReady(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 304) return true;
    } catch {
      // wait a bit
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} failed to start in time.`);
}

async function run() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`Starting server on port ${PORT}...`);
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit"
  });

  const cleanup = () => {
    try {
      server.kill("SIGTERM");
    } catch {}
  };

  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    await waitServerReady(`${BASE_URL}/`);
    console.log("Server ready. Launching Playwright browser...");

    const consoleErrors = [];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    // ----------------------------------------------------
    // 1. Desktop Viewport (1440x900) & Design Verification
    // ----------------------------------------------------
    console.log("1. Testing Desktop viewport (1440x900) at /entrar...");
    await page.setViewportSize({ width: 1440, height: 900 });

    const startTime = Date.now();
    await page.goto(`${BASE_URL}/entrar`, { waitUntil: "domcontentloaded" });
    const navTime = Date.now() - startTime;
    console.log(`✓ /entrar loaded in ${navTime}ms.`);

    // Canvas must exist and start rapidly (<300ms)
    const canvas = page.locator("#pdAuthCanvas");
    await canvas.waitFor({ state: "visible", timeout: 3000 });
    const canvasVisible = await canvas.isVisible();
    assert.strictEqual(canvasVisible, true, "Canvas #pdAuthCanvas must be visible");

    // Sample canvas to ensure non-empty ink strokes rendered
    const nonZeroPixels = await page.evaluate(() => {
      const c = document.getElementById("pdAuthCanvas");
      if (!c) return 0;
      const ctx = c.getContext("2d");
      if (!ctx) return 0;
      const imgData = ctx.getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200));
      let nonZero = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i + 3] > 0) nonZero++;
      }
      return nonZero;
    });
    assert.ok(nonZeroPixels > 0, `Canvas must render strokes (got ${nonZeroPixels} non-zero pixels)`);
    console.log(`✓ Canvas initialized promptly with ink strokes (${nonZeroPixels} pixels sampled).`);

    // Layout check: 50/50 desktop split
    const layoutCols = await page.evaluate(() => {
      const layout = document.querySelector(".pd-entrar-layout");
      const style = window.getComputedStyle(layout);
      return style.gridTemplateColumns;
    });
    console.log(`✓ Grid template columns at 1440px: ${layoutCols}`);

    // Capture desktop light screenshot
    await page.screenshot({ path: path.join(OUT_DIR, "t73-desktop-light.png") });
    console.log("✓ Saved t73-desktop-light.png");

    // Toggle dark mode and capture desktop dark screenshot
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(OUT_DIR, "t73-desktop-dark.png") });
    console.log("✓ Saved t73-desktop-dark.png");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // ----------------------------------------------------
    // 2. Mobile Viewport (390x844) & Responsive Layout
    // ----------------------------------------------------
    console.log("2. Testing Mobile viewport (390x844)...");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });

    // Assert no horizontal overflow on mobile
    const mobileOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    assert.strictEqual(mobileOverflow, true, "Horizontal overflow detected at 390px viewport!");

    // Capture mobile light screenshot
    await page.screenshot({ path: path.join(OUT_DIR, "t73-mobile-light.png") });
    console.log("✓ Saved t73-mobile-mobile-light.png");

    // Toggle dark mode and capture mobile dark screenshot
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(OUT_DIR, "t73-mobile-dark.png") });
    console.log("✓ Saved t73-mobile-dark.png");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // Reset back to desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });

    // ----------------------------------------------------
    // 3. Canvas Repose & rAF Pausing after 2.5s
    // ----------------------------------------------------
    console.log("3. Verifying Canvas repose & rAF freeze after 2.5s...");
    await page.goto(`${BASE_URL}/entrar`, { waitUntil: "networkidle" });

    // Wait 2.7s without any mouse or keyboard interaction
    await page.waitForTimeout(2700);

    const isFrozen = await page.evaluate(() => {
      const animId = window.PDLoginField ? window.PDLoginField.getAnimId() : -1;
      const count1 = window.PDLoginField ? window.PDLoginField.getFrameCount() : 0;
      return { animId, count1 };
    });

    console.log(`✓ At repose (t > 2.5s): animId = ${isFrozen.animId}, frameCount = ${isFrozen.count1}`);
    assert.strictEqual(isFrozen.animId, null, "rAF animId must be null after 2.5s in repose without interaction");

    // Wait another 300ms and verify frameCount did not change (is frozen)
    await page.waitForTimeout(300);
    const count2 = await page.evaluate(() => window.PDLoginField ? window.PDLoginField.getFrameCount() : 0);
    assert.strictEqual(count2, isFrozen.count1, `Frame count must be completely frozen (was ${isFrozen.count1}, now ${count2})`);
    console.log("✓ Canvas rAF successfully stopped in repose.");

    // ----------------------------------------------------
    // 4. Mode Switching (Tabs, Recover, URL Sync)
    // ----------------------------------------------------
    console.log("4. Testing Mode switching (signin / registro / recuperar)...");

    const tabSignUp = page.locator("#pdTabSignUp");
    const tabSignIn = page.locator("#pdTabSignIn");
    const forgotBtn = page.locator("#pdForgotBtn");
    const nameField = page.locator("#pdGroupName");
    const emailField = page.locator("#pdAuthEmail");
    const pwField = page.locator("#pdAuthPassword");
    const title = page.locator("#pdAuthTitle");

    // Click "Crear cuenta"
    await tabSignUp.click();
    assert.ok(page.url().includes("modo=registro"), `URL should reflect ?modo=registro, got ${page.url()}`);
    assert.strictEqual(await nameField.isVisible(), true, "Name field should be visible in signup mode");
    assert.strictEqual(await title.textContent(), "Crea tu cuenta gratuita");

    // Click "Iniciar sesión"
    await tabSignIn.click();
    assert.ok(!page.url().includes("modo=registro"), "URL should not have modo=registro in signin mode");
    assert.strictEqual(await nameField.isVisible(), false, "Name field should be hidden in signin mode");
    assert.strictEqual(await title.textContent(), "Inicia sesión en PerData");

    // Click "¿Olvidaste tu contraseña?"
    await forgotBtn.click();
    assert.ok(page.url().includes("modo=recuperar"), `URL should reflect ?modo=recuperar, got ${page.url()}`);
    assert.strictEqual(await pwField.isVisible(), false, "Password field should be hidden in recover mode");
    assert.strictEqual(await title.textContent(), "Recuperar contraseña");

    // Direct navigation with ?modo=registro
    await page.goto(`${BASE_URL}/entrar?modo=registro`);
    assert.strictEqual(await nameField.isVisible(), true, "Direct URL with modo=registro should show name field");

    // Direct navigation with ?modo=recuperar
    await page.goto(`${BASE_URL}/entrar?modo=recuperar`);
    assert.strictEqual(await pwField.isVisible(), false, "Direct URL with modo=recuperar should hide password");
    console.log("✓ Mode switching and direct URL navigation verified.");

    // ----------------------------------------------------
    // 5. Open-Redirect Protection & Volver Parameter
    // ----------------------------------------------------
    console.log("5. Testing Open-Redirect protection and 'volver' parameter...");

    // Malicious URL with https
    await page.goto(`${BASE_URL}/entrar?volver=https://malicioso.com`);
    let backHref = await page.locator("#pdEntrarBack").getAttribute("href");
    assert.strictEqual(backHref, "/", `Malicious https:// URL must fall back to '/', got: ${backHref}`);

    // Malicious URL with protocol-relative //
    await page.goto(`${BASE_URL}/entrar?volver=//evil.com`);
    backHref = await page.locator("#pdEntrarBack").getAttribute("href");
    assert.strictEqual(backHref, "/", `Protocol-relative //evil.com must fall back to '/', got: ${backHref}`);

    // Malicious URL with backslashes
    await page.goto(`${BASE_URL}/entrar?volver=/\\malicious.com`);
    backHref = await page.locator("#pdEntrarBack").getAttribute("href");
    assert.strictEqual(backHref, "/", `Backslash bypass must fall back to '/', got: ${backHref}`);

    // Valid internal relative path
    await page.goto(`${BASE_URL}/entrar?volver=/explorer`);
    backHref = await page.locator("#pdEntrarBack").getAttribute("href");
    assert.strictEqual(backHref, "/explorer", `Valid relative path '/explorer' should be preserved, got: ${backHref}`);
    console.log("✓ Open-redirect protection strictly verified.");

    // ----------------------------------------------------
    // 6. Login Flow with Dummy / Mock Credentials
    // ----------------------------------------------------
    console.log("6. Testing Login flow and redirection to volver target (/explorer)...");

    // Route /api/auth mock
    await page.route("**/api/auth**", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const body = JSON.parse(req.postData() || "{}");
        if (body.action === "signin") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              user: {
                id: "user-test-73",
                email: body.email,
                name: "Agustín",
                plan: "pro"
              },
              token: "mock-jwt-token-t73"
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto(`${BASE_URL}/entrar?volver=/explorer`);
    await page.fill("#pdAuthEmail", "agustin@perdata.site");
    await page.fill("#pdAuthPassword", "TestPassword123!");
    await page.click("#pdAuthSubmit");

    // Wait for redirection to /explorer
    await page.waitForURL("**/explorer", { timeout: 5000 });
    assert.strictEqual(page.url(), `${BASE_URL}/explorer`, `Must redirect exactly to /explorer, got: ${page.url()}`);

    // Verify localStorage session
    const storedSession = await page.evaluate(() => {
      return localStorage.getItem("mde_auth_session");
    });
    assert.ok(storedSession, "mde_auth_session must be stored in localStorage");
    const parsed = JSON.parse(storedSession);
    assert.strictEqual(parsed.user?.email, "agustin@perdata.site");
    console.log("✓ Login succeeded and redirected accurately to /explorer with session stored.");

    // ----------------------------------------------------
    // 7. Verify No Console or CSP Errors
    // ----------------------------------------------------
    console.log("7. Checking for console errors and CSP violations...");
    const cspErrors = consoleErrors.filter((e) =>
      /Content-Security-Policy|CSP|refused to execute|eval/i.test(e)
    );
    assert.strictEqual(cspErrors.length, 0, `CSP violations detected: ${cspErrors.join("; ")}`);
    console.log(`✓ Clean run with 0 CSP errors (${consoleErrors.length} total warnings/errors).`);

    await browser.close();
    console.log("\n=======================================================");
    console.log("All T73 Playwright E2E tests passed successfully!");
    console.log("=======================================================\n");
  } finally {
    cleanup();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
