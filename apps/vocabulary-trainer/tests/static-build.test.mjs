import assert from "node:assert/strict";
import path from "node:path";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { validatePublicationProfile } from "../build/build-profile-validator.js";
import {
  buildVocabularyTrainer,
  validateBuiltVocabularyTrainer,
} from "../build/build-vocabulary-trainer.js";
import { createDeploymentCapabilities } from "../src/runtime/deployment-capabilities.js";
import {
  validateRuntimeDeploymentProfile,
} from "../src/runtime/deployment-profile.js";
import { loadPublishedCourseContext } from "../src/runtime/published-course.js";
import {
  configureStorageNamespace,
  createCourseStorageKey,
  createDeploymentStorageKey,
  migrateLegacyAuthorStorage,
} from "../src/core/storage.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_ROOT, "../../..");
const PROFILE_ROOT = path.join(REPOSITORY_ROOT, "apps/vocabulary-trainer/profiles");
const AUTHOR_PROFILE_PATH = path.join(PROFILE_ROOT, "author.example.json");
const LEARNER_PROFILE_PATH = path.join(PROFILE_ROOT, "learner.example.json");
const COURSE_PATH = path.join(PROFILE_ROOT, "courses/example-course.json");
const TEMP_PROFILE_ROOT = path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/.test-profiles");
const tests = [];

function test(name, callback) { tests.push({ name, callback }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
async function files(root) {
  const { listFiles } = await import("../build/build-utils.js");
  return listFiles(root);
}

const authorRaw = await json(AUTHOR_PROFILE_PATH);
const learnerRaw = await json(LEARNER_PROFILE_PATH);
const exampleCourse = await json(COURSE_PATH);

async function validate(raw, name = "test-profile.json") {
  return validatePublicationProfile(raw, {
    repositoryRoot: REPOSITORY_ROOT,
    profilePath: path.join(TEMP_PROFILE_ROOT, name),
  });
}

async function expectFieldError(raw, field) {
  await assert.rejects(() => validate(raw), new RegExp(`Feld „${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}

test("gültiges Author-Profil wird kanonisch validiert", async () => {
  const result = await validate(authorRaw);
  assert.equal(result.profile.mode, "author");
  assert.equal(result.profile.features.courseBuilder, true);
});

test("gültiges Learner-Profil lädt und validiert genau einen Vocabulary-Kurs", async () => {
  const result = await validate(learnerRaw);
  assert.equal(result.profile.mode, "learner");
  assert.equal(result.course.appType, "vocabulary");
  assert.equal(result.course.id, exampleCourse.id);
});

for (const [name, mutate, field] of [
  ["fehlende Schema-Version", (value) => { delete value.schemaVersion; }, "schemaVersion"],
  ["falsche Schema-Version", (value) => { value.schemaVersion = 99; }, "schemaVersion"],
  ["unbekannter Modus", (value) => { value.mode = "student"; }, "mode"],
  ["fehlende Profile-ID", (value) => { delete value.profileId; }, "profileId"],
  ["fehlende Deployment-ID", (value) => { delete value.deploymentId; }, "deploymentId"],
  ["fehlender App-Titel", (value) => { value.app.title = ""; }, "app.title"],
  ["ungültige Standardroute", (value) => { value.app.defaultRoute = "/dashboard"; }, "app.defaultRoute"],
  ["ungültiges Ausgabeverzeichnis", (value) => { value.output.directory = "./build/out"; }, "output.directory"],
  ["Output-Pfad-Traversal", (value) => { value.output.directory = "../../dist/out"; }, "output.directory"],
  ["Learner ohne Kurs", (value) => { delete value.course; }, "course"],
  ["Learner mit mehreren Kursen", (value) => { value.course = [{ file: "a" }, { file: "b" }]; }, "course"],
  ["Learner mit Course Builder", (value) => { value.features.courseBuilder = true; }, "features.courseBuilder"],
  ["Learner mit Import und Export", (value) => { value.features.importExport = true; }, "features.importExport"],
  ["Learner mit Kursbibliothek", (value) => { value.features.courseLibrary = true; }, "features.courseLibrary"],
  ["Author mit reaktiviertem Book Capture", (value) => {
    Object.assign(value, clone(authorRaw));
    value.features.bookCapture = true;
  }, "features.bookCapture"],
  ["unbekannte Featureoption", (value) => { value.features.secretFeature = true; }, "features.secretFeature"],
  ["gefährlicher Kurspfad", (value) => { value.course.file = "../../course.json"; }, "course.file"],
]) {
  test(`Profilvalidator: ${name}`, async () => {
    const raw = clone(learnerRaw);
    mutate(raw);
    await expectFieldError(raw, field);
  });
}

test("falscher App-Typ in einer Kursquelle wird abgelehnt", async () => {
  await mkdir(TEMP_PROFILE_ROOT, { recursive: true });
  const courseFile = path.join(TEMP_PROFILE_ROOT, "wrong-app.json");
  await writeFile(courseFile, JSON.stringify({ ...exampleCourse, appType: "grammar" }));
  const raw = clone(learnerRaw);
  raw.course.file = "./dist/vocabulary-trainer/.test-profiles/wrong-app.json";
  await expectFieldError(raw, "course.file");
});

test("Author-Capabilities erlauben den vollständigen Autorenworkflow", () => {
  const caps = createDeploymentCapabilities(authorRaw);
  assert.equal(caps.canManageCourses(), true);
  assert.equal(caps.canBuildCourses(), true);
  assert.equal(caps.canImportCourses(), true);
  assert.equal(caps.canExportCourses(), true);
  assert.equal(caps.canSwitchCourses(), true);
  assert.equal(caps.hasFixedCourse(), false);
});

test("Learner-Capabilities sperren Verwaltung und besitzen einen festen Kurs", () => {
  const caps = createDeploymentCapabilities(learnerRaw);
  assert.equal(caps.canManageCourses(), false);
  assert.equal(caps.canImportCourses(), false);
  assert.equal(caps.canExportCourses(), false);
  assert.equal(caps.canSwitchCourses(), false);
  assert.equal(caps.hasFixedCourse(), true);
  assert.equal(caps.isRouteAvailable("/courses"), false);
  assert.equal(caps.isRouteAvailable("/course-builder"), false);
});

test("optionale Capabilities und unbekannte Capability fallen sicher aus", () => {
  const profile = clone(learnerRaw);
  profile.features.motivation = false;
  profile.features.pronunciation = false;
  profile.features.speedChallenge = false;
  const caps = createDeploymentCapabilities(profile);
  assert.equal(caps.hasMotivation(), false);
  assert.equal(caps.hasPronunciation(), false);
  assert.equal(caps.hasSpeedChallenge(), false);
  assert.equal(caps.isRouteAvailable("/speed"), false);
  assert.equal(caps.supports("unknown"), false);
});

test("Laufzeitprofil validiert die feste Kursreferenz", () => {
  const runtime = validateRuntimeDeploymentProfile({
    ...learnerRaw,
    course: { id: exampleCourse.id, file: "./data/course.json" },
  });
  assert.equal(runtime.course.id, exampleCourse.id);
});

test("Published-Course-Loader lädt ausschließlich den im Profil benannten Kurs", async () => {
  const profile = validateRuntimeDeploymentProfile({
    ...learnerRaw,
    course: { id: exampleCourse.id, file: "./data/course.json" },
  });
  const context = await loadPublishedCourseContext(profile, {
    baseUrl: "https://example.test/subfolder/index.html",
    loadJson: async (url) => {
      assert.equal(url.href, "https://example.test/subfolder/data/course.json");
      return exampleCourse;
    },
  });
  assert.equal(context.courseConfig.courseId, exampleCourse.id);
  assert.equal(context.courseConfig.languages.source.code, "en");
});

test("Published-Course-Loader fällt bei falscher Kurs-ID nicht auf einen anderen Kurs zurück", async () => {
  const profile = validateRuntimeDeploymentProfile({
    ...learnerRaw,
    course: { id: "expected-course", file: "./data/course.json" },
  });
  await assert.rejects(
    () => loadPublishedCourseContext(profile, {
      baseUrl: "https://example.test/app/",
      loadJson: async () => exampleCourse,
    }),
    /Erwartet wurde Kurs-ID/,
  );
});

test("Storage-Key enthält App-Typ, Deployment, Kurs und Datentyp", () => {
  configureStorageNamespace("learner-a");
  assert.equal(
    createCourseStorageKey("course-1", "learning-state"),
    "edutools:vocabulary:learner-a:course:course-1:learning",
  );
  assert.equal(
    createCourseStorageKey("course-1", "motivation-state"),
    "edutools:vocabulary:learner-a:course:course-1:motivation",
  );
});

test("Author und zwei Learner-Deployments bleiben storage-seitig getrennt", () => {
  configureStorageNamespace("vocabulary-author");
  const author = createCourseStorageKey("same-course", "learning-state");
  configureStorageNamespace("learner-a");
  const learnerA = createCourseStorageKey("same-course", "learning-state");
  configureStorageNamespace("learner-b");
  const learnerB = createCourseStorageKey("same-course", "learning-state");
  assert.equal(new Set([author, learnerA, learnerB]).size, 3);
});

test("erneute Konfiguration mit gleicher Deployment-ID und Titeländerung erhält den Namespace", () => {
  configureStorageNamespace("stable-deployment");
  const before = createCourseStorageKey("course", "learning-state");
  configureStorageNamespace("stable-deployment");
  const after = createCourseStorageKey("course", "learning-state");
  assert.equal(before, after);
});

test("Legacy-Author-Migration kopiert Learning, Motivation und Bibliothek idempotent", () => {
  class MemoryStorage {
    constructor(entries) { this.values = new Map(entries); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(String(key)) ?? null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
  }
  const storage = new MemoryStorage([
    ["edutools:vocabulary-trainer:course-library", '{"schemaVersion":1}'],
    ["edutools:vocabulary-trainer:course-a:learning-state", '{"schemaVersion":1}'],
    ["edutools:vocabulary-trainer:course-a:motivation-state", '{"schemaVersion":1}'],
  ]);
  configureStorageNamespace("vocabulary-author-migration-test");
  const first = migrateLegacyAuthorStorage({ storage });
  const second = migrateLegacyAuthorStorage({ storage });
  assert.equal(first.migrated, true);
  assert.equal(second.alreadyCompleted, true);
  assert.equal(storage.getItem(createCourseStorageKey("course-a", "learning-state")), '{"schemaVersion":1}');
  assert.equal(storage.getItem(createDeploymentStorageKey("course-library")), '{"schemaVersion":1}');
});

let authorBuild;
let learnerBuild;

test("Author-Build wird statisch und vollständig erzeugt", async () => {
  authorBuild = await buildVocabularyTrainer(AUTHOR_PROFILE_PATH, { repositoryRoot: REPOSITORY_ROOT });
  const tree = await files(authorBuild.outputDirectory);
  for (const required of [
    "course-library/course-runtime.js",
    "ai-import/ai-import-controller.js",
    "ai-import/ai-import-runtime.js",
    "views/course-builder-view.js",
    "views/course-library-view.js",
    "views/ai-import-view.js",
    "import/adapters/ai-content-adapter.js",
    "import/adapters/course-json-batch-adapter.js",
    "import/core/import-duplicate-key.js",
    "import/import-pipeline.js",
    "import/course-exporter.js",
    "import/json-course-importer.js",
    "import/import-template.js",
    "prompts/prompt-generator.js",
    "prompts/prompt-loader.js",
    "prompts/prompt-registry.js",
    "prompts/template-engine.js",
    "prompts/vocabulary/import-v1.txt",
    "styles/authoring.css",
  ]) assert.ok(tree.includes(required), required);
  assert.equal(tree.some((file) => /^(?:ocr|author\/image-import|speech|speak)\//.test(file)), false);
  assert.equal(tree.some((file) => /heic|heif|tesseract|libheif|speech-recognition|recognition-adapter/i.test(file)), false);
  const html = await readFile(path.join(authorBuild.outputDirectory, "index.html"), "utf8");
  const builderView = await readFile(path.join(authorBuild.outputDirectory, "views/course-builder-view.js"), "utf8");
  assert.match(html, /EduTools/);
  assert.match(html, /edutools-signature__initials">MJ/);
  assert.match(builderView, /CSV-Vorlage herunterladen/);
  assert.match(builderView, /Import-Prompt kopieren/);
  assert.doesNotMatch(builderView, /Buchseite importieren|Book Capture/);
  assert.doesNotMatch(html, /Didaktisch durchdacht\. Klar gestaltet\./);
});

test("Learner-Build enthält genau einen Kurs und keine Autorenmodule", async () => {
  learnerBuild = await buildVocabularyTrainer(LEARNER_PROFILE_PATH, { repositoryRoot: REPOSITORY_ROOT });
  const tree = await files(learnerBuild.outputDirectory);
  assert.deepEqual(tree.filter((file) => /^data\/.*\.json$/.test(file)), ["data/course.json"]);
  assert.equal(tree.some((file) => file.startsWith("import/")), false);
  assert.equal(tree.some((file) => file.startsWith("ai-import/")), false);
  assert.equal(tree.some((file) => file.startsWith("prompts/")), false);
  assert.equal(tree.includes("views/ai-import-view.js"), false);
  assert.equal(tree.includes("views/course-builder-view.js"), false);
  assert.equal(tree.includes("views/course-library-view.js"), false);
  assert.equal(tree.includes("styles/authoring.css"), false);
  assert.equal(tree.some((file) => /test|fixture/i.test(file)), false);
  assert.equal(tree.some((file) => file.startsWith("ocr/")), false);
  assert.equal(tree.some((file) => /heic|heif|image-import/i.test(file)), false);
  assert.equal(tree.some((file) => /^speech\/|speech-view|speech-recognition/i.test(file)), false);
  const html = await readFile(path.join(learnerBuild.outputDirectory, "index.html"), "utf8");
  assert.match(html, /EduTools/);
  assert.match(html, /edutools-signature__initials">MJ/);
  assert.doesNotMatch(html, /data-route-view="\/speak"|Sprechübung|SpeechRecognition|Mikrofon/);
  assert.doesNotMatch(html, /Book Capture|Didaktisch durchdacht\. Klar gestaltet\./);
});

test("Produktvalidator weist nachträglich eingeschleusten Speech-Code zurück", async () => {
  const injected = path.join(learnerBuild.outputDirectory, "speech-recognition.js");
  await writeFile(injected, "globalThis.SpeechRecognition = globalThis.SpeechRecognition;");
  try {
    await assert.rejects(
      () => validateBuiltVocabularyTrainer(learnerBuild.outputDirectory, learnerBuild.profile, exampleCourse),
      /deaktivierte Capture- oder Speech-Dateien/,
    );
  } finally {
    await rm(injected, { force: true });
  }
});

test("Learner-HTML besitzt Profilmetadaten, reduzierte Navigation und zugänglichen Fallback", async () => {
  const html = await readFile(path.join(learnerBuild.outputDirectory, "index.html"), "utf8");
  assert.match(html, /<html[^>]+lang="de"/);
  assert.match(html, /data-edutools-theme="vocabulary"/);
  assert.match(html, /<title>Vocabulary Trainer – Beispielkurs<\/title>/);
  assert.match(html, /class="brand__family">EduTools/);
  assert.match(html, /data-app-title>Beispielkurs/);
  assert.doesNotMatch(html, /href="#\/courses"/);
  assert.doesNotMatch(html, /data-course-builder-content/);
  assert.match(html, /id="unavailable-view-title"/);
  assert.match(html, /Diese Funktion ist in dieser Version nicht verfügbar/);
  assert.match(html, /href="#\/dashboard"/);
});

test("Runtime-Profil und Manifest enthalten keine Maschinenpfade", async () => {
  const runtime = await json(path.join(learnerBuild.outputDirectory, "runtime/deployment-profile.json"));
  const manifestText = await readFile(path.join(learnerBuild.outputDirectory, "build-manifest.json"), "utf8");
  assert.match(runtime.course.file, /^\.\/data\/course\.json\?build=[a-f0-9]{16}$/);
  assert.match(runtime.buildHash, /^[a-f0-9]{64}$/);
  assert.equal(runtime.deploymentId, learnerRaw.deploymentId);
  assert.doesNotMatch(manifestText, /\/Users\/|file:\/\//);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.buildHash, runtime.buildHash);
  assert.deepEqual(manifest.files.map((file) => file.path), [...manifest.files.map((file) => file.path)].sort());
});

test("Build-Assets sind relativ und für Unterverzeichnisse auflösbar", async () => {
  const html = await readFile(path.join(learnerBuild.outputDirectory, "index.html"), "utf8");
  assert.match(html, /href="design-system\/css\/tokens\.css\?build=[a-f0-9]{16}"/);
  assert.match(html, /href="design-system\/css\/brand-core\.css\?build=[a-f0-9]{16}"/);
  assert.match(html, /href="design-system\/css\/themes\/vocabulary\.css\?build=[a-f0-9]{16}"/);
  assert.match(html, /href="icon\.svg\?build=[a-f0-9]{16}"/);
  assert.match(html, /src="app\.js\?build=[a-f0-9]{16}"/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
  await validateBuiltVocabularyTrainer(learnerBuild.outputDirectory, learnerBuild.profile, exampleCourse);
});

test("deaktivierte optionale Features fehlen aus UI und Dateiplan", async () => {
  await mkdir(TEMP_PROFILE_ROOT, { recursive: true });
  const profilePath = path.join(TEMP_PROFILE_ROOT, "disabled.json");
  const raw = clone(learnerRaw);
  raw.profileId = "learner-disabled-test";
  raw.deploymentId = "learner-disabled-test";
  raw.features.motivation = false;
  raw.features.pronunciation = false;
  raw.features.speedChallenge = false;
  raw.output.directory = "./dist/vocabulary-trainer/test-disabled";
  await writeFile(profilePath, JSON.stringify(raw));
  const result = await buildVocabularyTrainer(profilePath, { repositoryRoot: REPOSITORY_ROOT });
  const tree = await files(result.outputDirectory);
  const html = await readFile(path.join(result.outputDirectory, "index.html"), "utf8");
  assert.equal(tree.some((file) => file.startsWith("motivation/")), false);
  assert.equal(tree.some((file) => file.startsWith("speed/")), false);
  assert.equal(tree.includes("audio/pronunciation-service.js"), false);
  assert.doesNotMatch(html, /Speed Challenge/);
  assert.doesNotMatch(html, /data-dashboard-motivation/);
});

test("identische Eingaben erzeugen identische funktionale Manifeste", async () => {
  const first = await buildVocabularyTrainer(LEARNER_PROFILE_PATH, { repositoryRoot: REPOSITORY_ROOT });
  const firstManifest = await readFile(path.join(first.outputDirectory, "build-manifest.json"), "utf8");
  const second = await buildVocabularyTrainer(LEARNER_PROFILE_PATH, { repositoryRoot: REPOSITORY_ROOT });
  const secondManifest = await readFile(path.join(second.outputDirectory, "build-manifest.json"), "utf8");
  assert.equal(firstManifest, secondManifest);
});

test("ungültiges Profil verändert einen vorhandenen gültigen Build nicht", async () => {
  await mkdir(TEMP_PROFILE_ROOT, { recursive: true });
  const profilePath = path.join(TEMP_PROFILE_ROOT, "invalid-profile.json");
  const raw = clone(learnerRaw);
  raw.profileId = "atomic-invalid-profile";
  raw.deploymentId = "atomic-invalid-profile";
  raw.output.directory = "./dist/vocabulary-trainer/test-atomic-invalid-profile";
  const target = path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-atomic-invalid-profile");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "sentinel.txt"), "valid-before");
  raw.features.courseBuilder = true;
  await writeFile(profilePath, JSON.stringify(raw));
  await assert.rejects(() => buildVocabularyTrainer(profilePath, { repositoryRoot: REPOSITORY_ROOT }));
  assert.equal(await readFile(path.join(target, "sentinel.txt"), "utf8"), "valid-before");
});

test("ungültiger Kurs verändert einen vorhandenen gültigen Build nicht", async () => {
  const profilePath = path.join(TEMP_PROFILE_ROOT, "invalid-course-profile.json");
  const coursePath = path.join(TEMP_PROFILE_ROOT, "invalid-course.json");
  const raw = clone(learnerRaw);
  raw.profileId = "atomic-invalid-course";
  raw.deploymentId = "atomic-invalid-course";
  raw.course.file = "./dist/vocabulary-trainer/.test-profiles/invalid-course.json";
  raw.output.directory = "./dist/vocabulary-trainer/test-atomic-invalid-course";
  const target = path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-atomic-invalid-course");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "sentinel.txt"), "valid-before");
  await writeFile(coursePath, JSON.stringify({ ...exampleCourse, appType: "wrong" }));
  await writeFile(profilePath, JSON.stringify(raw));
  await assert.rejects(() => buildVocabularyTrainer(profilePath, { repositoryRoot: REPOSITORY_ROOT }));
  assert.equal(await readFile(path.join(target, "sentinel.txt"), "utf8"), "valid-before");
});

test("Fehler vor dem atomaren Ersetzen erhält Ziel und entfernt den temporären Build", async () => {
  const profilePath = path.join(TEMP_PROFILE_ROOT, "copy-failure-profile.json");
  const raw = clone(learnerRaw);
  raw.profileId = "atomic-copy-failure";
  raw.deploymentId = "atomic-copy-failure";
  raw.output.directory = "./dist/vocabulary-trainer/test-atomic-copy-failure";
  const target = path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-atomic-copy-failure");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "sentinel.txt"), "valid-before");
  await writeFile(profilePath, JSON.stringify(raw));
  await assert.rejects(() => buildVocabularyTrainer(profilePath, {
    repositoryRoot: REPOSITORY_ROOT,
    beforeReplace() { throw new Error("simulierter Kopierfehler"); },
  }), /simulierter Kopierfehler/);
  assert.equal(await readFile(path.join(target, "sentinel.txt"), "utf8"), "valid-before");
  const parentFiles = await files(path.dirname(target));
  assert.equal(parentFiles.some((file) => file.includes(".tmp-test-atomic-copy-failure")), false);
});

let passed = 0;
try {
  for (const { name, callback } of tests) {
    await callback();
    passed += 1;
    console.log(`✓ ${name}`);
  }
  console.log(`\n${passed}/${tests.length} Veröffentlichungs- und Buildtests bestanden.`);
} finally {
  for (const directory of [
    TEMP_PROFILE_ROOT,
    path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-disabled"),
    path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-atomic-invalid-profile"),
    path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-atomic-invalid-course"),
    path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-atomic-copy-failure"),
  ]) await rm(directory, { recursive: true, force: true });
}
