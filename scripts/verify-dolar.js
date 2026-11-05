// verify-dolar.js - checks the generated dolar.html against the K2 and K2b requirements
import fs from "fs";

const html = fs.readFileSync("/home/wagustin/macro-data-explorer/dolar.html", "utf8");

const stripBlocks = (s, tag) => s.replace(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "g"), " ");
const visible = stripBlocks(stripBlocks(html, "script"), "style")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

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
  'palette F5F1E8': /#F5F1E8/i.test(html),
  'palette 141311': /#141311/i.test(html),
  'prefers-color-scheme dark': /prefers-color-scheme:\s*dark/.test(html),
  'theme toggle checkbox': /id="themeToggle"/.test(html),
  'localStorage theme': /localStorage\.setItem\("theme"/.test(html),
  'no emoji scrubber script': !/createNodeWalker|FILTER_REJECT/.test(html),
  'plus-minus kept visible': /±/.test(html),
  'no hardcoded 3.5 mil millones': !/3[.,]5 mil millones/.test(html),
  'no TimesFM mentions': !/TimesFM/i.test(html),
  'no dev filler words': !/(ningún valor está hardcodeado|alta precisión predictiva|respaldado por.*calibración empírica)/i.test(html),
  'normal case headings': !/Rangos Probables de Cotización/.test(html) && /Rangos probables/.test(html),
  'tomorrow with weekday': /Mañana, [a-záéíóúñ]+ \d+ [a-záéíóúñ]+/i.test(html),
  'monthly forecast matches api': /3\.3933/.test(html) && /3\.5438/.test(html) && /3\.4658/.test(html),
  'short dates without dots': !/(ene|feb|mar|abr|may|jun|jul|ago|set|oct|nov|dic)\./i.test(html),
};
console.log("\n--- checks ---");
let allPass = true;
for (const [k, v] of Object.entries(checks)) {
  console.log((v ? "PASS" : "FAIL") + "  " + k);
  if (!v) allPass = false;
}

// Ensure the public copy matches
const pub = fs.readFileSync("/home/wagustin/macro-data-explorer/public/dolar.html", "utf8");
console.log("\npublic/dolar.html identical to root:", pub === html);
