// @ts-check

/**
 * @typedef {"create" | "append"} ImportIntent
 */

/**
 * @typedef {object} ImportDraftWord
 * @property {string} source
 * @property {string[]} targets
 * @property {string} phonetic
 * @property {string} hint
 * @property {string} example
 * @property {string[]} tags
 */

/**
 * @typedef {object} ImportDraftUnit
 * @property {string} title
 * @property {string=} description
 * @property {number=} order
 * @property {boolean=} released
 * @property {boolean=} current
 * @property {boolean=} archived
 * @property {ImportDraftWord[]} words
 */

/**
 * @typedef {object} ImportDraftCourse
 * @property {string} title
 * @property {string=} subtitle
 * @property {string} description
 * @property {string=} schoolType
 * @property {string=} gradeLevel
 * @property {string} sourceLanguage
 * @property {string} targetLanguage
 */

/**
 * Content-only intermediate representation used inside the Author import
 * pipeline. It is neither persistent nor an export format.
 *
 * @typedef {object} ImportDraft
 * @property {1} draftVersion
 * @property {ImportIntent} intent
 * @property {string} sourceKind
 * @property {ImportDraftCourse} course
 * @property {ImportDraftUnit[]} units
 */

/**
 * @typedef {object} CourseBackupCandidate
 * @property {"course-backup"} payloadKind
 * @property {1} candidateVersion
 * @property {object} course
 */

export const IMPORT_DRAFT_VERSION = 1;
export const COURSE_BACKUP_CANDIDATE_VERSION = 1;
export const IMPORT_INTENTS = Object.freeze(["create", "append"]);
export const IMPORT_PAYLOAD_KINDS = Object.freeze(["content", "restore"]);

function copyList(value) {
  return Array.isArray(value) ? [...value] : value;
}

function copyWord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return {
    source: value.source ?? "",
    targets: copyList(value.targets),
    phonetic: value.phonetic ?? "",
    hint: value.hint ?? "",
    example: value.example ?? "",
    tags: copyList(value.tags),
  };
}

function copyUnit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const unit = {
    title: value.title ?? "",
    words: Array.isArray(value.words) ? value.words.map(copyWord) : value.words,
  };
  for (const field of ["description", "order", "released", "current", "archived"]) {
    if (Object.hasOwn(value, field)) unit[field] = value[field];
  }
  return unit;
}

/**
 * Creates an isolated content draft. Adapters remain responsible for
 * supplying fachliche values; this factory deliberately creates no IDs,
 * timestamps or canonical course metadata.
 *
 * @param {Partial<ImportDraft> & {course?: Partial<ImportDraftCourse>, units?: unknown[]}} input
 * @returns {ImportDraft}
 */
export function createImportDraft(input = {}) {
  const course = input.course && typeof input.course === "object" && !Array.isArray(input.course)
    ? input.course
    : {};
  const draft = /** @type {ImportDraft} */ ({
    draftVersion: IMPORT_DRAFT_VERSION,
    intent: input.intent ?? "create",
    sourceKind: input.sourceKind ?? "unknown",
    course: {
      title: course.title ?? "",
      description: course.description ?? "",
      sourceLanguage: course.sourceLanguage ?? "",
      targetLanguage: course.targetLanguage ?? "",
    },
    units: Array.isArray(input.units) ? input.units.map(copyUnit) : [],
  });
  for (const field of ["subtitle", "schoolType", "gradeLevel"]) {
    if (Object.hasOwn(course, field)) draft.course[field] = course[field] ?? "";
  }
  return draft;
}

/**
 * @param {object} course A safely rebuilt canonical course candidate.
 * @returns {CourseBackupCandidate}
 */
export function createCourseBackupCandidate(course) {
  return {
    payloadKind: "course-backup",
    candidateVersion: COURSE_BACKUP_CANDIDATE_VERSION,
    course,
  };
}
