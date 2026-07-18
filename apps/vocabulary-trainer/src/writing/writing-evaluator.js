const TRAILING_SENTENCE_PUNCTUATION = /[.!?…;:。！？]+$/u;
const APOSTROPHE_VARIANTS = /[‘’‛ʼ]/gu;

/**
 * Normalizes only typographical differences that do not change the answer.
 * Spelling, word order, grammatical form and internal wording stay intact.
 */
export function normalizeWrittenAnswer(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(APOSTROPHE_VARIANTS, "'")
    .trim()
    .replace(TRAILING_SENTENCE_PUNCTUATION, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
}

function normalizeAcceptedAnswers(acceptedAnswers) {
  if (!Array.isArray(acceptedAnswers)) {
    return [];
  }

  const seen = new Set();
  return acceptedAnswers.reduce((answers, answer) => {
    const displayAnswer = typeof answer === "string" ? answer.trim() : "";
    const normalizedAnswer = normalizeWrittenAnswer(displayAnswer);

    if (normalizedAnswer && !seen.has(normalizedAnswer)) {
      seen.add(normalizedAnswer);
      answers.push({ displayAnswer, normalizedAnswer });
    }

    return answers;
  }, []);
}

/** Returns the original stored answer matching the normalized user input. */
export function findMatchingAnswer(userAnswer, acceptedAnswers) {
  const normalizedUserAnswer = normalizeWrittenAnswer(userAnswer);
  if (!normalizedUserAnswer) {
    return null;
  }

  return normalizeAcceptedAnswers(acceptedAnswers)
    .find(({ normalizedAnswer }) => normalizedAnswer === normalizedUserAnswer)
    ?.displayAnswer ?? null;
}

/** Evaluates one written answer without applying language-specific guesses. */
export function evaluateWrittenAnswer(userAnswer, acceptedAnswers) {
  const normalizedUserAnswer = normalizeWrittenAnswer(userAnswer);
  const normalizedAnswers = normalizeAcceptedAnswers(acceptedAnswers);
  const match = normalizedAnswers.find(
    ({ normalizedAnswer }) => normalizedAnswer === normalizedUserAnswer,
  );

  return {
    normalizedUserAnswer,
    normalizedAcceptedAnswers: normalizedAnswers.map(
      ({ normalizedAnswer }) => normalizedAnswer,
    ),
    isCorrect: Boolean(normalizedUserAnswer && match),
    matchedAnswer: match?.displayAnswer ?? null,
  };
}
