import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createInitialLearningState } from "../src/core/learning-state.js";
import { createCourseStorageKey } from "../src/core/storage.js";
import {
  getLevelFromXp,
  getLevelProgress,
  getTotalXpRequiredForLevel,
} from "../src/motivation/level-system.js";
import { resolveMotivationConfig } from "../src/motivation/motivation-config.js";
import {
  createMotivationSessionId,
  createSessionCompletionEvent,
  createWordPracticeEvent,
  normalizeMotivationEvent,
  toLocalDateKey,
} from "../src/motivation/motivation-events.js";
import { createMotivationService } from "../src/motivation/motivation-service.js";
import {
  createInitialMotivationState,
  migrateMotivationState,
  validateMotivationState,
} from "../src/motivation/motivation-state.js";
import {
  getMotivationStorageKey,
  loadMotivationState,
  saveMotivationState,
} from "../src/motivation/motivation-storage.js";
import {
  applyQualifiedLearningDay,
  calculateStreaks,
} from "../src/motivation/streak-system.js";
import {
  calculateAcademicProgress,
  renderProgressView,
} from "../src/views/progress-view.js";

const tests = [];
const COURSE_ID = "motivation-course";
const NOW = new Date(2026, 6, 14, 12, 0, 0);

function test(name, callback) {
  tests.push({ name, callback });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.failWrites = false;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error("write failed");
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

class TestNode {
  constructor(tagName, ownerDocument, text = "") {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.checked = false;
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
}

function createService(options = {}) {
  let currentNow = options.now ?? NOW;
  let savedState = null;
  const config = options.config ?? resolveMotivationConfig({});
  const service = createMotivationService({
    config,
    state: options.state ?? createInitialMotivationState(COURSE_ID, {
      enabled: options.enabled !== false,
      now: currentNow,
    }),
    now: () => currentNow,
    save(candidate) {
      if (options.failSave) return false;
      savedState = clone(candidate);
      return true;
    },
  });
  return {
    service,
    getSavedState: () => savedState,
    setNow(value) {
      currentNow = value;
    },
  };
}

function wordEvent({
  id,
  sessionId = "session-1",
  mode = "quiz",
  wordId = "word-1",
  outcome = "correct",
  date = NOW,
}) {
  return createWordPracticeEvent({
    eventId: id ?? `${sessionId}:${mode}:${wordId}:${outcome}`,
    sessionId,
    mode,
    wordId,
    outcome,
    occurredAt: date,
  });
}

function completionEvent({
  id,
  sessionId = "session-1",
  mode = "quiz",
  status = "completed",
  wordIds = ["word-1"],
  correctCount = 1,
  totalCount = 1,
  date = NOW,
}) {
  return createSessionCompletionEvent({
    eventId: id ?? `${sessionId}:completion`,
    sessionId,
    mode,
    status,
    practicedWordIds: wordIds,
    correctCount,
    totalCount,
    occurredAt: date,
  });
}

test("Motivationskonfiguration nutzt sichere Standardwerte", () => {
  const config = resolveMotivationConfig({ motivation: { enabled: "yes", xp: { quizCorrect: -2 } } });
  assert.equal(config.enabled, true);
  assert.equal(config.xp.quizCorrect, 2);
  assert.equal(config.xp.writeCorrect, 3);
  assert.equal(config.recentHistoryDays, 30);
});

test("Levelschwellen folgen der vereinbarten Dreieckskurve", () => {
  assert.deepEqual([1, 2, 3, 4].map(getTotalXpRequiredForLevel), [0, 50, 150, 300]);
  assert.equal(getLevelFromXp(49), 1);
  assert.equal(getLevelFromXp(50), 2);
  assert.equal(getLevelFromXp(149), 2);
  assert.equal(getLevelFromXp(300), 4);
  assert.equal(getLevelFromXp(5_000_000) > 100, true);
});

test("Levelfortschritt liefert XP innerhalb des aktuellen Levels", () => {
  const progress = getLevelProgress(75);
  assert.deepEqual({
    level: progress.level,
    totalXp: progress.totalXp,
    levelStartXp: progress.levelStartXp,
    nextLevelXp: progress.nextLevelXp,
    earnedInLevel: progress.earnedInLevel,
    requiredInLevel: progress.requiredInLevel,
    remainingXp: progress.remainingXp,
    percentage: progress.percentage,
  }, {
    level: 2,
    totalXp: 75,
    levelStartXp: 50,
    nextLevelXp: 150,
    earnedInLevel: 25,
    requiredInLevel: 100,
    remainingXp: 75,
    percentage: 25,
  });
  assert.equal(progress.currentLevelStartXp, 50);
  assert.equal(progress.xpWithinLevel, 25);
  assert.equal(progress.xpNeededForNextLevel, 100);
  assert.equal(progress.progressPercent, 25);
  assert.equal(getLevelFromXp(-10), 1);
  assert.equal(getLevelFromXp("ungültig"), 1);
});

test("lokaler Datumsschlüssel verwendet lokale Kalenderfelder", () => {
  const localDate = new Date(2026, 6, 14, 0, 30, 0);
  assert.equal(toLocalDateKey(localDate), "2026-07-14");
  assert.throws(() => toLocalDateKey("kein Datum"), /ungültig/);
});

test("Session-ID nutzt die injizierte UUID-Funktion", () => {
  assert.equal(createMotivationSessionId(() => "stable-session-id"), "stable-session-id");
});

test("Events werden normiert und ungültige Pflichtfelder abgelehnt", () => {
  const event = wordEvent({ id: "event-1" });
  assert.equal(event.type, "word-practice");
  assert.equal(event.occurredAt, NOW.toISOString());
  assert.throws(
    () => normalizeMotivationEvent({ ...event, mode: "unknown" }),
    /Unbekannter Lernmodus/,
  );
  assert.throws(
    () => createWordPracticeEvent({ ...event, eventId: "", type: undefined }),
    /eventId/,
  );
  assert.throws(
    () => normalizeMotivationEvent({ type: "word-practice" }),
    /eventId/,
  );
});

test("Initialzustand ist versioniert, aktiviert und Level 1", () => {
  const state = createInitialMotivationState(COURSE_ID, { now: NOW });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.enabled, true);
  assert.equal(state.totalXp, 0);
  assert.equal(state.currentLevel, 1);
  assert.equal(validateMotivationState(state, COURSE_ID), state);
});

test("Flashcards vergeben einmal täglich einen XP unabhängig vom Ergebnis", () => {
  const { service } = createService();
  assert.equal(service.recordWordPractice(wordEvent({ id: "f-1", mode: "flashcards", outcome: "wrong" })).awardedXp, 1);
  assert.equal(service.recordWordPractice(wordEvent({ id: "f-2", mode: "flashcards", outcome: "correct" })).awardedXp, 0);
  assert.equal(service.getProgressSummary().totalXp, 1);
});

test("objektive Modi vergeben XP ausschließlich für richtige Ergebnisse", () => {
  const { service } = createService();
  service.recordWordPractice(wordEvent({ id: "q-wrong", mode: "quiz", wordId: "q-wrong", outcome: "wrong" }));
  service.recordWordPractice(wordEvent({ id: "q-right", mode: "quiz", wordId: "q-right" }));
  service.recordWordPractice(wordEvent({ id: "w-right", mode: "write", wordId: "w-right" }));
  service.recordWordPractice(wordEvent({ id: "s-right", mode: "speed", wordId: "s-right" }));
  assert.equal(service.getProgressSummary().totalXp, 7);
});

test("falsches objektives Ergebnis verbraucht die spätere Tages-XP nicht", () => {
  const { service } = createService();
  assert.equal(service.recordWordPractice(wordEvent({
    id: "wrong-first",
    wordId: "same-word",
    outcome: "wrong",
  })).awardedXp, 0);
  assert.equal(service.recordWordPractice(wordEvent({
    id: "right-later",
    sessionId: "session-2",
    wordId: "same-word",
    outcome: "correct",
  })).awardedXp, 2);
});

test("dasselbe Wort darf am selben Tag in verschiedenen Modi XP erhalten", () => {
  const { service } = createService();
  assert.equal(service.recordWordPractice(wordEvent({ id: "q", mode: "quiz" })).awardedXp, 2);
  assert.equal(service.recordWordPractice(wordEvent({ id: "w", mode: "write" })).awardedXp, 3);
  assert.equal(service.getProgressSummary().practicedWordCount, 1);
});

test("doppelte Event-ID wird vollständig idempotent behandelt", () => {
  const { service } = createService();
  const event = wordEvent({ id: "same-event" });
  assert.equal(service.recordWordPractice(event).awardedXp, 2);
  const duplicate = service.recordWordPractice(event);
  assert.equal(duplicate.duplicate, true);
  assert.equal(service.getProgressSummary().totalXp, 2);
});

test("Tagesbonus wird unabhängig vom Lernmodus nur einmal pro Kalendertag vergeben", () => {
  const { service } = createService();
  assert.equal(service.recordSessionCompletion(completionEvent({ sessionId: "one" })).awardedXp, 5);
  assert.equal(service.recordSessionCompletion(completionEvent({ sessionId: "two", mode: "write" })).awardedXp, 0);
  assert.equal(service.getProgressSummary().completedSessions, 2);
});

test("derselbe Sessionabschluss wird auch mit anderer Event-ID nicht doppelt gezählt", () => {
  const { service } = createService();
  service.recordSessionCompletion(completionEvent({ sessionId: "one", id: "one-a" }));
  const duplicate = service.recordSessionCompletion(completionEvent({ sessionId: "one", id: "one-b" }));
  assert.equal(duplicate.duplicate, true);
  assert.equal(service.getProgressSummary().completedSessions, 1);
});

test("abgebrochene und leere Sessions erzeugen weder XP noch Lerntag", () => {
  const { service } = createService();
  service.recordSessionCompletion(completionEvent({
    id: "aborted",
    status: "aborted",
    wordIds: ["word-1"],
  }));
  service.recordSessionCompletion(completionEvent({
    id: "empty",
    sessionId: "empty",
    wordIds: [],
    correctCount: 0,
    totalCount: 0,
  }));
  const summary = service.getProgressSummary();
  assert.equal(summary.totalXp, 0);
  assert.equal(summary.learningDayCount, 0);
  assert.equal(summary.completedSessions, 0);
});

test("Lernserie entsteht ausschließlich aus verschiedenen Abschlusstagen", () => {
  const first = new Date(2026, 6, 12, 12);
  const second = new Date(2026, 6, 13, 12);
  const third = new Date(2026, 6, 14, 12);
  const context = createService({ now: third });
  context.service.recordSessionCompletion(completionEvent({ sessionId: "day-1", date: first }));
  context.service.recordSessionCompletion(completionEvent({ sessionId: "day-2", date: second }));
  context.service.recordSessionCompletion(completionEvent({ sessionId: "day-3", date: third }));
  const summary = context.service.getProgressSummary(third);
  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.longestStreak, 3);
  assert.equal(summary.learningDayCount, 3);
});

test("unterbrochene Serie liefert neutral null aktuell und behält die längste", () => {
  const result = calculateStreaks(
    ["2026-07-10", "2026-07-11"],
    "2026-07-14",
  );
  assert.deepEqual(result, { currentStreak: 0, longestStreak: 2 });
});

test("qualifizierende Lerntage sind am selben Tag idempotent und folgen lokalen Kalendergrenzen", () => {
  const initial = { currentStreak: 0, longestStreak: 0, lastQualifiedLocalDate: null };
  const leapDay = applyQualifiedLearningDay(initial, "2028-02-29", new Date("2028-02-29T12:00:00Z"));
  assert.equal(leapDay.currentStreak, 1);
  assert.equal(applyQualifiedLearningDay(leapDay, "2028-02-29", new Date("2028-02-29T18:00:00Z")).currentStreak, 1);
  const march = applyQualifiedLearningDay(leapDay, "2028-03-01", new Date("2028-03-01T12:00:00Z"));
  assert.equal(march.currentStreak, 2);
  const nextYear = applyQualifiedLearningDay(march, "2029-01-01", new Date("2029-01-01T12:00:00Z"));
  assert.equal(nextYear.currentStreak, 1);
  assert.equal(nextYear.longestStreak, 2);
});

test("erste Session, drei Lerntage und perfekte objektive Session schalten Meilensteine frei", () => {
  const context = createService({ now: new Date(2026, 6, 14, 12) });
  [12, 13, 14].forEach((day, index) => {
    context.service.recordSessionCompletion(completionEvent({
      sessionId: `day-${day}`,
      id: `complete-${day}`,
      date: new Date(2026, 6, day, 12),
      mode: index === 0 ? "write" : "quiz",
    }));
  });
  const milestoneIds = context.service.getState().unlockedMilestoneIds;
  assert.equal(milestoneIds.includes("first-session"), true);
  assert.equal(milestoneIds.includes("three-learning-days"), true);
  assert.equal(milestoneIds.includes("first-perfect-objective-session"), true);
  assert.equal(new Set(milestoneIds).size, milestoneIds.length);
});

test("Wort-Meilensteine verwenden verschiedene Wort-IDs", () => {
  const { service } = createService();
  for (let index = 1; index <= 10; index += 1) {
    service.recordWordPractice(wordEvent({
      id: `word-event-${index}`,
      wordId: `word-${index}`,
      outcome: "wrong",
    }));
  }
  assert.equal(service.getState().unlockedMilestoneIds.includes("ten-words-practiced"), true);
});

test("Levelsprünge werden gesammelt und erst beim Konsum entfernt", () => {
  const config = resolveMotivationConfig({
    motivation: { xp: { flashcardsWord: 350 } },
  });
  const { service } = createService({ config });
  service.recordWordPractice(wordEvent({ id: "large", mode: "flashcards" }));
  assert.equal(service.getProgressSummary().level, 4);
  const notices = service.consumePendingNotifications();
  assert.deepEqual(
    notices.map(({ fromLevel, toLevel }) => ({ fromLevel, toLevel })),
    [{ fromLevel: 1, toLevel: 4 }],
  );
  assert.deepEqual(service.consumePendingNotifications(), []);
});

test("deaktivierte Motivation ignoriert Events und setzt später den Stand fort", () => {
  const { service } = createService();
  service.recordWordPractice(wordEvent({ id: "before" }));
  service.setEnabled(false);
  const ignored = service.recordWordPractice(wordEvent({ id: "ignored", wordId: "word-2" }));
  assert.equal(ignored.disabled, true);
  assert.equal(service.getProgressSummary().totalXp, 2);
  service.setEnabled(true);
  service.recordWordPractice(wordEvent({ id: "after", wordId: "word-2" }));
  assert.equal(service.getProgressSummary().totalXp, 4);
});

test("Speicherfehler verändert den in-memory Motivationsstand nicht", () => {
  const { service } = createService({ failSave: true });
  const result = service.recordWordPractice(wordEvent({ id: "cannot-save" }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage");
  assert.equal(service.getProgressSummary().totalXp, 0);
});

test("Motivationsstorage ist kursbezogen und getrennt vom Learning State", () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const learningKey = createCourseStorageKey(COURSE_ID, "learning-state");
  const learningState = createInitialLearningState(COURSE_ID, NOW);
  storage.setItem(learningKey, JSON.stringify(learningState));
  const state = createInitialMotivationState(COURSE_ID, { now: NOW });
  assert.equal(saveMotivationState(state), true);
  assert.notEqual(getMotivationStorageKey(COURSE_ID), learningKey);
  assert.deepEqual(loadMotivationState(COURSE_ID), state);
  assert.deepEqual(JSON.parse(storage.getItem(learningKey)), learningState);
});

test("Motivationsmigration erhält XP, Level und historische Lerntage", () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const legacy = createInitialMotivationState(COURSE_ID, { now: NOW });
  legacy.schemaVersion = 1;
  legacy.totalXp = 75;
  legacy.currentLevel = 2;
  legacy.learningDays = ["2026-07-13", "2026-07-14"];
  legacy.currentStreak = 2;
  legacy.longestStreak = 2;
  legacy.awardedDailySessionKeys = ["2026-07-14|quiz"];
  delete legacy.lastQualifiedLocalDate;
  delete legacy.lastQualifiedTimestamp;
  delete legacy.totalActiveDays;
  delete legacy.awardedDailyBonusDateKeys;
  storage.setItem(getMotivationStorageKey(COURSE_ID), JSON.stringify(legacy));
  const migrated = loadMotivationState(COURSE_ID, { now: NOW });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.totalXp, 75);
  assert.equal(migrated.currentLevel, 2);
  assert.equal(migrated.lastQualifiedLocalDate, "2026-07-14");
  assert.equal(migrated.totalActiveDays, 2);
  assert.deepEqual(migrated.awardedDailyBonusDateKeys, ["2026-07-14"]);
  const repeated = loadMotivationState(COURSE_ID, { now: NOW });
  assert.deepEqual(repeated, migrated);
  assert.deepEqual(migrateMotivationState(repeated, COURSE_ID, { now: NOW }), migrated);
});

test("Motivation State enthält keine Speech-Felder und akzeptiert keine Speak-Session", () => {
  const state = createInitialMotivationState(COURSE_ID, { now: NOW });
  assert.equal(Object.keys(state).some((key) => /speech|speak|microphone|recognition/i.test(key)), false);
  assert.throws(() => createSessionCompletionEvent({
    eventId: "speak-session",
    mode: "speak",
    sessionId: "speak-1",
    status: "completed",
    totalCount: 1,
    correctCount: 1,
    practicedWordIds: ["word-1"],
    occurredAt: NOW,
  }), /Modus|mode|unterstützt/i);
});

test("beschädigter oder inkompatibler Motivationsstand fällt sicher zurück", () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const key = getMotivationStorageKey(COURSE_ID);
  storage.setItem(key, "{broken");
  assert.equal(loadMotivationState(COURSE_ID, { now: NOW }).totalXp, 0);
  storage.setItem(key, JSON.stringify({
    ...createInitialMotivationState(COURSE_ID, { now: NOW }),
    schemaVersion: 99,
  }));
  assert.equal(loadMotivationState(COURSE_ID, { now: NOW }).schemaVersion, 2);
});

test("Reset löscht nur Motivation und erhält Aktivierung", () => {
  const { service } = createService();
  service.recordWordPractice(wordEvent({ id: "before-reset" }));
  service.recordSessionCompletion(completionEvent({ id: "complete-reset" }));
  const result = service.resetMotivationProgress();
  assert.equal(result.ok, true);
  const summary = service.getProgressSummary();
  assert.equal(summary.enabled, true);
  assert.equal(summary.totalXp, 0);
  assert.equal(summary.level, 1);
  assert.equal(summary.completedSessions, 0);
  assert.deepEqual(service.getState().processedEvents, []);
});

test("fachlicher Fortschritt wird ausschließlich aus Learning State berechnet", async () => {
  const [courseRaw, vocabularyRaw] = await Promise.all([
    readFile(new URL("../src/config/course-config.json", import.meta.url), "utf8"),
    readFile(new URL("../src/data/vocabulary.json", import.meta.url), "utf8"),
  ]);
  const courseConfig = JSON.parse(courseRaw);
  const vocabularyData = JSON.parse(vocabularyRaw);
  const learningState = createInitialLearningState(courseConfig.courseId, NOW);
  const academic = calculateAcademicProgress({
    courseConfig,
    vocabularyData,
    learningState,
    now: NOW,
  });
  assert.equal(academic.availableWordCount, 12);
  assert.equal(academic.practicedWordCount, 0);
  assert.equal(academic.units.length, 2);
});

test("Fortschrittsansicht trennt fachlichen und motivierenden Bereich", () => {
  const documentRoot = new TestDocument();
  const container = documentRoot.createElement("div");
  renderProgressView(container, {
    availableWordCount: 10,
    practicedWordCount: 4,
    masteredWordCount: 2,
    difficultWordCount: 1,
    dueWordCount: 1,
    markedWordCount: 2,
    units: [{
      id: "unit-1",
      title: "Unit 1",
      wordCount: 10,
      practicedCount: 4,
      masteredCount: 2,
      percentage: 20,
    }],
  }, {
    enabled: true,
    level: 2,
    totalXp: 60,
    remainingXp: 90,
    requiredInLevel: 100,
    earnedInLevel: 10,
    percentage: 10,
    currentStreak: 2,
    longestStreak: 3,
    completedSessions: 4,
    practicedWordCount: 8,
    milestones: [{ title: "Erster Schritt", description: "Eine Lerneinheit abgeschlossen." }],
  });
  assert.match(container.textContent, /Fachlicher Lernfortschritt/);
  assert.match(container.textContent, /mindestens dreimal richtig.*einmal aktiv geschrieben.*mindestens zwei Tagen.*zuletzt zweimal/);
  assert.match(container.textContent, /Motivation/);
  assert.match(container.textContent, /Level 2/);
  assert.match(container.textContent, /Erster Schritt/);
});

test("deaktivierte Fortschrittsansicht behält fachliche Werte sichtbar", () => {
  const documentRoot = new TestDocument();
  const container = documentRoot.createElement("div");
  renderProgressView(container, {
    availableWordCount: 10,
    practicedWordCount: 4,
    masteredWordCount: 2,
    difficultWordCount: 1,
    dueWordCount: 1,
    markedWordCount: 2,
    units: [],
  }, {
    enabled: false,
    milestones: [],
  });
  assert.match(container.textContent, /Verfügbare Wörter10/);
  assert.match(container.textContent, /XP, Level und Lernserien sind ausgeschaltet/);
  assert.match(container.textContent, /Motivationselemente anzeigen/);
});

test("leere Units erklären ihren Zustand ohne irreführenden Prozentwert", () => {
  const documentRoot = new TestDocument();
  const container = documentRoot.createElement("div");
  renderProgressView(container, {
    availableWordCount: 12,
    practicedWordCount: 0,
    masteredWordCount: 0,
    difficultWordCount: 0,
    dueWordCount: 0,
    markedWordCount: 0,
    units: [{
      id: "unit-1",
      title: "Unit 1",
      wordCount: 0,
      practicedCount: 0,
      masteredCount: 0,
      percentage: 0,
    }],
  }, { enabled: false, milestones: [] });
  assert.match(container.textContent, /Dieses Lernpaket enthält derzeit keine aktiven Wörter/);
  assert.doesNotMatch(container.textContent, /0 von 0 Wörtern/);
  assert.doesNotMatch(container.textContent, /Unit 1.*0 %/);
});

test("App-Shell enthält Fortschrittsroute, Dashboard-Link und Reset-Dialog", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(html, /data-route-view="\/progress"/);
  assert.match(html, />Mein Fortschritt</);
  assert.match(html, /Motivationsfortschritt zurücksetzen\?/);
  assert.match(html, /Deine Wortlernstände, Wiederholungen und gemerkten Wörter bleiben erhalten/);
});

let failed = 0;
for (const { name, callback } of tests) {
  try {
    await callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

if (failed > 0) process.exitCode = 1;
console.log(`\n${tests.length - failed}/${tests.length} Motivationstests bestanden.`);
