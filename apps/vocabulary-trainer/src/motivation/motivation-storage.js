import {
  createCourseStorageKey,
  loadJson,
  removeKey,
  saveJson,
} from "../core/storage.js";
import {
  createInitialMotivationState,
  migrateMotivationState,
  validateMotivationState,
} from "./motivation-state.js?v=4.0.5";

const MOTIVATION_STORAGE_AREA = "motivation-state";

export function getMotivationStorageKey(courseId) {
  return createCourseStorageKey(courseId, MOTIVATION_STORAGE_AREA);
}

/** Loads motivation safely; invalid data never affects the learning state. */
export function loadMotivationState(courseId, options = {}) {
  const initial = createInitialMotivationState(courseId, options);
  const missing = {};
  const stored = loadJson(getMotivationStorageKey(courseId), missing);
  if (stored === missing) return initial;

  try {
    const migrated = migrateMotivationState(stored, courseId, options);
    if (stored.schemaVersion !== migrated.schemaVersion) saveMotivationState(migrated);
    return migrated;
  } catch {
    removeKey(getMotivationStorageKey(courseId));
    return initial;
  }
}

export function saveMotivationState(state) {
  const valid = validateMotivationState(state, state?.courseId);
  return saveJson(getMotivationStorageKey(valid.courseId), valid);
}

export function removeMotivationState(courseId) {
  return removeKey(getMotivationStorageKey(courseId));
}
