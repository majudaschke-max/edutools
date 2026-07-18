import { shuffleOptions } from "../quiz/quiz-generator.js";

export const SPEED_DIRECTIONS = Object.freeze({
  MIXED: "mixed",
  SOURCE_TO_TARGET: "source-to-target",
  TARGET_TO_SOURCE: "target-to-source",
});

const CONCRETE_DIRECTIONS = new Set([
  SPEED_DIRECTIONS.SOURCE_TO_TARGET,
  SPEED_DIRECTIONS.TARGET_TO_SOURCE,
]);

function requireRandomValue(randomFn) {
  const value = randomFn();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Die Zufallsfunktion muss einen Wert von 0 bis unter 1 liefern.");
  }
  return value;
}

function getUniqueTargets(word) {
  const seen = new Set();
  return (Array.isArray(word?.targets) ? word.targets : []).reduce((targets, value) => {
    const target = typeof value === "string" ? value.trim() : "";
    const normalized = normalizePairText(target);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      targets.push(target);
    }
    return targets;
  }, []);
}

function isUsableWord(word) {
  return typeof word?.id === "string"
    && word.id.trim().length > 0
    && normalizePairText(word.source).length > 0
    && getUniqueTargets(word).length > 0;
}

function resolveDirection(direction, randomFn) {
  if (direction === SPEED_DIRECTIONS.MIXED) {
    return requireRandomValue(randomFn) < 0.5
      ? SPEED_DIRECTIONS.SOURCE_TO_TARGET
      : SPEED_DIRECTIONS.TARGET_TO_SOURCE;
  }
  if (!CONCRETE_DIRECTIONS.has(direction)) {
    throw new TypeError(`Unbekannte Speed-Richtung: ${direction}`);
  }
  return direction;
}

function createItem(pair, side) {
  return {
    id: side === "left" ? pair.leftId : pair.rightId,
    wordId: pair.wordId,
    text: side === "left" ? pair.leftText : pair.rightText,
    side,
  };
}

function removeAlignedPairs(leftItems, rightItems) {
  if (leftItems.length < 2) {
    return rightItems;
  }

  const arranged = [];
  const used = new Set();

  function place(position) {
    if (position >= leftItems.length) return true;

    for (let index = 0; index < rightItems.length; index += 1) {
      if (used.has(index) || rightItems[index].wordId === leftItems[position].wordId) {
        continue;
      }
      used.add(index);
      arranged[position] = rightItems[index];
      if (place(position + 1)) return true;
      used.delete(index);
    }
    return false;
  }

  return place(0) ? arranged : rightItems;
}

/** Normalizes visible pair text solely for duplicate detection. */
export function normalizePairText(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

/** Creates one stable pair; alternatives remain one combined visible target. */
export function createPairFromWord(word, direction, options = {}) {
  if (!isUsableWord(word) || !CONCRETE_DIRECTIONS.has(direction)) {
    return null;
  }

  const round = Number.isInteger(options.round) && options.round > 0 ? options.round : 1;
  const source = word.source.trim();
  const target = getUniqueTargets(word).join(" / ");
  const leftText = direction === SPEED_DIRECTIONS.SOURCE_TO_TARGET ? source : target;
  const rightText = direction === SPEED_DIRECTIONS.SOURCE_TO_TARGET ? target : source;

  return {
    wordId: word.id,
    leftId: `speed-left-${round}-${word.id}`,
    rightId: `speed-right-${round}-${word.id}`,
    leftText,
    rightText,
    matched: false,
  };
}

/** Returns a Fisher-Yates shuffled copy using an injectable random source. */
export function shuffleSpeedItems(items, randomFn = Math.random) {
  return shuffleOptions(items, randomFn);
}

/** Selects unique words, preferring IDs not used in previous rounds. */
export function selectRoundWords(
  words,
  count,
  excludedWordIds = [],
  randomFn = Math.random,
) {
  const desiredCount = Math.max(0, Math.floor(Number(count) || 0));
  const excluded = new Set(excludedWordIds);
  const seen = new Set();
  const unique = (Array.isArray(words) ? words : []).filter((word) => {
    if (!isUsableWord(word) || seen.has(word.id)) return false;
    seen.add(word.id);
    return true;
  });
  const fresh = shuffleSpeedItems(unique.filter((word) => !excluded.has(word.id)), randomFn);
  const reused = shuffleSpeedItems(unique.filter((word) => excluded.has(word.id)), randomFn);
  return [...fresh, ...reused].slice(0, desiredCount);
}

/** Builds one unambiguous round with independently shuffled, non-aligned sides. */
export function createSpeedRound(words, options = {}) {
  const randomFn = options.randomFn ?? Math.random;
  const direction = resolveDirection(
    options.direction ?? SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    randomFn,
  );
  const desiredCount = Math.max(0, Math.floor(Number(options.count) || 0));
  const allCandidates = selectRoundWords(
    words,
    Array.isArray(words) ? words.length : 0,
    options.excludedWordIds ?? [],
    randomFn,
  );
  const pairs = [];
  const leftTexts = new Set();
  const rightTexts = new Set();
  const sourceTexts = new Set();
  const targetVariants = new Set();
  const skippedWordIds = [];

  for (const word of allCandidates) {
    const pair = createPairFromWord(word, direction, { round: options.round });
    const leftKey = normalizePairText(pair?.leftText);
    const rightKey = normalizePairText(pair?.rightText);
    const sourceKey = normalizePairText(word?.source);
    const targetKeys = getUniqueTargets(word).map(normalizePairText);
    if (
      !pair
      || leftTexts.has(leftKey)
      || rightTexts.has(rightKey)
      || sourceTexts.has(sourceKey)
      || targetKeys.some((target) => targetVariants.has(target))
    ) {
      skippedWordIds.push(word.id);
      continue;
    }
    leftTexts.add(leftKey);
    rightTexts.add(rightKey);
    sourceTexts.add(sourceKey);
    targetKeys.forEach((target) => targetVariants.add(target));
    pairs.push(pair);
    if (pairs.length >= desiredCount) break;
  }

  const leftItems = shuffleSpeedItems(pairs.map((pair) => createItem(pair, "left")), randomFn);
  const shuffledRight = shuffleSpeedItems(pairs.map((pair) => createItem(pair, "right")), randomFn);
  const rightItems = removeAlignedPairs(leftItems, shuffledRight);

  return {
    direction,
    pairs,
    leftItems,
    rightItems,
    skippedWordIds,
  };
}

/** Counts the largest unambiguous round available for either concrete direction. */
export function getSpeedEligibleWordCount(words, randomFn = () => 0) {
  const count = Array.isArray(words) ? words.length : 0;
  const forward = createSpeedRound(words, {
    count,
    direction: SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    randomFn,
  }).pairs.length;
  const reverse = createSpeedRound(words, {
    count,
    direction: SPEED_DIRECTIONS.TARGET_TO_SOURCE,
    randomFn,
  }).pairs.length;
  return Math.max(forward, reverse);
}
