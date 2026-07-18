import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createLearningScopeOptions,
  formatLearningScope,
  isValidLearningScopeSelection,
  loadLearningScope,
  resolveLearningScopeWords,
  saveLearningScope,
} from "../src/core/learning-scope.js";
import {
  createExactCloze,
  createQuizCloze,
  createWritingCloze,
} from "../src/core/cloze.js";
import { getSessionSizeOptions } from "../src/core/session-size.js";
import {
  getSmallLearningPackageWarnings,
  normalizeImportedLearningPackages,
} from "../src/import/core/learning-package-normalizer.js";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

const words = [
  { id: "w1", unitId: "p1", source: "bridge" },
  { id: "w2", unitId: "p1", source: "cliff" },
  { id: "w3", unitId: "p2", source: "cave" },
];
const vocabulary = { units: [{ id: "p1", title: "At the coast" }, { id: "p2", title: "Useful phrases" }] };

test("Lernbereich unterstützt einzelne, mehrere und alle Lernpakete", () => {
  const options = createLearningScopeOptions(vocabulary, words);
  assert.equal(options[0].label, "Alle Lernpakete");
  assert.ok(options.some((option) => option.value === "package:p1"));
  assert.ok(options.some((option) => option.value === "multiple-packages"));
  assert.deepEqual(resolveLearningScopeWords(options, "multiple-packages", ["p1"]).map((word) => word.id), ["w1", "w2"]);
  assert.equal(
    formatLearningScope(options, "multiple-packages", ["p1", "p2"]),
    "„At the coast“, „Useful phrases“ · 3 Wörter",
  );
  assert.equal(isValidLearningScopeSelection({ value: "multiple-packages", packageIds: ["p1"] }), false);
  assert.equal(isValidLearningScopeSelection({ value: "multiple-packages", packageIds: ["p1", "p2"] }), true);
});

test("kursbezogene Lernbereichsauswahl ist defensiv speicherbar", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(saveLearningScope("course-1", { value: "multiple-packages", packageIds: ["p1", "p2"] }, storage), true);
  assert.deepEqual(loadLearningScope("course-1", storage), { value: "multiple-packages", packageIds: ["p1", "p2"] });
});

test("dynamische Umfänge entsprechen dem gewählten Lernbereich", () => {
  assert.deepEqual(getSessionSizeOptions(56).map((option) => option.count), [5, 10, 20, 30, 56]);
  assert.deepEqual(getSessionSizeOptions(12).map((option) => option.count), [5, 10, 12]);
  assert.deepEqual(getSessionSizeOptions(3).map((option) => option.count), [3]);
});

test("Lückensätze entstehen nur bei genau einer exakten gespeicherten Form", () => {
  assert.equal(createExactCloze("The bridge crosses the bay.", "bridge")?.prompt, "The ___ crosses the bay.");
  assert.equal(createExactCloze("A bridge is a bridge.", "bridge"), null);
  assert.equal(createQuizCloze({ source: "go", example: "Yesterday, we went home." }), null);
});

test("Schreib-Lückensätze schließen Verben und unbekannte Wortarten aus", () => {
  assert.ok(createWritingCloze({ source: "bridge", example: "The bridge is long.", tags: ["noun"] }));
  assert.equal(createWritingCloze({ source: "go", example: "I go home.", tags: ["verb"] }), null);
  assert.equal(createWritingCloze({ source: "bridge", example: "The bridge is long.", tags: [] }), null);
});

test("technische Fragmente werden zusammengeführt, semantische Kleingruppen nur gemeldet", () => {
  const normalized = normalizeImportedLearningPackages([
    { title: "Seite 1", order: 1, words: [{ source: "one" }, { source: "two" }] },
    { title: "tempImage-42.heic", order: 2, words: [{ source: "camera" }] },
    { title: "Seite 2", order: 3, words: [{ source: "three" }] },
    { title: "Useful phrases", order: 4, words: [{ source: "hello" }, { source: "bye" }] },
  ]);
  assert.equal(normalized.packages.length, 2);
  assert.equal(normalized.packages[0].title, "Lernpaket 1");
  assert.deepEqual(normalized.packages[0].words.map((word) => word.source), ["one", "two", "camera", "three"]);
  assert.equal(normalized.packages[1].title, "Useful phrases");
  assert.equal(getSmallLearningPackageWarnings(normalized.packages).length, 2);

  const manyTechnicalWords = normalizeImportedLearningPackages([
    { title: "Seite 10", words: Array.from({ length: 20 }, (_, index) => ({ source: `a-${index}` })) },
    { title: "Datei 2", words: Array.from({ length: 20 }, (_, index) => ({ source: `b-${index}` })) },
  ]);
  assert.deepEqual(manyTechnicalWords.packages.map((entry) => entry.words.length), [20, 20]);
  assert.ok(manyTechnicalWords.packages.every((entry) => /^Lernpaket \d+$/u.test(entry.title)));
});

test("KI-Vorbereitung besitzt keine lokale Bildauswahl mehr", async () => {
  const [controller, runtime, view] = await Promise.all([
    readFile(new URL("../src/ai-import/ai-import-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ai-import/ai-import-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/views/ai-import-view.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${controller}\n${runtime}\n${view}`, /validateAiImportImageFiles|setImageFiles|selectedImages|imageStatus/u);
  assert.doesNotMatch(view, /HEIC|HEIF|JPG|JPEG|PNG|WEBP/u);
});

test("produktive Präsentation verwendet für interne Teilbereiche Lernpaket", async () => {
  const files = [
    "../src/index.html",
    "../src/views/course-builder-view.js",
    "../src/views/quiz-view.js",
    "../src/views/writing-view.js",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /Aktuelle Unit|Alle Units|Unit wechseln|Unit auswählen/u);
  assert.match(source, /Lernpaket/);
  assert.match(source, /Dieses Lernpaket enthält nur .*Prüfe, ob es mit einem anderen Lernpaket zusammengeführt werden sollte/u);
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
  console.error(`\n${failures}/${tests.length} Patch-4.1.4.1-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} Patch-4.1.4.1-Tests bestanden.`);
}
