import assert from "node:assert/strict";
import test from "node:test";
import { buildGoldExports } from "../app/export-data.js";

const project = {
  metadataFields: [
    { id: "META_COUNTRY", name: "Country", archived: false, order: 0 },
    { id: "META_GROUP", name: "Participant group", archived: false, order: 1 },
    { id: "META_OLD", name: "Old field", archived: true, order: 2 },
  ],
  dimensions: [
    { id: "DIM_PROBLEM", name: "PROBLEM/DISRUPTION", codes: [
      { id: "COD_ECON", name: "ECONOMIC_PROBLEM", definition: "Economic harm.", origin: "A priori" },
      { id: "COD_ENV", name: "ENVIRONMENTAL_DAMAGE", definition: "Environmental harm.", origin: "Emergent" },
    ] },
    { id: "DIM_RESPONSE", name: "ACTUAL_RESPONSE", codes: [
      { id: "COD_POLICY", name: "POLICY", definition: "Policy response.", origin: "A priori" },
    ] },
    { id: "DIM_UNRESOLVED", name: "UNRESOLVED", codes: [] },
  ],
  documents: [{
    id: "DOC001",
    title: "Exact document title",
    metadata: { META_COUNTRY: "UK", META_GROUP: ["Residents", "Officials"], META_OLD: "preserved" },
    segments: [{
      id: "DOC001_P002", documentId: "DOC001", number: 2,
      text: "Exact segment text, including punctuation.",
      codeIds: ["COD_ECON", "COD_ENV"],
      notApplicableDimensionIds: ["DIM_RESPONSE"],
      confidence: "Medium", reviewStatus: "Needs review",
      memo: "Check framing.", emergingTheme: "Shared risk", touched: true,
    }],
  }],
};

test("builds human-readable long rows without mutating project data", () => {
  const before = structuredClone(project);
  const result = buildGoldExports(project);
  assert.deepEqual(project, before);
  assert.equal(result.goldAnnotationsLong.rows.length, 3);

  const [economic, environmental, notApplicable] = result.goldAnnotationsLong.rows;
  assert.deepEqual(economic.slice(0, 11), [
    "DOC001", "Exact document title", "DOC001_P002", 2,
    "Exact segment text, including punctuation.", "DIM_PROBLEM", "PROBLEM/DISRUPTION",
    "COD_ECON", "ECONOMIC_PROBLEM", "Economic harm.", "A priori",
  ]);
  assert.equal(environmental[5], "DIM_PROBLEM");
  assert.equal(environmental[8], "ENVIRONMENTAL_DAMAGE");
  assert.equal(environmental[9], "Environmental harm.");
  assert.equal(environmental[10], "Emergent");
  assert.equal(notApplicable[5], "DIM_RESPONSE");
  assert.equal(notApplicable[8], "No applicable code");
  assert.equal(notApplicable[11], "not_applicable");
  assert.equal(notApplicable[12], true);
  assert.ok(!result.goldAnnotationsLong.rows.some((row) => row[5] === "DIM_UNRESOLVED"));
  assert.deepEqual(result.goldAnnotationsLong.headers.slice(-2), ["country", "participant_group"]);
  assert.deepEqual(economic.slice(-2), ["UK", '["Residents","Officials"]']);
  assert.ok(!result.goldAnnotationsLong.headers.includes("old_field"));
  assert.match(result.goldAnnotationsLong.csv, /"Exact segment text, including punctuation\."/);
  assert.match(result.goldAnnotationsLong.csv, /"\[""Residents"",""Officials""\]"/);
});

test("groups completed judgements into evaluation instances", () => {
  const { evaluationInstances } = buildGoldExports(project);
  assert.equal(evaluationInstances.rows.length, 2);
  const coded = evaluationInstances.rows.find((row) => row[5] === "DIM_PROBLEM");
  const notApplicable = evaluationInstances.rows.find((row) => row[5] === "DIM_RESPONSE");
  assert.ok(coded);
  assert.equal(coded[7], '["COD_ECON","COD_ENV"]');
  assert.equal(coded[8], '["ECONOMIC_PROBLEM","ENVIRONMENTAL_DAMAGE"]');
  assert.equal(coded[9], "coded");
  assert.ok(notApplicable);
  assert.equal(notApplicable[7], "[]");
  assert.equal(notApplicable[8], "[]");
  assert.equal(notApplicable[9], "not_applicable");
  assert.equal(notApplicable[4], "Exact segment text, including punctuation.");
  assert.ok(!evaluationInstances.rows.some((row) => row[5] === "DIM_UNRESOLVED"));
});
