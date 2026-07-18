import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { createBuildFilePlan } from "../build/build-file-plan.js";
import {
  COURSE_SOURCE_TYPES,
  createCourse,
  createUnit,
  createWord,
} from "../src/course-library/course-schema.js";
import { validateCourse } from "../src/course-library/course-validator.js";
import { createCourseJsonRestoreAdapter } from "../src/import/adapters/course-json-restore-adapter.js";
import { createTabularTextAdapter } from "../src/import/adapters/tabular-text-adapter.js";
import { createImportAdapterRegistry } from "../src/import/core/import-adapter-registry.js";
import { createImportDraft } from "../src/import/core/import-draft.js";
import { validateImportDraft } from "../src/import/core/import-draft-validator.js";
import {
  commitCourseRestore,
  materializeContentImport,
  materializeCourseRestore,
} from "../src/import/core/import-materializer.js";
import {
  normalizeImportComparisonKey,
  normalizeImportDraft,
} from "../src/import/core/import-normalizer.js";
import { createImportOrchestrator } from "../src/import/core/import-orchestrator.js";
import { importOrchestrator } from "../src/import/import-pipeline.js";
import { createImportPreview } from "../src/import/vocabulary-importer.js";

const NOW = "2026-07-16T08:00:00.000Z";
const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

function sequence(prefix = "id") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function validCourse(id = "course-existing") {
  const course = createCourse({
    id,
    title: "Englisch 7",
    createdAt: NOW,
    updatedAt: NOW,
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
  }, { sourceType: COURSE_SOURCE_TYPES.OWN, editable: true });
  const unit = createUnit({ id: `${id}-unit`, title: "Unit 1", order: 1, released: true, current: true });
  unit.words.push(createWord({ id: `${id}-word`, source: "island", targets: ["Insel"] }));
  course.units.push(unit);
  return course;
}

function contentContext(overrides = {}) {
  return {
    intent: "create",
    title: "Importkurs",
    sourceLanguage: "en",
    targetLanguage: "de",
    ...overrides,
  };
}

test("ImportDraft enthält ausschließlich fachliche Felder und keine technischen IDs", () => {
  const draft = createImportDraft({
    id: "forbidden-course-id",
    contentVersion: 9,
    intent: "create",
    sourceKind: "test",
    course: { title: "Kurs", description: "", sourceLanguage: "en", targetLanguage: "de", deploymentId: "forbidden" },
    units: [{ id: "forbidden-unit-id", title: "Unit 1", words: [{
      id: "forbidden-word-id", source: "island", targets: ["Insel"], phonetic: "", hint: "", example: "", tags: [],
    }] }],
  });
  assert.deepEqual(Object.keys(draft), ["draftVersion", "intent", "sourceKind", "course", "units"]);
  assert.equal("id" in draft, false);
  assert.equal("deploymentId" in draft.course, false);
  assert.equal("id" in draft.units[0], false);
  assert.equal("id" in draft.units[0].words[0], false);
});

test("ImportDraft-Normalisierung ist deterministisch, idempotent und inhaltsschonend", () => {
  const draft = createImportDraft({
    intent: "create",
    sourceKind: "test",
    course: { title: "  Café  ", description: "  Test  ", sourceLanguage: " EN ", targetLanguage: "de" },
    units: [{ title: " Unit 1 ", words: [{
      source: "  I\u0301sland  ", targets: [" Insel ", "insel", "Eiland"], phonetic: " ", hint: " ", example: " ", tags: [" Nomen ", "nomen"],
    }] }],
  });
  const once = normalizeImportDraft(draft);
  const twice = normalizeImportDraft(once);
  assert.deepEqual(twice, once);
  assert.equal(once.units[0].words[0].source, "Ísland");
  assert.deepEqual(once.units[0].words[0].targets, ["Insel", "Eiland"]);
  assert.deepEqual(once.units[0].words[0].tags, ["Nomen"]);
  assert.equal(normalizeImportComparisonKey("  New   York "), "new york");
});

test("ImportDraft-Validator liefert konkrete Pfade, Codes und Maßnahmen", () => {
  const result = validateImportDraft({
    draftVersion: 1,
    intent: "create",
    sourceKind: "test",
    course: { title: "", description: "", sourceLanguage: "xx", targetLanguage: "de", contentVersion: 4 },
    units: [{ title: "", words: [{ id: "external", source: "", targets: [], phonetic: "", hint: "", example: "", tags: [] }] }],
  });
  const codes = result.issues.map((issue) => issue.code);
  assert.equal(result.valid, false);
  for (const code of ["course.title.required", "language.source.invalid", "unit.title.required", "word.source.required", "word.targets.required", "import.field.unknown"]) {
    assert.ok(codes.includes(code), code);
  }
  assert.ok(result.issues.every((issue) => issue.message && issue.path && issue.action));
});

test("ImportDraft-Validator erkennt Datentypen, Feldlängen und doppelte Wörter", () => {
  const draft = createImportDraft({
    intent: "create",
    sourceKind: "test",
    course: { title: "Kurs", description: "", sourceLanguage: "en", targetLanguage: "de" },
    units: [{ title: "Unit 1", words: [
      { source: "x".repeat(201), targets: ["Begriff"], phonetic: "", hint: "", example: "", tags: [] },
      { source: "  X".repeat(201), targets: "keine-liste", phonetic: "", hint: "", example: "", tags: [] },
    ] }],
  });
  const result = validateImportDraft(normalizeImportDraft(draft));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "word.field.too-long"));
  assert.ok(result.issues.some((issue) => issue.code === "word.targets.type"));
});

test("Adapter-Registry lehnt doppelte Adapter ab und löst Quellen ohne Switch auf", () => {
  const adapter = createTabularTextAdapter();
  assert.throws(() => createImportAdapterRegistry([adapter, adapter]), /mehrfach/);
  const registry = createImportAdapterRegistry([adapter, createCourseJsonRestoreAdapter()]);
  assert.equal(registry.resolve({ kind: "tabular-text", text: "source;target\na;b" }).id, "tabular-text");
  assert.equal(registry.resolve({ kind: "course-json", text: "{}" }).id, "course-json-restore");
  assert.throws(() => registry.resolve({ kind: "unknown" }), /kein Adapter/);
});

test("CSV und TSV desselben Inhalts ergeben denselben normalisierten ImportDraft", () => {
  const csv = importOrchestrator.prepareImport({
    adapterId: "tabular-text",
    input: { kind: "tabular-text", text: "source,target,unit\nisland,Insel,Unit 1" },
    context: contentContext(),
  });
  const tsv = importOrchestrator.prepareImport({
    adapterId: "tabular-text",
    input: { kind: "tabular-text", text: "source\ttarget\tunit\nisland\tInsel\tUnit 1" },
    context: contentContext(),
  });
  assert.equal(csv.valid, true);
  assert.equal(tsv.valid, true);
  assert.deepEqual(csv.payload, tsv.payload);
});

test("Tabellenadapter verknüpft strukturierte Fehler mit der realen Zeile", () => {
  const session = importOrchestrator.prepareImport({
    adapterId: "tabular-text",
    input: { kind: "tabular-text", text: "source;target;unit\nisland;;Unit 1" },
    context: contentContext(),
  });
  const issue = session.issues.find((candidate) => candidate.code === "word.targets.required");
  assert.equal(session.valid, false);
  assert.equal(issue.location.line, 2);
  assert.match(issue.path, /targets/);
});

test("Bestehende Tabellenvorschau wird intern vom gemeinsamen Orchestrator gespeist", () => {
  const course = validCourse();
  const preview = createImportPreview({
    course,
    parsed: { headers: ["source", "target"], rows: [["castle", "Burg"]], rowNumbers: [2], errors: [], warnings: [], detectedDelimiter: ";" },
    mapping: ["source", "target"],
    defaultUnitId: course.units[0].id,
    idGenerator: sequence("preview"),
  });
  assert.equal(preview.importSession.adapterId, "tabular-text");
  assert.equal(preview.importSession.payloadKind, "content");
  assert.equal(preview.rows[0].word.source, "castle");
  assert.equal(preview.counts.valid, 1);
});

test("Content-Materializer erzeugt technische Kursdaten erst nach erfolgreicher Planung", () => {
  const session = importOrchestrator.prepareImport({
    adapterId: "tabular-text",
    input: { kind: "tabular-text", text: "source;target;unit\nisland;Insel;Unit 1" },
    context: contentContext(),
  });
  assert.equal(JSON.stringify(session.payload).includes('"id"'), false);
  const plan = importOrchestrator.createImportPlan(session, { strategy: "skip" });
  const result = importOrchestrator.materializeImport(plan, { idGenerator: sequence("materialized"), now: NOW });
  assert.match(result.course.id, /^course-materialized-/);
  assert.match(result.course.units[0].id, /^unit-materialized-/);
  assert.match(result.course.units[0].words[0].id, /^word-materialized-/);
  assert.equal(result.course.sourceType, COURSE_SOURCE_TYPES.OWN);
  assert.equal(result.course.units[0].current, true);
  assert.equal(validateCourse(result.course).valid, true);
});

test("Orchestrator speichert einen ImportPlan atomar höchstens einmal", () => {
  const session = importOrchestrator.prepareImport({
    adapterId: "tabular-text",
    input: { kind: "tabular-text", text: "source;target;unit\nisland;Insel;Unit 1" },
    context: contentContext(),
  });
  const plan = importOrchestrator.createImportPlan(session);
  const calls = [];
  const service = {
    addCourse(course) { calls.push(course.id); return course; },
    updateCourse() { throw new Error("unerwartet"); },
  };
  const result = importOrchestrator.commitImport(plan, { service, idGenerator: sequence("commit"), now: NOW });
  assert.equal(result.imported, 1);
  assert.equal(calls.length, 1);
  assert.throws(() => importOrchestrator.commitImport(plan, { service }), /bereits gespeichert/);
  assert.equal(calls.length, 1);
});

test("Ein zusätzlicher Inhaltsadapter benötigt keine Änderung am Orchestrator", () => {
  const markdownAdapter = Object.freeze({
    id: "markdown-table",
    version: 1,
    acceptedKinds: Object.freeze(["markdown"]),
    canHandle: (input) => input?.kind === "markdown",
    decode: (input) => ({ value: input.text, issues: [] }),
    adapt: () => ({
      payloadKind: "content",
      draft: createImportDraft({
        intent: "create", sourceKind: "markdown",
        course: { title: "Markdown", description: "", sourceLanguage: "en", targetLanguage: "de" },
        units: [{ title: "Unit 1", words: [{ source: "island", targets: ["Insel"], phonetic: "", hint: "", example: "", tags: [] }] }],
      }),
      provenance: null,
      issues: [],
    }),
  });
  const orchestrator = createImportOrchestrator({
    adapters: [markdownAdapter],
    materializers: { content: materializeContentImport },
    committers: { content: (materialized) => materialized },
  });
  const session = orchestrator.prepareImport({ input: { kind: "markdown", text: "island | Insel" } });
  assert.equal(session.valid, true);
  assert.equal(orchestrator.getRegisteredAdapters()[0].id, "markdown-table");
  assert.equal(orchestrator.materializeImport(orchestrator.createImportPlan(session), { idGenerator: sequence(), now: NOW }).imported, 1);
});

test("JSON-Restore läuft durch denselben Orchestrator und erzwingt importierte Herkunft", () => {
  const external = validCourse();
  external.sourceType = COURSE_SOURCE_TYPES.BUNDLED;
  external.editable = false;
  const session = importOrchestrator.prepareImport({
    adapterId: "course-json-restore",
    input: { kind: "course-json", text: JSON.stringify(external) },
  });
  assert.equal(session.valid, true);
  assert.equal(session.payloadKind, "restore");
  assert.equal(session.payload.course.id, external.id);
  assert.equal(session.payload.course.sourceType, COURSE_SOURCE_TYPES.IMPORTED);
  assert.equal(session.payload.course.editable, true);
});

test("Restore-Materializer erhält IDs beim Ersetzen und erneuert sie bei einer Kopie", () => {
  const existing = validCourse();
  const session = importOrchestrator.prepareImport({
    adapterId: "course-json-restore",
    input: { kind: "course-json", text: JSON.stringify(existing) },
  });
  const service = { getCourse: (id) => id === existing.id ? existing : null };
  const replace = materializeCourseRestore(importOrchestrator.createImportPlan(session, { conflict: "replace" }), { service });
  const copy = materializeCourseRestore(importOrchestrator.createImportPlan(session, { conflict: "new" }), {
    service, idGenerator: sequence("copy"), now: NOW,
  });
  assert.equal(replace.course.id, existing.id);
  assert.equal(replace.course.units[0].words[0].id, existing.units[0].words[0].id);
  assert.notEqual(copy.course.id, existing.id);
  assert.notEqual(copy.course.units[0].id, existing.units[0].id);
  assert.notEqual(copy.course.units[0].words[0].id, existing.units[0].words[0].id);
});

test("Restore-Commit verwendet weiterhin ausschließlich den CourseLibraryService", () => {
  const course = validCourse();
  const calls = [];
  const service = {
    addCourse(value) { calls.push(["add", value.id]); return value; },
    updateCourse(value) { calls.push(["update", value.id]); return value; },
  };
  commitCourseRestore({ course, operation: "update" }, null, { service });
  commitCourseRestore({ course, operation: "add" }, null, { service });
  assert.deepEqual(calls, [["update", course.id], ["add", course.id]]);
});

test("Neue Importmodule bleiben physisch auf den Author-Build begrenzt", async () => {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const author = await createBuildFilePlan({ repositoryRoot, profile: { mode: "author", features: {} } });
  const learner = await createBuildFilePlan({
    repositoryRoot,
    profile: { mode: "learner", features: { motivation: false, pronunciation: false, speedChallenge: false } },
  });
  const authorFiles = author.map((entry) => entry.destination);
  const learnerFiles = learner.map((entry) => entry.destination);
  assert.ok(authorFiles.includes("import/core/import-orchestrator.js"));
  assert.ok(authorFiles.includes("import/adapters/tabular-text-adapter.js"));
  assert.equal(learnerFiles.some((file) => file.startsWith("import/")), false);
});

let failures = 0;
for (const { name, callback } of tests) {
  try {
    await callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} Importarchitektur-Tests bestanden.`);
if (failures > 0) process.exitCode = 1;
