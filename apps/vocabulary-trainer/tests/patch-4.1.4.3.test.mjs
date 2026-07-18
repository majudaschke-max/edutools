import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  detectJsonCourseImportMode,
  importJsonCourse,
  importJsonCoursesAsNew,
  JSON_COURSE_IMPORT_MODES,
} from "../src/import/json-course-importer.js";
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

function sequence(prefix = "generated") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function memoryService() {
  const courses = [];
  return {
    courses,
    getCourse(id) { return courses.find((course) => course.id === id) ?? null; },
    addCourse(course) { courses.push(course); return course; },
    updateCourse(course) {
      const index = courses.findIndex((candidate) => candidate.id === course.id);
      if (index >= 0) courses[index] = course;
      else courses.push(course);
      return course;
    },
  };
}

function contentCourse(overrides = {}) {
  return {
    schemaVersion: 1,
    appType: "vocabulary",
    title: "ChatGPT Importkurs",
    subtitle: "",
    description: "",
    schoolType: "",
    gradeLevel: "",
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
    units: [{
      title: "Lernpaket 1",
      description: "",
      order: 1,
      released: true,
      current: true,
      archived: false,
      words: [{
        source: "island",
        targets: ["Insel"],
        phonetic: "[ˈaɪlənd]",
        hint: "Land completely surrounded by water.",
        example: "They live on a small island.",
        tags: [],
        archived: false,
      }],
    }],
    ...overrides,
  };
}

function jsonFile(value, name = "chatgpt-course.json") {
  const text = JSON.stringify(value);
  return { name, type: "application/json", size: text.length, text };
}

const backupUrl = new URL("../profiles/production/courses/release-roundtrip.production.json", import.meta.url);

test("gültige ChatGPT-Kursdaten ohne technische IDs werden als neuer Kurs importiert", () => {
  const service = memoryService();
  const result = importJsonCoursesAsNew({
    service,
    files: [jsonFile(contentCourse())],
    idGenerator: sequence(),
    now: "2026-07-17T14:00:00.000Z",
  });
  assert.equal(service.courses.length, 1);
  assert.equal(result.course.title, "ChatGPT Importkurs");
  assert.match(result.course.id, /^course-generated-/);
  assert.match(result.course.units[0].id, /^unit-generated-/);
  assert.match(result.course.units[0].words[0].id, /^word-generated-/);
  assert.equal(result.imported, 1);
});

test("Neuimport erzeugt eindeutige IDs und verwirft fremde technische KI-Felder", () => {
  const value = contentCourse({
    id: "foreign-course-id",
    contentVersion: 99,
    generatedBy: "external-ai",
  });
  value.units[0].id = "foreign-unit-id";
  value.units[0].generatedBy = "external-ai";
  value.units[0].words.push({
    ...value.units[0].words[0],
    id: "foreign-word-id-2",
    source: "castle",
    targets: ["Burg", "Schloss"],
    generatedBy: "external-ai",
    aiGenerated: true,
  });
  value.units[0].words[0].id = "foreign-word-id-1";
  const result = importJsonCoursesAsNew({
    service: memoryService(),
    files: [jsonFile(value)],
    idGenerator: sequence("fresh"),
  });
  const ids = [
    result.course.id,
    ...result.course.units.map((unit) => unit.id),
    ...result.course.units.flatMap((unit) => unit.words.map((word) => word.id)),
  ];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.some((id) => id.startsWith("foreign-")), false);
  assert.equal("generatedBy" in result.course, false);
  assert.equal("generatedBy" in result.course.units[0], false);
  assert.equal("aiGenerated" in result.course.units[0].words[1], false);
});

test("expliziter Neuimport verwirft selbst IDs eines vollständigen Backups", async () => {
  const original = JSON.parse(await readFile(backupUrl, "utf8"));
  const result = importJsonCoursesAsNew({
    service: memoryService(),
    files: [jsonFile(original, "backup-as-new.json")],
    idGenerator: sequence("copy"),
  });
  assert.notEqual(result.course.id, original.id);
  assert.notDeepEqual(result.course.units.map((unit) => unit.id), original.units.map((unit) => unit.id));
  assert.notDeepEqual(
    result.course.units.flatMap((unit) => unit.words.map((word) => word.id)),
    original.units.flatMap((unit) => unit.words.map((word) => word.id)),
  );
});

test("vollständiges EduTools-Backup wird erkannt und mit stabilen IDs wiederhergestellt", async () => {
  const text = await readFile(backupUrl, "utf8");
  const original = JSON.parse(text);
  assert.equal(detectJsonCourseImportMode(text), JSON_COURSE_IMPORT_MODES.RESTORE);
  const restored = importJsonCourse({ service: memoryService(), text, conflict: "new" });
  assert.equal(restored.id, original.id);
  assert.deepEqual(restored.units.map((unit) => unit.id), original.units.map((unit) => unit.id));
  assert.deepEqual(
    restored.units.flatMap((unit) => unit.words.map((word) => word.id)),
    original.units.flatMap((unit) => unit.words.map((word) => word.id)),
  );
});

test("Datei ohne IDs wird nicht als Restore klassifiziert oder als beschädigt bezeichnet", () => {
  const text = JSON.stringify(contentCourse());
  assert.equal(detectJsonCourseImportMode(text), JSON_COURSE_IMPORT_MODES.NEW);
  const result = importJsonCoursesAsNew({ service: memoryService(), files: [jsonFile(contentCourse())] });
  assert.equal(result.course.title, "ChatGPT Importkurs");
  assert.throws(
    () => importJsonCourse({ service: memoryService(), text }),
    /Kurs\.id fehlt.*beschädigte Kursdatei/s,
  );
});

test("fachliche Fehler im Neuimport bleiben konkret und enthalten keine Restore-Beschädigungsmeldung", () => {
  const invalid = contentCourse({ title: "" });
  let message = "";
  try {
    importJsonCoursesAsNew({ service: memoryService(), files: [jsonFile(invalid)] });
  } catch (error) {
    message = error.message;
  }
  assert.match(message, /Kurstitel.*fehlt|Kurstitel.*leer/);
  assert.doesNotMatch(message, /beschädigte Kursdatei/);
});

test("beschädigtes Backup bleibt im ausdrücklichen Restore-Modus blockiert", async () => {
  const backup = JSON.parse(await readFile(backupUrl, "utf8"));
  delete backup.units[0].words[0].id;
  assert.throws(
    () => importJsonCourse({ service: memoryService(), text: JSON.stringify(backup) }),
    /Vokabeleintrag 1\.id fehlt.*beschädigte Kursdatei/s,
  );
});

test("Author-UI nutzt native Radios und wählt den Neuimport standardmäßig", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  renderCourseLibraryView({ container, courses: [], enabled: true });
  const radios = findNodes(container, (node) => node.attributes.get("name") === "course-json-mode");
  assert.equal(radios.length, 2);
  assert.equal(radios.every((radio) => radio.attributes.get("type") === "radio"), true);
  assert.equal(radios.find((radio) => radio.value === "new")?.checked, true);
  assert.equal(radios.find((radio) => radio.value === "restore")?.checked, false);
  assert.match(container.textContent, /Als neuen Kurs importieren/);
  assert.match(container.textContent, /EduTools-Backup wiederherstellen/);
  const submit = findNodes(container, (node) => Object.hasOwn(node.dataset, "courseJsonImportSubmit"))[0];
  assert.equal(submit.textContent, "JSON als neuen Kurs importieren");
  const input = findNodes(container, (node) => node.attributes.get("id") === "course-json-file")[0];
  assert.equal(input.attributes.has("multiple"), true);
});

test("Author-CSS begrenzt die Modusradios trotz vollbreiter Formulareingaben", async () => {
  const css = await readFile(new URL("../src/styles/authoring.css", import.meta.url), "utf8");
  assert.match(css, /\.course-json-import \.course-json-mode__choice input\s*\{[^}]*inline-size: var\(--space-5\)/s);
  assert.match(css, /\.course-json-import \.course-json-mode__choice input\s*\{[^}]*min-block-size: var\(--space-5\)/s);
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
  console.error(`\n${failures}/${tests.length} Patch-4.1.4.3-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} Patch-4.1.4.3-Tests bestanden.`);
}
