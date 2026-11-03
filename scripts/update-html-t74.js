import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function transformHtml(html, filename) {
  let modified = html;

  // 1. Remove Google Fonts links & preconnects
  modified = modified.replace(/<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.googleapis\.com["'][^>]*>\s*/gi, "");
  modified = modified.replace(/<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.gstatic\.com["'][^>]*>\s*/gi, "");
  modified = modified.replace(/<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/[^"']+["'][^>]*>\s*/gi, "");
  modified = modified.replace(/<noscript>\s*<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/[^"']+["'][^>]*>\s*<\/noscript>\s*/gi, "");

  // 2. Preload above-the-fold fonts (Source Serif 4 400 y Libre Franklin 600)
  const fontPreload = `  <!-- Fuentes auto-alojadas (T74) -->\n  <link rel="preload" href="/fonts/source-serif-4-400.woff2" as="font" type="font/woff2" crossorigin>\n  <link rel="preload" href="/fonts/libre-franklin-600.woff2" as="font" type="font/woff2" crossorigin>\n`;
  if (!modified.includes("source-serif-4-400.woff2")) {
    if (/<link\s+rel=["']stylesheet["']\s+href=["']\/?pd\.css["']/i.test(modified)) {
      modified = modified.replace(/(<link\s+rel=["']stylesheet["']\s+href=["']\/?pd\.css["'][^>]*>)/i, `${fontPreload}$1`);
    } else if (modified.includes("<head>")) {
      modified = modified.replace("<head>", `<head>\n${fontPreload}`);
    } else if (/<head[^>]*>/i.test(modified)) {
      modified = modified.replace(/<head[^>]*>/i, `$&\\n${fontPreload}`);
    }
  }

  // 3. Ensure meta pd-geo
  if (!/<meta\s+name=["']pd-geo["']/i.test(modified)) {
    modified = modified.replace(/<head[^>]*>/i, `$&\\n  <meta name="pd-geo" content="otro">`);
  }

  // 4. Remove AdSense script tag
  modified = modified.replace(/<script\s+async\s+src=["']https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-3342536112010915["'][^>]*>\s*<\/script>\s*/gi, "");

  // 5. Add consent.js defer if not present
  if (!modified.includes("/consent.js") && !modified.includes("consent.js")) {
    if (/<script\s+src=["']\/?auth\.js["']/i.test(modified)) {
      modified = modified.replace(/(<script\s+src=["']\/?auth\.js["'][^>]*><\/script>)/i, `<script src="/consent.js" defer></script>\n  $1`);
    } else if (modified.includes("</body>")) {
      modified = modified.replace("</body>", `  <script src="/consent.js" defer></script>\n</body>`);
    }
  }

  // 6. Add permanent Cookies link to footer if not present
  if (!modified.includes("pd-cookies-link") && !modified.includes("data-open-cookies")) {
    const privPattern = /(<a\s+href=["']\/privacidad["'][^>]*>Privacidad<\/a>)/i;
    if (privPattern.test(modified)) {
      modified = modified.replace(privPattern, `$1\n          <a href="#cookies" class="pd-cookies-link hover:text-ink transition no-underline" data-open-cookies>Cookies</a>`);
    } else if (filename === "entrar.html") {
      modified = modified.replace(/(<\/form>\s*<\/div>\s*<\/main>)/i, `<div style="margin-top:20px;text-align:center;font-size:12px;color:var(--pd-ink-soft);"><a href="/privacidad" style="color:inherit;margin:0 8px;">Privacidad</a> · <a href="#cookies" class="pd-cookies-link" data-open-cookies style="color:inherit;margin:0 8px;">Cookies</a> · <a href="/terms" style="color:inherit;margin:0 8px;">Términos</a></div>\n      $1`);
    }
  }

  return modified;
}

const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith(".html"));
for (const file of htmlFiles) {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, "utf8");
  const updated = transformHtml(content, file);
  fs.writeFileSync(filePath, updated);
  console.log(`Updated ${file}`);
}
