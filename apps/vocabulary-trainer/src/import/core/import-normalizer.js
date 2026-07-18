// @ts-check

/** @param {unknown} value */
export function normalizeImportText(value) {
  return typeof value === "string" ? value.trim().normalize("NFC") : value;
}

/**
 * Comparison keys may collapse internal whitespace without changing the
 * learner-visible spelling stored in the draft.
 *
 * @param {unknown} value
 */
export function normalizeImportComparisonKey(value) {
  const text = normalizeImportText(value);
  return typeof text === "string"
    ? text.replace(/\s+/gu, " ").toLocaleLowerCase()
    : "";
}

/** @param {unknown} value */
export function normalizeImportStringList(value) {
  if (!Array.isArray(value)) return value;
  const seen = new Set();
  return value.flatMap((item) => {
    if (typeof item !== "string") return [item];
    const normalized = normalizeImportText(item);
    const key = normalizeImportComparisonKey(normalized);
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function normalizeWord(word) {
  if (!word || typeof word !== "object" || Array.isArray(word)) return word;
  return {
    ...word,
    source: normalizeImportText(word.source),
    targets: normalizeImportStringList(word.targets),
    phonetic: normalizeImportText(word.phonetic),
    hint: normalizeImportText(word.hint),
    example: normalizeImportText(word.example),
    tags: normalizeImportStringList(word.tags),
  };
}

function normalizeUnit(unit) {
  if (!unit || typeof unit !== "object" || Array.isArray(unit)) return unit;
  const normalized = {
    ...unit,
    title: normalizeImportText(unit.title),
    words: Array.isArray(unit.words) ? unit.words.map(normalizeWord) : unit.words,
  };
  if (Object.hasOwn(unit, "description")) normalized.description = normalizeImportText(unit.description);
  return normalized;
}

/**
 * Normalizes only fachliche import values. Unknown keys and invalid types are
 * deliberately retained so that the validator can report them explicitly.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeImportDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  let course = value.course && typeof value.course === "object" && !Array.isArray(value.course)
    ? {
      ...value.course,
      title: normalizeImportText(value.course.title),
      description: normalizeImportText(value.course.description),
      sourceLanguage: normalizeImportText(value.course.sourceLanguage),
      targetLanguage: normalizeImportText(value.course.targetLanguage),
    }
    : value.course;
  if (course && typeof course === "object" && !Array.isArray(course)) {
    for (const field of ["subtitle", "schoolType", "gradeLevel"]) {
      if (Object.hasOwn(value.course, field)) course[field] = normalizeImportText(value.course[field]);
    }
  }
  return {
    ...value,
    sourceKind: normalizeImportText(value.sourceKind),
    course,
    units: Array.isArray(value.units) ? value.units.map(normalizeUnit) : value.units,
  };
}
