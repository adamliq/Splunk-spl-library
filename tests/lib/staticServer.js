"use strict";
// Minimal zero-dependency static file server, used only by deep-link.test.js
// to simulate the real GitHub Pages (http/https) deployment -- as opposed to
// file://, where fetch() of custom-entries.json is blocked by the browser
// and auto-import of custom entries never runs at all.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { REPO_ROOT } = require("./paths");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** Starts a static server rooted at REPO_ROOT. Resolves to { url, close }. */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const filePath = path.join(REPO_ROOT, urlPath === "/" ? "/index.html" : urlPath);
        if (!filePath.startsWith(REPO_ROOT)) { res.writeHead(403); res.end(); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end("not found"); return; }
          const ext = path.extname(filePath);
          res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: "http://127.0.0.1:" + port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { startStaticServer };
