import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || process.argv[2];
if (!baseUrl) {
  console.error("Usage: BASE_URL=https://example.com node scripts/css-coverage.mjs");
  process.exit(2);
}

const pages = [
  "/",
  "/explorer",
  "/noticias",
  "/empresas",
  "/empresa/ALICORC1",
  "/mercado",
  "/metodologia"
];
const viewports = [
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 960, isMobile: false, hasTouch: false }
];

const browser = await chromium.launch({ headless: true });
const missingByPage = new Map();
try {
  for (const viewport of viewports) {
    const context = await browser.newContext(viewport);
    const page = await context.newPage();
    for (const route of pages) {
      const url = new URL(route, baseUrl).href;
      try {
        const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
        if (!response || !response.ok()) {
          throw new Error(`page returned ${response?.status() ?? "no response"}`);
        }
        await page.evaluate(async () => {
          const step = Math.max(300, Math.floor(innerHeight * 0.75));
          for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 80));
          }
          window.scrollTo(0, 0);
        });
        const result = await page.evaluate(async () => {
          const stylesheetUrl = new URL("/tw.css", location.origin);
          const response = await fetch(stylesheetUrl);
          if (!response.ok) throw new Error(`compiled CSS returned ${response.status}`);
          const css = await response.text();
          const style = document.createElement("style");
          style.textContent = css;
          document.head.append(style);
          const selectors = [];
          const collectRules = (rules) => {
            for (const rule of rules) {
              if (typeof rule.selectorText === "string") selectors.push(rule.selectorText);
              if (rule.cssRules) collectRules(rule.cssRules);
            }
          };
          // Include deployed page styles as well as tw.css; app-specific classes
          // are intentionally defined in pd.css and inline page styles.
          for (const sheet of document.styleSheets) {
            try { collectRules(sheet.cssRules); } catch { /* cross-origin sheet */ }
          }
          collectRules(style.sheet.cssRules);
          const classes = new Set(
            [...document.querySelectorAll("*")]
              .flatMap((element) => [...element.classList])
              .filter((name) => name !== "adsbygoogle" && name !== "light" && name !== "dark" && !name.startsWith("pd-"))
          );
          const escapedClasses = [...classes].map((name) => [name, CSS.escape(name)]);
          const missing = escapedClasses
            .filter(([, escaped]) => !selectors.some((selector) => {
              const token = `.${escaped}`;
              let offset = selector.indexOf(token);
              while (offset !== -1) {
                const next = selector[offset + token.length];
                if (!next || /\s/.test(next) || ":.[]>,+~#".includes(next)) return true;
                offset = selector.indexOf(token, offset + token.length);
              }
              return false;
            }))
            .map(([name]) => name)
            .sort();
          return { missing, stylesheetUrl: stylesheetUrl.href };
        });
        if (result.missing.length) {
          const key = `${viewport.name} ${route}`;
          missingByPage.set(key, result.missing);
          console.log(`${key}: ${result.missing.join(", ")}`);
        } else {
          console.log(`${viewport.name} ${route}: OK`);
        }
      } catch (error) {
        const key = `${viewport.name} ${route}`;
        missingByPage.set(key, [`ERROR: ${error.message}`]);
        console.error(`${key}: ERROR: ${error.message}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (missingByPage.size) process.exitCode = 1;
