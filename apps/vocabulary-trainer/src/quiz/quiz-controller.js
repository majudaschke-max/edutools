import {
  markWordCorrect,
  markWordWrong,
  RETRIEVAL_TYPES,
  saveLearningState,
} from "../core/learning-state.js";
import {
  createQuizQuestion,
  shuffleOptions,
} from "./quiz-generator.js";
import {
  advanceQuizQuestion,
  createCurrentQuizResult,
  createQuizState,
  getQuizSummary,
  getWrongQuizWordIds,
  recordQuizResult,
  selectQuizAnswer,
} from "./quiz-state.js?v=4.0.5";

const EMPTY_SOURCE_MESSAGE = "Für diese Lernquelle sind aktuell keine Wörter verfügbar.";
const INSUFFICIENT_OPTIONS_MESSAGE = "Für diese Auswahl gibt es nicht genügend eindeutige Antwortmöglichkeiten.";
const MISSING_WORD_MESSAGE = "Ein Wort dieses Quiz ist nicht mehr verfügbar. Bitte starte das Quiz erneut.";
const NO_SELECTION_MESSAGE = "Bitte wähle zuerst eine Antwort.";
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
    throw new TypeError("Der Quizumfang muss positiv oder 'all' sein.");
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

/** Coordinates quiz generation, transient flow and persistent Core updates. */
export function createQuizController(options = {}) {
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
  let quiz = null;
  let transitioning = false;
  let error = null;
  let lastStartConfig = null;

  function getCurrentWord() {
    return quiz?.currentQuestion
      ? wordMap.get(quiz.currentQuestion.wordId) ?? null
      : null;
  }

  function getSnapshot() {
    const wrongWordIds = quiz ? getWrongQuizWordIds(quiz) : [];
    return {
      quiz,
      currentWord: getCurrentWord(),
      learningState,
      transitioning,
      error,
      summary: quiz ? getQuizSummary(quiz) : null,
      wrongWords: wrongWordIds.map((wordId) => wordMap.get(wordId)).filter(Boolean),
    };
  }

  function startQuiz(config = {}) {
    const sourceWords = uniqueWords(config.words);
    if (sourceWords.length === 0) {
      quiz = null;
      error = EMPTY_SOURCE_MESSAGE;
      return { ok: false, reason: "empty-source", ...getSnapshot() };
    }

    const missingWord = sourceWords.find((word) => !wordMap.has(word.id));
    if (missingWord) {
      quiz = null;
      error = MISSING_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    const normalizedLimit = normalizeLimit(config.limit ?? "all");
    const desiredCount = Math.min(sourceWords.length, normalizedLimit);
    const questions = [];
    const skippedWordIds = [];
    const shuffledWords = shuffleOptions(sourceWords, adapters.random);

    for (const word of shuffledWords) {
      const question = createQuizQuestion(
        word,
        allAvailableWords,
        config.direction ?? "mixed",
        {
          randomFn: adapters.random,
          preferCloze: questions.length % 3 === 2,
          scopeWords: sourceWords,
        },
      );

      if (question) {
        questions.push(question);
      } else {
        skippedWordIds.push(word.id);
      }

      if (questions.length >= desiredCount) {
        break;
      }
    }

    if (questions.length === 0) {
      quiz = null;
      error = INSUFFICIENT_OPTIONS_MESSAGE;
      return {
        ok: false,
        reason: "insufficient-options",
        skippedWordIds,
        ...getSnapshot(),
      };
    }

    quiz = createQuizState({
      sessionId: config.sessionId ?? null,
      sourceType: config.sourceType ?? "current-unit",
      direction: config.direction ?? "mixed",
      questions,
      skippedWordIds,
      requestedAmount: config.limit ?? "all",
      availableWordCount: sourceWords.length,
    });
    lastStartConfig = {
      sourceType: config.sourceType ?? "current-unit",
      direction: config.direction ?? "mixed",
      words: sourceWords,
      limit: config.limit ?? "all",
    };
    error = null;
    return {
      ok: true,
      usedWordCount: questions.length,
      requestedWordCount: normalizedLimit,
      availableWordCount: sourceWords.length,
      skippedWordIds,
      ...getSnapshot(),
    };
  }

  function selectAnswer(answer) {
    if (transitioning || !quiz || quiz.completed || quiz.answerSubmitted) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    if (!selectQuizAnswer(quiz, answer)) {
      return { ok: false, reason: "invalid-answer", ...getSnapshot() };
    }

    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function selectAnswerByIndex(index) {
    const answer = quiz?.currentQuestion?.options?.[index];
    return answer === undefined
      ? { ok: false, reason: "invalid-answer", ...getSnapshot() }
      : selectAnswer(answer);
  }

  function moveSelection(step) {
    const answerOptions = quiz?.currentQuestion?.options ?? [];
    if (!quiz || quiz.answerSubmitted || answerOptions.length === 0) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    const currentIndex = answerOptions.indexOf(quiz.selectedAnswer);
    const nextIndex = currentIndex === -1
      ? (step < 0 ? answerOptions.length - 1 : 0)
      : (currentIndex + step + answerOptions.length) % answerOptions.length;
    return selectAnswer(answerOptions[nextIndex]);
  }

  function persistResult(result) {
    const candidateState = cloneLearningState(learningState);
    const mutation = result.isCorrect ? adapters.markCorrect : adapters.markWrong;

    try {
      mutation(candidateState, result.wordId, adapters.now(), {
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

  function submitAnswer() {
    if (transitioning) {
      return { ok: false, reason: "transitioning", ...getSnapshot() };
    }

    if (!quiz || quiz.completed || quiz.answerSubmitted) {
      return { ok: false, reason: "already-submitted", ...getSnapshot() };
    }

    if (!quiz.selectedAnswer) {
      error = NO_SELECTION_MESSAGE;
      return { ok: false, reason: "no-selection", ...getSnapshot() };
    }

    if (!getCurrentWord()) {
      error = MISSING_WORD_MESSAGE;
      return { ok: false, reason: "missing-word", ...getSnapshot() };
    }

    transitioning = true;
    try {
      const result = createCurrentQuizResult(quiz, adapters.now());
      const persistence = persistResult(result);

      if (!persistence.ok) {
        return { ...persistence, ...getSnapshot() };
      }

      recordQuizResult(quiz, result);
      return { ok: true, result, ...getSnapshot() };
    } finally {
      transitioning = false;
    }
  }

  function nextQuestion() {
    if (transitioning || !quiz || quiz.completed || !quiz.answerSubmitted) {
      return { ok: false, reason: "unavailable", ...getSnapshot() };
    }

    advanceQuizQuestion(quiz);
    error = null;
    return { ok: true, ...getSnapshot() };
  }

  function restartQuiz(overrides = {}) {
    return lastStartConfig
      ? startQuiz({ ...lastStartConfig, ...overrides })
      : { ok: false, reason: "unavailable", ...getSnapshot() };
  }

  function discardQuiz() {
    quiz = null;
    error = null;
    transitioning = false;
  }

  function replaceLearningState(nextLearningState) {
    learningState = nextLearningState;
    error = null;
  }

  return Object.freeze({
    discardQuiz,
    getLearningState: () => learningState,
    getSnapshot,
    getWrongWordIds: () => quiz ? getWrongQuizWordIds(quiz) : [],
    moveSelection,
    nextQuestion,
    replaceLearningState,
    restartQuiz,
    selectAnswer,
    selectAnswerByIndex,
    startQuiz,
    submitAnswer,
  });
}
