import {
  createCourseStorageKey,
  loadJson,
  removeKey,
  saveJson,
} from "./storage.js";
import {
  getLearningStatus,
  isDifficultState,
  isMarkedState,
  isMasteredState,
  LEARNING_STATUSES,
} from "./learning-rules.js";
import { calculateNextReviewAt } from "./scheduler.js";
import {
  assertNonEmptyString,
  DataValidationError,
  isPlainObject,
  isValidTimestamp,
  toIsoTimestamp,
} from "./utils.js";

const LEARNING_STATE_SCHEMA_VERSION = 2;
const LEARNING_STATE_STORAGE_AREA = "learning-state";
const MIN_LEVEL = 0;
const MAX_LEVEL = 5;
const LEGACY_LEARNING_STATE_SCHEMA_VERSION = 1;
const EVALUATED_RESULTS = new Set(["correct", "wrong"]);
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const RETRIEVAL_TYPES = Object.freeze({
  RECOGNITION: "recognition",
  ACTIVE: "active",
  SELF_ASSESSMENT: "self-assessment",
});

const VALID_RETRIEVAL_TYPES = new Set(Object.values(RETRIEVAL_TYPES));

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateNullableTimestamp(value, fieldName, issues) {
  if (value !== null && !isValidTimestamp(value)) {
    issues.push(`${fieldName} muss null oder ein gültiger Zeitstempel sein.`);
  }
}

function validateWordState(state, wordId, issues, options = {}) {
  if (!isPlainObject(state)) {
    issues.push(`Lernstatus für ${wordId} muss ein Objekt sein.`);
    return;
  }

  if (state.wordId !== wordId) {
    issues.push(`wordId im Lernstatus für ${wordId} stimmt nicht überein.`);
  }

  for (const field of ["correctCount", "wrongCount", "streak"]) {
    if (!isNonNegativeInteger(state[field])) {
      issues.push(`${field} für ${wordId} muss eine nicht negative Ganzzahl sein.`);
    }
  }

  if (
    !Number.isInteger(state.level) ||
    state.level < MIN_LEVEL ||
    state.level > MAX_LEVEL
  ) {
    issues.push(`level für ${wordId} muss zwischen 0 und 5 liegen.`);
  }

  if (typeof state.marked !== "boolean") {
    issues.push(`marked für ${wordId} muss ein boolescher Wert sein.`);
  }

  validateNullableTimestamp(state.lastSeenAt, `lastSeenAt für ${wordId}`, issues);
  validateNullableTimestamp(
    state.nextReviewAt,
    `nextReviewAt für ${wordId}`,
    issues,
  );

  if (!isValidTimestamp(state.createdAt)) {
    issues.push(`createdAt für ${wordId} muss ein gültiger Zeitstempel sein.`);
  }

  if (!isValidTimestamp(state.updatedAt)) {
    issues.push(`updatedAt für ${wordId} muss ein gültiger Zeitstempel sein.`);
  }

  if (options.legacy === true) {
    return;
  }

  if (
    !isNonNegativeInteger(state.activeCorrectCount)
    || state.activeCorrectCount > state.correctCount
  ) {
    issues.push(`activeCorrectCount für ${wordId} muss zwischen 0 und correctCount liegen.`);
  }

  if (
    !Array.isArray(state.recentResults)
    || state.recentResults.length > 2
    || state.recentResults.some((result) => !EVALUATED_RESULTS.has(result))
  ) {
    issues.push(`recentResults für ${wordId} darf höchstens zwei gültige Ergebnisse enthalten.`);
  }

  if (
    !Array.isArray(state.correctDays)
    || state.correctDays.some((day) => typeof day !== "string" || !LOCAL_DATE_PATTERN.test(day))
    || new Set(state.correctDays).size !== state.correctDays.length
    || state.correctDays.length > state.correctCount
  ) {
    issues.push(`correctDays für ${wordId} muss eindeutige lokale Lerntage enthalten.`);
  }

  if (!Object.values(LEARNING_STATUSES).includes(state.status)) {
    issues.push(`status für ${wordId} ist ungültig.`);
  } else if (state.status !== getLearningStatus(state)) {
    issues.push(`status für ${wordId} stimmt nicht mit den Lernkriterien überein.`);
  }
}

function getLocalCalendarDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Der Zeitpunkt für den lokalen Lerntag ist ungültig.");
  }
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function ensureMasteryFields(state) {
  if (!isNonNegativeInteger(state.activeCorrectCount)) state.activeCorrectCount = 0;
  if (!Array.isArray(state.recentResults)) state.recentResults = [];
  if (!Array.isArray(state.correctDays)) state.correctDays = [];
  state.status = getLearningStatus(state);
  return state;
}

function appendRecentResult(state, result) {
  state.recentResults = [...state.recentResults, result].slice(-2);
}

function requireRetrievalType(options) {
  const retrievalType = options?.retrievalType ?? RETRIEVAL_TYPES.RECOGNITION;
  if (!VALID_RETRIEVAL_TYPES.has(retrievalType)) {
    throw new TypeError(`Unbekannter Abruftyp: ${retrievalType}`);
  }
  return retrievalType;
}

function migrateLegacyLearningState(data, courseId) {
  const issues = [];
  if (data.courseId !== courseId) issues.push("courseId des Lernstands stimmt nicht überein.");
  if (!isPlainObject(data.words)) {
    issues.push("words im Lernstand muss ein Objekt sein.");
  } else {
    for (const [wordId, state] of Object.entries(data.words)) {
      validateWordState(state, wordId, issues, { legacy: true });
    }
  }
  if (!isValidTimestamp(data.createdAt)) issues.push("createdAt des Lernstands muss ein gültiger Zeitstempel sein.");
  if (!isValidTimestamp(data.updatedAt)) issues.push("updatedAt des Lernstands muss ein gültiger Zeitstempel sein.");
  if (issues.length > 0) {
    throw new DataValidationError("Der gespeicherte Lernstand ist ungültig.", issues);
  }

  const migrated = {
    ...data,
    schemaVersion: LEARNING_STATE_SCHEMA_VERSION,
    words: {},
  };
  for (const [wordId, state] of Object.entries(data.words)) {
    migrated.words[wordId] = ensureMasteryFields({
      ...state,
      activeCorrectCount: 0,
      recentResults: [],
      correctDays: [],
      status: Number(state.correctCount) > 0
        ? LEARNING_STATUSES.LEARNING
        : LEARNING_STATUSES.NEW,
    });
  }
  return migrated;
}

function requireLearningStateContainer(learningState) {
  if (!isPlainObject(learningState) || !isPlainObject(learningState.words)) {
    throw new TypeError("Der Lernstand muss ein Objekt mit einem words-Objekt sein.");
  }
}

function updateRootTimestamp(learningState, timestamp) {
  learningState.updatedAt = timestamp;
}

/**
 * Erstellt den noch unbearbeiteten Lernstatus eines Wortes.
 *
 * @param {string} wordId Dauerhafte Wort-ID.
 * @param {Date|string|number} [now=new Date()] Aktueller Zeitpunkt.
 * @returns {object}
 */
export function createInitialWordState(wordId, now = new Date()) {
  const normalizedWordId = assertNonEmptyString(wordId, "wordId");
  const timestamp = toIsoTimestamp(now);

  return {
    wordId: normalizedWordId,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    level: 0,
    activeCorrectCount: 0,
    recentResults: [],
    correctDays: [],
    status: LEARNING_STATUSES.NEW,
    marked: false,
    lastSeenAt: null,
    nextReviewAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Erstellt einen leeren, kursbezogenen Lernstand.
 *
 * @param {string} courseId Dauerhafte Kurs-ID.
 * @param {Date|string|number} [now=new Date()] Aktueller Zeitpunkt.
 * @returns {object}
 */
export function createInitialLearningState(courseId, now = new Date()) {
  const normalizedCourseId = assertNonEmptyString(courseId, "courseId");
  const timestamp = toIsoTimestamp(now);

  return {
    schemaVersion: LEARNING_STATE_SCHEMA_VERSION,
    courseId: normalizedCourseId,
    words: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Validiert einen vollständigen Lernstand und gibt ihn unverändert zurück.
 *
 * @param {unknown} data Zu prüfende Daten.
 * @param {string} courseId Erwartete Kurs-ID.
 * @returns {object}
 * @throws {DataValidationError} Bei inkompatiblen oder beschädigten Daten.
 */
export function validateLearningState(data, courseId) {
  const expectedCourseId = assertNonEmptyString(courseId, "courseId");
  const issues = [];

  if (!isPlainObject(data)) {
    throw new DataValidationError("Der gespeicherte Lernstand ist ungültig.", [
      "Lernstand muss ein Objekt sein.",
    ]);
  }

  if (data.schemaVersion !== LEARNING_STATE_SCHEMA_VERSION) {
    issues.push("schemaVersion des Lernstands ist nicht kompatibel.");
  }

  if (data.courseId !== expectedCourseId) {
    issues.push("courseId des Lernstands stimmt nicht überein.");
  }

  if (!isPlainObject(data.words)) {
    issues.push("words im Lernstand muss ein Objekt sein.");
  } else {
    for (const [wordId, state] of Object.entries(data.words)) {
      if (!wordId.trim()) {
        issues.push("Ein Lernstatus besitzt keine gültige Wort-ID.");
        continue;
      }

      validateWordState(state, wordId, issues);
    }
  }

  if (!isValidTimestamp(data.createdAt)) {
    issues.push("createdAt des Lernstands muss ein gültiger Zeitstempel sein.");
  }

  if (!isValidTimestamp(data.updatedAt)) {
    issues.push("updatedAt des Lernstands muss ein gültiger Zeitstempel sein.");
  }

  if (issues.length > 0) {
    throw new DataValidationError("Der gespeicherte Lernstand ist ungültig.", issues);
  }

  return data;
}

/** Migriert ausschließlich das bisherige Schema 1 konservativ auf Schema 2. */
export function migrateLearningState(data, courseId) {
  const expectedCourseId = assertNonEmptyString(courseId, "courseId");
  if (data?.schemaVersion === LEARNING_STATE_SCHEMA_VERSION) {
    return validateLearningState(data, expectedCourseId);
  }
  if (data?.schemaVersion === LEGACY_LEARNING_STATE_SCHEMA_VERSION) {
    return validateLearningState(
      migrateLegacyLearningState(data, expectedCourseId),
      expectedCourseId,
    );
  }
  throw new DataValidationError("Der gespeicherte Lernstand ist inkompatibel.", [
    "schemaVersion des Lernstands ist nicht kompatibel.",
  ]);
}

/**
 * Lädt den Lernstand eines Kurses oder initialisiert ihn sicher neu.
 * Inkompatible Daten werden entfernt und blockieren den App-Start nicht.
 *
 * @param {string} courseId Dauerhafte Kurs-ID.
 * @param {Date|string|number} [now=new Date()] Zeitpunkt für eine Neuinitialisierung.
 * @returns {object}
 */
export function loadLearningState(courseId, now = new Date()) {
  const normalizedCourseId = assertNonEmptyString(courseId, "courseId");
  const key = createCourseStorageKey(
    normalizedCourseId,
    LEARNING_STATE_STORAGE_AREA,
  );
  const missingValue = {};
  const storedState = loadJson(key, missingValue);

  if (storedState === missingValue) {
    return createInitialLearningState(normalizedCourseId, now);
  }

  try {
    const loadedState = migrateLearningState(storedState, normalizedCourseId);
    if (storedState.schemaVersion !== LEARNING_STATE_SCHEMA_VERSION) {
      saveLearningState(loadedState);
    }
    return loadedState;
  } catch {
    removeKey(key);
    return createInitialLearningState(normalizedCourseId, now);
  }
}

/**
 * Speichert einen validierten Lernstand im Bereich seines Kurses.
 *
 * @param {object} state Vollständiger Lernstand.
 * @returns {boolean} `true`, wenn das Speichern erfolgreich war.
 */
export function saveLearningState(state) {
  if (!isPlainObject(state)) {
    throw new DataValidationError("Der gespeicherte Lernstand ist ungültig.");
  }

  const validState = validateLearningState(state, state.courseId);
  const key = createCourseStorageKey(
    validState.courseId,
    LEARNING_STATE_STORAGE_AREA,
  );

  return saveJson(key, validState);
}

/**
 * Entfernt ausschließlich den Lernstand des angegebenen Kurses.
 *
 * @param {string} courseId Dauerhafte Kurs-ID.
 * @returns {boolean} `true`, wenn der Löschzugriff möglich war.
 */
export function resetCourseLearningState(courseId) {
  return removeKey(
    createCourseStorageKey(courseId, LEARNING_STATE_STORAGE_AREA),
  );
}

/**
 * Liefert den Lernstatus eines Wortes oder `null`, wenn noch keiner existiert.
 *
 * @param {object} learningState Vollständiger Lernstand.
 * @param {string} wordId Dauerhafte Wort-ID.
 * @returns {object|null}
 */
export function getWordState(learningState, wordId) {
  const normalizedWordId = assertNonEmptyString(wordId, "wordId");

  if (!isPlainObject(learningState) || !isPlainObject(learningState.words)) {
    return null;
  }

  const state = learningState.words[normalizedWordId];
  return isPlainObject(state) ? state : null;
}

/**
 * Liefert einen vorhandenen Wortstatus oder legt ihn im Lernstand an.
 *
 * @param {object} learningState Vollständiger Lernstand.
 * @param {string} wordId Dauerhafte Wort-ID.
 * @param {Date|string|number} [now=new Date()] Aktueller Zeitpunkt.
 * @returns {object}
 */
export function ensureWordState(learningState, wordId, now = new Date()) {
  requireLearningStateContainer(learningState);
  const normalizedWordId = assertNonEmptyString(wordId, "wordId");
  const existingState = getWordState(learningState, normalizedWordId);

  if (existingState) {
    return ensureMasteryFields(existingState);
  }

  const timestamp = toIsoTimestamp(now);
  const wordState = createInitialWordState(normalizedWordId, timestamp);
  learningState.words[normalizedWordId] = wordState;
  updateRootTimestamp(learningState, timestamp);

  return wordState;
}

/**
 * Bewertet ein Wort als gewusst und plant die nächste Wiederholung.
 *
 * @param {object} learningState Vollständiger Lernstand.
 * @param {string} wordId Dauerhafte Wort-ID.
 * @param {Date|string|number} [now=new Date()] Aktueller Zeitpunkt.
 * @param {{retrievalType?: "recognition"|"active"|"self-assessment"}} [options]
 * @returns {object} Aktualisierter Wortstatus.
 */
export function markWordCorrect(learningState, wordId, now = new Date(), options = {}) {
  const timestamp = toIsoTimestamp(now);
  const state = ensureWordState(learningState, wordId, timestamp);
  const retrievalType = requireRetrievalType(options);

  state.correctCount += 1;
  state.streak += 1;
  state.level = Math.min(state.level + 1, MAX_LEVEL);
  if (retrievalType === RETRIEVAL_TYPES.ACTIVE) {
    state.activeCorrectCount += 1;
  }
  const localDay = getLocalCalendarDay(timestamp);
  if (!state.correctDays.includes(localDay)) {
    state.correctDays.push(localDay);
    state.correctDays.sort();
  }
  appendRecentResult(state, "correct");
  state.status = getLearningStatus(state);
  state.lastSeenAt = timestamp;
  state.nextReviewAt = calculateNextReviewAt(state.level, timestamp);
  state.updatedAt = timestamp;
  updateRootTimestamp(learningState, timestamp);

  return state;
}

/**
 * Bewertet ein Wort als noch nicht gewusst und plant eine zeitnahe Wiederholung.
 *
 * @param {object} learningState Vollständiger Lernstand.
 * @param {string} wordId Dauerhafte Wort-ID.
 * @param {Date|string|number} [now=new Date()] Aktueller Zeitpunkt.
 * @param {{retrievalType?: "recognition"|"active"|"self-assessment"}} [options]
 * @returns {object} Aktualisierter Wortstatus.
 */
export function markWordWrong(learningState, wordId, now = new Date(), options = {}) {
  const timestamp = toIsoTimestamp(now);
  const state = ensureWordState(learningState, wordId, timestamp);
  requireRetrievalType(options);

  state.wrongCount += 1;
  state.streak = 0;
  state.level = MIN_LEVEL;
  appendRecentResult(state, "wrong");
  state.status = getLearningStatus(state);
  state.lastSeenAt = timestamp;
  state.nextReviewAt = calculateNextReviewAt(MIN_LEVEL, timestamp);
  state.updatedAt = timestamp;
  updateRootTimestamp(learningState, timestamp);

  return state;
}

/**
 * Schaltet die manuelle „Gemerkt“-Markierung eines Wortes um.
 *
 * @param {object} learningState Vollständiger Lernstand.
 * @param {string} wordId Dauerhafte Wort-ID.
 * @param {Date|string|number} [now=new Date()] Aktueller Zeitpunkt.
 * @returns {object} Aktualisierter Wortstatus.
 */
export function toggleMarkedWord(learningState, wordId, now = new Date()) {
  const timestamp = toIsoTimestamp(now);
  const state = ensureWordState(learningState, wordId, timestamp);

  state.marked = !state.marked;
  state.updatedAt = timestamp;
  updateRootTimestamp(learningState, timestamp);

  return state;
}

/** @param {object|null|undefined} state @returns {boolean} */
export function isMarked(state) {
  return isMarkedState(state);
}

/** @param {object|null|undefined} state @returns {boolean} */
export function isDifficult(state) {
  return isDifficultState(state);
}

/** @param {object|null|undefined} state @returns {boolean} */
export function isMastered(state) {
  return isMasteredState(state);
}
