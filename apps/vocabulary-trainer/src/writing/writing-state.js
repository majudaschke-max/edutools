import { evaluateWrittenAnswer } from "./writing-evaluator.js";

export const WRITING_DIRECTIONS = Object.freeze({
  MIXED: "mixed",
  SOURCE_TO_TARGET: "source-to-target",
  TARGET_TO_SOURCE: "target-to-source",
});

function requireWritingState(state) {
  if (!state || state.mode !== "write" || !Array.isArray(state.wordIds)) {
    throw new TypeError("Der Schreibtraining-Zustand ist ungültig.");
  }
}

function toAnsweredAt(value) {
  return new Date(value).toISOString();
}

/** Creates an in-memory writing session from prepared prompts. */
export function createWritingState(options = {}) {
  const prompts = Array.isArray(options.prompts) ? [...options.prompts] : [];
  const wordIds = prompts.map((prompt) => prompt.wordId);

  return {
    sessionId: options.sessionId ?? null,
    mode: "write",
    sourceType: options.sourceType ?? "current-unit",
    direction: options.direction ?? WRITING_DIRECTIONS.MIXED,
    wordIds,
    currentIndex: 0,
    currentPrompt: prompts[0] ?? null,
    userAnswer: "",
    answerSubmitted: false,
    result: null,
    results: [],
    completed: prompts.length === 0,
    hintUsed: false,
    prompts,
    skippedWordIds: [...(options.skippedWordIds ?? [])],
    requestedAmount: options.requestedAmount ?? "all",
    availableWordCount: options.availableWordCount ?? wordIds.length,
  };
}

/** Stores the current raw input while the task is still open. */
export function setWritingAnswer(state, value) {
  requireWritingState(state);

  if (state.completed || state.answerSubmitted || typeof value !== "string") {
    return false;
  }

  state.userAnswer = value;
  return true;
}

/** Reveals a stored hint without evaluating or advancing the task. */
export function revealWritingHint(state) {
  requireWritingState(state);

  if (
    state.completed
    || state.answerSubmitted
    || !state.currentPrompt?.hasHint
  ) {
    return false;
  }

  state.hintUsed = true;
  return true;
}

/** Creates, but does not yet record, the result of the current task. */
export function createCurrentWritingResult(state, answeredAt = new Date()) {
  requireWritingState(state);

  if (
    state.completed
    || state.answerSubmitted
    || !state.currentPrompt
  ) {
    return null;
  }

  const evaluation = evaluateWrittenAnswer(
    state.userAnswer,
    state.currentPrompt.acceptedAnswers,
  );

  return {
    wordId: state.currentPrompt.wordId,
    direction: state.currentPrompt.direction,
    userAnswer: state.userAnswer,
    acceptedAnswers: [...state.currentPrompt.acceptedAnswers],
    isCorrect: evaluation.isCorrect,
    matchedAnswer: evaluation.matchedAnswer,
    answeredAt: toAnsweredAt(answeredAt),
    hintUsed: state.hintUsed,
  };
}

/** Records an evaluated result exactly once and keeps feedback on screen. */
export function recordWritingResult(state, result) {
  requireWritingState(state);

  if (
    state.completed
    || state.answerSubmitted
    || !result
    || result.wordId !== state.currentPrompt?.wordId
  ) {
    return false;
  }

  const storedResult = {
    ...result,
    acceptedAnswers: [...result.acceptedAnswers],
  };
  state.results.push(storedResult);
  state.result = storedResult;
  state.answerSubmitted = true;
  return true;
}

/** Advances after explicit confirmation or completes the writing session. */
export function advanceWritingPrompt(state) {
  requireWritingState(state);

  if (state.completed || !state.answerSubmitted) {
    return false;
  }

  state.currentIndex += 1;
  state.userAnswer = "";
  state.answerSubmitted = false;
  state.result = null;
  state.hintUsed = false;

  if (state.currentIndex >= state.prompts.length) {
    state.currentPrompt = null;
    state.completed = true;
    return true;
  }

  state.currentPrompt = state.prompts[state.currentIndex];
  return true;
}

/** Returns values for both visual and screenreader progress indicators. */
export function getWritingProgress(state) {
  requireWritingState(state);
  const total = state.wordIds.length;

  return {
    current: state.completed ? total : Math.min(state.currentIndex + 1, total),
    completed: state.results.length,
    total,
  };
}

/** Returns every incorrectly written word once, in result order. */
export function getWrongWritingWordIds(state) {
  requireWritingState(state);
  return [...new Set(
    state.results
      .filter((result) => !result.isCorrect)
      .map((result) => result.wordId),
  )];
}

/** Calculates completion metrics from the immutable result records. */
export function getWritingSummary(state) {
  requireWritingState(state);
  const taskCount = state.results.length;
  const correctCount = state.results.filter((result) => result.isCorrect).length;
  const wrongCount = taskCount - correctCount;

  return {
    taskCount,
    correctCount,
    wrongCount,
    successRate: taskCount === 0
      ? 0
      : Math.round((correctCount / taskCount) * 100),
    hintCount: state.results.filter((result) => result.hintUsed).length,
    wrongWordIds: getWrongWritingWordIds(state),
  };
}
