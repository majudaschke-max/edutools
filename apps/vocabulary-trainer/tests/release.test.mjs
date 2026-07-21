import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { validateDeploymentSet, loadAndValidateDeploymentSet } from "../build/deployment-set-validator.js";
import { assemblePagesRelease } from "../build/release-pages.js";
import { validatePagesRelease } from "../build/release-validator.js";
import { runReleaseSmokeTests } from "../build/release-smoke.js";
import { verifyJsonCourseRoundtrip } from "../build/release-roundtrip.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_ROOT, "../../..");
const DEPLOYMENT_FILE = path.join(REPOSITORY_ROOT, "apps/vocabulary-trainer/deployments/github-pages.production.json");
const COURSE_FILE = path.join(REPOSITORY_ROOT, "apps/vocabulary-trainer/profiles/production/courses/release-roundtrip.production.json");
const WORKFLOW_FILE = path.join(REPOSITORY_ROOT, ".github/workflows/deploy-vocabulary-trainer-pages.yml");
const TEMP_ROOT = path.join(REPOSITORY_ROOT, "dist/.release-tests");
const RELEASE_ROOT = path.join(TEMP_ROOT, "pages");
const tests = [];
const test = (name, callback) => tests.push({ name, callback });
const clone = (value) => JSON.parse(JSON.stringify(value));
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const rawDeployment = await json(DEPLOYMENT_FILE);

async function expectDeploymentError(mutate, field) {
  const value = clone(rawDeployment);
  mutate(value);
  await assert.rejects(
    () => validateDeploymentSet(value, { repositoryRoot: REPOSITORY_ROOT, deploymentPath: DEPLOYMENT_FILE }),
    new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}

test("Produktions-Deployment-Satz validiert genau Root-Learner und Author-Mount", async () => {
  const result = await loadAndValidateDeploymentSet(DEPLOYMENT_FILE, { repositoryRoot: REPOSITORY_ROOT });
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries.find((entry) => entry.mountPath === "").profile.mode, "learner");
  const authorProfile = result.entries.find((entry) => entry.mountPath === "author").profile;
  assert.equal(authorProfile.mode, "author");
  assert.equal(authorProfile.app.title, "EduTools – Vocabulary Trainer");
  assert.equal(authorProfile.app.shortTitle, "EduTools – Vocabulary Trainer");
});

for (const [name, mutate, field] of [
  ["fehlende Schema-Version", (value) => { delete value.schemaVersion; }, "schemaVersion"],
  ["falsche Schema-Version", (value) => { value.schemaVersion = 99; }, "schemaVersion"],
  ["fehlende Deployment-ID", (value) => { value.deploymentSetId = ""; }, "deploymentSetId"],
  ["fehlender Site-Titel", (value) => { value.site.title = ""; }, "site.title"],
  ["ungültige Dokumentsprache", (value) => { value.site.language = "german"; }, "site.language"],
  ["kein Profil", (value) => { value.entries = []; }, "entries"],
  ["doppelter Profilpfad", (value) => { value.entries[1].profile = value.entries[0].profile; }, "profile"],
  ["doppelter Mount-Pfad", (value) => { value.entries[1].mountPath = value.entries[0].mountPath; }, "mountPath"],
  ["mehrere Root-Mounts", (value) => { value.entries[1].mountPath = ""; }, "mountPath"],
  ["absoluter Profilpfad", (value) => { value.entries[0].profile = "/tmp/profile.json"; }, "profile"],
  ["Path-Traversal", (value) => { value.entries[0].profile = "../profile.json"; }, "profile"],
  ["Query im Mount", (value) => { value.entries[1].mountPath = "author?x=1"; }, "mountPath"],
  ["Hash im Mount", (value) => { value.entries[1].mountPath = "author#x"; }, "mountPath"],
  ["unbekannter Profilpfad", (value) => { value.entries[0].profile = "apps/vocabulary-trainer/profiles/production/missing.json"; }, "profile"],
  ["falsche Root-Profil-ID", (value) => { value.rootProfileId = "vocabulary-author"; }, "rootProfileId"],
]) {
  test(`Deployment-Validator: ${name}`, () => expectDeploymentError(mutate, field));
}

test("Browserexport besteht Produktvalidator, frischen Reimport und Learner-Build", async () => {
  const result = await verifyJsonCourseRoundtrip(COURSE_FILE, { repositoryRoot: REPOSITORY_ROOT });
  assert.equal(result.courseId, "course-6944f5d5-9f0e-4df5-afb8-b6f7add482dc");
  assert.equal(result.unitCount, 2);
  assert.equal(result.wordCount, 3);
  assert.deepEqual(result.languages, {
    source: { code: "fr", label: "Französisch", speechLocale: "fr-FR" },
    target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
  });
  assert.equal(result.importedSourceType, "imported");
});

let release;
let deployment;
test("Pages-Release wird aus dem Deployment-Satz atomar assembliert", async () => {
  await rm(TEMP_ROOT, { recursive: true, force: true });
  release = await assemblePagesRelease(DEPLOYMENT_FILE, {
    repositoryRoot: REPOSITORY_ROOT,
    outputDirectory: RELEASE_ROOT,
  });
  deployment = release.deployment;
  assert.equal(release.outputDirectory, RELEASE_ROOT);
});

for (const [name, relative] of [
  ["Root-Index", "index.html"],
  ["globale 404", "404.html"],
  ["No-Jekyll-Markierung", ".nojekyll"],
  ["Release-Manifest", "release-manifest.json"],
  ["Root-Buildmanifest", "build-manifest.json"],
  ["Root-Runtimeprofil", "runtime/deployment-profile.json"],
  ["Author-Index", "author/index.html"],
  ["Author-Buildmanifest", "author/build-manifest.json"],
  ["Author-Runtimeprofil", "author/runtime/deployment-profile.json"],
  ["Learner-Kurskatalog", "data/courses/index.json"],
  ["Learner-Kurs Alltag", "data/courses/english-everyday.json"],
  ["Learner-Kurs Aufbau", "data/courses/english-advanced.json"],
  ["Learner-Kurs Latein", "data/courses/latin-foundations.json"],
]) {
  test(`Release enthält ${name}`, async () => assert.equal((await stat(path.join(RELEASE_ROOT, relative))).isFile(), true));
}

test("Learner enthält keine Autorenmodule und Author enthält Course Builder", async () => {
  await assert.rejects(() => stat(path.join(RELEASE_ROOT, "views/course-builder-view.js")));
  await assert.rejects(() => stat(path.join(RELEASE_ROOT, "import/course-exporter.js")));
  await assert.rejects(() => stat(path.join(RELEASE_ROOT, "prompts/prompt-generator.js")));
  await assert.rejects(() => stat(path.join(RELEASE_ROOT, "prompts/vocabulary/import-v1.txt")));
  assert.equal((await stat(path.join(RELEASE_ROOT, "author/views/course-builder-view.js"))).isFile(), true);
  assert.equal((await stat(path.join(RELEASE_ROOT, "author/import/course-exporter.js"))).isFile(), true);
  assert.equal((await stat(path.join(RELEASE_ROOT, "author/prompts/prompt-generator.js"))).isFile(), true);
  assert.equal((await stat(path.join(RELEASE_ROOT, "author/prompts/vocabulary/import-v1.txt"))).isFile(), true);
  for (const catalogModule of [
    "runtime/published-course-catalog.js",
    "views/published-course-library-view.js",
  ]) {
    assert.equal((await stat(path.join(RELEASE_ROOT, catalogModule))).isFile(), true);
    await assert.rejects(() => stat(path.join(RELEASE_ROOT, "author", catalogModule)));
  }
  const learnerHtml = await readFile(path.join(RELEASE_ROOT, "index.html"), "utf8");
  const authorHtml = await readFile(path.join(RELEASE_ROOT, "author/index.html"), "utf8");
  const authorBuilder = await readFile(path.join(RELEASE_ROOT, "author/views/course-builder-view.js"), "utf8");
  assert.doesNotMatch(learnerHtml, /Book Capture|Buchseite importieren|Didaktisch durchdacht\. Klar gestaltet\./);
  assert.doesNotMatch(authorBuilder, /Book Capture|Buchseite importieren/);
  assert.match(authorBuilder, /CSV-Vorlage herunterladen/);
  assert.match(authorBuilder, /Import-Prompt kopieren/);
  assert.doesNotMatch(authorHtml, /Didaktisch durchdacht\. Klar gestaltet\./);
  for (const html of [learnerHtml, authorHtml]) {
    assert.match(html, /class="brand__family">EduTools/);
    assert.match(html, /edutools-signature__initials">MJ/);
  }
});

test("Release-Dateigrenzen schließen Tests, Fixtures, Beispiele und Exporte aus", async () => {
  const validation = await validatePagesRelease(RELEASE_ROOT, deployment);
  assert.equal(validation.files.some((file) => /(^|\/)(?:tests?|fixtures?|examples?|exports?|downloads?)(\/|$)/i.test(file)), false);
  assert.equal(validation.files.some((file) => /(^|\/)(?:ocr|speech|speak)(\/|$)|author\/image-import|heic|heif|tesseract|libheif|speech-recognition|recognition-adapter/i.test(file)), false);
});

test("Release-Manifest besitzt sortierte Profile und Dateien", async () => {
  const manifest = await json(path.join(RELEASE_ROOT, "release-manifest.json"));
  assert.deepEqual(manifest.profiles.map((item) => item.mountPath), ["", "author"]);
  assert.deepEqual(manifest.files.map((item) => item.path), [...manifest.files.map((item) => item.path)].sort());
  assert.match(manifest.releaseHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.profiles[0].courseIds, [
    "neutral-language-course",
    "neutral-english-advanced-course",
    "course-1d831a5b-7075-4784-bba3-94c922777e8b",
  ]);
});

test("Release-Manifestgrößen und SHA-256 stimmen", async () => {
  const manifest = await json(path.join(RELEASE_ROOT, "release-manifest.json"));
  for (const entry of manifest.files) {
    const content = await readFile(path.join(RELEASE_ROOT, entry.path));
    assert.equal(content.byteLength, entry.bytes, entry.path);
    assert.equal(createHash("sha256").update(content).digest("hex"), entry.sha256, entry.path);
  }
});

test("Profil-Build-Hashes stimmen in Manifest, Runtime und Buildinformation überein", async () => {
  for (const mount of ["", "author"]) {
    const base = path.join(RELEASE_ROOT, mount);
    const manifest = await json(path.join(base, "build-manifest.json"));
    const runtime = await json(path.join(base, "runtime/deployment-profile.json"));
    const buildInfo = await json(path.join(base, "runtime/build-info.json"));
    assert.equal(manifest.buildHash, runtime.buildHash);
    assert.equal(manifest.buildHash, buildInfo.buildHash);
  }
});

test("Profilmetadaten, CSP und Referrer-Policy sind gesetzt", async () => {
  for (const mount of ["", "author"]) {
    const html = await readFile(path.join(RELEASE_ROOT, mount, "index.html"), "utf8");
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /default-src 'self'/);
    assert.match(html, /script-src 'self'/);
    assert.match(html, /style-src 'self'/);
    assert.match(html, /media-src 'self'/);
    assert.match(html, /img-src 'self'/);
    assert.match(html, /object-src 'none'/);
    assert.doesNotMatch(html, /'unsafe-eval'|default-src \*/);
    assert.doesNotMatch(html, /wasm-unsafe-eval|media-src[^;]*blob:|img-src[^;]*data:|img-src[^;]*blob:/);
    assert.match(html, /worker-src 'none'/);
    assert.match(html, /name="referrer" content="no-referrer"/);
    assert.doesNotMatch(html, /rel="canonical"/);
  }
});

test("404 ist zugänglich, besitzt Landmarke und keine Weiterleitungsschleife", async () => {
  const html = await readFile(path.join(RELEASE_ROOT, "404.html"), "utf8");
  assert.match(html, /<html lang="de" data-edutools-theme="vocabulary">/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /Seite nicht gefunden/);
  assert.match(html, /href="\.\/index\.html#\/dashboard"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
});

test("statischer Server liefert MIME-Typen, echte 404 und keine Directory Listings", async () => {
  const result = await runReleaseSmokeTests(RELEASE_ROOT, deployment);
  assert.equal(result.checks.length, 15);
  assert.equal(result.checks.find((check) => check.pathname === "/does-not-exist").status, 404);
});

test("fehlgeschlagene Assembly erhält das letzte gültige Release", async () => {
  const target = path.join(TEMP_ROOT, "atomic-target");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "sentinel.txt"), "letztes-gueltiges-release");
  await assert.rejects(() => assemblePagesRelease(DEPLOYMENT_FILE, {
    repositoryRoot: REPOSITORY_ROOT,
    outputDirectory: target,
    beforeReplace() { throw new Error("simulierter Freigabefehler"); },
  }), /simulierter Freigabefehler/);
  assert.equal(await readFile(path.join(target, "sentinel.txt"), "utf8"), "letztes-gueltiges-release");
});

test("GitHub-Workflow ist SHA-gepinnt, minimal berechtigt und deployt keine Pull Requests", async () => {
  const workflow = await readFile(WORKFLOW_FILE, "utf8");
  for (const action of ["actions/checkout", "actions/setup-node", "actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"]) {
    assert.match(workflow, new RegExp(`${action.replace("/", "\\/")}@[a-f0-9]{40}`));
  }
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment:\n      name: github-pages/);
  assert.match(workflow, /group: pages\n  cancel-in-progress: false/);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /path: dist\/pages/);
  assert.doesNotMatch(workflow, /secrets\./);
});

let passed = 0;
try {
  for (const { name, callback } of tests) {
    await callback();
    passed += 1;
    console.log(`✓ ${name}`);
  }
  console.log(`\n${passed}/${tests.length} Release- und Produktionsfreigabetests bestanden.`);
} finally {
  await rm(TEMP_ROOT, { recursive: true, force: true });
}
