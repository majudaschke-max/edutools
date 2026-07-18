/**
 * Zentrale, bewusst nachvollziehbare Schwellenwerte der Lernstatuslogik.
 *
 * Schwierig: mindestens zwei falsche Antworten, mehr falsche als richtige
 * Antworten oder Level 0 nach mindestens einer Bewertung.
 * Sicher gelernt: mindestens drei richtige Bewertungen, davon mindestens ein
 * aktiver Abruf, richtige Bewertungen an zwei lokalen Kalendertagen und zwei
 * zuletzt aufeinanderfolgende richtige Bewertungen.
 */
export const LEARNING_THRESHOLDS = Object.freeze({
  difficultWrongCount: 2,
  masteredCorrectCount: 3,
  masteredActiveCorrectCount: 1,
  masteredCorrectDayCount: 2,
  masteredRecentCorrectCount: 2,
  maximumLevel: 5,
});

export const LEARNING_STATUSES = Object.freeze({
  NEW: "new",
  LEARNING: "learning",
  MASTERED: "mastered",
});

function getCounter(state, key) {
  const value = state?.[key];
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function hasValidLevel(level) {
  return level !== null && level <= LEARNING_THRESHOLDS.maximumLevel;
}

/**
 * Prüft, ob ein Wort nach den zentralen Regeln als schwierig gilt.
 *
 * @param {object|null|undefined} state Lernstatus eines Wortes.
 * @returns {boolean}
 */
export function isDifficultState(state) {
  const correctCount = getCounter(state, "correctCount");
  const wrongCount = getCounter(state, "wrongCount");
  const level = getCounter(state, "level");

  if (correctCount === null || wrongCount === null || !hasValidLevel(level)) {
    return false;
  }

  const hasBeenAnswered = correctCount + wrongCount > 0;

  return (
    wrongCount >= LEARNING_THRESHOLDS.difficultWrongCount ||
    wrongCount > correctCount ||
    (level === 0 && hasBeenAnswered)
  );
}

/**
 * Prüft, ob ein Wort nach den zentralen Regeln sicher gelernt ist.
 *
 * @param {object|null|undefined} state Lernstatus eines Wortes.
 * @returns {boolean}
 */
export function isMasteredState(state) {
  const correctCount = getCounter(state, "correctCount");
  const activeCorrectCount = getCounter(state, "activeCorrectCount");
  const correctDays = Array.isArray(state?.correctDays)
    ? new Set(state.correctDays)
    : null;
  const recentResults = Array.isArray(state?.recentResults)
    ? state.recentResults
    : null;

  if (
    correctCount === null
    || activeCorrectCount === null
    || !correctDays
    || !recentResults
  ) {
    return false;
  }

  const requiredRecentResults = recentResults.slice(
    -LEARNING_THRESHOLDS.masteredRecentCorrectCount,
  );

  return (
    correctCount >= LEARNING_THRESHOLDS.masteredCorrectCount &&
    activeCorrectCount >= LEARNING_THRESHOLDS.masteredActiveCorrectCount &&
    correctDays.size >= LEARNING_THRESHOLDS.masteredCorrectDayCount &&
    requiredRecentResults.length
      === LEARNING_THRESHOLDS.masteredRecentCorrectCount &&
    requiredRecentResults.every((result) => result === "correct")
  );
}

/**
 * Leitet den textlich erklärbaren Lernstatus aus dem bestehenden Wortzustand
 * ab. Falsche Versuche ohne je richtige Antwort bleiben fachlich „neu“.
 *
 * @param {object|null|undefined} state
 * @returns {"new"|"learning"|"mastered"}
 */
export function getLearningStatus(state) {
  const correctCount = getCounter(state, "correctCount");
  if (correctCount === null || correctCount === 0) {
    return LEARNING_STATUSES.NEW;
  }
  return isMasteredState(state)
    ? LEARNING_STATUSES.MASTERED
    : LEARNING_STATUSES.LEARNING;
}

/**
 * Prüft, ob ein Wort manuell als „Gemerkt“ markiert ist.
 *
 * @param {object|null|undefined} state Lernstatus eines Wortes.
 * @returns {boolean}
 */
export function isMarkedState(state) {
  return state?.marked === true;
}
