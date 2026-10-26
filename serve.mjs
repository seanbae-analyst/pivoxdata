// serve.mjs — zero-dependency static server for local preview (`npm run dev`).
// The dashboard loads charts.mjs as a native ES module, which browsers refuse over file:// — so serve over HTTP.
// It answers the way Vercel does with this repo's vercel.json, so what works here works there: clean URLs (/map serves
// map.html and /map.html redirects to /map), a folder's index.html (/briefs, /briefs/), the redirects and headers listed
// in vercel.json, and 404.html for anything else. Local only (127.0.0.1; HOST overrides); dot folders (.git) and
// node_modules are never served, and a malformed address gets a 400 instead of stopping the server.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8099), HOST = process.env.HOST || "127.0.0.1";
const V = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

// vercel.json sources: "/research/:path*", "/maps", "/(.*).mjs" — a :name* is anything, a :name one segment, (…) a regex
const toRe = (src) => {
  let out = "", depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === ")") { depth += ch === "(" ? 1 : -1; out += ch; }
    else if (depth) out += ch;
    else if (ch === ":") { // "/x/:path*" also matches "/x"
      const m = /^:\w+(\*)?/.exec(src.slice(i)); i += m[0].length - 1;
      out = m[1] && out.endsWith("/") ? `${out.slice(0, -1)}(?:/.*)?` : out + (m[1] ? ".*" : "[^/]+");
    }
    else out += ch.replace(/[.+?^${}|[\]\\*]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};
const REDIRECTS = (V.redirects ?? []).map((r) => ({ re: toRe(r.source), to: r.destination, code: r.permanent === false ? 307 : 308 }));
const HEADERS = (V.headers ?? []).map((h) => ({ re: toRe(h.source), set: h.headers }));

const inside = (f) => f === ROOT || f.startsWith(ROOT + path.sep);
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

function answer(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400); return res.end("bad address"); }
  if (p.includes("\0")) { res.writeHead(400); return res.end("bad address"); }
  const go = (to, code = 308) => { res.writeHead(code, { location: to }); res.end(); };
  for (const r of REDIRECTS) if (r.re.test(p)) return go(r.to, r.code);
  if (p.endsWith(".html")) return go(p.replace(/(\/index)?\.html$/, "") || "/"); // cleanUrls
  const file = path.resolve(ROOT, "." + p);
  const hidden = path.relative(ROOT, file).split(path.sep).some((s) => s.startsWith(".") || s === "node_modules");
  const found = inside(file) && !hidden && [file, file + ".html", path.join(file, "index.html")].find(isFile);
  const headers = { "content-type": TYPES[path.extname(found || ".html")] || "application/octet-stream" };
  for (const h of HEADERS) if (h.re.test(p)) for (const { key, value } of h.set) headers[key.toLowerCase()] = value;
  if (!found) { res.writeHead(404, { "content-type": TYPES[".html"] }); return res.end(fs.readFileSync(path.join(ROOT, "404.html"))); }
  res.writeHead(200, headers);
  fs.createReadStream(found).on("error", () => res.destroy()).pipe(res);
}

http
  .createServer((req, res) => { try { answer(req, res); } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); } })
  .listen(PORT, HOST, () => console.log(`AX 트렌드 레이더 → http://localhost:${PORT}`));
