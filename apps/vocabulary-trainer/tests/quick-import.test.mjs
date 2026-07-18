import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createBuildFilePlan } from "../build/build-file-plan.js";
import { createOcrPageMappings } from "../src/ocr/ocr-column-mapping.js";
import { createOcrPreviewRows } from "../src/ocr/ocr-preview-state.js";
import {
  calculateQuickImportRegions,
  cleanQuickImportText,
  detectQuickImportBoundariesFromPixels,
  mergeQuickImportRegionResults,
  normalizeQuickImportBoundaries,
} from "../src/ocr/ocr-quick-import.js";
import { structureOcrPage } from "../src/ocr/ocr-structure.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_ROOT, "..");
const REPOSITORY_ROOT = path.resolve(APP_ROOT, "../..");
const fixture = JSON.parse(await readFile(path.join(TEST_ROOT, "fixtures/ocr/quick-import-three-column.json"), "utf8"));
const tests = [];
const test = (name, callback) => tests.push({ name, callback });

function regionResults(pageId = fixture.page.pageId, fileType = "image/png") {
  const source = [];
  const target = [];
  fixture.lines.forEach((line) => {
    if (line.cells[0]) source.push({ text: line.cells[0], confidence: 94, bbox: { x0: 30, y0: line.y, x1: 360, y1: line.y + (line.height ?? 18) } });
    if (line.cells[1]) target.push({ text: line.cells[1], confidence: 94, bbox: { x0: 22, y0: line.y, x1: 352, y1: line.y + (line.height ?? 18) } });
  });
  const common = { sourcePageId: pageId, fullPageWidth: 1200, fullPageHeight: 1450, fileType };
  return [
    { ...common, pageId: `${pageId}::quick-source`, regionRole: "source", regionOffsetX: 0, regionEndX: 408, width: 408, height: 1450, blocks: source },
    { ...common, pageId: `${pageId}::quick-target`, regionRole: "target", regionOffsetX: 408, regionEndX: 816, width: 408, height: 1450, blocks: target },
  ];
}

function parseFixture(fileType = "image/png") {
  const merged = mergeQuickImportRegionResults(regionResults(fixture.page.pageId, fileType))[0];
  const structured = structureOcrPage(merged, { mode: "quick", boundaries: [merged.quickBoundaries[0]], analysisLimit: merged.quickBoundaries[1] });
  const preview = createOcrPreviewRows([structured], createOcrPageMappings([structured]));
  return { merged, structured, preview };
}

test("zwei relative Grenzen bilden getrennte Source- und Target-Arbeitsbereiche", () => {
  assert.deepEqual(normalizeQuickImportBoundaries([34, 68]), [34, 68]);
  assert.deepEqual(calculateQuickImportRegions(1200, 1450, [34, 68]), [
    { role: "source", x0: 0, x1: 408, width: 408, height: 1450 },
    { role: "target", x0: 408, x1: 816, width: 408, height: 1450 },
  ]);
  assert.deepEqual(normalizeQuickImportBoundaries([80, 40]), [70, 82]);
  const pixels = new Uint8ClampedArray(300 * 100 * 4).fill(255);
  for (const x of [96, 207]) for (let y = 0; y < 100; y += 1) {
    const offset = (y * 300 + x) * 4;
    pixels[offset] = 30; pixels[offset + 1] = 30; pixels[offset + 2] = 30; pixels[offset + 3] = 255;
  }
  assert.deepEqual(detectQuickImportBoundariesFromPixels(pixels, 300, 100), [32, 69]);
  const twoColumnPixels = new Uint8ClampedArray(300 * 100 * 4).fill(255);
  for (const x of [150, 285]) for (let y = 0; y < 100; y += 1) {
    const offset = (y * 300 + x) * 4;
    twoColumnPixels[offset] = 30; twoColumnPixels[offset + 1] = 30; twoColumnPixels[offset + 2] = 30; twoColumnPixels[offset + 3] = 255;
  }
  assert.deepEqual(detectQuickImportBoundariesFromPixels(twoColumnPixels, 300, 100), [50, 92]);
});

test("Tabellenlinien, Boxreste und Seitenangaben werden zentral bereinigt", () => {
  assert.equal(cleanQuickImportText("|| advantage [ədˈvɑːntɪdʒ]", { field: "source" }), "advantage [ədˈvɑːntɪdʒ]");
  assert.equal(cleanQuickImportText("p.12 a film which has a true story", { field: "source" }), "a film which has a true story");
  assert.equal(cleanQuickImportText("(to) belong 9)", { field: "source" }), "(to) belong");
  assert.equal(cleanQuickImportText("| □ Vorteil ||", { field: "target" }), "Vorteil");
  assert.equal(cleanQuickImportText("---"), "");
});

test("bekannte doppelte OCR-Wortreste vor klarer IPA werden konservativ entfernt", () => {
  assert.equal(cleanQuickImportText("disadvantage i tage [ˌdɪsədˈvɑːntɪdʒ]", { field: "source" }), "disadvantage [ˌdɪsədˈvɑːntɪdʒ]");
  assert.equal(cleanQuickImportText("capital letter [ˌkæpɪtəl ˈletə]", { field: "source" }), "capital letter [ˌkæpɪtəl ˈletə]");
});

test("rechte Beispielsätze und Infokästen gelangen nicht in die zusammengeführte Seite", () => {
  const { merged } = parseFixture();
  const text = merged.blocks.map((word) => word.text).join(" ");
  assert.doesNotMatch(text, /Example:|Grammar note|Remember:|Tip:/u);
  assert.equal(merged.blocks.every((word) => ["source", "target"].includes(word.regionRole)), true);
  assert.equal(merged.quickBoundaries[1], 816);
});

test("Schnellimport erzeugt exakt 18 Source-verankerte Vokabeleinträge", () => {
  const { structured } = parseFixture();
  assert.equal(structured.rows.length, 18);
  assert.equal(structured.diagnostics.sourceCells, 18);
  assert.equal(structured.importMode, "quick");
});

test("Abschnittstitel, Seitenzahlen und Fortsetzungszeilen werden nicht zu Karten", () => {
  const { structured } = parseFixture();
  assert.deepEqual(structured.sections.map((entry) => entry.text), ["Introduction", "Word bank"]);
  assert.equal(structured.rows.some((row) => /Introduction|Word bank|S\. 12/u.test(row.text)), false);
  assert.equal(structured.rows.some((row) => row.columns[0] === ""), false);
  const headerPage = mergeQuickImportRegionResults([
    { ...regionResults("header-page")[0], blocks: [{ text: "Source", confidence: 95, bbox: { x0: 30, y0: 30, x1: 120, y1: 55 } }] },
    { ...regionResults("header-page")[1], blocks: [{ text: "Target", confidence: 95, bbox: { x0: 30, y0: 30, x1: 120, y1: 55 } }] },
  ])[0];
  const headerStructured = structureOcrPage(headerPage, { mode: "quick", boundaries: [408], analysisLimit: 816 });
  assert.equal(headerStructured.rows.length, 0);
  assert.equal(headerStructured.sections[0].text, "Source | Target");
});

test("mehrzeilige Targets bleiben an derselben Source-Zelle", () => {
  const { structured } = parseFixture();
  assert.equal(structured.rows.find((row) => row.columns[0].startsWith("(to) discuss")).columns[1], "über etwas diskutieren; etwas besprechen");
  assert.equal(structured.rows.find((row) => row.columns[0].startsWith("each other")).columns[1], "einander, sich (gegenseitig)");
});

test("mindestens 17 Sources und Targets sowie 16 IPA-Felder stimmen exakt", () => {
  const { structured, preview } = parseFixture();
  const sources = fixture.expected.filter(([source], index) => preview[index]?.source === source).length;
  const targets = fixture.expected.filter(([, target], index) => structured.rows[index]?.columns[1] === target).length;
  const phonetics = fixture.expected.filter(([, , phonetic], index) => preview[index]?.phonetic === phonetic).length;
  assert.ok(sources >= 17, `Sources: ${sources}`);
  assert.ok(targets >= 17, `Targets: ${targets}`);
  assert.ok(phonetics >= 16, `Lautschriften: ${phonetics}`);
});

test("bereit markierte Felder enthalten keine Linien, Seitenangaben oder rechte Inhalte", () => {
  const { preview } = parseFixture();
  const ready = preview.filter((row) => row.included);
  assert.equal(ready.length, 18);
  const fields = ready.flatMap((row) => [row.source, ...row.targets, row.phonetic]);
  assert.equal(fields.some((value) => /[|¦│┃‖]|\b(?:p|S)\.\s*\d+/iu.test(value)), false);
  assert.equal(ready.some((row) => row.hint || row.example), false);
});

test("Schnellimport erzeugt nur fachlich begründete Warnungen", () => {
  const { preview } = parseFixture();
  assert.equal(preview.filter((row) => row.errors.length || row.warnings.length).length <= 4, true);
  assert.equal(preview.some((row) => row.warnings.includes("unclear-right-column") || row.warnings.includes("grouped-info-block")), false);
});

test("Zeilenausschnitte enden vor der ignorierten rechten Spalte", () => {
  const { structured } = parseFixture();
  assert.equal(structured.rows.every((row) => row.bbox.x1 === 816), true);
  assert.equal(structured.rows.every((row) => row.contentBbox.x1 <= 760), true);
});

test("mehrere Seiten können dieselbe relative Spaltenaufteilung verwenden", () => {
  const results = [...regionResults("page-one"), ...regionResults("page-two")];
  const merged = mergeQuickImportRegionResults(results);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((page) => page.quickBoundaries), [[408, 816], [408, 816]]);
});

test("HEIC-, JPEG- und PNG-Arbeitskopien liefern nach Dekodierung dieselbe Struktur", () => {
  const signatures = ["image/heic", "image/jpeg", "image/png"].map((type) => {
    const { structured, preview } = parseFixture(type);
    return JSON.stringify(structured.rows.map((row, index) => [preview[index].source, row.columns[1], preview[index].phonetic]));
  });
  assert.equal(new Set(signatures).size, 1);
});

test("normale Review-UI enthält keine Zeichenpositions-Teilung oder Massenwerkzeuge", async () => {
  const view = await readFile(path.join(APP_ROOT, "src/ocr/ocr-import-view.js"), "utf8");
  for (const expected of ["Schnellimport: Ausgangsbegriffe und Übersetzungen", "Spalten anpassen", "Weitere Felder", "Bildausschnitt prüfen"]) assert.match(view, new RegExp(expected));
  for (const removed of ["Ausgangsbegriff nach Zeichenposition teilen", "Zeile teilen", "Ausgewählte verbinden", "Für Mehrfachbearbeitung auswählen"]) assert.doesNotMatch(view, new RegExp(removed));
});

test("Schnellimport und Spalteneditor bleiben deaktivierte Source-Module", async () => {
  const author = await createBuildFilePlan({ repositoryRoot: REPOSITORY_ROOT, profile: { mode: "author", features: {} } });
  const learner = await createBuildFilePlan({ repositoryRoot: REPOSITORY_ROOT, profile: { mode: "learner", features: { motivation: true, pronunciation: true, speedChallenge: true } } });
  assert.equal(author.some((entry) => entry.destination === "ocr/ocr-quick-import.js"), false);
  assert.equal(learner.some((entry) => entry.destination.startsWith("ocr/") || entry.destination === "styles/authoring.css"), false);
});

let passed = 0;
for (const { name, callback } of tests) {
  await callback(); passed += 1; console.log(`✓ ${name}`);
}
console.log(`\n${passed}/${tests.length} Schnellimport-Reliability-Tests bestanden.`);
