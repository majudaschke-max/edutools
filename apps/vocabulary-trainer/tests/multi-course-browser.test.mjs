import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { validatePublicationProfile } from "../build/build-profile-validator.js";
import { buildVocabularyTrainer, validateBuiltVocabularyTrainer } from "../build/build-vocabulary-trainer.js";
import { createDeploymentCapabilities } from "../src/runtime/deployment-capabilities.js";
import { validateRuntimeDeploymentProfile } from "../src/runtime/deployment-profile.js";
import {
  createPublishedCourseSelectionUrl,
  createPublishedCourseUrl,
  getRequestedPublicationId,
  loadPublishedCatalogCourseContext,
  validatePublishedCourseCatalog,
} from "../src/runtime/published-course-catalog.js";
import { renderPublishedCourseLibrary } from "../src/views/published-course-library-view.js";
import { configureStorageNamespace, createCourseStorageKey } from "../src/core/storage.js";
import { loadLearningScope, saveLearningScope } from "../src/core/learning-scope.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_ROOT, "../../..");
const CATALOG_PROFILE_PATH = path.join(
  REPOSITORY_ROOT,
  "apps/vocabulary-trainer/profiles/production/learner-catalog.production.json",
);
const FIXED_PROFILE_PATH = path.join(
  REPOSITORY_ROOT,
  "apps/vocabulary-trainer/profiles/production/learner.production.json",
);
const TEMP_BUILD = path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-browser-catalog");
const IDENTITY_TEST_ROOT = path.join(
  REPOSITORY_ROOT,
  "dist/vocabulary-trainer/test-browser-catalog-identity",
);
const tests = [];

function test(name, callback) { tests.push({ name, callback }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
}

class MiniNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = "";
    this._text = "";
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; this._text = ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class MiniDocument {
  createElement(tagName) { return new MiniNode(tagName, this); }
}

function findNodes(root, predicate, result = []) {
  if (predicate(root)) result.push(root);
  root.children.forEach((child) => findNodes(child, predicate, result));
  return result;
}

const rawProfile = await json(CATALOG_PROFILE_PATH);
const fixedProfile = await json(FIXED_PROFILE_PATH);
const validated = await validatePublicationProfile(rawProfile, {
  repositoryRoot: REPOSITORY_ROOT,
  profilePath: CATALOG_PROFILE_PATH,
});

function generatedCatalog() {
  return {
    schemaVersion: 1,
    deploymentId: validated.profile.deploymentId,
    courses: validated.catalog.entries.map((entry) => ({
      publicationId: entry.publicationId,
      courseId: entry.course.id,
      contentVersion: entry.course.contentVersion,
      title: entry.course.title,
      subtitle: entry.course.subtitle,
      languages: {
        source: {
          code: entry.course.languages.source.code,
          label: entry.course.languages.source.label,
        },
        target: {
          code: entry.course.languages.target.code,
          label: entry.course.languages.target.label,
        },
      },
      file: `./${entry.publicationId}.json?build=0123456789abcdef`,
    })),
  };
}

test("Katalogprofil validiert drei eindeutige Browser-Kurse", () => {
  assert.equal(validated.profile.course, null);
  assert.equal(validated.profile.courseCatalog.entries.length, 3);
  assert.equal(validated.catalog.entries.length, 3);
  assert.equal(new Set(validated.catalog.entries.map((entry) => entry.course.id)).size, 3);
});

test("Learner-Profil darf festen Kurs und Katalog nicht mischen", async () => {
  const raw = clone(rawProfile);
  raw.course = clone(fixedProfile.course);
  await assert.rejects(
    () => validatePublicationProfile(raw, { repositoryRoot: REPOSITORY_ROOT }),
    /courseCatalog.*darf nicht gemeinsam mit course/,
  );
});

test("Katalogprofil lehnt leere, doppelte und unsichere Veröffentlichungs-IDs ab", async () => {
  const empty = clone(rawProfile);
  empty.courseCatalog.entries = [];
  await assert.rejects(
    () => validatePublicationProfile(empty, { repositoryRoot: REPOSITORY_ROOT }),
    /mindestens einen Browser-Kurs/,
  );
  const duplicate = clone(rawProfile);
  duplicate.courseCatalog.entries[1].publicationId = duplicate.courseCatalog.entries[0].publicationId;
  await assert.rejects(
    () => validatePublicationProfile(duplicate, { repositoryRoot: REPOSITORY_ROOT }),
    /publicationId.*mehrfach/,
  );
  const unsafe = clone(rawProfile);
  unsafe.courseCatalog.entries[0].publicationId = "../Privat";
  await assert.rejects(
    () => validatePublicationProfile(unsafe, { repositoryRoot: REPOSITORY_ROOT }),
    /publicationId.*Kleinbuchstaben/,
  );
});

test("Runtimeprofil akzeptiert exklusiv den Katalogpfad", () => {
  const profile = validateRuntimeDeploymentProfile({
    ...rawProfile,
    courseCatalog: { file: "./data/courses/index.json?build=0123456789abcdef" },
  });
  assert.equal(profile.course, null);
  assert.match(profile.courseCatalog.file, /^\.\/data\/courses\/index\.json/);
  const mixed = { ...profile, course: { id: "course", file: "./data/course.json" } };
  assert.throws(() => validateRuntimeDeploymentProfile(mixed), /Genau course oder courseCatalog/);
  assert.throws(
    () => validateRuntimeDeploymentProfile({
      ...rawProfile,
      mode: "author",
      courseCatalog: { file: "./data/courses/index.json" },
    }),
    /Author-Profile dürfen keinen veröffentlichten Kurs/,
  );
});

test("Katalog-Learner besitzt Auswahl-, aber keine Author-Capability", () => {
  const runtime = validateRuntimeDeploymentProfile({
    ...rawProfile,
    courseCatalog: { file: "./data/courses/index.json" },
  });
  const capabilities = createDeploymentCapabilities(runtime);
  assert.equal(capabilities.hasPublishedCourseCatalog(), true);
  assert.equal(capabilities.hasFixedCourse(), false);
  assert.equal(capabilities.canManageCourses(), false);
  assert.equal(capabilities.isRouteAvailable("/course-select"), true);
  assert.equal(capabilities.isRouteAvailable("/courses"), false);
});

test("generierter Browser-Katalog ist streng, eindeutig und deploymentgebunden", () => {
  const catalog = validatePublishedCourseCatalog(generatedCatalog(), "vocabulary-learner");
  assert.equal(catalog.courses.length, 3);
  assert.throws(
    () => validatePublishedCourseCatalog(generatedCatalog(), "anderes-deployment"),
    /nicht zum aktuellen Deployment/,
  );
  const drift = generatedCatalog();
  drift.courses[1].courseId = drift.courses[0].courseId;
  assert.throws(() => validatePublishedCourseCatalog(drift, "vocabulary-learner"), /Kurs-ID.*mehrfach/);
  const unknownLanguageField = generatedCatalog();
  unknownLanguageField.courses[0].languages.source.locale = "en-GB";
  assert.throws(
    () => validatePublishedCourseCatalog(unknownLanguageField, "vocabulary-learner"),
    /languages\.source\.locale ist nicht unterstützt/,
  );
  const unknownLanguagesField = generatedCatalog();
  unknownLanguagesField.courses[0].languages.note = "nicht erlaubt";
  assert.throws(
    () => validatePublishedCourseCatalog(unknownLanguagesField, "vocabulary-learner"),
    /languages\.note ist nicht unterstützt/,
  );
  const unsafeFile = generatedCatalog();
  unsafeFile.courses[0].file = "./english-everyday.json#ignored";
  assert.throws(
    () => validatePublishedCourseCatalog(unsafeFile, "vocabulary-learner"),
    /sichere relative JSON-Datei/,
  );
});

test("Direktlink und Kursauswahl erhalten Pages-Unterpfad und Hash-Route", () => {
  const direct = createPublishedCourseUrl(
    "https://example.test/edutools/?old=1#/progress",
    "latin-foundations",
  );
  assert.equal(direct, "https://example.test/edutools/?old=1&course=latin-foundations#/dashboard");
  const selection = createPublishedCourseSelectionUrl(direct);
  assert.equal(selection, "https://example.test/edutools/?old=1#/course-select");
  assert.deepEqual(
    getRequestedPublicationId({ search: "?course=latin-foundations" }),
    { explicit: true, publicationId: "latin-foundations" },
  );
  assert.deepEqual(getRequestedPublicationId({ search: "" }), { explicit: false, publicationId: null });
});

test("Katalogkurs wird über relative Datei geladen und gegen Metadaten geprüft", async () => {
  const catalog = validatePublishedCourseCatalog(generatedCatalog(), "vocabulary-learner");
  const selected = validated.catalog.entries[0].course;
  const context = await loadPublishedCatalogCourseContext(
    { courseCatalog: { file: "./data/courses/index.json" } },
    catalog,
    catalog.courses[0].publicationId,
    {
      baseUrl: "https://example.test/edutools/",
      loadJson: async (url) => {
        assert.equal(url.href, "https://example.test/edutools/data/courses/english-everyday.json?build=0123456789abcdef");
        return selected;
      },
    },
  );
  assert.equal(context.courseConfig.courseId, selected.id);
  assert.equal(context.publication.publicationId, "english-everyday");
  const changed = { ...selected, title: "Unerwarteter Titel" };
  await assert.rejects(
    () => loadPublishedCatalogCourseContext(
      { courseCatalog: { file: "./data/courses/index.json" } },
      catalog,
      "english-everyday",
      { baseUrl: "https://example.test/edutools/", loadJson: async () => changed },
    ),
    /stimmt nicht mit dem Katalog überein/,
  );
  assert.equal(await loadPublishedCatalogCourseContext({}, catalog, "entfernt", {}), null);
});

test("Kursauswahl rendert drei semantische Karten und stabile Links", () => {
  const documentRoot = new MiniDocument();
  const container = documentRoot.createElement("div");
  const catalog = validatePublishedCourseCatalog(generatedCatalog(), "vocabulary-learner");
  renderPublishedCourseLibrary(container, catalog, {
    lastPublicationId: "english-everyday",
    createCourseUrl: (publicationId) => `https://example.test/?course=${publicationId}#/dashboard`,
  });
  assert.equal(findNodes(container, (node) => node.tagName === "li").length, 3);
  assert.equal(findNodes(container, (node) => node.tagName === "article").length, 3);
  const links = findNodes(container, (node) => node.tagName === "a");
  assert.equal(links.length, 3);
  assert.equal(links[0].href, "https://example.test/?course=english-everyday#/dashboard");
  assert.match(container.textContent, /Zuletzt verwendet/);
});

test("Kursauswahl blendet normale Header-Aktionen trotz Layoutregeln aus", async () => {
  const contentStyles = await readFile(path.join(
    REPOSITORY_ROOT,
    "apps/vocabulary-trainer/src/styles/content.css",
  ), "utf8");
  assert.match(contentStyles, /\.app-header \[hidden\]\s*\{\s*display:\s*none !important;/u);
});

test("Lernbereich migriert idempotent in Deployment- und Kursnamespace", () => {
  const legacyKey = "edutools:learning-scope:neutral-language-course";
  const legacyValue = JSON.stringify({ value: "package:neutral-unit-2", packageIds: [] });
  const storage = new MemoryStorage([[legacyKey, legacyValue]]);
  configureStorageNamespace("vocabulary-learner");
  const first = loadLearningScope("neutral-language-course", storage);
  const second = loadLearningScope("neutral-language-course", storage);
  const targetKey = createCourseStorageKey("neutral-language-course", "learning-scope");
  assert.equal(first.value, "package:neutral-unit-2");
  assert.deepEqual(second, first);
  assert.equal(storage.getItem(targetKey), legacyValue);
  assert.equal(storage.getItem(legacyKey), legacyValue);
});

test("Lernbereich und Fachzustände bleiben für drei Kurs-IDs getrennt", () => {
  const storage = new MemoryStorage();
  configureStorageNamespace("vocabulary-learner");
  for (const [index, entry] of validated.catalog.entries.entries()) {
    saveLearningScope(entry.course.id, { value: `package:unit-${index}`, packageIds: [] }, storage);
    storage.setItem(createCourseStorageKey(entry.course.id, "learning-state"), JSON.stringify({ marker: index }));
  }
  const scopes = validated.catalog.entries.map((entry) => loadLearningScope(entry.course.id, storage).value);
  const learningKeys = validated.catalog.entries.map((entry) => createCourseStorageKey(entry.course.id, "learning-state"));
  assert.equal(new Set(scopes).size, 3);
  assert.equal(new Set(learningKeys).size, 3);
});

test("Katalog-Build enthält Index und drei Kurse, aber keine Authormodule", async () => {
  const build = await buildVocabularyTrainer(CATALOG_PROFILE_PATH, {
    repositoryRoot: REPOSITORY_ROOT,
    outputDirectory: TEMP_BUILD,
  });
  const tree = build.manifest.files.map((entry) => entry.path);
  assert.deepEqual(
    tree.filter((file) => /^data\/.*\.json$/u.test(file)),
    [
      "data/courses/english-advanced.json",
      "data/courses/english-everyday.json",
      "data/courses/index.json",
      "data/courses/latin-foundations.json",
    ],
  );
  assert.ok(tree.includes("runtime/published-course-catalog.js"));
  assert.ok(tree.includes("views/published-course-library-view.js"));
  assert.equal(tree.some((file) => file.startsWith("import/") || file.startsWith("course-library/course-runtime")), false);
  const builtCatalog = await json(path.join(TEMP_BUILD, "data/courses/index.json"));
  assert.equal(builtCatalog.courses.length, 3);
  await validateBuiltVocabularyTrainer(TEMP_BUILD, build.profile, null, validated.catalog);
});

test("Kursupdate und Entfernen verändern keine anderen Kursartefakte oder Zustände", async () => {
  await rm(IDENTITY_TEST_ROOT, { recursive: true, force: true });
  const sourceDirectory = path.join(IDENTITY_TEST_ROOT, "sources");
  const outputDirectory = path.join(IDENTITY_TEST_ROOT, "build");
  const profilePath = path.join(IDENTITY_TEST_ROOT, "profile.json");
  await mkdir(sourceDirectory, { recursive: true });

  const profile = clone(rawProfile);
  profile.profileId = "vocabulary-learner-catalog-identity-test";
  profile.output.directory = "./dist/vocabulary-trainer/test-browser-catalog-identity/build";
  for (const [index, entry] of profile.courseCatalog.entries.entries()) {
    const relativeSource = `dist/vocabulary-trainer/test-browser-catalog-identity/sources/${entry.publicationId}.json`;
    entry.file = `./${relativeSource}`;
    await writeFile(
      path.join(REPOSITORY_ROOT, relativeSource),
      `${JSON.stringify(validated.catalog.entries[index].course, null, 2)}\n`,
      "utf8",
    );
  }
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await buildVocabularyTrainer(profilePath, { repositoryRoot: REPOSITORY_ROOT, outputDirectory });
  const initialFiles = await Promise.all(profile.courseCatalog.entries.map((entry) => readFile(
    path.join(outputDirectory, `data/courses/${entry.publicationId}.json`),
    "utf8",
  )));

  configureStorageNamespace(profile.deploymentId);
  const stateStorage = new MemoryStorage();
  const updatedCourseId = validated.catalog.entries[0].course.id;
  const learningStateKey = createCourseStorageKey(updatedCourseId, "learning-state");
  stateStorage.setItem(learningStateKey, JSON.stringify({ marker: "bleibt-erhalten" }));
  const updatedCourse = clone(validated.catalog.entries[0].course);
  updatedCourse.contentVersion += 1;
  updatedCourse.title = "Neutraler Sprachkurs aktualisiert";
  await writeFile(
    path.join(sourceDirectory, `${profile.courseCatalog.entries[0].publicationId}.json`),
    `${JSON.stringify(updatedCourse, null, 2)}\n`,
    "utf8",
  );
  await buildVocabularyTrainer(profilePath, { repositoryRoot: REPOSITORY_ROOT, outputDirectory });
  const updatedFiles = await Promise.all(profile.courseCatalog.entries.map((entry) => readFile(
    path.join(outputDirectory, `data/courses/${entry.publicationId}.json`),
    "utf8",
  )));
  assert.notEqual(updatedFiles[0], initialFiles[0]);
  assert.equal(updatedFiles[1], initialFiles[1]);
  assert.equal(updatedFiles[2], initialFiles[2]);
  assert.equal(JSON.parse(stateStorage.getItem(learningStateKey)).marker, "bleibt-erhalten");

  const removedPublicationId = profile.courseCatalog.entries[2].publicationId;
  profile.courseCatalog.entries = profile.courseCatalog.entries.slice(0, 2);
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await buildVocabularyTrainer(profilePath, { repositoryRoot: REPOSITORY_ROOT, outputDirectory });
  await assert.rejects(() => readFile(
    path.join(outputDirectory, `data/courses/${removedPublicationId}.json`),
    "utf8",
  ));
  assert.equal(
    await readFile(path.join(outputDirectory, "data/courses/english-everyday.json"), "utf8"),
    updatedFiles[0],
  );
  assert.equal(
    await readFile(path.join(outputDirectory, "data/courses/english-advanced.json"), "utf8"),
    updatedFiles[1],
  );
});

test("Einzelkurs-SCORM-Vorlage bleibt frei von Browser-Katalogdateien", async () => {
  const output = path.join(REPOSITORY_ROOT, "dist/vocabulary-trainer/test-fixed-course");
  try {
    const build = await buildVocabularyTrainer(FIXED_PROFILE_PATH, {
      repositoryRoot: REPOSITORY_ROOT,
      outputDirectory: output,
      embedScormTemplate: false,
    });
    const tree = build.manifest.files.map((entry) => entry.path);
    assert.deepEqual(tree.filter((file) => /^data\/.*\.json$/u.test(file)), ["data/course.json"]);
    assert.equal(tree.includes("runtime/published-course-catalog.js"), false);
    assert.equal(tree.includes("views/published-course-library-view.js"), false);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

let passed = 0;
try {
  for (const { name, callback } of tests) {
    await callback();
    passed += 1;
    console.log(`✓ ${name}`);
  }
  console.log(`\n${passed}/${tests.length} Mehrkurs-Browsertests bestanden.`);
} finally {
  await rm(TEMP_BUILD, { recursive: true, force: true });
  await rm(IDENTITY_TEST_ROOT, { recursive: true, force: true });
}
