const SESSION_SOURCE_TYPES = new Set(["daily", "review", "marked", "retry"]);
const SESSION_RESULTS = new Set(["correct", "wrong"]);

export const FLASHCARD_DIRECTIONS = Object.freeze({
  SOURCE_TO_TARGET: "source-to-target",
  TARGET_TO_SOURCE: "target-to-source",
  MIXED: "mixed",
});

const FLASHCARD_DIRECTION_VALUES = new Set(Object.values(FLASHCARD_DIRECTIONS));

function requireSessionState(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.wordIds)) {
    throw new TypeError("Der Session-Zustand ist ungültig.");
  }
}

function normalizeWordIds(wordIds) {
  if (!Array.isArray(wordIds)) {
    throw new TypeError("wordIds muss ein Array sein.");
  }

  const seenWordIds = new Set();

  return wordIds.reduce((normalizedIds, wordId) => {
    if (typeof wordId !== "string" || wordId.trim().length === 0) {
      throw new TypeError("Jede Wort-ID muss ein nicht leerer String sein.");
    }

    const normalizedWordId = wordId.trim();
    if (!seenWordIds.has(normalizedWordId)) {
      seenWordIds.add(normalizedWordId);
      normalizedIds.push(normalizedWordId);
    }

    return normalizedIds;
  }, []);
}

function assignCardDirections(wordIds, direction, random) {
  if (direction !== FLASHCARD_DIRECTIONS.MIXED) {
    return Object.fromEntries(wordIds.map((wordId) => [wordId, direction]));
  }

  const assignments = wordIds.map(() => (
    random() < 0.5
      ? FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET
      : FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE
  ));

  // A mixed package with at least two words should actually exercise both
  // directions, even when a deterministic random source returns one side.
  if (assignments.length > 1 && new Set(assignments).size === 1) {
    assignments[assignments.length - 1] = assignments[0] === FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET
      ? FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE
      : FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET;
  }

  return Object.fromEntries(wordIds.map((wordId, index) => [wordId, assignments[index]]));
}

/**
 * Creates an in-memory learning session. It is deliberately independent from
 * the persisted course learning state.
 */
export function createSessionState({
  mode = "flashcards",
  sourceType = "daily",
  direction = FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET,
  wordIds = [],
  sessionId = null,
  random = Math.random,
} = {}) {
  // Accept the Sprint-1.x call shape while normalizing the resulting state to
  // the explicit flashcard mode plus a separate learning-source role.
  if (SESSION_SOURCE_TYPES.has(mode)) {
    sourceType = mode;
    mode = "flashcards";
  }

  if (mode !== "flashcards") {
    throw new TypeError(`Unbekannter Session-Modus: ${mode}`);
  }

  if (!SESSION_SOURCE_TYPES.has(sourceType)) {
    throw new TypeError(`Unbekannte Lernquelle: ${sourceType}`);
  }

  if (!FLASHCARD_DIRECTION_VALUES.has(direction)) {
    throw new TypeError(`Unbekannte Flashcard-Lernrichtung: ${direction}`);
  }

  if (typeof random !== "function") {
    throw new TypeError("random muss eine Funktion sein.");
  }

  const normalizedWordIds = normalizeWordIds(wordIds);

  return {
    sessionId,
    mode: "flashcards",
    sourceType,
    direction,
    wordIds: normalizedWordIds,
    cardDirections: assignCardDirections(normalizedWordIds, direction, random),
    currentIndex: 0,
    retryWordIds: [],
    retriedWordIds: [],
    results: {
      correct: [],
      wrong: [],
      marked: [],
    },
    solutionVisible: false,
    completed: normalizedWordIds.length === 0,
  };
}

/** Returns the original selection followed by each one-time retry. */
export function getSessionQueue(state) {
  requireSessionState(state);
  return [...state.wordIds, ...state.retryWordIds];
}

/** Returns the ID of the currently visible card. */
export function getCurrentSessionWordId(state) {
  requireSessionState(state);

  if (state.completed) {
    return null;
  }

  return getSessionQueue(state)[state.currentIndex] ?? null;
}

/** Returns the stable direction assigned to the current card. */
export function getCurrentSessionCardDirection(state) {
  requireSessionState(state);
  const wordId = getCurrentSessionWordId(state);
  return wordId ? state.cardDirections?.[wordId] ?? null : null;
}

/** Reveals the current card solution without changing learning history. */
export function revealSessionSolution(state) {
  requireSessionState(state);

  if (state.completed || getCurrentSessionWordId(state) === null) {
    return false;
  }

  state.solutionVisible = true;
  return true;
}

/**
 * Records one rating and advances to the next card. Every distinct word ID is
 * rated at most once in the original session; a separate follow-up package is
 * available from the completion view.
 */
export function recordSessionResult(state, result) {
  requireSessionState(state);

  if (!SESSION_RESULTS.has(result)) {
    throw new TypeError(`Unbekanntes Session-Ergebnis: ${result}`);
  }

  if (state.completed || !state.solutionVisible) {
    return null;
  }

  const wordId = getCurrentSessionWordId(state);
  if (wordId === null) {
    return null;
  }

  state.results[result].push(wordId);

  state.currentIndex += 1;
  state.solutionVisible = false;

  const queue = getSessionQueue(state);
  if (state.currentIndex >= queue.length) {
    state.completed = true;
    return wordId;
  }

  return wordId;
}

/** Keeps the session summary aligned with the current persisted mark state. */
export function setSessionMarkedResult(state, wordId, marked) {
  requireSessionState(state);

  if (typeof wordId !== "string" || wordId.trim().length === 0) {
    throw new TypeError("wordId muss ein nicht leerer String sein.");
  }

  const normalizedWordId = wordId.trim();
  const markedIndex = state.results.marked.indexOf(normalizedWordId);

  if (marked && markedIndex === -1) {
    state.results.marked.push(normalizedWordId);
  } else if (!marked && markedIndex !== -1) {
    state.results.marked.splice(markedIndex, 1);
  }
}

/** Starts a fresh short session with the distinct wrong words of a session. */
export function createRetrySessionState(sourceState, sessionId = null) {
  requireSessionState(sourceState);

  return createSessionState({
    sessionId,
    sourceType: "retry",
    direction: sourceState.direction,
    wordIds: [...new Set(sourceState.results.wrong)],
  });
}

/** Returns the values needed by the visual and semantic progress indicators. */
export function getSessionProgress(state) {
  requireSessionState(state);
  const total = getSessionQueue(state).length;

  return {
    current: state.completed ? total : Math.min(state.currentIndex + 1, total),
    completed: Math.min(state.currentIndex, total),
    total,
  };
}
