import { isDifficultState, isMarkedState } from "./learning-rules.js";

const MINUTE_IN_MILLISECONDS = 60 * 1000;
const DAY_IN_MILLISECONDS = 24 * 60 * MINUTE_IN_MILLISECONDS;

// Version 1 deliberately uses a small, transparent interval table.
const REVIEW_INTERVALS_IN_MILLISECONDS = Object.freeze([
  10 * MINUTE_IN_MILLISECONDS,
  DAY_IN_MILLISECONDS,
  3 * DAY_IN_MILLISECONDS,
  7 * DAY_IN_MILLISECONDS,
  14 * DAY_IN_MILLISECONDS,
  30 * DAY_IN_MILLISECONDS,
]);

function parseTimestamp(value) {
  const timestamp = value instanceof Date
    ? value.getTime()
    : new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getNowTimestamp(now) {
  const timestamp = parseTimestamp(now ?? Date.now());

  if (timestamp === null) {
    throw new TypeError("Der aktuelle Zeitpunkt ist ungültig.");
  }

  return timestamp;
}

function getState(learningState, wordId) {
  return learningState?.words?.[wordId] ?? null;
}

function getUniqueWords(words) {
  if (!Array.isArray(words)) {
    return [];
  }

  const seenWordIds = new Set();

  return words.filter((word) => {
    if (!word || typeof word.id !== "string" || word.id.length === 0) {
      return false;
    }

    if (seenWordIds.has(word.id)) {
      return false;
    }

    seenWordIds.add(word.id);
    return true;
  });
}

function isNewState(state) {
  if (!state) {
    return true;
  }

  const correctCount = Number(state.correctCount ?? 0);
  const wrongCount = Number(state.wrongCount ?? 0);

  return correctCount === 0
    && wrongCount === 0
    && state.lastSeenAt == null;
}

function normalizeLimit(value) {
  if (value == null) {
    return Number.POSITIVE_INFINITY;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return numericValue === Number.POSITIVE_INFINITY
      ? numericValue
      : 0;
  }

  return Math.max(0, Math.floor(numericValue));
}

function getWordUnitId(word) {
  return word?.unitId ?? word?.unit?.id ?? null;
}

/**
 * Calculates the next review time for a learning level as an ISO-8601 string.
 *
 * @param {number} level Review level from 0 through 5.
 * @param {Date|string|number} [now] Date, ISO value, or epoch timestamp.
 * @returns {string} The scheduled review time.
 */
export function calculateNextReviewAt(level, now = Date.now()) {
  const normalizedLevel = Number(level);

  if (
    !Number.isInteger(normalizedLevel)
    || normalizedLevel < 0
    || normalizedLevel >= REVIEW_INTERVALS_IN_MILLISECONDS.length
  ) {
    throw new RangeError("Das Lernlevel muss eine ganze Zahl zwischen 0 und 5 sein.");
  }

  const nextReviewTimestamp = getNowTimestamp(now)
    + REVIEW_INTERVALS_IN_MILLISECONDS[normalizedLevel];

  return new Date(nextReviewTimestamp).toISOString();
}

/**
 * Checks whether a word state has reached its scheduled review time.
 *
 * @param {object|null|undefined} wordState Stored state for one word.
 * @param {Date|string|number} [now] Date, ISO value, or epoch timestamp.
 * @returns {boolean} Whether the word is due.
 */
export function isDueForReview(wordState, now = Date.now()) {
  if (!wordState?.nextReviewAt) {
    return false;
  }

  const nextReviewTimestamp = parseTimestamp(wordState.nextReviewAt);

  return nextReviewTimestamp !== null
    && nextReviewTimestamp <= getNowTimestamp(now);
}

/**
 * Returns due words ordered by their earliest review time.
 *
 * @param {Array<object>} words Available words.
 * @param {object} learningState Course learning state in `{ words: {} }` form.
 * @param {Date|string|number} [now] Date, ISO value, or epoch timestamp.
 * @returns {Array<object>} Due words in stable order.
 */
export function getDueWords(words, learningState, now = Date.now()) {
  const nowTimestamp = getNowTimestamp(now);

  return getUniqueWords(words)
    .map((word, originalIndex) => ({
      word,
      originalIndex,
      state: getState(learningState, word.id),
    }))
    .filter(({ state }) => isDueForReview(state, nowTimestamp))
    .sort((left, right) => {
      const leftReviewAt = parseTimestamp(left.state.nextReviewAt);
      const rightReviewAt = parseTimestamp(right.state.nextReviewAt);
      const chronologicalOrder = leftReviewAt - rightReviewAt;

      return chronologicalOrder || left.originalIndex - right.originalIndex;
    })
    .map(({ word }) => word);
}

/**
 * Returns words whose stored learning state meets the difficult-word rules.
 *
 * @param {Array<object>} words Available words.
 * @param {object} learningState Course learning state in `{ words: {} }` form.
 * @returns {Array<object>} Difficult words in their original order.
 */
export function getDifficultWords(words, learningState) {
  return getUniqueWords(words).filter((word) => {
    const state = getState(learningState, word.id);
    return Boolean(state && isDifficultState(state));
  });
}

/**
 * Returns manually marked words.
 *
 * @param {Array<object>} words Available words.
 * @param {object} learningState Course learning state in `{ words: {} }` form.
 * @returns {Array<object>} Marked words in their original order.
 */
export function getMarkedWords(words, learningState) {
  return getUniqueWords(words).filter((word) => {
    const state = getState(learningState, word.id);
    return Boolean(state && isMarkedState(state));
  });
}

/**
 * Returns words that have never been answered, including marked-only words.
 *
 * @param {Array<object>} words Available words.
 * @param {object} learningState Course learning state in `{ words: {} }` form.
 * @returns {Array<object>} New words in their original order.
 */
export function getNewWords(words, learningState) {
  return getUniqueWords(words).filter((word) => (
    isNewState(getState(learningState, word.id))
  ));
}

/**
 * Builds a duplicate-free daily set: due reviews, difficult words, then new
 * words from the current unit.
 *
 * @param {object} options Scheduler inputs.
 * @param {Array<object>} options.words Available words.
 * @param {string} options.currentUnitId Lernpaket from which new words are selected.
 * @param {object} options.learningState Course learning state.
 * @param {number} options.maxNewWords Maximum number of new words.
 * @param {number} options.maxReviewWords Shared limit for due and difficult words.
 * @param {Date|string|number} [options.now] Current time.
 * @returns {{reviewWords: Array<object>, difficultWords: Array<object>, newWords: Array<object>, allWords: Array<object>}}
 * The categorized daily learning set.
 */
export function buildDailyLearningSet(options = {}) {
  const {
    words = [],
    currentUnitId,
    learningState = { words: {} },
    maxNewWords,
    maxReviewWords,
    now = Date.now(),
  } = options;

  const uniqueWords = getUniqueWords(words);
  const reviewLimit = normalizeLimit(maxReviewWords);
  const newLimit = normalizeLimit(maxNewWords);
  const includedWordIds = new Set();

  const reviewWords = getDueWords(uniqueWords, learningState, now)
    .slice(0, reviewLimit);

  reviewWords.forEach((word) => includedWordIds.add(word.id));

  const remainingReviewCapacity = Math.max(0, reviewLimit - reviewWords.length);
  const difficultWords = getDifficultWords(uniqueWords, learningState)
    .filter((word) => !includedWordIds.has(word.id))
    .slice(0, remainingReviewCapacity);

  difficultWords.forEach((word) => includedWordIds.add(word.id));

  const newWords = getNewWords(uniqueWords, learningState)
    .filter((word) => (
      getWordUnitId(word) === currentUnitId
      && !includedWordIds.has(word.id)
    ))
    .slice(0, newLimit);

  newWords.forEach((word) => includedWordIds.add(word.id));

  return {
    reviewWords,
    difficultWords,
    newWords,
    allWords: [...reviewWords, ...difficultWords, ...newWords],
  };
}
