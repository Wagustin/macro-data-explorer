import fs from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = new URL(process.env.BASE_URL || "https://perdata.site");
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

try {
  for (const [pageName, route] of pages) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
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

      const liveDataPage = ["home", "explorer", "noticias", "empresas"].includes(pageName);
      await page.screenshot({
        path: new URL(`${pageName}-${viewport.name}.png`, outputDir).pathname,
        ...(liveDataPage
          ? { clip: { x: 0, y: 0, width: viewport.width, height: 900 } }
          : { fullPage: true })
      });
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
