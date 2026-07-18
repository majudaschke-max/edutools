import {
  DEFAULT_PRONUNCIATION_VALUES,
  PRONUNCIATION_PROVIDER,
} from "../audio/pronunciation-config.js";

export const COURSE_SCHEMA_VERSION = 1;
export const COURSE_APP_TYPE = "vocabulary";
export const COURSE_SOURCE_TYPES = Object.freeze({
  BUNDLED: "bundled",
  OWN: "own",
  IMPORTED: "imported",
  DUPLICATED: "duplicated",
});

const COURSE_SOURCE_TYPE_VALUES = new Set(Object.values(COURSE_SOURCE_TYPES));

const DEFAULT_LANGUAGE = Object.freeze({ code: "", label: "", speechLocale: "" });

function defaultIdSource() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createStableId(prefix, idGenerator = defaultIdSource) {
  const safePrefix = String(prefix ?? "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
  const generated = String(idGenerator()).trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  if (!generated) throw new TypeError("Die ID-Erzeugung lieferte keinen gültigen Wert.");
  return `${safePrefix}-${generated}`;
}

function stringValue(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function booleanValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveIntegerValue(value, fallback = 1) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function courseSourceTypeValue(value, fallback = COURSE_SOURCE_TYPES.OWN) {
  return COURSE_SOURCE_TYPE_VALUES.has(value) ? value : fallback;
}

function rebuildLanguage(value = DEFAULT_LANGUAGE) {
  return {
    code: stringValue(value?.code),
    label: stringValue(value?.label),
    speechLocale: stringValue(value?.speechLocale),
  };
}

function uniqueStrings(values = []) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values.flatMap((value) => {
    const normalized = stringValue(value);
    const key = normalized.normalize("NFC").toLocaleLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export function createCourse(input = {}, options = {}) {
  const now = new Date(options.now ?? Date.now()).toISOString();
  const sourceType = courseSourceTypeValue(
    options.sourceType,
    courseSourceTypeValue(input.sourceType),
  );
  const editable = typeof options.editable === "boolean"
    ? options.editable
    : booleanValue(input.editable, sourceType !== COURSE_SOURCE_TYPES.BUNDLED);

  return {
    schemaVersion: COURSE_SCHEMA_VERSION,
    id: stringValue(input.id) || createStableId("course", options.idGenerator),
    appType: COURSE_APP_TYPE,
    contentVersion: positiveIntegerValue(input.contentVersion),
    sourceType,
    editable,
    title: stringValue(input.title),
    subtitle: stringValue(input.subtitle),
    description: stringValue(input.description),
    schoolType: stringValue(input.schoolType),
    gradeLevel: stringValue(input.gradeLevel),
    createdAt: stringValue(input.createdAt) || now,
    updatedAt: stringValue(input.updatedAt) || now,
    languages: {
      source: rebuildLanguage(input.languages?.source),
      target: rebuildLanguage(input.languages?.target),
    },
    pronunciation: {
      enabled: booleanValue(input.pronunciation?.enabled, true),
      rate: numberValue(input.pronunciation?.rate, DEFAULT_PRONUNCIATION_VALUES.rate),
      pitch: numberValue(input.pronunciation?.pitch, DEFAULT_PRONUNCIATION_VALUES.pitch),
      volume: numberValue(input.pronunciation?.volume, DEFAULT_PRONUNCIATION_VALUES.volume),
    },
    archived: booleanValue(input.archived, false),
    units: [],
  };
}

export function createUnit(input = {}, options = {}) {
  return {
    id: stringValue(input.id) || createStableId("unit", options.idGenerator),
    title: stringValue(input.title),
    description: stringValue(input.description),
    order: Number.isInteger(input.order) && input.order >= 0 ? input.order : 0,
    released: booleanValue(input.released, false),
    current: booleanValue(input.current, false),
    archived: booleanValue(input.archived, false),
    words: [],
  };
}

export function createWord(input = {}, options = {}) {
  return {
    id: stringValue(input.id) || createStableId("word", options.idGenerator),
    source: stringValue(input.source),
    targets: uniqueStrings(input.targets),
    phonetic: stringValue(input.phonetic),
    hint: stringValue(input.hint),
    example: stringValue(input.example),
    tags: uniqueStrings(input.tags),
    archived: booleanValue(input.archived, false),
  };
}

/** Rebuilds imported data with explicit own properties only. */
export function rebuildCourseData(input, options = {}) {
  const course = createCourse(input, options);
  course.schemaVersion = input?.schemaVersion;
  course.appType = stringValue(input?.appType);
  course.archived = booleanValue(input?.archived, false);
  course.units = Array.isArray(input?.units)
    ? input.units.map((rawUnit, unitIndex) => {
      const unit = createUnit(rawUnit, options);
      unit.order = Number.isInteger(rawUnit?.order) ? rawUnit.order : unitIndex + 1;
      unit.words = Array.isArray(rawUnit?.words)
        ? rawUnit.words.map((rawWord) => createWord(rawWord, options))
        : [];
      return unit;
    })
    : [];
  return course;
}

export function cloneCourse(course) {
  return rebuildCourseData(course);
}

export function createBuiltInCourse(courseConfig, vocabularyData) {
  const now = "2026-01-01T00:00:00.000Z";
  const course = createCourse({
    id: courseConfig.courseId,
    contentVersion: courseConfig.contentVersion,
    title: courseConfig.title,
    createdAt: now,
    updatedAt: now,
    languages: courseConfig.languages,
    pronunciation: courseConfig.pronunciation,
  }, {
    sourceType: COURSE_SOURCE_TYPES.BUNDLED,
    editable: false,
  });
  const available = new Set(courseConfig.availableUnits);
  course.units = vocabularyData.units.map((rawUnit, index) => {
    const unit = createUnit({
      ...rawUnit,
      order: rawUnit.order ?? index + 1,
      released: available.has(rawUnit.id),
      current: rawUnit.id === courseConfig.currentUnit,
    });
    unit.words = rawUnit.words.map((word) => createWord(word));
    return unit;
  });
  return course;
}

export function duplicateCourse(course, options = {}) {
  const copy = cloneCourse(course);
  const now = new Date(options.now ?? Date.now()).toISOString();
  copy.id = createStableId("course", options.idGenerator);
  copy.sourceType = COURSE_SOURCE_TYPES.DUPLICATED;
  copy.editable = true;
  copy.title = stringValue(options.title) || `${course.title} – Kopie`;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.archived = false;
  copy.units = copy.units.map((unit) => ({
    ...unit,
    id: createStableId("unit", options.idGenerator),
    words: unit.words.map((word) => ({
      ...word,
      id: createStableId("word", options.idGenerator),
    })),
  }));
  return copy;
}

/** Adapts one canonical course to the unchanged Sprint 1.x core contracts. */
export function createRuntimeCourseContext(course, defaults = {}) {
  const units = course.units
    .filter((unit) => !unit.archived)
    .sort((left, right) => left.order - right.order);
  const releasedUnits = units.filter((unit) => unit.released);
  const current = releasedUnits.find((unit) => unit.current) ?? releasedUnits[0];
  if (!current) {
    throw new Error("Der Kurs benötigt mindestens ein freigegebenes, nicht archiviertes Lernpaket.");
  }

  const courseConfig = {
    courseId: course.id,
    contentVersion: course.contentVersion,
    sourceType: course.sourceType,
    editable: course.editable,
    title: course.title,
    languages: course.languages,
    pronunciation: { ...course.pronunciation, provider: PRONUNCIATION_PROVIDER },
    motivation: defaults.motivation,
    features: defaults.features,
    mode: defaults.mode ?? "school",
    currentUnit: current.id,
    availableUnits: releasedUnits.map((unit) => unit.id),
    showLockedUnits: defaults.showLockedUnits ?? true,
    dailyNewWordLimit: defaults.dailyNewWordLimit ?? 10,
    dailyReviewLimit: defaults.dailyReviewLimit ?? 20,
  };
  const vocabularyData = {
    schemaVersion: COURSE_SCHEMA_VERSION,
    courseId: course.id,
    contentVersion: course.contentVersion,
    units: units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      order: unit.order,
      words: unit.words.filter((word) => !word.archived).map((word) => {
        const result = { id: word.id, source: word.source, targets: [...word.targets] };
        for (const field of ["phonetic", "hint", "example"]) {
          if (word[field]) result[field] = word[field];
        }
        if (word.tags.length > 0) result.tags = [...word.tags];
        return result;
      }),
    })),
  };
  return { courseConfig, vocabularyData };
}
