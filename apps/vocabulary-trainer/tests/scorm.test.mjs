import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createStoredZip, crc32, inspectStoredZip, validateZipEntryPath } from "../build/zip-store.js";
import { createScorm12Manifest, inspectScorm12Manifest, scormIdentifiers } from "../build/scorm-manifest.js";
import { validateScormProfile } from "../build/scorm-profile-validator.js";
import { buildScormPackage, findUnexpectedScormOutputDuplicates } from "../build/scorm-package.js";
import { validateScormZip } from "../build/scorm-package-validator.js";
import { prepareScormHarness } from "../build/scorm-harness.js";
import { prepareMoodleScormHarness, startMoodleScormHarness } from "../build/moodle-scorm-harness.js";
import { validateScormPackageEntries } from "../src/scorm-export/scorm-package-validation.js";
import { createScorm12ApiAdapter, findScorm12Api, waitForScorm12Api } from "../src/delivery/scorm12-api-adapter.js";
import { createScorm12Session } from "../src/delivery/scorm12-session.js";
import {
  notifyLearningSessionCompleted,
  subscribeLearningSessionCompleted,
} from "../src/delivery/learning-session-events.js";
import { configureStorageNamespace, createCourseStorageKey } from "../src/core/storage.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_ROOT, "../../..");
const PROFILE_FILE = path.join(ROOT, "apps/vocabulary-trainer/scorm/examples/private-scorm-profile.example.json");
const OUTPUT_FILE = path.join(ROOT, "dist/private-scorm/neutral-classroom-package.scorm.zip");
const WORKFLOW_FILE = path.join(ROOT, ".github/workflows/deploy-vocabulary-trainer-pages.yml");
const tests = [];
const test = (name, callback) => tests.push({ name, callback });
const clone = (value) => JSON.parse(JSON.stringify(value));
const encoder = new TextEncoder();
const rawProfile = JSON.parse(await readFile(PROFILE_FILE, "utf8"));

async function expectProfileError(mutate, field) {
  const value = clone(rawProfile);
  mutate(value);
  await assert.rejects(() => validateScormProfile(value, { repositoryRoot: ROOT, profilePath: PROFILE_FILE }), new RegExp(field));
}

test("gültiges SCORM-1.2-Profil referenziert genau ein Learner-Profil", async () => {
  const result = await validateScormProfile(rawProfile, { repositoryRoot: ROOT, profilePath: PROFILE_FILE });
  assert.equal(result.profile.scorm.version, "1.2");
  assert.equal(result.learner.profile.mode, "learner");
  assert.equal(result.learner.course.id, "neutral-language-course");
});

for (const [name, mutate, field] of [
  ["fehlende Schema-Version", (value) => { delete value.schemaVersion; }, "schemaVersion"],
  ["falsche Schema-Version", (value) => { value.schemaVersion = 2; }, "schemaVersion"],
  ["fehlende Paket-ID", (value) => { value.packageId = ""; }, "packageId"],
  ["ungültige Paket-ID", (value) => { value.packageId = "Klasse 7 A"; }, "packageId"],
  ["falsche Distribution", (value) => { value.distribution = "public"; }, "distribution"],
  ["SCORM 2004", (value) => { value.scorm.version = "2004"; }, "scorm.version"],
  ["fehlender Titel", (value) => { value.scorm.title = ""; }, "scorm.title"],
  ["unbekannte Abschlussregel", (value) => { value.scorm.completionPolicy = "score"; }, "completionPolicy"],
  ["fehlendes Learner-Profil", (value) => { value.learnerProfile = "apps/vocabulary-trainer/private/missing.json"; }, "learnerProfile"],
  ["Author-Profil", (value) => { value.learnerProfile = "apps/vocabulary-trainer/profiles/author.example.json"; }, "learnerProfile"],
  ["Output außerhalb Privatbereich", (value) => { value.output.file = "dist/other/course.scorm.zip"; }, "output.file"],
  ["Output unter Pages", (value) => { value.output.file = "dist/pages/course.scorm.zip"; }, "output.file"],
  ["absoluter Output", (value) => { value.output.file = "/tmp/course.scorm.zip"; }, "output.file"],
  ["Traversal im Output", (value) => { value.output.file = "dist/private-scorm/../pages/course.scorm.zip"; }, "output.file"],
  ["unbekanntes Sicherheitsfeld", (value) => { value.scorm.apiUrl = "https://example.invalid"; }, "apiUrl"],
]) test(`SCORM-Profil: ${name}`, () => expectProfileError(mutate, field));

test("SCORM-Manifest enthält genau eine SCO-Ressource und sortierte Dateien", () => {
  const source = createScorm12Manifest({
    packageId: "klasse-7a",
    title: "Wörter & Wendungen <A>",
    organizationTitle: "Englisch 7a",
    files: ["runtime/profile.json", "index.html", "data/course.json"],
  });
  const result = inspectScorm12Manifest(source);
  assert.equal(result.hasXmlDeclaration, true);
  assert.equal(result.organizationCount, 1);
  assert.equal(result.itemCount, 1);
  assert.equal(result.resourceCount, 1);
  assert.equal(result.startFile, "index.html");
  assert.equal(result.scormType, "sco");
  assert.equal(result.defaultOrganization, result.organizationIdentifier);
  assert.equal(result.itemIdentifierRef, result.resourceIdentifier);
  assert.deepEqual(result.files, ["data/course.json", "index.html", "runtime/profile.json"]);
  assert.match(source, /Wörter &amp; Wendungen &lt;A&gt;/);
  assert.match(source, /<schemaversion>1\.2<\/schemaversion>/);
});

function validationFixture({ index = "<!doctype html><script type=\"module\" src=\"app.js\"></script>", app = "export const ready = true;" } = {}) {
  const files = ["app.js", "imsmanifest.xml", "index.html"];
  const manifest = createScorm12Manifest({
    packageId: "moodle-launch-test",
    title: "Moodle & ByCS",
    organizationTitle: "EduTools",
    files,
  });
  return [
    { path: "app.js", data: encoder.encode(app) },
    { path: "imsmanifest.xml", data: encoder.encode(manifest) },
    { path: "index.html", data: encoder.encode(index) },
  ];
}

test("strenger Paketvalidator akzeptiert ausschließlich den physischen Manifeststart", () => {
  const result = validateScormPackageEntries(validationFixture());
  assert.equal(result.manifest.startFile, "index.html");
  assert.equal(result.paths.includes("index.html"), true);
});

for (const [name, href, pattern] of [
  ["führender Slash", "/index.html", /paketrelativ|Startressource/u],
  ["Hash-Route", "index.html#/dashboard", /Query noch Hash/u],
  ["Query", "index.html?attempt=1", /Query noch Hash/u],
  ["absolute URL", "https://example.invalid/index.html", /paketrelativ/u],
  ["generische Moodle-ID", "index.html?id=123", /LMS-|Query/u],
]) {
  test(`Paketvalidator blockiert Manifest-href mit ${name}`, () => {
    const entries = validationFixture();
    const manifest = new TextDecoder().decode(entries[1].data).replace(
      'adlcp:scormtype="sco" href="index.html"',
      `adlcp:scormtype="sco" href="${href}"`,
    );
    entries[1].data = encoder.encode(manifest);
    assert.throws(() => validateScormPackageEntries(entries), pattern);
  });
}

test("Paketvalidator blockiert inkonsistente Organization- und Resource-Verweise", () => {
  const organizationEntries = validationFixture();
  organizationEntries[1].data = encoder.encode(
    new TextDecoder().decode(organizationEntries[1].data).replace(/<organizations default="[^"]+"/u, '<organizations default="ORG-FALSCH"'),
  );
  assert.throws(() => validateScormPackageEntries(organizationEntries), /Standard-Organization/u);
  const resourceEntries = validationFixture();
  resourceEntries[1].data = encoder.encode(
    new TextDecoder().decode(resourceEntries[1].data).replace(/identifierref="[^"]+"/u, 'identifierref="RES-FALSCH"'),
  );
  assert.throws(() => validateScormPackageEntries(resourceEntries), /identifierref/u);
});

test("Paketvalidator blockiert Root-Assets, id-Queries und LMS-Fensternavigation", () => {
  assert.throws(
    () => validateScormPackageEntries(validationFixture({ index: '<script type="module" src="/app.js"></script>' })),
    /paketrelativ/u,
  );
  assert.throws(
    () => validateScormPackageEntries(validationFixture({ index: '<script type="module" src="app.js?id=123"></script>' })),
    /LMS-/u,
  );
  assert.throws(
    () => validateScormPackageEntries(validationFixture({ app: 'window.top.location = "elsewhere";' })),
    /LMS-Fenster/u,
  );
});

test("Manifest-Identifier sind stabil und vom Titel unabhängig", () => {
  assert.deepEqual(scormIdentifiers("klasse-7a"), scormIdentifiers("klasse-7a"));
  assert.match(scormIdentifiers("klasse-7a").manifest, /^MANIFEST-/);
});

test("CRC32 entspricht dem bekannten Prüfvektor", () => assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926));

test("STORE-ZIP besitzt Central Directory, UTF-8 und Root-Dateien", () => {
  const zip = createStoredZip([
    { path: "übersicht.txt", data: "Grüße" },
    { path: "imsmanifest.xml", data: "<manifest/>" },
    { path: "index.html", data: "<!doctype html>" },
  ]);
  const inspected = inspectStoredZip(zip);
  assert.deepEqual(inspected.entries.map((entry) => entry.path), ["imsmanifest.xml", "index.html", "übersicht.txt"]);
  assert.equal(inspected.entries.find((entry) => entry.path === "übersicht.txt").data.toString(), "Grüße");
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("PK\u0005\u0006", "binary")), true);
});

test("gleiche ZIP-Eingaben sind byte-identisch", () => {
  const entries = [{ path: "index.html", data: "A" }, { path: "imsmanifest.xml", data: "B" }];
  assert.deepEqual(createStoredZip(entries), createStoredZip([...entries].reverse()));
});

for (const value of ["../secret", "/absolute", "folder\\file", "a/../b", "C:/file"]) {
  test(`ZIP-Pfad wird abgelehnt: ${value}`, () => assert.throws(() => validateZipEntryPath(value)));
}

function mockApi(options = {}) {
  const calls = [];
  const values = { "cmi.core.lesson_status": options.status ?? "not attempted" };
  let lastError = "0";
  const result = (name) => {
    const ok = options.fail !== name;
    lastError = ok ? "0" : "101";
    return String(ok);
  };
  return {
    calls,
    values,
    LMSInitialize(...args) { calls.push(["LMSInitialize", ...args]); return result("initialize"); },
    LMSGetValue(...args) { calls.push(["LMSGetValue", ...args]); return values[args[0]] ?? ""; },
    LMSSetValue(...args) { calls.push(["LMSSetValue", ...args]); if (result("set") === "true") values[args[0]] = args[1]; return result("set"); },
    LMSCommit(...args) { calls.push(["LMSCommit", ...args]); return result("commit"); },
    LMSFinish(...args) { calls.push(["LMSFinish", ...args]); return result("finish"); },
    LMSGetLastError() { return lastError; },
    LMSGetErrorString(code) { return `Error ${code}`; },
    LMSGetDiagnostic(code) { return `Diagnostic ${code}`; },
  };
}

test("API-Suche findet aktuelles Fenster, Parent, höheren Parent und Opener", () => {
  const api = {};
  const top = { API: api }; top.parent = top;
  const parent = { parent: top };
  const child = { parent };
  assert.equal(findScorm12Api({ API: api }), api);
  assert.equal(findScorm12Api(child), api);
  assert.equal(findScorm12Api({ parent: null, opener: top }), api);
});

test("API-Suche stoppt an maximaler Tiefe und fängt Cross-Origin-Zugriff ab", () => {
  const api = {};
  const top = { API: api }; top.parent = top;
  const middle = { parent: top };
  assert.equal(findScorm12Api({ parent: middle }, { maxDepth: 0 }), null);
  const blocked = {};
  Object.defineProperty(blocked, "API", { get() { throw new Error("cross-origin"); } });
  Object.defineProperty(blocked, "parent", { get() { throw new Error("cross-origin"); } });
  assert.equal(findScorm12Api(blocked), null);
});

test("Moodle-artige id- und scoid-Parameter bleiben bei verschachtelter API-Suche unverändert", () => {
  const api = {};
  const outer = { API: api, location: { href: "https://example.invalid/mod/scorm/player.php?id=123&scoid=456&attempt=1" } };
  outer.parent = outer;
  const player = { parent: outer, location: { href: "https://example.invalid/mod/scorm/player.php?id=123&scoid=456" } };
  const sco = { parent: player, location: { href: "https://example.invalid/pluginfile.php/11/mod_scorm/content/1/index.html" } };
  const before = [outer.location.href, player.location.href, sco.location.href];
  assert.equal(findScorm12Api(sco), api);
  assert.deepEqual([outer.location.href, player.location.href, sco.location.href], before);
});

test("API-Suche wartet begrenzt auf eine verzögert bereitgestellte Moodle-API", async () => {
  const api = {};
  const outer = {}; outer.parent = outer;
  const sco = { parent: outer };
  let waits = 0;
  const found = await waitForScorm12Api(sco, {
    retries: 2,
    delayMs: 0,
    async wait() {
      waits += 1;
      if (waits === 1) outer.API = api;
    },
  });
  assert.equal(found, api);
  assert.equal(waits, 1);
});

test("Adapter initialisiert und beendet höchstens einmal", () => {
  const api = mockApi();
  const adapter = createScorm12ApiAdapter(api, { logger: { error() {} } });
  assert.equal(adapter.initialize(), true);
  assert.equal(adapter.initialize(), true);
  assert.equal(adapter.finish(), true);
  assert.equal(adapter.finish(), true);
  assert.equal(api.calls.filter(([name]) => name === "LMSInitialize").length, 1);
  assert.equal(api.calls.filter(([name]) => name === "LMSFinish").length, 1);
});

test("Adapter behandelt SCORM-String false als Fehler", () => {
  const api = mockApi({ fail: "commit" });
  const adapter = createScorm12ApiAdapter(api, { logger: { error() {} } });
  adapter.initialize();
  assert.equal(adapter.commit(), false);
});

test("fehlgeschlagene Initialisierung und Finish werden nicht wiederholt", () => {
  const initializeApi = mockApi({ fail: "initialize" });
  const initializeAdapter = createScorm12ApiAdapter(initializeApi, { logger: { error() {} } });
  assert.equal(initializeAdapter.initialize(), false);
  assert.equal(initializeAdapter.initialize(), false);
  assert.equal(initializeApi.calls.filter(([name]) => name === "LMSInitialize").length, 1);

  const finishApi = mockApi({ fail: "finish" });
  const finishAdapter = createScorm12ApiAdapter(finishApi, { logger: { error() {} } });
  finishAdapter.initialize();
  assert.equal(finishAdapter.finish(), false);
  assert.equal(finishAdapter.finish(), false);
  assert.equal(finishApi.calls.filter(([name]) => name === "LMSFinish").length, 1);
});

test("none schreibt keinen Bearbeitungsstatus", () => {
  const api = mockApi();
  const adapter = createScorm12ApiAdapter(api, { logger: { error() {} } });
  const session = createScorm12Session({ adapter, completionPolicy: "none" });
  session.initialize();
  assert.equal(session.completeLearningSession(), false);
  assert.equal(api.calls.some(([name]) => name === "LMSSetValue"), false);
});

test("first-completed-session setzt incomplete und erst nach Session completed", () => {
  const api = mockApi();
  const session = createScorm12Session({
    adapter: createScorm12ApiAdapter(api, { logger: { error() {} } }),
    completionPolicy: "first-completed-session",
  });
  assert.equal(session.initialize().status, "incomplete");
  assert.equal(api.values["cmi.core.lesson_status"], "incomplete");
  assert.equal(session.completeLearningSession(), true);
  assert.equal(api.values["cmi.core.lesson_status"], "completed");
  assert.equal(session.completeLearningSession(), false);
});

for (const status of ["completed", "passed", "failed"]) {
  test(`${status} wird nicht herabgestuft oder überschrieben`, () => {
    const api = mockApi({ status });
    const session = createScorm12Session({
      adapter: createScorm12ApiAdapter(api, { logger: { error() {} } }),
      completionPolicy: "first-completed-session",
    });
    session.initialize();
    assert.equal(session.completeLearningSession(), false);
    assert.equal(api.values["cmi.core.lesson_status"], status);
  });
}

test("Suspend setzt nur exit, committet und finished", () => {
  const api = mockApi({ status: "incomplete" });
  const session = createScorm12Session({
    adapter: createScorm12ApiAdapter(api, { logger: { error() {} } }),
    completionPolicy: "first-completed-session",
  });
  session.initialize();
  session.suspendAndFinish();
  session.suspendAndFinish();
  assert.equal(api.values["cmi.core.exit"], "suspend");
  assert.equal(api.calls.filter(([name]) => name === "LMSFinish").length, 1);
});

test("allgemeines Sessionereignis enthält keine fachlichen Ergebnisse", () => {
  let received;
  const unsubscribe = subscribeLearningSessionCompleted((event) => { received = event; });
  notifyLearningSessionCompleted({ mode: "quiz", sessionId: "s-1", wordIds: ["secret"] });
  unsubscribe();
  assert.deepEqual(received, { type: "learning-session-completed", mode: "quiz", sessionId: "s-1" });
});

let firstHash;
test("neutrales SCORM-Paket wird vollständig gebaut und validiert", async () => {
  await rm(OUTPUT_FILE, { force: true });
  const result = await buildScormPackage(PROFILE_FILE, { repositoryRoot: ROOT });
  assert.equal(result.outputFile, OUTPUT_FILE);
  assert.equal((await stat(result.outputFile)).isFile(), true);
  const inspected = await validateScormZip(result.outputFile);
  assert.equal(inspected.manifest.courseId, "neutral-language-course");
  assert.equal(inspected.entries[0].path.startsWith("neutral-classroom-package/"), false);
  assert.equal(inspected.entries.some((entry) => entry.path === "imsmanifest.xml"), true);
  assert.equal(inspected.entries.some((entry) => /course-builder|course-library-view|import\/|ocr\/|author\/image-import\/|heic|heif|tesseract|libheif/i.test(entry.path)), false);
  assert.equal(inspected.entries.some((entry) => /(^|\/)(?:speech|speak)(\/|$)|speech-view|speech-recognition|recognition-adapter/i.test(entry.path)), false);
  const html = inspected.entries.find((entry) => entry.path === "index.html")?.data.toString("utf8") ?? "";
  assert.match(html, /class="brand__family">EduTools/);
  assert.match(html, /edutools-signature__initials">MJ/);
  assert.doesNotMatch(html, /data-route-view="\/speak"|Sprechübung|SpeechRecognition|Mikrofon/);
  assert.doesNotMatch(html, /Book Capture|Buchseite importieren|Didaktisch durchdacht\. Klar gestaltet\./);
  const learningCore = inspected.entries.find((entry) => entry.path === "core/learning-state.js")?.data.toString("utf8") ?? "";
  assert.match(learningCore, /LEARNING_STATE_SCHEMA_VERSION = 2/u);
  assert.match(learningCore, /activeCorrectCount|correctDays|recentResults/u);
  firstHash = createHash("sha256").update(await readFile(result.outputFile)).digest("hex");
});

test("zweiter Paketbuild ist byte-identisch", async () => {
  await buildScormPackage(PROFILE_FILE, { repositoryRoot: ROOT });
  const secondHash = createHash("sha256").update(await readFile(OUTPUT_FILE)).digest("hex");
  assert.equal(secondHash, firstHash);
  const outputEntries = await readdir(path.dirname(OUTPUT_FILE));
  assert.deepEqual(
    outputEntries.filter((name) => name.startsWith("neutral-classroom-package") && name.endsWith(".zip")),
    [path.basename(OUTPUT_FILE)],
  );
  assert.equal(outputEntries.some((name) => /\.candidate$|\.backup$|\.tmp-|\.backup-/.test(name)), false);
  await assert.rejects(() => stat(path.join(ROOT, `dist/.tmp-scorm-${process.pid}`)));
});

test("unerwartete nummerierte ZIP-Dublette stoppt den Build und bleibt unangetastet", async () => {
  const before = await readFile(OUTPUT_FILE);
  const duplicate = path.join(path.dirname(OUTPUT_FILE), "neutral-classroom-package.scorm 2.zip");
  await writeFile(duplicate, before);
  try {
    assert.deepEqual(await findUnexpectedScormOutputDuplicates(OUTPUT_FILE), [path.basename(duplicate)]);
    await assert.rejects(
      () => buildScormPackage(PROFILE_FILE, { repositoryRoot: ROOT }),
      /Unerwartete SCORM-ZIP-Dublette.*neutral-classroom-package\.scorm 2\.zip/,
    );
    assert.deepEqual(await readFile(OUTPUT_FILE), before);
    assert.deepEqual(await readFile(duplicate), before);
  } finally {
    await rm(duplicate, { force: true });
  }
});

test("fehlgeschlagener Austausch erhält eine vorhandene gültige ZIP", async () => {
  const before = await readFile(OUTPUT_FILE);
  await assert.rejects(() => buildScormPackage(PROFILE_FILE, {
    repositoryRoot: ROOT,
    beforeReplace() { throw new Error("simulierter Fehler"); },
  }));
  assert.deepEqual(await readFile(OUTPUT_FILE), before);
  await assert.rejects(() => stat(path.join(ROOT, `dist/.tmp-scorm-${process.pid}`)));
});

test("Harness extrahiert sicher, besitzt Parent-API-Mock und räumt auf", async () => {
  const harness = await prepareScormHarness(OUTPUT_FILE);
  try {
    assert.equal(harness.startFile, "index.html");
    assert.equal((await stat(path.join(harness.packageRoot, "imsmanifest.xml"))).isFile(), true);
    const html = await readFile(path.join(harness.root, "index.html"), "utf8");
    assert.match(html, /src="\.\/package\/index\.html"/u);
    assert.doesNotMatch(html, /index\.html[#?]/u);
    const mock = await readFile(path.join(harness.root, "mock.js"), "utf8");
    assert.match(mock, /LMSInitialize/);
    assert.match(mock, /LMSGetDiagnostic/);
    assert.match(mock, /api.*missing/);
  } finally { await harness.cleanup(); }
  await assert.rejects(() => stat(harness.root));
});

test("Moodle-Harness startet Manifestdatei unter Pluginfile-Pfad und äußeren LMS-Parametern", async () => {
  const prepared = await prepareMoodleScormHarness(OUTPUT_FILE);
  try {
    assert.equal(prepared.startFile, "index.html");
    const outer = await readFile(path.join(prepared.root, "index.html"), "utf8");
    const player = await readFile(path.join(prepared.playerRoot, "index.html"), "utf8");
    assert.match(outer, /id=123&amp;scoid=456&amp;attempt=1&amp;display=popup/u);
    assert.match(player, /pluginfile\.php\/11\/mod_scorm\/content\/1\/index\.html/u);
    assert.doesNotMatch(player, /index\.html[#?]/u);
    assert.equal((await stat(path.join(prepared.contentRoot, "data/course.json"))).isFile(), true);
  } finally { await prepared.cleanup(); }

  const running = await startMoodleScormHarness(OUTPUT_FILE, { port: 0 });
  try {
    assert.match(running.launchUrl, /index\.html\?id=123&scoid=456&attempt=1&display=popup$/u);
    for (const url of [
      running.launchUrl,
      `${running.address.url}/mod/scorm/player/index.html?id=123&scoid=456&attempt=1`,
      `${running.address.url}/pluginfile.php/11/mod_scorm/content/1/index.html`,
      `${running.address.url}/pluginfile.php/11/mod_scorm/content/1/app.js`,
      `${running.address.url}/pluginfile.php/11/mod_scorm/content/1/data/course.json`,
    ]) {
      const response = await fetch(url);
      assert.equal(response.status, 200, url);
    }
  } finally { await running.close(); }
});

test("Storage hängt nicht von Paketname, Titel oder ZIP-Datei ab", () => {
  configureStorageNamespace("neutral-classroom-2026-27");
  const first = createCourseStorageKey("neutral-language-course", "learning-state");
  configureStorageNamespace("neutral-classroom-2026-27");
  const second = createCourseStorageKey("neutral-language-course", "learning-state");
  assert.equal(first, second);
  configureStorageNamespace("other-classroom-2026-27");
  assert.notEqual(createCourseStorageKey("neutral-language-course", "learning-state"), first);
});

test("Adapter enthält keine verbotenen SCORM-Datenmodelle", async () => {
  const source = await readFile(path.join(ROOT, "apps/vocabulary-trainer/src/delivery/scorm12-api-adapter.js"), "utf8");
  for (const forbidden of ["student_id", "student_name", "cmi.interactions", "cmi.core.score", "suspend_data", "API_1484_11"]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("Pages-Workflow verarbeitet und lädt keine privaten SCORM-Pfade hoch", async () => {
  const workflow = await readFile(WORKFLOW_FILE, "utf8");
  assert.match(workflow, /path:\s*dist\/pages/);
  assert.doesNotMatch(workflow, /dist\/private-scorm/);
  assert.doesNotMatch(workflow, /apps\/vocabulary-trainer\/private/);
  assert.doesNotMatch(workflow, /build-scorm|private-scorm-profile/);
});

test("öffentliche Syntax- und JSON-Gates überspringen private Arbeitsordner", async () => {
  for (const file of ["check-syntax.mjs", "validate-json.mjs"]) {
    const source = await readFile(path.join(ROOT, "apps/vocabulary-trainer/scripts", file), "utf8");
    assert.match(source, /"private"/);
  }
});

test("private Pfade und Pakete sind Git-ignoriert", async () => {
  const gitignore = await readFile(path.join(ROOT, ".gitignore"), "utf8");
  for (const pattern of ["apps/vocabulary-trainer/private/", "dist/private-scorm/", "*.private-course.json", "*.private-scorm.json", "*.scorm.zip"]) {
    assert.equal(gitignore.includes(pattern), true);
  }
});

let passed = 0;
for (const { name, callback } of tests) {
  try { await callback(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); console.error(error); }
}
console.log(`\n${passed}/${tests.length} SCORM-1.2-Tests bestanden.`);
if (passed !== tests.length) process.exitCode = 1;
