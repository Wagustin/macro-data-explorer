import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import searchHandler from "./api/search.js";
import historicalHandler from "./api/historical.js";
import forecastHandler from "./api/forecast.js";
import interpretHandler from "./api/interpret.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3456;

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Mock response object with helper methods
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

  // Serve static index.html
  if (pathname === "/" || pathname === "/index.html") {
    const indexPath = path.join(__dirname, "index.html");
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        return res.end("Error loading index.html");
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MacroData Explorer running at http://localhost:${PORT}`);
});
