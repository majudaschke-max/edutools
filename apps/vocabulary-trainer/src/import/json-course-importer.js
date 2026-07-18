import {
  COURSE_JSON_BATCH_ADAPTER_ID,
  COURSE_JSON_BATCH_INPUT_KIND,
} from "./adapters/course-json-batch-adapter.js?v=4.0.5";
import { COURSE_JSON_RESTORE_ADAPTER_ID } from "./adapters/course-json-restore-adapter.js";
import { createImportError } from "./core/import-issues.js";
import { importOrchestrator } from "./import-pipeline.js";

export const JSON_COURSE_IMPORT_MODES = Object.freeze({
  NEW: "new",
  RESTORE: "restore",
});

function prepareJsonCourse(text) {
  return importOrchestrator.prepareImport({
    adapterId: COURSE_JSON_RESTORE_ADAPTER_ID,
    input: { kind: "course-json", text },
  });
}

function prepareJsonCoursesAsNew(files) {
  return importOrchestrator.prepareImport({
    adapterId: COURSE_JSON_BATCH_ADAPTER_ID,
    input: { kind: COURSE_JSON_BATCH_INPUT_KIND, files },
  });
}

/**
 * Classifies a JSON course conservatively. Only a fully valid canonical
 * backup is classified as restore; every ambiguous case stays a new import.
 */
export function detectJsonCourseImportMode(text) {
  return prepareJsonCourse(text).valid
    ? JSON_COURSE_IMPORT_MODES.RESTORE
    : JSON_COURSE_IMPORT_MODES.NEW;
}

export function parseJsonCourse(text) {
  const session = prepareJsonCourse(text);
  if (!session.valid) throw createImportError(session.issues, "Die Kursdatei ist ungültig.");
  return session.payload.course;
}

export function importJsonCourse(options) {
  const { service, text, conflict = "new", idGenerator, now } = options;
  const session = prepareJsonCourse(text);
  if (!session.valid) throw createImportError(session.issues, "Die Kursdatei ist ungültig.");
  const plan = importOrchestrator.createImportPlan(session, { conflict });
  return importOrchestrator.commitImport(plan, { service, idGenerator, now });
}

/**
 * Imports content-only JSON as a new course. Technical IDs and metadata never
 * cross the ImportDraft boundary; the materializer creates canonical values.
 */
export function importJsonCoursesAsNew(options) {
  const {
    service,
    files,
    idGenerator,
    now,
    exactDuplicateStrategy = "keep",
  } = options;
  const session = prepareJsonCoursesAsNew(files);
  if (!session.valid) {
    throw createImportError(session.issues, "Die JSON-Kursdatei enthält keine gültigen fachlichen Kursdaten.");
  }
  const plan = importOrchestrator.createImportPlan(session, {
    strategy: "add",
    exactDuplicateStrategy,
  });
  return importOrchestrator.commitImport(plan, { service, idGenerator, now });
}
