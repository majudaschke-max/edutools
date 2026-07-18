import { getAvailableUnitIds } from "./course.js";
import {
  DataValidationError,
  isNonEmptyString,
  isPlainObject,
  loadJsonResource,
} from "./utils.js";

const SUPPORTED_SCHEMA_VERSION = 1;
const OPTIONAL_TEXT_FIELDS = ["phonetic", "hint", "example"];

/**
 * Loads, validates and normalizes vocabulary data from a JSON resource.
 *
 * @param {string | URL} url Resource URL.
 * @returns {Promise<object>} Normalized vocabulary data.
 */
export async function loadVocabularyData(url) {
  const data = await loadJsonResource(url, "Vokabeldaten");

  try {
    validateVocabularyData(data);
  } catch (error) {
    if (error instanceof DataValidationError) {
      throw createContextualValidationError("Vokabeldaten", error);
    }

    throw error;
  }

  return normalizeVocabularyData(data);
}

/**
 * Validates the vocabulary schema, units, words and optional word fields.
 *
 * @param {unknown} data Potential vocabulary data.
 * @returns {true}
 * @throws {DataValidationError} If the vocabulary data is invalid.
 */
export function validateVocabularyData(data) {
  if (!isPlainObject(data)) {
    throw new DataValidationError("Daten müssen ein Objekt sein.");
  }

  if (data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new DataValidationError(
      `schemaVersion muss ${SUPPORTED_SCHEMA_VERSION} sein.`,
    );
  }

  if (!isNonEmptyString(data.courseId)) {
    throw new DataValidationError(
      "courseId fehlt.",
    );
  }

  if (
    "contentVersion" in data
    && (!Number.isInteger(data.contentVersion) || data.contentVersion < 1)
  ) {
    throw new DataValidationError(
      "contentVersion muss eine positive ganze Zahl sein.",
    );
  }

  if (!Array.isArray(data.units)) {
    throw new DataValidationError(
      "units muss ein Array sein.",
    );
  }

  const unitIds = new Set();
  const wordIds = new Set();

  data.units.forEach((unit, unitIndex) => {
    validateUnit(unit, unitIndex, unitIds, wordIds);
  });

  return true;
}

/**
 * Returns all words in source order and adds their containing `unitId`.
 *
 * @param {object} data Valid vocabulary data.
 * @returns {object[]} Normalized words.
 */
export function getAllWords(data) {
  validateVocabularyData(data);

  return data.units.flatMap((unit) =>
    unit.words.map((word) => normalizeWord(word, unit.id)),
  );
}

/**
 * Returns normalized words from one unit in source order.
 *
 * @param {object} data Valid vocabulary data.
 * @param {string} unitId Lernpaket ID to select.
 * @returns {object[]} Matching words, or an empty array for an unknown unit.
 */
export function getWordsByUnit(data, unitId) {
  validateVocabularyData(data);

  if (!isNonEmptyString(unitId)) {
    return [];
  }

  const unit = data.units.find((candidate) => candidate.id === unitId);

  if (!unit) {
    return [];
  }

  return unit.words.map((word) => normalizeWord(word, unit.id));
}

/**
 * Returns only words whose units are enabled by the matching course config.
 *
 * @param {object} data Valid vocabulary data.
 * @param {object} courseConfig Valid course configuration.
 * @returns {object[]} Available normalized words in source order.
 */
export function getAvailableWords(data, courseConfig) {
  validateVocabularyData(data);
  assertMatchingCourseIds(courseConfig, data);

  const availableUnitIds = new Set(getAvailableUnitIds(courseConfig));

  return data.units.flatMap((unit) => {
    if (!availableUnitIds.has(unit.id)) {
      return [];
    }

    return unit.words.map((word) => normalizeWord(word, unit.id));
  });
}

/**
 * Finds one normalized word by its globally unique course word ID.
 *
 * @param {object} data Valid vocabulary data.
 * @param {string} wordId Word ID to find.
 * @returns {object | undefined} Matching word, if present.
 */
export function findWordById(data, wordId) {
  if (!isNonEmptyString(wordId)) {
    return undefined;
  }

  return getAllWords(data).find((word) => word.id === wordId);
}

/**
 * Ensures that course configuration and vocabulary data belong together.
 *
 * @param {object} courseConfig Course configuration.
 * @param {object} data Vocabulary data.
 * @returns {true}
 * @throws {DataValidationError} If either ID is missing or they differ.
 */
export function assertMatchingCourseIds(courseConfig, data) {
  if (!isPlainObject(courseConfig) || !isNonEmptyString(courseConfig.courseId)) {
    throw new DataValidationError(
      "Kurs und Vokabeldatei können nicht zugeordnet werden: courseId der Kurskonfiguration fehlt.",
    );
  }

  if (!isPlainObject(data) || !isNonEmptyString(data.courseId)) {
    throw new DataValidationError(
      "Kurs und Vokabeldatei können nicht zugeordnet werden: courseId der Vokabeldatei fehlt.",
    );
  }

  if (courseConfig.courseId !== data.courseId) {
    throw new DataValidationError(
      `Kurs und Vokabeldatei gehören nicht zusammen: courseId "${courseConfig.courseId}" stimmt nicht mit "${data.courseId}" überein.`,
    );
  }


  if (
    ("contentVersion" in courseConfig || "contentVersion" in data)
    && courseConfig.contentVersion !== data.contentVersion
  ) {
    throw new DataValidationError(
      `Kurs und Vokabeldatei besitzen unterschiedliche Inhaltsversionen: "${courseConfig.contentVersion}" und "${data.contentVersion}".`,
    );
  }

  return true;
}

function validateUnit(unit, unitIndex, unitIds, wordIds) {
  const unitPath = `units[${unitIndex}]`;

  if (!isPlainObject(unit)) {
    throw new DataValidationError(
      `${unitPath} muss ein Objekt sein.`,
    );
  }

  if (!isNonEmptyString(unit.id)) {
    throw new DataValidationError(
      `${unitPath}.id fehlt.`,
    );
  }

  if (unitIds.has(unit.id)) {
    throw new DataValidationError(
      `Lernpaket-ID "${unit.id}" kommt mehrfach vor.`,
    );
  }

  unitIds.add(unit.id);

  if (!isNonEmptyString(unit.title)) {
    throw new DataValidationError(
      `${unitPath}.title fehlt.`,
    );
  }

  if (!Number.isInteger(unit.order) || unit.order < 0) {
    throw new DataValidationError(
      `${unitPath}.order muss eine nicht negative ganze Zahl sein.`,
    );
  }

  if (!Array.isArray(unit.words)) {
    throw new DataValidationError(
      `${unitPath}.words muss ein Array sein.`,
    );
  }

  unit.words.forEach((word, wordIndex) => {
    validateWord(word, unit, unitPath, wordIndex, wordIds);
  });
}

function validateWord(word, unit, unitPath, wordIndex, wordIds) {
  const wordPath = `${unitPath}.words[${wordIndex}]`;

  if (!isPlainObject(word)) {
    throw new DataValidationError(
      `${wordPath} muss ein Objekt sein.`,
    );
  }

  if (!isNonEmptyString(word.id)) {
    throw new DataValidationError(
      `${wordPath}.id fehlt.`,
    );
  }

  if (wordIds.has(word.id)) {
    throw new DataValidationError(
      `Wort-ID "${word.id}" kommt mehrfach vor.`,
    );
  }

  wordIds.add(word.id);

  if (!isNonEmptyString(word.source)) {
    throw new DataValidationError(
      `${wordPath}.source darf nicht leer sein.`,
    );
  }

  if (!Array.isArray(word.targets) || word.targets.length === 0) {
    throw new DataValidationError(
      `${wordPath}.targets muss mindestens eine Übersetzung enthalten.`,
    );
  }

  word.targets.forEach((target, targetIndex) => {
    if (!isNonEmptyString(target)) {
      throw new DataValidationError(
        `${wordPath}.targets[${targetIndex}] darf nicht leer sein.`,
      );
    }
  });

  OPTIONAL_TEXT_FIELDS.forEach((fieldName) => {
    if (fieldName in word && !isNonEmptyString(word[fieldName])) {
      throw new DataValidationError(
        `${wordPath}.${fieldName} muss eine nicht leere Zeichenkette sein.`,
      );
    }
  });

  if ("tags" in word) {
    validateTags(word.tags, wordPath);
  }

  if ("unitId" in word && word.unitId !== unit.id) {
    throw new DataValidationError(
      `${wordPath}.unitId muss "${unit.id}" entsprechen.`,
    );
  }
}

function validateTags(tags, wordPath) {
  if (!Array.isArray(tags)) {
    throw new DataValidationError(
      `${wordPath}.tags muss ein Array sein.`,
    );
  }

  const uniqueTags = new Set();

  tags.forEach((tag, tagIndex) => {
    if (!isNonEmptyString(tag)) {
      throw new DataValidationError(
        `${wordPath}.tags[${tagIndex}] darf nicht leer sein.`,
      );
    }

    if (uniqueTags.has(tag)) {
      throw new DataValidationError(
        `Tag "${tag}" kommt in ${wordPath}.tags mehrfach vor.`,
      );
    }

    uniqueTags.add(tag);
  });
}

function normalizeVocabularyData(data) {
  return {
    ...data,
    units: data.units.map((unit) => ({
      ...unit,
      words: unit.words.map((word) => normalizeWord(word, unit.id)),
    })),
  };
}

function normalizeWord(word, unitId) {
  const normalizedWord = {
    ...word,
    unitId,
    targets: [...word.targets],
  };

  if (Array.isArray(word.tags)) {
    normalizedWord.tags = [...word.tags];
  }

  return normalizedWord;
}

function createContextualValidationError(resourceName, error) {
  const detail = error.message.replace(/\.$/, "");
  return new DataValidationError(
    `${resourceName} sind ungültig: ${detail}.`,
    error.issues,
  );
}
