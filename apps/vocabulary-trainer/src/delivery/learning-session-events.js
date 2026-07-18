const listeners = new Set();

/**
 * Domain event shared by delivery integrations. It deliberately contains no
 * word IDs, answers, scores or user data.
 */
export function notifyLearningSessionCompleted(details) {
  const mode = String(details?.mode ?? "").trim();
  if (!new Set(["flashcards", "quiz", "write", "speed"]).has(mode)) return false;
  const event = Object.freeze({
    type: "learning-session-completed",
    mode,
    sessionId: typeof details?.sessionId === "string" ? details.sessionId : null,
  });
  for (const listener of [...listeners]) listener(event);
  return true;
}

export function subscribeLearningSessionCompleted(listener) {
  if (typeof listener !== "function") throw new TypeError("Sessionabschluss-Listener fehlt.");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
