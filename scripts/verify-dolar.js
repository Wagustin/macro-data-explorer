// verify-dolar.js - checks the generated dolar.html against the K2 and K2b requirements
import fs from "fs";

const ROOT = new URL("..", import.meta.url);

const html = fs.readFileSync(new URL("dolar.html", ROOT), "utf8");

const stripBlocks = (s, tag) => s.replace(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "g"), " ");
const visible = stripBlocks(stripBlocks(html, "script"), "style")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Los tokens de color viven en pd.css (la página lo enlaza), no en el HTML
const css = fs.readFileSync(new URL("pd.css", ROOT), "utf8");

// Tarjeta «Próximo mes»: P10 <= P25 <= P50 <= P75 <= P90 (los valores vienen del motor en vivo)
const mesCard = (() => {
  const i = html.indexOf("Próximo mes");
  return i === -1 ? "" : html.slice(i, html.indexOf("</article>", i));
})();
const mesP50 = Number((mesCard.match(/pd-range-p50">S\/ ([\d.]+)/) || [])[1]);
const mesDd = [...mesCard.matchAll(/<dd>S\/ ([\d.]+)<\/dd>/g)].map((m) => Number(m[1]));
const mesOrdenado = mesDd.length === 4 && [mesDd[0], mesDd[1], mesP50, mesDd[2], mesDd[3]]
  .every((v, k, a) => k === 0 || a[k - 1] <= v);

const allWords = visible.split(" ").filter(Boolean);
const proseWords = allWords.filter((w) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w));

console.log("=== VERIFICATION ===");
console.log("Visible words (all tokens):", allWords.length);
console.log("Visible words (with letters):", proseWords.length);

// Technical narrative section only
const techStart = visible.indexOf("Qué mueve el dólar en el Perú");
const techText = techStart !== -1 ? visible.slice(techStart) : "";
const techWords = techText.split(" ").filter((w) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w));
console.log("Technical narrative words:", techWords.length);

// Emoji scan (astral planes + misc pictographs)
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
const emojis = html.match(emojiRe) || [];
console.log("Emoji/pictograph codepoints in source:", emojis.length, emojis.length ? [...new Set(emojis)].join(" ") : "");

// Structural checks
const tbodyMatches = html.match(/<tbody>[\s\S]*?<\/tbody>/g) || [];
console.log("Table data sections (tbody):", tbodyMatches.length);

const faqDts = (html.match(/<dt>/g) || []).length;
const faqDds = (html.match(/<dd>/g) || []).length;
console.log("FAQ dt/dd pairs:", faqDts, "/", faqDds);

const checks = {
  'visible words >= 900': proseWords.length >= 900,
  'zero emojis': emojis.length === 0,
  'meta pd-ads': /<meta name="pd-ads" content="1">/.test(html),
  'meta robots': /<meta name="robots" content="index, follow">/.test(html),
  canonical: /<link rel="canonical" href="https:\/\/perdata\.site\/dolar">/.test(html),
  'font Libre Franklin': /Libre Franklin/.test(html),
  'font Source Serif 4': /Source Serif 4/.test(html),
  'font IBM Plex Mono': /IBM Plex Mono/.test(html),
  'palette F5F1E8': /#F5F1E8/i.test(css),
  'palette 141311': /#141311/i.test(css),
  'prefers-color-scheme dark': /prefers-color-scheme:\s*dark/.test(html),
  'theme toggle checkbox': /id="themeToggle"/.test(html),
  'localStorage theme': /localStorage\.setItem\(['"]theme['"]/.test(html),
  'no emoji scrubber script': !/createNodeWalker|FILTER_REJECT/.test(html),
  'band width visible (P10-P90)': /Ancho de banda P10-P90: \d+\.\d{2}%/.test(html),
  'no hardcoded 3.5 mil millones': !/3[.,]5 mil millones/.test(html),
  'no TimesFM mentions': !/TimesFM/i.test(html),
  'no dev filler words': !/(ningún valor está hardcodeado|alta precisión predictiva|respaldado por.*calibración empírica)/i.test(html),
  'normal case headings': !/Rangos Probables de Cotización/.test(html) && /Rangos probables/.test(html),
  'next close with weekday and date': /id="pdEtiquetaCierre" data-objetivo="\d{4}-\d{2}-\d{2}">Próximo cierre<\/p>\s*<p class="pd-range-target">[a-záéíóúñ]+ · \d+ de [a-záéíóúñ]+ de \d{4}<\/p>/.test(html),
  'monthly card quantiles ordered': mesOrdenado,
  'short dates without dots': !/\b(ene|feb|mar|abr|may|jun|jul|ago|set|oct|nov|dic)\./i.test(html),
};
console.log("\n--- checks ---");
let allPass = true;
for (const [k, v] of Object.entries(checks)) {
  console.log((v ? "PASS" : "FAIL") + "  " + k);
  if (!v) allPass = false;
}

// Ensure the public copy matches
// public/ es una copia local (ignorada por git): si no existe, no se compara
const pubUrl = new URL("public/dolar.html", ROOT);
if (fs.existsSync(pubUrl)) {
  const pub = fs.readFileSync(pubUrl, "utf8");
  console.log("\npublic/dolar.html identical to root:", pub === html);
} else {
  console.log("\npublic/dolar.html no existe en este checkout (copia local, ignorada por git): omitido");
}
