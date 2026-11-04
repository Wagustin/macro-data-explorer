import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "https://perdata.site";
const WIDTHS = [390, 768, 1440];
const SEL = {
  card: "section.pdl-hero div.grid > div.lg\\:col-span-5",
  cardChart: ".pdl-card-chart",
  canvas: "#pdHeroChart",
  cardInner: ".pdl-card",
  big: "#pdCardP50"
};
const out = [];
const browser = await chromium.launch();
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(BASE + "/?x=" + Date.now(), { waitUntil: "domcontentloaded" });
  const grab = () => page.evaluate((sel) => {
    const r = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s);
      if (!el) { r[k] = null; continue; }
      const b = el.getBoundingClientRect();
      r[k] = { h: Math.round(b.height * 10) / 10, w: Math.round(b.width) };
    }
    return r;
  }, SEL);
  const before = await grab();
  await page.waitForFunction(() => {
    const p = document.getElementById("pdCardP50");
    return p && p.textContent && p.textContent.trim() !== "—";
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const after = await grab();
  out.push({ width: w, before, after });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
