import { spawn } from "child_process";
import { chromium } from "playwright";
import assert from "assert";

const PORT = 4364;
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

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Test at Desktop 1440px
    console.log("Testing Desktop viewport (1440x900)...");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/cuenta`, { waitUntil: "networkidle" });

    // Open modal via window.MacroAuth or clicking trigger
    await page.evaluate(() => {
      if (window.MacroAuth) window.MacroAuth.openModal();
    });

    const modal = page.locator("#pdAuthModal");
    await modal.waitFor({ state: "visible", timeout: 5000 });

    // Assert no horizontal overflow
    const desktopOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    assert.strictEqual(desktopOverflow, true, "Horizontal overflow detected at 1440px viewport!");

    // Check focus on email field
    await page.waitForTimeout(150);
    const focusedIdDesktop = await page.evaluate(() => document.activeElement?.id);
    assert.strictEqual(focusedIdDesktop, "pdAuthEmail", "Initial focus should be on #pdAuthEmail in signin mode");

    // Take screenshot of desktop modal
    await page.screenshot({
      path: "/home/wagustin/kathy_workspace/handoff/login_stitch/desktop-1440-login.png"
    });
    console.log("✓ Desktop (1440px) verified and screenshot captured.");

    // 2. Test Tab Alternation
    console.log("Testing Tab alternation (Iniciar sesión <-> Crear cuenta)...");
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

    // 3. Test at Mobile 390px
    console.log("Testing Mobile viewport (390x844)...");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    const mobileOverflow = await page.evaluate(() => {
      const docOverflow = document.documentElement.scrollWidth <= window.innerWidth;
      const box = document.querySelector("#pdAuthModal .pd-dialog-box");
      const boxOverflow = box ? box.scrollWidth <= window.innerWidth : true;
      return docOverflow && boxOverflow;
    });
    assert.strictEqual(mobileOverflow, true, "Horizontal overflow detected at 390px viewport!");

    // Take screenshot of mobile modal
    await page.screenshot({
      path: "/home/wagustin/kathy_workspace/handoff/login_stitch/mobile-390-login.png"
    });
    console.log("✓ Mobile (390px) verified and screenshot captured.");

    // 4. Test Reduced Motion
    console.log("Testing prefers-reduced-motion media feature...");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const isAnimationNone = await page.evaluate(() => {
      const histLine = document.querySelector(".pd-chart-hist");
      if (!histLine) return false;
      const computed = window.getComputedStyle(histLine);
      return computed.animationName === "none" || computed.animation === "none";
    });
    assert.strictEqual(isAnimationNone, true, "Animations must be disabled when prefers-reduced-motion is reduce");
    console.log("✓ Reduced motion preference respected.");

    await browser.close();
    console.log("All Playwright login modal tests passed successfully!");
  } finally {
    cleanup();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
