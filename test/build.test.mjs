// Build assertion harness over dist/ — uses the node:test built-in runner only.
// No third-party dependency (Requirements R4.1): the build is zero-dependency,
// so its test harness is too. The before() hook runs build() once so dist/ is
// freshly generated, then loads the route manifest so property tests (P1-P6,
// appended by tasks 8.2-8.7) can iterate the real route set.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build, escapeHtml } from "../build.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const DIST_DIR = path.join(ROOT_DIR, "dist");

// Shared state populated by the before() hook for use across all tests.
/** @type {Array<object>} The parsed routes.json manifest. */
let routes;

/**
 * Compute the dist/ output path for a route path, mirroring build.mjs's
 * convention: root "/" → dist/index.html; non-root "/x/" → dist/x/index.html.
 *
 * @param {string} routePath  The route's output path, e.g. "/" or "/work/".
 * @returns {string} Absolute filesystem path of the emitted document.
 */
function outputPathOf(routePath) {
  if (routePath === "/") {
    return path.join(DIST_DIR, "index.html");
  }
  return path.join(DIST_DIR, routePath.replace(/^\//, ""), "index.html");
}

/**
 * Read the emitted HTML document for a route path as a string.
 *
 * @param {string} routePath  The route's output path, e.g. "/" or "/work/".
 * @returns {string} The emitted HTML document.
 */
function readDist(routePath) {
  return fs.readFileSync(outputPathOf(routePath), "utf8");
}

// Run the build once and load the manifest before any test executes.
before(() => {
  build();
  routes = JSON.parse(
    fs.readFileSync(path.join(SRC_DIR, "routes.json"), "utf8")
  );
});

test("build() runs and dist/ is generated", () => {
  assert.ok(fs.existsSync(DIST_DIR), "dist/ directory should exist");
  assert.ok(
    fs.existsSync(path.join(DIST_DIR, "index.html")),
    "dist/index.html should exist"
  );
  assert.ok(Array.isArray(routes) && routes.length > 0, "routes loaded");
  assert.ok(readDist("/").length > 0, "home document is non-empty");
});

// Property P1: route → output file
// Validates: Requirements R1.1, R2.1, R2.2
// For EVERY route in the manifest, the Build_System emits a Page_Document at
// the expected dist/ path (root "/" → dist/index.html; non-root "/x/" →
// dist/x/index.html). This proves one real HTML file per route exists on disk.
test("Property P1: every route has an emitted output file", () => {
  for (const route of routes) {
    const out = outputPathOf(route.path);
    assert.ok(
      fs.existsSync(out),
      `route ${route.path} should emit a file at ${path.relative(ROOT_DIR, out)}`
    );
  }
});

// Property P2: SEO uniqueness in raw HTML
// Validates: Requirements R1.2, R1.4, R1.5
// For every PAIR of distinct routes, the emitted <title> values differ, so
// each indexable document is distinguishable to search engines. And for every
// route, the emitted <link rel="canonical" href="..."> equals
// "https://arfat.me" + route.path (and the route's declared canonical),
// proving canonical correctness lives in first-pass raw HTML — no JS render.
test("Property P2: titles are unique and canonicals are correct across all docs", () => {
  /**
   * Extract the <title>...</title> text from an emitted HTML document.
   * @param {string} html
   * @returns {string|null}
   */
  const titleOf = (html) => {
    const m = html.match(/<title>([\s\S]*?)<\/title>/i);
    return m ? m[1] : null;
  };

  /**
   * Extract the <link rel="canonical" href="..."> URL from a document.
   * @param {string} html
   * @returns {string|null}
   */
  const canonicalOf = (html) => {
    const m = html.match(
      /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i
    );
    return m ? m[1] : null;
  };

  // Collect titles; the Set size must equal route count iff all are unique.
  const titles = new Set();
  for (const route of routes) {
    const html = readDist(route.path);

    const title = titleOf(html);
    assert.ok(title, `route ${route.path} should emit a <title>`);
    titles.add(title);

    const canonical = canonicalOf(html);
    assert.equal(
      canonical,
      "https://arfat.me" + route.path,
      `route ${route.path} canonical should be https://arfat.me${route.path}`
    );
    assert.equal(
      canonical,
      route.canonical,
      `route ${route.path} canonical should match its declared route.canonical`
    );
  }

  assert.equal(
    titles.size,
    routes.length,
    "all emitted <title> values should be unique across routes"
  );
});

// Property P3: sitemap completeness
// Validates: Requirements R6.2, R6.3
// For every route, its canonical URL appears EXACTLY ONCE as a <loc> entry in
// dist/sitemap.xml — so the sitemap lists each indexable route once and only
// once. The total <loc> count must also equal routes.length, proving there are
// no missing routes and no extra/duplicate entries.
test("Property P3: each route appears exactly once as a <loc> in sitemap.xml", () => {
  const sitemap = fs.readFileSync(
    path.join(DIST_DIR, "sitemap.xml"),
    "utf8"
  );

  // Extract every <loc>...</loc> value from the sitemap.
  const locEntries = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(
    (m) => m[1].trim()
  );

  for (const route of routes) {
    const count = locEntries.filter((loc) => loc === route.canonical).length;
    assert.equal(
      count,
      1,
      `route ${route.path} canonical ${route.canonical} should appear exactly once as a <loc> (found ${count})`
    );
  }

  // No missing and no extra entries: total <loc> count equals route count.
  assert.equal(
    locEntries.length,
    routes.length,
    "sitemap should contain exactly one <loc> per route (no extras)"
  );
});

// Property P4: no relative asset refs survive
// Validates: Requirements R8.2, R13.2
// For EVERY route, the emitted document contains no relative media/ or assets/
// reference — i.e. no src="media/... or href="assets/... without a leading
// slash. Root-absolute /media/ and /assets/ are fine. This mirrors the exact
// pattern build.mjs's validateAssetPaths uses, proving every served document
// references assets root-absolutely so they resolve from any folder-style URL.
// dist/404.html is checked too, since it is emitted outside routes.json.
test("Property P4: no route output retains a relative media/ or assets/ ref", () => {
  // Same pattern as RELATIVE_ASSET_RE in build.mjs's validateAssetPaths.
  const RELATIVE_ASSET_RE = /(?:src|href)="(?:media\/|assets\/)/;

  for (const route of routes) {
    const html = readDist(route.path);
    const match = html.match(RELATIVE_ASSET_RE);
    assert.equal(
      match,
      null,
      `route ${route.path} should have no relative asset ref (found ${match && match[0]})`
    );
  }

  // The styled 404 is emitted directly to dist/404.html (not via routes.json).
  const notFound = fs.readFileSync(path.join(DIST_DIR, "404.html"), "utf8");
  const match404 = notFound.match(RELATIVE_ASSET_RE);
  assert.equal(
    match404,
    null,
    `dist/404.html should have no relative asset ref (found ${match404 && match404[0]})`
  );
});

// Property P5: single active nav link
// Validates: Requirements R9.8, R10.2
// For EVERY route, the emitted document carries EXACTLY ONE nav link stamped
// with aria-current="page" — proving the build-time stampAriaCurrent marks the
// current page's link and only that link, with no JS involved. Zero would mean
// the active page is unmarked; more than one would mean ambiguous active state.
test("Property P5: each route output has exactly one aria-current=\"page\"", () => {
  for (const route of routes) {
    const html = readDist(route.path);
    // Leading whitespace = an attribute on a tag; the inlined CSS selector
    // `a[aria-current="page"]` is preceded by "[" and must not be counted.
    const count = (html.match(/\saria-current="page"/g) || []).length;
    assert.equal(
      count,
      1,
      `route ${route.path} should have exactly one aria-current="page" (found ${count})`
    );
  }
});

// Property P6: content present without JS
// Validates: Requirements R1.3, R13.1
// For EVERY route, the emitted document carries real body content inside
// <main>...</main> in the FIRST-PASS raw HTML — not an empty shell that some
// client script would fill in later. We extract the <main> inner HTML and
// assert it is substantial (well past an empty wrapper) AND contains a real
// heading element (<h1>/<h2>), proving the page's content is server-rendered
// at build time. As a stronger guarantee that the content is the route's OWN
// page fragment (not boilerplate), we lift a distinctive text snippet from
// src/pages/{route.id}.html and assert the emitted <main> contains it.
test("Property P6: every route's body content is present in raw HTML, not JS-injected", () => {
  /**
   * Extract the inner HTML of the (single) <main>...</main> block.
   * @param {string} html
   * @returns {string|null}
   */
  const mainInnerOf = (html) => {
    const m = html.match(/<main>([\s\S]*?)<\/main>/i);
    return m ? m[1] : null;
  };

  /**
   * Pull a distinctive, JS-free text snippet from a page fragment: the text
   * of its first heading (<h1> or <h2>), tags stripped and whitespace
   * collapsed. This is content that MUST appear in the raw output if the page
   * was rendered at build time rather than injected by a client script.
   * @param {string} fragment  Raw src/pages/*.html contents.
   * @returns {string|null}
   */
  const distinctiveSnippetOf = (fragment) => {
    const h = fragment.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    if (!h) return null;
    return h[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  };

  for (const route of routes) {
    const html = readDist(route.path);
    const inner = mainInnerOf(html);

    assert.ok(inner, `route ${route.path} should have a <main> block`);

    // Not an empty/near-empty shell: substantial server-rendered content.
    assert.ok(
      inner.trim().length > 100,
      `route ${route.path} <main> content should be substantial (got ${inner.trim().length} chars)`
    );

    // Real heading element present in raw HTML (content, not just markup).
    assert.match(
      inner,
      /<h[12][\s>]/i,
      `route ${route.path} <main> should contain a heading element in raw HTML`
    );

    // The content is THIS route's own fragment, present pre-JS. We compare the
    // emitted <main> against a distinctive snippet from the source fragment,
    // both whitespace-collapsed so formatting differences don't matter.
    const fragment = fs.readFileSync(
      path.join(SRC_DIR, "pages", route.id + ".html"),
      "utf8"
    );
    const snippet = distinctiveSnippetOf(fragment);
    assert.ok(
      snippet,
      `page fragment for route ${route.path} should have a heading to fingerprint`
    );
    const innerText = inner
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    assert.ok(
      innerText.includes(snippet),
      `route ${route.path} raw <main> should contain its page content "${snippet}" (proving it is not JS-injected)`
    );
  }
});

// The 404 is served at whatever URL was missing, so it must not claim a
// canonical URL and must stay out of search indexes.
test("404.html is noindex with no canonical or og:url", () => {
  const html = fs.readFileSync(path.join(DIST_DIR, "404.html"), "utf8");
  assert.ok(html.includes('<meta name="robots" content="noindex">'), "404 should be noindex");
  assert.ok(!html.includes('rel="canonical"'), "404 should have no canonical");
  assert.ok(!html.includes('property="og:url"'), "404 should have no og:url");
});

// Social cards use each page's own title/description, and the og:image the
// head points at must actually ship.
test("every route's twitter tags match its own title/description; og.png ships", () => {
  for (const route of routes) {
    const html = readDist(route.path);
    assert.ok(html.includes(`<meta name="twitter:title" content="${escapeHtml(route.title)}">`), `${route.path} twitter:title`);
    assert.ok(html.includes(`<meta name="twitter:description" content="${escapeHtml(route.description)}">`), `${route.path} twitter:description`);
  }
  assert.ok(fs.existsSync(path.join(DIST_DIR, "og.png")), "dist/og.png should exist");
});

// The shipped script is the vendored swup bundle + site.js, and every page
// references it with ?v= equal to the first 10 hex chars of its sha256, so the
// immutable /assets/* cache is always busted by a content change.
test("site.js bundle ships swup + site.js and the ?v= hash matches its content", async () => {
  const { createHash } = await import("node:crypto");
  const js = fs.readFileSync(path.join(DIST_DIR, "assets", "site.js"));
  const text = js.toString("utf8");
  assert.ok(text.includes("SwupPreloadPlugin") && text.includes("site.js — shared"), "bundle should contain swup and site.js");
  assert.ok(!/sourceMappingURL/.test(text), "bundle should not reference unshipped source maps");
  const v = createHash("sha256").update(js).digest("hex").slice(0, 10);
  for (const route of routes) {
    assert.ok(readDist(route.path).includes(`/assets/site.js?v=${v}"`), `${route.path} should load site.js?v=${v}`);
  }
});

// The CSP placeholder is always replaced, and every inline script that runs
// is covered by a hash (a missing hash = a script the browser would block).
test("dist/_headers CSP is stamped with every inline script hash", async () => {
  const { inlineScriptHashes } = await import("../build.mjs");
  const headers = fs.readFileSync(path.join(DIST_DIR, "_headers"), "utf8");
  assert.ok(!headers.includes("{{cspScriptHashes}}"), "placeholder should be replaced");
  const csp = headers.match(/Content-Security-Policy: (.*)/)[1];
  const pages = [...routes.map((r) => readDist(r.path)), fs.readFileSync(path.join(DIST_DIR, "404.html"), "utf8")];
  const needed = new Set(pages.flatMap(inlineScriptHashes));
  assert.ok(needed.size >= 1, "expected at least the homepage redirect snippet");
  for (const h of needed) assert.ok(csp.includes(h), `CSP should allow ${h}`);
  // Hashes only cover <script> blocks: inline handlers and javascript: URLs
  // would be blocked by this policy, so they must never appear.
  for (const html of pages) {
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), "no inline on*= event handlers");
    assert.ok(!/(href|src)\s*=\s*["']\s*javascript:/i.test(html), "no javascript: URLs");
  }
});

// security.txt (RFC 9116) must not be close to its Expires date. Fails 30
// days early so there's time to bump Expires (max one year out) and redeploy.
test("security.txt ships and is not within 30 days of expiring", () => {
  const txt = fs.readFileSync(path.join(DIST_DIR, ".well-known", "security.txt"), "utf8");
  assert.match(txt, /^Contact: mailto:/m);
  const expires = new Date(txt.match(/^Expires: (.+)$/m)[1]);
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  assert.ok(expires > soon, `security.txt expires ${expires.toISOString()}: bump Expires and redeploy`);
});

// Accessibility/CLS guards: every page has the skip link and its target, and
// every image declares its size so the layout doesn't shift while loading.
test("every page has a skip link target and fully dimensioned images", () => {
  for (const route of routes) {
    const html = readDist(route.path);
    assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main"|<a\b[^>]*href="#main"[^>]*class="skip-link"/, `${route.path} skip link`);
    assert.match(html, /<main\b[^>]*\bid="main"/, `${route.path} main#main`);
    for (const img of html.match(/<img [^>]*>/g) || []) {
      assert.ok(/\swidth="\d+"/.test(img) && /\sheight="\d+"/.test(img), `${route.path} img without width/height: ${img.slice(0, 80)}`);
    }
  }
  const home = readDist("/");
  assert.ok(home.includes("<title>Muhammad Arfat — Backend &amp; secure systems</title>"), "& in titles is escaped");
});
