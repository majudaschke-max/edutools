export const SESSION_SIZE_ALL = "all";

export const SESSION_SIZE_PRESETS = Object.freeze({
  flashcards: Object.freeze([5, 10, 20, 30]),
  quiz: Object.freeze([5, 10, 20, 30]),
  write: Object.freeze([5, 10, 20, 30]),
});

function normalizeAvailableCount(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

export function getSessionSizePresets(mode = "flashcards") {
  return SESSION_SIZE_PRESETS[mode] ?? SESSION_SIZE_PRESETS.flashcards;
}

/** Returns useful, non-duplicated choices plus an explicit full-set choice. */
export function getSessionSizeOptions(availableCount, mode = "flashcards") {
  const total = normalizeAvailableCount(availableCount);
  if (total === 0) return [];

  const partial = getSessionSizePresets(mode)
    .filter((value) => value < total)
    .map((value) => Object.freeze({
      value: String(value),
      count: value,
      label: `${value} Wörter`,
      all: false,
    }));

  return Object.freeze([
    ...partial,
    Object.freeze({
      value: SESSION_SIZE_ALL,
      count: total,
      label: `Alle ${total} ${total === 1 ? "Wort" : "Wörter"}`,
      all: true,
    }),
  ]);
}

/** Keeps ten as a recommendation, never as a hidden maximum. */
export function getDefaultSessionSize(availableCount, mode = "flashcards") {
  const options = getSessionSizeOptions(availableCount, mode);
  if (options.length === 0) return null;
  const recommended = options.find((option) => option.count === 10 && !option.all);
  if (recommended) return recommended.value;
  const largestPartial = [...options].reverse().find((option) => !option.all);
  return largestPartial?.value ?? SESSION_SIZE_ALL;
}

export function resolveSessionSize(selection, availableCount) {
  const total = normalizeAvailableCount(availableCount);
  if (selection === SESSION_SIZE_ALL) return total;
  const numeric = Number(selection);
  if (!Number.isInteger(numeric) || numeric <= 0) return total;
  return Math.min(numeric, total);
}

/** Dedupe first, then apply the explicit selection without mutating input. */
export function selectSessionWords(words, selection) {
  const seen = new Set();
  const available = Array.isArray(words) ? words.filter((word) => {
    const id = typeof word?.id === "string" ? word.id.trim() : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }) : [];
  return available.slice(0, resolveSessionSize(selection, available.length));
}

export function formatSessionSizeSelection(selection, availableCount) {
  const total = normalizeAvailableCount(availableCount);
  const selected = resolveSessionSize(selection, total);
  return selected === total
    ? `Du übst jetzt alle ${total} ${total === 1 ? "Wort" : "Wörter"}.`
    : `Du übst jetzt ${selected} von ${total} Wörtern.`;
}
