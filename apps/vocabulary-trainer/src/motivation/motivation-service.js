import { getLevelFromXp, getLevelProgress } from "./level-system.js?v=4.0.3";
import {
  findNewMilestones,
  getMilestoneDefinition,
} from "./milestone-system.js?v=4.0.3";
import { resolveMotivationConfig } from "./motivation-config.js?v=4.0.3";
import {
  normalizeMotivationEvent,
  toLocalDateKey,
} from "./motivation-events.js?v=4.0.3";
import {
  cloneMotivationState,
  createInitialMotivationState,
  validateMotivationState,
} from "./motivation-state.js?v=4.0.3";
import {
  applyQualifiedLearningDay,
  getPreviousLocalDateKey,
} from "./streak-system.js?v=4.0.3";

function unique(values) {
  return [...new Set(values)];
}

function getXpForWord(event, config) {
  if (event.mode === "flashcards") return config.xp.flashcardsWord;
  if (event.outcome !== "correct") return 0;
  if (event.mode === "quiz") return config.xp.quizCorrect;
  if (event.mode === "write") return config.xp.writeCorrect;
  if (event.mode === "speed") return config.xp.speedCorrect;
  return 0;
}

function localDateAtOffset(now, daysBack) {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return toLocalDateKey(date);
}

function pruneRecentState(state, now, historyDays) {
  const oldestDateKey = localDateAtOffset(now, Math.max(0, historyDays - 1));
  state.processedEvents = state.processedEvents.filter(
    (entry) => entry.dateKey >= oldestDateKey,
  );
  state.awardedDailyWordKeys = state.awardedDailyWordKeys.filter(
    (key) => key.slice(0, 10) >= oldestDateKey,
  );
  state.awardedDailySessionKeys = state.awardedDailySessionKeys.filter(
    (key) => key.slice(0, 10) >= oldestDateKey,
  );
  state.completedSessionIds = state.completedSessionIds.filter((entry) => {
    const separator = entry.indexOf("|");
    return separator > 0 && entry.slice(0, separator) >= oldestDateKey;
  });
  state.awardedDailyBonusDateKeys = state.awardedDailyBonusDateKeys.filter(
    (dateKey) => dateKey >= oldestDateKey,
  );
}

function addProcessedEvent(state, event, dateKey) {
  state.processedEvents.push({ id: event.eventId, dateKey });
}

function hasProcessedEvent(state, eventId) {
  return state.processedEvents.some((entry) => entry.id === eventId);
}

function addLevelUp(state, previousLevel, occurredAt) {
  const nextLevel = getLevelFromXp(state.totalXp);
  state.currentLevel = nextLevel;
  if (nextLevel <= previousLevel) return;

  const pending = state.pendingLevelUps[0];
  if (pending) {
    pending.fromLevel = Math.min(pending.fromLevel, previousLevel);
    pending.toLevel = Math.max(pending.toLevel, nextLevel);
    pending.earnedAt = occurredAt;
  } else {
    state.pendingLevelUps.push({
      fromLevel: previousLevel,
      toLevel: nextLevel,
      earnedAt: occurredAt,
    });
  }
}

function unlockMilestones(state, context) {
  const newlyUnlocked = findNewMilestones(state, context);
  state.unlockedMilestoneIds = unique([
    ...state.unlockedMilestoneIds,
    ...newlyUnlocked.map((milestone) => milestone.id),
  ]);
  return newlyUnlocked;
}

/**
 * Creates the isolated motivation domain. It only receives normalized learning
 * facts and never imports or mutates scheduler or learning-state modules.
 */
export function createMotivationService(options = {}) {
  const config = options.config?.xp
    ? options.config
    : resolveMotivationConfig(options.courseConfig);
  const now = options.now ?? (() => new Date());
  const save = options.save;
  if (typeof save !== "function") {
    throw new TypeError("Ein Speicheradapter für Motivation ist erforderlich.");
  }

  let state = validateMotivationState(
    cloneMotivationState(options.state),
    options.state?.courseId,
  );

  function persistCandidate(candidate) {
    validateMotivationState(candidate, state.courseId);
    try {
      if (!save(candidate)) return { ok: false, reason: "storage" };
      state = candidate;
      return { ok: true };
    } catch (technicalError) {
      return { ok: false, reason: "storage", technicalError };
    }
  }

  function createBaseCandidate(event) {
    const currentDate = now();
    const dateKey = toLocalDateKey(event.occurredAt ?? currentDate);
    const candidate = cloneMotivationState(state);
    pruneRecentState(candidate, currentDate, config.recentHistoryDays);
    return { candidate, dateKey };
  }

  function recordWordPractice(rawEvent) {
    const event = normalizeMotivationEvent(rawEvent);
    if (event.type !== "word-practice") {
      throw new TypeError("recordWordPractice erwartet ein Wortevent.");
    }
    if (!state.enabled) return { ok: true, disabled: true, awardedXp: 0 };
    if (hasProcessedEvent(state, event.eventId)) {
      return { ok: true, duplicate: true, awardedXp: 0 };
    }

    const { candidate, dateKey } = createBaseCandidate(event);
    if (hasProcessedEvent(candidate, event.eventId)) {
      return { ok: true, duplicate: true, awardedXp: 0 };
    }
    const previousLevel = candidate.currentLevel;
    const dailyKey = `${dateKey}|${event.mode}|${event.wordId}`;
    const alreadyAwarded = candidate.awardedDailyWordKeys.includes(dailyKey);
    const awardedXp = alreadyAwarded ? 0 : getXpForWord(event, config);

    candidate.practicedWordIds = unique([...candidate.practicedWordIds, event.wordId]);
    if (!alreadyAwarded && getXpForWord(event, config) > 0) {
      candidate.awardedDailyWordKeys.push(dailyKey);
    }
    candidate.totalXp += awardedXp;
    addProcessedEvent(candidate, event, dateKey);
    addLevelUp(candidate, previousLevel, event.occurredAt);
    const milestones = unlockMilestones(candidate, {});
    candidate.updatedAt = event.occurredAt;

    const persistence = persistCandidate(candidate);
    return persistence.ok
      ? { ok: true, awardedXp, milestones, level: candidate.currentLevel }
      : { ...persistence, awardedXp: 0, milestones: [] };
  }

  function recordSessionCompletion(rawEvent) {
    const event = normalizeMotivationEvent(rawEvent);
    if (event.type !== "session-completion") {
      throw new TypeError("recordSessionCompletion erwartet ein Abschlussevent.");
    }
    if (!state.enabled) return { ok: true, disabled: true, awardedXp: 0 };
    if (hasProcessedEvent(state, event.eventId)) {
      return { ok: true, duplicate: true, awardedXp: 0 };
    }

    const { candidate, dateKey } = createBaseCandidate(event);
    if (hasProcessedEvent(candidate, event.eventId)) {
      return { ok: true, duplicate: true, awardedXp: 0 };
    }
    addProcessedEvent(candidate, event, dateKey);

    if (event.status !== "completed" || event.practicedWordIds.length === 0) {
      candidate.updatedAt = event.occurredAt;
      const persistence = persistCandidate(candidate);
      return persistence.ok
        ? { ok: true, awardedXp: 0, milestones: [] }
        : { ...persistence, awardedXp: 0, milestones: [] };
    }

    const sessionIdentity = `${dateKey}|${event.sessionId}`;
    if (candidate.completedSessionIds.includes(sessionIdentity)) {
      candidate.updatedAt = event.occurredAt;
      const persistence = persistCandidate(candidate);
      return persistence.ok
        ? { ok: true, duplicate: true, awardedXp: 0, milestones: [] }
        : { ...persistence, awardedXp: 0, milestones: [] };
    }

    const previousLevel = candidate.currentLevel;
    const dailyKey = `${dateKey}|daily-completion`;
    const alreadyAwarded = candidate.awardedDailyBonusDateKeys.includes(dateKey);
    const awardedXp = alreadyAwarded ? 0 : config.xp.dailyCompletion;

    candidate.completedSessionIds.push(sessionIdentity);
    candidate.completedSessions += 1;
    candidate.practicedWordIds = unique([
      ...candidate.practicedWordIds,
      ...event.practicedWordIds,
    ]);
    candidate.learningDays = unique([...candidate.learningDays, dateKey]).sort();
    candidate.totalActiveDays = candidate.learningDays.length;
    const streak = applyQualifiedLearningDay(candidate, dateKey, event.occurredAt);
    candidate.currentStreak = streak.currentStreak;
    candidate.longestStreak = streak.longestStreak;
    candidate.lastQualifiedLocalDate = streak.lastQualifiedLocalDate;
    candidate.lastQualifiedTimestamp = streak.lastQualifiedTimestamp;
    if (!alreadyAwarded) {
      candidate.awardedDailySessionKeys.push(dailyKey);
      candidate.awardedDailyBonusDateKeys.push(dateKey);
    }
    candidate.totalXp += awardedXp;
    addLevelUp(candidate, previousLevel, event.occurredAt);
    const perfectObjectiveSession = ["quiz", "write"].includes(event.mode)
      && event.totalCount > 0
      && event.correctCount === event.totalCount;
    const milestones = unlockMilestones(candidate, { perfectObjectiveSession });
    candidate.updatedAt = event.occurredAt;

    const persistence = persistCandidate(candidate);
    return persistence.ok
      ? { ok: true, awardedXp, milestones, level: candidate.currentLevel }
      : { ...persistence, awardedXp: 0, milestones: [] };
  }

  function getProgressSummary(referenceDate = now()) {
    const todayKey = toLocalDateKey(referenceDate);
    const visibleCurrentStreak = state.lastQualifiedLocalDate === todayKey
      || state.lastQualifiedLocalDate === getPreviousLocalDateKey(todayKey)
      ? state.currentStreak
      : 0;
    return {
      enabled: state.enabled,
      ...getLevelProgress(state.totalXp),
      currentStreak: visibleCurrentStreak,
      longestStreak: state.longestStreak,
      lastQualifiedLocalDate: state.lastQualifiedLocalDate,
      lastQualifiedTimestamp: state.lastQualifiedTimestamp,
      todayCompleted: state.lastQualifiedLocalDate === todayKey,
      learningDayCount: state.learningDays.length,
      completedSessions: state.completedSessions,
      practicedWordCount: state.practicedWordIds.length,
      milestones: state.unlockedMilestoneIds
        .map(getMilestoneDefinition)
        .filter(Boolean),
    };
  }

  function consumePendingNotifications() {
    if (state.pendingLevelUps.length === 0) return [];
    const notifications = cloneMotivationState(state.pendingLevelUps);
    const candidate = cloneMotivationState(state);
    candidate.pendingLevelUps = [];
    candidate.updatedAt = new Date(now()).toISOString();
    const persistence = persistCandidate(candidate);
    return persistence.ok ? notifications : [];
  }

  function setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("enabled muss boolesch sein.");
    if (state.enabled === enabled) return { ok: true, unchanged: true };
    const candidate = cloneMotivationState(state);
    candidate.enabled = enabled;
    candidate.updatedAt = new Date(now()).toISOString();
    return persistCandidate(candidate);
  }

  function resetMotivationProgress() {
    const candidate = createInitialMotivationState(state.courseId, {
      enabled: state.enabled,
      now: now(),
    });
    return persistCandidate(candidate);
  }

  return Object.freeze({
    consumePendingNotifications,
    getProgressSummary,
    getState: () => cloneMotivationState(state),
    recordSessionCompletion,
    recordWordPractice,
    resetMotivationProgress,
    setEnabled,
  });
}
