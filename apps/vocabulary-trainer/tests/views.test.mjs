import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { calculateDashboardMetrics } from "../src/views/dashboard-view.js";
import { createInitialLearningState, markWordCorrect } from "../src/core/learning-state.js";
import { setCurrentUnitId } from "../src/core/course.js";
import { createSessionController } from "../src/session/session-controller.js";
import {
  FLASHCARD_DIRECTIONS,
  createSessionState,
  revealSessionSolution,
} from "../src/session/session-state.js";
import { renderLearnView } from "../src/views/learn-view.js";
import { renderMarkedView } from "../src/views/marked-view.js";
import { renderReviewView } from "../src/views/review-view.js";
import { renderSessionView } from "../src/views/session-view.js";
import { renderUnits } from "../src/views/units-view.js";

const NOW = "2026-07-13T12:00:00.000Z";
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

  append(...nodes) {
    this.children.push(...nodes);
  }

  prepend(...nodes) {
    this.children.unshift(...nodes);
  }

  replaceChildren(...nodes) {
    this._text = "";
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class TestDocument {
  createElement(tagName) {
    return new TestNode(tagName, this);
  }

  createTextNode(text) {
    return new TestNode("#text", this, String(text));
  }
}

function test(name, callback) {
  tests.push({ name, callback });
}

function createViewTargets() {
  const documentRoot = new TestDocument();
  return {
    container: documentRoot.createElement("div"),
    summaryElement: documentRoot.createElement("p"),
  };
}

function findNode(root, predicate) {
  if (predicate(root)) {
    return root;
  }

  for (const child of root.children) {
    const match = findNode(child, predicate);
    if (match) {
      return match;
    }
  }

  return null;
}

function findNodes(root, predicate, matches = []) {
  if (predicate(root)) matches.push(root);
  root.children.forEach((child) => findNodes(child, predicate, matches));
  return matches;
}

async function loadBundledData() {
  const [courseConfig, vocabularyData] = await Promise.all([
    readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8"),
    readFile(new URL("../src/data/vocabulary.json", import.meta.url), "utf8"),
  ]);
  return {
    courseConfig: JSON.parse(courseConfig),
    vocabularyData: JSON.parse(vocabularyData),
  };
}

test("#/learn zeigt echte Scheduler-Zusammenfassung und Startaktion", async () => {
  const { courseConfig, vocabularyData } = await loadBundledData();
  const metrics = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState: createInitialLearningState(courseConfig.courseId, NOW),
    now: new Date(NOW),
  });
  const targets = createViewTargets();

  renderLearnView({
    ...targets,
    getUnitTitle: () => "Unit 4",
    metrics,
    sessionSnapshot: { session: null, error: null },
  });

  assert.match(targets.container.textContent, /Fällige Wiederholungen0/);
  assert.match(targets.container.textContent, /Neue Wörter6/);
  assert.match(targets.container.textContent, /Lernen starten/);
  assert.equal(
    findNode(targets.container, (node) => node.dataset.viewAction === "start-daily")?.tagName,
    "BUTTON",
  );
  const radios = findNodes(
    targets.container,
    (node) => node.tagName === "INPUT" && Object.hasOwn(node.dataset, "flashcardDirection"),
  );
  assert.equal(radios.length, 3);
  assert.equal(radios[0].checked, true);
  assert.deepEqual(radios.map((node) => node.value), [
    FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET,
    FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
    FLASHCARD_DIRECTIONS.MIXED,
  ]);
});

test("Review und Markierungen verwenden dieselbe native Richtungswahl", () => {
  const review = createViewTargets();
  renderReviewView({
    ...review,
    getUnitTitle: () => "Unit 4",
    reviewWords: [{ id: "word-1", source: "cloudy", targets: ["bewölkt"], unitId: "unit-4" }],
    sessionSnapshot: { session: null, error: null },
  });
  const marked = createViewTargets();
  renderMarkedView({
    ...marked,
    getUnitTitle: () => "Unit 4",
    markedWords: [{ id: "word-1", source: "cloudy", targets: ["bewölkt"], unitId: "unit-4" }],
    sessionSnapshot: { session: null, error: null },
  });

  for (const target of [review.container, marked.container]) {
    const radios = findNodes(
      target,
      (node) => node.tagName === "INPUT" && Object.hasOwn(node.dataset, "flashcardDirection"),
    );
    assert.equal(radios.length, 3);
    assert.equal(radios[0].checked, true);
  }
});

test("Unit-Übersicht macht verfügbare und aktuelle Units vollständig interaktiv", async () => {
  const { courseConfig, vocabularyData } = await loadBundledData();
  const documentRoot = new TestDocument();
  const list = documentRoot.createElement("ul");
  documentRoot.querySelector = (selector) => selector === "[data-units-list]" ? list : null;
  const data = {
    ...vocabularyData,
    units: [
      ...vocabularyData.units,
      { id: "unit-5", title: "Unit 5", order: 5, words: [{ id: "locked", source: "locked", targets: ["gesperrt"] }] },
    ],
  };

  renderUnits(documentRoot, courseConfig, data);
  const controls = findNodes(list, (node) => node.tagName === "BUTTON" && node.dataset.unitSelect);
  assert.deepEqual(controls.map((node) => node.dataset.unitSelect), ["neutral-unit-1", "neutral-unit-2"]);
  assert.equal(controls.find((node) => node.dataset.unitSelect === "neutral-unit-2")?.attributes.get("aria-pressed"), "true");
  assert.equal(controls.every((node) => node.type === "button"), true);
  assert.match(list.textContent, /Gesperrt/);
  assert.equal(controls.some((node) => node.dataset.unitSelect === "unit-1" || node.dataset.unitSelect === "unit-5"), false);
});

test("Unit-Wechsel nutzt den bestehenden Kurs-State und erhält den Lernstand", async () => {
  const { courseConfig, vocabularyData } = await loadBundledData();
  const learningState = createInitialLearningState(courseConfig.courseId, NOW);
  markWordCorrect(learningState, vocabularyData.units[1].words[0].id, NOW);
  const before = JSON.stringify(learningState);

  assert.equal(setCurrentUnitId(courseConfig, "neutral-unit-1"), "neutral-unit-1");
  const metrics = calculateDashboardMetrics({ courseConfig, vocabularyData, learningState, now: new Date(NOW) });
  assert.equal(metrics.currentUnitId, "neutral-unit-1");
  assert.equal(metrics.currentUnitTitle, "Grundwortschatz");
  assert.equal(JSON.stringify(learningState), before);
  assert.throws(() => setCurrentUnitId(courseConfig, "unit-9"), /nicht freigegeben/);
});

test("#/learn zeigt den verbindlichen Empty State", () => {
  const targets = createViewTargets();
  renderLearnView({
    ...targets,
    getUnitTitle: () => "Unit 4",
    metrics: {
      courseTitle: "Beispielkurs",
      currentUnitTitle: "Unit 4",
      todayWordCount: 0,
      estimatedMinutes: 1,
      learningSet: { reviewWords: [], difficultWords: [], newWords: [] },
    },
    sessionSnapshot: { session: null, error: null },
  });

  assert.match(targets.container.textContent, /Für heute ist nichts mehr offen\./);
  assert.match(targets.container.textContent, /Zum Dashboard/);
});

test("übergebene unsichere Wörter öffnen vor der Flashcard-Session die Richtungswahl", () => {
  const targets = createViewTargets();
  renderLearnView({
    ...targets,
    getUnitTitle: () => "Unit 4",
    metrics: {
      courseTitle: "Beispielkurs",
      currentUnitTitle: "Unit 4",
      todayWordCount: 0,
      estimatedMinutes: 1,
      learningSet: { reviewWords: [], difficultWords: [], newWords: [] },
    },
    practiceWords: [{ id: "word-1", source: "cloudy", targets: ["bewölkt"] }],
    sessionSnapshot: { session: null, error: null },
  });

  assert.match(targets.container.textContent, /Unsichere Wörter/);
  assert.equal(
    findNode(targets.container, (node) => node.dataset.viewAction === "start-practice")?.tagName,
    "BUTTON",
  );
  assert.equal(findNodes(
    targets.container,
    (node) => node.tagName === "INPUT" && Object.hasOwn(node.dataset, "flashcardDirection"),
  ).length, 3);
});

test("Lernkonfiguration zeigt 19 verfügbare Wörter und eine echte Alle-Auswahl", () => {
  const targets = createViewTargets();
  const allWords = Array.from({ length: 19 }, (_, index) => ({
    id: `word-${index + 1}`,
    source: `concept ${index + 1}`,
    targets: [`Begriff ${index + 1}`],
  }));
  renderLearnView({
    ...targets,
    getUnitTitle: () => "Unit 4",
    metrics: {
      courseTitle: "Beispielkurs",
      currentUnitTitle: "Unit 4",
      todayWordCount: 10,
      estimatedMinutes: 5,
      learningSet: { reviewWords: [], difficultWords: [], newWords: allWords.slice(0, 10), allWords: allWords.slice(0, 10) },
      availableLearningSet: { reviewWords: [], difficultWords: [], newWords: allWords, allWords },
    },
    sessionSnapshot: { session: null, error: null },
  });
  const amountRadios = findNodes(
    targets.container,
    (node) => node.tagName === "INPUT" && Object.hasOwn(node.dataset, "flashcardAmount"),
  );
  assert.deepEqual(amountRadios.map((node) => node.value), ["5", "10", "all"]);
  assert.equal(amountRadios.find((node) => node.value === "10")?.checked, true);
  assert.match(targets.summaryElement.textContent, /19 Wörter stehen zum Lernen bereit/);
  assert.match(targets.container.textContent, /Alle 19 Wörter/);
  assert.match(targets.container.textContent, /Du übst jetzt 10 von 19 Wörtern/);
});

test("#/review zeigt bei null fälligen Wörtern keinen Startbutton", () => {
  const targets = createViewTargets();
  renderReviewView({
    ...targets,
    getUnitTitle: () => "Unit 4",
    reviewWords: [],
    sessionSnapshot: { session: null, error: null },
  });

  assert.match(targets.container.textContent, /Aktuell ist keine Wiederholung fällig\./);
  assert.equal(
    findNode(targets.container, (node) => node.dataset.viewAction === "start-review"),
    null,
  );
});

test("#/marked listet Übersetzung und Unit oder zeigt Empty State", () => {
  const populated = createViewTargets();
  renderMarkedView({
    ...populated,
    getUnitTitle: () => "Unit 4",
    markedWords: [{
      id: "word-1",
      source: "thoughtful",
      targets: ["aufmerksam", "bedacht"],
      unitId: "unit-4",
    }],
    sessionSnapshot: { session: null, error: null },
  });
  assert.match(populated.container.textContent, /thoughtfulaufmerksam, bedachtUnit 4/);
  assert.match(populated.container.textContent, /Lernen starten/);
  assert.equal(
    findNode(populated.container, (node) => node.dataset.markedRemove === "word-1")?.tagName,
    "BUTTON",
  );

  const empty = createViewTargets();
  renderMarkedView({
    ...empty,
    getUnitTitle: () => "Unit 4",
    markedWords: [],
    sessionSnapshot: { session: null, error: null },
  });
  assert.match(empty.container.textContent, /Du hast noch keine Wörter gemerkt\./);
});

test("Flashcard hält die Lösung vor dem Aufdecken aus dem DOM", () => {
  const { container } = createViewTargets();
  const session = createSessionState({ mode: "daily", wordIds: ["word-1"] });
  const snapshot = {
    currentWord: {
      id: "word-1",
      source: "thoughtful",
      targets: ["aufmerksam"],
      unitId: "unit-4",
    },
    error: null,
    learningState: createInitialLearningState("session-course", NOW),
    session,
    transitioning: false,
  };
  const options = {
    getUnitTitle: () => "Unit 4",
    idPrefix: "test-session",
    modeLabel: "Heute lernen",
  };

  renderSessionView(container, snapshot, options);
  assert.match(container.textContent, /thoughtful/);
  assert.doesNotMatch(container.textContent, /aufmerksam/);
  assert.doesNotMatch(container.textContent, /Tastatur:|Leertaste|Pfeil links/);
  assert.equal(findNodes(container, (node) => node.className === "keyboard-hint").length, 0);
  assert.equal(findNode(container, (node) => node.tagName === "PROGRESS") !== null, true);
  assert.equal(
    findNode(container, (node) => node.dataset.sessionAction === "correct"),
    null,
  );

  revealSessionSolution(session);
  renderSessionView(container, snapshot, options);
  assert.match(container.textContent, /aufmerksam/);
  assert.doesNotMatch(container.textContent, /Tastatur:|Leertaste|Pfeil links/);
  assert.equal(findNodes(container, (node) => node.className === "keyboard-hint").length, 0);
  assert.equal(
    findNode(container, (node) => node.dataset.sessionAction === "wrong")?.tagName,
    "BUTTON",
  );
  assert.equal(
    findNode(container, (node) => node.dataset.sessionAction === "mark")
      ?.attributes.get("aria-pressed"),
    "false",
  );
  const markButton = findNode(container, (node) => node.dataset.sessionAction === "mark");
  assert.equal(markButton?.textContent, "Markieren");
  assert.match(markButton?.className ?? "", /button--outline/);

  snapshot.learningState.words["word-1"] = { wordId: "word-1", marked: true };
  renderSessionView(container, snapshot, options);
  const activeMarkButton = findNode(container, (node) => node.dataset.sessionAction === "mark");
  assert.equal(activeMarkButton?.textContent, "Markierung entfernen");
  assert.equal(activeMarkButton?.attributes.get("aria-pressed"), "true");
  assert.match(activeMarkButton?.className ?? "", /button--outline/);
});

test("Target → Source zeigt mehrere Targets vorne und Source erst nach dem Aufdecken", () => {
  const { container } = createViewTargets();
  const session = createSessionState({
    wordIds: ["word-1"],
    direction: FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
  });
  const snapshot = {
    currentWord: {
      id: "word-1",
      source: "cloudy",
      targets: ["bewölkt", "wolkig"],
      phonetic: "ˈklaʊdi",
      hint: "When the sky is covered with clouds.",
      unitId: "unit-4",
    },
    error: null,
    learningState: createInitialLearningState("session-course", NOW),
    session,
    transitioning: false,
  };
  const options = {
    getUnitTitle: () => "Unit 4",
    idPrefix: "target-session",
    modeLabel: "Heute lernen",
    languageCodes: { source: "en", target: "de" },
  };

  renderSessionView(container, snapshot, options);
  assert.match(container.textContent, /bewölkt \/ wolkig/);
  assert.match(container.textContent, /When the sky is covered with clouds\./);
  assert.doesNotMatch(container.textContent, /cloudy/);
  assert.doesNotMatch(container.textContent, /ˈklaʊdi/);

  revealSessionSolution(session);
  renderSessionView(container, snapshot, options);
  assert.match(container.textContent, /cloudy/);
  assert.match(container.textContent, /ˈklaʊdi/);
});

test("Dashboard-Kennzahlen werden nach einer gespeicherten Bewertung neu berechnet", async () => {
  const { courseConfig, vocabularyData } = await loadBundledData();
  const initialState = createInitialLearningState(courseConfig.courseId, NOW);
  const before = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState: initialState,
    now: new Date(NOW),
  });
  const controller = createSessionController({
    learningState: initialState,
    words: before.learningSet.allWords,
    now: () => NOW,
    save: () => true,
  });
  controller.startSession({
    mode: "daily",
    wordIds: before.learningSet.allWords.map((word) => word.id),
  });
  controller.showSolution();
  controller.answerCorrect();

  const after = calculateDashboardMetrics({
    courseConfig,
    vocabularyData,
    learningState: controller.getLearningState(),
    now: new Date(NOW),
  });
  assert.equal(after.newWordCount, before.newWordCount - 1);
  assert.equal(after.todayWordCount, before.todayWordCount - 1);
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

console.log(`\n${tests.length - failures}/${tests.length} View- und Integrations-Tests bestanden.`);

if (failures > 0) {
  process.exitCode = 1;
}
