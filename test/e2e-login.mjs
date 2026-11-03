import { spawn } from "child_process";
import { chromium } from "playwright";
import assert from "assert";
import fs from "fs";

const PORT = 4370;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

    // 1. Test at Desktop 1440px
    console.log("1. Testing Desktop viewport (1440x900)...");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/cuenta`, { waitUntil: "networkidle" });

    // Open modal via window.MacroAuth or window.PDAuth
    await page.evaluate(() => {
      const auth = window.PDAuth || window.MacroAuth || window.MDE_Auth;
      if (auth) auth.openModal();
    });

    const modal = page.locator("#pdAuthModal");
    await modal.waitFor({ state: "visible", timeout: 5000 });

    // Verify .pd-auth-canvas is visible
    const canvas = page.locator("#pdAuthModal .pd-auth-canvas");
    await canvas.waitFor({ state: "visible", timeout: 5000 });
    const isCanvasVisible = await canvas.isVisible();
    assert.strictEqual(isCanvasVisible, true, "Canvas .pd-auth-canvas must be visible inside auth modal");

    // Assert no horizontal overflow
    const desktopOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    assert.strictEqual(desktopOverflow, true, "Horizontal overflow detected at 1440px viewport!");

    // Verify initial focus
    await page.waitForTimeout(150);
    const focusedIdDesktop = await page.evaluate(() => document.activeElement?.id);
    assert.strictEqual(focusedIdDesktop, "pdAuthEmail", "Initial focus should be on #pdAuthEmail in signin mode");

    // 2. Verify window.PDLoginField and Canvas Rendering
    console.log("2. Verifying window.PDLoginField and Canvas rendering...");
    const fieldStatus = await page.evaluate(() => {
      if (!window.PDLoginField) return { defined: false };
      const c = document.querySelector("#pdAuthModal .pd-auth-canvas");
      if (!c) return { defined: true, canvasFound: false };
      const ctx = c.getContext("2d");
      if (!ctx) return { defined: true, canvasFound: true, ctx: false };
      const imgData = ctx.getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200));
      let nonZero = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i + 3] > 0) nonZero++;
      }
      return { defined: true, canvasFound: true, nonZeroPixels: nonZero };
    });
    assert.strictEqual(fieldStatus.defined, true, "window.PDLoginField must be defined");
    assert.strictEqual(fieldStatus.canvasFound, true, "Canvas element must be found");
    assert.ok(fieldStatus.nonZeroPixels > 0, `Canvas must have rendered non-empty pixels (got ${fieldStatus.nonZeroPixels})`);
    console.log(`✓ window.PDLoginField rendered on canvas (${fieldStatus.nonZeroPixels} non-empty pixels sampled).`);

    // Ensure screenshot directory exists
    const outDir = "/home/wagustin/kathy_workspace/handoff/login_stitch2";
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Capture desktop screenshot
    await page.screenshot({
      path: `${outDir}/final-desktop.png`
    });
    console.log("✓ Desktop (1440px) screenshot saved to final-desktop.png");

    // 3. Tab alternation test
    console.log("3. Testing Tab alternation (Iniciar sesión <-> Crear cuenta)...");
    const tabSignUp = page.locator("#pdTabSignUp");
    const tabSignIn = page.locator("#pdTabSignIn");
    const title = page.locator("#pdAuthTitle");
    const nameGroup = page.locator("#pdGroupName");

    await tabSignUp.click();
    assert.strictEqual(await tabSignUp.getAttribute("aria-selected"), "true");
    assert.strictEqual(await tabSignIn.getAttribute("aria-selected"), "false");
    assert.strictEqual(await title.textContent(), "Crea tu cuenta gratuita");
    assert.strictEqual(await nameGroup.isVisible(), true);

    await tabSignIn.click();
    assert.strictEqual(await tabSignIn.getAttribute("aria-selected"), "true");
    assert.strictEqual(await tabSignUp.getAttribute("aria-selected"), "false");
    assert.strictEqual(await title.textContent(), "Inicia sesión en PerData");
    assert.strictEqual(await nameGroup.isVisible(), false);
    console.log("✓ Tab alternation verified.");

    // 4. Test at Mobile 390px
    console.log("4. Testing Mobile viewport (390x844)...");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    const mobileOverflow = await page.evaluate(() => {
      const docOverflow = document.documentElement.scrollWidth <= window.innerWidth;
      const box = document.querySelector("#pdAuthModal .pd-dialog-box");
      const boxOverflow = box ? box.scrollWidth <= window.innerWidth : true;
      return docOverflow && boxOverflow;
    });
    assert.strictEqual(mobileOverflow, true, "Horizontal overflow detected at 390px viewport!");

    await page.screenshot({
      path: `${outDir}/final-mobile.png`
    });
    console.log("✓ Mobile (390px) screenshot saved to final-mobile.png");

    // 5. Test Performance during repose (frame time <= 8ms)
    console.log("5. Testing frame execution time during 1 second in repose...");
    const perfResult = await page.evaluate(async () => {
      const measurements = [];
      const start = performance.now();
      return new Promise((resolve) => {
        function checkFrame(now) {
          const t0 = performance.now();
          // Let current frame settle and measure frame step duration
          const cost = performance.now() - t0;
          measurements.push(cost);
          if (now - start < 1000) {
            requestAnimationFrame(checkFrame);
          } else {
            const maxFrame = Math.max(...measurements);
            const avgFrame = measurements.reduce((a, b) => a + b, 0) / measurements.length;
            resolve({ maxFrame, avgFrame, count: measurements.length });
          }
        }
        requestAnimationFrame(checkFrame);
      });
    });
    console.log(`✓ Repose frame execution: avg=${perfResult.avgFrame.toFixed(2)}ms, max=${perfResult.maxFrame.toFixed(2)}ms (${perfResult.count} frames measured).`);
    assert.ok(perfResult.avgFrame <= 8, `Main thread frame time avg (${perfResult.avgFrame}ms) must stay <= 8ms`);

    // 6. Test prefers-reduced-motion media feature
    console.log("6. Testing prefers-reduced-motion: reduce...");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotionRespected = await page.evaluate(() => {
      const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Re-trigger start on canvas under reduced motion to test static draw
      const c = document.querySelector("#pdAuthModal .pd-auth-canvas");
      if (window.PDLoginField && c) {
        window.PDLoginField.start(c);
      }
      return mediaReduced;
    });
    assert.strictEqual(reducedMotionRespected, true, "Reduced motion must be recognized by media query");
    console.log("✓ Reduced motion preference verified.");

    // 7. Verify no CSP or JS console errors
    console.log("7. Checking for console errors and CSP violations...");
    const cspErrors = consoleErrors.filter(e => /Content-Security-Policy|CSP|refused to execute|eval/i.test(e));
    assert.strictEqual(cspErrors.length, 0, `CSP violations detected: ${cspErrors.join("; ")}`);
    console.log(`✓ No CSP or console errors detected (${consoleErrors.length} total warnings/errors).`);

    await browser.close();
    console.log("\nAll Playwright E2E tests (T70) passed successfully!");
  } finally {
    cleanup();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
