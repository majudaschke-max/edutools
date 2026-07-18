// @ts-check

export const LEARNING_SCOPE_ALL = "all";
export const LEARNING_SCOPE_MULTIPLE = "multiple-packages";
export const LEARNING_SCOPE_PACKAGE_PREFIX = "package:";

function uniqueWords(words) {
  const seen = new Set();
  return (Array.isArray(words) ? words : []).filter((word) => {
    const id = typeof word?.id === "string" ? word.id.trim() : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Builds stable UI choices without changing the technical `unit` model. */
export function createLearningScopeOptions(vocabularyData, availableWords, specialOptions = []) {
  const words = uniqueWords(availableWords);
  const packages = (Array.isArray(vocabularyData?.units) ? vocabularyData.units : [])
    .map((unit, index) => {
      const packageWords = words.filter((word) => word.unitId === unit.id);
      return {
        value: `${LEARNING_SCOPE_PACKAGE_PREFIX}${unit.id}`,
        packageId: unit.id,
        packageIndex: index,
        label: `Lernpaket „${unit.title}“`,
        words: packageWords,
      };
    })
    .filter((entry) => entry.words.length > 0);

  const options = [
    {
      value: LEARNING_SCOPE_ALL,
      label: "Alle Lernpakete",
      words,
    },
    ...packages,
  ];
  if (packages.length > 1) {
    options.push({
      value: LEARNING_SCOPE_MULTIPLE,
      label: "Mehrere Lernpakete",
      words,
    });
  }
  for (const option of specialOptions) {
    const optionWords = uniqueWords(option?.words);
    if (optionWords.length > 0) options.push({ ...option, words: optionWords });
  }
  return options;
}

/** Resolves package checkboxes only for the explicit multi-package choice. */
export function resolveLearningScopeWords(options, value, selectedPackageIds = []) {
  const entries = Array.isArray(options) ? options : [];
  if (value !== LEARNING_SCOPE_MULTIPLE) {
    return uniqueWords(entries.find((entry) => entry.value === value)?.words);
  }
  const selected = new Set(selectedPackageIds);
  return uniqueWords(entries
    .filter((entry) => entry.packageId && selected.has(entry.packageId))
    .flatMap((entry) => entry.words));
}

export function isValidLearningScopeSelection(selection) {
  if (selection?.value !== LEARNING_SCOPE_MULTIPLE) return true;
  return new Set(Array.isArray(selection.packageIds) ? selection.packageIds : []).size >= 2;
}

export function formatLearningScope(options, value, selectedPackageIds = []) {
  const words = resolveLearningScopeWords(options, value, selectedPackageIds);
  const wordLabel = `${words.length} ${words.length === 1 ? "Wort" : "Wörter"}`;
  if (value === LEARNING_SCOPE_MULTIPLE) {
    const selected = new Set(selectedPackageIds);
    const packageNames = options
      .filter((entry) => entry.packageId && selected.has(entry.packageId))
      .map((entry) => entry.label.replace(/^Lernpaket\s+/u, ""));
    return `${packageNames.join(", ") || "Mehrere Lernpakete"} · ${wordLabel}`;
  }
  const option = options.find((entry) => entry.value === value);
  return `${option?.label ?? "Lernbereich"} · ${wordLabel}`;
}

function storageKey(courseId) {
  return `edutools:learning-scope:${String(courseId ?? "course")}`;
}

export function loadLearningScope(courseId, storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem?.(storageKey(courseId)) ?? "null");
    if (!value || typeof value !== "object") return null;
    return {
      value: typeof value.value === "string" ? value.value : LEARNING_SCOPE_ALL,
      packageIds: Array.isArray(value.packageIds)
        ? value.packageIds.filter((id) => typeof id === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export function saveLearningScope(courseId, selection, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(storageKey(courseId), JSON.stringify({
      value: selection?.value ?? LEARNING_SCOPE_ALL,
      packageIds: Array.isArray(selection?.packageIds) ? selection.packageIds : [],
    }));
    return true;
  } catch {
    return false;
  }
}
