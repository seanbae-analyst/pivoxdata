// serve.mjs — zero-dependency static server for local preview (`npm run dev`).
// The dashboard loads charts.mjs as a native ES module, which browsers refuse over file:// — so serve over HTTP.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8099;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    let file = path.resolve(ROOT, rel);
    // contain to ROOT (no path traversal). Compare with a trailing separator so
    // a sibling dir sharing ROOT's name as a prefix (…/dataready-evil) can't
    // pass a bare startsWith(ROOT) check.
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
    // Vercel serves /map as map.html (cleanUrls); do the same here
    if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`AX 트렌드 레이더 → http://localhost:${PORT}`));
