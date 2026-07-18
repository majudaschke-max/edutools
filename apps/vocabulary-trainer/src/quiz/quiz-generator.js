export const QUIZ_DIRECTIONS = Object.freeze({
  MIXED: "mixed",
  SOURCE_TO_TARGET: "source-to-target",
  TARGET_TO_SOURCE: "target-to-source",
});

const CONCRETE_DIRECTIONS = new Set([
  QUIZ_DIRECTIONS.SOURCE_TO_TARGET,
  QUIZ_DIRECTIONS.TARGET_TO_SOURCE,
]);

function requireRandomValue(randomFn) {
  const value = randomFn();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Die Zufallsfunktion muss einen Wert von 0 bis unter 1 liefern.");
  }

  return value;
}

function getUniqueTargets(word) {
  if (!Array.isArray(word?.targets)) {
    return [];
  }

  const seen = new Set();
  return word.targets.reduce((targets, value) => {
    const displayValue = typeof value === "string" ? value.trim() : "";
    const normalizedValue = normalizeQuizAnswer(displayValue);

    if (normalizedValue && !seen.has(normalizedValue)) {
      seen.add(normalizedValue);
      targets.push(displayValue);
    }

    return targets;
  }, []);
}

function isUsableWord(word) {
  return typeof word?.id === "string"
    && word.id.trim().length > 0
    && normalizeQuizAnswer(word.source).length > 0
    && getUniqueTargets(word).length > 0;
}

function getAnswerData(word, direction, randomFn) {
  const targets = getUniqueTargets(word);

  if (direction === QUIZ_DIRECTIONS.SOURCE_TO_TARGET) {
    return {
      correctAnswers: targets,
      correctOption: targets.join(" / "),
      phonetic: typeof word.phonetic === "string" ? word.phonetic.trim() : "",
      prompt: word.source.trim(),
    };
  }

  const targetIndex = Math.floor(requireRandomValue(randomFn) * targets.length);
  return {
    correctAnswers: [word.source.trim()],
    correctOption: word.source.trim(),
    phonetic: "",
    prompt: targets[targetIndex],
  };
}

function getCandidateAnswer(word, direction) {
  return direction === QUIZ_DIRECTIONS.SOURCE_TO_TARGET
    ? getUniqueTargets(word).join(" / ")
    : String(word.source ?? "").trim();
}

function overlapsCorrectAnswers(candidate, currentWord, direction) {
  if (direction === QUIZ_DIRECTIONS.TARGET_TO_SOURCE) {
    return normalizeQuizAnswer(candidate.source)
      === normalizeQuizAnswer(currentWord.source);
  }

  const correctVariants = new Set(
    getUniqueTargets(currentWord).map(normalizeQuizAnswer),
  );
  return getUniqueTargets(candidate)
    .some((target) => correctVariants.has(normalizeQuizAnswer(target)));
}

/** Normalizes answer text for comparisons and duplicate prevention. */
export function normalizeQuizAnswer(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

/** Returns a shuffled copy using an injectable Fisher-Yates implementation. */
export function shuffleOptions(options, randomFn = Math.random) {
  if (!Array.isArray(options)) {
    throw new TypeError("Die zu mischenden Optionen müssen ein Array sein.");
  }

  if (typeof randomFn !== "function") {
    throw new TypeError("randomFn muss eine Funktion sein.");
  }

  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(requireRandomValue(randomFn) * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

/**
 * Selects distinct distractors, preferring the current unit before falling
 * back to all other available units.
 */
export function createDistractors(
  word,
  allAvailableWords,
  direction,
  count = 3,
  options = {},
) {
  if (!isUsableWord(word) || !Array.isArray(allAvailableWords)) {
    return [];
  }

  if (!CONCRETE_DIRECTIONS.has(direction)) {
    throw new TypeError(`Unbekannte konkrete Fragerichtung: ${direction}`);
  }

  const desiredCount = Math.max(0, Math.floor(Number(count) || 0));
  const randomFn = options.randomFn ?? Math.random;
  const candidates = allAvailableWords.filter((candidate) => (
    isUsableWord(candidate)
    && candidate.id !== word.id
    && !overlapsCorrectAnswers(candidate, word, direction)
  ));
  const sameUnit = shuffleOptions(
    candidates.filter((candidate) => candidate.unitId === word.unitId),
    randomFn,
  );
  const otherUnits = shuffleOptions(
    candidates.filter((candidate) => candidate.unitId !== word.unitId),
    randomFn,
  );
  const seenAnswers = new Set();
  const distractors = [];

  for (const candidate of [...sameUnit, ...otherUnits]) {
    const answer = getCandidateAnswer(candidate, direction);
    const normalizedAnswer = normalizeQuizAnswer(answer);

    if (!normalizedAnswer || seenAnswers.has(normalizedAnswer)) {
      continue;
    }

    seenAnswers.add(normalizedAnswer);
    distractors.push(answer);

    if (distractors.length >= desiredCount) {
      break;
    }
  }

  return distractors;
}

function createClozeQuestion(word, scopeWords, randomFn, distractorCount) {
  const cloze = createQuizCloze(word);
  if (!cloze) return null;
  const candidates = (Array.isArray(scopeWords) ? scopeWords : [])
    .filter((candidate) => (
      isUsableWord(candidate)
      && candidate.id !== word.id
      && haveCompatibleStoredPartOfSpeech(word, candidate)
      && normalizeQuizAnswer(candidate.source) !== normalizeQuizAnswer(word.source)
    ));
  const seen = new Set([normalizeQuizAnswer(word.source)]);
  const distractors = [];
  for (const candidate of shuffleOptions(candidates, randomFn)) {
    const answer = String(candidate.source ?? "").trim();
    const normalized = normalizeQuizAnswer(answer);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    distractors.push(answer);
    if (distractors.length >= distractorCount) break;
  }
  if (distractors.length < distractorCount) return null;
  return {
    wordId: word.id,
    type: "cloze",
    direction: QUIZ_DIRECTIONS.TARGET_TO_SOURCE,
    prompt: cloze.prompt,
    originalExample: cloze.original,
    phonetic: "",
    correctAnswers: [word.source.trim()],
    correctOption: word.source.trim(),
    options: shuffleOptions([word.source.trim(), ...distractors], randomFn),
  };
}

/** Creates one UI-neutral multiple-choice question or `null` if unusable. */
export function createQuizQuestion(
  word,
  allAvailableWords,
  direction,
  options = {},
) {
  if (!isUsableWord(word) || !Array.isArray(allAvailableWords)) {
    return null;
  }

  const randomFn = options.randomFn ?? Math.random;
  if (options.preferCloze === true) {
    const clozeQuestion = createClozeQuestion(
      word,
      options.scopeWords ?? allAvailableWords,
      randomFn,
      options.distractorCount ?? 3,
    );
    if (clozeQuestion) return clozeQuestion;
  }
  const concreteDirection = direction === QUIZ_DIRECTIONS.MIXED
    ? (requireRandomValue(randomFn) < 0.5
      ? QUIZ_DIRECTIONS.SOURCE_TO_TARGET
      : QUIZ_DIRECTIONS.TARGET_TO_SOURCE)
    : direction;

  if (!CONCRETE_DIRECTIONS.has(concreteDirection)) {
    throw new TypeError(`Unbekannte Fragerichtung: ${direction}`);
  }

  const answerData = getAnswerData(word, concreteDirection, randomFn);
  const distractors = createDistractors(
    word,
    allAvailableWords,
    concreteDirection,
    options.distractorCount ?? 3,
    { randomFn },
  );
  const answerOptions = shuffleOptions(
    [answerData.correctOption, ...distractors],
    randomFn,
  );

  if (answerOptions.length < 2) {
    return null;
  }

  return {
    wordId: word.id,
    type: "translation",
    direction: concreteDirection,
    prompt: answerData.prompt,
    phonetic: answerData.phonetic,
    correctAnswers: answerData.correctAnswers,
    correctOption: answerData.correctOption,
    options: answerOptions,
  };
}

/** Checks both the combined display option and every stored valid variant. */
export function isQuizAnswerCorrect(question, selectedAnswer) {
  const normalizedSelection = normalizeQuizAnswer(selectedAnswer);

  if (!normalizedSelection || !question) {
    return false;
  }

  const validAnswers = [
    question.correctOption,
    ...(question.correctAnswers ?? []),
  ].map(normalizeQuizAnswer);

  return validAnswers.includes(normalizedSelection);
}
import {
  createQuizCloze,
  haveCompatibleStoredPartOfSpeech,
} from "../core/cloze.js";
