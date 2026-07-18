import {
  markWordCorrect,
  RETRIEVAL_TYPES,
  saveLearningState,
} from "../core/learning-state.js";
import { createSpeedRound, SPEED_DIRECTIONS } from "./speed-generator.js";
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
  updateSpeedTime,
} from "./speed-state.js?v=4.0.3";

const MINIMUM_PAIR_COUNT = 4;
const INSUFFICIENT_WORDS_MESSAGE = "Für die Speed Challenge werden mindestens vier Wörter benötigt.";
const AMBIGUOUS_PAIRS_MESSAGE = "Für diese Auswahl lassen sich nicht genügend eindeutige Wortpaare bilden.";
const MISSING_WORD_MESSAGE = "Ein Wort dieser Speed Challenge ist nicht mehr verfügbar. Bitte starte die Challenge erneut.";
const STORAGE_ERROR_MESSAGE = "Dein Lernstand konnte nicht gespeichert werden. Bitte versuche es erneut.";

function cloneLearningState(learningState) {
  return JSON.parse(JSON.stringify(learningState));
}

function uniqueWords(words) {
  const seen = new Set();
  return (Array.isArray(words) ? words : []).filter((word) => {
    if (!word?.id || seen.has(word.id)) return false;
    seen.add(word.id);
    return true;
  });
}

function normalizeDuration(value) {
  const duration = Number(value);
  if (![30, 60, 90].includes(duration)) {
    throw new TypeError("Die Dauer muss 30, 60 oder 90 Sekunden betragen.");
  }
  return duration;
}

function normalizePairCount(value) {
  const count = Number(value);
  if (![4, 6, 8].includes(count)) {
    throw new TypeError("Die Rundengröße muss 4, 6 oder 8 Paare betragen.");
  }
  return count;
}

/** Coordinates round generation, matching and the one-time Core score. */
export function createSpeedController(options = {}) {
  const allWords = uniqueWords(options.words ?? []);
  const wordMap = new Map(allWords.map((word) => [word.id, word]));
  const adapters = {
    markCorrect: options.markCorrect ?? markWordCorrect,
    save: options.save ?? saveLearningState,
    now: options.now ?? (() => new Date()),
    random: options.randomFn ?? Math.random,
  };

  let learningState = options.learningState;
  let speed = null;
  let sessionWords = [];
  let lastStartConfig = null;
  let transitioning = false;
  let error = null;
  let feedback = null;

  function getSnapshot() {
    const notableWordIds = speed ? getNotableSpeedWordIds(speed) : [];
    return {
      speed,
      learningState,
      transitioning,
      error,
      feedback,
      summary: speed ? getSpeedSummary(speed) : null,
      notableWords: notableWordIds.map((wordId) => wordMap.get(wordId)).filter(Boolean),
    };
  }

  function startSpeed(config = {}) {
    const sourceWords = uniqueWords(config.words);
    if (sourceWords.length < MINIMUM_PAIR_COUNT) {
      speed = null;
      error = INSUFFICIENT_WORDS_MESSAGE;
      return { ok: false, reason: "insufficient-words", ...getSnapshot() };
    }
    if (sourceWords.some((word) => !wordMap.has(word.id))) {
      speed = null;
      error = MISSING_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    const durationSeconds = normalizeDuration(config.durationSeconds ?? 60);
    const requestedPairs = normalizePairCount(config.pairsPerRound ?? 4);
    const round = createSpeedRound(sourceWords, {
      count: Math.min(requestedPairs, sourceWords.length),
      direction: config.direction ?? SPEED_DIRECTIONS.SOURCE_TO_TARGET,
      randomFn: adapters.random,
      round: 1,
    });

    if (round.pairs.length < MINIMUM_PAIR_COUNT) {
      speed = null;
      error = AMBIGUOUS_PAIRS_MESSAGE;
      return {
        ok: false,
        reason: "ambiguous-pairs",
        skippedWordIds: round.skippedWordIds,
        ...getSnapshot(),
      };
    }

    const startedAtValue = adapters.now();
    speed = createSpeedState({
      sessionId: config.sessionId ?? null,
      sourceType: config.sourceType ?? "current-unit",
      direction: config.direction ?? SPEED_DIRECTIONS.SOURCE_TO_TARGET,
      durationSeconds,
      pairsPerRound: round.pairs.length,
      requestedPairsPerRound: requestedPairs,
      startedAt: new Date(startedAtValue).toISOString(),
      round,
    });
    sessionWords = sourceWords;
    lastStartConfig = {
      sourceType: config.sourceType ?? "current-unit",
      direction: config.direction ?? SPEED_DIRECTIONS.SOURCE_TO_TARGET,
      durationSeconds,
      pairsPerRound: requestedPairs,
      words: sourceWords,
    };
    error = null;
    feedback = null;

    return {
      ok: true,
      requestedPairCount: requestedPairs,
      usedPairCount: round.pairs.length,
      ...getSnapshot(),
    };
  }

  function persistCorrectWord(wordId) {
    const candidateState = cloneLearningState(learningState);
    try {
      adapters.markCorrect(candidateState, wordId, adapters.now(), {
        retrievalType: RETRIEVAL_TYPES.RECOGNITION,
      });
      if (!adapters.save(candidateState)) {
        error = STORAGE_ERROR_MESSAGE;
        return { ok: false, reason: "storage" };
      }
      learningState = candidateState;
      error = null;
      return { ok: true };
    } catch (technicalError) {
      error = STORAGE_ERROR_MESSAGE;
      return { ok: false, reason: "storage", technicalError };
    }
  }

  function createNextRound() {
    const round = createSpeedRound(sessionWords, {
      count: speed.pairsPerRound,
      direction: speed.direction,
      excludedWordIds: speed.usedWordIds,
      randomFn: adapters.random,
      round: speed.currentRound + 1,
    });
    if (round.pairs.length < MINIMUM_PAIR_COUNT) return false;
    return advanceSpeedRound(speed, round);
  }

  function chooseItem(side, itemId) {
    if (transitioning || !speed || speed.completed || speed.paused) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    const selection = selectSpeedItem(speed, side, itemId);
    if (!selection.ok) return { ...selection, ...getSnapshot() };
    error = null;
    feedback = null;
    if (!selection.ready) return { ok: true, selection, ...getSnapshot() };

    transitioning = true;
    try {
      const isNewScore = selection.isCorrect
        && !speed.scoredWordIds.includes(selection.wordId);
      if (isNewScore) {
        if (!wordMap.has(selection.wordId)) {
          resetSpeedSelection(speed);
          error = MISSING_WORD_MESSAGE;
          return { ok: false, reason: "missing-word", ...getSnapshot() };
        }
        const persistence = persistCorrectWord(selection.wordId);
        if (!persistence.ok) {
          resetSpeedSelection(speed);
          return { ...persistence, ...getSnapshot() };
        }
      }

      const attempt = resolveSpeedSelection(speed, adapters.now());
      if (!attempt.ok) return { ...attempt, ...getSnapshot() };
      if (isNewScore) markSpeedWordScored(speed, selection.wordId);

      let roundAdvanced = false;
      if (attempt.isCorrect && isSpeedRoundComplete(speed) && speed.timeRemainingMs > 0) {
        roundAdvanced = createNextRound();
      }
      feedback = attempt.isCorrect
        ? (roundAdvanced ? "Runde abgeschlossen. Die nächste Runde ist bereit." : "Richtig zugeordnet.")
        : "Diese beiden gehören nicht zusammen. Versuche eine andere Kombination.";

      return {
        ok: true,
        attempt,
        persisted: isNewScore,
        roundAdvanced,
        ...getSnapshot(),
      };
    } finally {
      transitioning = false;
    }
  }

  function clearSelection() {
    if (!speed || speed.completed || !resetSpeedSelection(speed)) {
      return { ok: false, reason: "no-selection", ...getSnapshot() };
    }
    feedback = "Auswahl aufgehoben.";
    return { ok: true, ...getSnapshot() };
  }

  function synchronizeTime(remainingMs, endsAt = null) {
    if (!speed || speed.completed) return false;
    updateSpeedTime(speed, remainingMs, endsAt);
    return true;
  }

  function pauseSpeed() {
    if (!speed || !setSpeedPaused(speed, true)) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }
    feedback = "Challenge pausiert.";
    return { ok: true, ...getSnapshot() };
  }

  function resumeSpeed() {
    if (!speed || !setSpeedPaused(speed, false)) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }
    feedback = "Challenge wird fortgesetzt.";
    return { ok: true, ...getSnapshot() };
  }

  function finishSpeed(reason = "manual") {
    if (!speed || !completeSpeedChallenge(speed, reason)) {
      return { ok: false, reason: "already-completed", ...getSnapshot() };
    }
    feedback = reason === "time" ? "Die Zeit ist abgelaufen." : "Die Challenge wurde beendet.";
    return { ok: true, ...getSnapshot() };
  }

  function restartSpeed(overrides = {}) {
    return lastStartConfig
      ? startSpeed({ ...lastStartConfig, ...overrides })
      : { ok: false, reason: "unavailable", ...getSnapshot() };
  }

  function discardSpeed() {
    speed = null;
    sessionWords = [];
    transitioning = false;
    error = null;
    feedback = null;
  }

  function replaceLearningState(nextLearningState) {
    learningState = nextLearningState;
    error = null;
  }

  return Object.freeze({
    chooseItem,
    clearSelection,
    discardSpeed,
    finishSpeed,
    getLearningState: () => learningState,
    getNotableWordIds: () => speed ? getNotableSpeedWordIds(speed) : [],
    getSnapshot,
    pauseSpeed,
    replaceLearningState,
    restartSpeed,
    resumeSpeed,
    startSpeed,
    synchronizeTime,
  });
}
