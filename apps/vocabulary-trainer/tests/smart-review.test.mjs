import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createBuildFilePlan } from "../build/build-file-plan.js";
import { createOcrPageMappings } from "../src/ocr/ocr-column-mapping.js";
import { createOcrPreviewRows } from "../src/ocr/ocr-preview-state.js";
import { structureOcrPage } from "../src/ocr/ocr-structure.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_ROOT, "..");
const REPOSITORY_ROOT = path.resolve(APP_ROOT, "../..");
const fixture = JSON.parse(await readFile(path.join(TEST_ROOT, "fixtures/ocr/complex-three-column.json"), "utf8"));
const tests = [];
const test = (name, callback) => tests.push({ name, callback });

function fixturePage() {
  const starts = [40, 380, 780];
  const ends = [300, 690, 1150];
  const blocks = [];
  fixture.lines.forEach((line) => line.cells.forEach((text, column) => {
    if (!text) return;
    blocks.push({
      text,
      confidence: line.confidence ?? 94,
      bbox: { x0: starts[column], y0: line.y, x1: ends[column], y1: line.y + (line.height ?? 18) },
    });
  }));
  return { ...fixture.page, blocks };
}

function parseFixture(options = {}) {
  const structured = structureOcrPage(fixturePage(), options);
  const mappings = createOcrPageMappings([structured]);
  const preview = createOcrPreviewRows([structured], mappings);
  return { structured, preview };
}

function ratio(values) { return values.filter(Boolean).length / values.length; }

test("komplexe Fixture erkennt zwei relative Spaltengrenzen", () => {
  const { structured } = parseFixture();
  assert.equal(structured.boundaries.length, 2);
  assert.ok(structured.boundaries[0] > 300 && structured.boundaries[0] < 380);
  assert.ok(structured.boundaries[1] > 690 && structured.boundaries[1] < 780);
});

test("Source-Anker erzeugen genau die 20 erwarteten Vokabeleinträge", () => {
  const { structured } = parseFixture();
  assert.equal(structured.rows.length, fixture.expected.length);
  assert.equal(structured.diagnostics.sourceCells, fixture.expected.length);
  assert.equal(structured.diagnostics.vocabularyEntries, fixture.expected.length);
});

test("Überschriften, Infoboxen und Seitenmarker werden nicht zu Fake-Vokabeln", () => {
  const { structured } = parseFixture();
  assert.deepEqual(structured.sections.map((entry) => entry.text), ["Unit 4 – Around town", "Skills training"]);
  assert.equal(structured.rows.some((row) => /Skills training|Unit 4|^12$/u.test(row.columns.join(" "))), false);
  assert.equal(structured.ignored.some((entry) => entry.reason === "page-marker"), true);
});

test("mehrzeilige Targets und Informationsblöcke bleiben an ihrer Source-Zeile", () => {
  const { structured } = parseFixture();
  const lookAfter = structured.rows.find((row) => row.columns[0].startsWith("(to) look after"));
  assert.equal(lookAfter.columns[1], "sich um jemanden oder etwas kümmern");
  const quiet = structured.rows.find((row) => row.columns[0].startsWith("quiet"));
  assert.match(quiet.columns[2], /The adjective can describe/);
  assert.equal(structured.rows.some((row) => row.columns[0] === "Tip"), false);
});

test("getrennte Source-Wortteile werden nur an einer sichtbaren Trennstelle verbunden", () => {
  const page = structureOcrPage({
    pageId: "source-wrap", width: 900, height: 300,
    blocks: [
      { text: "house-", confidence: 93, bbox: { x0: 30, y0: 40, x1: 150, y1: 58 } },
      { text: "Hausboot", confidence: 93, bbox: { x0: 380, y0: 40, x1: 500, y1: 58 } },
      { text: "boat", confidence: 93, bbox: { x0: 30, y0: 64, x1: 100, y1: 82 } },
    ],
  }, { boundaries: [0.35] });
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].columns[0], "houseboat");
  assert.equal(page.rows[0].columns[1], "Hausboot");
});

test("Einzelbuchstaben, Satzzeichen und Randnummern werden nicht übernahmebereit", () => {
  const page = structureOcrPage({
    pageId: "noise", width: 900, height: 300,
    blocks: [
      { text: "cloudy", confidence: 93, bbox: { x0: 30, y0: 40, x1: 150, y1: 58 } },
      { text: "bewölkt", confidence: 93, bbox: { x0: 380, y0: 40, x1: 500, y1: 58 } },
      { text: "a", confidence: 93, bbox: { x0: 30, y0: 90, x1: 45, y1: 108 } },
      { text: "⚠", confidence: 93, bbox: { x0: 30, y0: 130, x1: 48, y1: 148 } },
      { text: "17", confidence: 93, bbox: { x0: 840, y0: 260, x1: 870, y1: 278 } },
    ],
  }, { boundaries: [0.35] });
  assert.equal(page.rows.length, 1);
  assert.equal(page.unassigned.some((entry) => entry.text === "a"), true);
  assert.equal(page.ignored.length, 2);
});

test("Source-, Target- und IPA-Erkennung erreichen auf der synthetischen Seite mindestens 90 Prozent", () => {
  const { structured, preview } = parseFixture();
  const sourceMatches = fixture.expected.map(([source], index) => preview[index]?.source === source);
  const targetMatches = fixture.expected.map(([, target], index) => structured.rows[index]?.columns[1] === target);
  const ipaMatches = fixture.expected.map(([, , ipa], index) => preview[index]?.phonetic === ipa);
  assert.ok(ratio(sourceMatches) >= 0.9, `Source ${ratio(sourceMatches)}`);
  assert.ok(ratio(targetMatches) >= 0.9, `Target ${ratio(targetMatches)}`);
  assert.ok(ratio(ipaMatches) >= 0.9, `IPA ${ratio(ipaMatches)}`);
});

test("kein übernahmebereiter Eintrag besitzt leere oder einbuchstabige Fachfelder", () => {
  const { preview } = parseFixture();
  const ready = preview.filter((row) => row.included);
  assert.equal(ready.length, fixture.expected.length);
  assert.equal(ready.some((row) => !row.source || /^\p{L}$/u.test(row.source)), false);
  assert.equal(ready.some((row) => row.targets.some((target) => /^\p{L}$/u.test(target))), false);
});

test("höchstens 20 Prozent der synthetischen Einträge benötigen Review", () => {
  const { preview } = parseFixture();
  const reviewRatio = preview.filter((row) => row.errors.length || row.warnings.length).length / preview.length;
  assert.ok(reviewRatio <= 0.2, `Review-Anteil ${reviewRatio}`);
});

test("manuelle relative Spaltengrenzen strukturieren vorhandene OCR-Daten ohne neue Erkennung", () => {
  const automatic = parseFixture();
  const manual = parseFixture({ boundaries: [0.29, 0.61] });
  assert.equal(manual.structured.rows.length, automatic.structured.rows.length);
  assert.deepEqual(manual.structured.boundaries, [348, 732]);
});

test("Zeilenausschnitte enthalten die volle Tabellenbreite und vertikalen Kontext", () => {
  const { structured } = parseFixture();
  const row = structured.rows[0];
  assert.ok(row.bbox.x0 < row.contentBbox.x0);
  assert.ok(row.bbox.x1 > row.contentBbox.x1);
  assert.ok(row.bbox.y0 < row.contentBbox.y0);
  assert.ok(row.bbox.y1 > row.contentBbox.y1);
});

test("Smart Review bleibt als deaktivierte Author-Quelle erhalten und fehlt in Produktbuilds", async () => {
  const author = await createBuildFilePlan({ repositoryRoot: REPOSITORY_ROOT, profile: { mode: "author", features: {} } });
  const learner = await createBuildFilePlan({ repositoryRoot: REPOSITORY_ROOT, profile: { mode: "learner", features: { motivation: true, pronunciation: true, speedChallenge: true } } });
  const source = await readFile(path.join(APP_ROOT, "src/ocr/ocr-structure.js"), "utf8");
  assert.equal(source.length > 0, true);
  assert.equal(author.some((entry) => entry.destination.startsWith("ocr/") || entry.destination.startsWith("author/image-import/")), false);
  assert.equal(learner.some((entry) => entry.destination.startsWith("ocr/") || entry.destination === "styles/authoring.css"), false);
  assert.equal(author.some((entry) => entry.destination.includes("tests/fixtures")), false);
});

test("Review-View gruppiert kompakte Warnungen und getrennte Metadaten", async () => {
  const [view, styles] = await Promise.all([
    readFile(path.join(APP_ROOT, "src/ocr/ocr-import-view.js"), "utf8"),
    readFile(path.join(APP_ROOT, "src/styles/authoring.css"), "utf8"),
  ]);
  assert.match(view, /Zu prüfen/);
  assert.match(view, /Erkannte Vokabeln/);
  assert.match(view, /Erkannte Abschnitte/);
  assert.match(view, /Nicht zugeordnet/);
  assert.match(view, /Seite erneut strukturieren/);
  assert.match(view, /ocr-review-issues/);
  assert.match(styles, /\.ocr-review-issues/);
});

let passed = 0;
for (const { name, callback } of tests) {
  await callback(); passed += 1; console.log(`✓ ${name}`);
}
console.log(`\n${passed}/${tests.length} Smart-Review-Tests bestanden.`);
