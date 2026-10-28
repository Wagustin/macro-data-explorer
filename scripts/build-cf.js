import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { transform } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const tailwindInput = path.join(rootDir, "src", "tailwind.css");
const tailwindOutput = path.join(publicDir, "tw.css");

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
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), nextSitemap);
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
  "mercado.html",
  "estado.html",
  "resumen.html",
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
  "tailwind.theme.json"
];

const FILES_TO_MINIFY = ["pd.css", "auth.js", "pd-chart.js", "ads.js", "motion.js"];
const STATIC_HEADERS = `/*.js
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/*.css
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/icon.svg
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/favicon.ico
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/*.woff
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/*.woff2
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/*.ttf
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/*.otf
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
`;

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

execFileSync("npx", [
  "tailwindcss",
  "-c", path.join(rootDir, "tailwind.config.cjs"),
  "-i", tailwindInput,
  "-o", tailwindOutput,
  "--minify"
], { cwd: rootDir, stdio: "inherit" });

for (const file of FILES_TO_COPY) {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

for (const file of FILES_TO_MINIFY) {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (!fs.existsSync(src)) continue;

  try {
    const { code } = await transform(fs.readFileSync(src, "utf8"), {
      loader: path.extname(file) === ".css" ? "css" : "js",
      minify: true
    });
    fs.writeFileSync(dest, code);
  } catch (error) {
    fs.copyFileSync(src, dest);
    console.warn(`Could not minify ${file}; copied the original.`, error.message);
  }
}

fs.writeFileSync(path.join(publicDir, "_headers"), STATIC_HEADERS);

const digestArchive = path.join(rootDir, "data/resumenes");
if (fs.existsSync(digestArchive)) {
  fs.cpSync(digestArchive, path.join(publicDir, "data/resumenes"), { recursive: true });
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
