import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createAiImportController,
  validateAiImportInput,
  validateAiImportImageFiles,
  validateAiImportJsonFiles,
} from "../src/ai-import/ai-import-controller.js";
import {
  createAiImportFileList,
  createAiImportIssueOverview,
  renderAiImportView,
} from "../src/views/ai-import-view.js";
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

function validCourse(title = "Englisch 7") {
  return {
    schemaVersion: 1,
    appType: "vocabulary",
    title,
    subtitle: "",
    description: "",
    schoolType: "",
    gradeLevel: "",
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
    units: [{
      title: "Unit 1", description: "", order: 1, released: true, current: true, archived: false,
      words: [{ source: "island", targets: ["Insel"], phonetic: "", hint: "", example: "", tags: [], archived: false }],
    }],
  };
}

function jsonFile(name, data = validCourse()) {
  const text = JSON.stringify(data);
  return { name, type: "application/json", size: text.length, async text() { return text; } };
}

function validModel(overrides = {}) {
  return {
    courseName: "Englisch 7",
    sourceLanguage: "en",
    targetLanguage: "de",
    errors: {},
    prompt: "Vollständiger Testprompt",
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

test("Promptformular validiert nur Kursname und Sprachen", () => {
  const result = validateAiImportInput({});
  assert.equal(result.valid, false);
  assert.match(result.errors.courseName, /Kursnamen/);
  assert.match(result.errors.sourceLanguage, /Ausgangssprache/);
  assert.match(result.errors.targetLanguage, /Zielsprache/);
  assert.equal(Object.hasOwn(result.errors, "images"), false);
});

test("Promptformular verhindert identische Kurs-Sprachen", () => {
  const result = validateAiImportInput({ courseName: "Kurs", sourceLanguage: "en", targetLanguage: "en" });
  assert.equal(result.valid, false);
  assert.match(result.errors.targetLanguage, /unterschiedlich/);
});

test("Dateiauswahl akzeptiert ausschließlich eine oder mehrere JSON-Dateien", () => {
  const valid = validateAiImportJsonFiles([
    { name: "teil-1.json", type: "application/json" },
    { name: "teil-2.JSON", type: "" },
  ]);
  assert.equal(valid.valid, true);
  assert.equal(valid.count, 2);
  const invalid = validateAiImportJsonFiles([{ name: "seite.jpg", type: "image/jpeg" }]);
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /seite\.jpg/);
});

test("lokale Bildauswahl akzeptiert HEIC, HEIF, JPG, PNG und WEBP ohne Dateiinhalte zu lesen", () => {
  const files = [
    { name: "IMG_0001.HEIC", type: "" },
    { name: "IMG_0002.heif", type: "image/heif" },
    { name: "seite.jpg", type: "image/jpeg" },
    { name: "seite.png", type: "image/png" },
    { name: "seite.webp", type: "image/webp" },
  ];
  const result = validateAiImportImageFiles(files);
  assert.equal(result.valid, true);
  assert.deepEqual(result.files.map((file) => file.label), ["Bild 1", "Bild 2", "Bild 3", "Bild 4", "Bild 5"]);
  assert.equal(validateAiImportImageFiles([{ name: "seite.pdf", type: "application/pdf" }]).valid, false);
});

test("Controller übergibt nur Kursmetadaten an die Prompt-Engine", async () => {
  const requests = [];
  const controller = createAiImportController({
    generator: { async generate(request) { requests.push(request); return "PROMPT AUS ENGINE"; } },
    clipboard: { async writeText() {} },
  });
  controller.setField("courseName", "  Englisch 7  ");
  controller.setField("sourceLanguage", "en");
  controller.setField("targetLanguage", "de");
  const result = await controller.generatePrompt();
  assert.equal(result.ok, true);
  assert.deepEqual(requests, [{
    type: "vocabulary-import", courseName: "Englisch 7", sourceLanguage: "en", targetLanguage: "de",
  }]);
});

test("Import-Prompt wird exakt kopiert und eindeutig bestätigt", async () => {
  const copied = [];
  const controller = createAiImportController({
    generator: { async generate() { return "ENGINE-PROMPT"; } },
    clipboard: { async writeText(text) { copied.push(text); } },
  });
  controller.setField("courseName", "Englisch 7");
  controller.setField("sourceLanguage", "en");
  controller.setField("targetLanguage", "de");
  const result = await controller.copyPrompt();
  assert.equal(result.ok, true);
  assert.deepEqual(copied, ["ENGINE-PROMPT"]);
  assert.equal(controller.getSnapshot().status, "Import-Prompt kopiert");
});

test("Controller prüft mehrere lokale JSON-Dateien vor dem Speichern", async () => {
  const controller = createAiImportController();
  const result = await controller.setJsonFiles([
    jsonFile("teil-1.json", validCourse()),
    jsonFile("teil-2.json", { ...validCourse(), units: [{
      ...validCourse().units[0], title: "Unit 2", order: 2, current: false,
    }] }),
  ]);
  assert.equal(result.ok, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.selectedFiles.length, 2);
  assert.equal(snapshot.preview.fileCount, 2);
  assert.equal(snapshot.preview.unitCount, 2);
  assert.equal(snapshot.preview.wordCount, 2);
  assert.equal(snapshot.canImport, true);
});

test("Mehrfachimport speichert genau einen Kurs und blockiert Doppelspeicherung", async () => {
  const saved = [];
  let identifier = 0;
  const controller = createAiImportController({
    service: {
      addCourse(course) { saved.push(course); return course; },
      updateCourse() { throw new Error("unerwartet"); },
    },
    idGenerator: () => `assistant-${++identifier}`,
    now: "2026-07-17T10:00:00.000Z",
  });
  await controller.setJsonFiles([jsonFile("course.json")]);
  const first = controller.importJsonFiles();
  const second = controller.importJsonFiles();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.reused, true);
  assert.equal(saved.length, 1);
  assert.equal(first.course.title, "Englisch 7");
});

test("fehlerhafte Datei bleibt sichtbar und verhindert jeden Teilimport", async () => {
  let saved = 0;
  const controller = createAiImportController({
    service: { addCourse() { saved += 1; }, updateCourse() {} },
  });
  const result = await controller.setJsonFiles([
    jsonFile("valid.json"),
    { name: "broken.json", type: "application/json", size: 2, async text() { return "{"; } },
  ]);
  assert.equal(result.ok, false);
  assert.equal(controller.getSnapshot().selectedFiles[1].status, "error");
  assert.equal(controller.importJsonFiles().ok, false);
  assert.equal(saved, 0);
});

test("Sechs-Schritt-UI entspricht der tatsächlichen JSON-Ausgabe des Import-Prompts", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel() });
  assert.match(container.textContent, /Vokabelseite mit KI vorbereiten/);
  assert.match(container.textContent, /Bilder auswählen/);
  assert.match(container.textContent, /Die Bilder bleiben lokal/);
  assert.match(container.textContent, /Prompt kopieren/);
  assert.match(container.textContent, /In ChatGPT hochladen/);
  assert.match(container.textContent, /lade dort dieselben Bilder erneut hoch/);
  assert.match(container.textContent, /EduTools-JSON-Dateien speichern/);
  assert.match(container.textContent, /Kurs aus JSON importieren/);
  assert.match(container.textContent, /KI-Antwort als Text einfügen \(Fallback\)/);
  assert.match(container.textContent, /HEIC, HEIF, JPG, JPEG, PNG und WEBP/);
  assert.equal(findNodes(container, (node) => node.tagName === "textarea").length, 1);
  const fileInputs = findNodes(container, (node) => node.attributes.get("type") === "file");
  assert.equal(fileInputs.length, 2);
  assert.match(fileInputs[0].attributes.get("accept"), /\.heic/);
  assert.match(fileInputs[0].attributes.get("accept"), /image\/heif/);
  assert.equal(fileInputs[1].attributes.get("accept"), ".json,application/json");
  assert.equal(fileInputs.every((input) => input.attributes.has("multiple")), true);
});

test("ChatGPT-Link öffnet einen neuen sicheren Tab und EduTools bleibt geöffnet", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel() });
  const link = findNodes(container, (node) => Object.hasOwn(node.dataset, "aiImportExternalChat"))[0];
  assert.equal(link.tagName, "a");
  assert.equal(link.attributes.get("href"), "https://chatgpt.com/");
  assert.equal(link.attributes.get("target"), "_blank");
  assert.equal(link.attributes.get("rel"), "noopener noreferrer");
});

test("Dateizahl, Dateinamen, Status und dynamische Importaktion werden sichtbar", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  const model = validModel({
    selectedFiles: [
      { name: "ein-sehr-langer-dateiname-teil-1.json", size: 1, status: "valid", issueCount: 0 },
      { name: "teil-2.json", size: 1, status: "warning", issueCount: 1 },
      { name: "teil-3.json", size: 1, status: "error", issueCount: 1 },
    ],
    importStatus: "Dateien geprüft",
    importIssues: [{ code: "test", severity: "error", message: "Fehler in Teil 3", action: "Datei korrigieren", path: "" }],
  });
  renderAiImportView({ container, model });
  assert.match(container.textContent, /3 Dateien ausgewählt/);
  assert.match(container.textContent, /ein-sehr-langer-dateiname-teil-1\.json/);
  assert.match(container.textContent, /Gültig/);
  assert.match(container.textContent, /Hinweis/);
  assert.match(container.textContent, /Fehler/);
  const button = findNodes(container, (node) => node.dataset.aiImportAction === "import-files")[0];
  assert.equal(button.textContent, "JSON als neuen Kurs importieren");
  assert.equal(button.disabled, true);
  const list = createAiImportFileList(documentRoot, model);
  assert.equal(list.hidden, false);
});

test("Vorschau und Duplikatentscheidung sind semantisch und vollständig", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel({
    selectedFiles: [{ name: "course.json", size: 1, status: "warning", issueCount: 1 }],
    preview: { title: "Neutraler Kurs", fileCount: 1, unitCount: 2, wordCount: 24, sourceLanguage: "en", targetLanguage: "de", unitTitles: ["Unit 1", "Unit 2"] },
    duplicates: [{ source: "bank", unitTitle: "Unit 2" }],
    duplicateChoice: "keep",
    canImport: true,
  }) });
  assert.match(container.textContent, /Importvorschau/);
  assert.match(container.textContent, /Neutraler Kurs/);
  assert.match(container.textContent, /24/);
  assert.match(container.textContent, /Exakte Duplikate überspringen/);
  assert.match(container.textContent, /Duplikate trotzdem behalten/);
  const fieldsets = findNodes(container, (node) => node.tagName === "fieldset");
  const radios = findNodes(container, (node) => node.attributes.get("type") === "radio");
  assert.equal(fieldsets.length, 1);
  assert.equal(radios.length, 2);
  assert.equal(radios.find((radio) => radio.attributes.get("value") === "keep")?.checked, true);
});

test("Prompt-Anzeige nutzt einen nativen Dialog mit dem erzeugten Prompt", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel({ prompt: "ECHTER ENGINE-PROMPT" }) });
  const dialog = findNodes(container, (node) => Object.hasOwn(node.dataset, "aiImportDialog"))[0];
  const output = findNodes(container, (node) => Object.hasOwn(node.dataset, "aiImportPromptOutput"))[0];
  assert.equal(dialog.tagName, "dialog");
  assert.equal(output.tagName, "pre");
  assert.equal(output.textContent, "ECHTER ENGINE-PROMPT");
});

test("strukturierte ImportIssues nennen Meldung und Maßnahme", () => {
  const documentRoot = new MiniDocument();
  const overview = createAiImportIssueOverview(documentRoot, validModel({
    importIssues: [{ code: "word.targets.required", severity: "error", message: "Mindestens eine Übersetzung fehlt.", action: "Ergänze mindestens eine Übersetzung.", path: "units[0].words[0].targets" }],
  }));
  assert.equal(overview.hidden, false);
  assert.equal(overview.attributes.get("role"), "alert");
  assert.match(overview.textContent, /Mindestens eine Übersetzung fehlt/);
  assert.match(overview.textContent, /Ergänze mindestens eine Übersetzung/);
});

test("Kursbibliothek bietet den Einstieg ausschließlich als Author-View an", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderCourseLibraryView({ container, courses: [], enabled: true });
  const link = findNodes(container, (node) => node.attributes.get("href") === "#/course-builder?import=ai")[0];
  assert.equal(link.textContent, "Vokabelseite mit KI vorbereiten");
  assert.equal(link.dataset.routeLink, "/course-builder");
});

test("Workflow enthält keine KI-API, Bildverarbeitung oder neue Abhängigkeit", async () => {
  const [controller, runtime, view, authoringCss, metadata] = await Promise.all([
    readFile(new URL("../src/ai-import/ai-import-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/views/ai-import-view.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/authoring.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${controller}\n${runtime}`, /api\.openai|XMLHttpRequest|WebSocket|EventSource|FileReader|arrayBuffer\(|heicTo|createImageBitmap/i);
  assert.doesNotMatch(view, /children\.at\(/u);
  assert.doesNotMatch(metadata, /openai|anthropic|generative-ai|langchain|ai-sdk/i);
  assert.match(authoringCss, /\.ai-import-assistant \.button,[\s\S]*min-height: 48px !important;[\s\S]*min-block-size: 48px !important/);
});

test("geänderte Author-Module, Styles und Promptressource umgehen alte Browser-Caches", async () => {
  const [courseRuntime, assistantRuntime, controller, pipeline, promptGenerator, promptRegistry, dashboardCss] = await Promise.all([
    readFile(new URL("../src/course-library/course-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/import/import-pipeline.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/prompt-generator.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/prompt-registry.js", import.meta.url), "utf8"),
    readFile(new URL("../src/dashboard.css", import.meta.url), "utf8"),
  ]);
  const sources = [courseRuntime, assistantRuntime, controller, pipeline, promptGenerator, promptRegistry];
  for (const source of sources) assert.match(source, /\?v=4\.0\.3/);
  assert.match(courseRuntime, /ai-import\/ai-import-runtime\.js\?v=4\.0\.3/);
  assert.match(assistantRuntime, /ai-import-controller\.js\?v=4\.0\.3/);
  assert.match(assistantRuntime, /ai-import-view\.js\?v=4\.0\.3/);
  assert.match(promptRegistry, /import-v1\.txt\?v=4\.0\.3/);
  assert.match(dashboardCss, /authoring\.css\?v=4\.0\.3&rev=4/);
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
  console.error(`\n${failures}/${tests.length} ChatGPT-Import-Assistent-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} ChatGPT-Import-Assistent-Tests bestanden.`);
}
