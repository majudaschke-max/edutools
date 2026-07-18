import {
  markWordCorrect,
  markWordWrong,
  RETRIEVAL_TYPES,
  saveLearningState,
} from "../core/learning-state.js";
import { shuffleOptions } from "../quiz/quiz-generator.js";
import { normalizeWrittenAnswer } from "./writing-evaluator.js";
import { createWritingCloze } from "../core/cloze.js";
import {
  advanceWritingPrompt,
  createCurrentWritingResult,
  createWritingState,
  getWritingSummary,
  getWrongWritingWordIds,
  recordWritingResult,
  revealWritingHint,
  setWritingAnswer,
  WRITING_DIRECTIONS,
} from "./writing-state.js?v=4.0.3";

const CONCRETE_DIRECTIONS = new Set([
  WRITING_DIRECTIONS.SOURCE_TO_TARGET,
  WRITING_DIRECTIONS.TARGET_TO_SOURCE,
]);
const EMPTY_SOURCE_MESSAGE = "Für diese Lernquelle sind aktuell keine Wörter verfügbar.";
const INVALID_WORD_MESSAGE = "Ein Wort dieses Schreibtrainings ist nicht mehr verfügbar. Bitte starte das Training erneut.";
const INVALID_ANSWER_DATA_MESSAGE = "Für diese Auswahl sind keine gültigen Schreibaufgaben verfügbar.";
const EMPTY_ANSWER_MESSAGE = "Bitte gib zuerst eine Antwort ein.";
const STORAGE_ERROR_MESSAGE = "Dein Lernstand konnte nicht gespeichert werden. Bitte versuche es erneut.";

function cloneLearningState(learningState) {
  return JSON.parse(JSON.stringify(learningState));
}

function normalizeLimit(value) {
  if (value === "all") {
    return Number.POSITIVE_INFINITY;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError("Der Schreibumfang muss positiv oder 'all' sein.");
  }
  return number;
}

function uniqueWords(words) {
  const seen = new Set();
  return (Array.isArray(words) ? words : []).filter((word) => {
    if (!word?.id || seen.has(word.id)) {
      return false;
    }
    seen.add(word.id);
    return true;
  });
}

function requireRandomValue(randomFn) {
  const value = randomFn();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Die Zufallsfunktion muss einen Wert von 0 bis unter 1 liefern.");
  }
  return value;
}

function uniqueAcceptedAnswers(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((answers, value) => {
    const answer = typeof value === "string" ? value.trim() : "";
    const normalized = normalizeWrittenAnswer(answer);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      answers.push(answer);
    }
    return answers;
  }, []);
}

function createWritingPrompt(word, direction, randomFn, preferCloze = false) {
  const concreteDirection = direction === WRITING_DIRECTIONS.MIXED
    ? (requireRandomValue(randomFn) < 0.5
      ? WRITING_DIRECTIONS.SOURCE_TO_TARGET
      : WRITING_DIRECTIONS.TARGET_TO_SOURCE)
    : direction;

  if (!CONCRETE_DIRECTIONS.has(concreteDirection)) {
    throw new TypeError(`Unbekannte Schreibrichtung: ${direction}`);
  }

  const source = typeof word?.source === "string" ? word.source.trim() : "";
  const targets = uniqueAcceptedAnswers(word?.targets);
  if (!normalizeWrittenAnswer(source) || targets.length === 0) {
    return null;
  }

  if (
    preferCloze
    && direction !== WRITING_DIRECTIONS.SOURCE_TO_TARGET
  ) {
    const cloze = createWritingCloze(word);
    if (cloze) {
      return {
        wordId: word.id,
        type: "cloze",
        direction: WRITING_DIRECTIONS.TARGET_TO_SOURCE,
        prompt: cloze.prompt,
        originalExample: cloze.original,
        acceptedAnswers: [source],
        phonetic: "",
        hasHint: Boolean(typeof word.hint === "string" && word.hint.trim()),
      };
    }
  }

  if (concreteDirection === WRITING_DIRECTIONS.SOURCE_TO_TARGET) {
    return {
      wordId: word.id,
      type: "translation",
      direction: concreteDirection,
      prompt: source,
      acceptedAnswers: targets,
      phonetic: typeof word.phonetic === "string" ? word.phonetic.trim() : "",
      hasHint: Boolean(typeof word.hint === "string" && word.hint.trim()),
    };
  }

  const promptIndex = Math.floor(requireRandomValue(randomFn) * targets.length);
  return {
    wordId: word.id,
    type: "translation",
    direction: concreteDirection,
    prompt: targets[promptIndex],
    acceptedAnswers: [source],
    phonetic: "",
    hasHint: Boolean(typeof word.hint === "string" && word.hint.trim()),
  };
}

/** Coordinates prompt generation, writing flow and persistent Core updates. */
export function createWritingController(options = {}) {
  const allAvailableWords = uniqueWords(options.words ?? []);
  const wordMap = new Map(allAvailableWords.map((word) => [word.id, word]));
  const adapters = {
    markCorrect: options.markCorrect ?? markWordCorrect,
    markWrong: options.markWrong ?? markWordWrong,
    save: options.save ?? saveLearningState,
    now: options.now ?? (() => new Date()),
    random: options.randomFn ?? Math.random,
  };

  let learningState = options.learningState;
  let writing = null;
  let transitioning = false;
  let error = null;
  let lastStartConfig = null;

  function getCurrentWord() {
    return writing?.currentPrompt
      ? wordMap.get(writing.currentPrompt.wordId) ?? null
      : null;
  }

  function getSnapshot() {
    const wrongWordIds = writing ? getWrongWritingWordIds(writing) : [];
    return {
      writing,
      currentWord: getCurrentWord(),
      learningState,
      transitioning,
      error,
      summary: writing ? getWritingSummary(writing) : null,
      wrongEntries: writing
        ? writing.results
          .filter((result) => !result.isCorrect)
          .map((result) => ({
            result,
            word: wordMap.get(result.wordId) ?? null,
          }))
          .filter(({ word }) => Boolean(word))
        : [],
      wrongWords: wrongWordIds.map((wordId) => wordMap.get(wordId)).filter(Boolean),
    };
  }

  function startWriting(config = {}) {
    const sourceWords = uniqueWords(config.words);
    if (sourceWords.length === 0) {
      writing = null;
      error = EMPTY_SOURCE_MESSAGE;
      return { ok: false, reason: "empty-source", ...getSnapshot() };
    }

    if (sourceWords.some((word) => !wordMap.has(word.id))) {
      writing = null;
      error = INVALID_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    const normalizedLimit = normalizeLimit(config.limit ?? "all");
    const desiredCount = Math.min(sourceWords.length, normalizedLimit);
    const prompts = [];
    const skippedWordIds = [];

    for (const word of shuffleOptions(sourceWords, adapters.random)) {
      const prompt = createWritingPrompt(
        word,
        config.direction ?? WRITING_DIRECTIONS.MIXED,
        adapters.random,
        prompts.length % 3 === 2,
      );
      if (prompt) prompts.push(prompt);
      else skippedWordIds.push(word.id);

      if (prompts.length >= desiredCount) break;
    }

    if (prompts.length === 0) {
      writing = null;
      error = INVALID_ANSWER_DATA_MESSAGE;
      return {
        ok: false,
        reason: "invalid-answer-data",
        skippedWordIds,
        ...getSnapshot(),
      };
    }

    writing = createWritingState({
      sessionId: config.sessionId ?? null,
      sourceType: config.sourceType ?? "current-unit",
      direction: config.direction ?? WRITING_DIRECTIONS.MIXED,
      prompts,
      skippedWordIds,
      requestedAmount: config.limit ?? "all",
      availableWordCount: sourceWords.length,
    });
    lastStartConfig = {
      sourceType: config.sourceType ?? "current-unit",
      direction: config.direction ?? WRITING_DIRECTIONS.MIXED,
      words: sourceWords,
      limit: config.limit ?? "all",
    };
    error = null;
    return {
      ok: true,
      usedWordCount: prompts.length,
      requestedWordCount: normalizedLimit,
      availableWordCount: sourceWords.length,
      skippedWordIds,
      ...getSnapshot(),
    };
  }

  function updateAnswer(value) {
    if (transitioning || !writing || writing.completed || writing.answerSubmitted) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }
    if (!setWritingAnswer(writing, value)) {
      return { ok: false, reason: "invalid-answer", ...getSnapshot() };
    }
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function showHint() {
    if (transitioning || !writing || !revealWritingHint(writing)) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function persistResult(result) {
    const candidateState = cloneLearningState(learningState);
    const mutation = result.isCorrect ? adapters.markCorrect : adapters.markWrong;

    try {
      mutation(candidateState, result.wordId, adapters.now(), {
        retrievalType: RETRIEVAL_TYPES.ACTIVE,
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

  function submitAnswer() {
    if (transitioning) {
      return { ok: false, reason: "transitioning", ...getSnapshot() };
    }
    if (!writing || writing.completed || writing.answerSubmitted) {
      return { ok: false, reason: "already-submitted", ...getSnapshot() };
    }
    if (!normalizeWrittenAnswer(writing.userAnswer)) {
      error = EMPTY_ANSWER_MESSAGE;
      return { ok: false, reason: "empty-answer", ...getSnapshot() };
    }
    if (!getCurrentWord()) {
      error = INVALID_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    transitioning = true;
    try {
      const result = createCurrentWritingResult(writing, adapters.now());
      const persistence = persistResult(result);
      if (!persistence.ok) {
        return { ...persistence, ...getSnapshot() };
      }
      recordWritingResult(writing, result);
      return { ok: true, result, ...getSnapshot() };
    } finally {
      transitioning = false;
    }
  }

  function nextPrompt() {
    if (transitioning || !writing || writing.completed || !writing.answerSubmitted) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }
    advanceWritingPrompt(writing);
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function restartWriting(overrides = {}) {
    return lastStartConfig
      ? startWriting({ ...lastStartConfig, ...overrides })
      : { ok: false, reason: "unavailable", ...getSnapshot() };
  }

  function discardWriting() {
    writing = null;
    error = null;
    transitioning = false;
  }

  function replaceLearningState(nextLearningState) {
    learningState = nextLearningState;
    error = null;
  }

  return Object.freeze({
    discardWriting,
    getLearningState: () => learningState,
    getSnapshot,
    getWrongWordIds: () => writing ? getWrongWritingWordIds(writing) : [],
    nextPrompt,
    replaceLearningState,
    restartWriting,
    showHint,
    startWriting,
    submitAnswer,
    updateAnswer,
  });
}
