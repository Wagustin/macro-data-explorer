import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import searchHandler from "./api/search.js";
import historicalHandler from "./api/historical.js";
import forecastHandler from "./api/forecast.js";
import interpretHandler from "./api/interpret.js";
import newsHandler from "./api/news.js";
import authHandler from "./api/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3456;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Mock response helper methods
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(data));
  };

  // Mock request query object
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Parse body for POST requests
  if (req.method === "POST") {
    let bodyData = "";
    req.on("data", chunk => { bodyData += chunk; });
    await new Promise(resolve => req.on("end", resolve));
    try {
      req.body = JSON.parse(bodyData);
    } catch (e) {
      req.body = bodyData;
    }
  }

  // --- API Routes ---
  if (pathname === "/api/search") {
    return searchHandler(req, res);
  }
  if (pathname === "/api/historical") {
    return historicalHandler(req, res);
  }
  if (pathname === "/api/forecast") {
    return forecastHandler(req, res);
  }
  if (pathname === "/api/interpret") {
    return interpretHandler(req, res);
  }
  if (pathname === "/api/news") {
    return newsHandler(req, res);
  }
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return authHandler(req, res);
  }

  // --- Clean URL mappings to HTML subpages ---
  let targetFile = null;
  if (pathname === "/" || pathname === "/index" || pathname === "/index.html") {
    targetFile = "index.html";
  } else if (pathname === "/explorer" || pathname === "/explorer.html") {
    targetFile = "explorer.html";
  } else if (pathname === "/metodologia" || pathname === "/metodologia.html") {
    targetFile = "metodologia.html";
  } else if (pathname === "/guia" || pathname === "/guia.html") {
    targetFile = "guia.html";
  } else if (pathname === "/terms" || pathname === "/terms.html") {
    targetFile = "terms.html";
  } else if (pathname === "/auth-gateway" || pathname === "/auth-gateway.html") {
    targetFile = "auth-gateway.html";
  } else {
    // Check if directly requesting an existing static file (e.g. auth.js, teleprompter.js)
    const relativePath = pathname.replace(/^\/+/, "");
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, "");
    const candidatePath = path.join(__dirname, safePath);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      targetFile = safePath;
    }
  }

  if (targetFile) {
    let filePath = path.join(process.cwd(), targetFile);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, targetFile);
    }
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        return res.end("Error loading " + targetFile + ": " + (err.message || "File not found"));
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "text/plain";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    });
    return;
  }

  // Fallback to 404.html
  let notFoundPath = path.join(process.cwd(), "404.html");
  if (!fs.existsSync(notFoundPath)) {
    notFoundPath = path.join(__dirname, "404.html");
  }
  fs.readFile(notFoundPath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 - Not Found");
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PerData running at http://localhost:${PORT}`);
});
