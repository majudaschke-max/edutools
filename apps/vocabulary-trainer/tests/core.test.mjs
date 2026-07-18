import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getCurrentUnitId,
  validateCourseConfig,
} from "../src/core/course.js";
import {
  assertMatchingCourseIds,
  getAvailableWords,
  getWordsByUnit,
  validateVocabularyData,
} from "../src/core/vocabulary.js";
import {
  createCourseStorageKey,
  loadJson,
} from "../src/core/storage.js";
import {
  createInitialLearningState,
  createInitialWordState,
  getWordState,
  isDifficult,
  isMastered,
  loadLearningState,
  markWordCorrect,
  markWordWrong,
  resetCourseLearningState,
  saveLearningState,
  toggleMarkedWord,
} from "../src/core/learning-state.js";
import {
  buildDailyLearningSet,
  calculateNextReviewAt,
  getDueWords,
  getNewWords,
  isDueForReview,
} from "../src/core/scheduler.js";
import { calculateDashboardMetrics } from "../src/app.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

const NOW = "2026-07-13T12:00:00.000Z";
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ids(words) {
  return words.map((word) => word.id);
}

const courseConfig = JSON.parse(
  await readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8"),
);
const vocabularyData = JSON.parse(
  await readFile(new URL("../src/data/vocabulary.json", import.meta.url), "utf8"),
);

test("gültige Kurskonfiguration", () => {
  assert.equal(validateCourseConfig(courseConfig), true);
  assert.equal(getCurrentUnitId(courseConfig), "neutral-unit-2");
});

test("Kurskonfiguration ohne courseId", () => {
  const invalidConfig = clone(courseConfig);
  delete invalidConfig.courseId;
  assert.throws(() => validateCourseConfig(invalidConfig), /courseId fehlt/);
});

test("nicht freigegebene aktuelle Unit", () => {
  const invalidConfig = { ...clone(courseConfig), currentUnit: "unit-9" };
  assert.throws(
    () => validateCourseConfig(invalidConfig),
    /currentUnit .* ist nicht freigegeben/,
  );
});

test("gültige Vokabeldaten", () => {
  assert.equal(validateVocabularyData(vocabularyData), true);
  assert.equal(getWordsByUnit(vocabularyData, "neutral-unit-2").length, 6);
});

test("doppelte Wort-ID", () => {
  const invalidData = clone(vocabularyData);
  invalidData.units[1].words[0].id = invalidData.units[0].words[0].id;
  assert.throws(() => validateVocabularyData(invalidData), /Wort-ID .* mehrfach/);
});

test("leere Übersetzung", () => {
  const invalidData = clone(vocabularyData);
  invalidData.units[0].words[0].targets = [""];
  assert.throws(() => validateVocabularyData(invalidData), /targets\[0\].*leer/);
});

test("nicht übereinstimmende courseId", () => {
  assert.throws(
    () => assertMatchingCourseIds(
      { ...courseConfig, courseId: "anderer-kurs" },
      vocabularyData,
    ),
    /gehören nicht zusammen/,
  );
});

test("nicht übereinstimmende contentVersion wird abgelehnt", () => {
  assert.throws(
    () => assertMatchingCourseIds(
      { ...courseConfig, contentVersion: courseConfig.contentVersion + 1 },
      vocabularyData,
    ),
    /unterschiedliche Inhaltsversionen/,
  );
});

test("nur freigegebene Units liefern Wörter", () => {
  const dataWithLockedUnit = clone(vocabularyData);
  dataWithLockedUnit.units.push({
    id: "unit-9",
    title: "Unit 9",
    order: 9,
    words: [{ id: "unit-9-word-001", source: "hidden", targets: ["verborgen"] }],
  });
  const availableWords = getAvailableWords(dataWithLockedUnit, courseConfig);
  assert.equal(availableWords.some((word) => word.unitId === "unit-9"), false);
});

test("initialer Wortzustand", () => {
  const state = createInitialWordState("word-001", NOW);
  assert.deepEqual(
    {
      correctCount: state.correctCount,
      wrongCount: state.wrongCount,
      streak: state.streak,
      level: state.level,
      marked: state.marked,
      lastSeenAt: state.lastSeenAt,
      nextReviewAt: state.nextReviewAt,
    },
    {
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      level: 0,
      marked: false,
      lastSeenAt: null,
      nextReviewAt: null,
    },
  );
});

test("Kann ich erhöht Zähler, Serie und Level", () => {
  const learningState = createInitialLearningState("course-correct", NOW);
  const wordState = markWordCorrect(learningState, "word-001", NOW);
  assert.equal(wordState.correctCount, 1);
  assert.equal(wordState.streak, 1);
  assert.equal(wordState.level, 1);
  assert.equal(wordState.nextReviewAt, "2026-07-14T12:00:00.000Z");
});

test("Noch nicht setzt Serie und Level zurück", () => {
  const learningState = createInitialLearningState("course-wrong", NOW);
  markWordCorrect(learningState, "word-001", NOW);
  const wordState = markWordWrong(learningState, "word-001", NOW);
  assert.equal(wordState.wrongCount, 1);
  assert.equal(wordState.streak, 0);
  assert.equal(wordState.level, 0);
  assert.equal(wordState.nextReviewAt, "2026-07-13T12:10:00.000Z");
});

test("Gemerkt lässt sich ein- und ausschalten", () => {
  const learningState = createInitialLearningState("course-marked", NOW);
  assert.equal(toggleMarkedWord(learningState, "word-001", NOW).marked, true);
  assert.equal(toggleMarkedWord(learningState, "word-001", NOW).marked, false);
});

test("schwieriges Wort", () => {
  const learningState = createInitialLearningState("course-difficult", NOW);
  const state = markWordWrong(learningState, "word-001", NOW);
  assert.equal(isDifficult(state), true);
  markWordWrong(learningState, "word-001", NOW);
  assert.equal(getWordState(learningState, "word-001").wrongCount, 2);
  assert.equal(isDifficult(getWordState(learningState, "word-001")), true);
});

test("sicher beherrschtes Wort", () => {
  const learningState = createInitialLearningState("course-mastered", NOW);
  markWordCorrect(learningState, "word-001", NOW);
  markWordCorrect(learningState, "word-001", NOW, { retrievalType: "active" });
  markWordCorrect(learningState, "word-001", "2026-07-14T12:00:00.000Z");
  assert.equal(isMastered(getWordState(learningState, "word-001")), true);
});

test("ein oder zwei richtige Bewertungen reichen nicht für sicher gelernt", () => {
  const learningState = createInitialLearningState("course-not-yet-mastered", NOW);
  const first = markWordCorrect(learningState, "word-001", NOW, { retrievalType: "active" });
  assert.equal(first.status, "learning");
  assert.equal(isMastered(first), false);
  const second = markWordCorrect(learningState, "word-001", "2026-07-14T12:00:00.000Z");
  assert.equal(second.status, "learning");
  assert.equal(isMastered(second), false);
});

test("drei richtige Bewertungen am selben lokalen Tag reichen nicht", () => {
  const learningState = createInitialLearningState("course-one-day", NOW);
  markWordCorrect(learningState, "word-001", NOW, { retrievalType: "active" });
  markWordCorrect(learningState, "word-001", "2026-07-13T13:00:00.000Z");
  const state = markWordCorrect(learningState, "word-001", "2026-07-13T14:00:00.000Z");
  assert.deepEqual(state.correctDays, ["2026-07-13"]);
  assert.equal(isMastered(state), false);
});

test("reines Wiedererkennen zählt nicht als aktiver Abruf", () => {
  const learningState = createInitialLearningState("course-recognition-only", NOW);
  markWordCorrect(learningState, "word-001", NOW);
  markWordCorrect(learningState, "word-001", "2026-07-14T12:00:00.000Z");
  const state = markWordCorrect(learningState, "word-001", "2026-07-14T13:00:00.000Z");
  assert.equal(state.activeCorrectCount, 0);
  assert.equal(isMastered(state), false);
});

test("Fehler nimmt sicheren Status zurück, ohne das Wort auf neu zu setzen", () => {
  const learningState = createInitialLearningState("course-remastery", NOW);
  markWordCorrect(learningState, "word-001", NOW, { retrievalType: "active" });
  markWordCorrect(learningState, "word-001", "2026-07-14T12:00:00.000Z");
  let state = markWordCorrect(learningState, "word-001", "2026-07-14T13:00:00.000Z");
  assert.equal(state.status, "mastered");

  state = markWordWrong(learningState, "word-001", "2026-07-15T12:00:00.000Z");
  assert.equal(state.status, "learning");
  assert.equal(state.correctCount, 3);
  assert.equal(isMastered(state), false);

  state = markWordCorrect(learningState, "word-001", "2026-07-15T13:00:00.000Z");
  assert.equal(state.status, "learning");
  state = markWordCorrect(learningState, "word-001", "2026-07-15T14:00:00.000Z");
  assert.equal(state.status, "mastered");
});

test("nur falsche Bewertungen lassen den fachlichen Status neu", () => {
  const learningState = createInitialLearningState("course-wrong-only", NOW);
  const state = markWordWrong(learningState, "word-001", NOW, {
    retrievalType: "self-assessment",
  });
  assert.equal(state.status, "new");
  assert.deepEqual(state.recentResults, ["wrong"]);
});

test("alle Scheduler-Intervalle", () => {
  const expected = [
    "2026-07-13T12:10:00.000Z",
    "2026-07-14T12:00:00.000Z",
    "2026-07-16T12:00:00.000Z",
    "2026-07-20T12:00:00.000Z",
    "2026-07-27T12:00:00.000Z",
    "2026-08-12T12:00:00.000Z",
  ];
  assert.deepEqual(
    expected.map((_, level) => calculateNextReviewAt(level, NOW)),
    expected,
  );
});

test("fälliges und nicht fälliges Wort", () => {
  assert.equal(
    isDueForReview({ nextReviewAt: "2026-07-13T11:59:00.000Z" }, NOW),
    true,
  );
  assert.equal(
    isDueForReview({ nextReviewAt: "2026-07-13T12:01:00.000Z" }, NOW),
    false,
  );
});

test("fällige Wörter werden nach Termin sortiert", () => {
  const words = [{ id: "later" }, { id: "earlier" }];
  const learningState = {
    words: {
      later: { nextReviewAt: "2026-07-13T11:00:00.000Z" },
      earlier: { nextReviewAt: "2026-07-13T10:00:00.000Z" },
    },
  };
  assert.deepEqual(ids(getDueWords(words, learningState, NOW)), ["earlier", "later"]);
});

test("Tagespaket priorisiert, dedupliziert und nutzt neue Wörter nur aus der aktuellen Unit", () => {
  const words = [
    { id: "due", unitId: "unit-3" },
    { id: "difficult", unitId: "unit-4" },
    { id: "new-current", unitId: "unit-4" },
    { id: "new-old-unit", unitId: "unit-3" },
  ];
  const learningState = createInitialLearningState("scheduler-course", NOW);
  const dueState = markWordCorrect(
    learningState,
    "due",
    "2026-07-11T12:00:00.000Z",
  );
  dueState.nextReviewAt = "2026-07-13T10:00:00.000Z";
  markWordWrong(learningState, "difficult", NOW);

  const learningSet = buildDailyLearningSet({
    words,
    currentUnitId: "unit-4",
    learningState,
    maxNewWords: 10,
    maxReviewWords: 2,
    now: NOW,
  });

  assert.deepEqual(ids(learningSet.reviewWords), ["due"]);
  assert.deepEqual(ids(learningSet.difficultWords), ["difficult"]);
  assert.deepEqual(ids(learningSet.newWords), ["new-current"]);
  assert.deepEqual(ids(learningSet.allWords), ["due", "difficult", "new-current"]);
  assert.equal(new Set(ids(learningSet.allWords)).size, learningSet.allWords.length);
});

test("nur markiertes, unbearbeitetes Wort bleibt neu", () => {
  const learningState = createInitialLearningState("marked-new", NOW);
  toggleMarkedWord(learningState, "word-001", NOW);
  assert.deepEqual(
    ids(getNewWords([{ id: "word-001", unitId: "unit-4" }], learningState)),
    ["word-001"],
  );
});

test("leerer Storage liefert Fallback", () => {
  localStorage.clear();
  assert.deepEqual(loadJson("missing", { empty: true }), { empty: true });
});

test("beschädigtes JSON wird entfernt", () => {
  localStorage.clear();
  localStorage.setItem("broken", "{nicht-json");
  assert.deepEqual(loadJson("broken", { recovered: true }), { recovered: true });
  assert.equal(localStorage.getItem("broken"), null);
});

test("Lernstände zweier Kurse bleiben getrennt und einzeln rücksetzbar", () => {
  localStorage.clear();
  const courseA = createInitialLearningState("course-a", NOW);
  const courseB = createInitialLearningState("course-b", NOW);
  markWordCorrect(courseA, "word-001", NOW);
  markWordWrong(courseB, "word-001", NOW);
  assert.equal(saveLearningState(courseA), true);
  assert.equal(saveLearningState(courseB), true);
  assert.equal(loadLearningState("course-a", NOW).words["word-001"].correctCount, 1);
  assert.equal(loadLearningState("course-b", NOW).words["word-001"].wrongCount, 1);
  resetCourseLearningState("course-a");
  assert.equal(
    localStorage.getItem(createCourseStorageKey("course-a", "learning-state")),
    null,
  );
  assert.notEqual(
    localStorage.getItem(createCourseStorageKey("course-b", "learning-state")),
    null,
  );
});

test("inkompatibler Lernstand wird sicher neu initialisiert", () => {
  localStorage.clear();
  const key = createCourseStorageKey("legacy-course", "learning-state");
  localStorage.setItem(key, JSON.stringify({ schemaVersion: 99, courseId: "legacy-course" }));
  const recoveredState = loadLearningState("legacy-course", NOW);
  assert.equal(recoveredState.schemaVersion, 2);
  assert.deepEqual(recoveredState.words, {});
  assert.equal(localStorage.getItem(key), null);
});

test("Schema-1-Lernstand wird konservativ migriert und nach Reload erhalten", () => {
  localStorage.clear();
  const key = createCourseStorageKey("legacy-mastery-course", "learning-state");
  const legacyState = createInitialLearningState("legacy-mastery-course", NOW);
  legacyState.schemaVersion = 1;
  legacyState.words["word-001"] = {
    wordId: "word-001",
    correctCount: 4,
    wrongCount: 1,
    streak: 2,
    level: 4,
    marked: true,
    lastSeenAt: NOW,
    nextReviewAt: "2026-07-27T12:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
  };
  localStorage.setItem(key, JSON.stringify(legacyState));

  const migrated = loadLearningState("legacy-mastery-course", NOW);
  const wordState = migrated.words["word-001"];
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(wordState.correctCount, 4);
  assert.equal(wordState.wrongCount, 1);
  assert.equal(wordState.marked, true);
  assert.equal(wordState.status, "learning");
  assert.deepEqual(wordState.correctDays, []);
  assert.equal(wordState.activeCorrectCount, 0);
  assert.equal(isMastered(wordState), false);
  assert.deepEqual(loadLearningState("legacy-mastery-course", NOW), migrated);
});

test("Dashboard-Kennzahlen stammen aus den gebündelten Beispieldaten", () => {
  const learningState = createInitialLearningState(courseConfig.courseId, NOW);
  const metrics = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState,
    now: NOW,
  });

  assert.equal(metrics.newWordCount, 6);
  assert.equal(metrics.todayWordCount, 6);
  assert.equal(metrics.difficultWordCount, 0);
  assert.equal(metrics.markedWordCount, 0);
  assert.equal(metrics.progress, 0);
  assert.equal(metrics.estimatedMinutes, 3);
});

test("Dashboard-Fortschritt bleibt bei leerer Unit null Prozent", () => {
  const emptyData = clone(vocabularyData);
  const currentUnit = emptyData.units.find((unit) => unit.id === courseConfig.currentUnit);
  currentUnit.words = [];
  const metrics = calculateDashboardMetrics({
    courseConfig,
    vocabularyData: emptyData,
    learningState: createInitialLearningState(courseConfig.courseId, NOW),
    now: NOW,
  });
  assert.equal(metrics.progress, 0);
  assert.equal(metrics.todayWordCount, 0);
  assert.equal(metrics.estimatedMinutes, 1);
});

test("Dashboard-Fortschritt folgt einem gespeicherten Lernstand", () => {
  const learningState = createInitialLearningState(courseConfig.courseId, NOW);
  const currentUnitWords = getWordsByUnit(vocabularyData, courseConfig.currentUnit);
  currentUnitWords.slice(0, 3).forEach((word) => {
    markWordCorrect(learningState, word.id, NOW);
    markWordCorrect(learningState, word.id, NOW, { retrievalType: "active" });
    markWordCorrect(learningState, word.id, "2026-07-14T12:00:00.000Z");
  });
  const metrics = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState,
    now: NOW,
  });
  assert.equal(metrics.masteredWordCount, 3);
  assert.equal(metrics.progress, 50);
});

test("eingebauter Englischkurs nutzt englische Hinweise ohne gesuchtes Source-Wort", () => {
  const words = vocabularyData.units.flatMap((unit) => unit.words);
  assert.equal(words.length, 12);
  words.forEach((word) => {
    assert.equal(typeof word.hint, "string");
    assert.ok(word.hint.trim().length > 0, `${word.id}: Hinweis fehlt`);
    const normalizedHint = word.hint.normalize("NFKC").toLocaleLowerCase("en");
    const normalizedSource = word.source.normalize("NFKC").toLocaleLowerCase("en");
    assert.equal(
      new RegExp(`\\b${normalizedSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u").test(normalizedHint),
      false,
      `${word.id}: Hinweis enthält das gesuchte Wort`,
    );
  });
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

console.log(`\n${tests.length - failures}/${tests.length} Tests bestanden.`);

if (failures > 0) {
  process.exitCode = 1;
}
