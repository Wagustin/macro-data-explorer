import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

const FILES_TO_COPY = [
  "index.html",
  "explorer.html",
  "news.html",
  "metodologia.html",
  "aprende.html",
  "guia.html",
  "precios.html",
  "cuenta.html",
  "restablecer.html",
  "privacidad.html",
  "terms.html",
  "404.html",
  "empresas.html",
  "boletin.html",
  "data/smv-hechos.json",
  "empresa.html",
  "data/empresas.json",
  "pd.css",
  "pd-chart.js",
  "motion.js",
  "auth.js",
  "favicon.ico",
  "icon.svg",
  "apple-touch-icon.png",
  "og-image.png",
  "robots.txt",
  "sitemap.xml",
  "tailwind.theme.json"
];

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

for (const file of FILES_TO_COPY) {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// Alias copy: news.html -> noticias.html for static serving of /noticias
const newsSrc = path.join(rootDir, "news.html");
if (fs.existsSync(newsSrc)) {
  fs.copyFileSync(newsSrc, path.join(publicDir, "noticias.html"));
}

// Copy assets directory if present
const assetsSrc = path.join(rootDir, "assets");
const assetsDest = path.join(publicDir, "assets");
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsDest, { recursive: true });
}

console.log("✓ Cloudflare public/ directory built successfully.");
