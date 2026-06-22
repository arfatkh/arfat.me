// Unit tests for renderPage (build.mjs). Uses the node:test built-in runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../build.mjs";

const route = {
  id: "work",
  path: "/work/",
  title: "Work — Muhammad Arfat",
  description: "Selected work and projects.",
  canonical: "https://arfat.me/work/",
};

const layout = `<!doctype html><html>{{head}}<body>{{nav}}<main>{{content}}</main>{{footer}}</body></html>`;
const partials = {
  head: `<head><title>{{title}}</title><meta name="description" content="{{desc}}"><link rel="canonical" href="{{canonical}}"><meta property="og:url" content="{{ogUrl}}"><meta property="og:title" content="{{ogTitle}}"><meta property="og:description" content="{{ogDesc}}"></head>`,
  nav: `<nav><a href="/">home</a><a href="/work/">work</a></nav>`,
  footer: `<footer>© arfat</footer>`,
};

test("renderPage fills head SEO slots from the route", () => {
  const html = renderPage(route, layout, partials, "<p>content</p>");
  assert.ok(html.includes("<title>Work — Muhammad Arfat</title>"));
  assert.ok(html.includes('content="Selected work and projects."'));
  assert.ok(html.includes('href="https://arfat.me/work/"'));
  assert.ok(html.includes('content="Work — Muhammad Arfat"')); // og:title
  assert.ok(html.includes('content="Selected work and projects."')); // og:description
});

test("renderPage assembles all layout slots", () => {
  const html = renderPage(route, layout, partials, "<p>page body</p>");
  assert.ok(html.includes("<p>page body</p>"));
  assert.ok(html.includes("<nav>"));
  assert.ok(html.includes("<footer>© arfat</footer>"));
});

test("renderPage leaves no slot tokens unresolved", () => {
  const html = renderPage(route, layout, partials, "<p>x</p>");
  assert.ok(!/\{\{[a-z]+\}\}/i.test(html), "no {{...}} tokens should remain");
});

test("renderPage replaces all occurrences of a repeated slot", () => {
  const repeatedHead = `{{title}} ... {{title}}`;
  const html = renderPage(route, { head: repeatedHead, nav: "", footer: "" } && layout, { ...partials, head: repeatedHead }, "x");
  assert.ok(!html.includes("{{title}}"), "all title tokens replaced");
});
