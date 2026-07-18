import { getLevelFromXp } from "./level-system.js?v=4.0.5";

export const MOTIVATION_SCHEMA_VERSION = 2;

function toIsoTimestamp(value) {
  const date = new Date(value ?? new Date());
  if (!Number.isFinite(date.getTime())) throw new TypeError("Zeitpunkt ist ungültig.");
  return date.toISOString();
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => (
    typeof entry === "string" && entry.trim().length > 0
  ));
}

function isRecentEventArray(value) {
  return Array.isArray(value) && value.every((entry) => (
    entry
    && typeof entry === "object"
    && typeof entry.id === "string"
    && entry.id.length > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.dateKey)
  ));
}

function isPendingLevelArray(value) {
  return Array.isArray(value) && value.every((entry) => (
    entry
    && typeof entry === "object"
    && Number.isInteger(entry.fromLevel)
    && Number.isInteger(entry.toLevel)
    && entry.fromLevel >= 1
    && entry.toLevel > entry.fromLevel
    && Number.isFinite(new Date(entry.earnedAt).getTime())
  ));
}

function isNullableDateKey(value) {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isNullableTimestamp(value) {
  return value === null || Number.isFinite(new Date(value).getTime());
}

/** Creates the independent, versioned persistent motivation state. */
export function createInitialMotivationState(
  courseId,
  options = {},
) {
  if (typeof courseId !== "string" || !courseId.trim()) {
    throw new TypeError("courseId muss ein nicht leerer String sein.");
  }
  const timestamp = toIsoTimestamp(options.now);
  return {
    schemaVersion: MOTIVATION_SCHEMA_VERSION,
    courseId: courseId.trim(),
    enabled: options.enabled !== false,
    totalXp: 0,
    currentLevel: 1,
    learningDays: [],
    currentStreak: 0,
    longestStreak: 0,
    lastQualifiedLocalDate: null,
    lastQualifiedTimestamp: null,
    totalActiveDays: 0,
    completedSessions: 0,
    practicedWordIds: [],
    unlockedMilestoneIds: [],
    awardedDailyWordKeys: [],
    awardedDailySessionKeys: [],
    awardedDailyBonusDateKeys: [],
    completedSessionIds: [],
    processedEvents: [],
    pendingLevelUps: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Strictly validates stored motivation data without repairing it silently. */
export function validateMotivationState(data, courseId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Der Motivationsstand muss ein Objekt sein.");
  }
  if (data.schemaVersion !== MOTIVATION_SCHEMA_VERSION) {
    throw new TypeError("Die Version des Motivationsstands ist nicht kompatibel.");
  }
  if (data.courseId !== courseId) {
    throw new TypeError("Der Motivationsstand gehört zu einem anderen Kurs.");
  }
  if (typeof data.enabled !== "boolean") {
    throw new TypeError("enabled muss boolesch sein.");
  }
  if (!Number.isInteger(data.totalXp) || data.totalXp < 0) {
    throw new TypeError("totalXp muss eine nicht negative Ganzzahl sein.");
  }
  if (data.currentLevel !== getLevelFromXp(data.totalXp)) {
    throw new TypeError("currentLevel passt nicht zu totalXp.");
  }
  for (const field of ["currentStreak", "longestStreak", "completedSessions", "totalActiveDays"]) {
    if (!Number.isInteger(data[field]) || data[field] < 0) {
      throw new TypeError(`${field} muss eine nicht negative Ganzzahl sein.`);
    }
  }
  for (const field of [
    "learningDays",
    "practicedWordIds",
    "unlockedMilestoneIds",
    "awardedDailyWordKeys",
    "awardedDailySessionKeys",
    "awardedDailyBonusDateKeys",
    "completedSessionIds",
  ]) {
    if (!isStringArray(data[field])) throw new TypeError(`${field} ist ungültig.`);
  }
  if (!isRecentEventArray(data.processedEvents)) {
    throw new TypeError("processedEvents ist ungültig.");
  }
  if (!isNullableDateKey(data.lastQualifiedLocalDate)) {
    throw new TypeError("lastQualifiedLocalDate ist ungültig.");
  }
  if (!isNullableTimestamp(data.lastQualifiedTimestamp)) {
    throw new TypeError("lastQualifiedTimestamp ist ungültig.");
  }
  if (!isPendingLevelArray(data.pendingLevelUps)) {
    throw new TypeError("pendingLevelUps ist ungültig.");
  }
  if (!Number.isFinite(new Date(data.createdAt).getTime())
    || !Number.isFinite(new Date(data.updatedAt).getTime())) {
    throw new TypeError("Zeitstempel des Motivationsstands sind ungültig.");
  }
  return data;
}

export function cloneMotivationState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** Adds Sprint-3.7 fields without changing XP, level or historical learning days. */
export function migrateMotivationState(data, courseId, options = {}) {
  if (data?.schemaVersion === MOTIVATION_SCHEMA_VERSION) {
    return validateMotivationState(data, courseId);
  }
  if (!data || data.schemaVersion !== 1 || data.courseId !== courseId) {
    throw new TypeError("Die Version des Motivationsstands ist nicht kompatibel.");
  }
  const migrated = cloneMotivationState(data);
  const learningDays = Array.isArray(migrated.learningDays)
    ? [...new Set(migrated.learningDays)].sort()
    : [];
  const lastQualifiedLocalDate = learningDays.at(-1) ?? null;
  const fallbackTimestamp = Number.isFinite(new Date(migrated.updatedAt).getTime())
    ? new Date(migrated.updatedAt).toISOString()
    : toIsoTimestamp(options.now);
  migrated.schemaVersion = MOTIVATION_SCHEMA_VERSION;
  migrated.learningDays = learningDays;
  migrated.lastQualifiedLocalDate = lastQualifiedLocalDate;
  migrated.lastQualifiedTimestamp = lastQualifiedLocalDate ? fallbackTimestamp : null;
  migrated.totalActiveDays = learningDays.length;
  migrated.awardedDailyBonusDateKeys = [...new Set(
    (migrated.awardedDailySessionKeys ?? []).map((key) => String(key).slice(0, 10))
      .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)),
  )];
  return validateMotivationState(migrated, courseId);
}
