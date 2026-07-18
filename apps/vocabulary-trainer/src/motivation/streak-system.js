const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? timestamp
    : null;
}

export function isValidLocalDateKey(value) {
  return parseDateKey(value) !== null;
}

export function getPreviousLocalDateKey(dateKey) {
  const timestamp = parseDateKey(dateKey);
  if (timestamp === null) return null;
  return new Date(timestamp - DAY_IN_MILLISECONDS).toISOString().slice(0, 10);
}

/** Calculates current and longest consecutive learning-day streaks. */
export function calculateStreaks(learningDays, todayKey) {
  const days = [...new Set(Array.isArray(learningDays) ? learningDays : [])]
    .filter((dateKey) => parseDateKey(dateKey) !== null)
    .sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousTimestamp = null;

  days.forEach((dateKey) => {
    const timestamp = parseDateKey(dateKey);
    runningStreak = previousTimestamp !== null
      && timestamp - previousTimestamp === DAY_IN_MILLISECONDS
      ? runningStreak + 1
      : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousTimestamp = timestamp;
  });

  const todayTimestamp = parseDateKey(todayKey);
  const lastDay = days.at(-1) ?? null;
  const lastTimestamp = lastDay ? parseDateKey(lastDay) : null;
  const isCurrent = todayTimestamp !== null
    && lastTimestamp !== null
    && (lastTimestamp === todayTimestamp
      || lastTimestamp === todayTimestamp - DAY_IN_MILLISECONDS);

  let currentStreak = 0;
  if (isCurrent) {
    currentStreak = 1;
    for (let index = days.length - 2; index >= 0; index -= 1) {
      const later = parseDateKey(days[index + 1]);
      const earlier = parseDateKey(days[index]);
      if (later - earlier !== DAY_IN_MILLISECONDS) break;
      currentStreak += 1;
    }
  }

  return { currentStreak, longestStreak };
}

/** Applies one qualified local-calendar day; same-day calls are idempotent. */
export function applyQualifiedLearningDay(streak, dateKey, timestamp) {
  if (!isValidLocalDateKey(dateKey)) throw new TypeError("Lokaler Lerntag ist ungültig.");
  const previous = isValidLocalDateKey(streak?.lastQualifiedLocalDate)
    ? streak.lastQualifiedLocalDate
    : null;
  let currentStreak = Number.isInteger(streak?.currentStreak) && streak.currentStreak >= 0
    ? streak.currentStreak
    : 0;
  let advanced = false;

  if (previous !== dateKey) {
    currentStreak = previous === getPreviousLocalDateKey(dateKey)
      ? Math.max(1, currentStreak) + 1
      : 1;
    advanced = true;
  }

  return Object.freeze({
    currentStreak,
    longestStreak: Math.max(
      Number.isInteger(streak?.longestStreak) ? streak.longestStreak : 0,
      currentStreak,
    ),
    lastQualifiedLocalDate: dateKey,
    lastQualifiedTimestamp: new Date(timestamp).toISOString(),
    advanced,
  });
}
