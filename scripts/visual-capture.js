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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
