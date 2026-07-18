import { SPEED_DIRECTIONS } from "./speed-generator.js";

const MILLISECONDS_PER_SECOND = 1000;

function requireSpeedState(state) {
  if (!state || state.mode !== "speed" || !Array.isArray(state.activePairs)) {
    throw new TypeError("Der Speed-Challenge-Zustand ist ungültig.");
  }
}

function toTimestamp(value) {
  return new Date(value).toISOString();
}

function findPairByItem(state, side, itemId) {
  const field = side === "left" ? "leftId" : "rightId";
  return state.activePairs.find((pair) => pair[field] === itemId) ?? null;
}

/** Creates the transient state for one complete Speed Challenge. */
export function createSpeedState(options = {}) {
  const round = options.round ?? { pairs: [], leftItems: [], rightItems: [] };
  const durationSeconds = Number(options.durationSeconds ?? 60);
  const durationMs = Math.max(0, durationSeconds * MILLISECONDS_PER_SECOND);
  return {
    sessionId: options.sessionId ?? null,
    mode: "speed",
    sourceType: options.sourceType ?? "current-unit",
    direction: options.direction ?? SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    durationSeconds,
    pairsPerRound: options.pairsPerRound ?? round.pairs.length,
    requestedPairsPerRound: options.requestedPairsPerRound ?? options.pairsPerRound ?? round.pairs.length,
    startedAt: options.startedAt ?? null,
    endsAt: options.endsAt ?? null,
    timeRemainingMs: options.timeRemainingMs ?? durationMs,
    currentRound: 1,
    currentRoundDirection: round.direction ?? SPEED_DIRECTIONS.SOURCE_TO_TARGET,
    activePairs: round.pairs.map((pair) => ({ ...pair })),
    leftItems: round.leftItems.map((item) => ({ ...item })),
    rightItems: round.rightItems.map((item) => ({ ...item })),
    selectedLeftId: null,
    selectedRightId: null,
    matchedWordIds: [],
    scoredWordIds: [],
    incorrectAttempts: [],
    correctMatches: 0,
    totalAttempts: 0,
    completedRounds: 0,
    paused: false,
    completed: round.pairs.length === 0,
    completionReason: null,
    usedWordIds: round.pairs.map((pair) => pair.wordId),
    skippedWordIds: [...(round.skippedWordIds ?? [])],
  };
}

/** Selects one available item and reports when a cross-column pair is ready. */
export function selectSpeedItem(state, side, itemId) {
  requireSpeedState(state);
  if (
    state.completed
    || state.paused
    || !["left", "right"].includes(side)
    || typeof itemId !== "string"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const pair = findPairByItem(state, side, itemId);
  if (!pair || pair.matched) return { ok: false, reason: "missing-item" };

  if (side === "left") state.selectedLeftId = itemId;
  else state.selectedRightId = itemId;

  if (!state.selectedLeftId || !state.selectedRightId) {
    return { ok: true, ready: false, side, itemId };
  }

  const leftPair = findPairByItem(state, "left", state.selectedLeftId);
  const rightPair = findPairByItem(state, "right", state.selectedRightId);
  return {
    ok: true,
    ready: true,
    isCorrect: leftPair?.wordId === rightPair?.wordId,
    leftPair,
    rightPair,
    wordId: leftPair?.wordId === rightPair?.wordId ? leftPair.wordId : null,
  };
}

/** Clears both selections without recording an attempt. */
export function resetSpeedSelection(state) {
  requireSpeedState(state);
  const changed = Boolean(state.selectedLeftId || state.selectedRightId);
  state.selectedLeftId = null;
  state.selectedRightId = null;
  return changed;
}

/** Records the selected combination once and resets the current selection. */
export function resolveSpeedSelection(state, attemptedAt = new Date()) {
  requireSpeedState(state);
  if (state.completed || !state.selectedLeftId || !state.selectedRightId) {
    return { ok: false, reason: "incomplete-selection" };
  }

  const leftPair = findPairByItem(state, "left", state.selectedLeftId);
  const rightPair = findPairByItem(state, "right", state.selectedRightId);
  if (!leftPair || !rightPair || leftPair.matched || rightPair.matched) {
    resetSpeedSelection(state);
    return { ok: false, reason: "missing-item" };
  }

  const isCorrect = leftPair.wordId === rightPair.wordId;
  state.totalAttempts += 1;

  if (isCorrect) {
    leftPair.matched = true;
    state.correctMatches += 1;
    state.matchedWordIds.push(leftPair.wordId);
  } else {
    state.incorrectAttempts.push({
      leftId: leftPair.leftId,
      rightId: rightPair.rightId,
      leftWordId: leftPair.wordId,
      rightWordId: rightPair.wordId,
      attemptedAt: toTimestamp(attemptedAt),
    });
  }

  resetSpeedSelection(state);
  return { ok: true, isCorrect, wordId: isCorrect ? leftPair.wordId : null, leftPair, rightPair };
}

/** Remembers that the persistent Core has scored this word in this challenge. */
export function markSpeedWordScored(state, wordId) {
  requireSpeedState(state);
  if (state.scoredWordIds.includes(wordId)) return false;
  state.scoredWordIds.push(wordId);
  return true;
}

/** Returns whether every pair in the current round is solved. */
export function isSpeedRoundComplete(state) {
  requireSpeedState(state);
  return state.activePairs.length > 0 && state.activePairs.every((pair) => pair.matched);
}

/** Replaces a solved round and keeps aggregate challenge results. */
export function advanceSpeedRound(state, round) {
  requireSpeedState(state);
  if (state.completed || !isSpeedRoundComplete(state) || !round?.pairs?.length) return false;
  state.completedRounds += 1;
  state.currentRound += 1;
  state.currentRoundDirection = round.direction;
  state.activePairs = round.pairs.map((pair) => ({ ...pair }));
  state.leftItems = round.leftItems.map((item) => ({ ...item }));
  state.rightItems = round.rightItems.map((item) => ({ ...item }));
  state.selectedLeftId = null;
  state.selectedRightId = null;
  state.usedWordIds = [...new Set([...state.usedWordIds, ...round.pairs.map((pair) => pair.wordId)])];
  state.skippedWordIds.push(...(round.skippedWordIds ?? []));
  return true;
}

/** Synchronizes timer data without deriving elapsed time in the state module. */
export function updateSpeedTime(state, remainingMs, endsAt = state.endsAt) {
  requireSpeedState(state);
  state.timeRemainingMs = Math.max(0, Number(remainingMs) || 0);
  state.endsAt = endsAt ?? null;
}

export function setSpeedPaused(state, paused) {
  requireSpeedState(state);
  if (state.completed || state.paused === Boolean(paused)) return false;
  state.paused = Boolean(paused);
  resetSpeedSelection(state);
  return true;
}

/** Completes exactly once and counts a fully solved final round. */
export function completeSpeedChallenge(state, reason = "manual") {
  requireSpeedState(state);
  if (state.completed) return false;
  if (isSpeedRoundComplete(state)) state.completedRounds += 1;
  state.completed = true;
  state.completionReason = reason;
  state.paused = false;
  state.endsAt = null;
  resetSpeedSelection(state);
  return true;
}

/** A word is notable after involvement in at least two incorrect attempts. */
export function getNotableSpeedWordIds(state) {
  requireSpeedState(state);
  const counts = new Map();
  state.incorrectAttempts.forEach((attempt) => {
    [attempt.leftWordId, attempt.rightWordId].forEach((wordId) => {
      counts.set(wordId, (counts.get(wordId) ?? 0) + 1);
    });
  });
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([wordId]) => wordId);
}

/** Calculates completion data from immutable aggregate counters. */
export function getSpeedSummary(state) {
  requireSpeedState(state);
  const incorrectCount = state.incorrectAttempts.length;
  return {
    durationSeconds: state.durationSeconds,
    completedRounds: state.completedRounds,
    correctMatches: state.correctMatches,
    incorrectAttempts: incorrectCount,
    totalAttempts: state.totalAttempts,
    hitRate: state.totalAttempts === 0
      ? 0
      : Math.round((state.correctMatches / state.totalAttempts) * 100),
    uniqueMatchedWords: new Set(state.matchedWordIds).size,
    scoredWordIds: [...state.scoredWordIds],
    notableWordIds: getNotableSpeedWordIds(state),
  };
}
