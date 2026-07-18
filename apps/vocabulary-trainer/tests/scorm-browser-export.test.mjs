import assert from "node:assert/strict";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { buildVocabularyTrainer } from "../build/build-vocabulary-trainer.js";
import { listFiles } from "../build/build-utils.js";
import { prepareScormHarness } from "../build/scorm-harness.js";
import { validateScormZip } from "../build/scorm-package-validator.js";
import { inspectStoredZip } from "../build/zip-store.js";
import { inspectScorm12Manifest } from "../build/scorm-manifest.js";
import {
  createCourse,
  createUnit,
  createWord,
  COURSE_SOURCE_TYPES,
} from "../src/course-library/course-schema.js";
import {
  createIndividualScormPackage,
  createScormExportFilename,
  createScormExportIdentity,
  downloadIndividualScormPackage,
  validateScormExportCourse,
} from "../src/scorm-export/scorm-browser-export.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_ROOT, "../../..");
const LEARNER_PROFILE = path.join(ROOT, "apps/vocabulary-trainer/profiles/production/learner.production.json");
const tests = [];
const test = (name, callback) => tests.push({ name, callback });

function courseFixture() {
  const course = createCourse({
    id: "course-sprint-4-long",
    title: "Englisch 7 – Inseln & Geschichten",
    description: "Eigener Kurs für die SCORM-Abnahme.",
    sourceType: COURSE_SOURCE_TYPES.OWN,
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
  }, { now: "2026-07-16T09:00:00.000Z" });
  const first = createUnit({ id: "unit-foundation", title: "Foundation", order: 1, released: true, current: true });
  const second = createUnit({ id: "unit-stories", title: "Stories", order: 2, released: true });
  for (let index = 1; index <= 19; index += 1) {
    const word = createWord({
      id: `word-stable-${index}`,
      source: index === 1 ? "castle" : `concept ${index}`,
      targets: index === 1 ? ["Burg", "Schloss"] : [`Begriff ${index}`],
      phonetic: index === 1 ? "ˈkɑː.səl" : "",
      hint: index === 1 ? "A strong building from an earlier time." : `A short hint for item ${index}.`,
      example: index === 1 ? "The old castle stands above the town." : `This is example ${index}.`,
      tags: index === 1 ? ["building", "history"] : [],
    });
    (index <= 15 ? first : second).words.push(word);
  }
  course.units.push(first, second);
  return course;
}

async function buildTemplate(root) {
  const outputDirectory = path.join(root, "learner-template");
  await buildVocabularyTrainer(LEARNER_PROFILE, {
    repositoryRoot: ROOT,
    outputDirectory,
    embedScormTemplate: false,
  });
  const manifest = JSON.parse(await readFile(path.join(outputDirectory, "build-manifest.json"), "utf8"));
  const entries = await Promise.all(manifest.files.map(async ({ path: file }) => ({
    path: file,
    data: new Uint8Array(await readFile(path.join(outputDirectory, file))),
  })));
  return { manifest, entries };
}

const workRoot = await mkdtemp(path.join(tmpdir(), "edutools-browser-scorm-test-"));
let template;
try {
  template = await buildTemplate(workRoot);
} catch (error) {
  await rm(workRoot, { recursive: true, force: true });
  throw error;
}

test("eigener 19-Wörter-Kurs erzeugt ein vollständiges SCORM-1.2-ZIP", async () => {
  const course = courseFixture();
  const result = await createIndividualScormPackage(course, { template, crypto: webcrypto });
  assert.equal(result.filename, "edutools-vocabulary-englisch-7-inseln-geschichten-scorm.zip");
  assert.equal(result.course.units.length, 2);
  assert.equal(result.course.units.flatMap((unit) => unit.words).length, 19);
  assert.equal(result.zip[0], 0x50);
  assert.equal(result.zip[1], 0x4b);

  const file = path.join(workRoot, result.filename);
  await writeFile(file, result.zip);
  const inspected = await validateScormZip(file);
  assert.equal(inspected.manifest.courseId, course.id);
  const paths = inspected.entries.map(({ path: entryPath }) => entryPath);
  assert.equal(paths.includes("imsmanifest.xml"), true);
  assert.equal(paths.includes("index.html"), true);
  assert.equal(paths.includes("data/course.json"), true);
  const scormManifest = inspectScorm12Manifest(inspected.entries.find(({ path: entryPath }) => entryPath === "imsmanifest.xml").data.toString("utf8"));
  assert.equal(scormManifest.startFile, "index.html");
  assert.equal(scormManifest.startFile.includes("?") || scormManifest.startFile.includes("#"), false);
  assert.equal(scormManifest.defaultOrganization, scormManifest.organizationIdentifier);
  assert.equal(scormManifest.itemIdentifierRef, scormManifest.resourceIdentifier);
  assert.equal(paths.some((entryPath) => /course-builder|course-library-view|course-library-service|course-runtime|authoring|ocr|heic|speech-recognition|recognition-adapter/iu.test(entryPath)), false);

  const readPackageJson = (entryPath) => JSON.parse(inspected.entries.find(({ path: candidate }) => candidate === entryPath).data.toString("utf8"));
  const buildInfo = readPackageJson("runtime/build-info.json");
  const buildManifest = readPackageJson("build-manifest.json");
  const packageManifest = readPackageJson("scorm-package-manifest.json");
  assert.equal(buildInfo.appVersion, "4.0.3");
  assert.equal(buildManifest.appVersion, buildInfo.appVersion);
  assert.equal(packageManifest.appVersion, buildInfo.appVersion);

  const packageCourse = JSON.parse(inspected.entries.find(({ path: entryPath }) => entryPath === "data/course.json").data.toString("utf8"));
  assert.equal(packageCourse.units.flatMap((unit) => unit.words).length, 19);
  assert.deepEqual(packageCourse.units[0].words[0].targets, ["Burg", "Schloss"]);
  assert.equal(packageCourse.units[0].words[0].phonetic, "ˈkɑː.səl");
  assert.equal(JSON.stringify(packageCourse).includes("learningState"), false);
  assert.equal(JSON.stringify(packageCourse).includes("motivation"), false);

  const harness = await prepareScormHarness(file);
  try {
    assert.equal((await listFiles(harness.packageRoot)).includes("index.html"), true);
    assert.equal(JSON.parse(await readFile(path.join(harness.packageRoot, "data/course.json"), "utf8")).id, course.id);
  } finally {
    await harness.cleanup();
  }
});

test("Paketidentität, Dateiname und ZIP sind für denselben Kurs stabil", async () => {
  const course = courseFixture();
  assert.deepEqual(createScormExportIdentity(course), createScormExportIdentity(course));
  assert.equal(createScormExportFilename(course), createScormExportFilename(course));
  const first = await createIndividualScormPackage(course, { template, crypto: webcrypto });
  const second = await createIndividualScormPackage(course, { template, crypto: webcrypto });
  assert.deepEqual(first.zip, second.zip);
  assert.deepEqual(inspectStoredZip(Buffer.from(first.zip)).entries.map(({ path: entryPath }) => entryPath), inspectStoredZip(Buffer.from(second.zip)).entries.map(({ path: entryPath }) => entryPath));
});

test("archivierte und nicht freigegebene Inhalte gelangen nicht ins Lernpaket", async () => {
  const course = courseFixture();
  const locked = createUnit({ id: "unit-locked", title: "Locked", order: 3, released: false });
  locked.words.push(createWord({ id: "word-locked", source: "secret", targets: ["geheim"] }));
  course.units.push(locked);
  course.units[0].words[1].archived = true;
  const result = await createIndividualScormPackage(course, { template, crypto: webcrypto });
  assert.equal(result.course.units.some((unit) => unit.id === "unit-locked"), false);
  assert.equal(result.course.units.flatMap((unit) => unit.words).some((word) => word.id === "word-stable-2"), false);
});

test("ungültige oder mitgelieferte Kurse werden vor dem Download blockiert", async () => {
  const bundled = courseFixture();
  bundled.sourceType = COURSE_SOURCE_TYPES.BUNDLED;
  bundled.editable = false;
  assert.equal(validateScormExportCourse(bundled).valid, false);
  await assert.rejects(
    () => createIndividualScormPackage(bundled, { template, crypto: webcrypto }),
    /dupliziert/u,
  );
  const empty = courseFixture();
  empty.units.forEach((unit) => { unit.released = false; });
  await assert.rejects(
    () => createIndividualScormPackage(empty, { template, crypto: webcrypto }),
    /freig/u,
  );
});

test("fehlende Browser-SCORM-Vorlage wird verständlich gemeldet", async () => {
  await assert.rejects(
    () => createIndividualScormPackage(courseFixture(), { template: {}, crypto: webcrypto }),
    /SCORM-Vorlage/u,
  );
});

test("Browserexport blockiert eine nicht paketrelative Vorlagenreferenz vor dem Download", async () => {
  const brokenTemplate = {
    manifest: template.manifest,
    entries: template.entries.map((entry) => ({
      ...entry,
      data: entry.path === "index.html"
        ? new TextEncoder().encode(new TextDecoder().decode(entry.data).replace('href="icon.svg', 'href="/icon.svg'))
        : entry.data,
    })),
  };
  await assert.rejects(
    () => createIndividualScormPackage(courseFixture(), { template: brokenTemplate, crypto: webcrypto }),
    (error) => error.message === "Das SCORM-Lernpaket konnte nicht korrekt erstellt werden."
      && error.issues.some((issue) => /paketrelativ/u.test(issue)),
  );
});

test("Browserdownload nutzt eine ZIP-Blob-URL und gibt sie zuverlässig frei", async () => {
  const calls = [];
  const link = { hidden: false, click() { calls.push("click"); }, remove() { calls.push("remove"); } };
  const fakeDocument = { createElement: () => link, body: { append: () => calls.push("append") } };
  const fakeURL = { createObjectURL: () => "blob:scorm", revokeObjectURL: (url) => calls.push(`revoke:${url}`) };
  class FakeBlob { constructor(parts, options) { this.parts = parts; this.type = options.type; } }
  const result = await downloadIndividualScormPackage(courseFixture(), {
    template,
    crypto: webcrypto,
    document: fakeDocument,
    URL: fakeURL,
    Blob: FakeBlob,
  });
  assert.match(link.download, /-scorm\.zip$/u);
  assert.deepEqual(calls, ["append", "click", "remove", "revoke:blob:scorm"]);
  assert.equal(result.bytes > 0, true);
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
await rm(workRoot, { recursive: true, force: true });
console.log(`\n${tests.length - failures}/${tests.length} Browser-SCORM-Exporttests bestanden.`);
if (failures > 0) process.exitCode = 1;
