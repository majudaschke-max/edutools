import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createInitialLearningState } from "../src/core/learning-state.js";
import { calculateDashboardMetrics } from "../src/views/dashboard-view.js";
import {
  evaluateWrittenAnswer,
  findMatchingAnswer,
  normalizeWrittenAnswer,
} from "../src/writing/writing-evaluator.js";
import { createWritingController } from "../src/writing/writing-controller.js";
import {
  advanceWritingPrompt,
  createCurrentWritingResult,
  createWritingState,
  getWritingSummary,
  recordWritingResult,
  revealWritingHint,
  setWritingAnswer,
  WRITING_DIRECTIONS,
} from "../src/writing/writing-state.js";
import { getWritingShortcut, renderWritingView } from "../src/views/writing-view.js";

const NOW = "2026-07-14T08:00:00.000Z";
const WORDS = [
  {
    id: "castle",
    unitId: "unit-1",
    source: "castle",
    targets: ["Burg", "Schloss"],
    phonetic: "ˈkɑːsəl",
    hint: "Ein großes, altes Gebäude.",
    example: "The castle stands on a hill.",
  },
  {
    id: "island",
    unitId: "unit-1",
    source: "island",
    targets: ["die Insel", "Insel"],
    phonetic: "ˈaɪlənd",
    hint: "Land, das von Wasser umgeben ist.",
  },
  {
    id: "careful",
    unitId: "unit-2",
    source: "careful",
    targets: ["vorsichtig"],
  },
];
const tests = [];

class TestNode {
  constructor(tagName, ownerDocument, text = "") {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this._text = text;
    this.hidden = false;
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this._text = ""; this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class TestDocument {
  createElement(tagName) { return new TestNode(tagName, this); }
  createTextNode(text) { return new TestNode("#text", this, String(text)); }
}

function test(name, callback) {
  tests.push({ name, callback });
}

function constantRandom(value = 0) {
  return () => value;
}

function createPrompt(overrides = {}) {
  return {
    wordId: "castle",
    direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET,
    prompt: "castle",
    acceptedAnswers: ["Burg", "Schloss"],
    phonetic: "ˈkɑːsəl",
    hasHint: true,
    ...overrides,
  };
}

function createController(overrides = {}) {
  const savedStates = [];
  const controller = createWritingController({
    learningState: createInitialLearningState("writing-course", NOW),
    words: WORDS,
    now: () => NOW,
    randomFn: constantRandom(0),
    save: (state) => {
      savedStates.push(JSON.parse(JSON.stringify(state)));
      return true;
    },
    ...overrides,
  });
  return { controller, savedStates };
}

function createViewTargets() {
  const documentRoot = new TestDocument();
  return {
    container: documentRoot.createElement("div"),
    summaryElement: documentRoot.createElement("p"),
  };
}

function findNodes(root, predicate, matches = []) {
  if (predicate(root)) matches.push(root);
  root.children.forEach((child) => findNodes(child, predicate, matches));
  return matches;
}

function createSnapshot(writing, overrides = {}) {
  return {
    writing,
    currentWord: writing?.currentPrompt ? WORDS[0] : null,
    transitioning: false,
    error: null,
    summary: writing ? getWritingSummary(writing) : null,
    wrongEntries: [],
    wrongWords: [],
    ...overrides,
  };
}

test("Normalisierung ignoriert Groß- und Kleinschreibung", () => {
  assert.equal(normalizeWrittenAnswer("INSEL"), "insel");
});

test("Normalisierung entfernt äußere Leerzeichen", () => {
  assert.equal(normalizeWrittenAnswer("  die Insel  "), "die insel");
});

test("Normalisierung vereinheitlicht mehrere Leerzeichen", () => {
  assert.equal(normalizeWrittenAnswer("die   kleine  Insel"), "die kleine insel");
});

test("Normalisierung ignoriert abschließende Satzzeichen", () => {
  assert.equal(normalizeWrittenAnswer("Insel?!"), "insel");
});

test("Normalisierung vereinheitlicht Apostrophvarianten", () => {
  assert.equal(normalizeWrittenAnswer("DON’T."), "don't");
});

test("Normalisierung verwendet Unicode-Kompatibilitätsform", () => {
  assert.equal(normalizeWrittenAnswer("Ｉｎｓｅｌ"), "insel");
});

test("echter Buchstabenfehler bleibt falsch", () => {
  assert.equal(evaluateWrittenAnswer("issland", ["island"]).isCorrect, false);
});

test("falsche Wortreihenfolge bleibt falsch", () => {
  assert.equal(evaluateWrittenAnswer("Insel die", ["die Insel"]).isCorrect, false);
});

test("erste und alternative Zielübersetzung werden akzeptiert", () => {
  assert.equal(evaluateWrittenAnswer("Burg", ["Burg", "Schloss"]).isCorrect, true);
  assert.equal(evaluateWrittenAnswer("schloss.", ["Burg", "Schloss"]).matchedAnswer, "Schloss");
});

test("nicht hinterlegte Verkürzung bleibt falsch", () => {
  assert.equal(evaluateWrittenAnswer("Insel", ["die Insel"]).isCorrect, false);
  assert.equal(findMatchingAnswer("Insel", ["die Insel"]), null);
});

test("Writing State initialisiert Eingabe, Hinweis und erste Aufgabe", () => {
  const state = createWritingState({ prompts: [createPrompt()] });
  assert.equal(state.mode, "write");
  assert.equal(state.userAnswer, "");
  assert.equal(state.hintUsed, false);
  assert.equal(state.answerSubmitted, false);
  assert.equal(state.completed, false);
});

test("Eingabe lässt sich vor der Bewertung setzen", () => {
  const state = createWritingState({ prompts: [createPrompt()] });
  assert.equal(setWritingAnswer(state, "Burg"), true);
  assert.equal(state.userAnswer, "Burg");
});

test("Hinweis wird ohne Bewertung protokolliert", () => {
  const state = createWritingState({ prompts: [createPrompt()] });
  assert.equal(revealWritingHint(state), true);
  assert.equal(state.hintUsed, true);
  assert.equal(state.results.length, 0);
});

test("richtige Schreibantwort wird ohne automatisches Weiterschalten erfasst", () => {
  const state = createWritingState({ prompts: [createPrompt()] });
  setWritingAnswer(state, "Schloss");
  const result = createCurrentWritingResult(state, NOW);
  assert.equal(result.isCorrect, true);
  assert.equal(result.matchedAnswer, "Schloss");
  assert.equal(recordWritingResult(state, result), true);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.answerSubmitted, true);
});

test("falsche Antwort, nächste Aufgabe und Abschluss werden abgebildet", () => {
  const state = createWritingState({
    prompts: [createPrompt(), createPrompt({ wordId: "island", prompt: "island", acceptedAnswers: ["Insel"] })],
  });
  setWritingAnswer(state, "Burk");
  recordWritingResult(state, createCurrentWritingResult(state, NOW));
  assert.equal(state.result.isCorrect, false);
  advanceWritingPrompt(state);
  assert.equal(state.userAnswer, "");
  assert.equal(state.hintUsed, false);
  setWritingAnswer(state, "Insel");
  recordWritingResult(state, createCurrentWritingResult(state, NOW));
  advanceWritingPrompt(state);
  assert.equal(state.completed, true);
});

test("Erfolgsquote, falsche Wörter und verwendete Hinweise sind korrekt", () => {
  const state = createWritingState({
    prompts: [createPrompt(), createPrompt({ wordId: "island", prompt: "island", acceptedAnswers: ["Insel"] })],
  });
  revealWritingHint(state);
  setWritingAnswer(state, "Burg");
  recordWritingResult(state, createCurrentWritingResult(state, NOW));
  advanceWritingPrompt(state);
  setWritingAnswer(state, "Inseln");
  recordWritingResult(state, createCurrentWritingResult(state, NOW));
  advanceWritingPrompt(state);
  assert.deepEqual(getWritingSummary(state), {
    taskCount: 2,
    correctCount: 1,
    wrongCount: 1,
    successRate: 50,
    hintCount: 1,
    wrongWordIds: ["island"],
  });
});

test("beide Schreibrichtungen nutzen die richtigen Lösungen", () => {
  const forward = createController().controller;
  forward.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  assert.equal(forward.getSnapshot().writing.currentPrompt.prompt, "castle");
  assert.deepEqual(forward.getSnapshot().writing.currentPrompt.acceptedAnswers, ["Burg", "Schloss"]);

  const reverse = createController().controller;
  reverse.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.TARGET_TO_SOURCE });
  assert.equal(reverse.getSnapshot().writing.currentPrompt.prompt, "Burg");
  assert.deepEqual(reverse.getSnapshot().writing.currentPrompt.acceptedAnswers, ["castle"]);
});

test("gemischte Schreibrichtung ist über Zufall reproduzierbar", () => {
  const forward = createController({ randomFn: constantRandom(0.1) }).controller;
  forward.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.MIXED });
  assert.equal(forward.getSnapshot().writing.currentPrompt.direction, WRITING_DIRECTIONS.SOURCE_TO_TARGET);

  const reverse = createController({ randomFn: constantRandom(0.9) }).controller;
  reverse.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.MIXED });
  assert.equal(reverse.getSnapshot().writing.currentPrompt.direction, WRITING_DIRECTIONS.TARGET_TO_SOURCE);
});

test("jede dritte geeignete Schreibaufgabe nutzt einen sicheren gespeicherten Lückensatz", () => {
  const clozeWords = ["bridge", "island", "castle", "garden", "window", "forest"].map((source, index) => ({
    id: `cloze-${index}`,
    unitId: "unit-cloze",
    source,
    targets: [`Ziel ${index}`],
    example: `The ${source} is easy to see.`,
    tags: ["noun"],
  }));
  const controller = createWritingController({
    learningState: createInitialLearningState("writing-cloze", NOW),
    words: clozeWords,
    randomFn: constantRandom(0),
  });
  const result = controller.startWriting({
    words: clozeWords,
    direction: WRITING_DIRECTIONS.TARGET_TO_SOURCE,
    limit: "all",
  });
  assert.equal(result.ok, true);
  assert.equal(result.writing.prompts.filter((prompt) => prompt.type === "cloze").length, 2);
  assert.ok(result.writing.prompts.filter((prompt) => prompt.type === "cloze")
    .every((prompt) => prompt.prompt.includes("___")));
});

test("richtige Antwort verwendet markWordCorrect und speichert", () => {
  const { controller, savedStates } = createController();
  controller.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  controller.updateAnswer("Burg");
  const result = controller.submitAnswer();
  assert.equal(result.result.isCorrect, true);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].words.castle.correctCount, 1);
  assert.equal(savedStates[0].words.castle.activeCorrectCount, 1);
});

test("falsche Antwort verwendet markWordWrong und speichert", () => {
  const { controller, savedStates } = createController();
  controller.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  controller.updateAnswer("Burk");
  const result = controller.submitAnswer();
  assert.equal(result.result.isCorrect, false);
  assert.equal(savedStates[0].words.castle.wrongCount, 1);
});

test("leere Antwort wird nicht bewertet", () => {
  const { controller, savedStates } = createController();
  controller.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  controller.updateAnswer("   ");
  assert.equal(controller.submitAnswer().reason, "empty-answer");
  assert.equal(savedStates.length, 0);
  assert.equal(controller.getSnapshot().writing.results.length, 0);
});

test("Schreibantwort kann nicht doppelt bewertet werden", () => {
  const { controller, savedStates } = createController();
  controller.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  controller.updateAnswer("Burg");
  assert.equal(controller.submitAnswer().ok, true);
  assert.equal(controller.submitAnswer().ok, false);
  assert.equal(savedStates.length, 1);
});

test("Speicherfehler lässt die Aufgabe offen", () => {
  const { controller } = createController({ save: () => false });
  controller.startWriting({ words: [WORDS[0]], direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  controller.updateAnswer("Burg");
  assert.equal(controller.submitAnswer().reason, "storage");
  assert.equal(controller.getSnapshot().writing.answerSubmitted, false);
  assert.equal(controller.getSnapshot().writing.results.length, 0);
});

test("Wörter ohne gültige Lösungen werden verständlich abgelehnt", () => {
  const invalidWords = [{ id: "empty", unitId: "unit-1", source: "empty", targets: [] }];
  const controller = createWritingController({
    learningState: createInitialLearningState("writing-course", NOW),
    words: invalidWords,
    randomFn: constantRandom(0),
    save: () => true,
  });
  const result = controller.startWriting({ words: invalidWords, direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET });
  assert.equal(result.reason, "invalid-answer-data");
  assert.deepEqual(result.skippedWordIds, ["empty"]);
});

test("Dashboard wird nach einer Schreibbewertung neu berechnet", async () => {
  const [courseConfigRaw, vocabularyDataRaw] = await Promise.all([
    readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8"),
    readFile(new URL("../src/data/vocabulary.json", import.meta.url), "utf8"),
  ]);
  const courseConfig = JSON.parse(courseConfigRaw);
  const vocabularyData = JSON.parse(vocabularyDataRaw);
  const state = createInitialLearningState(courseConfig.courseId, NOW);
  const before = calculateDashboardMetrics({
    courseConfig, vocabularyData, learningState: state, now: new Date(NOW),
  });
  const controller = createWritingController({
    learningState: state,
    words: before.learningSet.allWords,
    now: () => NOW,
    randomFn: constantRandom(0),
    save: () => true,
  });
  controller.startWriting({
    words: before.learningSet.allWords,
    direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET,
    limit: 1,
  });
  controller.updateAnswer(controller.getSnapshot().writing.currentPrompt.acceptedAnswers[0]);
  controller.submitAnswer();
  const after = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState: controller.getLearningState(),
    now: new Date(NOW),
  });
  assert.equal(after.newWordCount, before.newWordCount - 1);
});

test("Konfigurationsansicht zeigt Quellen, Richtungen und Umfänge", () => {
  const targets = createViewTargets();
  renderWritingView({
    ...targets,
    snapshot: { writing: null, error: null },
    sourceOptions: [{ value: "package:unit-1", packageId: "unit-1", label: "Lernpaket „At the coast“", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Schreibtraining zusammenstellen/);
  assert.match(targets.container.textContent, /Lernpaket „At the coast“ \(3\)/);
  assert.match(targets.container.textContent, /Ausgangssprache → Zielsprache/);
  assert.match(targets.container.textContent, /Alle 3 Wörter/);
});

test("Konfigurationsansicht besitzt einen Empty State", () => {
  const targets = createViewTargets();
  renderWritingView({
    ...targets,
    snapshot: { writing: null, error: null },
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /Noch keine Schreibwörter/);
  assert.match(targets.container.textContent, /Zum Dashboard/);
});

test("aktive Ansicht verwendet natives Formular und beschriftetes Texteingabefeld", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.equal(findNodes(targets.container, (node) => node.tagName === "FORM").length, 1);
  const input = findNodes(targets.container, (node) => node.attributes.get("name") === "writing-answer")[0];
  assert.equal(input.type, "text");
  assert.equal(input.attributes.get("autocomplete"), "off");
  assert.equal(input.attributes.get("autocapitalize"), "off");
  assert.equal(input.attributes.get("spellcheck"), "false");
  assert.equal(input.attributes.get("aria-describedby"), "writing-answer-error");
  assert.match(targets.container.textContent, /Deine Übersetzung/);
  assert.doesNotMatch(targets.container.textContent, /Tastatur:|Escape beendet|H zeigt/);
  assert.equal(findNodes(targets.container, (node) => node.className === "keyboard-hint").length, 0);
});

test("leere Eingabe wird direkt mit dem Eingabefeld verknüpft", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing, { error: "Bitte gib zuerst eine Antwort ein." }),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  const input = findNodes(targets.container, (node) => node.attributes.get("name") === "writing-answer")[0];
  assert.equal(input.attributes.get("aria-invalid"), "true");
  assert.match(input.attributes.get("aria-describedby"), /writing-answer-error/);
  assert.match(targets.container.textContent, /Bitte gib zuerst eine Antwort ein/);
});

test("Hinweis erscheint erst nach ausdrücklicher Aktion", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Hinweis anzeigen/);
  assert.doesNotMatch(targets.container.textContent, /Ein großes, altes Gebäude/);

  revealWritingHint(writing);
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Ein großes, altes Gebäude/);
});

test("Feedback wiederholt die sichtbare Eingabe nicht und zeigt akzeptierte Antworten", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  setWritingAnswer(writing, "Burk");
  recordWritingResult(writing, createCurrentWritingResult(writing, NOW));
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Noch nicht ganz/);
  assert.doesNotMatch(targets.container.textContent, /Deine Antwort/);
  assert.equal(
    findNodes(targets.container, (node) => node.attributes?.get?.("id") === "writing-answer")[0]?.value,
    "Burk",
  );
  assert.match(targets.container.textContent, /Richtige Lösungen: Burg \/ Schloss/);
  assert.match(targets.container.textContent, /Weiter/);
});

test("richtige Schreibantwort bleibt knapp und behält echte Lernhilfen", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  setWritingAnswer(writing, "Burg");
  recordWritingResult(writing, createCurrentWritingResult(writing, NOW));
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Richtig\./);
  assert.doesNotMatch(targets.container.textContent, /Richtige Lösung|Richtige Lösungen|Mögliche Lösungen/);
  assert.match(targets.container.textContent, /Hinweis: Ein großes, altes Gebäude\./);
  assert.match(targets.container.textContent, /The castle stands on a hill\./);
  assert.match(targets.container.textContent, /Weiter/);
  assert.equal(
    findNodes(targets.container, (node) => node.className === "writing-feedback__connection").length,
    0,
  );
});

test("Abschluss zeigt Auswertung, falsche Eingabe und Flashcard-Übergang", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  setWritingAnswer(writing, "Burk");
  recordWritingResult(writing, createCurrentWritingResult(writing, NOW));
  advanceWritingPrompt(writing);
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing, {
      wrongEntries: [{ word: WORDS[0], result: writing.results[0] }],
    }),
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /Schreibtraining abgeschlossen/);
  assert.match(targets.container.textContent, /Erfolgsquote0 %/);
  assert.match(targets.container.textContent, /Eingabe: Burk/);
  assert.doesNotMatch(targets.container.textContent, /Deine Antwort/);
  assert.match(targets.container.textContent, /Falsche Wörter mit Karteikarten üben/);
  assert.doesNotMatch(targets.container.textContent, /Tastatur:/);
});

test("Abschluss ohne Fehler blendet Flashcard-Aktion aus", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  setWritingAnswer(writing, "Burg");
  recordWritingResult(writing, createCurrentWritingResult(writing, NOW));
  advanceWritingPrompt(writing);
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /Alle Wörter wurden richtig geschrieben/);
  assert.doesNotMatch(targets.container.textContent, /Falsche Wörter mit Karteikarten üben/);
});

test("Tastatur steuert Weiter, Hinweis und Abbruch", () => {
  const writing = createWritingState({ prompts: [createPrompt()] });
  const snapshot = { writing, transitioning: false };
  const event = (key, target = { tagName: "BODY" }) => ({ key, target });
  assert.equal(getWritingShortcut(event("h"), snapshot), "hint");
  assert.equal(getWritingShortcut(event("Enter", { tagName: "INPUT" }), snapshot), "submit");
  assert.equal(getWritingShortcut(event("Escape", { tagName: "INPUT" }), snapshot), "exit");
  setWritingAnswer(writing, "Burg");
  recordWritingResult(writing, createCurrentWritingResult(writing, NOW));
  assert.equal(getWritingShortcut(event("Enter"), snapshot), "next");
});

test("Buchstaben-Shortcuts und Aktionen bleiben beim Tippen oder im Dialog aus", () => {
  const writing = createWritingState({ prompts: [createPrompt()] });
  const snapshot = { writing, transitioning: false };
  assert.equal(getWritingShortcut({ key: "h", target: { tagName: "INPUT" } }, snapshot), null);
  assert.equal(getWritingShortcut({ key: "Escape", target: { tagName: "BODY" } }, snapshot, true), null);
  assert.equal(getWritingShortcut({ key: "h", repeat: true, target: { tagName: "BODY" } }, snapshot), null);
});

test("aktive Schreibansicht enthält einen semantischen Abbruchdialog", () => {
  const targets = createViewTargets();
  const writing = createWritingState({ prompts: [createPrompt()] });
  renderWritingView({
    ...targets,
    snapshot: createSnapshot(writing),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.equal(findNodes(targets.container, (node) => node.tagName === "DIALOG").length, 1);
  assert.match(targets.container.textContent, /Schreibtraining verlassen/);
  assert.match(targets.container.textContent, /Training fortsetzen/);
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

console.log(`\n${tests.length - failures}/${tests.length} Schreibtraining-Tests bestanden.`);

if (failures > 0) {
  process.exitCode = 1;
}
