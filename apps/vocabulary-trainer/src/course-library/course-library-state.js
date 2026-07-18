export function createCourseLibraryState(builtInCourseId, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  return {
    schemaVersion: 1,
    activeCourseId: String(builtInCourseId),
    courses: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createCourseEditorState(courseId = null, unitId = null) {
  return {
    courseId,
    selectedUnitId: unitId,
    dirty: false,
    importPreview: null,
    dialog: null,
  };
}
