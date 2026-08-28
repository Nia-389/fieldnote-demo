import assert from "node:assert/strict";
import test from "node:test";
import starterProject from "../app/starter-project.json" with { type: "json" };

test("synthetic starter project contains the expected public demo fixture", () => {
  assert.equal(starterProject.documents.length, 5);
  const segments = starterProject.documents.flatMap((document) => document.segments);
  assert.equal(segments.length, 15);
  assert.equal(new Set(starterProject.documents.map((document) => document.id)).size, 5);
  assert.equal(new Set(segments.map((segment) => segment.id)).size, 15);
  assert.ok(segments.every((segment) => segment.emergingTheme === ""));
});
