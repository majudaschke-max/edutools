import { assertNonEmptyString } from "./utils.js";

const LEGACY_STORAGE_NAMESPACE = "edutools:vocabulary-trainer";
const STORAGE_APP_TYPE = "vocabulary";
let activeDeploymentId = null;

function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Liest einen JSON-Wert aus dem lokalen Browser-Speicher.
 * Beschädigtes JSON wird entfernt, damit es folgende Starts nicht blockiert.
 *
 * @template T
 * @param {string} key Storage-Key.
 * @param {T} fallbackValue Rückgabewert bei fehlenden oder unlesbaren Daten.
 * @returns {unknown|T}
 */
export function loadJson(key, fallbackValue) {
  const storageKey = assertNonEmptyString(key, "Storage-Key");
  const storage = getLocalStorage();

  if (!storage) {
    return fallbackValue;
  }

  let serializedValue;

  try {
    serializedValue = storage.getItem(storageKey);
  } catch {
    return fallbackValue;
  }

  if (serializedValue === null) {
    return fallbackValue;
  }

  try {
    return JSON.parse(serializedValue);
  } catch {
    try {
      storage.removeItem(storageKey);
    } catch {
      // Ein nicht beschreibbarer Storage darf das sichere Fallback nicht verhindern.
    }

    return fallbackValue;
  }
}

/**
 * Speichert einen Wert als JSON im lokalen Browser-Speicher.
 *
 * @param {string} key Storage-Key.
 * @param {unknown} value Zu speichernder Wert.
 * @returns {boolean} `true`, wenn der Wert gespeichert wurde.
 */
export function saveJson(key, value) {
  const storageKey = assertNonEmptyString(key, "Storage-Key");
  const storage = getLocalStorage();

  if (!storage) {
    return false;
  }

  try {
    const serializedValue = JSON.stringify(value);

    if (serializedValue === undefined) {
      return false;
    }

    storage.setItem(storageKey, serializedValue);
    return true;
  } catch {
    return false;
  }
}

/**
 * Entfernt einen einzelnen Eintrag aus dem lokalen Browser-Speicher.
 *
 * @param {string} key Storage-Key.
 * @returns {boolean} `true`, wenn der Löschzugriff möglich war.
 */
export function removeKey(key) {
  const storageKey = assertNonEmptyString(key, "Storage-Key");
  const storage = getLocalStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Erzeugt einen stabilen, kursbezogenen Storage-Key.
 *
 * @param {string} courseId Dauerhafte ID des Kurses.
 * @param {string} area Speicherbereich, zum Beispiel `learning-state`.
 * @returns {string}
 */
export function createCourseStorageKey(courseId, area) {
  const normalizedCourseId = assertNonEmptyString(courseId, "courseId");
  const normalizedArea = assertNonEmptyString(area, "Storage-Bereich");

  if (!activeDeploymentId) {
    return `${LEGACY_STORAGE_NAMESPACE}:${normalizedCourseId}:${normalizedArea}`;
  }

  const areaAliases = {
    "learning-state": "learning",
    "motivation-state": "motivation",
  };
  return `edutools:${STORAGE_APP_TYPE}:${activeDeploymentId}:course:${normalizedCourseId}:${areaAliases[normalizedArea] ?? normalizedArea}`;
}

/** Activates the stable namespace from the validated deployment profile. */
export function configureStorageNamespace(deploymentId) {
  const normalized = assertNonEmptyString(deploymentId, "deploymentId");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    throw new TypeError("deploymentId enthält unzulässige Zeichen.");
  }
  activeDeploymentId = normalized;
  return activeDeploymentId;
}

export function getStorageNamespace() {
  return activeDeploymentId
    ? `edutools:${STORAGE_APP_TYPE}:${activeDeploymentId}`
    : LEGACY_STORAGE_NAMESPACE;
}

/** Creates a deployment-wide key that is not tied to one course. */
export function createDeploymentStorageKey(area) {
  const normalizedArea = assertNonEmptyString(area, "Storage-Bereich");
  return activeDeploymentId
    ? `${getStorageNamespace()}:${normalizedArea}`
    : `${LEGACY_STORAGE_NAMESPACE}:${normalizedArea}`;
}

export function createLegacyCourseStorageKey(courseId, area) {
  return `${LEGACY_STORAGE_NAMESPACE}:${assertNonEmptyString(courseId, "courseId")}:${assertNonEmptyString(area, "Storage-Bereich")}`;
}

/**
 * Copies the pre-Sprint-2.2 author data into the author deployment exactly
 * once. Source entries remain untouched; the marker is written only after all
 * required target writes succeeded.
 */
export function migrateLegacyAuthorStorage(options = {}) {
  if (!activeDeploymentId) return { migrated: false, reason: "namespace-missing" };
  const storage = options.storage ?? getLocalStorage();
  if (!storage) return { migrated: false, reason: "storage-unavailable" };
  const migrationKey = createDeploymentStorageKey("migration:legacy-author-v1");
  try {
    if (storage.getItem(migrationKey) !== null) {
      return { migrated: false, alreadyCompleted: true };
    }

    const pairs = [
      [`${LEGACY_STORAGE_NAMESPACE}:course-library`, createDeploymentStorageKey("course-library")],
      [`${LEGACY_STORAGE_NAMESPACE}:active-course`, createDeploymentStorageKey("active-course")],
    ];
    for (let index = 0; index < storage.length; index += 1) {
      const sourceKey = storage.key(index);
      const match = sourceKey?.match(/^edutools:vocabulary-trainer:(.+):(learning-state|motivation-state)$/);
      if (!match) continue;
      pairs.push([sourceKey, createCourseStorageKey(match[1], match[2])]);
    }

    let copied = 0;
    for (const [sourceKey, targetKey] of pairs) {
      const sourceValue = storage.getItem(sourceKey);
      if (sourceValue === null || storage.getItem(targetKey) !== null) continue;
      storage.setItem(targetKey, sourceValue);
      if (storage.getItem(targetKey) !== sourceValue) {
        throw new Error(`Migration konnte ${targetKey} nicht bestätigen.`);
      }
      copied += 1;
    }
    storage.setItem(migrationKey, JSON.stringify({ schemaVersion: 1, completed: true }));
    return { migrated: copied > 0, copied, alreadyCompleted: false };
  } catch (error) {
    console.error("Bestehende Autorendaten konnten nicht migriert werden.", error);
    return { migrated: false, reason: "storage-error", error };
  }
}
