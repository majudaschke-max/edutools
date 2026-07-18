const EVENT_TYPES = new Set(["word-practice", "session-completion"]);
const MODES = new Set(["flashcards", "quiz", "write", "speed"]);
const OUTCOMES = new Set(["correct", "wrong"]);
const COMPLETION_STATUSES = new Set(["completed", "aborted"]);

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} muss ein nicht leerer String sein.`);
  }
  return value.trim();
}

function requireTimestamp(value) {
  const date = new Date(value ?? new Date());
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("occurredAt muss ein gültiger Zeitpunkt sein.");
  }
  return date.toISOString();
}

function requireMode(mode) {
  const normalized = requireString(mode, "mode");
  if (!MODES.has(normalized)) throw new TypeError(`Unbekannter Lernmodus: ${mode}`);
  return normalized;
}

function uniqueWordIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((wordId) => (
    requireString(wordId, "wordId")
  )))];
}

export function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Datum ist ungültig.");
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Creates a unique transient session ID with an injectable test seam. */
export function createMotivationSessionId(randomUUID) {
  const uuidFactory = randomUUID
    ?? globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (typeof uuidFactory === "function") {
    return requireString(uuidFactory(), "sessionId");
  }
  const randomPart = Math.random().toString(36).slice(2);
  return `session-${Date.now().toString(36)}-${randomPart}`;
}

export function createWordPracticeEvent(options = {}) {
  return normalizeMotivationEvent({ ...options, type: "word-practice" });
}

export function createSessionCompletionEvent(options = {}) {
  return normalizeMotivationEvent({ ...options, type: "session-completion" });
}

/** Validates and defensively normalizes all events accepted by the service. */
export function normalizeMotivationEvent(event) {
  if (!event || typeof event !== "object" || !EVENT_TYPES.has(event.type)) {
    throw new TypeError("Unbekanntes Motivationsevent.");
  }

  const base = {
    type: event.type,
    eventId: requireString(event.eventId, "eventId"),
    sessionId: requireString(event.sessionId, "sessionId"),
    mode: requireMode(event.mode),
    occurredAt: requireTimestamp(event.occurredAt),
  };

  if (event.type === "word-practice") {
    const outcome = requireString(event.outcome, "outcome");
    if (!OUTCOMES.has(outcome)) throw new TypeError(`Unbekanntes Ergebnis: ${outcome}`);
    return Object.freeze({
      ...base,
      wordId: requireString(event.wordId, "wordId"),
      outcome,
    });
  }

  const status = requireString(event.status, "status");
  if (!COMPLETION_STATUSES.has(status)) {
    throw new TypeError(`Unbekannter Abschlussstatus: ${status}`);
  }
  const totalCount = Number(event.totalCount ?? 0);
  const correctCount = Number(event.correctCount ?? 0);
  if (!Number.isInteger(totalCount) || totalCount < 0
    || !Number.isInteger(correctCount) || correctCount < 0
    || correctCount > totalCount) {
    throw new TypeError("Abschlusszahlen müssen nicht negative, konsistente Ganzzahlen sein.");
  }

  return Object.freeze({
    ...base,
    status,
    practicedWordIds: Object.freeze(uniqueWordIds(event.practicedWordIds)),
    totalCount,
    correctCount,
  });
}
