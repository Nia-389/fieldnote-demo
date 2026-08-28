import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the current Fieldnote loading shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Fieldnote — Rapid qualitative coding<\/title>/i);
  assert.match(html, /class="library-shell"/);
  assert.match(html, /class="library-loading"/);
  assert.match(html, /Opening Fieldnote…/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the loading shell tied to browser-local project initialization", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /if \(!hydrated\) return <main className="library-shell">/);
  assert.match(page, /localStorage\.getItem\(LIBRARY_STORAGE_KEY\)/);
  assert.match(page, /setHydrated\(true\)/);
  assert.match(layout, /title:\s*"Fieldnote — Rapid qualitative coding"/);
  assert.match(css, /\.library-loading/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
});
