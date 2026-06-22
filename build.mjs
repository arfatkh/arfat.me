// build.mjs — zero-dependency MPA build for arfat.me
// Uses only the Node standard library. No node_modules, no framework.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC_DIR = path.join(__dirname, "src");
const DIST_DIR = path.join(__dirname, "dist");

/**
 * Remove and recreate the dist/ output directory so every build starts clean.
 */
function resetDist() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

/**
 * Replace every occurrence of `token` in `str` with `value`.
 * Uses split/join so the search term is treated literally (no regex escaping).
 */
function replaceAll(str, token, value) {
  return str.split(token).join(value);
}

/** Route path is "/" or folder-style: lowercase letters, digits, hyphens, and
 *  slashes, starting and ending with "/". e.g. "/work/", "/writing/intrasec/". */
const FOLDER_PATH_RE = /^\/[a-z0-9-/]+\/$/;

const SITE_ORIGIN = "https://arfat.me";

/**
 * Validate the route manifest before any output is stamped. Throws on the first
 * rule violation, naming the offending route and the rule, so the build exits
 * non-zero (see the direct-run guard at the bottom of this file).
 *
 * Rules (design.md "Validation rules"):
 *   - `id` is unique across all routes.
 *   - `src/pages/{id}.html` exists on disk.
 *   - `path` is "/" or folder-style with a trailing slash (^/[a-z0-9-/]+/$).
 *   - `canonical` equals "https://arfat.me" + `path`.
 *   - `priority` is a number in [0.0, 1.0].
 *   - `title` and `description` are non-empty strings.
 *
 * @param {Array<object>} routes  The parsed routes.json array.
 * @returns {true} when every route passes (throws otherwise).
 */
export function validateRoutes(routes) {
  if (!Array.isArray(routes)) {
    throw new Error("validateRoutes: routes must be an array");
  }

  const seenIds = new Set();
  for (const route of routes) {
    const id = route && route.id;

    // id present + unique.
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(
        `validateRoutes: route is missing a non-empty string id: ${JSON.stringify(route)}`
      );
    }
    if (seenIds.has(id)) {
      throw new Error(`validateRoutes: duplicate route id "${id}"`);
    }
    seenIds.add(id);

    // src/pages/{id}.html must exist.
    const fragmentPath = path.join(SRC_DIR, "pages", `${id}.html`);
    if (!fs.existsSync(fragmentPath)) {
      throw new Error(
        `validateRoutes: route "${id}" has no page fragment at src/pages/${id}.html`
      );
    }

    // path is "/" or folder-style with trailing slash.
    if (route.path !== "/" && !FOLDER_PATH_RE.test(route.path)) {
      throw new Error(
        `validateRoutes: route "${id}" has invalid path "${route.path}" — must be "/" or folder-style with a trailing slash`
      );
    }

    // canonical equals origin + path.
    const expectedCanonical = SITE_ORIGIN + route.path;
    if (route.canonical !== expectedCanonical) {
      throw new Error(
        `validateRoutes: route "${id}" canonical "${route.canonical}" must equal "${expectedCanonical}"`
      );
    }

    // priority is a number in [0.0, 1.0].
    if (
      typeof route.priority !== "number" ||
      Number.isNaN(route.priority) ||
      route.priority < 0 ||
      route.priority > 1
    ) {
      throw new Error(
        `validateRoutes: route "${id}" priority "${route.priority}" must be a number in [0.0, 1.0]`
      );
    }

    // title and description non-empty strings.
    if (typeof route.title !== "string" || route.title.length === 0) {
      throw new Error(`validateRoutes: route "${id}" must have a non-empty title`);
    }
    if (typeof route.description !== "string" || route.description.length === 0) {
      throw new Error(
        `validateRoutes: route "${id}" must have a non-empty description`
      );
    }

    // activeNav, when present, names the main-nav href to highlight. Optional
    // so the synthetic 404 route and unit-test routes without it still pass,
    // but when present it must be a non-empty string.
    if (route.activeNav !== undefined) {
      if (typeof route.activeNav !== "string" || route.activeNav.length === 0) {
        throw new Error(
          `validateRoutes: route "${id}" activeNav must be a non-empty string when present`
        );
      }
    }
  }

  return true;
}

/**
 * Pattern matching a relative `media/` or `assets/` reference: a `src=` or
 * `href=` attribute whose value begins with "media/" or "assets/" WITHOUT a
 * leading slash. A root-absolute ref like `src="/media/..."` has a slash before
 * the keyword and therefore does NOT match.
 *
 * Such a relative ref on a page served at `/work/` would resolve to
 * `/work/media/...` and 404, so the build must reject it.
 */
const RELATIVE_ASSET_RE = /(?:src|href)="(?:media\/|assets\/)/;

/**
 * Guard that every `media/` and `assets/` reference in an emitted document is
 * root-absolute. Throws on the first relative reference found, naming the route
 * and the offending attribute so the build exits non-zero.
 *
 * @param {string} html   The fully assembled HTML document.
 * @param {object} route  Route metadata (used for the `id` in error messages).
 * @returns {void} Returns normally only when every ref is root-absolute.
 */
export function validateAssetPaths(html, route) {
  const match = html.match(RELATIVE_ASSET_RE);
  if (match) {
    const id = route && route.id ? route.id : "unknown";
    throw new Error(
      `validateAssetPaths: relative asset ref in route "${id}": ${match[0]} — use root-absolute /media/... or /assets/...`
    );
  }
}

/**
 * Pattern matching any leftover `{{...}}` Slot token: two braces, one or more
 * non-`}` characters, then two braces. After stamping, no Slot should survive.
 */
const UNRESOLVED_SLOT_RE = /\{\{[^}]+\}\}/g;

/**
 * Guard that no `{{...}}` Slot tokens remain in an emitted document. A leftover
 * token means the Layout or a Partial references a slot name the build never
 * filled. Throws on the first document with leftovers, naming the route and the
 * offending token(s) so the build exits non-zero.
 *
 * @param {string} html   The fully assembled HTML document.
 * @param {object} route  Route metadata (used for the `id` in error messages).
 * @returns {void} Returns normally only when no `{{...}}` token remains.
 */
export function validateNoUnresolvedSlots(html, route) {
  const matches = html.match(UNRESOLVED_SLOT_RE);
  if (matches) {
    const id = route && route.id ? route.id : "unknown";
    const unique = [...new Set(matches)];
    throw new Error(
      `validateNoUnresolvedSlots: unresolved slot(s) in route "${id}": ${unique.join(", ")} — check layout/partial slot names`
    );
  }
}

/**
 * Stamp `aria-current="page"` on the single nav link whose href matches the
 * current route path exactly. Pure build-time HTML stamping — no JS in output.
 *
 * Two guarantees (correctness property P5: exactly one aria-current per page):
 *   1. Exact-match only. The needle includes the closing quote
 *      (`<a href="/"`), so `currentPath` "/" does NOT match `/work/` etc. —
 *      partial path prefixes can never be stamped.
 *   2. Exactly one stamp. `String.prototype.replace` with a literal string
 *      replaces only the first occurrence, so even if the same href appears
 *      more than once in the nav, at most one link is ever stamped.
 *
 * @param {string} navHtml      The nav partial HTML.
 * @param {string} currentPath  The route's output path, e.g. "/" or "/work/".
 * @returns {string} navHtml with aria-current="page" on the matching link.
 */
export function stampAriaCurrent(navHtml, currentPath) {
  const needle = `<a href="${currentPath}"`;
  return navHtml.replace(needle, `<a href="${currentPath}" aria-current="page"`);
}

/**
 * Inline hash back-compatibility snippet for the homepage `<head>` only.
 *
 * Old indexed URLs and bookmarks use hash fragments (e.g. `arfat.me/#work`,
 * `arfat.me/#writing-intrasec`). This snippet runs before paint and, when the
 * homepage loads with a hash matching a known old section id, redirects to the
 * corresponding clean Route path via `location.replace` (no history push, so no
 * back-button trap). Unknown hashes take no action.
 *
 * The `known` map is old-hash-id → clean Route path, mirroring routes.json
 * (e.g. `writing-intrasec` → `/writing/intrasec/`, `project-intrasec` →
 * `/projects/intrasec/`). Only same-origin relative paths from this fixed
 * allow-list are ever used, so there is no open-redirect surface.
 */
const HASH_REDIRECT_SNIPPET = `<script>
(function () {
  var known = {
    "work": "/work/",
    "writing": "/writing/",
    "writing-intrasec": "/writing/intrasec/",
    "about": "/about/",
    "now": "/now/",
    "project-intrasec": "/projects/intrasec/",
    "cv": "/cv/",
    "uses": "/uses/",
    "resources": "/resources/",
    "space": "/space/"
  };
  var h = location.hash.slice(1);
  if (h && known[h]) location.replace(known[h]);
})();
</script>`;

/**
 * Stamp one route into a full HTML document string.
 * Fills per-route SEO into the head partial, stamps the active nav link, and
 * assembles the layout by replacing the {{head}}, {{nav}}, {{content}}, and
 * {{footer}} slots.
 *
 * @param {object} route    Route metadata (title, description, canonical, path).
 * @param {string} layout   The layout.html template containing slot tokens.
 * @param {{head:string, nav:string, footer:string}} partials  Partial templates.
 * @param {string} content  The page fragment HTML for this route.
 * @returns {string} The fully assembled HTML document.
 */
export function renderPage(route, layout, partials, content) {
  // Fill SEO into the head partial (replace all occurrences of each slot).
  let head = partials.head;
  head = replaceAll(head, "{{title}}", route.title);
  head = replaceAll(head, "{{desc}}", route.description);
  head = replaceAll(head, "{{canonical}}", route.canonical);
  head = replaceAll(head, "{{ogUrl}}", route.canonical);
  head = replaceAll(head, "{{ogTitle}}", route.title);
  head = replaceAll(head, "{{ogDesc}}", route.description);

  // Per-route head extras. The hash back-compat redirect snippet ships in the
  // homepage <head> ONLY (R11.1); every other route fills the slot with "" so
  // no unresolved {{headExtra}} token survives.
  head = replaceAll(
    head,
    "{{headExtra}}",
    route.id === "home" ? HASH_REDIRECT_SNIPPET : ""
  );

  // Stamp the active nav link via aria-current. Pages whose own path is not a
  // main-nav href (e.g. /writing/intrasec/, /now/, /cv/) name the nav target to
  // highlight via route.activeNav; fall back to route.path when unset.
  const nav = stampAriaCurrent(partials.nav, route.activeNav || route.path);

  // Assemble the layout.
  let html = layout;
  html = replaceAll(html, "{{head}}", head);
  html = replaceAll(html, "{{nav}}", nav);
  html = replaceAll(html, "{{content}}", content);
  html = replaceAll(html, "{{footer}}", partials.footer);

  return html;
}

/**
 * Generate the sitemap.xml document string from the route manifest.
 *
 * One `<url>` entry per route (so every route appears exactly once as a
 * `<loc>`). For each route: `<loc>` is the route's canonical; `<lastmod>` is the
 * route's explicit `lastmod` if present, otherwise the YYYY-MM-DD date derived
 * from the mtime of `src/pages/{id}.html`; `<changefreq>` defaults to "monthly";
 * `<priority>` is the route's priority.
 *
 * @param {Array<object>} routes  The parsed routes.json array.
 * @returns {string} The sitemap.xml document as a string.
 */
export function generateSitemap(routes) {
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const route of routes) {
    const lastmod =
      route.lastmod ||
      fs
        .statSync(path.join(SRC_DIR, "pages", `${route.id}.html`))
        .mtime.toISOString()
        .slice(0, 10);
    const changefreq = route.changefreq || "monthly";

    out += "  <url>\n";
    out += `    <loc>${route.canonical}</loc>\n`;
    out += `    <lastmod>${lastmod}</lastmod>\n`;
    out += `    <changefreq>${changefreq}</changefreq>\n`;
    out += `    <priority>${route.priority}</priority>\n`;
    out += "  </url>\n";
  }

  out += "</urlset>\n";
  return out;
}

/**
 * Copy static, build-independent files into dist/ verbatim.
 *
 * Copies (each guarded by existsSync so a missing optional file never crashes
 * the build):
 *   - assets/ → dist/assets/   (recursive; site.css, site.js, fonts, img)
 *   - media/  → dist/media/    (recursive; covers favicon at media/ico/favicon.ico
 *                               and cv.pdf at media/pdf/cv.pdf)
 *   - _headers    → dist/_headers     (CSP-adjacent security + cache headers)
 *   - robots.txt  → dist/robots.txt
 *
 * Deliberately does NOT emit a `_redirects` SPA fallback rule: real files exist
 * at every route in an MPA, so no `/* /index.html 200` fallback is needed (and
 * its absence removes the "infinite loop detected and ignored" failure mode).
 * The old hand-written sitemap.xml at the repo root is NOT copied — the sitemap
 * is generated into dist/ by generateSitemap().
 *
 * @returns {void}
 */
export function copyPassthrough() {
  // Recursive directory copies. media/ covers favicon.ico and cv.pdf.
  const dirs = ["assets", "media"];
  for (const dir of dirs) {
    const src = path.join(__dirname, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(DIST_DIR, dir), { recursive: true });
    }
  }

  // Top-level files copied verbatim.
  const files = ["_headers", "robots.txt"];
  for (const file of files) {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(DIST_DIR, file));
    }
  }
}

/**
 * Emit the styled 404 document to dist/404.html.
 *
 * The 404 is rendered through the same renderPage pipeline as every route so it
 * inherits the shared chrome (head, nav, footer) and on-brand content fragment
 * at src/pages/404.html. Its synthetic route is deliberately NOT part of
 * routes.json and is NOT run through validateRoutes: its path "/404" has no
 * trailing slash by design (Cloudflare Pages serves dist/404.html with a 404
 * status for unmatched paths), which would otherwise fail the folder-style path
 * rule.
 *
 * The emitted document is still guarded by validateAssetPaths and
 * validateNoUnresolvedSlots so a stray relative asset ref or leftover slot in
 * the 404 fails the build just like any route.
 *
 * @param {string} layout   The layout.html template containing slot tokens.
 * @param {{head:string, nav:string, footer:string}} partials  Partial templates.
 * @returns {void}
 */
export function emit404(layout, partials) {
  const notFoundRoute = {
    id: "404",
    path: "/404",
    title: "Not found — Muhammad Arfat",
    description: "Page not found.",
    canonical: "https://arfat.me/404",
    priority: 0.0,
  };
  const content = fs.readFileSync(
    path.join(SRC_DIR, "pages", "404.html"),
    "utf8"
  );
  const html = renderPage(notFoundRoute, layout, partials, content);

  validateAssetPaths(html, notFoundRoute);
  validateNoUnresolvedSlots(html, notFoundRoute);

  fs.writeFileSync(path.join(DIST_DIR, "404.html"), html);
}

/**
 * Compute the dist/ output path for a route.
 * Root path "/" → dist/index.html; non-root "/x/" → dist/x/index.html.
 *
 * @param {string} routePath  The route's output path, e.g. "/" or "/work/".
 * @returns {string} Absolute filesystem path of the output document.
 */
function outputPathOf(routePath) {
  if (routePath === "/") {
    return path.join(DIST_DIR, "index.html");
  }
  // Strip leading slash so path.join keeps the segments under DIST_DIR.
  return path.join(DIST_DIR, routePath.replace(/^\//, ""), "index.html");
}

/**
 * Main build entry point. Stamps src/ into the deployable dist/ tree.
 *
 * Tracer-bullet scope: load inputs, reset dist/, then render + write one
 * folder-style document per route. Validation, sitemap, passthrough, and 404
 * are implemented in later tasks.
 */
export function build() {
  // 1. Load inputs.
  const routes = JSON.parse(
    fs.readFileSync(path.join(SRC_DIR, "routes.json"), "utf8")
  );
  const layout = fs.readFileSync(path.join(SRC_DIR, "layout.html"), "utf8");
  const partials = {
    head: fs.readFileSync(path.join(SRC_DIR, "partials", "head.html"), "utf8"),
    nav: fs.readFileSync(path.join(SRC_DIR, "partials", "nav.html"), "utf8"),
    footer: fs.readFileSync(
      path.join(SRC_DIR, "partials", "footer.html"),
      "utf8"
    ),
  };

  // 2. Validate the manifest before stamping anything.
  validateRoutes(routes);

  // 3. Reset output.
  resetDist();

  // 4. Stamp each route into a folder-style document.
  for (const route of routes) {
    const content = fs.readFileSync(
      path.join(SRC_DIR, "pages", `${route.id}.html`),
      "utf8"
    );
    const html = renderPage(route, layout, partials, content);

    validateAssetPaths(html, route);
    validateNoUnresolvedSlots(html, route);

    const outPath = outputPathOf(route.path);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
  }

  // 5. Generate the sitemap from the manifest.
  fs.writeFileSync(
    path.join(DIST_DIR, "sitemap.xml"),
    generateSitemap(routes)
  );

  // 6. Emit the styled 404 document (not part of routes.json).
  emit404(layout, partials);

  // 7. Copy static passthrough files (assets/, media/, _headers, robots.txt).
  copyPassthrough();

  console.log(`built ${routes.length} routes`);
}

// Run when executed directly (node build.mjs); exit non-zero on thrown errors.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    build();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
