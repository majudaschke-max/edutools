import {
  createRuntimeCourseContext,
  rebuildCourseData,
} from "../course-library/course-schema.js";
import { assertValidCourse } from "../course-library/course-validator.js";
import { loadJsonResource } from "../core/utils.js";

/** Loads exactly the one canonical course named by a learner profile. */
export async function loadPublishedCourseContext(profile, options = {}) {
  const load = options.loadJson ?? loadJsonResource;
  const baseUrl = options.baseUrl
    ?? globalThis.document?.baseURI
    ?? globalThis.location?.href;
  const courseUrl = new URL(profile.course.file, baseUrl);
  const raw = await load(courseUrl, "Veröffentlichter Kurs");
  const course = rebuildCourseData(raw);
  assertValidCourse(course);
  if (course.id !== profile.course.id) {
    throw new TypeError(
      `Veröffentlichter Kurs: Erwartet wurde Kurs-ID „${profile.course.id}“, geladen wurde „${course.id}“.`,
    );
  }

  return {
    course,
    ...createRuntimeCourseContext(course, {
      dailyNewWordLimit: 10,
      dailyReviewLimit: 20,
      showLockedUnits: true,
    }),
  };
}

