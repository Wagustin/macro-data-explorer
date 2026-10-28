import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "https://perdata.site";
const defaultUrls = "/explorer,/noticias,/empresa/ALICORC1,/";
const urls = (process.env.URLS || defaultUrls)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean)
  .map((url) => new URL(url, baseUrl).href);
const outputDir = path.resolve("cls-trace");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const url of urls) {
    for (let pass = 1; pass <= 2; pass += 1) {
      const context = await browser.newContext({
        viewport: { width: 412, height: 823 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8,
        connectionType: "cellular4g",
      });

      await page.addInitScript(() => {
        const selectorFor = (node) => {
          if (!(node instanceof Element)) return String(node?.nodeName || "unknown");
          const part = (element) => {
            const tag = element.tagName.toLowerCase();
            const id = element.id ? `#${CSS.escape(element.id)}` : "";
            const classes = [...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join("");
            return `${tag}${id}${classes}`;
          };
          const parts = [];
          let current = node;
          while (current && parts.length < 4) {
            parts.unshift(part(current));
            if (current.id) break;
            current = current.parentElement;
          }
          return parts.join(" > ");
        };
        const state = { shifts: [], mutations: [] };
        Object.defineProperty(window, "__clsTrace", { value: state });

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.value <= 0.001 || entry.hadRecentInput) continue;
            state.shifts.push({
              startTime: entry.startTime,
              value: entry.value,
              sources: (entry.sources || []).map((source) => ({
                selector: selectorFor(source.node),
                previousRect: source.previousRect,
                currentRect: source.currentRect,
              })),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });

        const recordMutation = (node, label) => {
          state.mutations.push({
            timestamp: performance.now(),
            selector: selectorFor(node),
            label,
          });
          if (state.mutations.length > 300) state.mutations.shift();
        };
        new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === "childList") {
              for (const node of record.addedNodes) {
                recordMutation(node, `added ${node.nodeName?.toLowerCase() || "node"}`);
              }
            } else {
              recordMutation(record.target, `${record.attributeName} changed`);
            }
          }
        }).observe(document, {
          childList: true,
          attributes: true,
          attributeFilter: ["class", "style", "hidden"],
          subtree: true,
        });
      });

      let navigationError = null;
      try {
        await page.goto(url, { waitUntil: "load", timeout: 90000 });
      } catch (error) {
        navigationError = error.message;
      }
      await page.waitForTimeout(6000);
      const trace = await page.evaluate(() => window.__clsTrace || { shifts: [], mutations: [] });
      results.push({
        url,
        pass,
        cls: trace.shifts.reduce((sum, shift) => sum + shift.value, 0),
        shifts: trace.shifts,
        mutations: trace.mutations,
        navigationError,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "trace.json"), `${JSON.stringify(results, null, 2)}\n`);
