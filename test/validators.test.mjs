// Unit tests for the build validators (build.mjs). Uses the node:test runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRoutes,
  validateAssetPaths,
  validateNoUnresolvedSlots,
} from "../build.mjs";

// A minimal, fully valid route referencing a real page fragment (src/pages/home.html).
function validHome(overrides = {}) {
  return {
    id: "home",
    path: "/",
    title: "Muhammad Arfat — Backend & secure systems",
    description: "Backend engineer building APIs, infrastructure, and security tooling.",
    canonical: "https://arfat.me/",
    priority: 1.0,
    ...overrides,
  };
}

// A second valid route referencing the real src/pages/work.html fragment.
function validWork(overrides = {}) {
  return {
    id: "work",
    path: "/work/",
    title: "Work — Muhammad Arfat",
    description: "Production work, projects, and contract pieces.",
    canonical: "https://arfat.me/work/",
    priority: 0.8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateRoutes
// ---------------------------------------------------------------------------

test("validateRoutes accepts a valid route set", () => {
  // Validates: Requirements R5.2, R5.3, R5.4, R5.5, R5.6, R5.7
  assert.doesNotThrow(() => validateRoutes([validHome(), validWork()]));
});

test("validateRoutes throws on a duplicate id", () => {
  // Validates: Requirements R5.2
  assert.throws(
    () => validateRoutes([validHome(), validHome()]),
    /duplicate route id "home"/
  );
});

test("validateRoutes throws when the page fragment is missing", () => {
  // Validates: Requirements R5.3, R8.1
  const ghost = validHome({
    id: "nonexistent-xyz",
    path: "/nonexistent-xyz/",
    canonical: "https://arfat.me/nonexistent-xyz/",
  });
  assert.throws(
    () => validateRoutes([ghost]),
    /no page fragment at src\/pages\/nonexistent-xyz\.html/
  );
});

test("validateRoutes throws on a bad path (no trailing slash)", () => {
  // Validates: Requirements R5.4
  assert.throws(
    () => validateRoutes([validWork({ path: "/work", canonical: "https://arfat.me/work" })]),
    /invalid path/
  );
});

test("validateRoutes throws on a bad path (uppercase)", () => {
  // Validates: Requirements R5.4
  assert.throws(
    () => validateRoutes([validWork({ path: "/Work/", canonical: "https://arfat.me/Work/" })]),
    /invalid path/
  );
});

test("validateRoutes throws on a canonical mismatch", () => {
  // Validates: Requirements R5.5
  assert.throws(
    () => validateRoutes([validWork({ canonical: "https://arfat.me/wrong/" })]),
    /canonical .* must equal/
  );
});

test("validateRoutes throws on priority above 1.0", () => {
  // Validates: Requirements R5.6
  assert.throws(
    () => validateRoutes([validHome({ priority: 1.5 })]),
    /priority .* must be a number in \[0\.0, 1\.0\]/
  );
});

test("validateRoutes throws on priority below 0.0", () => {
  // Validates: Requirements R5.6
  assert.throws(
    () => validateRoutes([validHome({ priority: -0.1 })]),
    /priority .* must be a number in \[0\.0, 1\.0\]/
  );
});

test("validateRoutes throws on an empty title", () => {
  // Validates: Requirements R5.7
  assert.throws(
    () => validateRoutes([validHome({ title: "" })]),
    /must have a non-empty title/
  );
});

test("validateRoutes throws on an empty description", () => {
  // Validates: Requirements R5.7
  assert.throws(
    () => validateRoutes([validHome({ description: "" })]),
    /must have a non-empty description/
  );
});

// ---------------------------------------------------------------------------
// validateAssetPaths
// ---------------------------------------------------------------------------

test("validateAssetPaths throws on a relative media src", () => {
  // Validates: Requirements R8.2, R8.3
  const html = `<img src="media/img/space.jpg" alt="">`;
  assert.throws(
    () => validateAssetPaths(html, { id: "home" }),
    /relative asset ref/
  );
});

test("validateAssetPaths throws on a relative assets href", () => {
  // Validates: Requirements R8.2, R8.3
  const html = `<link rel="stylesheet" href="assets/site.css">`;
  assert.throws(
    () => validateAssetPaths(html, { id: "home" }),
    /relative asset ref/
  );
});

test("validateAssetPaths accepts root-absolute media and assets refs", () => {
  // Validates: Requirements R8.2, R8.3
  const html = `<link rel="stylesheet" href="/assets/site.css"><img src="/media/img/space.jpg" alt="">`;
  assert.doesNotThrow(() => validateAssetPaths(html, { id: "home" }));
});

// ---------------------------------------------------------------------------
// validateNoUnresolvedSlots
// ---------------------------------------------------------------------------

test("validateNoUnresolvedSlots throws on a leftover slot token", () => {
  // Validates: Requirements R8.4
  const html = `<head><title>{{title}}</title></head>`;
  assert.throws(
    () => validateNoUnresolvedSlots(html, { id: "home" }),
    /unresolved slot\(s\)/
  );
});

test("validateNoUnresolvedSlots accepts html with no slot tokens", () => {
  // Validates: Requirements R8.4
  const html = `<head><title>resolved title</title></head>`;
  assert.doesNotThrow(() => validateNoUnresolvedSlots(html, { id: "home" }));
});
