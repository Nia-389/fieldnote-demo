import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, css] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("keeps segment context sticky on desktop and stacked on narrow screens", () => {
  assert.match(page, /className="sticky-segment-panel"/);
  assert.match(css, /\.coding-layout \{[^}]*align-items: stretch;/);
  assert.match(css, /\.coding-main \{[^}]*align-self: stretch;/);
  assert.match(css, /\.sticky-segment-panel \{ position: sticky;[^}]*align-self: start;/);
  assert.doesNotMatch(css, /\.sticky-segment-panel \{[^}]*overflow-y:/);
  assert.match(css, /\.paragraph-card \{[^}]*max-height:[^}]*overflow-y: auto;/);
  assert.match(css, /@media \(max-width: 1010px\)[\s\S]*\.coding-layout \{ display: block;/);
  assert.match(css, /@media \(max-width: 1010px\)[\s\S]*\.sticky-segment-panel \{ position: static;/);
  assert.match(css, /@media \(max-width: 1010px\)[\s\S]*\.paragraph-card \{ max-height: none; overflow: visible;/);
});

test("keeps coding actions and moves qualitative controls into the right rail", () => {
  const railStart = page.indexOf('<aside className="code-rail"');
  const railEnd = page.indexOf("</aside>", railStart);
  const annotationFields = page.indexOf('<div className="annotation-fields">', railStart);
  assert.ok(railStart > -1 && annotationFields > railStart && annotationFields < railEnd);
  assert.match(page, /← Previous/);
  assert.match(page, /Save \+ Next/);
  assert.match(page, /if \(\["INPUT", "TEXTAREA", "SELECT"\]\.includes\(target\.tagName\)\) return;/);
  assert.match(page, /if \(event\.key === "Enter"\) \{ event\.preventDefault\(\); saveAndNext\(\); \}/);
  assert.match(page, /if \(shortcut >= 1 && shortcut <= 9 && activeCodes\[shortcut - 1\]\)/);
});
