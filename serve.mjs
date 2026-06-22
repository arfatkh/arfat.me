// serve.mjs — zero-dependency static file server for dist/
//
// Serves the generated dist/ tree over HTTP so you can manually verify:
//   1. Cross-document View Transitions fire (requires HTTP, not file://).
//   2. Deep-link / refresh of folder routes (e.g. /work/) returns 200,
//      mirroring Cloudflare Pages — NOT an SPA 404 fallback.
//
// Standard library only (node:http, node:fs, node:path, node:url) — no node_modules.
//
// Usage:
//   node serve.mjs              # serves dist/ on http://localhost:8787
//   PORT=3000 node serve.mjs    # custom port via env
//   node serve.mjs 3000         # custom port via argv

import { createServer } from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("./dist/", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8787);

// Content-Type map for the file kinds this site ships.
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

function contentType(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

// Resolve a URL path to a real file inside ROOT, mimicking Cloudflare Pages
// folder routing. Returns an absolute path to an existing file, or null.
function resolveFile(urlPath) {
  // Decode and strip query/hash; default to "/".
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split("?")[0].split("#")[0]) || "/";
  } catch {
    return null;
  }

  // Block path traversal: normalize and reject anything escaping ROOT.
  const safe = normalize(pathname).replace(/^(\.\.[\\/])+/, "");
  const target = join(ROOT, safe);
  if (target !== ROOT.replace(/[\\/]$/, "") && !target.startsWith(ROOT)) {
    return null;
  }

  // Exact file hit (e.g. /assets/site.css, /sitemap.xml, /favicon.ico).
  if (existsSync(target) && statSync(target).isFile()) {
    return target;
  }

  // Folder-style route: /work/ -> dist/work/index.html, / -> dist/index.html.
  if (existsSync(target) && statSync(target).isDirectory()) {
    const indexFile = join(target, "index.html");
    if (existsSync(indexFile) && statSync(indexFile).isFile()) {
      return indexFile;
    }
  }

  return null;
}

const server = createServer((req, res) => {
  const urlPath = req.url || "/";

  // Redirect "/work" -> "/work/" when the directory index exists, so deep-links
  // without a trailing slash behave like Cloudflare Pages.
  const cleanPath = urlPath.split("?")[0].split("#")[0];
  if (!cleanPath.endsWith("/") && !extname(cleanPath)) {
    let decoded;
    try {
      decoded = decodeURIComponent(cleanPath);
    } catch {
      decoded = cleanPath;
    }
    const asDir = join(ROOT, normalize(decoded).replace(/^(\.\.[\\/])+/, ""));
    if (existsSync(asDir) && statSync(asDir).isDirectory()) {
      const location = cleanPath + "/" + urlPath.slice(cleanPath.length);
      res.writeHead(301, { Location: location });
      res.end();
      return;
    }
  }

  const file = resolveFile(urlPath);

  if (file) {
    res.writeHead(200, { "Content-Type": contentType(file) });
    createReadStream(file).pipe(res);
    return;
  }

  // No matching file: serve the styled 404 with a real 404 status.
  // This deliberately does NOT fall back to index.html (no SPA soft-200).
  const notFound = join(ROOT, "404.html");
  if (existsSync(notFound)) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    createReadStream(notFound).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  if (!existsSync(ROOT)) {
    console.warn(`dist/ not found at ${ROOT} — run "npm run build" first.`);
  }
  console.log(`Serving dist/ at http://localhost:${PORT}`);
});
