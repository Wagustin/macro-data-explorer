import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { transform } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const tailwindInput = path.join(rootDir, "src", "tailwind.css");
const tailwindOutput = path.join(publicDir, "tw.css");

fs.rmSync(publicDir, { recursive: true, force: true });

function buildSitemap() {
  // Only pages with content of our own go to search engines; the rest are noindex (see worker.js)
  const pages = ["/", "/dolar", "/explorer", "/empresas", "/aprende", "/metodologia", "/guia", "/precios",
    "/boletin", "/nosotros", "/politica-editorial", "/contacto", "/privacidad", "/terms", "/semana"];
  const lastmod = new Date().toISOString().slice(0, 10);
  const fichasDir = path.join(rootDir, "empresa");
  const fichas = fs.existsSync(fichasDir)
    ? fs.readdirSync(fichasDir).filter((f) => f.endsWith(".html") &&
        /<body[^>]*data-indexable="1"/.test(fs.readFileSync(path.join(fichasDir, f), "utf8")))
      .map((f) => `/empresa/${encodeURIComponent(f.slice(0, -5))}`).sort()
    : [];
  const notasDir = path.join(rootDir, "data/semana-dolar");
  const notas = fs.existsSync(notasDir)
    ? fs.readdirSync(notasDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => `/semana/${f.slice(0, -5)}`).sort()
    : [];
  const urls = [...pages, ...notas, ...fichas].map((p) =>
    `  <url><loc>https://perdata.site${p}</loc><lastmod>${lastmod}</lastmod></url>`);
  const nextSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), nextSitemap);
}

buildSitemap();

const FILES_TO_COPY = [
  "index.html",
  "dolar.html",
  "explorer.html",
  "news.html",
  "metodologia.html",
  "aprende.html",
  "guia.html",
  "precios.html",
  "cuenta.html",
  "restablecer.html",
  "privacidad.html",
  "nosotros.html",
  "politica-editorial.html",
  "contacto.html",
  "terms.html",
  "404.html",
  "empresas.html",
  "mercado.html",
  "estado.html",
  "resumen.html",
  "boletin.html",
  "data/smv-hechos.json",
  "data/smv-accionistas.json",
  "data/empresas-ruc.json",
  "data/empresas-estado.json",
  "empresa.html",
  "data/empresas.json",
  "pd.css",
  "pd-chart.js",
  "motion.js",
  "ads.js",
  "auth.js",
  "consent.js",
  "entrar.html",
  "entrar.js",
  "pd-login-field.js",
  "pd-intro.js",
  "favicon.ico",
  "icon.svg",
  "apple-touch-icon.png",
  "og-image.png",
  "robots.txt",
  "ads.txt",
  "tailwind.theme.json"
];

const FILES_TO_MINIFY = ["pd.css", "auth.js", "pd-login-field.js", "pd-intro.js", "pd-chart.js", "ads.js", "motion.js", "consent.js", "entrar.js"];
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

// The script policy is set per response by the Worker (with a fresh nonce), so pages need no CSP block here
fs.writeFileSync(path.join(publicDir, "_headers"), `${STATIC_HEADERS}\n`);

const digestArchive = path.join(rootDir, "data/resumenes");
if (fs.existsSync(digestArchive)) {
  fs.cpSync(digestArchive, path.join(publicDir, "data/resumenes"), { recursive: true });
}

// Weekly notes: one page per week under /semana and the data behind them
const semanaPages = path.join(rootDir, "semana");
if (fs.existsSync(semanaPages)) {
  fs.cpSync(semanaPages, path.join(publicDir, "semana"), { recursive: true });
}
const semanaData = path.join(rootDir, "data/semana-dolar");
if (fs.existsSync(semanaData)) {
  fs.cpSync(semanaData, path.join(publicDir, "data/semana-dolar"), { recursive: true });
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

// Copy empresa directory if present
const empresaSrc = path.join(rootDir, "empresa");
const empresaDest = path.join(publicDir, "empresa");
if (fs.existsSync(empresaSrc)) {
  fs.cpSync(empresaSrc, empresaDest, { recursive: true });
}

// Copy fonts directory if present
const fontsSrc = path.join(rootDir, "fonts");
const fontsDest = path.join(publicDir, "fonts");
if (fs.existsSync(fontsSrc)) {
  fs.cpSync(fontsSrc, fontsDest, { recursive: true });
}

// Hash and cache-bust static assets (.css, .js, .woff2) in HTML files
const assetHashes = new Map();

function hashFile(absPath, relKey) {
  if (fs.existsSync(absPath)) {
    const content = fs.readFileSync(absPath);
    const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
    assetHashes.set(relKey, hash);
    if (!relKey.startsWith("/")) {
      assetHashes.set(`/${relKey}`, hash);
    }
  }
}

// 1. Hash fonts
const fontsDir = path.join(publicDir, "fonts");
if (fs.existsSync(fontsDir)) {
  for (const f of fs.readdirSync(fontsDir)) {
    if (f.endsWith(".woff2")) {
      hashFile(path.join(fontsDir, f), `fonts/${f}`);
    }
  }
}

// 2. Hash CSS & JS files
for (const f of fs.readdirSync(publicDir)) {
  const full = path.join(publicDir, f);
  if (fs.statSync(full).isFile() && /\.(css|js|woff2)$/i.test(f)) {
    hashFile(full, f);
  }
}

// 3. Update HTML files in publicDir with ?v=<hash>
function cacheBustHtml(content) {
  return content.replace(/\b(href|src)=(["'])([^"']+?)\2/gi, (match, attr, quote, url) => {
    if (/^(?:https?:|\/\/|data:|#|mailto:)/i.test(url)) {
      return match;
    }
    const cleanUrl = url.split("?")[0].split("#")[0];
    const hash = assetHashes.get(cleanUrl) || assetHashes.get(cleanUrl.startsWith("/") ? cleanUrl.slice(1) : `/${cleanUrl}`);
    if (hash && /\.(?:css|js|woff2)$/i.test(cleanUrl)) {
      return `${attr}=${quote}${cleanUrl}?v=${hash}${quote}`;
    }
    return match;
  });
}

function processHtmlFiles(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      processHtmlFiles(full);
    } else if (ent.isFile() && ent.name.endsWith(".html")) {
      const original = fs.readFileSync(full, "utf8");
      const updated = cacheBustHtml(original);
      if (updated !== original) {
        fs.writeFileSync(full, updated);
      }
    }
  }
}
processHtmlFiles(publicDir);

console.log("✓ Cloudflare public/ directory built successfully.");
