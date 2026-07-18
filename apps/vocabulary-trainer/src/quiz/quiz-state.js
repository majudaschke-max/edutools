import {
  isQuizAnswerCorrect,
  normalizeQuizAnswer,
} from "./quiz-generator.js";

function requireQuizState(state) {
  if (!state || state.mode !== "quiz" || !Array.isArray(state.wordIds)) {
    throw new TypeError("Der Quiz-Zustand ist ungültig.");
  }
}

function toAnsweredAt(value) {
  const timestamp = new Date(value).toISOString();
  return timestamp;
}

/** Creates a transient quiz session from already generated questions. */
export function createQuizState(options = {}) {
  const questions = Array.isArray(options.questions) ? [...options.questions] : [];
  const wordIds = questions.map((question) => question.wordId);

  return {
    sessionId: options.sessionId ?? null,
    mode: "quiz",
    sourceType: options.sourceType ?? "current-unit",
    direction: options.direction ?? "mixed",
    wordIds,
    currentIndex: 0,
    currentQuestion: questions[0] ?? null,
    selectedAnswer: null,
    answerSubmitted: false,
    results: [],
    completed: questions.length === 0,
    questions,
    skippedWordIds: [...(options.skippedWordIds ?? [])],
    requestedAmount: options.requestedAmount ?? "all",
    availableWordCount: options.availableWordCount ?? wordIds.length,
  };
}

/** Selects one of the current question's exact visible options. */
export function selectQuizAnswer(state, answer) {
  requireQuizState(state);

  if (state.completed || state.answerSubmitted || !state.currentQuestion) {
    return false;
  }

  const normalizedAnswer = normalizeQuizAnswer(answer);
  const matchingOption = state.currentQuestion.options.find(
    (option) => normalizeQuizAnswer(option) === normalizedAnswer,
  );

  if (!matchingOption) {
    return false;
  }

  state.selectedAnswer = matchingOption;
  return true;
}

/** Creates, but does not yet record, the result for the current answer. */
export function createCurrentQuizResult(state, answeredAt = new Date()) {
  requireQuizState(state);

  if (
    state.completed
    || state.answerSubmitted
    || !state.currentQuestion
    || !state.selectedAnswer
  ) {
    return null;
  }

  return {
    wordId: state.currentQuestion.wordId,
    direction: state.currentQuestion.direction,
    selectedAnswer: state.selectedAnswer,
    correctAnswers: [...state.currentQuestion.correctAnswers],
    isCorrect: isQuizAnswerCorrect(
      state.currentQuestion,
      state.selectedAnswer,
    ),
    answeredAt: toAnsweredAt(answeredAt),
  };
}

/** Records an evaluated result exactly once without advancing automatically. */
export function recordQuizResult(state, result) {
  requireQuizState(state);

  if (
    state.completed
    || state.answerSubmitted
    || !result
    || result.wordId !== state.currentQuestion?.wordId
  ) {
    return false;
  }

  state.results.push({
    ...result,
    correctAnswers: [...result.correctAnswers],
  });
  state.answerSubmitted = true;
  return true;
}

/** Advances after feedback or marks the quiz complete after the last result. */
export function advanceQuizQuestion(state) {
  requireQuizState(state);

  if (state.completed || !state.answerSubmitted) {
    return false;
  }

  state.currentIndex += 1;
  state.selectedAnswer = null;
  state.answerSubmitted = false;

  if (state.currentIndex >= state.questions.length) {
    state.currentQuestion = null;
    state.completed = true;
    return true;
  }

  state.currentQuestion = state.questions[state.currentIndex];
  return true;
}

/** Returns visual and screenreader progress values. */
export function getQuizProgress(state) {
  requireQuizState(state);
  const total = state.wordIds.length;

  return {
    current: state.completed ? total : Math.min(state.currentIndex + 1, total),
    completed: state.results.length,
    total,
  };
}

/** Returns each incorrectly answered word once, in result order. */
export function getWrongQuizWordIds(state) {
  requireQuizState(state);
  return [...new Set(
    state.results
      .filter((result) => !result.isCorrect)
      .map((result) => result.wordId),
  )];
}

/** Calculates the completion summary from recorded answers. */
export function getQuizSummary(state) {
  requireQuizState(state);
  const questionCount = state.results.length;
  const correctCount = state.results.filter((result) => result.isCorrect).length;
  const wrongCount = questionCount - correctCount;

  return {
    questionCount,
    correctCount,
    wrongCount,
    successRate: questionCount === 0
      ? 0
      : Math.round((correctCount / questionCount) * 100),
    wrongWordIds: getWrongQuizWordIds(state),
  };
}
