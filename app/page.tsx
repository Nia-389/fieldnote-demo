"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "dashboard" | "import" | "coding" | "codebook" | "review" | "analysis" | "export";
type Confidence = "High" | "Medium" | "Low";
type ReviewStatus = "Coded" | "Uncertain" | "Needs review";
type Origin = "A priori" | "Emergent";

type Code = { id: string; name: string; definition: string; origin: Origin; color: string; active: boolean };
type Dimension = { id: string; name: string; type: "single" | "multiple"; color: string; codes: Code[] };
type Segment = { id: string; documentId: string; number: number; text: string; codeIds: string[]; memo: string; emergingTheme: string; confidence: Confidence; reviewStatus: ReviewStatus; touched: boolean };
type Document = { id: string; title: string; source: string; date: string; segments: Segment[] };
type Project = { id: string; name: string; createdAt: string; documents: Document[]; dimensions: Dimension[] };

const STORAGE_KEY = "fieldnote-annotation-project-v1";
const palette = ["#EF8354", "#4C6FFF", "#26A69A", "#9B5DE5", "#E7A923", "#E05A8D"];

const starterProject: Project = {
  id: "PRJ001",
  name: "Climate narratives study",
  createdAt: new Date().toISOString(),
  documents: [
    {
      id: "DOC001",
      title: "A town prepares for a changing coastline",
      source: "Community Observer",
      date: "2026-04-18",
      segments: [
        { id: "DOC001_P001", documentId: "DOC001", number: 1, text: "On a grey Tuesday morning, residents filled the library hall to discuss what the next decade might bring for their coastline. The mood was practical rather than fearful: people wanted to understand the options in front of them.", codeIds: ["COD_COMMUNITY", "COD_HOPE_HIGH"], memo: "Collective agency is explicit.", emergingTheme: "Local knowledge as infrastructure", confidence: "High", reviewStatus: "Coded", touched: true },
        { id: "DOC001_P002", documentId: "DOC001", number: 2, text: "The council presented new flood maps and proposed a series of smaller, reversible interventions. Officials stressed that no single plan had been chosen and invited residents to shape the priorities.", codeIds: ["COD_GOVERNMENT", "COD_RESPONSE_ADAPT"], memo: "", emergingTheme: "", confidence: "High", reviewStatus: "Coded", touched: true },
        { id: "DOC001_P003", documentId: "DOC001", number: 3, text: "Several shop owners worried about the effect of prolonged construction on the summer season. Others argued that investing now would protect both livelihoods and the character of the high street.", codeIds: [], memo: "", emergingTheme: "", confidence: "High", reviewStatus: "Coded", touched: false },
      ],
    },
    {
      id: "DOC002",
      title: "New grants back neighbourhood energy projects",
      source: "Regional Desk",
      date: "2026-05-02",
      segments: [
        { id: "DOC002_P001", documentId: "DOC002", number: 1, text: "A regional grant programme will fund seven neighbourhood groups to install shared solar panels and improve insulation in older homes.", codeIds: [], memo: "", emergingTheme: "", confidence: "High", reviewStatus: "Coded", touched: false },
        { id: "DOC002_P002", documentId: "DOC002", number: 2, text: "Organisers say the projects will reduce bills while giving residents more control over how energy is produced and used.", codeIds: [], memo: "", emergingTheme: "", confidence: "High", reviewStatus: "Coded", touched: false },
      ],
    },
  ],
  dimensions: [
    { id: "DIM_PROTAGONIST", name: "PROTAGONIST", type: "single", color: "#EF8354", codes: [
      { id: "COD_COMMUNITY", name: "Community", definition: "Residents, neighbourhood groups, or civil society lead the action.", origin: "A priori", color: "#EF8354", active: true },
      { id: "COD_GOVERNMENT", name: "Government", definition: "Public institutions or officials lead the action.", origin: "A priori", color: "#EF8354", active: true },
      { id: "COD_BUSINESS", name: "Business", definition: "Commercial actors lead the action.", origin: "A priori", color: "#EF8354", active: true },
    ]},
    { id: "DIM_HOPE", name: "HOPE", type: "single", color: "#4C6FFF", codes: [
      { id: "COD_HOPE_LOW", name: "Low", definition: "Little expectation of a positive outcome.", origin: "A priori", color: "#4C6FFF", active: true },
      { id: "COD_HOPE_MOD", name: "Moderate", definition: "A qualified or mixed expectation of improvement.", origin: "A priori", color: "#4C6FFF", active: true },
      { id: "COD_HOPE_HIGH", name: "High", definition: "A strong expectation of a positive outcome.", origin: "A priori", color: "#4C6FFF", active: true },
    ]},
    { id: "DIM_RESPONSE", name: "RESPONSE", type: "multiple", color: "#26A69A", codes: [
      { id: "COD_RESPONSE_ADAPT", name: "Adaptation", definition: "Adjustment to actual or expected impacts.", origin: "A priori", color: "#26A69A", active: true },
      { id: "COD_RESPONSE_MIT", name: "Mitigation", definition: "Action to reduce causes or emissions.", origin: "A priori", color: "#26A69A", active: true },
    ]},
  ],
};

const cloneStarter = () => JSON.parse(JSON.stringify(starterProject)) as Project;
const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [project, setProject] = useState<Project>(cloneStarter);
  const [view, setView] = useState<View>("dashboard");
  const [cursor, setCursor] = useState(0);
  const [fullDocument, setFullDocument] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setProject(JSON.parse(stored)); } catch { /* keep starter */ }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      setSaved(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project, hydrated]);

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
    updateSegment(current.segment.id, { codeIds: next });
  }

  function saveAndNext() {
    if (!current) return;
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

  function createBlankProject() {
    const blank: Project = { id: makeId("PRJ"), name: "Untitled research project", createdAt: new Date().toISOString(), documents: [], dimensions: [] };
    setProject(blank); setCursor(0); setView("import"); setToast("New project created");
  }

  function addDimension() {
    const id = makeId("DIM");
    setProject((p) => ({ ...p, dimensions: [...p.dimensions, { id, name: "NEW DIMENSION", type: "single", color: palette[p.dimensions.length % palette.length], codes: [] }] }));
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

  function addDocument(title: string, source: string, date: string, text: string) {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!title.trim() || !paragraphs.length) { setToast("Add a title and at least one paragraph."); return false; }
    const sequence = project.documents.length + 1;
    const id = `DOC${String(sequence).padStart(3, "0")}`;
    const doc: Document = { id, title: title.trim(), source: source.trim(), date, segments: paragraphs.map((paragraph, i) => ({ id: `${id}_P${String(i + 1).padStart(3, "0")}`, documentId: id, number: i + 1, text: paragraph, codeIds: [], memo: "", emergingTheme: "", confidence: "High", reviewStatus: "Coded", touched: false })) };
    setProject((p) => ({ ...p, documents: [...p.documents, doc] }));
    setToast(`Imported ${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}`);
    return true;
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Project;
        if (!parsed.id || !Array.isArray(parsed.documents) || !Array.isArray(parsed.dimensions)) throw new Error();
        setProject(parsed); setCursor(0); setView("dashboard"); setToast("Project backup restored");
      } catch { setToast("That file is not a valid Fieldnote backup."); }
    });
    event.target.value = "";
  }

  function exportCSVs() {
    const documents = csv(["document_id", "title", "source", "date"], project.documents.map((d) => [d.id, d.title, d.source, d.date]));
    const segments = csv(["segment_id", "document_id", "segment_number", "text", "coding_status"], flatSegments.map(({ segment }) => [segment.id, segment.documentId, segment.number, segment.text, segment.touched ? "Coded" : "Uncoded"]));
    const annotationRows = flatSegments.flatMap(({ segment }) => segment.codeIds.map((codeId, index) => {
      const found = allCodes.find((c) => c.id === codeId);
      return [`ANN_${segment.id}_${String(index + 1).padStart(2, "0")}`, segment.id, found?.dimension.id, found?.dimension.name, found?.id, found?.name, found?.origin, segment.confidence, segment.memo];
    }));
    const annotations = csv(["annotation_id", "segment_id", "dimension_id", "dimension_name", "code_id", "code_name", "code_origin", "confidence", "memo"], annotationRows);
    const codebook = csv(["dimension_id", "dimension_name", "dimension_type", "code_id", "code_name", "code_definition", "origin", "active"], allCodes.map((c) => [c.dimension.id, c.dimension.name, c.dimension.type, c.id, c.name, c.definition, c.origin, c.active]));
    download("documents.csv", documents); download("segments.csv", segments); download("annotations.csv", annotations); download("codebook.csv", codebook);
    setToast("Four CSV files downloaded");
  }

  return (
    <main className="app-shell" onKeyDown={handleAppKey} tabIndex={-1}>
      <aside className="sidebar">
        <div className="brand" onClick={() => setView("dashboard")}><span className="brand-mark">F</span><span>fieldnote</span></div>
        <nav aria-label="Primary navigation">
          <NavButton active={view === "dashboard"} icon="⌂" label="Overview" onClick={() => setView("dashboard")} />
          <NavButton active={view === "coding"} icon="✎" label="Code segments" onClick={() => setView("coding")} />
          <NavButton active={view === "import"} icon="＋" label="Articles" onClick={() => setView("import")} />
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
          <div className="top-actions"><button className="text-button" onClick={() => setView("import")}>Add article</button><button className="avatar" title="Local researcher">R</button></div>
        </header>

        {view === "dashboard" && <Dashboard project={project} flatSegments={flatSegments} coded={coded} needsReview={needsReview} completion={completion} onContinue={() => setView("coding")} onView={setView} onCreate={createBlankProject} />}
        {view === "import" && <ImportView documents={project.documents} addDocument={addDocument} onOpen={goToSegment} />}
        {view === "coding" && <CodingView current={current} cursor={cursor} flatSegments={flatSegments} dimensions={project.dimensions} fullDocument={fullDocument} setFullDocument={setFullDocument} setCursor={setCursor} toggleCode={toggleCode} updateSegment={updateSegment} saveAndNext={saveAndNext} addCode={addCode} goToSegment={goToSegment} />}
        {view === "codebook" && <CodebookView dimensions={project.dimensions} addDimension={addDimension} patchDimension={patchDimension} addCode={addCode} patchCode={patchCode} />}
        {view === "review" && <ReviewView segments={flatSegments} onOpen={goToSegment} />}
        {view === "analysis" && <AnalysisView dimensions={project.dimensions} segments={flatSegments} />}
        {view === "export" && <ExportView exportCSVs={exportCSVs} onBackup={() => download(`${project.name.replace(/\W+/g, "-").toLowerCase()}-backup.json`, JSON.stringify(project, null, 2), "application/json")} importBackup={importBackup} fileInput={fileInput} />}
      </section>
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function NavButton({ active, icon, label, onClick, badge }: { active: boolean; icon: string; label: string; onClick: () => void; badge?: number }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span>{badge ? <b>{badge}</b> : null}</button>;
}

function Dashboard({ project, flatSegments, coded, needsReview, completion, onContinue, onView, onCreate }: { project: Project; flatSegments: { doc: Document; segment: Segment }[]; coded: number; needsReview: number; completion: number; onContinue: () => void; onView: (v: View) => void; onCreate: () => void }) {
  const lastTouched = [...flatSegments].reverse().find(({ segment }) => segment.touched);
  return <div className="page dashboard-page">
    <div className="page-heading dashboard-heading"><div><p className="kicker">RESEARCH WORKSPACE</p><h1>Good afternoon.</h1><p>Your corpus is ready when you are.</p></div><button className="secondary-button" onClick={onCreate}>New project</button></div>
    <div className="hero-grid">
      <section className="progress-card">
        <div className="progress-copy"><div className="progress-ring" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties}><span>{completion}<small>%</small></span></div><div><span className="eyebrow">CODING PROGRESS</span><h2>{coded} of {flatSegments.length} paragraphs coded</h2><p>{flatSegments.length - coded} remaining across {project.documents.length} articles</p></div></div>
        <button className="primary-button" onClick={onContinue}>{coded ? "Continue coding" : "Start coding"}<span>→</span></button>
      </section>
      <section className="review-card"><span className="eyebrow">ATTENTION</span><strong>{needsReview}</strong><h3>Paragraphs to review</h3><p>Uncertain or flagged for a second look.</p><button className="link-button" onClick={() => onView("review")}>Review cases →</button></section>
    </div>
    <div className="metric-grid">
      <Metric label="Articles" value={project.documents.length} note="in this corpus" />
      <Metric label="Paragraphs" value={flatSegments.length} note="total segments" />
      <Metric label="Coded" value={coded} note={`${completion}% complete`} accent />
      <Metric label="Uncoded" value={flatSegments.length - coded} note="remaining" />
    </div>
    <div className="dashboard-lower">
      <section className="activity-panel"><div className="section-title"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent activity</h2></div></div>{lastTouched ? <button className="activity-row" onClick={onContinue}><span className="document-glyph">≡</span><span><b>{lastTouched.doc.title}</b><small>{lastTouched.segment.id} · {lastTouched.segment.codeIds.length} codes applied</small></span><time>Continue →</time></button> : <p className="empty-copy">No segments coded yet.</p>}</section>
      <section className="quick-panel"><span className="eyebrow">QUICK ACTIONS</span><button onClick={() => onView("import")}><span>＋</span> Import articles</button><button onClick={() => onView("codebook")}><span>▦</span> Edit codebook</button><button onClick={() => onView("export")}><span>↓</span> Export data</button></section>
    </div>
  </div>;
}

function Metric({ label, value, note, accent }: { label: string; value: number; note: string; accent?: boolean }) { return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }

function ImportView({ documents, addDocument, onOpen }: { documents: Document[]; addDocument: (t: string, s: string, d: string, x: string) => boolean; onOpen: (id: string) => void }) {
  const [title, setTitle] = useState(""); const [source, setSource] = useState(""); const [date, setDate] = useState(""); const [text, setText] = useState("");
  function submit() { if (addDocument(title, source, date, text)) { setTitle(""); setSource(""); setDate(""); setText(""); } }
  function loadFiles(event: ChangeEvent<HTMLInputElement>) { Array.from(event.target.files ?? []).forEach((file) => file.text().then((content) => addDocument(file.name.replace(/\.txt$/i, ""), "", "", content))); event.target.value = ""; }
  return <div className="page"><div className="page-heading"><div><p className="kicker">CORPUS</p><h1>Articles</h1><p>Paste text or import plain-text files. Blank lines create paragraph segments.</p></div><label className="secondary-button file-label">Import .txt<input type="file" accept=".txt,text/plain" multiple onChange={loadFiles} /></label></div>
    <div className="two-column"><section className="form-card"><h2>Add an article</h2><label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" /></label><div className="form-row"><label>Source <span>optional</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Publication or author" /></label><label>Date <span>optional</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label></div><label>Article text<textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste the full article here.\n\nSeparate paragraphs with a blank line.'} /></label><div className="form-foot"><small>{text.split(/\n\s*\n/).filter((p) => p.trim()).length} paragraphs detected</small><button className="primary-button compact" onClick={submit}>Add to corpus</button></div></section>
      <section className="list-card"><div className="section-title"><div><span className="eyebrow">CURRENT CORPUS</span><h2>{documents.length} article{documents.length === 1 ? "" : "s"}</h2></div></div>{documents.length ? documents.map((doc) => <button className="document-row" key={doc.id} onClick={() => onOpen(doc.segments[0]?.id)}><span className="document-glyph">≡</span><span><b>{doc.title}</b><small>{doc.id} · {doc.segments.length} paragraphs{doc.source ? ` · ${doc.source}` : ""}</small></span><span>→</span></button>) : <div className="empty-state"><span>¶</span><h3>No articles yet</h3><p>Add your first article to begin.</p></div>}</section></div>
  </div>;
}

function CodingView({ current, cursor, flatSegments, dimensions, fullDocument, setFullDocument, setCursor, toggleCode, updateSegment, saveAndNext, addCode, goToSegment }: { current?: { doc: Document; segment: Segment }; cursor: number; flatSegments: { doc: Document; segment: Segment }[]; dimensions: Dimension[]; fullDocument: boolean; setFullDocument: (v: boolean) => void; setCursor: React.Dispatch<React.SetStateAction<number>>; toggleCode: (d: Dimension, c: string) => void; updateSegment: (id: string, p: Partial<Segment>) => void; saveAndNext: () => void; addCode: (d: string, n?: string) => void; goToSegment: (id: string) => void }) {
  if (!current) return <div className="page empty-state large"><span>¶</span><h1>No paragraphs to code</h1><p>Import an article first.</p></div>;
  const docStart = flatSegments.findIndex(({ doc }) => doc.id === current.doc.id);
  const docSegments = current.doc.segments;
  const activeCodes = dimensions.flatMap((d) => d.codes.filter((c) => c.active).map((c) => ({ d, c })));
  if (fullDocument) return <div className="page coding-page"><div className="coding-header"><div><p className="kicker">FULL DOCUMENT</p><h1>{current.doc.title}</h1><p>{current.doc.id} · {docSegments.length} paragraphs</p></div><button className="secondary-button" onClick={() => setFullDocument(false)}>Return to focus view</button></div><div className="document-view">{docSegments.map((segment) => <button key={segment.id} className={`full-segment ${segment.id === current.segment.id ? "current" : ""}`} onClick={() => goToSegment(segment.id)}><span>{segment.id}</span><p>{segment.text}</p><small>{segment.touched ? `${segment.codeIds.length} code${segment.codeIds.length === 1 ? "" : "s"}` : "Uncoded"}</small></button>)}</div></div>;
  return <div className="coding-layout">
    <section className="coding-main">
      <div className="coding-header"><div><p className="kicker">{current.doc.id} · ARTICLE {projectArticleIndex(flatSegments, current.doc.id)} OF {new Set(flatSegments.map(({ doc }) => doc.id)).size}</p><h1>{current.doc.title}</h1><p>{current.doc.source}{current.doc.date ? ` · ${current.doc.date}` : ""}</p></div><button className="text-button" onClick={() => setFullDocument(true)}>☷ Full document</button></div>
      <div className="segment-meta"><span>PARAGRAPH {current.segment.number} OF {docSegments.length}</span><span>{current.segment.id}</span></div>
      <article className="paragraph-card"><p>{current.segment.text}</p></article>
      <div className="annotation-fields"><label>Emerging theme <span>optional · informal</span><input value={current.segment.emergingTheme} onChange={(e) => updateSegment(current.segment.id, { emergingTheme: e.target.value })} placeholder="Capture a possible theme without adding a formal code…" /></label><label>Memo <span>optional</span><textarea rows={2} value={current.segment.memo} onChange={(e) => updateSegment(current.segment.id, { memo: e.target.value })} placeholder="Add an analytic note…" /></label><div className="field-row"><label>Confidence<select value={current.segment.confidence} onChange={(e) => updateSegment(current.segment.id, { confidence: e.target.value as Confidence })}><option>High</option><option>Medium</option><option>Low</option></select></label><label>Review status<select value={current.segment.reviewStatus} onChange={(e) => updateSegment(current.segment.id, { reviewStatus: e.target.value as ReviewStatus })}><option>Coded</option><option>Uncertain</option><option>Needs review</option></select></label></div></div>
      <footer className="coding-footer"><button className="secondary-button" disabled={cursor === 0} onClick={() => setCursor((c) => Math.max(0, c - 1))}>← Previous</button><span><kbd>Enter</kbd> saves & advances</span><button className="primary-button" onClick={saveAndNext}>Save + Next <span>→</span></button></footer>
    </section>
    <aside className="code-rail"><div className="rail-head"><div><span className="eyebrow">APPLY CODES</span><h2>Code this paragraph</h2></div><span className="selection-count">{current.segment.codeIds.length} selected</span></div>
      <div className="dimension-list">{dimensions.map((dimension) => <section className="dimension-group" key={dimension.id}><div className="dimension-title"><span style={{ background: dimension.color }} /><b>{dimension.name}</b><small>{dimension.type === "single" ? "Choose one" : "Choose any"}</small></div><div className="code-buttons">{dimension.codes.filter((c) => c.active).map((code) => { const shortcut = activeCodes.findIndex((x) => x.c.id === code.id) + 1; const selected = current.segment.codeIds.includes(code.id); return <button key={code.id} className={selected ? "selected" : ""} style={{ "--code-color": code.color } as React.CSSProperties} onClick={() => toggleCode(dimension, code.id)} title={code.definition || code.name}><span>{selected ? "✓" : ""}</span>{code.name}{shortcut > 0 && shortcut <= 9 ? <kbd>{shortcut}</kbd> : null}</button>; })}<InlineNewCode onAdd={(name) => addCode(dimension.id, name)} /></div></section>)}</div>
    </aside>
  </div>;
}

function InlineNewCode({ onAdd }: { onAdd: (name: string) => void }) { const [open, setOpen] = useState(false); const [name, setName] = useState(""); if (!open) return <button className="new-code" onClick={() => setOpen(true)}>＋ New code</button>; return <div className="inline-new"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { e.stopPropagation(); onAdd(name.trim()); setName(""); setOpen(false); } if (e.key === "Escape") setOpen(false); }} placeholder="Code name" /><button onClick={() => { if (name.trim()) onAdd(name.trim()); setOpen(false); }}>Add</button></div>; }
function projectArticleIndex(flat: { doc: Document }[], id: string) { return Array.from(new Set(flat.map(({ doc }) => doc.id))).indexOf(id) + 1; }

function CodebookView({ dimensions, addDimension, patchDimension, addCode, patchCode }: { dimensions: Dimension[]; addDimension: () => void; patchDimension: (id: string, p: Partial<Dimension>) => void; addCode: (d: string) => void; patchCode: (d: string, c: string, p: Partial<Code>) => void }) {
  return <div className="page"><div className="page-heading"><div><p className="kicker">FRAMEWORK</p><h1>Codebook</h1><p>Shape your dimensions and codes. Archived codes remain attached to past annotations.</p></div><button className="primary-button compact" onClick={addDimension}>＋ Add dimension</button></div>
    <div className="codebook-list">{dimensions.map((dimension, index) => <section className="codebook-dimension" key={dimension.id}><div className="dimension-editor"><span className="color-swatch" style={{ background: dimension.color }}><input type="color" value={dimension.color} onChange={(e) => patchDimension(dimension.id, { color: e.target.value })} /></span><div><span className="eyebrow">DIMENSION {index + 1}</span><input className="dimension-name" value={dimension.name} onChange={(e) => patchDimension(dimension.id, { name: e.target.value.toUpperCase() })} /></div><label className="choice-label">Selection<select value={dimension.type} onChange={(e) => patchDimension(dimension.id, { type: e.target.value as "single" | "multiple" })}><option value="single">Single choice</option><option value="multiple">Multiple choice</option></select></label></div>
      <div className="code-table"><div className="code-row table-head"><span>Code</span><span>Definition</span><span>Origin</span><span>Status</span></div>{dimension.codes.map((code) => <div className={`code-row ${code.active ? "" : "archived"}`} key={code.id}><label className="code-name-field"><i style={{ background: code.color }} /><input value={code.name} onChange={(e) => patchCode(dimension.id, code.id, { name: e.target.value })} /></label><input value={code.definition} onChange={(e) => patchCode(dimension.id, code.id, { definition: e.target.value })} placeholder="Add a clear inclusion rule…" /><select value={code.origin} onChange={(e) => patchCode(dimension.id, code.id, { origin: e.target.value as Origin })}><option>A priori</option><option>Emergent</option></select><button className="status-button" onClick={() => patchCode(dimension.id, code.id, { active: !code.active })}>{code.active ? "Active" : "Archived"}</button></div>)}<button className="add-row" onClick={() => addCode(dimension.id)}>＋ Add code to {dimension.name}</button></div>
    </section>)}{!dimensions.length && <div className="empty-state"><span>▦</span><h3>Your codebook is empty</h3><p>Add a dimension, then create codes inside it.</p></div>}</div>
  </div>;
}

function ReviewView({ segments, onOpen }: { segments: { doc: Document; segment: Segment }[]; onOpen: (id: string) => void }) { const cases = segments.filter(({ segment }) => segment.reviewStatus !== "Coded"); return <div className="page"><div className="page-heading"><div><p className="kicker">QUALITY CHECK</p><h1>Review cases</h1><p>Revisit uncertain or flagged paragraphs before export.</p></div><span className="count-pill">{cases.length} cases</span></div><div className="review-list">{cases.map(({ doc, segment }) => <button className="review-row" key={segment.id} onClick={() => onOpen(segment.id)}><span className={`review-flag ${segment.reviewStatus === "Uncertain" ? "uncertain" : ""}`}>{segment.reviewStatus}</span><span><b>{doc.title}</b><p>{segment.text}</p><small>{segment.id} · Confidence: {segment.confidence}</small></span><span>→</span></button>)}{!cases.length && <div className="empty-state"><span>✓</span><h3>Nothing needs review</h3><p>Uncertain and flagged paragraphs will appear here.</p></div>}</div></div>; }

function AnalysisView({ dimensions, segments }: { dimensions: Dimension[]; segments: { segment: Segment }[] }) {
  const codedCount = segments.filter(({ segment }) => segment.touched).length || 1;
  const max = Math.max(1, ...dimensions.flatMap((d) => d.codes.map((c) => segments.filter(({ segment }) => segment.codeIds.includes(c.id)).length)));
  return <div className="page"><div className="page-heading"><div><p className="kicker">DESCRIPTIVE ANALYSIS</p><h1>Code frequencies</h1><p>A simple view of how often each code appears across coded paragraphs.</p></div><span className="count-pill">{codedCount} coded paragraphs</span></div><div className="analysis-list">{dimensions.map((dimension) => <section className="analysis-dimension" key={dimension.id}><div className="analysis-title"><span style={{ background: dimension.color }} /><h2>{dimension.name}</h2><small>{dimension.type === "single" ? "Single choice" : "Multiple choice"}</small></div>{dimension.codes.filter((c) => c.active).map((code) => <CodeFrequencyBar key={code.id} code={code} segments={segments} codedCount={codedCount} max={max} />)}</section>)}</div></div>;
}

function CodeFrequencyBar({ code, segments, codedCount, max }: { code: Code; segments: { segment: Segment }[]; codedCount: number; max: number }) {
  const count = segments.filter(({ segment }) => segment.codeIds.includes(code.id)).length;
  const pct = Math.round((count / codedCount) * 100);
  return <div className="bar-row"><span>{code.name}</span><div className="bar-track"><i style={{ width: `${(count / max) * 100}%`, background: code.color }} /></div><b>{count}</b><small>{pct}%</small></div>;
}

function ExportView({ exportCSVs, onBackup, importBackup, fileInput }: { exportCSVs: () => void; onBackup: () => void; importBackup: (e: ChangeEvent<HTMLInputElement>) => void; fileInput: React.RefObject<HTMLInputElement | null> }) { return <div className="page"><div className="page-heading"><div><p className="kicker">PORTABILITY</p><h1>Export data</h1><p>Take your coding into qualitative, quantitative, or model-evaluation workflows.</p></div></div><div className="export-grid"><section className="export-card featured"><span className="export-icon">CSV</span><h2>Analysis-ready files</h2><p>Download documents, segments, annotations, and the codebook as separate CSV files. Annotations use one segment-code pair per row.</p><ul><li>documents.csv</li><li>segments.csv</li><li>annotations.csv</li><li>codebook.csv</li></ul><button className="primary-button" onClick={exportCSVs}>Download 4 CSV files <span>↓</span></button></section><section className="export-card"><span className="export-icon">{`{ }`}</span><h2>Whole-project backup</h2><p>Save all texts, codes, annotations, memos, and project settings in one JSON file.</p><button className="secondary-button" onClick={onBackup}>Download backup</button><hr /><h3>Restore a backup</h3><p>Import a Fieldnote JSON backup on this device.</p><input ref={fileInput} type="file" accept="application/json,.json" onChange={importBackup} hidden /><button className="text-button import-backup" onClick={() => fileInput.current?.click()}>Choose backup file →</button></section></div><div className="privacy-note"><span>⌂</span><p><b>Your data stays local.</b><br />Nothing is uploaded to a server. Export a backup before clearing browser data or moving devices.</p></div></div>; }
