export const MILESTONE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "first-session", title: "Erster Schritt", description: "Eine Lerneinheit abgeschlossen." }),
  Object.freeze({ id: "three-learning-days", title: "Drangeblieben", description: "An drei verschiedenen Tagen gelernt." }),
  Object.freeze({ id: "ten-words-practiced", title: "Zehn Wörter", description: "Zehn verschiedene Wörter geübt." }),
  Object.freeze({ id: "twenty-five-words-practiced", title: "Wortschatz wächst", description: "25 verschiedene Wörter geübt." }),
  Object.freeze({ id: "five-sessions", title: "Gute Routine", description: "Fünf Lerneinheiten abgeschlossen." }),
  Object.freeze({ id: "first-perfect-objective-session", title: "Alles richtig", description: "Ein Quiz oder Schreibtraining vollständig richtig abgeschlossen." }),
]);

const MILESTONE_BY_ID = new Map(
  MILESTONE_DEFINITIONS.map((milestone) => [milestone.id, milestone]),
);

export function getMilestoneDefinition(id) {
  return MILESTONE_BY_ID.get(id) ?? null;
}

/** Determines newly reached permanent milestones from accumulated state. */
export function findNewMilestones(state, context = {}) {
  const unlocked = new Set(state.unlockedMilestoneIds ?? []);
  const candidates = [];
  const practicedCount = state.practicedWordIds?.length ?? 0;
  const learningDayCount = state.learningDays?.length ?? 0;
  const sessionCount = state.completedSessions ?? 0;

  if (sessionCount >= 1) candidates.push("first-session");
  if (learningDayCount >= 3) candidates.push("three-learning-days");
  if (practicedCount >= 10) candidates.push("ten-words-practiced");
  if (practicedCount >= 25) candidates.push("twenty-five-words-practiced");
  if (sessionCount >= 5) candidates.push("five-sessions");
  if (context.perfectObjectiveSession === true) {
    candidates.push("first-perfect-objective-session");
  }

  return candidates
    .filter((id) => !unlocked.has(id))
    .map((id) => getMilestoneDefinition(id));
}
