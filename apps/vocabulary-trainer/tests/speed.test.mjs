import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createInitialLearningState, markWordCorrect } from "../src/core/learning-state.js";
import { getAvailableWords } from "../src/core/vocabulary.js";
import { createSpeedController } from "../src/speed/speed-controller.js";
import {
  createPairFromWord,
  createSpeedRound,
  normalizePairText,
  selectRoundWords,
  shuffleSpeedItems,
  SPEED_DIRECTIONS,
} from "../src/speed/speed-generator.js";
import {
  advanceSpeedRound,
  completeSpeedChallenge,
  createSpeedState,
  getNotableSpeedWordIds,
  getSpeedSummary,
  isSpeedRoundComplete,
  markSpeedWordScored,
  resetSpeedSelection,
  resolveSpeedSelection,
  selectSpeedItem,
  setSpeedPaused,
} from "../src/speed/speed-state.js";
import { createSpeedTimer } from "../src/speed/speed-timer.js";
import { calculateDashboardMetrics } from "../src/views/dashboard-view.js";
import { getSpeedShortcut, renderSpeedView } from "../src/views/speed-view.js";

const NOW = "2026-07-14T08:00:00.000Z";
const WORDS = [
  { id: "island", unitId: "unit-1", source: "island", targets: ["Insel"] },
  { id: "castle", unitId: "unit-1", source: "castle", targets: ["Burg", "Schloss"] },
  { id: "audience", unitId: "unit-1", source: "audience", targets: ["Publikum"] },
  { id: "direction", unitId: "unit-1", source: "direction", targets: ["Richtung"] },
  { id: "cloudy", unitId: "unit-1", source: "cloudy", targets: ["bewölkt", "wolkig"] },
  { id: "promise", unitId: "unit-1", source: "promise", targets: ["Versprechen"] },
  { id: "careful", unitId: "unit-2", source: "careful", targets: ["vorsichtig"] },
  { id: "bridge", unitId: "unit-2", source: "bridge", targets: ["Brücke"] },
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
    this.disabled = false;
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this._text = ""; this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class TestDocument {
  createElement(tagName) { return new TestNode(tagName, this); }
  createTextNode(text) { return new TestNode("#text", this, String(text)); }
}

function test(name, callback) { tests.push({ name, callback }); }
function constantRandom(value = 0) { return () => value; }
function sequenceRandom(values) {
  let index = 0;
  return () => values[index++ % values.length];
}
function createRound(overrides = {}) {
  return createSpeedRound(WORDS, {
    count: 4,
    direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    randomFn: constantRandom(0),
    round: 1,
    ...overrides,
  });
}
function createState(overrides = {}) {
  return createSpeedState({ round: createRound(), durationSeconds: 60, pairsPerRound: 4, ...overrides });
}
function selectPair(state, pair) {
  selectSpeedItem(state, "left", pair.leftId);
  selectSpeedItem(state, "right", pair.rightId);
  return resolveSpeedSelection(state, NOW);
}
function createController(overrides = {}) {
  const savedStates = [];
  const controller = createSpeedController({
    learningState: createInitialLearningState("speed-course", NOW),
    words: WORDS,
    now: () => NOW,
    randomFn: constantRandom(0),
    save: (state) => { savedStates.push(JSON.parse(JSON.stringify(state))); return true; },
    ...overrides,
  });
  return { controller, savedStates };
}
function startController(controller, overrides = {}) {
  return controller.startSpeed({
    words: WORDS.slice(0, 4),
    direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    durationSeconds: 60,
    pairsPerRound: 4,
    ...overrides,
  });
}
function findNodes(root, predicate, matches = []) {
  if (predicate(root)) matches.push(root);
  root.children.forEach((child) => findNodes(child, predicate, matches));
  return matches;
}
function createViewTargets() {
  const documentRoot = new TestDocument();
  return {
    container: documentRoot.createElement("div"),
    summaryElement: documentRoot.createElement("p"),
  };
}
function createSnapshot(speed, overrides = {}) {
  const notableIds = speed ? getNotableSpeedWordIds(speed) : [];
  return {
    speed,
    transitioning: false,
    error: null,
    feedback: null,
    summary: speed ? getSpeedSummary(speed) : null,
    notableWords: notableIds.map((id) => WORDS.find((word) => word.id === id)).filter(Boolean),
    ...overrides,
  };
}

test("Generator erzeugt vier eindeutige Paare", () => {
  const round = createRound();
  assert.equal(round.pairs.length, 4);
  assert.equal(new Set(round.pairs.map((pair) => pair.wordId)).size, 4);
});

test("linke und rechte Seite werden unabhängig und ohne Positionspaare angeordnet", () => {
  const round = createRound({ randomFn: sequenceRandom([0.1, 0.8, 0.3, 0.7]) });
  assert.equal(round.leftItems.length, round.rightItems.length);
  round.leftItems.forEach((item, index) => assert.notEqual(item.wordId, round.rightItems[index].wordId));
});

test("doppelte Wort-IDs erscheinen nur einmal", () => {
  const round = createSpeedRound([...WORDS.slice(0, 4), WORDS[0]], {
    count: 5, direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET, randomFn: constantRandom(0),
  });
  assert.equal(new Set(round.pairs.map((pair) => pair.wordId)).size, round.pairs.length);
});

test("uneindeutige sichtbare Zieltexte werden nicht gemeinsam verwendet", () => {
  const duplicateTarget = { id: "fortress", source: "fortress", targets: ["Burg"] };
  const round = createSpeedRound([...WORDS.slice(0, 4), duplicateTarget], {
    count: 5, direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET, randomFn: constantRandom(0),
  });
  const targets = round.pairs.map((pair) => normalizePairText(pair.rightText));
  assert.equal(new Set(targets).size, targets.length);
  assert.equal(round.pairs.some((pair) => pair.wordId === "castle")
    && round.pairs.some((pair) => pair.wordId === "fortress"), false);
});

test("mehrere Übersetzungen bilden eine gemeinsame sichtbare Option", () => {
  const pair = createPairFromWord(WORDS[1], SPEED_DIRECTIONS.SOURCE_TO_TARGET);
  assert.equal(pair.rightText, "Burg / Schloss");
});

test("beide konkreten Richtungen vertauschen die Seiten", () => {
  const forward = createPairFromWord(WORDS[0], SPEED_DIRECTIONS.SOURCE_TO_TARGET);
  const reverse = createPairFromWord(WORDS[0], SPEED_DIRECTIONS.TARGET_TO_SOURCE);
  assert.equal(forward.leftText, "island");
  assert.equal(reverse.leftText, "Insel");
  assert.equal(reverse.rightText, "island");
});

test("gemischte Richtung wird pro Runde injizierbar bestimmt", () => {
  const forward = createRound({ direction: SPEED_DIRECTIONS.MIXED, randomFn: constantRandom(0.1) });
  const reverse = createRound({ direction: SPEED_DIRECTIONS.MIXED, randomFn: constantRandom(0.9) });
  assert.equal(forward.direction, SPEED_DIRECTIONS.SOURCE_TO_TARGET);
  assert.equal(reverse.direction, SPEED_DIRECTIONS.TARGET_TO_SOURCE);
});

test("zu kleiner Datenbestand erzeugt keine vollständige Runde", () => {
  assert.equal(createSpeedRound(WORDS.slice(0, 3), {
    count: 4, direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET, randomFn: constantRandom(0),
  }).pairs.length, 3);
});

test("noch nicht verwendete Wörter werden bevorzugt", () => {
  const selected = selectRoundWords(WORDS, 4, WORDS.slice(0, 4).map((word) => word.id), constantRandom(0));
  assert.deepEqual(new Set(selected.map((word) => word.id)), new Set(WORDS.slice(4).map((word) => word.id)));
});

test("Fisher-Yates-Mischung ist reproduzierbar und verändert das Original nicht", () => {
  const input = [1, 2, 3, 4];
  const first = shuffleSpeedItems(input, constantRandom(0.2));
  const second = shuffleSpeedItems(input, constantRandom(0.2));
  assert.deepEqual(first, second);
  assert.deepEqual(input, [1, 2, 3, 4]);
});

test("Speed State initialisiert Runde, Timer und Zähler", () => {
  const state = createState();
  assert.equal(state.mode, "speed");
  assert.equal(state.timeRemainingMs, 60000);
  assert.equal(state.currentRound, 1);
  assert.equal(state.correctMatches, 0);
});

test("linke Auswahl wird semantisch gespeichert", () => {
  const state = createState();
  const pair = state.activePairs[0];
  const result = selectSpeedItem(state, "left", pair.leftId);
  assert.equal(result.ready, false);
  assert.equal(state.selectedLeftId, pair.leftId);
});

test("rechte Auswahl darf zuerst erfolgen", () => {
  const state = createState();
  const pair = state.activePairs[0];
  assert.equal(selectSpeedItem(state, "right", pair.rightId).ready, false);
  assert.equal(selectSpeedItem(state, "left", pair.leftId).isCorrect, true);
});

test("richtige Zuordnung erhöht Treffer und Versuche", () => {
  const state = createState();
  const result = selectPair(state, state.activePairs[0]);
  assert.equal(result.isCorrect, true);
  assert.equal(state.correctMatches, 1);
  assert.equal(state.totalAttempts, 1);
});

test("falsche Zuordnung protokolliert beide Wort-IDs", () => {
  const state = createState();
  selectSpeedItem(state, "left", state.activePairs[0].leftId);
  selectSpeedItem(state, "right", state.activePairs[1].rightId);
  const result = resolveSpeedSelection(state, NOW);
  assert.equal(result.isCorrect, false);
  assert.equal(state.incorrectAttempts[0].leftWordId, state.activePairs[0].wordId);
  assert.equal(state.incorrectAttempts[0].rightWordId, state.activePairs[1].wordId);
});

test("Auswahl lässt sich ohne Versuch zurücksetzen", () => {
  const state = createState();
  selectSpeedItem(state, "left", state.activePairs[0].leftId);
  assert.equal(resetSpeedSelection(state), true);
  assert.equal(state.totalAttempts, 0);
});

test("gelöstes Paar ist markiert und nicht erneut auswählbar", () => {
  const state = createState();
  const pair = state.activePairs[0];
  selectPair(state, pair);
  assert.equal(pair.matched, true);
  assert.equal(selectSpeedItem(state, "left", pair.leftId).ok, false);
});

test("vollständig gelöste Runde kann durch eine neue ersetzt werden", () => {
  const state = createState();
  state.activePairs.forEach((pair) => selectPair(state, pair));
  assert.equal(isSpeedRoundComplete(state), true);
  assert.equal(advanceSpeedRound(state, createRound({ round: 2 })), true);
  assert.equal(state.currentRound, 2);
  assert.equal(state.completedRounds, 1);
});

test("Wörter aus zwei Fehlversuchen gelten als auffällig", () => {
  const state = createState();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    selectSpeedItem(state, "left", state.activePairs[0].leftId);
    selectSpeedItem(state, "right", state.activePairs[1].rightId);
    resolveSpeedSelection(state, NOW);
  }
  assert.deepEqual(new Set(getNotableSpeedWordIds(state)), new Set([
    state.activePairs[0].wordId,
    state.activePairs[1].wordId,
  ]));
});

test("Abschluss berechnet Trefferquote und räumt Auswahl auf", () => {
  const state = createState();
  selectPair(state, state.activePairs[0]);
  selectSpeedItem(state, "left", state.activePairs[1].leftId);
  assert.equal(completeSpeedChallenge(state, "manual"), true);
  assert.equal(state.completed, true);
  assert.equal(state.selectedLeftId, null);
  assert.equal(getSpeedSummary(state).hitRate, 100);
});

test("dasselbe Wort wird nur einmal als dauerhaft bewertet markiert", () => {
  const state = createState();
  assert.equal(markSpeedWordScored(state, "island"), true);
  assert.equal(markSpeedWordScored(state, "island"), false);
  assert.deepEqual(state.scoredWordIds, ["island"]);
});

test("Pause blockiert Auswahl und lässt sich fortsetzen", () => {
  const state = createState();
  assert.equal(setSpeedPaused(state, true), true);
  assert.equal(selectSpeedItem(state, "left", state.activePairs[0].leftId).ok, false);
  assert.equal(setSpeedPaused(state, false), true);
});

function createFakeTimer(durationMs = 1000) {
  let now = 0;
  let callback = null;
  let clears = 0;
  let expired = 0;
  const timer = createSpeedTimer({
    durationMs,
    nowFn: () => now,
    setIntervalFn: (fn) => { callback = fn; return 1; },
    clearIntervalFn: () => { clears += 1; callback = null; },
    onExpire: () => { expired += 1; },
  });
  return {
    timer,
    setNow(value) { now = value; },
    tick() { timer.tick(); },
    get expired() { return expired; },
    get clears() { return clears; },
  };
}

test("Timer startet mit gespeichertem Zielzeitpunkt", () => {
  const fake = createFakeTimer();
  assert.equal(fake.timer.start(), true);
  assert.equal(fake.timer.getEndsAt(), 1000);
  assert.equal(fake.timer.getRemainingMs(), 1000);
});

test("Timer berechnet Restzeit aus der aktuellen Uhr", () => {
  const fake = createFakeTimer();
  fake.timer.start();
  fake.setNow(400);
  assert.equal(fake.timer.getRemainingMs(), 600);
});

test("Timer läuft nach einem Zeitsprung zuverlässig ab", () => {
  const fake = createFakeTimer();
  fake.timer.start();
  fake.setNow(1400);
  fake.tick();
  assert.equal(fake.timer.isExpired(), true);
  assert.equal(fake.expired, 1);
});

test("Timer pausiert mit verbleibender Zeit", () => {
  const fake = createFakeTimer();
  fake.timer.start();
  fake.setNow(250);
  assert.equal(fake.timer.pause(), true);
  assert.equal(fake.timer.getRemainingMs(), 750);
});

test("Fortsetzen erzeugt aus der Restzeit ein neues Ziel", () => {
  const fake = createFakeTimer();
  fake.timer.start();
  fake.setNow(250);
  fake.timer.pause();
  fake.setNow(1000);
  assert.equal(fake.timer.resume(), true);
  assert.equal(fake.timer.getEndsAt(), 1750);
});

test("Stoppen räumt das Intervall auf", () => {
  const fake = createFakeTimer();
  fake.timer.start();
  assert.equal(fake.timer.stop(), true);
  assert.equal(fake.timer.isRunning(), false);
  assert.ok(fake.clears >= 1);
});

test("Timer kann nicht doppelt gestartet oder pausiert werden", () => {
  const fake = createFakeTimer();
  assert.equal(fake.timer.start(), true);
  assert.equal(fake.timer.start(), false);
  assert.equal(fake.timer.pause(), true);
  assert.equal(fake.timer.pause(), false);
});

test("erste korrekte Zuordnung verwendet markWordCorrect und speichert", () => {
  let correctCalls = 0;
  const { controller, savedStates } = createController({
    markCorrect(state, wordId, now, options) { correctCalls += 1; return markWordCorrect(state, wordId, now, options); },
  });
  startController(controller);
  const pair = controller.getSnapshot().speed.activePairs[0];
  controller.chooseItem("left", pair.leftId);
  const result = controller.chooseItem("right", pair.rightId);
  assert.equal(result.attempt.isCorrect, true);
  assert.equal(correctCalls, 1);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].words[result.attempt.wordId].activeCorrectCount, 0);
});

test("erneute Zuordnung desselben Wortes bewertet nicht doppelt", () => {
  let correctCalls = 0;
  const { controller } = createController({
    markCorrect(state, wordId, now, options) { correctCalls += 1; return markWordCorrect(state, wordId, now, options); },
  });
  startController(controller);
  controller.getSnapshot().speed.activePairs.forEach((pair) => {
    controller.chooseItem("left", pair.leftId);
    controller.chooseItem("right", pair.rightId);
  });
  const repeatedPair = controller.getSnapshot().speed.activePairs[0];
  controller.chooseItem("left", repeatedPair.leftId);
  controller.chooseItem("right", repeatedPair.rightId);
  assert.equal(correctCalls, 4);
});

test("Fehlversuch verändert keinen Wrong-Zähler und speichert nicht", () => {
  const { controller, savedStates } = createController();
  startController(controller);
  const [first, second] = controller.getSnapshot().speed.activePairs;
  controller.chooseItem("left", first.leftId);
  controller.chooseItem("right", second.rightId);
  assert.equal(savedStates.length, 0);
  assert.equal(controller.getLearningState().words[first.wordId], undefined);
});

test("Speicherfehler lässt das Paar ungelöst", () => {
  const { controller } = createController({ save: () => false });
  startController(controller);
  const pair = controller.getSnapshot().speed.activePairs[0];
  controller.chooseItem("left", pair.leftId);
  const result = controller.chooseItem("right", pair.rightId);
  assert.equal(result.reason, "storage");
  assert.equal(controller.getSnapshot().speed.activePairs[0].matched, false);
});

test("Dashboard wird nach korrekter Speed-Zuordnung neu berechnet", async () => {
  const [courseRaw, vocabularyRaw] = await Promise.all([
    readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8"),
    readFile(new URL("../src/data/vocabulary.json", import.meta.url), "utf8"),
  ]);
  const courseConfig = JSON.parse(courseRaw);
  const vocabularyData = JSON.parse(vocabularyRaw);
  const state = createInitialLearningState(courseConfig.courseId, NOW);
  const before = calculateDashboardMetrics({ courseConfig, vocabularyData, learningState: state, now: new Date(NOW) });
  const availableWords = getAvailableWords(vocabularyData, courseConfig);
  const controller = createSpeedController({
    learningState: state,
    words: availableWords,
    now: () => NOW,
    randomFn: constantRandom(0),
    save: () => true,
  });
  controller.startSpeed({
    words: availableWords.filter((word) => word.unitId === before.currentUnitId),
    direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    durationSeconds: 30,
    pairsPerRound: 4,
  });
  const pair = controller.getSnapshot().speed.activePairs[0];
  controller.chooseItem("left", pair.leftId);
  controller.chooseItem("right", pair.rightId);
  const after = calculateDashboardMetrics({
    courseConfig, vocabularyData, learningState: controller.getLearningState(), now: new Date(NOW),
  });
  assert.equal(after.newWordCount, before.newWordCount - 1);
});

test("Konfigurationsansicht zeigt Quellen, Richtungen, Dauer und Rundengröße", () => {
  const targets = createViewTargets();
  renderSpeedView({
    ...targets,
    snapshot: { speed: null, error: null },
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS, eligibleCount: 8 }],
  });
  assert.match(targets.container.textContent, /Speed Challenge zusammenstellen/);
  assert.match(targets.container.textContent, /Gemischt pro Runde/);
  assert.match(targets.container.textContent, /90 Sekunden/);
  assert.match(targets.container.textContent, /8 Paare/);
});

test("Konfiguration zeigt bei weniger als vier Wörtern einen Empty State", () => {
  const targets = createViewTargets();
  renderSpeedView({ ...targets, snapshot: { speed: null }, sourceOptions: [] });
  assert.match(targets.container.textContent, /mindestens vier Wörter benötigt/);
  assert.match(targets.container.textContent, /Zum Dashboard/);
});

test("Challenge verwendet native Buttons mit aria-pressed in zwei Spalten", () => {
  const targets = createViewTargets();
  const speed = createState();
  renderSpeedView({
    ...targets,
    snapshot: createSnapshot(speed),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: WORDS, eligibleCount: 8 }],
  });
  const pairButtons = findNodes(targets.container, (node) => node.dataset.speedPairButton !== undefined);
  assert.equal(pairButtons.length, 8);
  assert.ok(pairButtons.every((button) => button.tagName === "BUTTON"));
  assert.ok(pairButtons.every((button) => button.attributes.has("aria-pressed")));
  assert.match(targets.container.textContent, /Linke Begriffe/);
  assert.match(targets.container.textContent, /Rechte Begriffe/);
  assert.doesNotMatch(targets.container.textContent, /Tastatur:|Escape hebt|P pausiert/);
  assert.equal(findNodes(targets.container, (node) => node.className === "keyboard-hint").length, 0);
});

test("ausgewählter Begriff wird in der View zusätzlich semantisch markiert", () => {
  const targets = createViewTargets();
  const speed = createState();
  selectSpeedItem(speed, "right", speed.activePairs[0].rightId);
  renderSpeedView({ ...targets, snapshot: createSnapshot(speed), sourceOptions: [] });
  const selected = findNodes(targets.container, (node) => node.attributes.get("aria-pressed") === "true");
  assert.equal(selected.length, 1);
});

test("falsche Zuordnung erhält eine ruhige Textmeldung", () => {
  const targets = createViewTargets();
  const speed = createState();
  renderSpeedView({
    ...targets,
    snapshot: createSnapshot(speed, { feedback: "Diese beiden gehören nicht zusammen. Versuche eine andere Kombination." }),
    sourceOptions: [],
  });
  assert.match(targets.container.textContent, /gehören nicht zusammen/);
});

test("Timer ist groß lesbar und wird nicht sekündlich live angekündigt", () => {
  const targets = createViewTargets();
  renderSpeedView({ ...targets, snapshot: createSnapshot(createState()), sourceOptions: [] });
  assert.match(targets.container.textContent, /1:00/);
  assert.match(targets.container.textContent, /Warnung folgt bei zehn Sekunden/);
});

test("Pausenzustand verdeckt Begriffe und bietet Fortsetzen", () => {
  const targets = createViewTargets();
  const speed = createState();
  setSpeedPaused(speed, true);
  renderSpeedView({ ...targets, snapshot: createSnapshot(speed), sourceOptions: [] });
  assert.match(targets.container.textContent, /Pausiert/);
  assert.match(targets.container.textContent, /Fortsetzen/);
  const pairButtons = findNodes(targets.container, (node) => node.dataset.speedPairButton !== undefined);
  assert.ok(pairButtons.every((button) => button.disabled));
});

test("aktive Ansicht enthält einen semantischen Abbruchdialog", () => {
  const targets = createViewTargets();
  renderSpeedView({ ...targets, snapshot: createSnapshot(createState()), sourceOptions: [] });
  const dialogs = findNodes(targets.container, (node) => node.tagName === "DIALOG");
  assert.equal(dialogs.length, 1);
  assert.match(targets.container.textContent, /Weiter üben/);
  assert.match(targets.container.textContent, /Challenge beenden/);
});

test("Tastatur steuert Pfeile, Auswahl-Aufheben, Pause und Abbruch", () => {
  const speed = createState();
  const snapshot = { speed, transitioning: false };
  const event = (key, target = { tagName: "BODY" }) => ({ key, target });
  assert.equal(getSpeedShortcut(event("ArrowDown"), snapshot), "focus-down");
  assert.equal(getSpeedShortcut(event("p"), snapshot), "pause");
  assert.equal(getSpeedShortcut(event("Escape"), snapshot), "exit");
  selectSpeedItem(speed, "left", speed.activePairs[0].leftId);
  assert.equal(getSpeedShortcut(event("Escape"), snapshot), "clear-selection");
});

test("Shortcuts bleiben in Textfeldern und offenen Dialogen aus", () => {
  const snapshot = { speed: createState(), transitioning: false };
  assert.equal(getSpeedShortcut({ key: "p", target: { tagName: "INPUT" } }, snapshot), null);
  assert.equal(getSpeedShortcut({ key: "p", target: { tagName: "BODY" } }, snapshot, true), null);
});

test("Abschluss zeigt Kennzahlen und auffällige Wörter mit Flashcard-Aktion", () => {
  const targets = createViewTargets();
  const speed = createState();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    selectSpeedItem(speed, "left", speed.activePairs[0].leftId);
    selectSpeedItem(speed, "right", speed.activePairs[1].rightId);
    resolveSpeedSelection(speed, NOW);
  }
  completeSpeedChallenge(speed, "time");
  renderSpeedView({ ...targets, snapshot: createSnapshot(speed), sourceOptions: [] });
  assert.match(targets.container.textContent, /Speed Challenge beendet/);
  assert.match(targets.container.textContent, /Trefferquote0 %/);
  assert.match(targets.container.textContent, /Auffällige Wörter mit Karteikarten üben/);
  assert.doesNotMatch(targets.container.textContent, /Tastatur:/);
});

test("Abschluss ohne auffällige Wörter blendet Flashcard-Aktion aus", () => {
  const targets = createViewTargets();
  const speed = createState();
  completeSpeedChallenge(speed, "manual");
  renderSpeedView({ ...targets, snapshot: createSnapshot(speed), sourceOptions: [] });
  assert.match(targets.container.textContent, /keine Wörter mehrfach falsch zugeordnet/);
  assert.doesNotMatch(targets.container.textContent, /Auffällige Wörter mit Karteikarten üben/);
});

test("Route und Dashboard-Schnellzugriff sind im App-Shell-HTML vorhanden", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(html, /data-route-view="\/speed"/);
  assert.match(html, /href="#\/speed"/);
  assert.match(html, /data-speed-live aria-live="polite"/);
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

console.log(`\n${tests.length - failures}/${tests.length} Speed-Challenge-Tests bestanden.`);
if (failures > 0) process.exitCode = 1;
