import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

function buildSitemap() {
  const sitemapPath = path.join(rootDir, "sitemap.xml");
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const staticUrls = [...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)]
    .map(([entry]) => entry)
    .filter((entry) => !/<loc>https:\/\/perdata\.site\/empresa\/[^<]+<\/loc>/.test(entry));
  const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, "data/empresas.json"), "utf8"));
  const tickers = [...new Set((catalog.emisores || []).flatMap((issuer) =>
    (issuer.valores || []).map((value) => value.nemonico).filter(Boolean)
  ))].sort();
  const lastmod = new Date().toISOString().slice(0, 10);
  const issuerUrls = tickers.map((ticker) =>
    `  <url><loc>https://perdata.site/empresa/${encodeURIComponent(ticker)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq></url>`
  );
  const nextSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...issuerUrls].join("\n")}\n</urlset>\n`;
  fs.writeFileSync(sitemapPath, nextSitemap);
}

buildSitemap();

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
  "ads.js",
  "auth.js",
  "favicon.ico",
  "icon.svg",
  "apple-touch-icon.png",
  "og-image.png",
  "robots.txt",
  "ads.txt",
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
