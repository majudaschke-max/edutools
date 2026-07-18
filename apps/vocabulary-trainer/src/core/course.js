import {
  DataValidationError,
  isNonEmptyString,
  isPlainObject,
  loadJsonResource,
} from "./utils.js";

/**
 * Loads and validates a course configuration from a JSON resource.
 *
 * @param {string | URL} url Resource URL.
 * @returns {Promise<object>} Valid course configuration.
 */
export async function loadCourseConfig(url) {
  const config = await loadJsonResource(url, "Kurskonfiguration");

  try {
    validateCourseConfig(config);
  } catch (error) {
    if (error instanceof DataValidationError) {
      throw createContextualValidationError("Kurskonfiguration", error);
    }

    throw error;
  }

  return config;
}

/**
 * Validates all fields required by the Vocabulary Trainer course core.
 *
 * @param {unknown} config Potential course configuration.
 * @returns {true}
 * @throws {DataValidationError} If the configuration is invalid.
 */
export function validateCourseConfig(config) {
  if (!isPlainObject(config)) {
    throw new DataValidationError("Konfiguration muss ein Objekt sein.");
  }

  if (!isNonEmptyString(config.courseId)) {
    throw new DataValidationError("courseId fehlt.");
  }

  if (!isNonEmptyString(config.title)) {
    throw new DataValidationError("title fehlt.");
  }

  if (
    "contentVersion" in config
    && (!Number.isInteger(config.contentVersion) || config.contentVersion < 1)
  ) {
    throw new DataValidationError("contentVersion muss eine positive ganze Zahl sein.");
  }

  if ("sourceType" in config && !isNonEmptyString(config.sourceType)) {
    throw new DataValidationError("sourceType muss ein nicht leerer String sein.");
  }

  if ("editable" in config && typeof config.editable !== "boolean") {
    throw new DataValidationError("editable muss ein boolescher Wert sein.");
  }

  validateCourseLanguages(config.languages);

  if (!isNonEmptyString(config.mode)) {
    throw new DataValidationError("mode fehlt.");
  }

  if (!Array.isArray(config.availableUnits)) {
    throw new DataValidationError(
      "availableUnits muss ein Array sein.",
    );
  }

  if (config.availableUnits.length === 0) {
    throw new DataValidationError(
      "availableUnits darf nicht leer sein.",
    );
  }

  const uniqueUnitIds = new Set();

  config.availableUnits.forEach((unitId, index) => {
    if (!isNonEmptyString(unitId)) {
      throw new DataValidationError(
        `availableUnits[${index}] muss eine nicht leere Lernpaket-ID sein.`,
      );
    }

    if (uniqueUnitIds.has(unitId)) {
      throw new DataValidationError(
        `Lernpaket-ID "${unitId}" kommt in availableUnits mehrfach vor.`,
      );
    }

    uniqueUnitIds.add(unitId);
  });

  if (!isNonEmptyString(config.currentUnit)) {
    throw new DataValidationError(
      "currentUnit fehlt.",
    );
  }

  if (!uniqueUnitIds.has(config.currentUnit)) {
    throw new DataValidationError(
      `currentUnit "${config.currentUnit}" ist nicht freigegeben.`,
    );
  }

  if (typeof config.showLockedUnits !== "boolean") {
    throw new DataValidationError(
      "showLockedUnits muss ein boolescher Wert sein.",
    );
  }

  assertNonNegativeInteger(config.dailyNewWordLimit, "dailyNewWordLimit");
  assertNonNegativeInteger(config.dailyReviewLimit, "dailyReviewLimit");

  return true;
}

/**
 * Returns a defensive copy of the unit IDs enabled for this course.
 *
 * @param {object} config Valid course configuration.
 * @returns {string[]} Available unit IDs in configured order.
 */
export function getAvailableUnitIds(config) {
  validateCourseConfig(config);
  return [...config.availableUnits];
}

/**
 * Reports whether a unit is enabled in the course configuration.
 *
 * @param {object} config Valid course configuration.
 * @param {string} unitId Lernpaket ID to inspect.
 * @returns {boolean}
 */
export function isUnitAvailable(config, unitId) {
  validateCourseConfig(config);

  if (!isNonEmptyString(unitId)) {
    return false;
  }

  return config.availableUnits.includes(unitId);
}

/**
 * Returns the configured current unit after validating its availability.
 *
 * @param {object} config Valid course configuration.
 * @returns {string} Current unit ID.
 */
export function getCurrentUnitId(config) {
  validateCourseConfig(config);
  return config.currentUnit;
}

/** Updates the existing course state to another already available Lernpaket. */
export function setCurrentUnitId(config, unitId) {
  validateCourseConfig(config);
  if (!isNonEmptyString(unitId) || !config.availableUnits.includes(unitId)) {
    throw new DataValidationError(`Lernpaket "${String(unitId ?? "")}" ist nicht freigegeben.`);
  }
  config.currentUnit = unitId;
  return config.currentUnit;
}

/**
 * Filters a complete unit-ID list down to units not enabled for this course.
 *
 * @param {object} config Valid course configuration.
 * @param {string[]} allUnitIds All known unit IDs in display order.
 * @returns {string[]} Locked unit IDs in their original order.
 */
export function getLockedUnitIds(config, allUnitIds) {
  validateCourseConfig(config);

  if (!Array.isArray(allUnitIds)) {
    throw new DataValidationError("allUnitIds muss ein Array sein.");
  }

  const availableUnitIds = new Set(config.availableUnits);
  const seenUnitIds = new Set();

  return allUnitIds.filter((unitId, index) => {
    if (!isNonEmptyString(unitId)) {
      throw new DataValidationError(
        `allUnitIds[${index}] muss eine nicht leere Lernpaket-ID sein.`,
      );
    }

    if (seenUnitIds.has(unitId)) {
      throw new DataValidationError(
        `Lernpaket-ID "${unitId}" kommt in allUnitIds mehrfach vor.`,
      );
    }

    seenUnitIds.add(unitId);
    return !availableUnitIds.has(unitId);
  });
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new DataValidationError(
      `${fieldName} muss eine nicht negative ganze Zahl sein.`,
    );
  }
}

function validateCourseLanguages(languages) {
  if (!isPlainObject(languages)) {
    throw new DataValidationError("languages fehlt.");
  }

  ["source", "target"].forEach((role) => {
    const language = languages[role];
    if (!isPlainObject(language)) {
      throw new DataValidationError(`languages.${role} fehlt.`);
    }
    if (!isNonEmptyString(language.code)) {
      throw new DataValidationError(`languages.${role}.code fehlt.`);
    }
    if (!isNonEmptyString(language.label)) {
      throw new DataValidationError(`languages.${role}.label fehlt.`);
    }
  });
}

function createContextualValidationError(resourceName, error) {
  const detail = error.message.replace(/\.$/, "");
  return new DataValidationError(
    `${resourceName} ist ungültig: ${detail}.`,
    error.issues,
  );
}
