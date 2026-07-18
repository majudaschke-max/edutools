import assert from "node:assert/strict";

import { createInitialLearningState } from "../src/core/learning-state.js";
import { createSessionController } from "../src/session/session-controller.js";
import {
  formatSessionSizeSelection,
  getDefaultSessionSize,
  getSessionSizeOptions,
  resolveSessionSize,
  selectSessionWords,
} from "../src/core/session-size.js";
import {
  FLASHCARD_DIRECTIONS,
  createRetrySessionState,
  createSessionState,
  getCurrentSessionCardDirection,
  getCurrentSessionWordId,
  getSessionProgress,
  getSessionQueue,
  recordSessionResult,
  revealSessionSolution,
  setSessionMarkedResult,
} from "../src/session/session-state.js";
import { getSessionShortcut } from "../src/views/session-view.js";

const NOW = "2026-07-13T12:00:00.000Z";
const WORDS = [
  { id: "word-1", unitId: "unit-4", source: "first", targets: ["erste"] },
  { id: "word-2", unitId: "unit-4", source: "second", targets: ["zweite"] },
];
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createController(overrides = {}) {
  const savedStates = [];
  const controller = createSessionController({
    learningState: createInitialLearningState("session-course", NOW),
    words: WORDS,
    now: () => NOW,
    save: (state) => {
      savedStates.push(clone(state));
      return true;
    },
    ...overrides,
  });

  return { controller, savedStates };
}

test("Session initialisieren", () => {
  const state = createSessionState({
    mode: "daily",
    wordIds: ["word-1", "word-1", "word-2"],
  });

  assert.equal(state.mode, "flashcards");
  assert.equal(state.sourceType, "daily");
  assert.equal(state.direction, FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET);
  assert.deepEqual(state.wordIds, ["word-1", "word-2"]);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.solutionVisible, false);
  assert.equal(state.completed, false);
  assert.equal(getCurrentSessionWordId(state), "word-1");
});

test("Lernumfang bietet für 3, 5, 7, 10, 19 und 43 Wörter nur sinnvolle Optionen", () => {
  assert.deepEqual(getSessionSizeOptions(3).map(({ value, count }) => [value, count]), [["all", 3]]);
  assert.deepEqual(getSessionSizeOptions(5).map(({ value, count }) => [value, count]), [["all", 5]]);
  assert.deepEqual(getSessionSizeOptions(7).map(({ value, count }) => [value, count]), [["5", 5], ["all", 7]]);
  assert.deepEqual(getSessionSizeOptions(10).map(({ value, count }) => [value, count]), [["5", 5], ["all", 10]]);
  assert.deepEqual(getSessionSizeOptions(19).map(({ value, count }) => [value, count]), [["5", 5], ["10", 10], ["all", 19]]);
  assert.deepEqual(getSessionSizeOptions(43).map(({ value, count }) => [value, count]), [["5", 5], ["10", 10], ["20", 20], ["30", 30], ["all", 43]]);
});

test("zehn Wörter sind Empfehlung und niemals versteckte Obergrenze", () => {
  assert.equal(getDefaultSessionSize(19), "10");
  assert.equal(resolveSessionSize("all", 19), 19);
  assert.equal(formatSessionSizeSelection("10", 19), "Du übst jetzt 10 von 19 Wörtern.");
  assert.equal(formatSessionSizeSelection("all", 19), "Du übst jetzt alle 19 Wörter.");
});

test("Alle nutzt den vollständigen deduplizierten Kursumfang", () => {
  const words = Array.from({ length: 19 }, (_, index) => ({ id: `word-${index + 1}` }));
  words.push({ id: "word-19" });
  assert.equal(selectSessionWords(words, "all").length, 19);
  assert.equal(selectSessionWords(words, "10").length, 10);
});

test("Lösung ist zunächst verborgen und lässt sich aufdecken", () => {
  const state = createSessionState({ wordIds: ["word-1"] });
  assert.equal(state.solutionVisible, false);
  assert.equal(revealSessionSolution(state), true);
  assert.equal(state.solutionVisible, true);
});

test("Bewertung wechselt zur nächsten Karte und verbirgt die Lösung", () => {
  const state = createSessionState({ wordIds: ["word-1", "word-2"] });
  revealSessionSolution(state);
  assert.equal(recordSessionResult(state, "correct"), "word-1");
  assert.equal(getCurrentSessionWordId(state), "word-2");
  assert.equal(state.solutionVisible, false);
  assert.equal(state.completed, false);
});

test("letzte Karte schließt die Session ab", () => {
  const state = createSessionState({ wordIds: ["word-1"] });
  revealSessionSolution(state);
  recordSessionResult(state, "correct");
  assert.equal(state.completed, true);
  assert.equal(getCurrentSessionWordId(state), null);
  assert.deepEqual(getSessionProgress(state), { current: 1, completed: 1, total: 1 });
});

test("falsches Wort wird in der ursprünglichen Session nicht doppelt bewertet", () => {
  const state = createSessionState({ wordIds: ["word-1", "word-2"] });
  revealSessionSolution(state);
  recordSessionResult(state, "wrong");
  assert.deepEqual(state.retryWordIds, []);
  assert.deepEqual(getSessionQueue(state), ["word-1", "word-2"]);

  revealSessionSolution(state);
  recordSessionResult(state, "correct");
  assert.equal(state.completed, true);
  assert.deepEqual(state.results.wrong, ["word-1"]);
});

test("neue Unsicher-Wörter-Session dedupliziert falsche Wörter", () => {
  const source = createSessionState({ wordIds: ["word-1"] });
  source.results.wrong.push("word-1", "word-1", "word-2");
  const retry = createRetrySessionState(source);
  assert.equal(retry.mode, "flashcards");
  assert.equal(retry.sourceType, "retry");
  assert.deepEqual(retry.wordIds, ["word-1", "word-2"]);
  assert.deepEqual(retry.results.wrong, []);
});

test("Session-Markierungen bilden den aktuellen Umschaltzustand ab", () => {
  const state = createSessionState({ wordIds: ["word-1"] });
  setSessionMarkedResult(state, "word-1", true);
  setSessionMarkedResult(state, "word-1", true);
  assert.deepEqual(state.results.marked, ["word-1"]);
  setSessionMarkedResult(state, "word-1", false);
  assert.deepEqual(state.results.marked, []);
});

test("Kann ich verwendet den Core, speichert und zeigt das nächste Wort", () => {
  const { controller, savedStates } = createController();
  controller.startSession({ mode: "daily", wordIds: ["word-1", "word-2"] });
  controller.showSolution();
  assert.deepEqual(controller.getLearningState().words, {});
  const result = controller.answerCorrect();

  assert.equal(result.ok, true);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].words["word-1"].correctCount, 1);
  assert.equal(savedStates[0].words["word-1"].activeCorrectCount, 0);
  assert.equal(controller.getSnapshot().currentWord.id, "word-2");
  assert.deepEqual(controller.getSnapshot().session.results.correct, ["word-1"]);
});

test("Noch nicht verwendet den Core genau einmal und sammelt das Wort für den Abschluss", () => {
  const { controller, savedStates } = createController();
  controller.startSession({ mode: "review", wordIds: ["word-1", "word-2"] });
  controller.showSolution();
  const result = controller.answerWrong();

  assert.equal(result.ok, true);
  assert.equal(savedStates[0].words["word-1"].wrongCount, 1);
  assert.deepEqual(controller.getSnapshot().session.retryWordIds, []);
  assert.deepEqual(controller.getSnapshot().session.results.wrong, ["word-1"]);
});

test("Gemerkt speichert ohne Kartenwechsel und lässt sich entfernen", () => {
  const { controller, savedStates } = createController();
  controller.startSession({ mode: "marked", wordIds: ["word-1"] });
  controller.showSolution();

  assert.equal(controller.toggleCurrentMarked().marked, true);
  assert.equal(controller.getSnapshot().currentWord.id, "word-1");
  assert.equal(controller.getSnapshot().session.solutionVisible, true);
  assert.deepEqual(controller.getSnapshot().session.results.marked, ["word-1"]);

  assert.equal(controller.toggleCurrentMarked().marked, false);
  assert.deepEqual(controller.getSnapshot().session.results.marked, []);
  assert.equal(savedStates.length, 2);
});

test("Markierung kann außerhalb einer Session entfernt werden", () => {
  const initialState = createInitialLearningState("session-course", NOW);
  const firstController = createSessionController({
    learningState: initialState,
    words: WORDS,
    now: () => NOW,
    save: () => true,
  });
  assert.equal(firstController.toggleMarkedById("word-1").marked, true);
  assert.equal(firstController.toggleMarkedById("word-1").marked, false);
});

test("Speicherfehler verändert weder Lernstand noch Kartenposition", () => {
  const originalState = createInitialLearningState("session-course", NOW);
  const { controller } = createController({
    learningState: originalState,
    save: () => false,
  });
  controller.startSession({ wordIds: ["word-1"] });
  controller.showSolution();
  const result = controller.answerCorrect();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage");
  assert.deepEqual(controller.getLearningState().words, {});
  assert.equal(controller.getSnapshot().session.currentIndex, 0);
  assert.equal(controller.getSnapshot().session.solutionVisible, true);
  assert.match(controller.getSnapshot().error, /nicht gespeichert/);
});

test("Doppelbewertung nach Kartenwechsel wird blockiert", () => {
  const { controller, savedStates } = createController();
  controller.startSession({ wordIds: ["word-1", "word-2"] });
  controller.showSolution();
  assert.equal(controller.answerCorrect().ok, true);
  assert.equal(controller.answerWrong().ok, false);
  assert.equal(controller.answerWrong().reason, "solution-hidden");
  assert.equal(savedStates.length, 1);
});

test("fehlende Wort-ID wird verständlich abgelehnt", () => {
  const { controller } = createController();
  const result = controller.startSession({ wordIds: ["missing-word"] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing-word");
  assert.match(result.error, /nicht mehr verfügbar/);
});

test("Controller startet nach Abschluss eine neue Unsicher-Wörter-Session", () => {
  const { controller } = createController();
  controller.startSession({ wordIds: ["word-1"] });
  controller.showSolution();
  controller.answerWrong();
  assert.equal(controller.getSnapshot().session.completed, true);

  const result = controller.startRetrySession();
  assert.equal(result.ok, true);
  assert.equal(result.session.mode, "flashcards");
  assert.equal(result.session.sourceType, "retry");
  assert.deepEqual(result.session.wordIds, ["word-1"]);
  assert.deepEqual(result.session.results.correct, []);
});

test("drei Flashcard-Richtungen werden eindeutig im Session-State gespeichert", () => {
  const source = createSessionState({
    wordIds: ["word-1"],
    direction: FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET,
  });
  const target = createSessionState({
    wordIds: ["word-1"],
    direction: FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
  });
  const mixed = createSessionState({
    wordIds: ["word-1"],
    direction: FLASHCARD_DIRECTIONS.MIXED,
    random: () => 0.9,
  });

  assert.equal(getCurrentSessionCardDirection(source), FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET);
  assert.equal(getCurrentSessionCardDirection(target), FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE);
  assert.equal(getCurrentSessionCardDirection(mixed), FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE);
});

test("gemischte Richtung ist injizierbar, nutzt beide Seiten und bleibt beim Aufdecken stabil", () => {
  const values = [0.1, 0.9];
  const state = createSessionState({
    wordIds: ["word-1", "word-2"],
    direction: FLASHCARD_DIRECTIONS.MIXED,
    random: () => values.shift(),
  });
  const beforeReveal = getCurrentSessionCardDirection(state);
  revealSessionSolution(state);
  assert.equal(getCurrentSessionCardDirection(state), beforeReveal);
  assert.deepEqual(new Set(Object.values(state.cardDirections)), new Set([
    FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET,
    FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
  ]));
});

test("gemischte Richtung erzwingt bei ausreichend Wörtern beide Richtungen", () => {
  const state = createSessionState({
    wordIds: ["word-1", "word-2"],
    direction: FLASHCARD_DIRECTIONS.MIXED,
    random: () => 0.1,
  });
  assert.equal(new Set(Object.values(state.cardDirections)).size, 2);
});

test("Enter und Leertaste decken ausschließlich die verborgene Lösung auf", () => {
  const session = createSessionState({ wordIds: ["word-1"] });
  const snapshot = { session, transitioning: false };
  const event = (key, code = "") => ({ key, code, target: { tagName: "BODY" } });

  assert.equal(getSessionShortcut(event("Enter"), snapshot), "reveal");
  assert.equal(getSessionShortcut(event(" ", "Space"), snapshot), "reveal");
  revealSessionSolution(session);
  assert.equal(getSessionShortcut(event("Enter"), snapshot), null);
});

test("Pfeiltasten und M steuern die sichtbare Lösung", () => {
  const session = createSessionState({ wordIds: ["word-1"] });
  revealSessionSolution(session);
  const snapshot = { session, transitioning: false };
  const event = (key) => ({ key, target: { tagName: "BODY" } });

  assert.equal(getSessionShortcut(event("ArrowLeft"), snapshot), "wrong");
  assert.equal(getSessionShortcut(event("ArrowRight"), snapshot), "correct");
  assert.equal(getSessionShortcut(event("m"), snapshot), "mark");
  assert.equal(getSessionShortcut(event("M"), snapshot), "mark");
});

test("Shortcuts bleiben in Eingabefeldern, Dialogen und bei Wiederholung aus", () => {
  const session = createSessionState({ wordIds: ["word-1"] });
  const snapshot = { session, transitioning: false };

  assert.equal(getSessionShortcut({ key: "Enter", target: { tagName: "INPUT" } }, snapshot), null);
  assert.equal(getSessionShortcut({ key: "Enter", target: { tagName: "TEXTAREA" } }, snapshot), null);
  assert.equal(
    getSessionShortcut({ key: "Enter", target: { tagName: "BODY" } }, snapshot, true),
    null,
  );
  assert.equal(
    getSessionShortcut({ key: "Enter", repeat: true, target: { tagName: "BODY" } }, snapshot),
    null,
  );
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

console.log(`\n${tests.length - failures}/${tests.length} Session-Tests bestanden.`);

if (failures > 0) {
  process.exitCode = 1;
}
