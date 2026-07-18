import { loadCourseConfig } from "../core/course.js?v=4.0.5";
import {
  assertMatchingCourseIds,
  loadVocabularyData,
} from "../core/vocabulary.js?v=4.0.5";
import {
  COURSE_SOURCE_TYPES,
  createBuiltInCourse,
} from "./course-schema.js?v=4.0.5";

/**
 * Loads the two authoritative bundled resources through the same path used by
 * app initialization and adapts them to the immutable library course.
 */
export async function loadBuiltInCourseContext(options = {}) {
  const loadConfig = options.loadConfig ?? loadCourseConfig;
  const loadVocabulary = options.loadVocabulary ?? loadVocabularyData;
  const courseConfig = await loadConfig(options.courseConfigUrl);
  const vocabularyData = await loadVocabulary(options.vocabularyDataUrl);
  assertMatchingCourseIds(courseConfig, vocabularyData);
  if (
    courseConfig.sourceType !== COURSE_SOURCE_TYPES.BUNDLED
    || courseConfig.editable !== false
  ) {
    throw new TypeError(
      "Mitgelieferte Kursressourcen benötigen sourceType „bundled“ und editable false.",
    );
  }

  return {
    courseConfig,
    vocabularyData,
    builtInCourse: createBuiltInCourse(courseConfig, vocabularyData),
  };
}
