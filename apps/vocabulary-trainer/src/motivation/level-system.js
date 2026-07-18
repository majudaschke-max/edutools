const XP_PER_LEVEL_STEP = 50;

function requireLevel(level) {
  const numericLevel = Number(level);
  return Number.isFinite(numericLevel)
    ? Math.max(1, Math.floor(numericLevel))
    : 1;
}

function normalizeXp(totalXp) {
  const numericXp = Number(totalXp);
  return Number.isFinite(numericXp) ? Math.max(0, Math.floor(numericXp)) : 0;
}

/** Total XP required to enter a level. Level 1 starts at zero XP. */
export function getTotalXpRequiredForLevel(level) {
  const normalizedLevel = requireLevel(level);
  return XP_PER_LEVEL_STEP * ((normalizedLevel - 1) * normalizedLevel) / 2;
}

/** Resolves an unbounded level in constant time from the triangular XP curve. */
export function getLevelFromXp(totalXp) {
  const normalizedXp = normalizeXp(totalXp);
  return Math.max(
    1,
    Math.floor((1 + Math.sqrt(1 + (8 * normalizedXp) / XP_PER_LEVEL_STEP)) / 2),
  );
}

/** Returns the exact progress within the current level. */
export function getLevelProgress(totalXp) {
  const normalizedXp = normalizeXp(totalXp);
  const level = getLevelFromXp(normalizedXp);
  const levelStartXp = getTotalXpRequiredForLevel(level);
  const nextLevelXp = getTotalXpRequiredForLevel(level + 1);
  const earnedInLevel = normalizedXp - levelStartXp;
  const requiredInLevel = nextLevelXp - levelStartXp;

  return {
    level,
    totalXp: normalizedXp,
    levelStartXp,
    nextLevelXp,
    earnedInLevel,
    requiredInLevel,
    remainingXp: Math.max(0, nextLevelXp - normalizedXp),
    percentage: requiredInLevel === 0
      ? 0
      : Math.round((earnedInLevel / requiredInLevel) * 100),
    currentLevelStartXp: levelStartXp,
    xpWithinLevel: earnedInLevel,
    xpNeededForNextLevel: requiredInLevel,
    progressPercent: requiredInLevel === 0
      ? 0
      : Number(((earnedInLevel / requiredInLevel) * 100).toFixed(2)),
  };
}
