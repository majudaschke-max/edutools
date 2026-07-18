import assert from "node:assert/strict";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  assertInstalledOcrModels,
  getOcrLanguageDefinitions,
  resolveCourseOcrModels,
  resolveOcrModel,
} from "../src/ocr/ocr-language-registry.js";
import {
  createLocalOcrAdapter,
  getLocalOcrAssetPaths,
  normalizeOcrProgress,
  normalizeTesseractResult,
} from "../src/ocr/ocr-adapter.js";
import {
  calculateWorkingSize,
  classifyOcrImageFile,
  createImageWorkspace,
  normalizeCrop,
  normalizeRotation,
  rotatedDimensions,
  validateOcrImageFile,
} from "../src/ocr/image-preprocessor.js";
import {
  groupOcrWordsIntoLines,
  inferOcrColumnBoundaries,
  structureOcrPage,
  structureOcrResults,
  classifyOcrRightText,
} from "../src/ocr/ocr-structure.js";
import {
  applyMappingToAllPages,
  createOcrPageMappings,
  suggestOcrColumnMapping,
  validateOcrColumnMapping,
} from "../src/ocr/ocr-column-mapping.js";
import {
  annotateOcrDuplicates,
  addTagsToSelectedOcrRows,
  applyOcrRowReassignment,
  createOcrPreviewRows,
  createOcrPreviewState,
  deleteOcrPreviewRow,
  deleteSelectedOcrRows,
  duplicateOcrPreviewRow,
  getOcrRowStatus,
  getVisibleOcrPreviewRows,
  mergeOcrPreviewRows,
  moveOcrPreviewRow,
  normalizeOcrDraftText,
  extractOcrSourceAndPhonetic,
  resetOcrPreview,
  selectOcrPreviewRow,
  setOcrPreviewFilter,
  setSelectedOcrRowsIncluded,
  splitOcrPreviewRow,
  splitOcrTargets,
  updateOcrPreviewRow,
  undoOcrRowReassignment,
} from "../src/ocr/ocr-preview-state.js";
import { commitOcrImport } from "../src/ocr/ocr-import-transaction.js";
import { createCourse, createUnit, createWord } from "../src/course-library/course-schema.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_ROOT, "..");
const tests = [];
const test = (name, callback) => tests.push({ name, callback });

function word(text, x0, y0, x1, y1, confidence = 92) {
  return { text, confidence, bbox: { x0, y0, x1, y1 } };
}

function structuredPage(pageId = "page-1") {
  return {
    pageId,
    width: 700,
    height: 500,
    boundaries: [260],
    headingSuggestion: "",
    rows: [
      { id: `${pageId}-line-1`, pageId, pageNumber: 1, lineNumber: 1, columns: ["cloudy", "bewölkt / wolkig"], confidence: 94, bbox: { x0: 10, y0: 20, x1: 560, y1: 42 }, warnings: [], suggestedInclude: true },
      { id: `${pageId}-line-2`, pageId, pageNumber: 1, lineNumber: 2, columns: ["promise", "Versprechen"], confidence: 57, bbox: { x0: 10, y0: 55, x1: 560, y1: 78 }, warnings: ["low-confidence"], suggestedInclude: true },
    ],
  };
}

function ownCourse() {
  const course = createCourse({
    id: "course-own",
    title: "Eigener Kurs",
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
  }, { now: "2026-07-15T10:00:00.000Z" });
  const unit = createUnit({ id: "unit-one", title: "Unit 1", order: 1, current: true, released: true });
  unit.words.push(createWord({ id: "word-cloudy", source: "cloudy", targets: ["bewölkt"] }));
  course.units.push(unit);
  return course;
}

function previewRows() {
  return createOcrPreviewRows([structuredPage()], { "page-1": ["source", "target"] });
}

test("Sprachregistry trennt abgeleitete von lokal installierten OCR-Modellen", () => {
  assert.deepEqual(getOcrLanguageDefinitions().map(({ model }) => model), ["eng", "deu", "fra", "lat"]);
  assert.equal(resolveOcrModel("en-GB"), "eng");
  assert.equal(resolveOcrModel("de_DE"), "deu");
  assert.equal(resolveOcrModel("fr"), "fra");
  assert.equal(resolveOcrModel("la"), "lat");
  assert.equal(resolveOcrModel("es"), "spa");
  assert.deepEqual(resolveCourseOcrModels(ownCourse()).suggested, ["eng", "deu"]);
  assert.throws(() => assertInstalledOcrModels(["spa"]), /nicht installiert/);
});

test("lokale OCR-Assetpfade bleiben in derselben Auslieferung", () => {
  const paths = getLocalOcrAssetPaths();
  Object.values(paths).forEach((value) => {
    assert.match(value, /\/ocr\/vendor\/tesseract\//);
    assert.doesNotMatch(value, /cdn|unpkg|jsdelivr/i);
  });
});

test("OCR-Fortschritt wird über mehrere Seiten monoton eingeordnet", () => {
  assert.deepEqual(normalizeOcrProgress({ status: "recognizing", progress: 0.5 }, 1, 4), {
    status: "recognizing", engineProgress: 0.5, progress: 0.375, page: 2, pages: 4,
  });
  assert.equal(normalizeOcrProgress({ progress: 4 }, 0, 1).progress, 1);
  assert.equal(normalizeOcrProgress({}, 0, 1).progress, null);
});

test("Tesseract-Ergebnisse werden auf engineunabhängige Wörter, Boxen und Konfidenzen abgebildet", () => {
  const normalized = normalizeTesseractResult({ data: {
    text: "cloudy bewölkt",
    confidence: 91,
    blocks: [{ paragraphs: [{ lines: [{ words: [{ text: "cloudy", confidence: 93, bbox: { x0: 1, y0: 2, x1: 30, y1: 12 }, symbols: [] }] }] }] }],
  } }, { id: "page-a", width: 640, height: 480 });
  assert.equal(normalized.pageId, "page-a");
  assert.equal(normalized.blocks[0].text, "cloudy");
  assert.deepEqual(normalized.blocks[0].bbox, { x0: 1, y0: 2, x1: 30, y1: 12 });
  assert.equal("paragraphs" in normalized.blocks[0], false);
  const tsvOnly = normalizeTesseractResult({ data: {
    text: "cloudy",
    tsv: "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t4\t5\t30\t12\t91.5\tcloudy",
  } }, { id: "page-tsv", width: 100, height: 40 });
  assert.deepEqual(tsvOnly.blocks[0], {
    text: "cloudy", confidence: 91.5, bbox: { x0: 4, y0: 5, x1: 34, y1: 17 }, symbols: [],
  });
});

test("OCR-Adapter lädt genau einen lokalen Worker, arbeitet sequentiell und räumt auf", async () => {
  let createCalls = 0;
  let active = 0;
  let maximumActive = 0;
  let terminateCalls = 0;
  let workerOptions;
  const recognized = [];
  const adapter = createLocalOcrAdapter({
    engineLoader: async () => ({ default: {
      OEM: { LSTM_ONLY: 1 },
      async createWorker(models, oem, options) {
        createCalls += 1;
        assert.deepEqual(models, ["eng", "deu"]);
        assert.equal(oem, 1);
        workerOptions = options;
        return {
          async recognize(image) {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            recognized.push(image);
            options.logger({ status: "recognizing text", progress: 0.5 });
            await Promise.resolve();
            active -= 1;
            return { data: { text: String(image), confidence: 90, words: [word(String(image), 0, 0, 20, 10)] } };
          },
          async terminate() { terminateCalls += 1; },
        };
      },
    } }),
  });
  const progress = [];
  const result = await adapter.recognizePages([
    { id: "p1", image: "one", width: 100, height: 100 },
    { id: "p2", image: "two", width: 100, height: 100 },
  ], { models: ["eng", "deu"], onProgress: (value) => progress.push(value) });
  assert.equal(createCalls, 1);
  assert.equal(maximumActive, 1);
  assert.deepEqual(recognized, ["one", "two"]);
  assert.deepEqual(result.map((page) => page.text), ["one", "two"]);
  assert.equal(terminateCalls, 1);
  assert.equal(adapter.isRunning(), false);
  assert.equal(workerOptions.workerBlobURL, false);
  assert.equal(workerOptions.cacheMethod, "none");
  assert.equal(progress.some((item) => item.page === 2), true);
});

test("OCR-Abbruch terminiert den Worker und liefert einen verständlichen AbortError", async () => {
  let rejectRecognition;
  let terminated = false;
  const adapter = createLocalOcrAdapter({
    engineLoader: async () => ({
      OEM: { LSTM_ONLY: 1 },
      async createWorker() {
        return {
          recognize() { return new Promise((resolve, reject) => { rejectRecognition = reject; }); },
          async terminate() { terminated = true; rejectRecognition?.(new DOMException("stopped", "AbortError")); },
        };
      },
    }),
  });
  const controller = new AbortController();
  const running = adapter.recognizePages([{ id: "p1", image: {}, width: 100, height: 100 }], { models: ["eng"], signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(running, (error) => error.name === "AbortError" && /abgebrochen/.test(error.message));
  assert.equal(terminated, true);
  assert.equal(adapter.isRunning(), false);
});

test("Bildvalidierung akzeptiert JPEG/PNG/WebP und kennzeichnet HEIC zur lokalen Konvertierung", () => {
  for (const [name, type] of [["a.jpg", "image/jpeg"], ["a.png", "image/png"], ["a.webp", "image/webp"]]) {
    assert.equal(classifyOcrImageFile({ name, type }).supported, true);
    assert.equal(validateOcrImageFile({ name, type, size: 1024 }).requiresConversion, false);
  }
  const heic = validateOcrImageFile({ name: "a.heic", type: "image/heic", size: 1024 });
  assert.equal(heic.requiresConversion, true);
  assert.equal(heic.requiresNativeDecode, false);
  assert.throws(() => validateOcrImageFile({ name: "a.pdf", type: "application/pdf", size: 1024 }), /JPEG/);
  assert.throws(() => validateOcrImageFile({ name: "a.png", type: "image/png", size: 0 }), /leer/);
  assert.throws(() => validateOcrImageFile({ name: "a.png", type: "image/png", size: 21 * 1024 * 1024 }), /20 MB/);
});

test("Drehung, Crop und Skalierung erzeugen ausschließlich begrenzte Arbeitswerte", () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.throws(() => normalizeRotation(45), /90-Grad/);
  assert.deepEqual(rotatedDimensions(1200, 800, 90), { width: 800, height: 1200 });
  assert.deepEqual(calculateWorkingSize(4800, 2400), { width: 2400, height: 1200, scale: 0.5 });
  assert.deepEqual(normalizeCrop({ top: 5, right: 6, bottom: 7, left: 8 }), { top: 5, right: 6, bottom: 7, left: 8 });
  assert.throws(() => normalizeCrop({ left: 50, right: 50 }), /größer als null/);
});

test("Bildarbeitsbereich verwaltet mehrere Seiten, Reihenfolge, Drehung und lokale Freigabe", async () => {
  const revoked = [];
  const closed = [];
  let nextId = 0;
  const workspace = createImageWorkspace({
    document: { createElement: () => ({}) },
    decodeImage: async (file) => ({ width: file.width, height: file.height, close() { closed.push(file.name); } }),
    urlApi: {
      createObjectURL: (file) => `blob:${file.name}`,
      revokeObjectURL: (url) => revoked.push(url),
    },
    idGenerator: () => ++nextId,
  });
  const files = ["one.png", "two.png", "three.png"].map((name) => ({ name, type: "image/png", size: 1024, width: 800, height: 600 }));
  const result = await workspace.addFiles(files);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(workspace.getPages().map((page) => page.name), files.map((file) => file.name));
  workspace.move("ocr-page-3", "up");
  assert.deepEqual(workspace.getPages().map((page) => page.name), ["one.png", "three.png", "two.png"]);
  assert.equal(workspace.rotate("ocr-page-1", 90).rotation, 90);
  assert.equal(workspace.releasePage("ocr-page-2"), true);
  assert.deepEqual(revoked, ["blob:two.png"]);
  workspace.releaseAll();
  assert.deepEqual(new Set(revoked), new Set(["blob:one.png", "blob:two.png", "blob:three.png"]));
  assert.deepEqual(new Set(closed), new Set(files.map((file) => file.name)));
});

test("Bounding-Box-Wörter werden ohne feste Sprache zu Zeilen gruppiert", () => {
  const lines = groupOcrWordsIntoLines([
    word("bewölkt", 320, 40, 390, 58), word("cloudy", 20, 40, 90, 58),
    word("Versprechen", 320, 78, 430, 98), word("promise", 20, 79, 100, 97),
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].words.map((item) => item.text), ["cloudy", "bewölkt"]);
});

test("Spaltengrenzen werden relativ aus wiederkehrenden Lücken erkannt", () => {
  const lines = groupOcrWordsIntoLines([
    word("cloudy", 20, 40, 90, 58), word("bewölkt", 330, 40, 400, 58),
    word("promise", 20, 80, 100, 98), word("Versprechen", 330, 80, 440, 98),
    word("whisper", 20, 120, 95, 138), word("flüstern", 330, 120, 410, 138),
    word("borrow", 20, 160, 90, 178), word("ausleihen", 330, 160, 420, 178),
  ]);
  const boundaries = inferOcrColumnBoundaries(lines, 700);
  assert.equal(boundaries.length, 1);
  assert.ok(boundaries[0] > 90 && boundaries[0] < 330);
});

test("Strukturerkennung markiert Überschrift, niedrige Konfidenz und dekorative Zeile", () => {
  const page = structureOcrPage({
    pageId: "p", width: 700, height: 500,
    blocks: [
      word("Vocabulary", 20, 10, 130, 28),
      word("cloudy", 20, 60, 90, 78), word("bewölkt", 330, 60, 400, 78),
      word("promise", 20, 100, 100, 118, 45), word("Versprechen", 330, 100, 440, 118, 45),
      word("whisper", 20, 140, 95, 158), word("flüstern", 330, 140, 410, 158),
      word("borrow", 20, 180, 90, 198), word("ausleihen", 330, 180, 420, 198),
      word("—", 20, 230, 30, 248),
    ],
  });
  assert.equal(page.boundaries.length, 1);
  assert.equal(page.headingSuggestion, "Vocabulary");
  assert.equal(page.rows.length, 4);
  assert.equal(page.sections[0].text, "Vocabulary");
  assert.equal(page.rows.some((row) => row.warnings.includes("low-confidence")), true);
  assert.equal(page.ignored.some((entry) => entry.reason === "decoration-or-margin"), true);
  assert.equal(structureOcrResults([page]).length, 1);
});

test("IPA wird aus Source extrahiert, während grammatische Zusätze erhalten bleiben", () => {
  assert.deepEqual(extractOcrSourceAndPhonetic("(to) appear [əˈpɪə]"), {
    source: "(to) appear", phonetic: "[əˈpɪə]",
  });
});

test("rechte Spalten werden ohne Verlagssonderregeln klassifiziert", () => {
  assert.equal(classifyOcrRightText("Example: A rainbow appeared."), "example");
  assert.equal(classifyOcrRightText("Hint: Think about the weather"), "hint");
  assert.equal(classifyOcrRightText("Opposite: noisy"), "word-relation");
  assert.equal(classifyOcrRightText("12"), "ignore");
  assert.equal(classifyOcrRightText("short label"), "unclear");
});

test("kontrollierte Spaltenneuzuordnung ist reversibel", () => {
  const rows = createOcrPreviewRows([{
    pageId: "shifted", boundaries: [200, 500], rows: [{
      id: "shifted-row", pageId: "shifted", pageNumber: 1, lineNumber: 1,
      columns: ["a", "(to) appear [əˈpɪə]", "erscheinen"], bbox: { x0: 0, y0: 0, x1: 700, y1: 30 },
      confidence: 90, warnings: [], suggestedInclude: true,
    }],
  }], { shifted: ["source", "target", "ignore"] });
  assert.equal(Boolean(rows[0].reassignment), true);
  const state = createOcrPreviewState(rows);
  const applied = applyOcrRowReassignment(state, "shifted-row");
  assert.equal(applied.rows[0].source, "(to) appear");
  assert.deepEqual(applied.rows[0].targets, ["erscheinen"]);
  assert.equal(applied.rows[0].included, true);
  const undone = undoOcrRowReassignment(applied, "shifted-row");
  assert.equal(undone.rows[0].source, "a");
});

test("Mapping schlägt Source/Target vor und verlangt genau ein Source", () => {
  assert.deepEqual(suggestOcrColumnMapping(4), ["source", "target", "ignore", "ignore"]);
  assert.equal(validateOcrColumnMapping(["source", "target"], 2).valid, true);
  assert.equal(validateOcrColumnMapping(["source", "source"], 2).valid, false);
  const pages = [structuredPage("a"), { ...structuredPage("b"), boundaries: [200, 400] }];
  const mappings = createOcrPageMappings(pages);
  assert.deepEqual(mappings.a, ["source", "target"]);
  assert.deepEqual(applyMappingToAllPages(mappings, "a", pages).b, ["source", "target", "ignore"]);
});

test("OCR-Textnormalisierung wahrt Inhalt und Targets werden kontrolliert getrennt", () => {
  assert.equal(normalizeOcrDraftText("  l’école\t  est\r\n ouverte  "), "l'école est\nouverte");
  assert.deepEqual(splitOcrTargets("Burg; Schloss / Kastell").targets, ["Burg", "Schloss", "Kastell"]);
  assert.deepEqual(splitOcrTargets("jour, journée"), { targets: ["jour, journée"], ambiguous: true });
  assert.equal(splitOcrTargets("Ärger").targets[0], "Ärger");
});

test("Vorschau übernimmt nur gemappte Kursfelder und kennzeichnet problematische Zeilen", () => {
  const rows = previewRows();
  assert.deepEqual(rows[0].targets, ["bewölkt", "wolkig"]);
  assert.equal(rows[0].included, true);
  assert.equal(rows[1].warnings.includes("low-confidence"), true);
  assert.equal(getOcrRowStatus(rows[1]), "Prüfen");
  assert.equal("image" in rows[0], false);
});

test("Vorschau erkennt Duplikate in Ziel-Unit und im übrigen Kurs", () => {
  const course = ownCourse();
  const second = createUnit({ id: "unit-two", title: "Unit 2", order: 2, released: false });
  second.words.push(createWord({ id: "word-promise", source: "promise", targets: ["Versprechen"] }));
  course.units.push(second);
  const rows = annotateOcrDuplicates(previewRows(), course, "unit-one");
  assert.equal(rows[0].duplicate.scope, "unit");
  assert.equal(rows[0].duplicate.sameTargets, false);
  assert.equal(rows[1].duplicate.scope, "course");
});

test("Vorschauzeilen bleiben vollständig editier-, filter-, lösch- und zurücksetzbar", () => {
  let state = createOcrPreviewState(previewRows());
  state = updateOcrPreviewRow(state, state.rows[0].id, "source", "cloudy day");
  state = updateOcrPreviewRow(state, state.rows[0].id, "targets", "bewölkter Tag; wolkiger Tag");
  state = updateOcrPreviewRow(state, state.rows[0].id, "tags", "weather|unit-4");
  assert.equal(state.rows[0].source, "cloudy day");
  assert.deepEqual(state.rows[0].targets, ["bewölkter Tag", "wolkiger Tag"]);
  const duplicateId = "ocr-row-copy";
  state = duplicateOcrPreviewRow(state, state.rows[0].id, () => "copy");
  assert.equal(state.rows[1].id, duplicateId);
  state = moveOcrPreviewRow(state, duplicateId, "down");
  assert.equal(state.rows.at(-1).id, duplicateId);
  state = deleteOcrPreviewRow(state, duplicateId);
  state = setOcrPreviewFilter(state, "problems");
  assert.equal(getVisibleOcrPreviewRows(state).some((row) => row.id === duplicateId), false);
  assert.equal(resetOcrPreview(state).rows[0].source, "cloudy");
});

test("benachbarte Vorschauzeilen können verbunden und bewusst geteilt werden", () => {
  const rows = previewRows().map((row) => ({ ...row, confidence: null }));
  let state = createOcrPreviewState(rows);
  state = selectOcrPreviewRow(state, rows[0].id, true);
  state = selectOcrPreviewRow(state, rows[1].id, true);
  state = mergeOcrPreviewRows(state, state.selectedIds, "source");
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].source, "cloudy promise");
  assert.equal(state.rows[0].confidence, null);
  state = splitOcrPreviewRow(state, state.rows[0].id, 6, () => "split");
  assert.equal(state.rows.length, 2);
  assert.equal(state.rows[1].included, false);
  assert.match(state.rows[1].errors[0], /Target/);
});

test("Mehrfachbearbeitung verändert ausschließlich ausgewählte Entwurfszeilen", () => {
  const rows = previewRows();
  let state = createOcrPreviewState(rows);
  state = selectOcrPreviewRow(state, rows[0].id, true);
  state = setSelectedOcrRowsIncluded(state, false);
  assert.equal(state.rows[0].included, false);
  assert.equal(state.rows[1].included, true);
  state = addTagsToSelectedOcrRows(state, "book|review");
  assert.deepEqual(state.rows[0].tags, ["book", "review"]);
  assert.deepEqual(state.rows[1].tags, []);
  state = setSelectedOcrRowsIncluded(state, true);
  assert.equal(state.rows[0].included, true);
  state = deleteSelectedOcrRows(state);
  assert.equal(state.rows[0].deleted, true);
  assert.equal(state.rows[1].deleted, false);
  assert.deepEqual(state.selectedIds, []);
  assert.throws(() => setSelectedOcrRowsIncluded(state, true), /mindestens eine Vokabel/);
});

test("kontrollierte OCR-Übernahme nutzt die bestehende Importtransaktion", () => {
  const course = ownCourse();
  const rows = previewRows().map((row) => ({ ...row, duplicate: null, duplicateStrategy: "add" }));
  let saved;
  const result = commitOcrImport({
    course,
    previewState: createOcrPreviewState(rows),
    targetUnitId: "unit-one",
    service: { updateCourse(next) { saved = next; return next; } },
    idGenerator: (() => { let id = 0; return () => `ocr-${++id}`; })(),
    now: "2026-07-15T10:30:00.000Z",
  });
  assert.equal(result.reviewed, 2);
  assert.equal(result.imported, 2);
  assert.equal(saved.units[0].words.length, 3);
  assert.deepEqual(saved.units[0].words.find((item) => item.source === "cloudy").targets, ["bewölkt"]);
  assert.equal(saved.units[0].words.filter((item) => item.source === "cloudy").length, 2);
  assert.equal(saved.units[0].words.some((item) => "bbox" in item || "confidence" in item), false);
});

test("kursweites Duplikat wird bei neuer Ziel-Unit wie ausgewählt übersprungen", () => {
  const course = ownCourse();
  const annotated = annotateOcrDuplicates(previewRows(), course, null).map((row) => ({
    ...row,
    duplicateStrategy: row.source === "cloudy" ? "skip" : "add",
  }));
  assert.equal(annotated[0].duplicate.scope, "course");
  let saved;
  const result = commitOcrImport({
    course,
    previewState: createOcrPreviewState(annotated),
    targetUnitId: "",
    newUnitTitle: "Book Capture QA",
    newUnitReleased: true,
    service: { updateCourse(next) { saved = next; return next; } },
    idGenerator: (() => { let id = 0; return () => `cross-unit-${++id}`; })(),
  });
  const unit = saved.units.find((item) => item.id === result.targetUnitId);
  assert.equal(result.reviewed, 2);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(unit.words.map((word) => word.source), ["promise"]);
  assert.equal(saved.units[0].words.find((word) => word.source === "cloudy").id, "word-cloudy");
});

test("Duplikat-Ergänzung erhält die vorhandene Wort-ID und berührt keinen Lernstand", () => {
  const course = ownCourse();
  const learningState = { courseId: course.id, words: { "word-cloudy": { wordId: "word-cloudy", correctCount: 3 } } };
  const beforeLearning = JSON.stringify(learningState);
  const row = {
    ...previewRows()[0],
    duplicate: { scope: "unit", wordId: "word-cloudy", unitId: "unit-one", sameTargets: false },
    duplicateStrategy: "merge",
  };
  let saved;
  commitOcrImport({
    course,
    previewState: createOcrPreviewState([row]),
    targetUnitId: "unit-one",
    service: { updateCourse(next) { saved = next; return next; } },
    idGenerator: () => "must-not-replace-existing-id",
  });
  const updated = saved.units[0].words.find((word) => word.source === "cloudy");
  assert.equal(updated.id, "word-cloudy");
  assert.deepEqual(updated.targets, ["bewölkt", "wolkig"]);
  assert.equal(JSON.stringify(learningState), beforeLearning);
});

test("neue OCR-Ziel-Unit ist standardmäßig nicht freigegeben", () => {
  const course = ownCourse();
  let saved;
  const result = commitOcrImport({
    course,
    previewState: createOcrPreviewState([previewRows()[1]]),
    targetUnitId: "",
    newUnitTitle: "Aus Foto geprüft",
    service: { updateCourse(next) { saved = next; return next; } },
    idGenerator: (() => { let id = 0; return () => `new-${++id}`; })(),
  });
  const unit = saved.units.find((item) => item.id === result.targetUnitId);
  assert.equal(unit.title, "Aus Foto geprüft");
  assert.equal(unit.released, false);
});

test("fehlgeschlagene Speicherung verändert den Ausgangskurs nicht", () => {
  const course = ownCourse();
  const before = JSON.stringify(course);
  assert.throws(() => commitOcrImport({
    course,
    previewState: createOcrPreviewState([previewRows()[1]]),
    targetUnitId: "unit-one",
    service: { updateCourse() { throw new Error("Speichern fehlgeschlagen"); } },
    idGenerator: () => "failure",
  }), /Speichern fehlgeschlagen/);
  assert.equal(JSON.stringify(course), before);
});

test("deaktivierte Book-Capture-Quelle bleibt prüfbar, wird aber nicht mehr produktiv verlinkt", async () => {
  const [source, runtime, builder] = await Promise.all([
    readFile(path.join(APP_ROOT, "src/ocr/ocr-import-view.js"), "utf8"),
    readFile(path.join(APP_ROOT, "src/ocr/ocr-import-runtime.js"), "utf8"),
    readFile(path.join(APP_ROOT, "src/views/course-builder-view.js"), "utf8"),
  ]);
  assert.match(source, /createElement\(documentRoot, "dialog"/);
  assert.match(source, /type: "file"/);
  assert.match(source, /multiple: ""/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif/);
  assert.match(source, /Unterstützt: iPhone-Fotos, JPEG, PNG und WebP/);
  assert.match(source, /HEIC-\/HEIF-Fotos werden ausschließlich lokal im Browser vorbereitet/);
  assert.match(source, /iPhone-Foto wird vorbereitet\./);
  assert.match(source, /Vorbereitung abbrechen/);
  assert.doesNotMatch(source, /HEIC\/HEIF funktioniert nur bei nativer Browserunterstützung/);
  assert.match(source, /createElement\(documentRoot, "fieldset"/);
  assert.match(source, /aria-live/);
  for (const label of ["1. Seiten hinzufügen", "2. Prüfen", "3. Übernehmen", "4. Fertig", "Nur zu prüfende Stellen", "Originalseiten"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /counts\.errors > 0/);
  assert.match(runtime, /await startAnalysis\(\)/);
  assert.match(runtime, /cancel-image-preparation/);
  assert.match(runtime, /imageAbortController\?\.abort\(\)/);
  assert.match(runtime, /handlePaste/);
  assert.match(runtime, /handleDrop/);
  assert.match(runtime, /reanalyze-page/);
  assert.doesNotMatch(builder, /Buchseite importieren|Book Capture/);
  assert.match(builder, /CSV-Vorlage herunterladen/);
  assert.match(builder, /Import-Prompt kopieren/);
  assert.match(source, /Kursdatei herunterladen/);
  assert.match(source, /Lädt den vollständigen Kurs als JSON-Datei herunter\./);
  assert.match(runtime, /onExportCourse\(model\.result\.course\)/);
  const visibleLiterals = [...source.matchAll(/(?:text|label):\s*"([^"]+)"/g)].map((match) => match[1]).join("\n");
  assert.doesNotMatch(visibleLiterals, /\b(?:OCR|Parser|Recognition|Engine|Worker|Bounding Box|Confidence|Token)\b/i);
});

test("Author-OCR-Quellen enthalten keine CDN- oder Cloud-Fallbacks", async () => {
  const files = [
    "src/ocr/ocr-adapter.js",
    "src/ocr/ocr-import-runtime.js",
    "src/ocr/vendor/tesseract/tesseract.esm.min.js",
    "src/ocr/vendor/tesseract/worker.min.js",
  ];
  for (const file of files) {
    const source = await readFile(path.join(APP_ROOT, file), "utf8");
    assert.doesNotMatch(source, /https?:\/\/|unpkg|jsdelivr|cdnjs/i, file);
  }
});

test("OCR-Modelle und Lizenznachweise sind reproduzierbar gebündelt", async () => {
  const manifest = JSON.parse(await readFile(path.join(APP_ROOT, "src/ocr/vendor/asset-manifest.json"), "utf8"));
  assert.equal(manifest.engine.version, "7.0.0");
  assert.equal(manifest.core.version, "7.0.0");
  assert.deepEqual(manifest.languageData.installed, ["deu", "eng", "fra", "lat"]);
  for (const model of manifest.languageData.installed) {
    assert.equal((await stat(path.join(APP_ROOT, `src/ocr/vendor/tesseract/lang/${model}.traineddata.gz`))).isFile(), true);
  }
  assert.equal((await stat(path.join(APP_ROOT, "pnpm-lock.yaml"))).isFile(), true);
  const packageJson = JSON.parse(await readFile(path.join(APP_ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies["tesseract.js"], "7.0.0");
  assert.equal(packageJson.devDependencies["tesseract.js-core"], "7.0.0");
});

test("neutrale Rasterfixtures sind klein, künstlich dokumentiert und bleiben test-only", async () => {
  const fixtureRoot = path.join(APP_ROOT, "tests/fixtures/ocr");
  const readme = await readFile(path.join(fixtureRoot, "README.md"), "utf8");
  assert.match(readme, /künstliche, selbst erzeugte Tabellen/);
  assert.doesNotMatch(readme, /Schulbuchseite|Verlag:/i);
  for (const name of ["neutral-en-de.png", "neutral-fr-la.jpg"]) {
    const info = await stat(path.join(fixtureRoot, name));
    assert.equal(info.isFile(), true);
    assert.ok(info.size > 1_000 && info.size < 200_000, name);
  }
});

let passed = 0;
for (const { name, callback } of tests) {
  await callback();
  passed += 1;
  console.log(`✓ ${name}`);
}
console.log(`\n${passed}/${tests.length} lokale OCR-Importtests bestanden.`);
