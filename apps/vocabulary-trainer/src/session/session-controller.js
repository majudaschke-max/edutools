import {
  getWordState,
  markWordCorrect,
  markWordWrong,
  RETRIEVAL_TYPES,
  saveLearningState,
  toggleMarkedWord,
} from "../core/learning-state.js";
import {
  createRetrySessionState,
  createSessionState,
  getCurrentSessionWordId,
  recordSessionResult,
  revealSessionSolution,
  setSessionMarkedResult,
} from "./session-state.js?v=4.0.5";

const STORAGE_ERROR_MESSAGE = "Dein Lernstand konnte nicht gespeichert werden. Bitte versuche es erneut.";
const MISSING_WORD_MESSAGE = "Ein Wort dieser Lerneinheit ist nicht mehr verfügbar. Bitte starte die Einheit erneut.";

function cloneLearningState(learningState) {
  return JSON.parse(JSON.stringify(learningState));
}

function createWordMap(words) {
  if (!Array.isArray(words)) {
    throw new TypeError("words muss ein Array sein.");
  }

  return new Map(words.map((word) => [word.id, word]));
}

/**
 * Coordinates one transient session with the existing persistent learning
 * core. Persisted changes are committed atomically before the card advances.
 */
export function createSessionController(options = {}) {
  const wordMap = createWordMap(options.words ?? []);
  const adapters = {
    markCorrect: options.markCorrect ?? markWordCorrect,
    markWrong: options.markWrong ?? markWordWrong,
    toggleMarked: options.toggleMarked ?? toggleMarkedWord,
    save: options.save ?? saveLearningState,
    now: options.now ?? (() => new Date()),
    random: options.random ?? Math.random,
  };

  let learningState = options.learningState;
  let session = null;
  let transitioning = false;
  let error = null;

  function requireKnownWordIds(wordIds) {
    const missingWordId = wordIds.find((wordId) => !wordMap.has(wordId));

    if (missingWordId) {
      error = MISSING_WORD_MESSAGE;
      return false;
    }

    return true;
  }

  function getCurrentWord() {
    const wordId = session ? getCurrentSessionWordId(session) : null;
    return wordId ? wordMap.get(wordId) ?? null : null;
  }

  function getSnapshot() {
    return {
      session,
      currentWord: getCurrentWord(),
      learningState,
      transitioning,
      error,
    };
  }

  function startSession({
    sourceType,
    mode,
    direction,
    wordIds = [],
    sessionId = null,
  } = {}) {
    if (!requireKnownWordIds(wordIds)) {
      session = null;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    session = createSessionState({
      sourceType: sourceType ?? (mode && mode !== "flashcards" ? mode : "daily"),
      direction,
      wordIds,
      sessionId,
      random: adapters.random,
    });
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function showSolution() {
    if (transitioning || !session || session.completed) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    if (!getCurrentWord()) {
      error = MISSING_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    revealSessionSolution(session);
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function persistMutation(wordId, mutate, mutationOptions) {
    const candidateState = cloneLearningState(learningState);

    try {
      const wordState = mutate(candidateState, wordId, adapters.now(), mutationOptions);
      if (!adapters.save(candidateState)) {
        error = STORAGE_ERROR_MESSAGE;
        return { ok: false, reason: "storage", wordState: null };
      }

      learningState = candidateState;
      error = null;
      return { ok: true, wordState };
    } catch (technicalError) {
      error = STORAGE_ERROR_MESSAGE;
      return {
        ok: false,
        reason: "storage",
        wordState: null,
        technicalError,
      };
    }
  }

  function answer(result) {
    if (transitioning) {
      return { ok: false, reason: "transitioning", ...getSnapshot() };
    }

    if (!session || session.completed || !session.solutionVisible) {
      return { ok: false, reason: "solution-hidden", ...getSnapshot() };
    }

    const wordId = getCurrentSessionWordId(session);
    if (!wordId || !wordMap.has(wordId)) {
      error = MISSING_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    transitioning = true;

    try {
      const mutation = persistMutation(
        wordId,
        result === "correct" ? adapters.markCorrect : adapters.markWrong,
        { retrievalType: RETRIEVAL_TYPES.SELF_ASSESSMENT },
      );

      if (!mutation.ok) {
        return { ...mutation, ...getSnapshot() };
      }

      recordSessionResult(session, result);
      return { ok: true, result, wordId, ...getSnapshot() };
    } finally {
      transitioning = false;
    }
  }

  function toggleCurrentMarked() {
    if (transitioning || !session || session.completed || !session.solutionVisible) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    const wordId = getCurrentSessionWordId(session);
    const result = toggleMarkedById(wordId, true);
    return { ...result, ...getSnapshot() };
  }

  function toggleMarkedById(wordId, trackInSession = false) {
    if (transitioning) {
      return { ok: false, reason: "transitioning", ...getSnapshot() };
    }

    if (!wordId || !wordMap.has(wordId)) {
      error = MISSING_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    transitioning = true;

    try {
      const mutation = persistMutation(wordId, adapters.toggleMarked);
      if (!mutation.ok) {
        return { ...mutation, ...getSnapshot() };
      }

      if (trackInSession && session) {
        setSessionMarkedResult(session, wordId, mutation.wordState.marked);
      }

      return {
        ok: true,
        wordId,
        marked: mutation.wordState.marked,
        ...getSnapshot(),
      };
    } finally {
      transitioning = false;
    }
  }

  function startRetrySession(sessionId = null) {
    if (!session) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    const retrySession = createRetrySessionState(session, sessionId);
    if (!requireKnownWordIds(retrySession.wordIds)) {
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    session = retrySession;
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function discardSession() {
    session = null;
    error = null;
    transitioning = false;
  }

  function replaceLearningState(nextLearningState) {
    learningState = nextLearningState;
    error = null;
  }

  return Object.freeze({
    answerCorrect: () => answer("correct"),
    answerWrong: () => answer("wrong"),
    discardSession,
    getLearningState: () => learningState,
    getSnapshot,
    replaceLearningState,
    showSolution,
    startRetrySession,
    startSession,
    toggleCurrentMarked,
    toggleMarkedById,
  });
}

/** Returns whether a word is currently marked in a controller snapshot. */
export function isSnapshotWordMarked(snapshot, wordId) {
  return getWordState(snapshot?.learningState, wordId)?.marked === true;
}
