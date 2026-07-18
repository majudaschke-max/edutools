import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  COURSE_SOURCE_TYPES,
  cloneCourse,
  createBuiltInCourse,
  createCourse,
  createRuntimeCourseContext,
  createStableId,
  createUnit,
  createWord,
  duplicateCourse,
} from "../src/course-library/course-schema.js";
import { validateCourse } from "../src/course-library/course-validator.js";
import { createCourseLibraryState } from "../src/course-library/course-library-state.js";
import { createCourseLibraryStorage, COURSE_LIBRARY_KEY, ACTIVE_COURSE_KEY } from "../src/course-library/course-library-storage.js";
import { createCourseLibraryService } from "../src/course-library/course-library-service.js";
import { parseTabularText } from "../src/import/tabular-parser.js";
import { mapImportRow, suggestColumnMapping, validateColumnMapping } from "../src/import/import-mapper.js";
import { applyImportPreview, commitImport, commitNewCourseImport, createImportPreview } from "../src/import/vocabulary-importer.js";
import { importJsonCourse, parseJsonCourse } from "../src/import/json-course-importer.js";
import {
  COURSE_JSON_BATCH_ADAPTER_ID,
  COURSE_JSON_BATCH_INPUT_KIND,
} from "../src/import/adapters/course-json-batch-adapter.js";
import { importOrchestrator } from "../src/import/import-pipeline.js";
import { createCourseExport, downloadCourseExport } from "../src/import/course-exporter.js";
import {
  copyImportPromptToClipboard,
  createImportPrompt,
  createTabularImportTemplate,
  TABULAR_IMPORT_COLUMNS,
} from "../src/import/import-template.js";
import { createPromptGenerator } from "../src/prompts/prompt-generator.js";
import { createPromptLoader } from "../src/prompts/prompt-loader.js";
import { promptRegistry } from "../src/prompts/prompt-registry.js";
import { renderCourseLibraryView } from "../src/views/course-library-view.js";
import { renderCourseBuilderView, renderNewCourseImportView } from "../src/views/course-builder-view.js";
import { loadBuiltInCourseContext } from "../src/course-library/built-in-course.js";
import {
  createCourseLanguage,
  getLanguageDefinitions,
  resolveLanguageOcrModel,
} from "../src/languages/language-registry.js";

const NOW = "2026-07-14T12:00:00.000Z";
const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

const testPromptLoader = createPromptLoader({
  registry: promptRegistry,
  readText: (resource) => readFile(resource, "utf8"),
  digest: async (text) => createHash("sha256").update(text).digest("hex"),
});
const testPromptGenerator = createPromptGenerator({ loader: testPromptLoader });
const PROMPT_DEPENDENCIES = Object.freeze({ promptGenerator: testPromptGenerator });

function sequence(prefix = "id") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function validCourse(id = "local-course", metadata = {}) {
  const course = createCourse({
    id,
    title: "Englisch 7",
    createdAt: NOW,
    updatedAt: NOW,
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
    pronunciation: { enabled: true, rate: 0.9, pitch: 1, volume: 1 },
  }, {
    sourceType: metadata.sourceType,
    editable: metadata.editable,
  });
  const unit = createUnit({ id: `${id}-unit`, title: "Unit 1", order: 1, released: true, current: true });
  unit.words.push(createWord({ id: `${id}-word`, source: "island", targets: ["Insel"], hint: "Land im Wasser" }));
  course.units.push(unit);
  return course;
}

function bundledCourse(id = "built-in") {
  return validCourse(id, {
    sourceType: COURSE_SOURCE_TYPES.BUNDLED,
    editable: false,
  });
}

function memoryStorage() {
  const values = new Map();
  return {
    values,
    loadJson(key, fallback) { return values.has(key) ? JSON.parse(values.get(key)) : fallback; },
    saveJson(key, value) { values.set(key, JSON.stringify(value)); return true; },
    removeKey(key) { values.delete(key); return true; },
  };
}

class MiniNode {
  constructor(tagName, ownerDocument) { this.tagName = tagName; this.ownerDocument = ownerDocument; this.children = []; this.dataset = {}; this.attributes = new Map(); this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; this._text = ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class MiniDocument {
  createElement(tagName) { return new MiniNode(tagName, this); }
  createDocumentFragment() { return new MiniNode("fragment", this); }
}

function findNodes(root, predicate, result = []) {
  if (predicate(root)) result.push(root);
  root.children.forEach((child) => findNodes(child, predicate, result));
  return result;
}

function serviceFixture(options = {}) {
  const builtIn = bundledCourse();
  const memory = memoryStorage();
  const storage = createCourseLibraryStorage(memory);
  const state = createCourseLibraryState(builtIn.id, NOW);
  const service = createCourseLibraryService({ builtInCourse: builtIn, initialState: state, storage, idGenerator: options.idGenerator ?? sequence(), now: () => new Date(NOW) });
  return { builtIn, memory, service, storage };
}

test("leerer Kurs besitzt kanonische Version, App-Typ und sichere Defaults", () => {
  const course = createCourse({ title: "Leer", languages: { source: { code: "en", label: "Englisch", speechLocale: "en-GB" }, target: { code: "de", label: "Deutsch", speechLocale: "de-DE" } } }, { idGenerator: () => "abc", now: NOW });
  assert.equal(course.schemaVersion, 1);
  assert.equal(course.appType, "vocabulary");
  assert.equal(course.sourceType, COURSE_SOURCE_TYPES.OWN);
  assert.equal(course.editable, true);
  assert.deepEqual(course.units, []);
  assert.equal(validateCourse(course).valid, true);
});

test("injizierbare IDs sind stabil und nicht indexbasiert", () => {
  assert.equal(createStableId("word", () => "test-uuid"), "word-test-uuid");
  const word = createWord({ source: "one", targets: ["eins"] }, { idGenerator: () => "stable" });
  const edited = createWord({ ...word, source: "two" });
  assert.equal(edited.id, word.id);
});

test("Validator erkennt Pflichtfelder, Locale, mehrere aktuelle Lernpakete und doppelte IDs", () => {
  const course = validCourse();
  course.title = "";
  course.languages.source.speechLocale = "invalid_locale";
  course.units.push({ ...cloneCourse(validCourse("second")).units[0], id: course.units[0].id, current: true });
  const result = validateCourse(course);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Kurstitel/);
  assert.match(result.errors.join(" "), /speechLocale/);
  assert.match(result.errors.join(" "), /Lernpaket-ID/);
  assert.match(result.errors.join(" "), /Höchstens ein Lernpaket/);
});

test("Validator lehnt leere, doppelte und zu lange Wortfelder ab", () => {
  const course = validCourse();
  course.units[0].words[0].source = "x".repeat(201);
  course.units[0].words[0].targets = ["Insel", "insel"];
  const result = validateCourse(course);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /200 Zeichen/);
  assert.match(result.errors.join(" "), /mehrfach/);
});

test("Validator lehnt identische Ausgangs- und Zielsprachen verständlich ab", () => {
  const course = validCourse();
  course.languages.target = { ...course.languages.source };
  const result = validateCourse(course);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("Ausgangs- und Zielsprache müssen unterschiedlich sein."));
});

test("zentrale Sprachregistrierung liefert UI, Speech-Locale und OCR-Modell", () => {
  assert.deepEqual(
    getLanguageDefinitions().map(({ code, label }) => [code, label]),
    [["en", "Englisch"], ["de", "Deutsch"], ["fr", "Französisch"], ["la", "Latein"], ["es", "Spanisch"], ["it", "Italienisch"]],
  );
  assert.deepEqual(createCourseLanguage("Französisch"), {
    code: "fr", label: "Französisch", speechLocale: "fr-FR",
  });
  assert.equal(resolveLanguageOcrModel("es"), "spa");
  assert.equal(createCourseLanguage("unbekannt"), null);
});

test("Kurskopie erzeugt neue Kurs-, Unit- und Wort-IDs", () => {
  const copy = duplicateCourse(validCourse(), { idGenerator: sequence("copy"), now: NOW });
  assert.notEqual(copy.id, "local-course");
  assert.notEqual(copy.units[0].id, "local-course-unit");
  assert.notEqual(copy.units[0].words[0].id, "local-course-word");
  assert.equal(copy.units[0].words[0].targets[0], "Insel");
  assert.equal(copy.sourceType, COURSE_SOURCE_TYPES.DUPLICATED);
  assert.equal(copy.editable, true);
});

test("Runtime-Adapter schließt archivierte Inhalte und gesperrte Units aus", () => {
  const course = validCourse();
  course.units[0].words.push(createWord({ id: "archived-word", source: "hidden", targets: ["versteckt"], archived: true }));
  course.units.push(createUnit({ id: "locked", title: "Unit 2", order: 2, released: false }));
  const context = createRuntimeCourseContext(course, { dailyNewWordLimit: 5, dailyReviewLimit: 6 });
  assert.deepEqual(context.courseConfig.availableUnits, [course.units[0].id]);
  assert.equal(context.vocabularyData.units[0].words.length, 1);
  assert.equal(context.courseConfig.dailyReviewLimit, 6);
});

test("Storage lädt Initialzustand und hält aktiven Kurs separat", () => {
  const memory = memoryStorage();
  const storage = createCourseLibraryStorage(memory);
  const initial = storage.load("built-in", NOW);
  assert.equal(initial.state.activeCourseId, "built-in");
  initial.state.courses.push(validCourse());
  initial.state.activeCourseId = "local-course";
  assert.equal(storage.save(initial.state), true);
  assert.equal(memory.loadJson(ACTIVE_COURSE_KEY, null), "local-course");
  assert.equal(storage.load("built-in", NOW).state.courses.length, 1);
});

test("realer Built-in-Ladepfad liefert den aktuellen neutralen Fallback", async () => {
  const context = await loadBuiltInCourseContext({
    courseConfigUrl: new URL("../src/config/course-config.json", import.meta.url),
    vocabularyDataUrl: new URL("../src/data/vocabulary.json", import.meta.url),
    loadConfig: async (url) => JSON.parse(await readFile(url, "utf8")),
    loadVocabulary: async (url) => JSON.parse(await readFile(url, "utf8")),
  });
  const activeWords = context.builtInCourse.units
    .filter((unit) => unit.released && !unit.archived)
    .flatMap((unit) => unit.words.filter((word) => !word.archived));
  const cloudy = activeWords.find((word) => word.source === "cloudy");

  assert.equal(context.courseConfig.contentVersion, 3);
  assert.equal(context.vocabularyData.contentVersion, 3);
  assert.equal(context.builtInCourse.contentVersion, 3);
  assert.equal(context.builtInCourse.id, "neutral-language-course");
  assert.equal(context.builtInCourse.title, "Neutraler Sprachkurs");
  assert.equal(context.builtInCourse.sourceType, COURSE_SOURCE_TYPES.BUNDLED);
  assert.equal(context.builtInCourse.editable, false);
  assert.equal(cloudy?.hint, "When the sky is covered with clouds.");
  assert.equal(activeWords.every((word) => word.hint.length > 0), true);
  activeWords.forEach((word) => {
    const bundledWord = context.vocabularyData.units
      .flatMap((unit) => unit.words)
      .find((candidate) => candidate.id === word.id);
    assert.equal(word.hint, bundledWord?.hint);
  });
});

test("veralteter Built-in-Snapshot wird ersetzt, getrennte Zustände und eigene Kurse bleiben erhalten", async () => {
  const context = await loadBuiltInCourseContext({
    loadConfig: async () => JSON.parse(await readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8")),
    loadVocabulary: async () => JSON.parse(await readFile(new URL("../src/data/vocabulary.json", import.meta.url), "utf8")),
  });
  const memory = memoryStorage();
  const legacyBuiltIn = cloneCourse(context.builtInCourse);
  legacyBuiltIn.contentVersion = 1;
  legacyBuiltIn.units.flatMap((unit) => unit.words)
    .find((word) => word.source === "cloudy").hint = "Veralteter lokaler Inhalt";
  const own = validCourse("own-course");
  const imported = validCourse("imported-course", {
    sourceType: COURSE_SOURCE_TYPES.IMPORTED,
    editable: true,
  });
  const originalOwn = JSON.stringify(own);
  const originalImported = JSON.stringify(imported);
  memory.saveJson(COURSE_LIBRARY_KEY, {
    schemaVersion: 1,
    activeCourseId: context.builtInCourse.id,
    courses: [legacyBuiltIn, own, imported],
    createdAt: NOW,
    updatedAt: NOW,
  });
  memory.saveJson(ACTIVE_COURSE_KEY, context.builtInCourse.id);
  const learningKey = `edutools:vocabulary-trainer:${context.builtInCourse.id}:learning-state`;
  const motivationKey = `edutools:vocabulary-trainer:${context.builtInCourse.id}:motivation-state`;
  const learningState = { markedWord: "neutral-2-word-002", nextReviewAt: NOW };
  const motivationState = { xp: 42, currentStreak: 3 };
  memory.saveJson(learningKey, learningState);
  memory.saveJson(motivationKey, motivationState);

  const loaded = createCourseLibraryStorage(memory).load(context.builtInCourse, NOW);

  assert.equal(loaded.builtInUpdated, true);
  assert.equal(loaded.previousBuiltInContentVersion, 1);
  assert.deepEqual(loaded.state.courses.map((course) => course.id), ["own-course", "imported-course"]);
  assert.equal(JSON.stringify(loaded.state.courses[0]), originalOwn);
  assert.equal(JSON.stringify(loaded.state.courses[1]), originalImported);
  assert.deepEqual(memory.loadJson(learningKey, null), learningState);
  assert.deepEqual(memory.loadJson(motivationKey, null), motivationState);
  assert.equal(memory.loadJson(COURSE_LIBRARY_KEY, null).courses.some((course) => course.id === context.builtInCourse.id), false);
});

test("veraltete mitgelieferte Snapshots mit früherer ID verschwinden, lokale Kurse bleiben", () => {
  const current = bundledCourse("neutral-current");
  current.contentVersion = 3;
  const obsolete = bundledCourse("obsolete-bundle");
  const own = validCourse("own-stays");
  const memory = memoryStorage();
  memory.saveJson(COURSE_LIBRARY_KEY, {
    schemaVersion: 1,
    activeCourseId: obsolete.id,
    courses: [obsolete, own],
    createdAt: NOW,
    updatedAt: NOW,
  });
  memory.saveJson(ACTIVE_COURSE_KEY, obsolete.id);
  const loaded = createCourseLibraryStorage(memory).load(current, NOW);
  assert.deepEqual(loaded.state.courses.map(({ id }) => id), [own.id]);
  assert.equal(loaded.state.activeCourseId, current.id);
});

test("Bundled-Update hängt nur von stabiler ID, Herkunft und Inhaltsversion ab", () => {
  const bundled = bundledCourse("bundle-neutral");
  bundled.title = "Cours de français";
  bundled.contentVersion = 7;
  bundled.languages = {
    source: { code: "fr", label: "Französisch", speechLocale: "fr-FR" },
    target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
  };
  const staleBundled = cloneCourse(bundled);
  staleBundled.title = "Beliebiger früherer Name";
  staleBundled.contentVersion = 6;
  const own = validCourse("own-fr-de");
  own.title = bundled.title;
  own.contentVersion = 1;
  own.languages = cloneCourse(bundled).languages;
  const imported = validCourse("imported-fr-de", {
    sourceType: COURSE_SOURCE_TYPES.IMPORTED,
    editable: true,
  });
  imported.title = bundled.title;
  imported.contentVersion = 1;
  imported.languages = cloneCourse(bundled).languages;
  const ownBefore = JSON.stringify(own);
  const importedBefore = JSON.stringify(imported);
  const memory = memoryStorage();
  memory.saveJson(COURSE_LIBRARY_KEY, {
    schemaVersion: 1,
    activeCourseId: bundled.id,
    courses: [staleBundled, own, imported],
    createdAt: NOW,
    updatedAt: NOW,
  });

  const loaded = createCourseLibraryStorage(memory).load(bundled, NOW);

  assert.equal(loaded.builtInUpdated, true);
  assert.equal(loaded.previousBuiltInContentVersion, 6);
  assert.equal(JSON.stringify(loaded.state.courses[0]), ownBefore);
  assert.equal(JSON.stringify(loaded.state.courses[1]), importedBefore);
});

test("mehrere mitgelieferte Kurse werden anhand ihrer eigenen Metadaten aktualisiert", () => {
  const first = bundledCourse("bundle-first");
  first.contentVersion = 3;
  const second = bundledCourse("bundle-second");
  second.contentVersion = 5;
  const oldFirst = cloneCourse(first);
  oldFirst.contentVersion = 2;
  const oldSecond = cloneCourse(second);
  oldSecond.contentVersion = 4;
  const local = validCourse("local-kept");
  const memory = memoryStorage();
  memory.saveJson(COURSE_LIBRARY_KEY, {
    schemaVersion: 1,
    activeCourseId: second.id,
    courses: [oldFirst, oldSecond, local],
    createdAt: NOW,
    updatedAt: NOW,
  });
  memory.saveJson(ACTIVE_COURSE_KEY, second.id);

  const loaded = createCourseLibraryStorage(memory).load([first, second], NOW);
  assert.deepEqual(
    loaded.bundledUpdates.map(({ courseId, updated }) => [courseId, updated]),
    [[first.id, true], [second.id, true]],
  );
  assert.deepEqual(loaded.state.courses.map(({ id }) => id), [local.id]);
  assert.equal(loaded.state.activeCourseId, second.id);

  const service = createCourseLibraryService({
    bundledCourses: [first, second],
    initialState: loaded.state,
    storage: createCourseLibraryStorage(memory),
  });
  assert.deepEqual(
    service.listCourses().filter(({ builtIn }) => builtIn).map(({ id }) => id),
    [first.id, second.id],
  );
});

test("beschädigte Bibliothek wird isoliert verworfen", () => {
  const memory = memoryStorage();
  memory.values.set(COURSE_LIBRARY_KEY, JSON.stringify({ schemaVersion: 99, courses: [] }));
  const loaded = createCourseLibraryStorage(memory).load("built-in", NOW);
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.state.activeCourseId, "built-in");
  assert.equal(memory.values.has(COURSE_LIBRARY_KEY), false);
});

test("Service erstellt, bearbeitet, dupliziert, archiviert und löscht lokale Kurse", () => {
  const { service } = serviceFixture();
  const local = service.createLocalCourse({ ...validCourse("seed"), id: "" });
  assert.equal(service.listCourses().length, 2);
  assert.equal(service.listLocalCourses().length, 1);
  const renamed = service.updateCourse({ ...local, title: "Neu" });
  assert.equal(renamed.title, "Neu");
  const copy = service.duplicateCourse(local.id);
  assert.notEqual(copy.id, local.id);
  service.archiveCourse(copy.id, true);
  assert.equal(service.getCourse(copy.id).archived, true);
  service.deleteCourse(copy.id);
  assert.equal(service.getCourse(copy.id), null);
});

test("leere Author-Bibliothek zeigt nur den Einstieg für eigene Kurse", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderCourseLibraryView({ container, courses: [], enabled: true });
  assert.match(container.textContent, /Noch kein eigener Kurs/);
  assert.match(container.textContent, /Vokabelliste importieren/);
  assert.match(container.textContent, /Vokabelseite mit KI vorbereiten/);
  assert.match(container.textContent, /Kurs manuell anlegen/);
  assert.match(container.textContent, /Kurs aus JSON importieren/);
  assert.match(container.textContent, /Als neuen Kurs importieren/);
  assert.match(container.textContent, /EduTools-Backup wiederherstellen/);
  assert.equal(findNodes(container, (node) => Object.hasOwn(node.dataset, "courseJsonImportSection"))[0].tagName, "section");
  assert.doesNotMatch(container.textContent, /Tabelle importieren|Kursdatei importieren/);
  assert.doesNotMatch(container.textContent, /Buchseite|Book Capture|Bildimport/);
  assert.doesNotMatch(container.textContent, /Mitgelieferter Kurs/);
});

test("neue Kursansicht bleibt fachlich und verbirgt technische Eingabefelder", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderCourseBuilderView({ container, enabled: true, snapshot: null });
  for (const label of ["Kurstitel", "Ausgangssprache", "Zielsprache", "Untertitel (optional)", "Schulart (optional)", "Jahrgangsstufe (optional)", "Beschreibung (optional)"]) {
    assert.match(container.textContent, new RegExp(label.replace(/[()]/g, "\\$&")));
  }
  assert.match(container.textContent, /Erweiterte Spracheinstellungen/);
  assert.doesNotMatch(container.textContent, /Speech-Locale|Aussprachetempo|Lautstärke|Pitch/);
});

test("Service verwaltet Units und erzwingt höchstens eine aktuelle Unit", () => {
  const { service } = serviceFixture();
  service.addCourse(validCourse());
  const updated = service.addUnit("local-course", { title: "Unit 2", released: true });
  const second = updated.units[1];
  service.updateUnit("local-course", second.id, { current: true, released: true });
  assert.equal(service.getCourse("local-course").units.filter((unit) => unit.current).length, 1);
  service.moveUnit("local-course", second.id, "up");
  assert.equal(service.getCourse("local-course").units[0].id, second.id);
  service.updateUnit("local-course", second.id, { archived: true });
  assert.equal(service.getCourse("local-course").units[0].current, false);
});

test("Service verwaltet Wörter bei stabiler ID und unterstützt Wiederherstellung", () => {
  const { service } = serviceFixture();
  service.addCourse(validCourse());
  const unitId = "local-course-unit";
  service.addWord("local-course", unitId, { source: "castle", targets: ["Burg", "Schloss"] });
  const added = service.getCourse("local-course").units[0].words.at(-1);
  service.updateWord("local-course", unitId, added.id, { source: "the castle", archived: true });
  assert.equal(service.getCourse("local-course").units[0].words.at(-1).id, added.id);
  assert.equal(service.getCourse("local-course").units[0].words.at(-1).archived, true);
  service.updateWord("local-course", unitId, added.id, { archived: false });
  assert.equal(service.getCourse("local-course").units[0].words.at(-1).archived, false);
});

test("aktiver Kurs ist speicherbar und Archivieren fällt auf eingebauten Kurs zurück", () => {
  const { service } = serviceFixture();
  service.addCourse(validCourse());
  service.setActiveCourse("local-course");
  assert.equal(service.getState().activeCourseId, "local-course");
  service.archiveCourse("local-course", true);
  assert.equal(service.getState().activeCourseId, "built-in");
});

test("Parser erkennt Tabulator, Semikolon und Komma", () => {
  assert.equal(parseTabularText("source\ttarget\nisland\tInsel").detectedDelimiter, "\t");
  assert.equal(parseTabularText("source;target\nisland;Insel").detectedDelimiter, ";");
  assert.equal(parseTabularText("source,target\nisland,Insel").detectedDelimiter, ",");
});

test("neutrale CSV-Vorlage behält die tabellarische Importstruktur", () => {
  const template = createTabularImportTemplate();
  assert.equal(template.startsWith("\uFEFF"), true);
  assert.match(template, new RegExp(TABULAR_IMPORT_COLUMNS.join(",")));
  assert.match(template, /Reise\|Fahrt/);
  assert.doesNotMatch(template, /Green Line|Lehrwerk|Verlag/);
});

function promptSchema(prompt) {
  const start = prompt.indexOf("BEGINN EDUTOOLS-JSON-BEISPIEL") + "BEGINN EDUTOOLS-JSON-BEISPIEL".length;
  const end = prompt.indexOf("ENDE EDUTOOLS-JSON-BEISPIEL");
  assert.equal(start > 0 && end > start, true);
  return JSON.parse(prompt.slice(start, end).trim());
}

test("adaptiver Import-Prompt bettet das reale direkt importierbare Schema ein", async () => {
  const prompt = await createImportPrompt({
    title: "Englisch 7",
    sourceLanguage: "en",
    targetLanguage: "de",
  }, PROMPT_DEPENDENCIES);
  const schema = promptSchema(prompt);
  assert.equal(schema.schemaVersion, 1);
  assert.equal(schema.appType, "vocabulary");
  assert.equal(schema.title, "Englisch 7");
  assert.deepEqual(schema.languages.source, { code: "en", label: "Englisch", speechLocale: "en-GB" });
  assert.deepEqual(schema.languages.target, { code: "de", label: "Deutsch", speechLocale: "de-DE" });
  assert.deepEqual(Object.keys(schema).sort(), ["appType", "description", "gradeLevel", "languages", "schoolType", "schemaVersion", "subtitle", "title", "units"].sort());
  assert.deepEqual(Object.keys(schema.units[0]).sort(), ["archived", "current", "description", "order", "released", "title", "words"].sort());
  assert.deepEqual(Object.keys(schema.units[0].words[0]).sort(), ["archived", "example", "hint", "phonetic", "source", "tags", "targets"].sort());
  const text = JSON.stringify(schema);
  const session = importOrchestrator.prepareImport({
    adapterId: COURSE_JSON_BATCH_ADAPTER_ID,
    input: {
      kind: COURSE_JSON_BATCH_INPUT_KIND,
      files: [{ name: "edutools-vocabulary-englisch-7.json", type: "application/json", size: text.length, text }],
    },
  });
  assert.equal(session.valid, true);
  const imported = importOrchestrator.materializeImport(
    importOrchestrator.createImportPlan(session, { strategy: "add" }),
    { idGenerator: sequence("prompt"), now: NOW },
  ).course;
  assert.equal(imported.schemaVersion, 1);
  assert.equal(imported.sourceType, COURSE_SOURCE_TYPES.OWN);
  assert.match(imported.id, /^course-/);
  assert.match(imported.units[0].id, /^unit-/);
  assert.match(imported.units[0].words[0].id, /^word-/);
  assert.doesNotMatch(prompt, /\[(?:durch die App|EXAKTES|SOURCE|TARGET|KURSNAME)/i);
});

test("Import-Prompt wertet dritte Spalte, farbige Kästen und unterstützte Felder aus", async () => {
  const prompt = await createImportPrompt({}, PROMPT_DEPENDENCIES);
  assert.match(prompt, /dritte beziehungsweise ganz rechte Spalte/);
  assert.match(prompt, /Satz.*Ausgangssprache.*example/);
  assert.match(prompt, /Sonderformen.*hint/);
  assert.match(prompt, /gelber, farbiger oder hervorgehobener Kasten/);
  assert.match(prompt, /Fake-Vokabel/);
  assert.match(prompt, /Seitenzahlen.*p\. 12.*S\. 12/);
  assert.match(prompt, /Randnummern.*Tabellenlinien.*Layouttexte/);
});

test("Import-Prompt ergänzt nur sichere didaktisch sinnvolle Inhalte", async () => {
  const prompt = await createImportPrompt({}, PROMPT_DEPENDENCIES);
  assert.match(prompt, /Fehlt phonetic.*IPA-Lautschrift/);
  assert.match(prompt, /Fehlt example.*genau einen kurzen/);
  assert.match(prompt, /Fehlt hint.*echtem fachlichem Mehrwert/);
  assert.match(prompt, /Ein leeres hint ist besser/);
  assert.match(prompt, /keine Platzhalter wie n\/a, kein Hinweis oder –/);
  assert.match(prompt, /keine vollständigen Konjugationstabellen/);
});

test("Import-Prompt schützt Vorlageninhalt und bindet Ergänzungen an die Target-Bedeutung", async () => {
  const prompt = await createImportPrompt({}, PROMPT_DEPENDENCIES);
  assert.match(prompt, /Vorhandener Inhalt hat immer Vorrang/);
  assert.match(prompt, /Targets bestimmen den Bedeutungskontext/);
  assert.match(prompt, /Ersetze keine vorhandene Lautschrift, keinen vorhandenen Beispielsatz/);
  assert.match(prompt, /unsichere Korrektur.*Source-Begriff.*Prüfbericht/);
  assert.match(prompt, /keine sichtbaren KI-Präfixe und keine KI-Tags/);
});

test("Import-Prompt verlangt Datei und separaten nachvollziehbaren Prüfbericht", async () => {
  const prompt = await createImportPrompt(
    { title: "Neutraler Kurs", sourceLanguage: "fr", targetLanguage: "de" },
    PROMPT_DEPENDENCIES,
  );
  assert.match(prompt, /direkt herunterladbare UTF-8-Dateien/);
  assert.match(prompt, /niemals Markdown, Erläuterungen oder der Prüfbericht/);
  assert.match(prompt, /vollständigen ungekürzten JSON-Inhalt/);
  assert.match(prompt, /phonetic getrennt/);
  assert.match(prompt, /Source-Begriffe aller Einträge/);
  assert.match(prompt, /Französisch \(Code fr, Locale fr-FR\)/);
});

test("Import-Prompt wird ausschließlich über eine injizierte Zwischenablage kopiert", async () => {
  const calls = [];
  const text = await copyImportPromptToClipboard(
    { title: "Kopiert", sourceLanguage: "en", targetLanguage: "de" },
    {
      ...PROMPT_DEPENDENCIES,
      clipboard: { writeText(value) { calls.push(value); return Promise.resolve(); } },
    },
  );
  assert.deepEqual(calls, [text]);
  assert.match(text, /Kursname: Kopiert/);
  assert.doesNotMatch(copyImportPromptToClipboard.toString(), /fetch|XMLHttpRequest|WebSocket|OpenAI/i);
});

test("Parser unterstützt korrekt zitierte Felder, Kommas und Zeilenumbrüche", () => {
  const parsed = parseTabularText('source,target,example\n"island","Insel","First, then\nsecond"');
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows[0][2], "First, then\nsecond");
});

test("Parser erhält UTF-8-BOM, Umlaute, Apostrophe und IPA verlustfrei", () => {
  const parsed = parseTabularText("\uFEFFsource;target;phonetic;example\ncan't;Können;ˈkɑːnt;Äußere Übung");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.headers, ["source", "target", "phonetic", "example"]);
  assert.deepEqual(parsed.rows[0], ["can't", "Können", "ˈkɑːnt", "Äußere Übung"]);
});

test("leere Datei, unbekannte Spalten, doppelte Header und reine Kopfzeile bleiben transparent", () => {
  const empty = parseTabularText("");
  assert.match(empty.errors.join(" "), /keine Tabellenwerte/);
  const headersOnly = parseTabularText("source;target;intern");
  assert.equal(headersOnly.rows.length, 0);
  assert.deepEqual(suggestColumnMapping(headersOnly.headers), ["source", "target", "ignore"]);
  const duplicate = suggestColumnMapping(["source", "source", "target"]);
  assert.deepEqual(duplicate, ["source", "ignore", "target"]);
  assert.equal(validateColumnMapping(duplicate, 3).valid, true);
});

test("Parser unterstützt Tabellen ohne Überschrift", () => {
  const parsed = parseTabularText("island\tInsel\ncastle\tBurg", { hasHeaders: false });
  assert.deepEqual(parsed.headers, ["Spalte 1", "Spalte 2"]);
  assert.equal(parsed.rows.length, 2);
});

test("Parser meldet unbekanntes Trennzeichen und unvollständige Zitate", () => {
  assert.match(parseTabularText("nur ein Wert").errors.join(" "), /Trennzeichen/);
  assert.match(parseTabularText('source,target\n"island,Insel').errors.join(" "), /nicht vollständig/);
});

test("Parser begrenzt Dateigröße und Datenzeilen", () => {
  assert.match(parseTabularText("source,target\na,b\nc,d", { maxRows: 1 }).errors.join(" "), /höchstens 1/);
  assert.match(parseTabularText("source,target\na,b", { maxBytes: 4 }).errors.join(" "), /größer als 2 MB/);
});

test("Spaltenzuordnung schlägt bekannte Header vor und bleibt änderbar", () => {
  const mapping = suggestColumnMapping(["english", "german", "hint", "unit"]);
  assert.deepEqual(mapping, ["source", "target", "hint", "unit"]);
  assert.equal(validateColumnMapping(mapping, 4).valid, true);
  assert.equal(validateColumnMapping(["source", "ignore"], 2).valid, false);
});

test("Mapper unterstützt mehrere Zielspalten, optionale Felder und Tags", () => {
  const row = mapImportRow(["castle", "Burg|Schloss", "Festung", "travel|noun", "Unit 2"], ["source", "target", "target", "tags", "unit"]);
  assert.deepEqual(row.targets, ["Burg", "Schloss", "Festung"]);
  assert.deepEqual(row.tags, ["travel", "noun"]);
  assert.equal(row.unitTitle, "Unit 2");
});

function importFixture(text = "source;target\nisland;Eiland\ncastle;Burg") {
  const course = validCourse();
  const parsed = parseTabularText(text);
  return { course, parsed, mapping: suggestColumnMapping(parsed.headers), defaultUnitId: course.units[0].id, idGenerator: sequence("import") };
}

function emptyImportCourse(id = "direct-import") {
  return createCourse({
    id,
    title: "Mein Vokabelkurs",
    languages: {
      source: createCourseLanguage("en"),
      target: createCourseLanguage("de"),
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function neutralImportText(count = 19) {
  const rows = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const target = number === 1 ? "Begriff 1|Alternative 1" : `Begriff ${number}`;
    const unit = number <= Math.min(15, count) ? "Grundlagen" : "Vertiefung";
    return `concept ${number};${target};${unit};;;;`;
  });
  return ["Ausgangsbegriff;Übersetzung;Unit;Lautschrift;Hinweis;Beispiel;Tags", ...rows].join("\n");
}

function neutralImportPreview(count = 19) {
  const course = emptyImportCourse();
  const parsed = parseTabularText(neutralImportText(count));
  return {
    course,
    parsed,
    mapping: suggestColumnMapping(parsed.headers),
    preview: createImportPreview({
      course,
      parsed,
      mapping: suggestColumnMapping(parsed.headers),
      newUnitTitle: "Unit 1",
      idGenerator: sequence("neutral"),
    }),
  };
}

test("Importvorschau verändert den Kurs nicht und zählt gültig, Fehler, Duplikate und neue Units", () => {
  const fixture = importFixture("source;target;unit\nisland;Eiland;Unit 1\n;leer;Unit 1\ncastle;Burg;Unit 2");
  const before = JSON.stringify(fixture.course);
  const preview = createImportPreview(fixture);
  assert.equal(JSON.stringify(fixture.course), before);
  assert.equal(preview.counts.read, 3);
  assert.equal(preview.counts.errors, 1);
  assert.equal(preview.counts.duplicates, 1);
  assert.equal(preview.counts.newUnits, 1);
});

test("neue Units, mehrere Übersetzungen und leere optionale Felder sind regulär gültig", () => {
  const { preview } = neutralImportPreview();
  assert.deepEqual(preview.counts, {
    read: 19,
    valid: 19,
    errors: 0,
    warnings: 0,
    duplicates: 0,
    newUnits: 2,
  });
  assert.deepEqual(preview.newUnitSummaries.map(({ title, wordCount }) => [title, wordCount]), [
    ["Grundlagen", 15],
    ["Vertiefung", 4],
  ]);
  assert.equal(preview.rows.every((row) => row.status === "Gültig"), true);
  assert.deepEqual(preview.rows[0].word.targets, ["Begriff 1", "Alternative 1"]);
  assert.deepEqual(preview.rows[0].warnings, []);
});

test("nur gefüllte, nicht verwendete Spalten erzeugen einen Prüfhinweis", () => {
  const course = emptyImportCourse();
  const parsed = parseTabularText("Ausgangsbegriff;Übersetzung;Unit;Notiz\nconcept;Begriff;Grundlagen;intern");
  const preview = createImportPreview({
    course,
    parsed,
    mapping: suggestColumnMapping(parsed.headers),
    newUnitTitle: "Unit 1",
    idGenerator: sequence("warning"),
  });
  assert.equal(preview.counts.warnings, 1);
  assert.equal(preview.rows[0].status, "Zu prüfen");
  assert.match(preview.rows[0].warnings[0], /Nicht zugeordnete Inhalte/);
});

test("Direktimport speichert einen vollständigen Kurs atomar, dauerhaft und nur einmal", () => {
  const { builtIn, memory, service } = serviceFixture({ idGenerator: sequence("service") });
  const { preview } = neutralImportPreview();
  const result = commitNewCourseImport({ service, preview, strategy: "skip", idGenerator: sequence("word"), now: NOW });
  assert.equal(result.course.units.length, 2);
  assert.equal(result.course.units[0].current, true);
  assert.equal(result.course.units.reduce((sum, unit) => sum + unit.words.length, 0), 19);
  assert.throws(() => commitNewCourseImport({ service, preview, strategy: "skip" }), /bereits gespeichert/);

  const storage = createCourseLibraryStorage(memory);
  const loaded = storage.load([builtIn], NOW);
  const reloaded = createCourseLibraryService({
    bundledCourses: [builtIn],
    initialState: loaded.state,
    storage,
    idGenerator: sequence("reload"),
    now: () => new Date(NOW),
  });
  const stored = reloaded.getCourse(result.course.id);
  assert.equal(stored.title, "Mein Vokabelkurs");
  assert.deepEqual(stored.units.map((unit) => unit.words.length), [15, 4]);
  const roundTrip = parseJsonCourse(createCourseExport(stored, NOW).text);
  assert.equal(roundTrip.units.reduce((sum, unit) => sum + unit.words.length, 0), 19);
});

test("Direktimport zeigt Kursdaten, kompakte Vorschau und sofort erreichbaren Speicherbereich", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  const { course, parsed, mapping, preview } = neutralImportPreview();
  renderCourseBuilderView({
    container,
    enabled: true,
    snapshot: null,
    startWithTabularImport: true,
    importModel: {
      mode: "new-course",
      courseInput: { title: "Mein Vokabelkurs", sourceLanguage: "en", targetLanguage: "de", description: "" },
      draft: course,
      parsed,
      mapping,
      preview,
      newUnitTitle: "Unit 1",
      hasHeaders: true,
    },
  });
  assert.match(container.textContent, /Name des neuen Kurses/);
  assert.match(container.textContent, /Ausgangssprache/);
  assert.match(container.textContent, /Zielsprache/);
  assert.match(container.textContent, /Importübersicht/);
  assert.match(container.textContent, /19 Vokabeln in 2 Lernpaketen speichern/);
  assert.match(container.textContent, /Kurs speichern/);
  assert.doesNotMatch(container.textContent, /Import übernehmen|Tabelle importieren|Mapping|Schema/);
  assert.equal(findNodes(container, (node) => node.className === "import-save-bar").length, 1);
  assert.equal(findNodes(container, (node) => node.tagName === "table" && node.className === "import-preview-table").length, 1);
});

test("lange Importlisten bleiben in einer standardmäßig geschlossenen Detailansicht", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  const { course, parsed, mapping, preview } = neutralImportPreview(100);
  renderCourseBuilderView({
    container,
    enabled: true,
    snapshot: null,
    startWithTabularImport: true,
    importModel: {
      mode: "new-course",
      courseInput: { title: "Langer Kurs", sourceLanguage: "en", targetLanguage: "de", description: "" },
      draft: course,
      parsed,
      mapping,
      preview,
      newUnitTitle: "Unit 1",
    },
  });
  const details = findNodes(container, (node) => node.tagName === "details" && node.className === "import-valid-rows")[0];
  assert.ok(details);
  assert.equal(details.attributes.has("open"), false);
  assert.match(details.textContent, /Gültige Vokabeln ansehen \(100\)/);
});

test("Duplikate werden per Unicode, Großschreibung und Mehrfachleerzeichen erkannt", () => {
  const fixture = importFixture("source;target\n  ISLAND  ;Eiland");
  const preview = createImportPreview(fixture);
  assert.equal(preview.rows[0].status, "Duplikat");
});

test("Duplikatstrategie überspringen behält vorhandenes Wort", () => {
  const fixture = importFixture("source;target\nisland;Eiland");
  const result = applyImportPreview(createImportPreview(fixture), "skip", { idGenerator: fixture.idGenerator, now: NOW });
  assert.deepEqual(result.course.units[0].words[0].targets, ["Insel"]);
  assert.equal(result.skipped, 1);
});

test("Duplikatstrategie zusammenführen behält ID und ergänzt Targets ohne gefüllte Felder zu überschreiben", () => {
  const fixture = importFixture("source;target;hint\nisland;Eiland;Neuer Hinweis");
  const result = applyImportPreview(createImportPreview(fixture), "merge", { idGenerator: fixture.idGenerator, now: NOW });
  assert.equal(result.course.units[0].words[0].id, "local-course-word");
  assert.deepEqual(result.course.units[0].words[0].targets, ["Insel", "Eiland"]);
  assert.equal(result.course.units[0].words[0].hint, "Land im Wasser");
});

test("Duplikatstrategie ersetzen behält ID und ersetzt Inhalte", () => {
  const fixture = importFixture("source;target\nisland;Eiland");
  const result = applyImportPreview(createImportPreview(fixture), "replace", { idGenerator: fixture.idGenerator, now: NOW });
  assert.equal(result.course.units[0].words[0].id, "local-course-word");
  assert.deepEqual(result.course.units[0].words[0].targets, ["Eiland"]);
});

test("bestätigter Import speichert atomar und blockiert dieselbe Vorschau doppelt", () => {
  const { service } = serviceFixture();
  service.addCourse(validCourse());
  const fixture = importFixture("source;target\ncastle;Burg");
  const preview = createImportPreview(fixture);
  commitImport({ service, preview, strategy: "skip", idGenerator: fixture.idGenerator, now: NOW });
  assert.equal(service.getCourse("local-course").units[0].words.length, 2);
  assert.throws(() => commitImport({ service, preview, strategy: "skip" }), /bereits übernommen/);
});

test("Speicherfehler lässt Servicezustand beim Import unverändert", () => {
  const builtIn = bundledCourse();
  const initial = createCourseLibraryState("built-in", NOW);
  initial.courses.push(validCourse());
  const service = createCourseLibraryService({ builtInCourse: builtIn, initialState: initial, storage: { save: () => false }, idGenerator: sequence() });
  const fixture = importFixture("source;target\ncastle;Burg");
  assert.throws(() => commitImport({ service, preview: createImportPreview(fixture), strategy: "skip" }), /gespeichert/);
  assert.equal(service.getCourse("local-course").units[0].words.length, 1);
});

test("JSON-Import baut gültige Kursdaten neu auf", () => {
  const parsed = parseJsonCourse(JSON.stringify(validCourse()));
  assert.equal(parsed.id, "local-course");
  assert.equal(parsed.sourceType, COURSE_SOURCE_TYPES.IMPORTED);
  assert.equal(parsed.editable, true);
  assert.notEqual(parsed, validCourse());
});

test("JSON-Import kann sich nicht als mitgelieferter Kurs ausgeben", () => {
  const external = validCourse("external-course", {
    sourceType: COURSE_SOURCE_TYPES.BUNDLED,
    editable: false,
  });
  const parsed = parseJsonCourse(JSON.stringify(external));
  assert.equal(parsed.sourceType, COURSE_SOURCE_TYPES.IMPORTED);
  assert.equal(parsed.editable, true);
});

test("Course Builder erhält Sprachen, Units, vollständige Wortfelder und Austauschformate", () => {
  const { service } = serviceFixture({ idGenerator: sequence("builder") });
  const course = service.createLocalCourse({
    title: "Französisch lokal",
    languages: {
      source: { code: "fr", label: "Französisch", speechLocale: "fr-FR" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
  });
  const withUnit = service.addUnit(course.id, {
    title: "Unité 1",
    released: true,
    current: true,
  });
  const unitId = withUnit.units[0].id;
  const withWord = service.addWord(course.id, unitId, {
    source: "château",
    targets: ["Burg", "Schloss"],
    phonetic: "ʃɑ.to",
    hint: "Un grand bâtiment fortifié.",
    example: "Le château domine la vallée.",
    tags: ["nom", "bâtiment"],
  });
  const word = withWord.units[0].words[0];
  assert.deepEqual(word.targets, ["Burg", "Schloss"]);
  assert.deepEqual(
    [word.phonetic, word.hint, word.example, word.tags.join("|")],
    ["ʃɑ.to", "Un grand bâtiment fortifié.", "Le château domine la vallée.", "nom|bâtiment"],
  );

  const preview = createImportPreview({
    course: withWord,
    parsed: parseTabularText("source;target;hint;unit\nbonjour;Guten Tag;Une salutation.;Unité 1"),
    mapping: ["source", "target", "hint", "unit"],
    defaultUnitId: unitId,
    idGenerator: sequence("tabular"),
  });
  const imported = applyImportPreview(preview, "skip", { idGenerator: sequence("tabular"), now: NOW });
  assert.equal(imported.course.units[0].words.length, 2);

  const exported = createCourseExport(imported.course, NOW);
  const roundTrip = parseJsonCourse(exported.text);
  assert.equal(roundTrip.languages.source.code, "fr");
  assert.equal(roundTrip.units[0].words.length, 2);
  assert.equal(roundTrip.sourceType, COURSE_SOURCE_TYPES.IMPORTED);
});

test("JSON-Import lehnt ungültiges JSON, App-Typ, Schema und doppelte IDs ab", () => {
  assert.throws(() => parseJsonCourse("{"), /gültiges JSON/);
  const wrongApp = validCourse(); wrongApp.appType = "reading";
  assert.throws(() => parseJsonCourse(JSON.stringify(wrongApp)), /appType/);
  const wrongSchema = validCourse(); wrongSchema.schemaVersion = 2;
  assert.throws(() => parseJsonCourse(JSON.stringify(wrongSchema)), /schemaVersion/);
  const duplicate = validCourse(); duplicate.units[0].words.push({ ...duplicate.units[0].words[0] });
  assert.throws(() => parseJsonCourse(JSON.stringify(duplicate)), /Wort-ID/);
});

test("JSON-Import lehnt gefährliche Schlüssel rekursiv ab", () => {
  const text = JSON.stringify(validCourse()).replace('"subtitle":""', '"subtitle":"","__proto__":{"polluted":true}');
  assert.throws(() => parseJsonCourse(text), /unzulässigen Schlüssel/);
  assert.equal({}.polluted, undefined);
});

test("gleiche JSON-Kurs-ID kann als neue Kopie importiert werden", () => {
  const { service } = serviceFixture({ idGenerator: sequence("json") });
  service.addCourse(validCourse());
  const copy = importJsonCourse({ service, text: JSON.stringify(validCourse()), conflict: "new", idGenerator: sequence("copy"), now: NOW });
  assert.notEqual(copy.id, "local-course");
  assert.equal(service.listCourses().length, 3);
});

test("JSON-Export enthält nur Kursinhalt und einen stabilen Dateinamen", () => {
  const course = validCourse();
  course.gradeLevel = "7";
  const exported = createCourseExport(course, NOW);
  assert.equal(exported.filename, "edutools-vocabulary-englisch-7-jahrgang-7.json");
  assert.equal(exported.text.includes("learningState"), false);
  assert.equal(exported.text.includes("motivation"), false);
  assert.equal(exported.text.includes("session"), false);
});

test("Course Builder trennt JSON-Sicherung und individuelles SCORM-Lernpaket", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  const course = validCourse();
  course.units[0].words.push(createWord({
    id: "local-course-word-2",
    source: "castle",
    targets: ["Burg", "Schloss"],
  }));
  renderCourseBuilderView({
    container,
    enabled: true,
    snapshot: { draft: course, dirty: false },
    selectedUnitId: course.units[0].id,
    importModel: null,
  });
  assert.match(container.textContent, /EduTools-Kursdatei sichern \(\.json\)/);
  assert.match(container.textContent, /Zum Sichern und späteren Bearbeiten in EduTools/);
  assert.match(container.textContent, /Lernpaket für ByCS erstellen \(\.zip\)/);
  assert.match(container.textContent, /1 freigegebenes Lernpaket · 2 Wörter · Englisch → Deutsch/);
  assert.match(container.textContent, /SCORM-Lernpaket herunterladen/);
  assert.match(container.textContent, /ZIP-Datei nicht entpacken/);
  assert.equal(findNodes(container, (node) => node.dataset.editorAction === "export").length, 1);
  assert.equal(findNodes(container, (node) => node.dataset.editorAction === "export-scorm").length, 1);
  const status = findNodes(container, (node) => Object.hasOwn(node.dataset, "scormExportStatus"))[0];
  assert.equal(status.attributes.get("role"), "status");
  assert.equal(status.attributes.get("aria-live"), "polite");
});

test("eingeklappte Prompt-Hilfe erklärt externe Verarbeitung und fachliche Prüfung", () => {
  const documentRoot = new MiniDocument();
  const existingContainer = documentRoot.createElement("div");
  renderCourseBuilderView({
    container: existingContainer,
    enabled: true,
    snapshot: { draft: validCourse(), dirty: false },
    selectedUnitId: "local-course-unit",
    importModel: null,
  });
  const newImportContainer = documentRoot.createElement("div");
  renderNewCourseImportView(newImportContainer, {
    mode: "new-course",
    courseInput: { title: "Neu", sourceLanguage: "en", targetLanguage: "de" },
  });
  for (const container of [existingContainer, newImportContainer]) {
    assert.match(container.textContent, /Vokabelseite mit KI vorbereiten/);
    assert.match(container.textContent, /dritte Spalte/);
    assert.match(container.textContent, /Prüfe automatisch ergänzte Inhalte/);
    assert.match(container.textContent, /EduTools selbst überträgt keine Bilder, Dateien oder Kursdaten/);
    assert.match(container.textContent, /selbst, welchen externen Dienst/);
    assert.match(container.textContent, /Upload und Verarbeitung erfolgen außerhalb von EduTools/);
    assert.equal(findNodes(container, (node) => node.tagName === "details" && node.className === "course-import-help").length, 1);
    assert.equal(findNodes(container, (node) => node.dataset.editorAction === "copy-import-prompt").length, 1);
  }
});

test("Prompt-Patch führt keine KI-SDK- oder API-Abhängigkeit ein", async () => {
  const [metadata, templateSource, runtimeSource] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../src/import/import-template.js", import.meta.url), "utf8"),
    readFile(new URL("../src/course-library/course-runtime.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(metadata, /openai|anthropic|generative-ai|langchain|ai-sdk/i);
  assert.doesNotMatch(`${templateSource}\n${runtimeSource}`, /api\.openai|fetch\(|XMLHttpRequest|WebSocket|EventSource/i);
  assert.match(runtimeSource, /copyImportPromptToClipboard/);
  assert.match(runtimeSource, /Import-Prompt wurde kopiert\./);
});

test("Browserdownload gibt die Objekt-URL immer frei", () => {
  const calls = [];
  const link = { hidden: false, click() { calls.push("click"); }, remove() { calls.push("remove"); } };
  const fakeDocument = { createElement: () => link, body: { append: () => calls.push("append") } };
  const fakeURL = { createObjectURL: () => "blob:test", revokeObjectURL: (url) => calls.push(`revoke:${url}`) };
  class FakeBlob { constructor(parts) { this.parts = parts; } }
  downloadCourseExport(validCourse(), { document: fakeDocument, URL: fakeURL, Blob: FakeBlob, now: NOW });
  assert.deepEqual(calls, ["append", "click", "remove", "revoke:blob:test"]);
});

test("App-Shell enthält direkte Routen, versionierte Inhalte, native Dateiinputs, Live-Region und Featureflag", async () => {
  const [html, app, config, tokens, authoringCss] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8"),
    readFile(new URL("../../../design-system/css/tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/authoring.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-route-view="\/courses"/);
  assert.match(html, /data-route-view="\/course-builder"/);
  assert.match(html, /data-course-live aria-live="polite"/);
  assert.match(app, /\?content=\$\{BUNDLED_CONTENT_VERSION\}/);
  assert.equal(JSON.parse(config).features.courseBuilder.enabled, true);
  assert.match(tokens, /--touch-target-min:/);
  assert.match(authoringCss, /min-block-size: var\(--touch-target-min\)/);
});

test("deaktivierter Course Builder zeigt einen verständlichen Zustand", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderCourseLibraryView({ container, courses: [], enabled: false });
  assert.match(container.textContent, /Kursverwaltung ist deaktiviert/);
  assert.match(container.textContent, /vollständig nutzbar/);
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
console.log(`\n${tests.length - failures}/${tests.length} Kursbibliotheks- und Importtests bestanden.`);
if (failures > 0) process.exitCode = 1;
