import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "https://perdata.site";
const browser = await chromium.launch();
for (const w of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(BASE + "/?x=" + Date.now(), { waitUntil: "domcontentloaded" });
  const grab = () => page.evaluate(() => {
    const root = document.querySelector(".pdl-card-chart");
    if (!root) return [];
    const rows = [];
    const walk = (el, depth) => {
      if (depth > 2) return;
      const b = el.getBoundingClientRect();
      rows.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 40), h: Math.round(b.height * 10) / 10 });
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(root, 0);
    return rows;
  });
  const before = await grab();
  await page.waitForFunction(() => {
    const p = document.getElementById("pdCardP50");
    return p && p.textContent && p.textContent.trim() !== "—";
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const after = await grab();
  console.log("=== width", w, "===");
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const b = before[i], a = after[i];
    if (!a) continue;
    const d = (a.h - (b ? b.h : 0)).toFixed(1);
    if (Math.abs(parseFloat(d)) >= 0.5) console.log(`Δ${d.padStart(6)}  antes=${(b?b.h:"?").toString().padStart(6)}  ahora=${a.h.toString().padStart(6)}  ${a.tag}.${a.cls}`);
  }
  await page.close();
}
await browser.close();
