import {
  createDeploymentStorageKey,
  loadJson,
  removeKey,
  saveJson,
} from "../core/storage.js";
import {
  COURSE_SOURCE_TYPES,
  rebuildCourseData,
} from "./course-schema.js?v=4.0.3";
import { validateCourse } from "./course-validator.js?v=4.0.3";
import { createCourseLibraryState } from "./course-library-state.js";

export const COURSE_LIBRARY_KEY = "edutools:vocabulary-trainer:course-library";
export const ACTIVE_COURSE_KEY = "edutools:vocabulary-trainer:active-course";

function resolveBundledCourses(input) {
  const values = Array.isArray(input) ? input : [input];
  const descriptors = values.map((value) => {
    if (typeof value === "string" && value.trim()) {
      return { id: value.trim(), contentVersion: 1 };
    }
    if (
      value?.sourceType !== COURSE_SOURCE_TYPES.BUNDLED
      || value?.editable !== false
      || typeof value.id !== "string"
    ) {
      throw new TypeError("Mitgelieferte Kurse müssen eindeutig als bundled und nicht editierbar gekennzeichnet sein.");
    }
    return { id: value.id, contentVersion: value.contentVersion ?? 1 };
  });
  if (descriptors.length === 0) throw new TypeError("Mindestens ein mitgelieferter Kurs ist erforderlich.");
  if (new Set(descriptors.map(({ id }) => id)).size !== descriptors.length) {
    throw new TypeError("Mitgelieferte Kurs-IDs müssen eindeutig sein.");
  }
  return descriptors;
}

export function createCourseLibraryStorage(options = {}) {
  const read = options.loadJson ?? loadJson;
  const write = options.saveJson ?? saveJson;
  const remove = options.removeKey ?? removeKey;
  const libraryKey = options.courseLibraryKey ?? createDeploymentStorageKey("course-library");
  const activeCourseKey = options.activeCourseKey ?? createDeploymentStorageKey("active-course");

  function load(builtInCoursesOrIds, now = new Date()) {
    const bundledCourses = resolveBundledCourses(builtInCoursesOrIds);
    const bundledById = new Map(bundledCourses.map((course) => [course.id, course]));
    const builtInCourseId = bundledCourses[0].id;
    const fallback = createCourseLibraryState(builtInCourseId, now);
    const missing = {};
    const stored = read(libraryKey, missing);
    if (stored === missing) return { state: fallback, recovered: false };

    try {
      if (stored?.schemaVersion !== 1 || !Array.isArray(stored.courses)) throw new TypeError("Schema");
      const ids = new Set();
      const previousBundledVersions = new Map();
      const courses = stored.courses.flatMap((raw) => {
        const course = rebuildCourseData(raw);
        const result = validateCourse(course);
        if (!result.valid || ids.has(course.id)) throw new TypeError("Kursdaten");
        const isBundledSnapshot = raw?.sourceType === COURSE_SOURCE_TYPES.BUNDLED
          && raw?.editable === false;
        if (isBundledSnapshot) {
          if (bundledById.has(course.id)) {
            previousBundledVersions.set(course.id, course.contentVersion);
          }
          return [];
        }
        ids.add(course.id);
        return [course];
      });
      const activeStored = read(activeCourseKey, stored.activeCourseId ?? builtInCourseId);
      const activeCourseId = bundledById.has(activeStored) || ids.has(activeStored)
        ? activeStored
        : builtInCourseId;
      const state = { ...fallback, ...stored, activeCourseId, courses };
      const bundledUpdates = bundledCourses.flatMap((bundled) => {
        const previousContentVersion = previousBundledVersions.get(bundled.id);
        return previousContentVersion !== undefined
          ? [{
              courseId: bundled.id,
              previousContentVersion,
              contentVersion: bundled.contentVersion,
              updated: previousContentVersion < bundled.contentVersion,
            }]
          : [];
      });
      const builtInUpdated = bundledUpdates.some((update) => update.updated);

      // Frühere Versionen speicherten mitgelieferte Snapshots teilweise in der
      // lokalen Bibliothek. Ausschließlich eindeutig als bundled und nicht
      // editierbar markierte Snapshots werden entfernt. Eigene, importierte und
      // duplizierte Kurse bleiben unabhängig von Titel und Inhaltsversion lokal.
      if (stored.courses.length !== courses.length) {
        write(activeCourseKey, activeCourseId);
        write(libraryKey, state);
      }

      return {
        state,
        recovered: activeCourseId !== activeStored,
        builtInUpdated,
        bundledUpdates,
        previousBuiltInContentVersion: previousBundledVersions.get(builtInCourseId) ?? null,
      };
    } catch (error) {
      console.error("Beschädigte Kursbibliothek wurde isoliert verworfen.", error);
      remove(libraryKey);
      remove(activeCourseKey);
      return { state: fallback, recovered: true };
    }
  }

  function save(state) {
    const libraryState = { ...state, updatedAt: new Date().toISOString() };
    const previousActiveCourseId = read(activeCourseKey, null);
    if (!write(activeCourseKey, libraryState.activeCourseId)) return false;
    if (!write(libraryKey, libraryState)) {
      write(activeCourseKey, previousActiveCourseId);
      return false;
    }
    return true;
  }

  return Object.freeze({ load, save });
}
