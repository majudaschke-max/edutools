import { createRuntimeCourseContext } from "../course-library/course-schema.js?v=4.0.3";
import { loadBuiltInCourseContext } from "../course-library/built-in-course.js?v=4.0.3";
import { createCourseLibraryStorage } from "../course-library/course-library-storage.js?v=4.0.3";
import { createCourseLibraryService } from "../course-library/course-library-service.js?v=4.0.3";
import { createCourseRuntime } from "../course-library/course-runtime.js?v=4.0.3";
import { migrateLegacyAuthorStorage } from "../core/storage.js";

/** Author-only bootstrap. Learner builds omit this module and all descendants. */
export async function initializeAuthoring(options = {}) {
  const builtInContext = await loadBuiltInCourseContext({
    courseConfigUrl: options.courseConfigUrl,
    vocabularyDataUrl: options.vocabularyDataUrl,
  });

  migrateLegacyAuthorStorage();
  const storage = createCourseLibraryStorage();
  const loadedLibrary = storage.load(builtInContext.builtInCourse, new Date());
  const service = createCourseLibraryService({
    builtInCourse: builtInContext.builtInCourse,
    initialState: loadedLibrary.state,
    storage,
  });
  let courseConfig = builtInContext.courseConfig;
  let vocabularyData = builtInContext.vocabularyData;
  const activeCourseId = service.getState().activeCourseId;
  if (activeCourseId !== builtInContext.builtInCourse.id) {
    try {
      ({ courseConfig, vocabularyData } = createRuntimeCourseContext(
        service.getCourse(activeCourseId),
        builtInContext.courseConfig,
      ));
    } catch (error) {
      console.error(
        "Aktiver lokaler Kurs konnte nicht geladen werden; der mitgelieferte Kurs wird verwendet.",
        error,
      );
      service.setActiveCourse(builtInContext.builtInCourse.id);
    }
  }

  return {
    ...builtInContext,
    courseConfig,
    vocabularyData,
    courseLibraryService: service,
    loadedLibrary,
    createCourseRuntime,
  };
}
