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

test("keeps coding actions and moves segment controls into the sticky pane", () => {
  const stickyStart = page.indexOf('<div className="sticky-segment-panel"');
  const stickyEnd = page.indexOf("</section>", stickyStart);
  const railStart = page.indexOf('<aside ref={controlsRef} className="code-rail"');
  const railEnd = page.indexOf("</aside>", railStart);
  const segmentFields = page.indexOf('<div className="annotation-fields segment-fields">', stickyStart);
  assert.ok(stickyStart > -1 && segmentFields > stickyStart && segmentFields < stickyEnd);
  assert.ok(railStart > stickyEnd && railEnd > railStart);
  assert.doesNotMatch(page.slice(railStart, railEnd), /Emerging theme|>Memo |Confidence<select|Review status<select/);
  assert.doesNotMatch(page, /<label>Emerging theme/);
  assert.match(page, /← Previous/);
  assert.match(page, /Save \+ Next/);
  assert.match(page, /if \(\["INPUT", "TEXTAREA", "SELECT"\]\.includes\(target\.tagName\)\) return;/);
  assert.match(page, /if \(event\.key === "Enter"\) \{ event\.preventDefault\(\); saveAndNext\(\); \}/);
  assert.match(page, /if \(shortcut >= 1 && shortcut <= 9 && activeCodes\[shortcut - 1\]\)/);
});

test("resets coding scroll only when the stable active segment changes", () => {
  assert.match(page, /const activeSegmentId = current\?\.segment\.id;/);
  assert.match(page, /controlsRef\.current\?\.scrollTo\(\{ top: 0, behavior: "auto" \}\);/);
  assert.match(page, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\);/);
  assert.match(page, /\}, \[activeSegmentId\]\);/);
});

test("preserves legacy emerging-theme data and exports while hiding the editor", async () => {
  const exportData = await readFile(new URL("../app/export-data.js", import.meta.url), "utf8");
  assert.match(page, /emergingTheme: string/);
  assert.match(page, /segment\.emergingTheme/);
  assert.match(exportData, /segment\.emergingTheme/);
});
