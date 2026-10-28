import fs from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = new URL(process.env.BASE_URL || "https://perdata.site");
const darkTheme = process.env.TEMA === "oscuro";
const pages = [
  ["home", "/"],
  ["explorer", "/explorer"],
  ["noticias", "/noticias"],
  ["empresas", "/empresas"],
  ["empresa-alicorc1", "/empresa/ALICORC1"],
  ["precios", "/precios"],
  ["metodologia", "/metodologia"]
];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 }
];
const outputDir = new URL("../visual-current/", import.meta.url);
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const failures = [];
const jsErrors = new Map(pages.map(([, route]) => [route, []]));
const failedRequests = new Map(pages.map(([, route]) => [route, []]));
const graphRoutes = new Set(["/", "/explorer", "/empresa/ALICORC1"]);

function isIgnoredThirdParty(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (/(^|\.)(adsbygoogle|googlesyndication|googleadservices)\.com$/.test(host)
      || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(host)
      || host === "static.cloudflareinsights.com"
      || host === "cdn.jsdelivr.net") return true;
    return host !== "perdata.site" && !host.endsWith(".perdata.site")
      && host !== baseUrl.hostname && !host.endsWith(".workers.dev");
  } catch {
    return false;
  }
}

function recordJsError(route, message) {
  const routeErrors = jsErrors.get(route);
  if (routeErrors) routeErrors.push(message);
}

async function prepareCapture(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;

    const waitForPaint = () => new Promise(resolve => setTimeout(resolve, 300));
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

try {
  for (const [pageName, route] of pages) {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport,
        colorScheme: darkTheme ? "dark" : "light",
        reducedMotion: "reduce"
      });
      page.on("pageerror", error => {
        const message = error.stack || error.message;
        const source = error.stack?.match(/https?:\/\/[^\s)]+/)?.[0];
        if (!isIgnoredThirdParty(source)) recordJsError(route, message);
      });
      page.on("console", message => {
        if (message.type() !== "error") return;
        const source = message.location().url;
        if (!isIgnoredThirdParty(source)) recordJsError(route, message.text());
      });
      page.on("requestfailed", request => {
        if (isIgnoredThirdParty(request.url())) return;
        failedRequests.get(route)?.push(`${request.url()}: ${request.failure()?.errorText || "request failed"}`);
      });
      const response = await page.goto(new URL(route, baseUrl).href, { waitUntil: "networkidle", timeout: 60000 });
      if (!response?.ok()) {
        failures.push(`${route} (${viewport.name}) returned ${response?.status() ?? "no response"}`);
      }

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      if (dimensions.scrollWidth > dimensions.innerWidth) {
        failures.push(`${route} (${viewport.name}) overflows: ${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`);
      }

      if (graphRoutes.has(route) && viewport.name === "desktop") {
        const hasVisibleChart = await page.evaluate(() => {
          for (const canvas of document.querySelectorAll("canvas")) {
            if (canvas.width <= 100 || canvas.height <= 100) continue;
            try {
              const context = canvas.getContext("2d", { willReadFrequently: true });
              if (!context) continue;
              let visible = 0;
              for (let i = 0; i < 200; i += 1) {
                const x = Math.floor((i * 97 % 199) / 198 * (canvas.width - 1));
                const y = Math.floor((i * 151 % 197) / 196 * (canvas.height - 1));
                const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
                if (alpha > 0 && !(red >= 245 && green >= 245 && blue >= 245)) visible += 1;
              }
              if (visible / 200 >= 0.02) return true;
            } catch {
              // Cross-origin or tainted canvases cannot be inspected.
            }
          }
          return false;
        });
        console.log(`GRAFICO ${route}: ${hasVisibleChart ? "ok" : "vacío"}`);
        if (!hasVisibleChart) failures.push(`${route} has no visible chart`);
      }

      const themeSuffix = darkTheme ? "-dark" : "";
      await prepareCapture(page);
      await page.screenshot({
        path: new URL(`${pageName}-${viewport.name}${themeSuffix}.png`, outputDir).pathname,
        animations: "disabled",
        fullPage: true
      });

      if (pageName === "home" && viewport.name === "desktop") {
        const hoverTargets = [
          ["table", page.locator("table a.hover\\:text-brand").first()],
          ["menu", page.locator("nav.hidden.md\\:flex a").first()]
        ];
        for (const [targetName, target] of hoverTargets) {
          await prepareCapture(page);
          await target.hover();
          const bounds = await target.boundingBox();
          if (!bounds) {
            failures.push(`home (${viewport.name}) ${targetName} hover target not found`);
            continue;
          }
          const width = 300;
          const height = 120;
          const x = Math.max(0, Math.min(viewport.width - width, bounds.x + bounds.width / 2 - width / 2));
          const y = Math.max(0, Math.min(viewport.height - height, bounds.y + bounds.height / 2 - height / 2));
          await page.screenshot({
            path: new URL(`home-desktop-hover-${targetName}${themeSuffix}.png`, outputDir).pathname,
            animations: "disabled",
            clip: { x, y, width, height }
          });
        }
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}

for (const [route, errors] of jsErrors) {
  console.log(`ERRORES JS ${route}: ${errors.length}`);
  for (const error of errors.slice(0, 5)) console.error(`  ${error}`);
  if (errors.length) failures.push(`${route} has ${errors.length} JavaScript error(s)`);
}
for (const [route, requests] of failedRequests) {
  for (const request of requests) failures.push(`${route} failed request: ${request}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
