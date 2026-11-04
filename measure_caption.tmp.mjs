import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "https://perdata.site";
const browser = await chromium.launch();
for (const w of [360, 390, 430, 768, 1024, 1440]) {
  const heights = [], heads = [];
  for (let i = 0; i < 3; i++) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(BASE + "/?x=" + Date.now() + "-" + i, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const p = document.getElementById("pdCardP50");
      return p && p.textContent && p.textContent.trim() !== "—";
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const c = document.getElementById("pdChartCaption");
      const h = document.querySelector(".pd-chart-model-header");
      return { c: c ? Math.round(c.getBoundingClientRect().height * 10) / 10 : null,
               h: h ? Math.round(h.getBoundingClientRect().height * 10) / 10 : null };
    });
    heights.push(r.c); heads.push(r.h);
    await page.close();
  }
  console.log(w, "caption", JSON.stringify(heights), "max", Math.max(...heights.filter(Boolean)), "| header max", Math.max(...heads.filter(Boolean)));
}
await browser.close();
