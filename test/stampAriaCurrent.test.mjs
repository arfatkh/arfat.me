// Unit tests for stampAriaCurrent (build.mjs). Uses the node:test built-in runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampAriaCurrent } from "../build.mjs";

// Mirrors src/partials/nav.html: wordmark "/" plus a links list including "/work/".
const nav = `<nav class="site-nav" aria-label="Main navigation">
  <a href="/" class="wordmark">arfat.me</a>
  <ul class="nav-links" role="list">
    <li><a href="/">home</a></li>
    <li><a href="/writing/">writing</a></li>
    <li><a href="/work/">work</a></li>
    <li><a href="/about/">about</a></li>
  </ul>
</nav>`;

/** Count occurrences of aria-current="page" in a string. */
function countAriaCurrent(html) {
  return html.split('aria-current="page"').length - 1;
}

test("stamps exactly one link for /work/", () => {
  const out = stampAriaCurrent(nav, "/work/");
  assert.equal(countAriaCurrent(out), 1, "exactly one aria-current per page (P5)");
  assert.ok(out.includes('<a href="/work/" aria-current="page"'), "the /work/ link is stamped");
});

test("home / does not also stamp /work/ (exact match, no partial prefix)", () => {
  const out = stampAriaCurrent(nav, "/");
  assert.equal(countAriaCurrent(out), 1, "exactly one aria-current for home");
  // The stamp lands on a "/" link, never on /writing/, /work/, or /about/.
  assert.ok(!out.includes('<a href="/work/" aria-current="page"'));
  assert.ok(!out.includes('<a href="/writing/" aria-current="page"'));
  assert.ok(!out.includes('<a href="/about/" aria-current="page"'));
});

test("count of aria-current occurrences == 1 for every nav route", () => {
  for (const p of ["/", "/writing/", "/work/", "/about/"]) {
    assert.equal(countAriaCurrent(stampAriaCurrent(nav, p)), 1, `one stamp for ${p}`);
  }
});

test("stamps first link only when href repeats (e.g. wordmark + home both /)", () => {
  const out = stampAriaCurrent(nav, "/");
  // Two "/" links exist (wordmark, home); only the first is stamped.
  assert.equal(countAriaCurrent(out), 1);
  const firstIdx = out.indexOf('<a href="/" aria-current="page" class="wordmark"');
  assert.ok(firstIdx !== -1, "first matching link (wordmark) is the one stamped");
});

test("output contains no script — pure HTML stamping, no JS", () => {
  const out = stampAriaCurrent(nav, "/work/");
  assert.ok(!/<script/i.test(out), "no JS injected into nav output");
});

test("unknown path stamps nothing", () => {
  const out = stampAriaCurrent(nav, "/does-not-exist/");
  assert.equal(countAriaCurrent(out), 0, "no link matches → no stamp");
});
