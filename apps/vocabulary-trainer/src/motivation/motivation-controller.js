import {
  createMotivationSessionId,
  createSessionCompletionEvent,
  createWordPracticeEvent,
} from "./motivation-events.js?v=4.0.3";

/** Small non-blocking adapter used by every learning runtime. */
export function createMotivationController(options = {}) {
  const { service } = options;
  if (!service) throw new TypeError("MotivationService fehlt.");
  const now = options.now ?? (() => new Date());
  const randomUUID = options.randomUUID;
  const onChange = options.onChange;
  const logger = options.logger ?? console;

  function safelyRecord(action, label, kind) {
    try {
      const result = action();
      if (!result.ok && result.technicalError) {
        logger.error(`Motivation konnte ${label} nicht speichern.`, result.technicalError);
      } else if (!result.ok) {
        logger.error(`Motivation konnte ${label} nicht speichern.`);
      }
      if (result.ok && !result.duplicate && !result.disabled) onChange?.(result, kind);
      return result;
    } catch (technicalError) {
      logger.error(`Motivation konnte ${label} nicht verarbeiten.`, technicalError);
      return { ok: false, reason: "technical", technicalError };
    }
  }

  function createSessionId() {
    return createMotivationSessionId(randomUUID);
  }

  function recordWordPractice(details) {
    const occurredAt = details.occurredAt ?? now();
    return safelyRecord(() => service.recordWordPractice(createWordPracticeEvent({
      ...details,
      eventId: details.eventId
        ?? `${details.sessionId}:word:${details.sequence}:${details.wordId}`,
      occurredAt,
    })), "ein Wortevent", "word-practice");
  }

  function recordSessionCompletion(details) {
    const occurredAt = details.occurredAt ?? now();
    return safelyRecord(() => service.recordSessionCompletion(
      createSessionCompletionEvent({
        ...details,
        eventId: details.eventId ?? `${details.sessionId}:completion`,
        occurredAt,
      }),
    ), "einen Sessionabschluss", "session-completion");
  }

  return Object.freeze({
    consumePendingNotifications: service.consumePendingNotifications,
    createSessionId,
    getProgressSummary: service.getProgressSummary,
    getState: service.getState,
    recordSessionCompletion,
    recordWordPractice,
    resetMotivationProgress: () => safelyRecord(
      service.resetMotivationProgress,
      "den Reset",
      "reset",
    ),
    setEnabled: (enabled) => safelyRecord(
      () => service.setEnabled(enabled),
      "die Einstellung",
      "setting",
    ),
  });
}
