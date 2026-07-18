import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createAiImportController } from "../src/ai-import/ai-import-controller.js";
import { COURSE_JSON_RESTORE_ADAPTER_ID } from "../src/import/adapters/course-json-restore-adapter.js";
import { importOrchestrator } from "../src/import/import-pipeline.js";
import { importJsonCourse, parseJsonCourse } from "../src/import/json-course-importer.js";
import {
  DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION,
  VOCABULARY_IMPORT_PROMPT_TYPE,
  promptRegistry,
} from "../src/prompts/prompt-registry.js";
import { renderAiImportView } from "../src/views/ai-import-view.js";
import { renderNewCourseImportView } from "../src/views/course-builder-view.js";
import { renderCourseLibraryView } from "../src/views/course-library-view.js";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

class MiniNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this._text = "";
    this.className = "";
    this.hidden = false;
    this.value = "";
    this.checked = false;
    this.disabled = false;
  }

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

function hasDescendant(root, predicate) {
  return root.children.some((child) => predicate(child) || hasDescendant(child, predicate));
}

function aiViewModel(overrides = {}) {
  return {
    courseName: "Testkurs",
    sourceLanguage: "en",
    targetLanguage: "de",
    errors: {},
    prompt: "",
    status: "",
    selectedFiles: [],
    importIssues: [],
    importStatus: "",
    preview: null,
    duplicateChoice: "keep",
    duplicates: [],
    canImport: false,
    selectedImages: [],
    imageStatus: "",
    responseText: "",
    responseIssues: [],
    responseStatus: "",
    responsePreview: null,
    canImportResponse: false,
    ...overrides,
  };
}

const realCourseUrl = new URL("../profiles/production/courses/release-roundtrip.production.json", import.meta.url);

test("aktive Promptversion import-v1 fordert tatsächlich EduTools-JSON-Dateien an", async () => {
  const definition = promptRegistry.get(VOCABULARY_IMPORT_PROMPT_TYPE);
  assert.equal(definition.version, DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION);
  assert.equal(definition.version, "import-v1");
  const template = await readFile(definition.resource, "utf8");
  assert.match(template, /vollständig importierbare EduTools-JSON-Kursdateien/);
  assert.match(template, /direkt herunterladbare UTF-8-Dateien/);
  assert.match(template, /JSON-Codeblöcke.*Fallback/s);
});

test("sichtbarer Bibliotheksbereich trennt JSON-Neuimport und kanonischen Restore", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderCourseLibraryView({ container, courses: [], enabled: true });

  const sections = findNodes(container, (node) => Object.hasOwn(node.dataset, "courseJsonImportSection"));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].tagName, "section");
  assert.match(sections[0].textContent, /Kurs aus JSON importieren/);
  assert.match(sections[0].textContent, /Als neuen Kurs importieren/);
  assert.match(sections[0].textContent, /EduTools-Backup wiederherstellen/);
  assert.equal(findNodes(sections[0], (node) => node.tagName === "details").length, 0);

  const input = findNodes(sections[0], (node) => node.attributes.get("type") === "file")[0];
  assert.equal(input.attributes.get("accept"), ".json,application/json");
  assert.equal(input.attributes.has("required"), true);
  assert.match(sections[0].textContent, /JSON-Datei auswählen/);
  const submit = findNodes(sections[0], (node) => Object.hasOwn(node.dataset, "courseJsonImportSubmit"))[0];
  assert.equal(submit.textContent, "JSON als neuen Kurs importieren");
});

test("drei Importwege bleiben in der Author-Oberfläche klar getrennt", () => {
  const documentRoot = new MiniDocument();
  const library = documentRoot.createElement("div");
  renderCourseLibraryView({ container: library, courses: [], enabled: true });
  assert.match(library.textContent, /Vokabelliste importieren/);
  assert.match(library.textContent, /Vokabelseite mit KI vorbereiten/);
  assert.match(library.textContent, /Kurs aus JSON importieren/);

  const tabular = documentRoot.createElement("div");
  renderNewCourseImportView(tabular, {
    mode: "new-course",
    courseInput: { title: "Testkurs", sourceLanguage: "en", targetLanguage: "de" },
  });
  const tabularFile = findNodes(tabular, (node) => node.attributes.get("name") === "importFile")[0];
  assert.match(tabularFile.attributes.get("accept"), /^\.csv,\.tsv,\.txt/);
  assert.doesNotMatch(tabularFile.attributes.get("accept"), /json/i);
  assert.equal(findNodes(tabular, (node) => node.attributes.get("name") === "importText").length, 1);

  const ai = documentRoot.createElement("div");
  renderAiImportView({ container: ai, model: aiViewModel() });
  const jsonInput = findNodes(ai, (node) => Object.hasOwn(node.dataset, "aiImportJsonFiles"))[0];
  assert.equal(jsonInput.attributes.get("accept"), ".json,application/json");
  const fallback = findNodes(ai, (node) => node.tagName === "details" && /KI-Antwort als Text/.test(node.textContent))[0];
  assert.ok(fallback);
  assert.equal(hasDescendant(fallback, (node) => Object.hasOwn(node.dataset, "aiImportResponse")), true);
  assert.equal(hasDescendant(fallback, (node) => Object.hasOwn(node.dataset, "aiImportJsonFiles")), false);
});

test("KI-Hilfen folgen primär dem realen JSON-Dateiweg und halten Text nur als Fallback", () => {
  const documentRoot = new MiniDocument();
  const ai = documentRoot.createElement("div");
  renderAiImportView({ container: ai, model: aiViewModel() });
  const numberedSteps = findNodes(ai, (node) => node.tagName === "section" && node.className === "ai-import-step");
  assert.equal(numberedSteps.length, 6);
  assert.match(numberedSteps[4].textContent, /EduTools-JSON-Dateien speichern/);
  assert.match(numberedSteps[5].textContent, /Kurs aus JSON importieren/);
  assert.doesNotMatch(numberedSteps.map((node) => node.textContent).join(" "), /ChatGPT-Antwort kopieren/);

  const tabular = documentRoot.createElement("div");
  renderNewCourseImportView(tabular, {
    mode: "new-course",
    courseInput: { title: "Testkurs", sourceLanguage: "en", targetLanguage: "de" },
  });
  assert.match(tabular.textContent, /Erzeugte EduTools-JSON-Datei speichern/);
  assert.match(tabular.textContent, /unter „Kurs aus JSON importieren“ auswählen/);
  assert.doesNotMatch(tabular.textContent, /Antwort in EduTools einfügen/);
});

test("reale EduTools-Kursdatei läuft durch den Restore-Payload und behält stabile IDs", async () => {
  const text = await readFile(realCourseUrl, "utf8");
  const original = JSON.parse(text);
  const session = importOrchestrator.prepareImport({
    adapterId: COURSE_JSON_RESTORE_ADAPTER_ID,
    input: { kind: "course-json", text },
  });
  assert.equal(session.valid, true);
  assert.equal(session.payloadKind, "restore");

  const stored = [];
  const service = {
    getCourse(id) { return stored.find((course) => course.id === id) ?? null; },
    addCourse(course) { stored.push(course); return course; },
    updateCourse(course) { return course; },
  };
  const restored = importJsonCourse({ service, text, conflict: "new" });
  assert.equal(restored.title, "Release Roundtrip Kurs");
  assert.equal(restored.id, original.id);
  assert.deepEqual(restored.units.map((unit) => unit.id), original.units.map((unit) => unit.id));
  assert.deepEqual(
    restored.units.flatMap((unit) => unit.words.map((word) => word.id)),
    original.units.flatMap((unit) => unit.words.map((word) => word.id)),
  );
  assert.equal(stored.length, 1);
});

test("JSON-Restore meldet Syntax, fremde Struktur, Beschädigung und Version konkret", async () => {
  assert.throws(() => parseJsonCourse("{"), /kein gültiges JSON/);
  assert.throws(() => parseJsonCourse(JSON.stringify({ hello: "world" })), /schemaVersion|Kurs\.id|appType/);

  const canonical = JSON.parse(await readFile(realCourseUrl, "utf8"));
  delete canonical.units[0].words[0].id;
  assert.throws(() => parseJsonCourse(JSON.stringify(canonical)), /Vokabeleintrag 1\.id fehlt/);

  const unsupported = JSON.parse(await readFile(realCourseUrl, "utf8"));
  unsupported.schemaVersion = 999;
  assert.throws(() => parseJsonCourse(JSON.stringify(unsupported)), /schemaVersion muss 1 sein/);
});

test("bestehender KI-Textadapter und JSON-Dateiadapter bleiben beide funktionsfähig", async () => {
  const controller = createAiImportController({
    service: { addCourse(course) { return course; }, updateCourse(course) { return course; } },
    idGenerator: (() => { let id = 0; return () => `patch-json-${++id}`; })(),
    now: "2026-07-17T12:00:00.000Z",
  });
  controller.setField("courseName", "KI-Testkurs");
  controller.setField("sourceLanguage", "en");
  controller.setField("targetLanguage", "de");
  controller.setResponseText(JSON.stringify({
    units: [{ title: "Lernpaket 1", words: [{ source: "island", targets: ["Insel"] }] }],
  }));
  assert.equal(controller.prepareResponse().ok, true);

  const generated = {
    schemaVersion: 1,
    appType: "vocabulary",
    title: "KI-Testkurs",
    subtitle: "",
    description: "",
    schoolType: "",
    gradeLevel: "",
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
    units: [{
      title: "Lernpaket 1", description: "", order: 1, released: true, current: true, archived: false,
      words: [{ source: "island", targets: ["Insel"], phonetic: "", hint: "", example: "", tags: [], archived: false }],
    }],
  };
  const fileText = JSON.stringify(generated);
  const selected = await controller.setJsonFiles([{
    name: "edutools-vocabulary-ki-testkurs.json",
    type: "application/json",
    size: fileText.length,
    async text() { return fileText; },
  }]);
  assert.equal(selected.ok, true);
});

test("Patch führt keine neue Abhängigkeit oder Netzwerkübertragung ein", async () => {
  const [metadata, controller, runtime] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/course-library/course-runtime.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(metadata, /openai|anthropic|generative-ai|langchain|ai-sdk/i);
  assert.doesNotMatch(`${controller}\n${runtime}`, /api\.openai|XMLHttpRequest|WebSocket|EventSource/i);
  assert.match(runtime, /importJsonCoursesAsNew\(\{ service, files: inputs, idGenerator \}\)/);
  assert.match(runtime, /importJsonCourse\(\{ service, text: await files\[0\]\.text\(\), conflict, idGenerator \}\)/);
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
  console.error(`\n${failures}/${tests.length} Patch-4.1.4.2-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} Patch-4.1.4.2-Tests bestanden.`);
}
