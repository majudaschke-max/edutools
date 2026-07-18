// @ts-check

/**
 * Exact batch duplicates deliberately remain case-sensitive. Only Unicode
 * composition and whitespace are normalized; target order is not semantic.
 * @param {unknown} value
 */
export function normalizeExactDuplicatePart(value) {
  return typeof value === "string"
    ? value.trim().normalize("NFC").replace(/\s+/gu, " ")
    : "";
}

/** @param {string} unitTitle @param {{source?: unknown, targets?: unknown}} word */
export function createExactWordKey(unitTitle, word) {
  const targets = Array.isArray(word?.targets)
    ? word.targets.map(normalizeExactDuplicatePart).sort((left, right) => left.localeCompare(right, "de"))
    : [];
  return JSON.stringify([
    normalizeExactDuplicatePart(unitTitle),
    normalizeExactDuplicatePart(word?.source),
    targets,
  ]);
}
