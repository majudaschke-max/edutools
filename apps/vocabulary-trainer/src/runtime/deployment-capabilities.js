const AUTHOR_MODE = "author";
const LEARNER_MODE = "learner";

const AUTHOR_ROUTES = new Set(["/courses", "/course-builder"]);

/**
 * Resolves every deployment-dependent decision in one place. Views and
 * services consume these capabilities instead of branching on profile modes.
 */
export function createDeploymentCapabilities(profile) {
  const mode = profile?.mode;
  if (mode !== AUTHOR_MODE && mode !== LEARNER_MODE) {
    throw new TypeError("Das Laufzeitprofil besitzt keinen unterstützten Modus.");
  }

  const features = profile.features ?? {};
  const author = mode === AUTHOR_MODE;
  const values = Object.freeze({
    manageCourses: author && features.courseLibrary === true,
    buildCourses: author && features.courseBuilder === true,
    importCourses: author && features.importExport === true,
    exportCourses: author && features.importExport === true,
    switchCourses: author && features.courseLibrary === true,
    fixedCourse: !author,
    motivation: features.motivation === true,
    pronunciation: features.pronunciation === true,
    speedChallenge: features.speedChallenge === true,
    bookCapture: author && features.bookCapture === true,
  });

  function isRouteAvailable(route) {
    if (AUTHOR_ROUTES.has(route)) return values.manageCourses;
    if (route === "/speed") return values.speedChallenge;
    return true;
  }

  return Object.freeze({
    canManageCourses: () => values.manageCourses,
    canBuildCourses: () => values.buildCourses,
    canImportCourses: () => values.importCourses,
    canExportCourses: () => values.exportCourses,
    canSwitchCourses: () => values.switchCourses,
    hasFixedCourse: () => values.fixedCourse,
    hasMotivation: () => values.motivation,
    hasPronunciation: () => values.pronunciation,
    hasSpeedChallenge: () => values.speedChallenge,
    hasBookCapture: () => values.bookCapture,
    isRouteAvailable,
    supports(capability) {
      return Object.hasOwn(values, capability) ? values[capability] : false;
    },
  });
}
