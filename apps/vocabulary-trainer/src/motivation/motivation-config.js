const DEFAULT_XP_RULES = Object.freeze({
  flashcardsWord: 1,
  quizCorrect: 2,
  writeCorrect: 3,
  speedCorrect: 2,
  dailyCompletion: 5,
});

export const DEFAULT_MOTIVATION_CONFIG = Object.freeze({
  enabled: true,
  recentHistoryDays: 30,
  xp: DEFAULT_XP_RULES,
});

function toNonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Resolves optional course configuration without making motivation required. */
export function resolveMotivationConfig(courseConfig = {}) {
  const configured = courseConfig?.motivation;
  const raw = configured && typeof configured === "object" ? configured : {};
  const rawXp = raw.xp && typeof raw.xp === "object" ? raw.xp : {};

  return Object.freeze({
    enabled: typeof raw.enabled === "boolean"
      ? raw.enabled
      : DEFAULT_MOTIVATION_CONFIG.enabled,
    recentHistoryDays: toNonNegativeInteger(
      raw.recentHistoryDays,
      DEFAULT_MOTIVATION_CONFIG.recentHistoryDays,
    ),
    xp: Object.freeze({
      flashcardsWord: toNonNegativeInteger(
        rawXp.flashcardsWord,
        DEFAULT_XP_RULES.flashcardsWord,
      ),
      quizCorrect: toNonNegativeInteger(
        rawXp.quizCorrect,
        DEFAULT_XP_RULES.quizCorrect,
      ),
      writeCorrect: toNonNegativeInteger(
        rawXp.writeCorrect,
        DEFAULT_XP_RULES.writeCorrect,
      ),
      speedCorrect: toNonNegativeInteger(
        rawXp.speedCorrect,
        DEFAULT_XP_RULES.speedCorrect,
      ),
      dailyCompletion: toNonNegativeInteger(
        rawXp.dailyCompletion ?? rawXp.sessionCompletion,
        DEFAULT_XP_RULES.dailyCompletion,
      ),
    }),
  });
}
