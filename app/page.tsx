"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { buildGoldExports } from "./export-data.js";
import starterProjectData from "./starter-project.json";

type View = "projects" | "dashboard" | "import" | "coding" | "metadata" | "codebook" | "review" | "analysis" | "export";
type Confidence = "High" | "Medium" | "Low";
type ReviewStatus = "Coded" | "Uncertain" | "Needs review";
type Origin = "A priori" | "Emergent";

type Code = { id: string; name: string; definition: string; origin: Origin; color: string; active: boolean };
type Dimension = { id: string; name: string; type: "single" | "multiple"; required: boolean; color: string; codes: Code[] };
type Segment = { id: string; documentId: string; number: number; text: string; codeIds: string[]; notApplicableDimensionIds: string[]; memo: string; emergingTheme: string; confidence: Confidence; reviewStatus: ReviewStatus; touched: boolean };
type MetadataFieldType = "text" | "single" | "multiple" | "date" | "number" | "boolean";
type MetadataValue = string | string[] | number | boolean | null;
type MetadataField = { id: string; name: string; type: MetadataFieldType; options: string[]; archived: boolean; order: number };
type Document = { id: string; title: string; metadata: Record<string, MetadataValue>; segments: Segment[] };
type Project = { id: string; name: string; description: string; createdAt: string; lastModified: string; schemaVersion?: number; documents: Document[]; metadataFields: MetadataField[]; dimensions: Dimension[] };
type ProjectLibrary = { format: "fieldnote-library"; version: 1; activeProjectId: string | null; projects: Project[] };
type BackupEnvelope = { format: "fieldnote-project"; version: 3; exportedAt: string; project: Project };
type ImportRow = { key: string; values: Record<string, unknown> };
type NewImportField = { name: string; type: MetadataFieldType; options: string[] };
type ImportDraft = { filename: string; headers: string[]; rows: ImportRow[]; mapping: Record<string, string>; newFields: Record<string, NewImportField> };

const LEGACY_STORAGE_KEY = "fieldnote-annotation-project-v1";
const LIBRARY_STORAGE_KEY = "fieldnote-project-library-v1";
const palette = ["#606FAF", "#7B8F87", "#9A8FBE", "#A67F70", "#718E94", "#A8BDAA"];

const starterProject = starterProjectData as Project;
const cloneStarter = () => JSON.parse(JSON.stringify(starterProject)) as Project;
const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const legacyColorMap: Record<string, string> = { "#EF8354": "#718E94", "#4C6FFF": "#9A8FBE", "#26A69A": "#7B8F87", "#9B5DE5": "#9A8FBE", "#E7A923": "#A67F70", "#E05A8D": "#A8BDAA" };
const normalizeProject = (project: Project): Project => {
  const legacy = project as Project & { documents: (Document & { source?: string; date?: string })[]; metadataFields?: MetadataField[] };
  const metadataFields = Array.isArray(legacy.metadataFields) ? legacy.metadataFields.map((field, index) => ({ ...field, options: field.options ?? [], archived: field.archived ?? false, order: field.order ?? index })) : [
    { id: "META_SOURCE", name: "Source", type: "text" as const, options: [], archived: false, order: 0 },
    { id: "META_DATE", name: "Date", type: "date" as const, options: [], archived: false, order: 1 },
  ];
  return {
    ...project,
    description: typeof project.description === "string" ? project.description : "",
    createdAt: project.createdAt || new Date().toISOString(),
    lastModified: project.lastModified || project.createdAt || new Date().toISOString(),
    schemaVersion: 3,
    metadataFields,
    dimensions: project.dimensions.map((dimension) => ({ ...dimension, required: (project.schemaVersion ?? 1) >= 2 ? (dimension.required ?? false) : ["DIM_PROTAGONIST", "DIM_HOPE"].includes(dimension.id), color: legacyColorMap[dimension.color] ?? dimension.color, codes: dimension.codes.map((code) => ({ ...code, color: legacyColorMap[code.color] ?? code.color })) })),
    documents: legacy.documents.map((document) => {
      const { source, date, ...core } = document as Document & { source?: string; date?: string };
      return { ...core, metadata: { ...(document.metadata ?? {}), ...(source !== undefined ? { META_SOURCE: source } : {}), ...(date !== undefined ? { META_DATE: date } : {}) }, segments: document.segments.map((segment) => ({ ...segment, notApplicableDimensionIds: segment.notApplicableDimensionIds ?? [] })) };
    }),
  };
};
const splitParagraphs = (text: string) => text.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s+/g, " ").trim()).filter(Boolean);
const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
const normalizedHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");
const coreFieldAliases: Record<string, string[]> = {
  "core:documentId": ["documentid", "docid", "id", "identifier"],
  "core:title": ["title", "headline", "name", "article_title"],
  "core:text": ["text", "article", "articletext", "body", "content", "fulltext", "story"],
};
const suggestMapping = (headers: string[], fields: MetadataField[]) => Object.fromEntries(headers.map((header) => {
  const normalized = normalizedHeader(header);
  const core = Object.entries(coreFieldAliases).find(([, aliases]) => aliases.map(normalizedHeader).includes(normalized))?.[0];
  const metadata = fields.find((field) => normalizedHeader(field.name) === normalized);
  return [header, core ?? (metadata ? `meta:${metadata.id}` : "")];
}));
const safeDocumentId = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").toUpperCase();
const orderedMetadataFields = (fields: MetadataField[], includeArchived = false) => fields.filter((field) => includeArchived || !field.archived).sort((a, b) => a.order - b.order);
const metadataColumnName = (field: MetadataField) => field.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || field.id.toLowerCase();
const serializeMetadataValue = (value: MetadataValue) => Array.isArray(value) ? JSON.stringify(value) : value ?? "";
const parseMetadataValue = (raw: unknown, field: Pick<MetadataField, "type">): MetadataValue => {
  const value = String(raw ?? "").trim();
  if (!value) return field.type === "multiple" ? [] : null;
  if (field.type === "multiple") return value.startsWith("[") ? (() => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [value]; } catch { return value.split(/[|;]/).map((item) => item.trim()).filter(Boolean); } })() : value.split(/[|;]/).map((item) => item.trim()).filter(Boolean);
  if (field.type === "number") { const number = Number(value); return Number.isFinite(number) ? number : null; }
  if (field.type === "boolean") return ["yes", "true", "1", "y"].includes(value.toLowerCase());
  return value;
};
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeDocument(id: string, title: string, metadata: Record<string, MetadataValue>, paragraphs: string[]): Document {
  return {
    id,
    title: title.trim() || "Untitled document",
    metadata,
    segments: paragraphs.map((text, index) => ({ id: `${id}_P${String(index + 1).padStart(3, "0")}`, documentId: id, number: index + 1, text, codeIds: [], notApplicableDimensionIds: [], memo: "", emergingTheme: "", confidence: "High", reviewStatus: "Coded", touched: false })),
  };
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [view, setView] = useState<View>("projects");
  const [cursor, setCursor] = useState(0);
  const [fullDocument, setFullDocument] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [requiredWarning, setRequiredWarning] = useState<string[]>([]);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [conflictingProject, setConflictingProject] = useState<Project | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const project = projects.find((item) => item.id === activeProjectId) ?? ({ id: "", name: "", description: "", createdAt: "", lastModified: "", schemaVersion: 3, documents: [], metadataFields: [], dimensions: [] } as Project);

  function setProject(update: Project | ((project: Project) => Project)) {
    if (!activeProjectId) return;
    setProjects((items) => items.map((item) => {
      if (item.id !== activeProjectId) return item;
      const next = typeof update === "function" ? update(item) : update;
      return { ...next, lastModified: new Date().toISOString() };
    }));
  }

  useEffect(() => {
    let loaded = false;
    const storedLibrary = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (storedLibrary) try {
      const parsed = JSON.parse(storedLibrary) as ProjectLibrary;
      if (parsed.format === "fieldnote-library" && parsed.version === 1 && Array.isArray(parsed.projects)) {
        setProjects(parsed.projects.map(normalizeProject));
        setActiveProjectId(parsed.activeProjectId && parsed.projects.some((item) => item.id === parsed.activeProjectId) ? parsed.activeProjectId : null);
        loaded = true;
      }
    } catch { /* try the legacy store */ }
    if (!loaded) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) try {
        const migrated = normalizeProject(JSON.parse(legacy));
        setProjects([migrated]);
        setActiveProjectId(migrated.id);
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ format: "fieldnote-library", version: 1, activeProjectId: migrated.id, projects: [migrated] } satisfies ProjectLibrary));
        setToast("Existing project migrated to your project library");
      } catch { /* show an empty project library */ }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      const library: ProjectLibrary = { format: "fieldnote-library", version: 1, activeProjectId, projects };
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
      setSaved(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [projects, activeProjectId, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const flatSegments = useMemo(() => project.documents.flatMap((doc) => doc.segments.map((segment) => ({ doc, segment }))), [project]);
  const current = flatSegments[Math.min(cursor, Math.max(0, flatSegments.length - 1))];
  const coded = flatSegments.filter(({ segment }) => segment.touched).length;
  const needsReview = flatSegments.filter(({ segment }) => segment.reviewStatus !== "Coded").length;
  const completion = flatSegments.length ? Math.round((coded / flatSegments.length) * 100) : 0;
  const allCodes = project.dimensions.flatMap((dimension) => dimension.codes.map((code) => ({ ...code, dimension })));

  function updateSegment(segmentId: string, patch: Partial<Segment>) {
    setProject((p) => ({ ...p, documents: p.documents.map((d) => ({ ...d, segments: d.segments.map((s) => s.id === segmentId ? { ...s, ...patch } : s) })) }));
  }

  function toggleCode(dimension: Dimension, codeId: string) {
    if (!current) return;
    const selected = current.segment.codeIds;
    let next: string[];
    if (selected.includes(codeId)) next = selected.filter((id) => id !== codeId);
    else if (dimension.type === "single") next = [...selected.filter((id) => !dimension.codes.some((code) => code.id === id)), codeId];
    else next = [...selected, codeId];
    updateSegment(current.segment.id, { codeIds: next, notApplicableDimensionIds: current.segment.notApplicableDimensionIds.filter((id) => id !== dimension.id) });
    setRequiredWarning((warnings) => warnings.filter((id) => id !== dimension.id));
  }

  function toggleNotApplicable(dimension: Dimension) {
    if (!current) return;
    const isSelected = current.segment.notApplicableDimensionIds.includes(dimension.id);
    const notApplicableDimensionIds = isSelected
      ? current.segment.notApplicableDimensionIds.filter((id) => id !== dimension.id)
      : [...current.segment.notApplicableDimensionIds, dimension.id];
    const codeIds = isSelected ? current.segment.codeIds : current.segment.codeIds.filter((id) => !dimension.codes.some((code) => code.id === id));
    updateSegment(current.segment.id, { codeIds, notApplicableDimensionIds });
    setRequiredWarning((warnings) => warnings.filter((id) => id !== dimension.id));
  }

  function saveAndNext() {
    if (!current) return;
    const unresolved = project.dimensions.filter((dimension) => dimension.required && !current.segment.notApplicableDimensionIds.includes(dimension.id) && !current.segment.codeIds.some((id) => dimension.codes.some((code) => code.id === id)));
    if (unresolved.length) {
      setRequiredWarning(unresolved.map((dimension) => dimension.id));
      setToast(`${unresolved.map((dimension) => dimension.name).join(", ")} ${unresolved.length === 1 ? "needs" : "need"} attention`);
      return;
    }
    setRequiredWarning([]);
    updateSegment(current.segment.id, { touched: true });
    setSaved(true);
    if (cursor < flatSegments.length - 1) setCursor((c) => c + 1);
    else { setToast("Corpus complete — every paragraph has been visited."); setView("dashboard"); }
  }

  function handleAppKey(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (view !== "coding" || fullDocument || !current) return;
    if (event.key === "Enter") { event.preventDefault(); saveAndNext(); }
    const shortcut = Number(event.key);
    const activeCodes = project.dimensions.flatMap((dimension) => dimension.codes.filter((code) => code.active).map((code) => ({ code, dimension })));
    if (shortcut >= 1 && shortcut <= 9 && activeCodes[shortcut - 1]) {
      event.preventDefault();
      toggleCode(activeCodes[shortcut - 1].dimension, activeCodes[shortcut - 1].code.id);
    }
  }

  function goToSegment(id: string) {
    const index = flatSegments.findIndex(({ segment }) => segment.id === id);
    if (index >= 0) { setCursor(index); setFullDocument(false); setView("coding"); }
  }

  function openProject(id: string) {
    setActiveProjectId(id); setCursor(0); setFullDocument(false); setView("dashboard");
  }

  function createBlankProject(name: string, description: string) {
    const now = new Date().toISOString();
    const blank: Project = { id: makeId("PRJ"), name: name.trim(), description: description.trim(), createdAt: now, lastModified: now, schemaVersion: 3, documents: [], metadataFields: [], dimensions: [] };
    setProjects((items) => [...items, blank]); setActiveProjectId(blank.id); setCursor(0); setNewProjectOpen(false); setView("import"); setToast("Project created");
  }

  function createDemoProject() {
    const demo = cloneStarter();
    const now = new Date().toISOString();
    demo.id = makeId("PRJ"); demo.createdAt = now; demo.lastModified = now;
    demo.name = projects.some((item) => item.name === demo.name) ? `${demo.name} (demo)` : demo.name;
    setProjects((items) => [...items, demo]); openProject(demo.id); setToast("Demo project added");
  }

  function deleteProject() {
    if (!deleteProjectId) return;
    setProjects((items) => items.filter((item) => item.id !== deleteProjectId));
    if (activeProjectId === deleteProjectId) setActiveProjectId(null);
    setDeleteProjectId(null); setToast("Project deleted");
  }

  function addDimension() {
    const id = makeId("DIM");
    setProject((p) => ({ ...p, dimensions: [...p.dimensions, { id, name: "NEW DIMENSION", type: "single", required: false, color: palette[p.dimensions.length % palette.length], codes: [] }] }));
  }

  function patchDimension(id: string, patch: Partial<Dimension>) {
    setProject((p) => ({ ...p, dimensions: p.dimensions.map((d) => d.id === id ? { ...d, ...patch } : d) }));
  }

  function addCode(dimensionId: string, suggestedName = "New code") {
    const id = makeId("COD");
    setProject((p) => ({ ...p, dimensions: p.dimensions.map((d) => d.id === dimensionId ? { ...d, codes: [...d.codes, { id, name: suggestedName, definition: "", origin: "Emergent", color: d.color, active: true }] } : d) }));
    setToast(`Added “${suggestedName}”`);
  }

  function patchCode(dimensionId: string, codeId: string, patch: Partial<Code>) {
    setProject((p) => ({ ...p, dimensions: p.dimensions.map((d) => d.id === dimensionId ? { ...d, codes: d.codes.map((c) => c.id === codeId ? { ...c, ...patch } : c) } : d) }));
  }

  function addMetadataField(field?: NewImportField) {
    const id = makeId("META");
    setProject((p) => ({ ...p, metadataFields: [...p.metadataFields, { id, name: field?.name || "New variable", type: field?.type || "text", options: field?.options || [], archived: false, order: p.metadataFields.length }] }));
  }

  function patchMetadataField(id: string, patch: Partial<MetadataField>) {
    setProject((p) => ({ ...p, metadataFields: p.metadataFields.map((field) => field.id === id ? { ...field, ...patch } : field) }));
  }

  function moveMetadataField(id: string, direction: -1 | 1) {
    setProject((p) => {
      const fields = orderedMetadataFields(p.metadataFields, true);
      const index = fields.findIndex((field) => field.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= fields.length) return p;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...p, metadataFields: fields.map((field, order) => ({ ...field, order })) };
    });
  }

  function addDocument(title: string, metadata: Record<string, MetadataValue>, text: string) {
    const paragraphs = splitParagraphs(text);
    if (!paragraphs.length) { setToast("Add at least one paragraph."); return false; }
    const sequence = project.documents.length + 1;
    const id = `DOC${String(sequence).padStart(3, "0")}`;
    const doc: Document = makeDocument(id, title, metadata, paragraphs);
    setProject((p) => ({ ...p, documents: [...p.documents, doc] }));
    setToast(`Imported ${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}`);
    return true;
  }

  function updateDocument(documentId: string, title: string, metadata: Record<string, MetadataValue>, text: string) {
    const paragraphs = splitParagraphs(text);
    if (!paragraphs.length) { setToast("Add at least one paragraph."); return false; }
    setProject((p) => ({ ...p, documents: p.documents.map((document) => {
      if (document.id !== documentId) return document;
      const fresh = makeDocument(document.id, title, {}, paragraphs);
      return { ...document, title: title.trim() || "Untitled document", metadata: { ...document.metadata, ...metadata }, segments: paragraphs.map((paragraph, index) => document.segments[index] ? { ...document.segments[index], text: paragraph, number: index + 1 } : fresh.segments[index]) };
    }) }));
    setToast("Document updated"); return true;
  }

  function addDocuments(documents: Document[], newFields: MetadataField[] = []) {
    setProject((p) => ({ ...p, metadataFields: [...p.metadataFields, ...newFields], documents: [...p.documents, ...documents] }));
    setToast(`Imported ${documents.length} document${documents.length === 1 ? "" : "s"}`);
  }

  function exportBackup(item = project) {
    const envelope: BackupEnvelope = { format: "fieldnote-project", version: 3, exportedAt: new Date().toISOString(), project: item };
    download(`${item.name.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "fieldnote-project"}-backup.json`, JSON.stringify(envelope, null, 2), "application/json");
  }

  function validateBackup(value: unknown): Project {
    if (!value || typeof value !== "object") throw new Error("Invalid file");
    const candidate = value as Partial<BackupEnvelope> & Partial<Project>;
    if (candidate.format === "fieldnote-project") {
      if (![2, 3].includes(candidate.version ?? 0) || !candidate.project) throw new Error("Unsupported Fieldnote backup version");
      return validateBackup(candidate.project);
    }
    if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.name !== "string" || !Array.isArray(candidate.documents) || !Array.isArray(candidate.dimensions)) throw new Error("Missing project data");
    if ((candidate.schemaVersion ?? 1) > 3) throw new Error("This backup was created by a newer version of Fieldnote");
    for (const document of candidate.documents as Document[]) {
      if (!document || typeof document.id !== "string" || !Array.isArray(document.segments)) throw new Error("Invalid document data");
      if (document.segments.some((segment) => !segment || typeof segment.id !== "string" || typeof segment.text !== "string")) throw new Error("Invalid segment data");
    }
    for (const dimension of candidate.dimensions as Dimension[]) {
      if (!dimension || typeof dimension.id !== "string" || !Array.isArray(dimension.codes)) throw new Error("Invalid codebook data");
    }
    return normalizeProject(candidate as Project);
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const imported = validateBackup(JSON.parse(text));
        if (projects.some((item) => item.id === imported.id)) setConflictingProject(imported);
        else { setProjects((items) => [...items, imported]); openProject(imported.id); setToast("Project imported"); }
      } catch (error) { setToast(error instanceof Error ? error.message : "That file is not a valid Fieldnote backup."); }
    });
    event.target.value = "";
  }

  function resolveConflict(action: "replace" | "copy" | "cancel") {
    if (!conflictingProject || action === "cancel") { setConflictingProject(null); return; }
    if (action === "replace") {
      setProjects((items) => items.map((item) => item.id === conflictingProject.id ? conflictingProject : item));
      openProject(conflictingProject.id); setToast("Existing project replaced");
    } else {
      const copy = { ...conflictingProject, id: makeId("PRJ"), name: `${conflictingProject.name} (copy)`, lastModified: new Date().toISOString() };
      setProjects((items) => [...items, copy]); openProject(copy.id); setToast("Project imported as a copy");
    }
    setConflictingProject(null);
  }

  function exportCSVs() {
    const exportFields = orderedMetadataFields(project.metadataFields);
    const usedHeaders = new Set<string>();
    const metadataHeaders = exportFields.map((field) => { const base = metadataColumnName(field); const header = usedHeaders.has(base) ? `${base}_${field.id.toLowerCase()}` : base; usedHeaders.add(header); return header; });
    const documents = csv(["document_id", "title", ...metadataHeaders], project.documents.map((d) => [d.id, d.title, ...exportFields.map((field) => serializeMetadataValue(d.metadata[field.id]))]));
    const segments = csv(["segment_id", "document_id", "segment_number", "text", "coding_status", "review_status", "confidence", "memo", "emerging_theme", "unresolved_dimension_ids", "not_applicable_dimension_ids"], flatSegments.map(({ segment }) => {
      const unresolved = project.dimensions.filter((dimension) => !segment.notApplicableDimensionIds.includes(dimension.id) && !segment.codeIds.some((id) => dimension.codes.some((code) => code.id === id))).map((dimension) => dimension.id);
      return [segment.id, segment.documentId, segment.number, segment.text, segment.touched ? "coded" : "not_yet_coded", segment.reviewStatus, segment.confidence, segment.memo, segment.emergingTheme, unresolved.join("|"), segment.notApplicableDimensionIds.join("|")];
    }));
    const substantiveRows = flatSegments.flatMap(({ segment }) => segment.codeIds.map((codeId, index) => {
      const found = allCodes.find((c) => c.id === codeId);
      return [`ANN_${segment.id}_${String(index + 1).padStart(2, "0")}`, segment.id, found?.dimension.id, found?.dimension.name, found?.id, found?.name, found?.origin, "substantive_code", false, segment.confidence, segment.memo, segment.emergingTheme, segment.reviewStatus];
    }));
    const notApplicableRows = flatSegments.flatMap(({ segment }) => segment.notApplicableDimensionIds.map((dimensionId, index) => {
      const dimension = project.dimensions.find((item) => item.id === dimensionId);
      return [`ANN_${segment.id}_NA_${String(index + 1).padStart(2, "0")}`, segment.id, dimensionId, dimension?.name, "", "No applicable code", "", "not_applicable", true, segment.confidence, segment.memo, segment.emergingTheme, segment.reviewStatus];
    }));
    const annotations = csv(["annotation_id", "segment_id", "dimension_id", "dimension_name", "code_id", "code_name", "code_origin", "annotation_type", "is_not_applicable", "confidence", "memo", "emerging_theme", "review_status"], [...substantiveRows, ...notApplicableRows]);
    const codebookRows = project.dimensions.flatMap((dimension) => dimension.codes.length ? dimension.codes.map((code) => [dimension.id, dimension.name, dimension.type, dimension.required, code.id, code.name, code.definition, code.origin, code.active]) : [[dimension.id, dimension.name, dimension.type, dimension.required, "", "", "", "", ""]]);
    const codebook = csv(["dimension_id", "dimension_name", "dimension_type", "dimension_required", "code_id", "code_name", "code_definition", "origin", "active"], codebookRows);
    download("documents.csv", documents); download("segments.csv", segments); download("annotations.csv", annotations); download("codebook.csv", codebook);
    setToast("Four CSV files downloaded");
  }

  function exportGoldCSVs() {
    const { goldAnnotationsLong, evaluationInstances } = buildGoldExports(project);
    download("gold_annotations_long.csv", goldAnnotationsLong.csv);
    download("evaluation_instances.csv", evaluationInstances.csv);
    setToast("Two gold-standard CSV files downloaded");
  }

  if (!hydrated) return <main className="library-shell"><div className="library-loading">Opening Fieldnote…</div></main>;

  if (view === "projects" || !activeProjectId || !projects.some((item) => item.id === activeProjectId)) return <>
    <ProjectHome projects={projects} onOpen={openProject} onNew={() => setNewProjectOpen(true)} onDemo={createDemoProject} onDelete={setDeleteProjectId} onExport={exportBackup} onImport={() => fileInput.current?.click()} />
    <input ref={fileInput} type="file" accept="application/json,.json" onChange={importBackup} hidden />
    {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} onCreate={createBlankProject} />}
    {deleteProjectId && <ConfirmDialog title="Delete this project?" body="This permanently removes the local copy from this browser. Export a backup first if you may need it later." confirmLabel="Delete project" danger onCancel={() => setDeleteProjectId(null)} onConfirm={deleteProject} />}
    {conflictingProject && <ConflictDialog project={conflictingProject} onResolve={resolveConflict} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </>;

  return (
    <main className="app-shell" onKeyDown={handleAppKey} tabIndex={-1}>
      <aside className="sidebar">
        <div className="brand" onClick={() => setView("dashboard")}><span className="brand-mark">F</span><span>fieldnote</span></div>
        <nav aria-label="Primary navigation">
          <NavButton active={false} icon="⌂" label="All projects" onClick={() => setView("projects")} />
          <div className="project-nav-label" aria-hidden="true">PROJECT</div>
          <NavButton active={view === "dashboard"} icon="▱" label="Project overview" onClick={() => setView("dashboard")} />
          <NavButton active={view === "coding"} icon="✎" label="Code segments" onClick={() => setView("coding")} />
          <NavButton active={view === "import"} icon="＋" label="Documents" onClick={() => setView("import")} />
          <NavButton active={view === "metadata"} icon="≡" label="Metadata" onClick={() => setView("metadata")} />
          <NavButton active={view === "codebook"} icon="▦" label="Codebook" onClick={() => setView("codebook")} />
          <NavButton active={view === "review"} icon="◇" label="Review" onClick={() => setView("review")} badge={needsReview || undefined} />
          <NavButton active={view === "analysis"} icon="↗" label="Analysis" onClick={() => setView("analysis")} />
          <NavButton active={view === "export"} icon="↓" label="Export" onClick={() => setView("export")} />
        </nav>
        <div className="sidebar-foot">
          <span className={`save-dot ${saved ? "" : "saving"}`} /> {saved ? "Saved locally" : "Saving…"}
          <small>Private to this browser</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="project-name"><span className="eyebrow">PROJECT</span><input aria-label="Project name" value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} /></div>
          <div className="top-actions"><button className="text-button" onClick={() => setView("import")}>Add document</button><button className="avatar" title="Local researcher">R</button></div>
        </header>

        {view === "dashboard" && <Dashboard project={project} flatSegments={flatSegments} coded={coded} needsReview={needsReview} completion={completion} onContinue={() => setView("coding")} onView={setView} onCreate={() => setNewProjectOpen(true)} />}
        {view === "import" && <ImportView documents={project.documents} metadataFields={project.metadataFields} addDocument={addDocument} updateDocument={updateDocument} addDocuments={addDocuments} onOpen={goToSegment} />}
        {view === "metadata" && <MetadataView fields={project.metadataFields} onAdd={addMetadataField} onPatch={patchMetadataField} onMove={moveMetadataField} />}
        {view === "coding" && <CodingView current={current} cursor={cursor} flatSegments={flatSegments} dimensions={project.dimensions} metadataFields={project.metadataFields} fullDocument={fullDocument} setFullDocument={setFullDocument} setCursor={setCursor} toggleCode={toggleCode} toggleNotApplicable={toggleNotApplicable} updateSegment={updateSegment} saveAndNext={saveAndNext} addCode={addCode} goToSegment={goToSegment} requiredWarning={requiredWarning} />}
        {view === "codebook" && <CodebookView dimensions={project.dimensions} addDimension={addDimension} patchDimension={patchDimension} addCode={addCode} patchCode={patchCode} />}
        {view === "review" && <ReviewView segments={flatSegments} onOpen={goToSegment} />}
        {view === "analysis" && <AnalysisView dimensions={project.dimensions} segments={flatSegments} />}
        {view === "export" && <ExportView exportCSVs={exportCSVs} exportGoldCSVs={exportGoldCSVs} onBackup={() => exportBackup()} importBackup={importBackup} fileInput={fileInput} />}
      </section>
      {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} onCreate={createBlankProject} />}
      {conflictingProject && <ConflictDialog project={conflictingProject} onResolve={resolveConflict} />}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function ProjectHome({ projects, onOpen, onNew, onDemo, onDelete, onExport, onImport }: { projects: Project[]; onOpen: (id: string) => void; onNew: () => void; onDemo: () => void; onDelete: (id: string) => void; onExport: (project: Project) => void; onImport: () => void }) {
  return <main className="library-shell">
    <header className="library-header"><div className="brand static"><span className="brand-mark">F</span><span>fieldnote</span></div><div><button className="secondary-button compact" onClick={onImport}>Open project file</button><button className="primary-button compact" onClick={onNew}>＋ New project</button></div></header>
    <section className="library-content"><div className="library-intro"><p className="kicker">LOCAL RESEARCH WORKSPACE</p><h1>Your projects</h1><p>Each project keeps its own documents, codebook, annotations, memos, and progress in this browser.</p></div>
      <div className="prototype-notice"><span>i</span><p><b>Fieldnote prototype — for demonstration and testing.</b> Project data are stored locally in this browser and are not saved to a central server. Export a project backup if you want to keep your work.</p></div>
      {projects.length ? <div className="project-grid">{[...projects].sort((a, b) => b.lastModified.localeCompare(a.lastModified)).map((project) => {
        const segments = project.documents.flatMap((document) => document.segments);
        const coded = segments.filter((segment) => segment.touched).length;
        const percent = segments.length ? Math.round(coded / segments.length * 100) : 0;
        return <article className="project-card" key={project.id}><button className="project-card-main" onClick={() => onOpen(project.id)}><span className="project-card-icon">⌑</span><span><small>UPDATED {formatDate(project.lastModified)}</small><h2>{project.name}</h2><p>{project.description || "No description"}</p></span><span className="project-progress"><b>{percent}%</b><i><em style={{ width: `${percent}%` }} /></i></span></button><footer><span>{project.documents.length} document{project.documents.length === 1 ? "" : "s"} · {coded}/{segments.length} paragraphs coded</span><div><button onClick={() => onExport(project)}>Backup</button><button className="danger-link" onClick={() => onDelete(project.id)}>Delete</button></div></footer></article>;
      })}</div> : <div className="library-empty"><span>⌑</span><h2>Start your first research project</h2><p>Create an empty workspace, open a Fieldnote project file, or explore the included example.</p><div><button className="primary-button" onClick={onNew}>Create a project</button><button className="secondary-button" onClick={onDemo}>Load demo project</button></div></div>}
      {projects.length > 0 && <button className="demo-link" onClick={onDemo}>＋ Add a fresh copy of the demo project</button>}
    </section>
  </main>;
}

function NewProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, description: string) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title"><p className="kicker">NEW WORKSPACE</p><h2 id="new-project-title">Create a project</h2><p>Start with an empty corpus and codebook. You can import documents next.</p><label>Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Community health interviews" /></label><label>Description <span>optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you studying?" /></label><footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim()} onClick={() => onCreate(name, description)}>Create project</button></footer></section></div>;
}

function ConfirmDialog({ title, body, confirmLabel, danger, onCancel, onConfirm }: { title: string; body: string; confirmLabel: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop"><section className="dialog compact-dialog" role="alertdialog" aria-modal="true"><h2>{title}</h2><p>{body}</p><footer><button className="secondary-button" onClick={onCancel}>Cancel</button><button className={danger ? "danger-button" : "primary-button"} onClick={onConfirm}>{confirmLabel}</button></footer></section></div>;
}

function ConflictDialog({ project, onResolve }: { project: Project; onResolve: (action: "replace" | "copy" | "cancel") => void }) {
  return <div className="dialog-backdrop"><section className="dialog conflict-dialog" role="dialog" aria-modal="true"><p className="kicker">DUPLICATE PROJECT ID</p><h2>“{project.name}” already exists</h2><p>Choose whether to replace the local project or keep both as independent copies.</p><div className="conflict-options"><button onClick={() => onResolve("replace")}><b>Replace existing</b><span>Overwrite the project with ID {project.id}.</span></button><button onClick={() => onResolve("copy")}><b>Import as a copy</b><span>Create a new project ID and preserve the existing project.</span></button></div><footer><button className="secondary-button" onClick={() => onResolve("cancel")}>Cancel</button></footer></section></div>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }

function NavButton({ active, icon, label, onClick, badge }: { active: boolean; icon: string; label: string; onClick: () => void; badge?: number }) {
  return <button className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} aria-label={label} onClick={onClick}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>{badge ? <b>{badge}</b> : null}</button>;
}

function Dashboard({ project, flatSegments, coded, needsReview, completion, onContinue, onView, onCreate }: { project: Project; flatSegments: { doc: Document; segment: Segment }[]; coded: number; needsReview: number; completion: number; onContinue: () => void; onView: (v: View) => void; onCreate: () => void }) {
  const lastTouched = [...flatSegments].reverse().find(({ segment }) => segment.touched);
  return <div className="page dashboard-page">
    <div className="page-heading dashboard-heading"><div><p className="kicker">RESEARCH WORKSPACE</p><h1>Good afternoon.</h1><p>Your corpus is ready when you are.</p></div><button className="secondary-button" onClick={onCreate}>New project</button></div>
    <div className="hero-grid">
      <section className="progress-card">
        <div className="progress-copy"><div className="progress-ring" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties}><span>{completion}<small>%</small></span></div><div><span className="eyebrow">CODING PROGRESS</span><h2>{coded} of {flatSegments.length} paragraphs coded</h2><p>{flatSegments.length - coded} remaining across {project.documents.length} documents</p></div></div>
        <button className="primary-button" onClick={onContinue}>{coded ? "Continue coding" : "Start coding"}<span>→</span></button>
      </section>
      <section className="review-card"><span className="eyebrow">ATTENTION</span><strong>{needsReview}</strong><h3>Paragraphs to review</h3><p>Uncertain or flagged for a second look.</p><button className="link-button" onClick={() => onView("review")}>Review cases →</button></section>
    </div>
    <div className="metric-grid">
      <Metric label="Documents" value={project.documents.length} note="in this corpus" />
      <Metric label="Paragraphs" value={flatSegments.length} note="total segments" />
      <Metric label="Coded" value={coded} note={`${completion}% complete`} accent />
      <Metric label="Uncoded" value={flatSegments.length - coded} note="remaining" />
    </div>
    <div className="dashboard-lower">
      <section className="activity-panel"><div className="section-title"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent activity</h2></div></div>{lastTouched ? <button className="activity-row" onClick={onContinue}><span className="document-glyph">≡</span><span><b>{lastTouched.doc.title}</b><small>{lastTouched.segment.id} · {lastTouched.segment.codeIds.length} codes applied</small></span><time>Continue →</time></button> : <p className="empty-copy">No segments coded yet.</p>}</section>
      <section className="quick-panel"><span className="eyebrow">QUICK ACTIONS</span><button onClick={() => onView("import")}><span>＋</span> Import documents</button><button onClick={() => onView("codebook")}><span>▦</span> Edit codebook</button><button onClick={() => onView("export")}><span>↓</span> Export data</button></section>
    </div>
  </div>;
}

function Metric({ label, value, note, accent }: { label: string; value: number; note: string; accent?: boolean }) { return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }

function ImportView({ documents, metadataFields, addDocument, updateDocument, addDocuments, onOpen }: { documents: Document[]; metadataFields: MetadataField[]; addDocument: (title: string, metadata: Record<string, MetadataValue>, text: string) => boolean; updateDocument: (id: string, title: string, metadata: Record<string, MetadataValue>, text: string) => boolean; addDocuments: (documents: Document[], fields?: MetadataField[]) => void; onOpen: (id: string) => void }) {
  const activeFields = orderedMetadataFields(metadataFields);
  const [title, setTitle] = useState(""); const [text, setText] = useState(""); const [metadata, setMetadata] = useState<Record<string, MetadataValue>>({}); const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null); const [previewKey, setPreviewKey] = useState(""); const [paragraphOverrides, setParagraphOverrides] = useState<Record<string, string[]>>({});
  function resetForm() { setTitle(""); setText(""); setMetadata({}); setEditingId(null); }
  function submit() { const success = editingId ? updateDocument(editingId, title, metadata, text) : addDocument(title, metadata, text); if (success) resetForm(); }
  function editDocument(document: Document) { setEditingId(document.id); setTitle(document.title); setMetadata(document.metadata); setText(document.segments.map((segment) => segment.text).join("\n\n")); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function loadTxt(event: ChangeEvent<HTMLInputElement>) { Array.from(event.target.files ?? []).forEach((file) => file.text().then((content) => addDocument(file.name.replace(/\.txt$/i, ""), {}, content))); event.target.value = ""; }
  function inferField(header: string, rows: ImportRow[]): NewImportField {
    const values = rows.map((row) => String(row.values[header] ?? "").trim()).filter(Boolean); const lower = values.map((value) => value.toLowerCase());
    if (/date|year|published/i.test(header)) return { name: humanizeHeader(header), type: "date", options: [] };
    if (values.length && values.every((value) => Number.isFinite(Number(value)))) return { name: humanizeHeader(header), type: "number", options: [] };
    if (values.length && lower.every((value) => ["yes", "no", "true", "false", "0", "1", "y", "n"].includes(value))) return { name: humanizeHeader(header), type: "boolean", options: [] };
    if (values.some((value) => /[|;]/.test(value))) { const options = Array.from(new Set(values.flatMap((value) => value.split(/[|;]/).map((item) => item.trim()).filter(Boolean)))); return { name: humanizeHeader(header), type: "multiple", options }; }
    const unique = Array.from(new Set(values)); if (unique.length > 1 && unique.length <= 20 && (/country|category|type|condition|language|group|status/i.test(header) || unique.length <= Math.max(3, values.length * .6))) return { name: humanizeHeader(header), type: "single", options: unique };
    return { name: humanizeHeader(header), type: "text", options: [] };
  }
  async function loadSpreadsheet(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true }); const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false }); const headers = records.length ? Object.keys(records[0]) : []; const rows = records.map((values, index) => ({ key: `ROW_${index + 1}`, values }));
    setDraft({ filename: file.name, headers, rows, mapping: suggestMapping(headers, metadataFields), newFields: {} }); setPreviewKey(rows[0]?.key ?? ""); setParagraphOverrides({}); event.target.value = "";
  }
  function mapColumn(header: string, target: string) { if (!draft) return; const newFields = { ...draft.newFields }; if (target === "__new__") { newFields[header] = inferField(header, draft.rows); target = `new:${header}`; } else if (!target.startsWith("new:")) delete newFields[header]; setDraft({ ...draft, mapping: { ...draft.mapping, [header]: target }, newFields }); }
  function patchNewField(header: string, patch: Partial<NewImportField>) { if (!draft?.newFields[header]) return; setDraft({ ...draft, newFields: { ...draft.newFields, [header]: { ...draft.newFields[header], ...patch } } }); }
  function headerFor(target: string) { return draft?.headers.find((header) => draft.mapping[header] === target) ?? ""; }
  function valueFor(row: ImportRow, target: string) { const header = headerFor(target); return header ? String(row.values[header] ?? "") : ""; }
  function paragraphsFor(row: ImportRow) { return paragraphOverrides[row.key] ?? splitParagraphs(valueFor(row, "core:text")); }
  function mergeParagraph(row: ImportRow, index: number) { const paragraphs = paragraphsFor(row); if (index >= paragraphs.length - 1) return; setParagraphOverrides({ ...paragraphOverrides, [row.key]: [...paragraphs.slice(0, index), `${paragraphs[index]} ${paragraphs[index + 1]}`, ...paragraphs.slice(index + 2)] }); }
  function confirmBulkImport() {
    if (!draft || !headerFor("core:text")) return; const newFieldMap = new Map<string, MetadataField>(); const offset = metadataFields.length;
    Object.entries(draft.newFields).forEach(([header, field], index) => newFieldMap.set(header, { id: makeId("META"), ...field, archived: false, order: offset + index }));
    const usedIds = new Set(documents.map((document) => document.id)); const imported = draft.rows.flatMap((row, index) => {
      const paragraphs = paragraphsFor(row); if (!paragraphs.length) return []; const requested = safeDocumentId(valueFor(row, "core:documentId")); let id = requested || `DOC${String(documents.length + index + 1).padStart(3, "0")}`; let suffix = 2; while (usedIds.has(id)) id = `${requested || id}_${suffix++}`; usedIds.add(id); const values: Record<string, MetadataValue> = {};
      draft.headers.forEach((header) => { const target = draft.mapping[header]; const field = target?.startsWith("meta:") ? metadataFields.find((item) => item.id === target.slice(5)) : target?.startsWith("new:") ? newFieldMap.get(header) : undefined; if (field) values[field.id] = parseMetadataValue(row.values[header], field); });
      return [makeDocument(id, valueFor(row, "core:title"), values, paragraphs)];
    }); addDocuments(imported, Array.from(newFieldMap.values())); setDraft(null); setParagraphOverrides({});
  }
  const previewRow = draft?.rows.find((row) => row.key === previewKey) ?? draft?.rows[0];
  if (draft) return <div className="page"><div className="page-heading"><div><p className="kicker">SPREADSHEET IMPORT</p><h1>Map and preview</h1><p>{draft.filename} · Map useful columns to core fields or project variables.</p></div><button className="text-button" onClick={() => setDraft(null)}>Cancel import</button></div>
    <section className="mapping-card"><div className="section-title"><span className="eyebrow">COLUMN MAPPING</span><h2>Choose what each column means</h2><p>Document text is required. Unmatched columns can become new project metadata.</p></div><div className="column-mapping-list">{draft.headers.map((header) => <div className="column-map-row" key={header}><div><b>{header}</b><small>{draft.rows.slice(0, 2).map((row) => String(row.values[header] ?? "")).filter(Boolean).join(" · ").slice(0, 90) || "Empty"}</small></div><select aria-label={`Map ${header}`} value={draft.mapping[header]?.startsWith("new:") ? "__new__" : draft.mapping[header]} onChange={(event) => mapColumn(header, event.target.value)}><option value="">Do not import</option><optgroup label="Core fields"><option value="core:documentId">Document ID</option><option value="core:title">Title</option><option value="core:text">Document text</option></optgroup>{metadataFields.length > 0 && <optgroup label="Project metadata">{orderedMetadataFields(metadataFields, true).map((field) => <option key={field.id} value={`meta:${field.id}`}>{field.name}{field.archived ? " (archived)" : ""}</option>)}</optgroup>}<option value="__new__">＋ Create new metadata field…</option></select>{draft.newFields[header] && <div className="new-field-confirm"><input aria-label={`${header} metadata name`} value={draft.newFields[header].name} onChange={(event) => patchNewField(header, { name: event.target.value })} /><select aria-label={`${header} metadata type`} value={draft.newFields[header].type} onChange={(event) => patchNewField(header, { type: event.target.value as MetadataFieldType })}>{metadataTypeOptions()}</select>{["single", "multiple"].includes(draft.newFields[header].type) && <input aria-label={`${header} metadata options`} value={draft.newFields[header].options.join(", ")} onChange={(event) => patchNewField(header, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Options, separated by commas" />}</div>}</div>)}</div>{!headerFor("core:text") && <p className="inline-warning">Map one column to Document text to continue.</p>}</section>
    <section className="import-preview-card"><div className="preview-summary"><div><span className="eyebrow">IMPORT PREVIEW</span><h2>{draft.rows.length} documents detected</h2></div><button className="primary-button compact" disabled={!headerFor("core:text")} onClick={confirmBulkImport}>Confirm import</button></div><div className="preview-table"><div className="preview-row preview-head"><span>ID</span><span>Title</span><span>Metadata</span><span>Words</span><span>Segments</span></div>{draft.rows.map((row, index) => { const paragraphs = paragraphsFor(row); return <button className={`preview-row ${row.key === previewRow?.key ? "active" : ""}`} key={row.key} onClick={() => setPreviewKey(row.key)}><span>{valueFor(row, "core:documentId") || `Auto ${index + 1}`}</span><span>{valueFor(row, "core:title") || "Untitled document"}</span><span>{Object.values(draft.mapping).filter((value) => value.startsWith("meta:") || value.startsWith("new:")).length} fields</span><span>{wordCount(valueFor(row, "core:text"))}</span><span>{paragraphs.length}</span></button>})}</div></section>
    {previewRow && headerFor("core:text") && <section className="segmentation-card"><div className="section-title"><span className="eyebrow">SEGMENTATION PREVIEW</span><h2>{valueFor(previewRow, "core:title") || "Untitled document"}</h2><p>Blank lines create segments. Merge adjacent paragraphs if needed.</p></div><div className="segment-preview-list">{paragraphsFor(previewRow).map((paragraph, index, paragraphs) => <div className="segment-preview" key={`${previewRow.key}_${index}`}><span>P{String(index + 1).padStart(3, "0")}</span><p>{paragraph.slice(0, 220)}{paragraph.length > 220 ? "…" : ""}</p><small>{wordCount(paragraph)} words</small>{index < paragraphs.length - 1 && <button onClick={() => mergeParagraph(previewRow, index)}>Merge with next</button>}</div>)}</div></section>}
  </div>;
  return <div className="page"><div className="page-heading"><div><p className="kicker">CORPUS</p><h1>Documents</h1><p>Add text and the research variables defined for this project.</p></div><div className="import-actions"><label className="secondary-button file-label">Import TXT<input type="file" accept=".txt,text/plain" multiple onChange={loadTxt} /></label><label className="primary-button file-label">Import CSV / Excel<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={loadSpreadsheet} /></label></div></div>
    <div className="two-column"><section className="form-card document-form"><div className="form-card-heading"><h2>{editingId ? "Edit document" : "Add a document"}</h2>{editingId && <button className="text-button" onClick={resetForm}>Cancel editing</button>}</div><label>Document ID <span>{editingId ? "stable identifier" : "assigned when saved"}</span><input value={editingId || "Assigned automatically"} readOnly /></label><label>Title <span>optional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" /></label>{activeFields.length > 0 && <div className="metadata-form-fields">{activeFields.map((field) => <MetadataInput key={field.id} field={field} value={metadata[field.id]} onChange={(value) => setMetadata((current) => ({ ...current, [field.id]: value }))} />)}</div>}<label>Document text<textarea rows={11} value={text} onChange={(event) => setText(event.target.value)} placeholder={'Paste the full document here.\n\nSeparate paragraphs with a blank line.'} /></label><div className="form-foot"><small>{splitParagraphs(text).length} paragraphs detected</small><button className="primary-button compact" onClick={submit}>{editingId ? "Save changes" : "Add to corpus"}</button></div></section>
      <section className="list-card"><div className="section-title"><div><span className="eyebrow">CURRENT CORPUS</span><h2>{documents.length} document{documents.length === 1 ? "" : "s"}</h2></div></div>{documents.length ? documents.map((doc) => <div className="document-row" key={doc.id}><span className="document-glyph">≡</span><span><b>{doc.title}</b><small>{doc.id} · {doc.segments.length} paragraphs · {Object.values(doc.metadata).filter((value) => value !== null && value !== "" && (!Array.isArray(value) || value.length)).length} metadata values</small></span><span className="document-row-actions"><button onClick={() => editDocument(doc)}>Edit</button><button onClick={() => onOpen(doc.segments[0]?.id)}>Code →</button></span></div>) : <div className="empty-state"><span>¶</span><h3>No documents yet</h3><p>Add your first document to begin.</p></div>}</section></div>
  </div>;
}

function humanizeHeader(header: string) { return header.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function metadataTypeOptions() { return <><option value="text">Text</option><option value="single">Single choice</option><option value="multiple">Multiple choice</option><option value="date">Date</option><option value="number">Number</option><option value="boolean">Yes / No</option></>; }

function MetadataInput({ field, value, onChange }: { field: MetadataField; value?: MetadataValue; onChange: (value: MetadataValue) => void }) {
  if (field.type === "single") return <label>{field.name}<select value={String(value ?? "")} onChange={(event) => onChange(event.target.value || null)}><option value="">Not specified</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (field.type === "multiple") { const selected = Array.isArray(value) ? value : []; return <fieldset className="metadata-multiple"><legend>{field.name}</legend>{field.options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}</label>)}{!field.options.length && <small>Add permitted values in Metadata first.</small>}</fieldset>; }
  if (field.type === "boolean") return <label>{field.name}<select value={value === true ? "yes" : value === false ? "no" : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "yes")}><option value="">Not specified</option><option value="yes">Yes</option><option value="no">No</option></select></label>;
  return <label>{field.name}<input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} value={value === null || value === undefined || Array.isArray(value) ? "" : String(value)} onChange={(event) => onChange(field.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)} /></label>;
}

function MetadataView({ fields, onAdd, onPatch, onMove }: { fields: MetadataField[]; onAdd: () => void; onPatch: (id: string, patch: Partial<MetadataField>) => void; onMove: (id: string, direction: -1 | 1) => void }) {
  const ordered = orderedMetadataFields(fields, true);
  return <div className="page"><div className="page-heading"><div><p className="kicker">DOCUMENT VARIABLES</p><h1>Document metadata</h1><p>Define the few attributes that matter for this project. Field IDs stay stable when names change.</p></div><button className="primary-button compact" onClick={onAdd}>＋ Add metadata field</button></div>
    <div className="metadata-schema-list">{ordered.map((field, index) => <section className={`metadata-field-card ${field.archived ? "archived" : ""}`} key={field.id}><div className="metadata-field-order"><button aria-label={`Move ${field.name} up`} disabled={index === 0} onClick={() => onMove(field.id, -1)}>↑</button><button aria-label={`Move ${field.name} down`} disabled={index === ordered.length - 1} onClick={() => onMove(field.id, 1)}>↓</button></div><div className="metadata-field-core"><span className="eyebrow">VARIABLE {index + 1} · <code>{field.id}</code></span><input aria-label={`Name for ${field.id}`} value={field.name} onChange={(event) => onPatch(field.id, { name: event.target.value })} /></div><label>Type<select aria-label={`Type for ${field.name}`} value={field.type} onChange={(event) => onPatch(field.id, { type: event.target.value as MetadataFieldType })}>{metadataTypeOptions()}</select></label>{["single", "multiple"].includes(field.type) ? <label className="metadata-options">Permitted values<textarea aria-label={`Options for ${field.name}`} rows={2} value={field.options.join("\n")} onChange={(event) => onPatch(field.id, { options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} placeholder="One option per line" /></label> : <div className="metadata-options metadata-type-note">{field.type === "boolean" ? "Yes, No, or not specified" : `${humanizeHeader(field.type)} value`}</div>}<button className="status-button" onClick={() => onPatch(field.id, { archived: !field.archived })}>{field.archived ? "Restore" : "Archive"}</button></section>)}{!fields.length && <div className="empty-state metadata-empty"><span>≡</span><h3>No custom metadata yet</h3><p>Add variables such as Country, Participant ID, Condition, or Publication date.</p><button className="primary-button compact" onClick={onAdd}>Add your first field</button></div>}</div>
    <div className="metadata-note"><b>Archiving is non-destructive.</b> Archived fields disappear from new document forms and CSV exports, but their definitions and historical values remain in the project backup.</div>
  </div>;
}

function CodingView({ current, cursor, flatSegments, dimensions, metadataFields, fullDocument, setFullDocument, setCursor, toggleCode, toggleNotApplicable, updateSegment, saveAndNext, addCode, goToSegment, requiredWarning }: { current?: { doc: Document; segment: Segment }; cursor: number; flatSegments: { doc: Document; segment: Segment }[]; dimensions: Dimension[]; metadataFields: MetadataField[]; fullDocument: boolean; setFullDocument: (v: boolean) => void; setCursor: React.Dispatch<React.SetStateAction<number>>; toggleCode: (d: Dimension, c: string) => void; toggleNotApplicable: (d: Dimension) => void; updateSegment: (id: string, p: Partial<Segment>) => void; saveAndNext: () => void; addCode: (d: string, n?: string) => void; goToSegment: (id: string) => void; requiredWarning: string[] }) {
  const controlsRef = useRef<HTMLElement>(null);
  const activeSegmentId = current?.segment.id;
  useEffect(() => {
    if (!activeSegmentId) return;
    controlsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSegmentId]);
  if (!current) return <div className="page empty-state large"><span>¶</span><h1>No paragraphs to code</h1><p>Import a document first.</p></div>;
  const docSegments = current.doc.segments;
  const activeCodes = dimensions.flatMap((d) => d.codes.filter((c) => c.active).map((c) => ({ d, c })));
  if (fullDocument) return <div className="page coding-page"><div className="coding-header"><div><p className="kicker">FULL DOCUMENT</p><h1>{current.doc.title}</h1><p>{current.doc.id} · {docSegments.length} paragraphs</p></div><button className="secondary-button" onClick={() => setFullDocument(false)}>Return to focus view</button></div><div className="document-view">{docSegments.map((segment) => <button key={segment.id} className={`full-segment ${segment.id === current.segment.id ? "current" : ""}`} onClick={() => goToSegment(segment.id)}><span>{segment.id}</span><p>{segment.text}</p><small>{segment.touched ? `${segment.codeIds.length} code${segment.codeIds.length === 1 ? "" : "s"}` : "Uncoded"}</small></button>)}</div></div>;
  return <div className="coding-layout">
    <section className="coding-main">
      <div className="sticky-segment-panel" data-testid="sticky-segment-panel">
      <div className="coding-header"><div><p className="kicker">{current.doc.id} · DOCUMENT {projectDocumentIndex(flatSegments, current.doc.id)} OF {new Set(flatSegments.map(({ doc }) => doc.id)).size}</p><h1>{current.doc.title}</h1><p>{orderedMetadataFields(metadataFields).map((field) => current.doc.metadata[field.id] ? `${field.name}: ${Array.isArray(current.doc.metadata[field.id]) ? (current.doc.metadata[field.id] as string[]).join(", ") : String(current.doc.metadata[field.id])}` : "").filter(Boolean).slice(0, 3).join(" · ") || "No document metadata"}</p></div><button className="text-button" onClick={() => setFullDocument(true)}>☷ Full document</button></div>
      <div className="segment-meta"><span>PARAGRAPH {current.segment.number} OF {docSegments.length}</span><span>{current.segment.id}</span></div>
      <article className="paragraph-card"><p>{current.segment.text}</p></article>
      <div className="annotation-fields segment-fields"><label>Memo <span>optional · themes, uncertainties, and analytic notes</span><textarea rows={2} value={current.segment.memo} onChange={(e) => updateSegment(current.segment.id, { memo: e.target.value })} placeholder="Capture an observation, possible theme, uncertainty, or interpretive idea…" /></label><div className="field-row"><label>Confidence<select value={current.segment.confidence} onChange={(e) => updateSegment(current.segment.id, { confidence: e.target.value as Confidence })}><option>High</option><option>Medium</option><option>Low</option></select></label><label>Review status<select value={current.segment.reviewStatus} onChange={(e) => updateSegment(current.segment.id, { reviewStatus: e.target.value as ReviewStatus })}><option>Coded</option><option>Uncertain</option><option>Needs review</option></select></label></div></div>
      <footer className="coding-footer"><button className="secondary-button" disabled={cursor === 0} onClick={() => setCursor((c) => Math.max(0, c - 1))}>← Previous</button><span><kbd>Enter</kbd> saves & advances</span><button className="primary-button" onClick={saveAndNext}>Save + Next <span>→</span></button></footer>
      </div>
    </section>
    <aside ref={controlsRef} className="code-rail" data-testid="coding-controls"><div className="rail-head"><div><span className="eyebrow">APPLY CODES</span><h2>Code this paragraph</h2></div><span className="selection-count">{current.segment.codeIds.length} selected</span></div>
      <div className="dimension-list">{dimensions.map((dimension) => { const notApplicable = current.segment.notApplicableDimensionIds.includes(dimension.id); return <section className={`dimension-group ${requiredWarning.includes(dimension.id) ? "unresolved" : ""}`} key={dimension.id}><div className="dimension-title"><span style={{ background: dimension.color }} /><b>{dimension.name}</b><small>{dimension.required ? "Required" : "Optional"} · {dimension.type === "single" ? "Choose one" : "Choose any"}</small></div><div className="code-buttons">{dimension.codes.filter((c) => c.active).map((code) => { const shortcut = activeCodes.findIndex((x) => x.c.id === code.id) + 1; const selected = current.segment.codeIds.includes(code.id); return <button key={code.id} className={selected ? "selected" : ""} style={{ "--code-color": code.color } as React.CSSProperties} onClick={() => toggleCode(dimension, code.id)} title={code.definition || code.name}><span>{selected ? "✓" : ""}</span>{code.name}{shortcut > 0 && shortcut <= 9 ? <kbd>{shortcut}</kbd> : null}</button>; })}<button className={`not-applicable ${notApplicable ? "selected" : ""}`} onClick={() => toggleNotApplicable(dimension)}><span>{notApplicable ? "✓" : "—"}</span>No applicable code</button><InlineNewCode onAdd={(name) => addCode(dimension.id, name)} /></div></section>})}</div>
      {requiredWarning.length > 0 && <div className="required-warning" role="alert"><span>!</span><p><b>Required coding incomplete.</b> Resolve {requiredWarning.map((id) => dimensions.find((dimension) => dimension.id === id)?.name).filter(Boolean).join(", ")} by selecting a code or “No applicable code”.</p></div>}
    </aside>
  </div>;
}

function InlineNewCode({ onAdd }: { onAdd: (name: string) => void }) { const [open, setOpen] = useState(false); const [name, setName] = useState(""); if (!open) return <button className="new-code" onClick={() => setOpen(true)}>＋ New code</button>; return <div className="inline-new"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { e.stopPropagation(); onAdd(name.trim()); setName(""); setOpen(false); } if (e.key === "Escape") setOpen(false); }} placeholder="Code name" /><button onClick={() => { if (name.trim()) onAdd(name.trim()); setOpen(false); }}>Add</button></div>; }
function projectDocumentIndex(flat: { doc: Document }[], id: string) { return Array.from(new Set(flat.map(({ doc }) => doc.id))).indexOf(id) + 1; }

function CodebookView({ dimensions, addDimension, patchDimension, addCode, patchCode }: { dimensions: Dimension[]; addDimension: () => void; patchDimension: (id: string, p: Partial<Dimension>) => void; addCode: (d: string) => void; patchCode: (d: string, c: string, p: Partial<Code>) => void }) {
  return <div className="page"><div className="page-heading"><div><p className="kicker">FRAMEWORK</p><h1>Codebook</h1><p>Shape your dimensions and codes. Archived codes remain attached to past annotations.</p></div><button className="primary-button compact" onClick={addDimension}>＋ Add dimension</button></div>
    <div className="codebook-list">{dimensions.map((dimension, index) => <section className="codebook-dimension" key={dimension.id}><div className="dimension-editor"><span className="color-swatch" style={{ background: dimension.color }}><input type="color" value={dimension.color} onChange={(e) => patchDimension(dimension.id, { color: e.target.value })} /></span><div><span className="eyebrow">DIMENSION {index + 1} · <code>{dimension.id}</code></span><input className="dimension-name" value={dimension.name} onChange={(e) => patchDimension(dimension.id, { name: e.target.value.toUpperCase() })} /></div><div className="dimension-settings"><label className="choice-label">Selection<select value={dimension.type} onChange={(e) => patchDimension(dimension.id, { type: e.target.value as "single" | "multiple" })}><option value="single">Single choice</option><option value="multiple">Multiple choice</option></select></label><label className="choice-label">Completion<select value={dimension.required ? "required" : "optional"} onChange={(e) => patchDimension(dimension.id, { required: e.target.value === "required" })}><option value="required">Required</option><option value="optional">Optional</option></select></label></div></div>
      <div className="code-table"><div className="code-row table-head"><span>Code</span><span>Definition</span><span>Origin</span><span>Status</span></div>{dimension.codes.map((code) => <div className={`code-row ${code.active ? "" : "archived"}`} key={code.id}><label className="code-name-field"><i style={{ background: dimension.color }} /><span><input value={code.name} onChange={(e) => patchCode(dimension.id, code.id, { name: e.target.value })} /><small>{code.id}</small></span></label><input value={code.definition} onChange={(e) => patchCode(dimension.id, code.id, { definition: e.target.value })} placeholder="Add a clear inclusion rule…" /><select className={`origin-select ${code.origin === "Emergent" ? "emergent" : ""}`} value={code.origin} onChange={(e) => patchCode(dimension.id, code.id, { origin: e.target.value as Origin })}><option>A priori</option><option>Emergent</option></select><button className="status-button" onClick={() => patchCode(dimension.id, code.id, { active: !code.active })}>{code.active ? "Active" : "Archived"}</button></div>)}<button className="add-row" onClick={() => addCode(dimension.id)}>＋ Add code to {dimension.name}</button></div>
    </section>)}{!dimensions.length && <div className="empty-state"><span>▦</span><h3>Your codebook is empty</h3><p>Add a dimension, then create codes inside it.</p></div>}</div>
  </div>;
}

function ReviewView({ segments, onOpen }: { segments: { doc: Document; segment: Segment }[]; onOpen: (id: string) => void }) { const cases = segments.filter(({ segment }) => segment.reviewStatus !== "Coded"); return <div className="page"><div className="page-heading"><div><p className="kicker">QUALITY CHECK</p><h1>Review cases</h1><p>Revisit uncertain or flagged paragraphs before export.</p></div><span className="count-pill">{cases.length} cases</span></div><div className="review-list">{cases.map(({ doc, segment }) => <button className="review-row" key={segment.id} onClick={() => onOpen(segment.id)}><span className={`review-flag ${segment.reviewStatus === "Uncertain" ? "uncertain" : ""}`}>{segment.reviewStatus}</span><span><b>{doc.title}</b><p>{segment.text}</p><small>{segment.id} · Confidence: {segment.confidence}</small></span><span>→</span></button>)}{!cases.length && <div className="empty-state"><span>✓</span><h3>Nothing needs review</h3><p>Uncertain and flagged paragraphs will appear here.</p></div>}</div></div>; }

function AnalysisView({ dimensions, segments }: { dimensions: Dimension[]; segments: { segment: Segment }[] }) {
  const codedCount = segments.filter(({ segment }) => segment.touched).length || 1;
  const max = Math.max(1, ...dimensions.flatMap((d) => d.codes.map((c) => segments.filter(({ segment }) => segment.codeIds.includes(c.id)).length)));
  return <div className="page"><div className="page-heading"><div><p className="kicker">DESCRIPTIVE ANALYSIS</p><h1>Code frequencies</h1><p>Raw counts and percentages with explicit denominators.</p></div><span className="count-pill">{codedCount} coded paragraphs</span></div><div className="analysis-legend"><span>All coded = every visited segment</span><span>Addressed = a code or “No applicable code” was explicitly recorded for the dimension</span></div><div className="analysis-list">{dimensions.map((dimension) => <section className="analysis-dimension" key={dimension.id}><div className="analysis-title"><span style={{ background: dimension.color }} /><h2>{dimension.name}</h2><small>{dimension.type === "single" ? "Single choice" : "Multiple choice · percentages may exceed 100%"}</small></div><div className="bar-labels"><span>Code</span><span>Frequency</span><span>All coded</span><span>Addressed</span></div>{dimension.codes.filter((c) => c.active).map((code) => <CodeFrequencyBar key={code.id} code={code} dimension={dimension} segments={segments} codedCount={codedCount} max={max} />)}</section>)}</div></div>;
}

function CodeFrequencyBar({ code, dimension, segments, codedCount, max }: { code: Code; dimension: Dimension; segments: { segment: Segment }[]; codedCount: number; max: number }) {
  const count = segments.filter(({ segment }) => segment.codeIds.includes(code.id)).length;
  const pct = Math.round((count / codedCount) * 100);
  const addressed = segments.filter(({ segment }) => segment.notApplicableDimensionIds.includes(dimension.id) || segment.codeIds.some((id) => dimension.codes.some((item) => item.id === id))).length;
  const addressedPct = addressed ? Math.round((count / addressed) * 100) : 0;
  return <div className="bar-row"><span>{code.name}</span><div className="bar-track"><i style={{ width: `${(count / max) * 100}%`, background: dimension.color }} /></div><b>{count}</b><small>{pct}%</small><small>{addressedPct}% <em>of {addressed}</em></small></div>;
}

function ExportView({ exportCSVs, exportGoldCSVs, onBackup, importBackup, fileInput }: { exportCSVs: () => void; exportGoldCSVs: () => void; onBackup: () => void; importBackup: (e: ChangeEvent<HTMLInputElement>) => void; fileInput: React.RefObject<HTMLInputElement | null> }) {
  return <div className="page"><div className="page-heading"><div><p className="kicker">PORTABILITY</p><h1>Export</h1><p>Take normalized research data, completed gold judgements, or the full editable project with you.</p></div></div>
    <div className="export-section-heading"><span className="eyebrow">RELATIONAL DATA</span><h2>Normalized project tables</h2></div><section className="export-card featured research-export"><span className="export-icon">CSV</span><div><h2>Four linked CSV files</h2><p>Normalized project data for analysis, transformation, or archival use.</p><ul><li>documents.csv</li><li>segments.csv</li><li>annotations.csv</li><li>codebook.csv</li></ul></div><button className="primary-button" onClick={exportCSVs}>Download 4 CSV files <span>↓</span></button></section>
    <div className="export-section-heading research-heading"><span className="eyebrow">GOLD-STANDARD / AI-READY DATA</span><h2>Completed human judgements</h2></div><section className="export-card gold-export"><span className="export-icon">GOLD</span><div><h2>Validation and evaluation datasets</h2><p>Human-readable and model-ready datasets derived from completed coding decisions. Unresolved dimensions are excluded.</p><ul><li>gold_annotations_long.csv</li><li>evaluation_instances.csv</li></ul></div><button className="primary-button" onClick={exportGoldCSVs}>Download 2 gold files <span>↓</span></button></section>
    <div className="export-section-heading research-heading"><span className="eyebrow">PROJECT BACKUP</span><h2>Continue editing in Fieldnote</h2></div><div className="export-grid"><section className="export-card"><span className="export-icon">{`{ }`}</span><h2>Download project backup</h2><p>Complete editable project backup for reopening and continuing work in Fieldnote.</p><button className="secondary-button" onClick={onBackup}>Download project file</button></section><section className="export-card"><span className="export-icon">↥</span><h2>Open project file</h2><p>Add a Fieldnote project backup to this browser. Existing projects stay separate unless you explicitly replace one.</p><input ref={fileInput} type="file" accept="application/json,.json" onChange={importBackup} hidden /><button className="secondary-button" onClick={() => fileInput.current?.click()}>Choose project file</button></section></div>
    <div className="privacy-note"><span>⌂</span><p><b>Your data stays local.</b><br />Exports are derived from the current project without changing its documents, coding, metadata, or stable IDs.</p></div>
  </div>;
}
