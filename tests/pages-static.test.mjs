import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("../", import.meta.url);
const [html, page, layout, css] = await Promise.all([
  readFile(new URL("../out/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? filesUnder(child) : [child];
  }));
  return nested.flat();
}

test("prefixes every rendered application asset for the repository subpath", async () => {
  const assets = [...html.matchAll(/(?:href|src)="(\/fieldnote-app\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.length > 5);
  assert.doesNotMatch(html, /(?:href|src)="\/(?!fieldnote-app\/)/);
  for (const asset of new Set(assets)) {
    await access(new URL(`../out/${asset.replace(/^\/fieldnote-app\//, "")}`, import.meta.url));
  }
  assert.match(layout, /NEXT_PUBLIC_BASE_PATH/);
});

test("ships fonts and assets locally without application analytics or APIs", () => {
  assert.match(html, /\/fieldnote-app\/_next\/static\/media\/[^"]+\.woff2/);
  assert.doesNotMatch(html, /(?:href|src)="https?:\/\//);
  assert.doesNotMatch(page, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\b/);
  assert.doesNotMatch(css, /url\(https?:\/\//);
});

test("preserves browser-local projects, autosave, demo, import, and export controls", () => {
  assert.match(page, /localStorage\.getItem\(LIBRARY_STORAGE_KEY\)/);
  assert.match(page, /localStorage\.setItem\(LIBRARY_STORAGE_KEY/);
  assert.match(page, /onDemo=\{createDemoProject\}/);
  assert.match(page, /Import TXT/);
  assert.match(page, /Import CSV \/ Excel/);
  assert.match(page, /accept="application\/json,\.json"/);
  for (const filename of [
    "documents.csv", "segments.csv", "annotations.csv", "codebook.csv",
    "gold_annotations_long.csv", "evaluation_instances.csv",
  ]) assert.match(page, new RegExp(filename.replace(".", "\\.")));
  assert.match(page, /Fieldnote prototype — for demonstration and testing/);
});

test("contains no research exports, backups, credentials, or secret files", async () => {
  const files = await filesUnder(new URL("../out/", import.meta.url));
  const names = files.map((file) => decodeURIComponent(file.pathname));
  const forbiddenName = /(?:\.fieldnote\.json|fieldnote[-_]?backup.*\.json|gold_annotations_long.*\.csv|evaluation_instances.*\.csv|\.(?:csv|xlsx?|xls|pem|key|p12|pfx)|\/(?:data|exports?|backups?)\/)/i;
  assert.ok(!names.some((name) => forbiddenName.test(name)));

  const textFiles = files.filter((file) => /\.(?:html|js|css|json|txt)$/i.test(file.pathname));
  const contents = (await Promise.all(textFiles.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(contents, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}/);
});
