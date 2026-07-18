import assert from "node:assert/strict";

import {
  COURSE_JSON_BATCH_ADAPTER_ID,
  COURSE_JSON_BATCH_INPUT_KIND,
  createCourseJsonBatchAdapter,
} from "../src/import/adapters/course-json-batch-adapter.js";
import { importOrchestrator } from "../src/import/import-pipeline.js";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

const LANGUAGES = {
  source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
  target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
};

function word(source, targets = [`Übersetzung ${source}`]) {
  return { source, targets, phonetic: "", hint: "", example: "", tags: [], archived: false };
}

function unit(title, order, words, overrides = {}) {
  return {
    title,
    description: "",
    order,
    released: true,
    current: order === 1,
    archived: false,
    words,
    ...overrides,
  };
}

function course(units, overrides = {}) {
  return {
    schemaVersion: 1,
    appType: "vocabulary",
    title: "Neutraler Mehrfachkurs",
    subtitle: "",
    description: "",
    schoolType: "",
    gradeLevel: "",
    languages: LANGUAGES,
    units,
    ...overrides,
  };
}

function file(name, data) {
  return { name, type: "application/json", size: JSON.stringify(data).length, text: JSON.stringify(data) };
}

function prepare(files) {
  return importOrchestrator.prepareImport({
    adapterId: COURSE_JSON_BATCH_ADAPTER_ID,
    input: { kind: COURSE_JSON_BATCH_INPUT_KIND, files },
  });
}

function idSequence(prefix = "batch") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function commit(session, exactDuplicateStrategy = "keep", serviceOverride = null) {
  const saved = [];
  const service = serviceOverride ?? {
    addCourse(value) { saved.push(value); return value; },
    updateCourse() { throw new Error("unerwartet"); },
  };
  const plan = importOrchestrator.createImportPlan(session, { strategy: "add", exactDuplicateStrategy });
  const result = importOrchestrator.commitImport(plan, {
    service,
    idGenerator: idSequence(),
    now: "2026-07-17T12:00:00.000Z",
  });
  return { result, saved };
}

function generatedWords(prefix, count, special = {}) {
  return Array.from({ length: count }, (_entry, index) => word(special[index] ?? `${prefix} ${index + 1}`));
}

test("JSON-Mehrfachadapter ist im gemeinsamen Orchestrator registriert", () => {
  assert.ok(importOrchestrator.getRegisteredAdapters().some((entry) => entry.id === COURSE_JSON_BATCH_ADAPTER_ID));
  assert.equal(createCourseJsonBatchAdapter().canHandle({ kind: COURSE_JSON_BATCH_INPUT_KIND, files: [] }), true);
});

test("eine gültige Datei erzeugt Vorschau und genau einen materialisierten Kurs", () => {
  const session = prepare([file("neutraler-mehrfachkurs.json", course([
    unit("Unit 1", 2, [word("second")], { current: false }),
    unit("Starter", 1, [word("first")], { current: false }),
  ]))]);
  assert.equal(session.valid, true);
  assert.deepEqual(session.provenance.preview, {
    title: "Neutraler Mehrfachkurs", fileCount: 1, unitCount: 2, wordCount: 2,
    sourceLanguage: "en", targetLanguage: "de", unitTitles: ["Starter", "Unit 1"],
  });
  const { result, saved } = commit(session);
  assert.equal(saved.length, 1);
  assert.deepEqual(result.course.units.map((entry) => entry.order), [1, 2]);
  assert.equal(result.course.units.filter((entry) => entry.current).length, 1);
  assert.equal(result.course.units[0].current, true);
});

test("drei realistische neutrale Kursdateien ergeben 7 Units und 116 unveränderte Einträge", () => {
  const special = {
    0: "(to) turn sth. on",
    1: "How are they/you?",
    2: "(to) have a notebook / a pencil",
    3: "places near the river ...",
    4: "I'd like some water/juice/...",
  };
  const files = [
    file("edutools-neutral-teil-1.json", course([
      unit("Unit 1", 1, generatedWords("U1", 17, special)),
      unit("Unit 2", 2, generatedWords("U2", 17)),
      unit("Unit 3", 3, generatedWords("U3", 16)),
    ])),
    file("edutools-neutral-teil-2.json", course([
      unit("Unit 4", 4, generatedWords("U4", 18), { current: true }),
      unit("Unit 5", 5, generatedWords("U5", 17), { current: false }),
    ])),
    file("edutools-neutral-teil-3.json", course([
      unit("Unit 6", 6, generatedWords("U6", 16), { current: true }),
      unit("Unit 7", 7, generatedWords("U7", 15), { current: false }),
    ])),
  ];
  const session = prepare(files);
  assert.equal(session.valid, true);
  assert.equal(session.provenance.preview.fileCount, 3);
  assert.equal(session.provenance.preview.unitCount, 7);
  assert.equal(session.provenance.preview.wordCount, 116);
  assert.ok(session.issues.some((issue) => issue.code === "batch.unit.current.multiple"));
  const { result, saved } = commit(session);
  assert.equal(saved.length, 1);
  assert.equal(result.course.units.length, 7);
  assert.equal(result.course.units.flatMap((entry) => entry.words).length, 116);
  assert.deepEqual(result.course.units.map((entry) => entry.order), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(result.course.units.filter((entry) => entry.current).length, 1);
  assert.deepEqual(result.course.units[0].words.slice(0, 5).map((entry) => entry.source), Object.values(special));
  assert.deepEqual(result.course.units[0].words[0].targets, ["Übersetzung (to) turn sth. on"]);
});

test("dieselbe Unit in mehreren Dateien wird stabil und sichtbar zusammengeführt", () => {
  const session = prepare([
    file("teil-1.json", course([unit("Unit 3", 3, [word("alpha"), word("beta")], { current: false })])),
    file("teil-2.json", course([unit("Unit 3", 3, [word("gamma"), word("delta")], { current: true })])),
  ]);
  assert.equal(session.valid, true);
  assert.equal(session.payload.units.length, 1);
  assert.deepEqual(session.payload.units[0].words.map((entry) => entry.source), ["alpha", "beta", "gamma", "delta"]);
  assert.ok(session.issues.some((issue) => issue.code === "batch.unit.merged"));
});

test("exakte Unicode- und Whitespace-Duplikate werden nur nach gewählter Entscheidung übersprungen", () => {
  const duplicateA = word("cafe\u0301  au lait", ["Milchkaffee", "Café au lait"]);
  const duplicateB = word("café au   lait", ["Café au lait", "Milchkaffee"]);
  const differentMeaning = word("café au lait", ["Kaffee mit Milch"]);
  const files = [file("duplikate.json", course([unit("Unit 1", 1, [duplicateA, duplicateB, differentMeaning])]))];
  const keepSession = prepare(files);
  assert.equal(keepSession.valid, true);
  assert.equal(keepSession.provenance.duplicates.length, 1);
  assert.equal(commit(keepSession, "keep").result.imported, 3);
  const skipResult = commit(prepare(files), "skip").result;
  assert.equal(skipResult.imported, 2);
  assert.equal(skipResult.skipped, 1);
  assert.deepEqual(skipResult.course.units[0].words.map((entry) => entry.targets), [
    ["Milchkaffee", "Café au lait"], ["Kaffee mit Milch"],
  ]);
});

test("optionale Metadaten verwenden stabil den ersten nicht leeren Wert und melden Konflikte", () => {
  const session = prepare([
    file("teil-1.json", course([unit("Unit 1", 1, [word("one")])], { description: "Erste Beschreibung" })),
    file("teil-2.json", course([unit("Unit 2", 2, [word("two")])], { description: "Andere Beschreibung", gradeLevel: "6" })),
  ]);
  assert.equal(session.valid, true);
  assert.equal(session.payload.course.description, "Erste Beschreibung");
  assert.equal(session.payload.course.gradeLevel, "6");
  assert.ok(session.issues.some((issue) => issue.code === "batch.metadata.conflict"));
});

test("nicht zusammengehörige Titel und Sprachkonfigurationen blockieren den gesamten Import", () => {
  const cases = [
    course([unit("Unit 2", 2, [word("two")])], { title: "Anderer Kurs" }),
    course([unit("Unit 2", 2, [word("two")])], {
      languages: { source: { code: "fr", label: "Französisch", speechLocale: "fr-FR" }, target: LANGUAGES.target },
    }),
  ];
  cases.forEach((other) => {
    const session = prepare([
      file("teil-1.json", course([unit("Unit 1", 1, [word("one")])])),
      file("teil-2.json", other),
    ]);
    assert.equal(session.valid, false);
    assert.ok(session.issues.some((issue) => issue.code === "batch.course.identity-conflict"));
  });
});

test("falscher appType und falsche schemaVersion werden pro Datei abgelehnt", () => {
  for (const [overrides, code] of [
    [{ appType: "grammar" }, "batch.app-type.conflict"],
    [{ schemaVersion: 2 }, "batch.schema-version.conflict"],
  ]) {
    const session = prepare([file("invalid.json", course([unit("Unit 1", 1, [word("one")])], overrides))]);
    assert.equal(session.valid, false);
    assert.ok(session.issues.some((issue) => issue.code === code));
    assert.equal(session.provenance.files[0].status, "error");
  }
});

test("technische Fremd-IDs werden beim Neuimport verworfen statt übernommen", () => {
  const value = course([unit("Unit 1", 1, [word("one")])], { id: "course-external" });
  value.units[0].id = "unit-external";
  value.units[0].words[0].id = "word-external";
  const session = prepare([file("technical.json", value)]);
  assert.equal(session.valid, true);
  assert.ok(session.issues.some((issue) => issue.code === "batch.field.technical-ignored"));
  assert.equal(session.provenance.files[0].status, "warning");
});

test("beschädigtes JSON, fehlende Pflichtwerte, leere targets und leere Units blockieren", () => {
  const corrupt = prepare([{ name: "corrupt.json", type: "application/json", size: 2, text: "{" }]);
  assert.equal(corrupt.valid, false);
  assert.ok(corrupt.issues.some((issue) => issue.code === "batch.file.invalid-json"));
  const missing = course([unit("Unit 1", 1, [word("one")])]);
  delete missing.title;
  const missingSession = prepare([file("missing.json", missing)]);
  assert.equal(missingSession.valid, false);
  assert.ok(missingSession.issues.some((issue) => issue.code === "batch.text.required"));
  const emptyTargets = prepare([file("targets.json", course([unit("Unit 1", 1, [word("one", [])])]))]);
  assert.equal(emptyTargets.valid, false);
  assert.ok(emptyTargets.issues.some((issue) => issue.code === "batch.targets.required"));
  const emptyUnit = prepare([file("empty.json", course([unit("Unit 1", 1, [])]))]);
  assert.equal(emptyUnit.valid, false);
  assert.ok(emptyUnit.issues.some((issue) => issue.code === "batch.words.required"));
});

test("doppelte oder widersprüchliche order-Werte werden stabil auf 1..n normalisiert", () => {
  const session = prepare([file("orders.json", course([
    unit("Unit C", 2, [word("c")], { current: false }),
    unit("Unit A", 1, [word("a")]),
    unit("Unit B", 1, [word("b")], { current: false }),
  ]))]);
  assert.equal(session.valid, true);
  assert.ok(session.issues.some((issue) => issue.code === "batch.unit.order.duplicate"));
  assert.deepEqual(session.payload.units.map((entry) => entry.title), ["Unit A", "Unit B", "Unit C"]);
  assert.deepEqual(session.payload.units.map((entry) => entry.order), [1, 2, 3]);
});

test("ein fehlerhafter Dateiteil und ein Speicherfehler erzeugen niemals einen Teilkurs", () => {
  const invalid = prepare([
    file("valid.json", course([unit("Unit 1", 1, [word("one")])])),
    { name: "broken.json", type: "application/json", size: 2, text: "{" },
  ]);
  assert.equal(invalid.valid, false);
  assert.throws(() => importOrchestrator.createImportPlan(invalid), /fehlerhafte/);

  let writes = 0;
  const valid = prepare([file("valid.json", course([unit("Unit 1", 1, [word("one")])]))]);
  const service = {
    addCourse() { throw new Error("Storage nicht verfügbar"); },
    updateCourse() { writes += 1; },
  };
  assert.throws(() => commit(valid, "keep", service), /Storage nicht verfügbar/);
  assert.equal(writes, 0);
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

if (failures > 0) {
  console.error(`\n${failures}/${tests.length} JSON-Mehrfachimport-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} JSON-Mehrfachimport-Tests bestanden.`);
}
