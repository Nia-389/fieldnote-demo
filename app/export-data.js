const coreGoldHeaders = [
  "document_id", "document_title", "segment_id", "segment_number", "text",
  "dimension_id", "dimension_name", "code_id", "code_name", "code_definition",
  "code_origin", "annotation_type", "is_not_applicable", "confidence",
  "review_status", "memo", "emerging_theme",
];

const coreEvaluationHeaders = [
  "document_id", "document_title", "segment_id", "segment_number", "text",
  "dimension_id", "dimension_name", "gold_code_ids", "gold_code_names",
  "annotation_state", "confidence", "review_status",
];

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function metadataColumnName(field) {
  return field.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || field.id.toLowerCase();
}

function activeMetadataColumns(project, reservedHeaders) {
  const used = new Set(reservedHeaders);
  return [...(project.metadataFields ?? [])]
    .filter((field) => !field.archived)
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      const base = metadataColumnName(field);
      let header = base;
      if (used.has(header)) header = `${base}_${field.id.toLowerCase()}`;
      let suffix = 2;
      while (used.has(header)) header = `${base}_${field.id.toLowerCase()}_${suffix++}`;
      used.add(header);
      return { field, header };
    });
}

function serializeMetadataValue(value) {
  return Array.isArray(value) ? JSON.stringify(value) : value ?? "";
}

export function buildGoldExports(project) {
  const metadataColumns = activeMetadataColumns(project, [...coreGoldHeaders, ...coreEvaluationHeaders]);
  const metadataHeaders = metadataColumns.map(({ header }) => header);
  const goldHeaders = [...coreGoldHeaders, ...metadataHeaders];
  const evaluationHeaders = [...coreEvaluationHeaders, ...metadataHeaders];
  const goldRows = [];
  const evaluationRows = [];

  for (const document of project.documents) {
    const metadataValues = metadataColumns.map(({ field }) => serializeMetadataValue(document.metadata?.[field.id]));
    for (const segment of document.segments) {
      for (const dimension of project.dimensions) {
        const selectedCodes = dimension.codes.filter((code) => segment.codeIds.includes(code.id));
        const isNotApplicable = segment.notApplicableDimensionIds.includes(dimension.id) && selectedCodes.length === 0;
        if (selectedCodes.length === 0 && !isNotApplicable) continue;

        const shared = [document.id, document.title, segment.id, segment.number, segment.text, dimension.id, dimension.name];
        if (selectedCodes.length > 0) {
          for (const code of selectedCodes) {
            goldRows.push([
              ...shared, code.id, code.name, code.definition, code.origin,
              "substantive_code", false, segment.confidence, segment.reviewStatus,
              segment.memo, segment.emergingTheme, ...metadataValues,
            ]);
          }
          evaluationRows.push([
            ...shared,
            JSON.stringify(selectedCodes.map((code) => code.id)),
            JSON.stringify(selectedCodes.map((code) => code.name)),
            "coded", segment.confidence, segment.reviewStatus, ...metadataValues,
          ]);
        } else {
          goldRows.push([
            ...shared, "", "No applicable code", "", "", "not_applicable", true,
            segment.confidence, segment.reviewStatus, segment.memo,
            segment.emergingTheme, ...metadataValues,
          ]);
          evaluationRows.push([
            ...shared, "[]", "[]", "not_applicable", segment.confidence,
            segment.reviewStatus, ...metadataValues,
          ]);
        }
      }
    }
  }

  return {
    goldAnnotationsLong: { headers: goldHeaders, rows: goldRows, csv: toCsv(goldHeaders, goldRows) },
    evaluationInstances: { headers: evaluationHeaders, rows: evaluationRows, csv: toCsv(evaluationHeaders, evaluationRows) },
  };
}
