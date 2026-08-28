import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, css] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("separates application and current-project navigation", () => {
  const allProjects = page.indexOf('label="All projects" onClick={() => setView("projects")}');
  const projectLabel = page.indexOf('className="project-nav-label"');
  const overview = page.indexOf('label="Project overview" onClick={() => setView("dashboard")}');
  assert.ok(allProjects > -1 && projectLabel > allProjects && overview > projectLabel);
  assert.doesNotMatch(page, /label="Overview"/);
  assert.match(css, /\.project-nav-label \{[^}]*border-top:/);
});

test("reuses the existing project home without changing project context", () => {
  assert.match(page, /if \(view === "projects" \|\| !activeProjectId/);
  assert.match(page, /<ProjectHome projects=\{projects\} onOpen=\{openProject\}/);
  assert.match(page, /function openProject\(id: string\) \{/);
  assert.match(page, /setActiveProjectId\(id\); setCursor\(0\); setFullDocument\(false\); setView\("dashboard"\);/);
});

test("keeps one accessible All projects control and existing active states", () => {
  assert.equal(page.match(/label="All projects"/g)?.length, 1);
  assert.doesNotMatch(page, /className="top-actions"><button className="text-button" onClick=\{\(\) => setView\("projects"\)\}/);
  assert.match(page, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(page, /aria-label=\{label\}/);
  assert.match(page, /className="nav-icon" aria-hidden="true"/);
  assert.match(page, /active=\{view === "coding"\}/);
  assert.match(page, /active=\{view === "export"\}/);
});

test("keeps navigation reachable in the existing mobile strip", () => {
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.sidebar nav \{[^}]*display: flex;[^}]*overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.project-nav-label \{ display: none; \}/);
});
