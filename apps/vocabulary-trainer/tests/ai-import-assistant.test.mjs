import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createBuildFilePlan } from "../build/build-file-plan.js";
import {
  createAiImportController,
  validateAiImportInput,
} from "../src/ai-import/ai-import-controller.js";
import { renderAiImportView } from "../src/views/ai-import-view.js";
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

function validModel(overrides = {}) {
  return {
    courseName: "Englisch 7",
    sourceLanguage: "en",
    targetLanguage: "de",
    errors: {},
    prompt: "Vollständiger Testprompt",
    status: "",
    ...overrides,
  };
}

test("Promptformular verlangt Kursname sowie unterschiedliche Ausgangs- und Zielsprachen", () => {
  const empty = validateAiImportInput({});
  assert.equal(empty.valid, false);
  assert.match(empty.errors.courseName, /Kursnamen/u);
  assert.match(empty.errors.sourceLanguage, /Ausgangssprache/u);
  assert.match(empty.errors.targetLanguage, /Zielsprache/u);
  const same = validateAiImportInput({ courseName: "Kurs", sourceLanguage: "en", targetLanguage: "en" });
  assert.equal(same.valid, false);
  assert.match(same.errors.targetLanguage, /unterschiedlich/u);
});

test("Prompt entsteht ohne Bildauswahl ausschließlich aus Kursmetadaten", async () => {
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
  assert.equal(Object.hasOwn(controller.getSnapshot(), "selectedImages"), false);
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
  assert.equal(controller.getSnapshot().status, "Import-Prompt wurde kopiert.");
});

test("KI-Workflow besitzt sechs ehrliche Schritte ohne lokale Bild- oder JSON-Dateiauswahl", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel() });
  const steps = findNodes(container, (node) => node.tagName === "section" && node.className === "ai-import-step");
  assert.equal(steps.length, 6);
  for (const text of [
    "Kursdaten festlegen",
    "Import-Prompt kopieren",
    "KI-Chat öffnen",
    "Vokabelbilder direkt dort hochladen",
    "Prompt einfügen",
    "JSON-Datei importieren",
  ]) assert.match(container.textContent, new RegExp(text));
  assert.equal(findNodes(container, (node) => node.attributes.get("type") === "file").length, 0);
  assert.equal(findNodes(container, (node) => node.tagName === "textarea").length, 0);
  assert.doesNotMatch(container.textContent, /HEIC|HEIF|JPG|JPEG|PNG|WEBP|Bilder ausgewählt|Dateien ausgewählt/u);
});

test("Workflow erklärt Bild-Upload vor Prompt und keine Übertragung durch EduTools", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel() });
  const text = container.textContent;
  assert.match(text, /EduTools kopiert ausschließlich den Import-Prompt/u);
  assert.match(text, /keine Bildübertragung durch EduTools/u);
  assert.ok(text.indexOf("Bilder im KI-Chat hochladen") < text.indexOf("Prompt im selben Chat einfügen"));
  assert.ok(text.indexOf("Prompt im selben Chat einfügen") < text.indexOf("Anfrage absenden"));
  assert.equal(findNodes(container, (node) => Object.hasOwn(node.dataset, "aiImportExternalChat")).length, 0);
});

test("Zum JSON-Import verlinkt direkt den standardmäßigen Neuimport", () => {
  const documentRoot = new MiniDocument();
  const assistant = documentRoot.createElement("div");
  renderAiImportView({ container: assistant, model: validModel() });
  const link = findNodes(assistant, (node) => Object.hasOwn(node.dataset, "aiImportJsonLink"))[0];
  assert.equal(link.tagName, "a");
  assert.equal(link.textContent, "Zum JSON-Import");
  assert.equal(link.attributes.get("href"), "#/courses?import=json");

  const library = documentRoot.createElement("div");
  renderCourseLibraryView({ container: library, courses: [], enabled: true });
  const radios = findNodes(library, (node) => node.attributes.get("name") === "course-json-mode");
  assert.equal(radios.find((radio) => radio.value === "new")?.checked, true);
  assert.equal(radios.find((radio) => radio.value === "restore")?.checked, false);
  assert.match(library.textContent, /EduTools-Backup wiederherstellen/u);
});

test("Prompt-Anzeige nutzt einen nativen Dialog mit dem Engine-Ergebnis", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderAiImportView({ container, model: validModel({ prompt: "ECHTER ENGINE-PROMPT" }) });
  const dialog = findNodes(container, (node) => Object.hasOwn(node.dataset, "aiImportDialog"))[0];
  const output = findNodes(container, (node) => Object.hasOwn(node.dataset, "aiImportPromptOutput"))[0];
  assert.equal(dialog.tagName, "dialog");
  assert.equal(output.tagName, "pre");
  assert.equal(output.textContent, "ECHTER ENGINE-PROMPT");
});

test("Controller und Runtime enthalten weder Bildzustand noch Datei-Handler oder KI-Netzwerk", async () => {
  const [controller, runtime, view, metadata] = await Promise.all([
    readFile(new URL("../src/ai-import/ai-import-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/views/ai-import-view.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${controller}\n${runtime}\n${view}`, /validateAiImportImageFiles|setImageFiles|selectedImages|imageStatus|data-ai-import-images|type:\s*["']file["']/u);
  assert.doesNotMatch(`${controller}\n${runtime}`, /api\.openai|XMLHttpRequest|WebSocket|EventSource|FileReader|arrayBuffer\(|createImageBitmap/iu);
  assert.doesNotMatch(metadata, /openai|anthropic|generative-ai|langchain|ai-sdk/iu);
});

test("KI-Module bleiben Author-only und fehlen im Learner-SCORM-Dateiplan", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const author = JSON.parse(await readFile(new URL("../profiles/production/author.production.json", import.meta.url), "utf8"));
  const learner = JSON.parse(await readFile(new URL("../profiles/production/learner.production.json", import.meta.url), "utf8"));
  const authorFiles = (await createBuildFilePlan({ repositoryRoot: root, profile: author })).map((entry) => entry.destination);
  const learnerFiles = (await createBuildFilePlan({ repositoryRoot: root, profile: learner })).map((entry) => entry.destination);
  assert.equal(authorFiles.includes("ai-import/ai-import-controller.js"), true);
  assert.equal(authorFiles.includes("prompts/vocabulary/import-v1.txt"), true);
  assert.equal(learnerFiles.some((file) => file.startsWith("ai-import/") || file.startsWith("prompts/")), false);
});

test("geänderte Author-Module und Styles verwenden einheitlich Version 4.0.5", async () => {
  const [courseRuntime, assistantRuntime, controller, promptRegistry, dashboardCss, appVersion] = await Promise.all([
    readFile(new URL("../src/course-library/course-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/prompt-registry.js", import.meta.url), "utf8"),
    readFile(new URL("../src/dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../src/runtime/app-version.js", import.meta.url), "utf8"),
  ]);
  for (const source of [courseRuntime, assistantRuntime, controller, promptRegistry, dashboardCss]) {
    assert.match(source, /4\.0\.5/u);
    assert.doesNotMatch(source, /4\.0\.3/u);
  }
  assert.match(appVersion, /APP_VERSION = "4\.0\.5"/u);
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
  console.error(`\n${failures}/${tests.length} KI-Workflow-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} KI-Workflow-Tests bestanden.`);
}
