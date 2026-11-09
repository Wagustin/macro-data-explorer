import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join("/home/wagustin/kathy_workspace/handoff/qa");

// Use file:// URL for the local dolar.html
const dolarPath = path.join(rootDir, "dolar.html");
const baseUrl = `file://${dolarPath}`;

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];

function isExpectedFileError(url) {
  // Expected errors when loading via file:// protocol
  if (!url) return false;
  return url.startsWith("file://") && (
    url.includes("/fonts/") ||
    url.includes("/pd.css") ||
    url.includes("/tw.css") ||
    url.includes("/consent.js") ||
    url.includes("/auth.js")
  );
}

async function prepareCapture(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;

    const waitForPaint = () => new Promise((resolve) => setTimeout(resolve, 300));
    const scrollHeight = document.documentElement.scrollHeight;
    const step = Math.max(window.innerHeight, 1);

    for (let y = 0; y < scrollHeight; y += step) {
      window.scrollTo(0, y);
      await waitForPaint();
    }
    window.scrollTo(0, scrollHeight);
    await waitForPaint();

    for (let y = scrollHeight - step; y > 0; y -= step) {
      window.scrollTo(0, y);
      await waitForPaint();
    }
    window.scrollTo(0, 0);
    await waitForPaint();
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const failures = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport,
        colorScheme: "light",
        reducedMotion: "reduce",
      });

      page.on("pageerror", (error) => {
        const message = error.stack || error.message;
        failures.push(`dolar (${viewport.name}) JS error: ${message}`);
      });

      page.on("console", (message) => {
        if (message.type() === "error") {
          const url = message.location().url;
          if (!isExpectedFileError(url)) {
            failures.push(`dolar (${viewport.name}) console error: ${message.text()}`);
          }
        }
      });

      page.on("requestfailed", (request) => {
        if (!isExpectedFileError(request.url())) {
          failures.push(`dolar (${viewport.name}) failed request: ${request.url()}: ${request.failure()?.errorText || "request failed"}`);
        }
      });

      const response = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
      if (!response?.ok()) {
        failures.push(`dolar (${viewport.name}) returned ${response?.status() ?? "no response"}`);
      }

      // Check for horizontal overflow
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (dimensions.scrollWidth > dimensions.innerWidth) {
        failures.push(`dolar (${viewport.name}) overflows: ${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`);
      }

      await prepareCapture(page);

      const outputPath = path.join(outputDir, `dolar-${viewport.name}.png`);
      await page.screenshot({
        path: outputPath,
        animations: "disabled",
        fullPage: true,
      });
      console.log(`Captured ${outputPath}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error("QA FAILURES:");
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log("QA passed: no failures");
  }
}

main();