import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createInitialLearningState } from "../src/core/learning-state.js";
import { createQuizController } from "../src/quiz/quiz-controller.js";
import {
  createDistractors,
  createQuizQuestion,
  isQuizAnswerCorrect,
  normalizeQuizAnswer,
  QUIZ_DIRECTIONS,
  shuffleOptions,
} from "../src/quiz/quiz-generator.js";
import {
  advanceQuizQuestion,
  createCurrentQuizResult,
  createQuizState,
  getQuizSummary,
  recordQuizResult,
  selectQuizAnswer,
} from "../src/quiz/quiz-state.js";
import { calculateDashboardMetrics } from "../src/views/dashboard-view.js";
import { getQuizShortcut, renderQuizView } from "../src/views/quiz-view.js";

const NOW = "2026-07-13T12:00:00.000Z";
const WORDS = [
  { id: "castle", unitId: "unit-1", source: "castle", targets: ["Burg", "Schloss"] },
  { id: "island", unitId: "unit-1", source: "island", targets: ["Insel"] },
  { id: "scenery", unitId: "unit-1", source: "scenery", targets: ["Landschaft"] },
  { id: "audience", unitId: "unit-1", source: "audience", targets: ["Zuschauer"] },
  { id: "direction", unitId: "unit-2", source: "direction", targets: ["Richtung"] },
  { id: "fortress", unitId: "unit-2", source: "fortress", targets: ["burg"] },
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

function createSeededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function createQuestion(overrides = {}) {
  return {
    wordId: "island",
    direction: QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    prompt: "island",
    phonetic: "ˈaɪlənd",
    correctAnswers: ["Insel"],
    correctOption: "Insel",
    options: ["Insel", "Landschaft", "Zuschauer", "Richtung"],
    ...overrides,
  };
}

function createController(overrides = {}) {
  const savedStates = [];
  const controller = createQuizController({
    learningState: createInitialLearningState("quiz-course", NOW),
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

test("Quizfrage enthält die richtige Antwort und drei eindeutige Distraktoren", () => {
  const question = createQuizQuestion(
    WORDS[0],
    WORDS,
    QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    { randomFn: constantRandom(0) },
  );
  assert.equal(question.options.length, 4);
  assert.equal(question.options.includes("Burg / Schloss"), true);
  assert.equal(new Set(question.options.map(normalizeQuizAnswer)).size, 4);
});

test("gültige Übersetzungsalternativen werden niemals Distraktoren", () => {
  const distractors = createDistractors(
    WORDS[0],
    WORDS,
    QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    4,
    { randomFn: constantRandom(0) },
  );
  assert.equal(distractors.some((answer) => normalizeQuizAnswer(answer) === "burg"), false);
  assert.equal(isQuizAnswerCorrect(createQuestion({
    correctAnswers: ["Burg", "Schloss"],
    correctOption: "Burg / Schloss",
  }), "Schloss"), true);
});

test("Distraktoren aus derselben Unit werden bevorzugt", () => {
  const distractors = createDistractors(
    WORDS[0],
    WORDS,
    QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    3,
    { randomFn: constantRandom(0) },
  );
  assert.deepEqual(new Set(distractors), new Set(["Insel", "Landschaft", "Zuschauer"]));
});

test("fehlende Distraktoren werden aus anderen Units ergänzt", () => {
  const candidates = [WORDS[0], WORDS[1], WORDS[4]];
  const distractors = createDistractors(
    WORDS[0],
    candidates,
    QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    3,
    { randomFn: constantRandom(0) },
  );
  assert.deepEqual(new Set(distractors), new Set(["Insel", "Richtung"]));
});

test("bei weniger als zwei eindeutigen Optionen entsteht keine Quizfrage", () => {
  assert.equal(createQuizQuestion(
    WORDS[0],
    [WORDS[0], WORDS[5]],
    QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    { randomFn: constantRandom(0) },
  ), null);
});

test("beide Fragerichtungen erzeugen passende Frage und Antwort", () => {
  const forward = createQuizQuestion(
    WORDS[0], WORDS, QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
    { randomFn: constantRandom(0) },
  );
  const reverse = createQuizQuestion(
    WORDS[0], WORDS, QUIZ_DIRECTIONS.TARGET_TO_SOURCE,
    { randomFn: constantRandom(0) },
  );
  assert.equal(forward.prompt, "castle");
  assert.equal(forward.correctOption, "Burg / Schloss");
  assert.equal(reverse.prompt, "Burg");
  assert.equal(reverse.correctOption, "castle");
});

test("gemischte Richtung wird über die injizierte Zufallsfunktion bestimmt", () => {
  const forward = createQuizQuestion(
    WORDS[1], WORDS, QUIZ_DIRECTIONS.MIXED,
    { randomFn: constantRandom(0.1) },
  );
  const reverse = createQuizQuestion(
    WORDS[1], WORDS, QUIZ_DIRECTIONS.MIXED,
    { randomFn: constantRandom(0.9) },
  );
  assert.equal(forward.direction, QUIZ_DIRECTIONS.SOURCE_TO_TARGET);
  assert.equal(reverse.direction, QUIZ_DIRECTIONS.TARGET_TO_SOURCE);
});

test("jede dritte geeignete Quizfrage nutzt den exakten gespeicherten Lückensatz", () => {
  const clozeWords = ["bridge", "island", "castle", "garden", "window", "forest"].map((source, index) => ({
    id: `cloze-${index}`,
    unitId: "unit-cloze",
    source,
    targets: [`Ziel ${index}`],
    example: `The ${source} is easy to see.`,
    tags: ["noun"],
  }));
  const controller = createQuizController({
    learningState: createInitialLearningState("quiz-cloze", NOW),
    words: clozeWords,
    randomFn: constantRandom(0),
  });
  const result = controller.startQuiz({
    words: clozeWords,
    direction: QUIZ_DIRECTIONS.TARGET_TO_SOURCE,
    limit: "all",
  });
  assert.equal(result.ok, true);
  assert.equal(result.quiz.questions.filter((question) => question.type === "cloze").length, 2);
  assert.ok(result.quiz.questions.filter((question) => question.type === "cloze")
    .every((question) => question.prompt.includes("___")));
});

test("Fisher-Yates-Mischung ist reproduzierbar und verändert das Original nicht", () => {
  const original = [1, 2, 3, 4, 5];
  const first = shuffleOptions(original, createSeededRandom(42));
  const second = shuffleOptions(original, createSeededRandom(42));
  assert.deepEqual(first, second);
  assert.deepEqual(original, [1, 2, 3, 4, 5]);
});

test("Quiz State initialisiert Auswahl und erste Frage", () => {
  const state = createQuizState({
    sourceType: "current-unit",
    direction: "mixed",
    questions: [createQuestion()],
  });
  assert.equal(state.mode, "quiz");
  assert.deepEqual(state.wordIds, ["island"]);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.selectedAnswer, null);
  assert.equal(state.answerSubmitted, false);
  assert.equal(state.completed, false);
});

test("Auswahl und richtige Antwort werden ohne automatisches Weiterschalten erfasst", () => {
  const state = createQuizState({ questions: [createQuestion()] });
  assert.equal(selectQuizAnswer(state, "Insel"), true);
  const result = createCurrentQuizResult(state, NOW);
  assert.equal(result.isCorrect, true);
  assert.equal(recordQuizResult(state, result), true);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.answerSubmitted, true);
});

test("falsche Antwort, nächste Frage und Abschluss werden korrekt abgebildet", () => {
  const state = createQuizState({
    questions: [createQuestion(), createQuestion({ wordId: "scenery", prompt: "scenery" })],
  });
  selectQuizAnswer(state, "Landschaft");
  recordQuizResult(state, createCurrentQuizResult(state, NOW));
  assert.equal(state.results[0].isCorrect, false);
  assert.equal(advanceQuizQuestion(state), true);
  assert.equal(state.currentIndex, 1);
  selectQuizAnswer(state, "Insel");
  recordQuizResult(state, createCurrentQuizResult(state, NOW));
  advanceQuizQuestion(state);
  assert.equal(state.completed, true);
});

test("Erfolgsquote und Liste falscher Wörter stammen aus Ergebnissen", () => {
  const state = createQuizState({
    questions: [createQuestion(), createQuestion({ wordId: "scenery", prompt: "scenery" })],
  });
  selectQuizAnswer(state, "Insel");
  recordQuizResult(state, createCurrentQuizResult(state, NOW));
  advanceQuizQuestion(state);
  selectQuizAnswer(state, "Landschaft");
  recordQuizResult(state, createCurrentQuizResult(state, NOW));
  advanceQuizQuestion(state);
  assert.deepEqual(getQuizSummary(state), {
    questionCount: 2,
    correctCount: 1,
    wrongCount: 1,
    successRate: 50,
    wrongWordIds: ["scenery"],
  });
});

test("richtige Quizantwort verwendet markWordCorrect und speichert", () => {
  const { controller, savedStates } = createController();
  controller.startQuiz({ words: WORDS.slice(0, 2), direction: "source-to-target", limit: 1 });
  const correctOption = controller.getSnapshot().quiz.currentQuestion.correctOption;
  controller.selectAnswer(correctOption);
  const result = controller.submitAnswer();
  assert.equal(result.ok, true);
  assert.equal(result.result.isCorrect, true);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].words[result.result.wordId].correctCount, 1);
  assert.equal(savedStates[0].words[result.result.wordId].activeCorrectCount, 0);
});

test("falsche Quizantwort verwendet markWordWrong und speichert", () => {
  const { controller, savedStates } = createController();
  controller.startQuiz({ words: WORDS.slice(0, 2), direction: "source-to-target", limit: 1 });
  const question = controller.getSnapshot().quiz.currentQuestion;
  controller.selectAnswer(question.options.find((option) => option !== question.correctOption));
  const result = controller.submitAnswer();
  assert.equal(result.result.isCorrect, false);
  assert.equal(savedStates[0].words[result.result.wordId].wrongCount, 1);
});

test("Quizantwort kann nicht doppelt bewertet werden", () => {
  const { controller, savedStates } = createController();
  controller.startQuiz({ words: WORDS.slice(0, 2), direction: "source-to-target", limit: 1 });
  controller.selectAnswer(controller.getSnapshot().quiz.currentQuestion.correctOption);
  assert.equal(controller.submitAnswer().ok, true);
  assert.equal(controller.submitAnswer().ok, false);
  assert.equal(savedStates.length, 1);
});

test("ohne Auswahl und bei Speicherfehler bleibt die Frage unbewertet", () => {
  const { controller } = createController({ save: () => false });
  controller.startQuiz({ words: WORDS.slice(0, 2), direction: "source-to-target", limit: 1 });
  assert.equal(controller.submitAnswer().reason, "no-selection");
  controller.selectAnswer(controller.getSnapshot().quiz.currentQuestion.correctOption);
  assert.equal(controller.submitAnswer().reason, "storage");
  assert.equal(controller.getSnapshot().quiz.answerSubmitted, false);
  assert.equal(controller.getSnapshot().quiz.results.length, 0);
});

test("ungeeignete Wörter werden übersprungen und intern dokumentiert", () => {
  const isolated = [{ id: "solo", unitId: "unit-1", source: "solo", targets: ["allein"] }];
  const controller = createQuizController({
    learningState: createInitialLearningState("quiz-course", NOW),
    words: isolated,
    randomFn: constantRandom(0),
    save: () => true,
  });
  const result = controller.startQuiz({ words: isolated, direction: "source-to-target" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "insufficient-options");
  assert.deepEqual(result.skippedWordIds, ["solo"]);
});

test("Dashboard wird nach einer Quizbewertung aus dem neuen Lernstand berechnet", async () => {
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
  const controller = createQuizController({
    learningState: state,
    words: before.learningSet.allWords,
    now: () => NOW,
    randomFn: constantRandom(0),
    save: () => true,
  });
  controller.startQuiz({
    words: before.learningSet.allWords,
    direction: "source-to-target",
    limit: 1,
  });
  controller.selectAnswer(controller.getSnapshot().quiz.currentQuestion.correctOption);
  controller.submitAnswer();
  const after = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState: controller.getLearningState(),
    now: new Date(NOW),
  });
  assert.equal(after.newWordCount, before.newWordCount - 1);
});

test("Quiz-Auswahlansicht zeigt verfügbare Quellen, Richtungen und Umfänge", () => {
  const targets = createViewTargets();
  renderQuizView({
    ...targets,
    snapshot: { quiz: null, error: null },
    sourceOptions: [{ value: "package:unit-1", packageId: "unit-1", label: "Lernpaket „At the coast“", words: WORDS.slice(0, 4) }],
  });
  assert.match(targets.container.textContent, /Quiz zusammenstellen/);
  assert.match(targets.container.textContent, /Lernpaket „At the coast“ \(4\)/);
  assert.match(targets.container.textContent, /Ausgangssprache → Zielsprache/);
  assert.match(targets.container.textContent, /Alle 4 Fragen/);
  assert.match(targets.container.textContent, /Quiz starten/);
});

test("Quiz-Auswahl zeigt ohne Lernquelle einen Empty State", () => {
  const targets = createViewTargets();
  renderQuizView({
    ...targets,
    snapshot: { quiz: null, error: null },
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /Noch keine Quizwörter/);
  assert.match(targets.container.textContent, /Zum Dashboard/);
});

test("Quizfrage verwendet native Radiogruppe und zeigt noch kein Feedback", () => {
  const targets = createViewTargets();
  const quiz = createQuizState({ questions: [createQuestion()] });
  renderQuizView({
    ...targets,
    snapshot: { quiz, currentWord: WORDS[1], error: null, summary: getQuizSummary(quiz), wrongWords: [] },
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  const fieldsets = findNodes(targets.container, (node) => node.tagName === "FIELDSET");
  assert.equal(fieldsets.length, 1);
  assert.equal(fieldsets[0].attributes.get("aria-describedby"), "quiz-answer-error");
  assert.equal(
    findNodes(targets.container, (node) => node.attributes.get("name") === "quiz-answer").length,
    4,
  );
  assert.match(targets.container.textContent, /Antwort prüfen/);
  assert.doesNotMatch(targets.container.textContent, /Richtig\./);
  assert.doesNotMatch(targets.container.textContent, /Tastatur:|Escape beendet|Pfeil hoch/);
  assert.equal(findNodes(targets.container, (node) => node.className === "keyboard-hint").length, 0);
  assert.doesNotMatch(fieldsets[0].attributes.get("aria-describedby"), /keyboard-hint/);
});

test("Quizfeedback kennzeichnet richtige Antwort zusätzlich mit Text", () => {
  const targets = createViewTargets();
  const quiz = createQuizState({ questions: [createQuestion()] });
  selectQuizAnswer(quiz, "Insel");
  recordQuizResult(quiz, createCurrentQuizResult(quiz, NOW));
  renderQuizView({
    ...targets,
    snapshot: { quiz, currentWord: WORDS[1], error: null, summary: getQuizSummary(quiz), wrongWords: [] },
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Richtig\./);
  assert.match(targets.container.textContent, /Richtige Antwort/);
  assert.doesNotMatch(targets.container.textContent, /bedeutet|Richtig ist:/);
  assert.match(targets.container.textContent, /Weiter/);
  assert.equal(
    findNodes(targets.container, (node) => node.className === "quiz-feedback__connection").length,
    0,
  );
});

test("Quiz-Lückensätze verwenden dieselbe knappe Feedbackregel", () => {
  const correctTargets = createViewTargets();
  const correctQuiz = createQuizState({ questions: [createQuestion({
    type: "cloze",
    direction: QUIZ_DIRECTIONS.TARGET_TO_SOURCE,
    prompt: "The ___ is small.",
    correctAnswers: ["island"],
    correctOption: "island",
    options: ["island", "castle", "scenery", "audience"],
  })] });
  selectQuizAnswer(correctQuiz, "island");
  recordQuizResult(correctQuiz, createCurrentQuizResult(correctQuiz, NOW));
  renderQuizView({
    ...correctTargets,
    snapshot: { quiz: correctQuiz, currentWord: WORDS[1], error: null, summary: getQuizSummary(correctQuiz), wrongWords: [] },
    sourceOptions: [],
  });
  assert.match(correctTargets.container.textContent, /Richtig\./);
  assert.doesNotMatch(correctTargets.container.textContent, /passende Lösung|Richtig ist:/);

  const wrongTargets = createViewTargets();
  const wrongQuiz = createQuizState({ questions: [createQuestion({
    type: "cloze",
    direction: QUIZ_DIRECTIONS.TARGET_TO_SOURCE,
    prompt: "The ___ is small.",
    correctAnswers: ["island"],
    correctOption: "island",
    options: ["island", "castle", "scenery", "audience"],
  })] });
  selectQuizAnswer(wrongQuiz, "castle");
  recordQuizResult(wrongQuiz, createCurrentQuizResult(wrongQuiz, NOW));
  renderQuizView({
    ...wrongTargets,
    snapshot: { quiz: wrongQuiz, currentWord: WORDS[1], error: null, summary: getQuizSummary(wrongQuiz), wrongWords: [WORDS[1]] },
    sourceOptions: [],
  });
  assert.match(wrongTargets.container.textContent, /Richtig ist: „island“\./);
  assert.doesNotMatch(wrongTargets.container.textContent, /Deine Antwort/);
});

test("falsches Quizfeedback wiederholt die Nutzerantwort nicht und behält Lernhilfen", () => {
  const targets = createViewTargets();
  const quiz = createQuizState({ questions: [createQuestion()] });
  selectQuizAnswer(quiz, "Landschaft");
  recordQuizResult(quiz, createCurrentQuizResult(quiz, NOW));
  renderQuizView({
    ...targets,
    snapshot: {
      quiz,
      currentWord: {
        ...WORDS[1],
        hint: "Land surrounded by water.",
        example: "The island is small.",
      },
      error: null,
      summary: getQuizSummary(quiz),
      wrongWords: [WORDS[1]],
    },
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.match(targets.container.textContent, /Noch nicht ganz\./);
  assert.doesNotMatch(targets.container.textContent, /Deine Antwort/);
  assert.match(targets.container.textContent, /Ausgewählt/);
  assert.match(targets.container.textContent, /Richtig ist: „Insel“\./);
  assert.match(targets.container.textContent, /Hinweis: Land surrounded by water\./);
  assert.match(targets.container.textContent, /The island is small\./);
  assert.match(targets.container.textContent, /Weiter/);
  assert.equal(findNodes(targets.container, (node) => node.className === "keyboard-hint").length, 0);
});

test("Quizabschluss zeigt Auswertung, falsche Wörter und Flashcard-Übergang", () => {
  const targets = createViewTargets();
  const quiz = createQuizState({ questions: [createQuestion()] });
  selectQuizAnswer(quiz, "Landschaft");
  recordQuizResult(quiz, createCurrentQuizResult(quiz, NOW));
  advanceQuizQuestion(quiz);
  renderQuizView({
    ...targets,
    snapshot: {
      quiz,
      currentWord: null,
      error: null,
      summary: getQuizSummary(quiz),
      wrongWords: [WORDS[1]],
    },
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /Quiz abgeschlossen/);
  assert.match(targets.container.textContent, /Erfolgsquote0 %/);
  assert.match(targets.container.textContent, /island – Insel/);
  assert.match(targets.container.textContent, /Falsche Wörter üben/);
  assert.doesNotMatch(targets.container.textContent, /Tastatur:/);
});

test("Quizabschluss ohne Fehler blendet Falsche-Wörter-Aktion aus", () => {
  const targets = createViewTargets();
  const quiz = createQuizState({ questions: [createQuestion()] });
  selectQuizAnswer(quiz, "Insel");
  recordQuizResult(quiz, createCurrentQuizResult(quiz, NOW));
  advanceQuizQuestion(quiz);
  renderQuizView({
    ...targets,
    snapshot: { quiz, currentWord: null, error: null, summary: getQuizSummary(quiz), wrongWords: [] },
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /Alle Fragen wurden richtig beantwortet\./);
  assert.doesNotMatch(targets.container.textContent, /Falsche Wörter üben/);
});

test("Quiz-Tastatur steuert Auswahl, Prüfung, Weiter und Abbruch", () => {
  const quiz = createQuizState({ questions: [createQuestion()] });
  const snapshot = { quiz, transitioning: false };
  const event = (key, target = { tagName: "BODY" }) => ({ key, target });
  assert.equal(getQuizShortcut(event("ArrowDown"), snapshot), "select-next");
  assert.equal(getQuizShortcut(event("ArrowUp"), snapshot), "select-previous");
  assert.equal(getQuizShortcut(event("3"), snapshot), "select-2");
  assert.equal(getQuizShortcut(event("Enter"), snapshot), "submit");
  assert.equal(getQuizShortcut(event("Escape"), snapshot), "exit");
  selectQuizAnswer(quiz, "Insel");
  recordQuizResult(quiz, createCurrentQuizResult(quiz, NOW));
  assert.equal(getQuizShortcut(event("Enter"), snapshot), "next");
});

test("Quiz-Shortcuts bleiben in Textfeldern, Selects und Dialogen aus", () => {
  const quiz = createQuizState({ questions: [createQuestion()] });
  const snapshot = { quiz, transitioning: false };
  assert.equal(getQuizShortcut({ key: "Enter", target: { tagName: "INPUT", type: "text" } }, snapshot), null);
  assert.equal(getQuizShortcut({ key: "Enter", target: { tagName: "SELECT" } }, snapshot), null);
  assert.equal(getQuizShortcut({ key: "Escape", target: { tagName: "BODY" } }, snapshot, true), null);
  assert.equal(getQuizShortcut({ key: "Enter", repeat: true, target: { tagName: "BODY" } }, snapshot), null);
});

test("aktive Quizansicht enthält einen semantischen Abbruchdialog", () => {
  const targets = createViewTargets();
  const quiz = createQuizState({ questions: [createQuestion()] });
  renderQuizView({
    ...targets,
    snapshot: { quiz, currentWord: WORDS[1], error: null, summary: getQuizSummary(quiz), wrongWords: [] },
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS }],
  });
  assert.equal(findNodes(targets.container, (node) => node.tagName === "DIALOG").length, 1);
  assert.match(targets.container.textContent, /Quiz verlassen\?/);
  assert.match(targets.container.textContent, /Quiz fortsetzen/);
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

console.log(`\n${tests.length - failures}/${tests.length} Quiz-Tests bestanden.`);

if (failures > 0) {
  process.exitCode = 1;
}
