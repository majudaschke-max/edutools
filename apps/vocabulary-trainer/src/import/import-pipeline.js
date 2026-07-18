// @ts-check

import { createAiContentAdapter } from "./adapters/ai-content-adapter.js";
import { createCourseJsonRestoreAdapter } from "./adapters/course-json-restore-adapter.js";
import { createCourseJsonBatchAdapter } from "./adapters/course-json-batch-adapter.js?v=4.0.5";
import { createTabularTextAdapter } from "./adapters/tabular-text-adapter.js";
import {
  commitContentImport,
  commitCourseRestore,
  materializeContentImport,
  materializeCourseRestore,
} from "./core/import-materializer.js?v=4.0.5";
import { createImportOrchestrator } from "./core/import-orchestrator.js";

const adapters = Object.freeze([
  createAiContentAdapter(),
  createCourseJsonBatchAdapter(),
  createTabularTextAdapter(),
  createCourseJsonRestoreAdapter(),
]);

/** Shared Author-only import lifecycle for content and canonical restore. */
export const importOrchestrator = createImportOrchestrator({
  adapters,
  materializers: {
    content: materializeContentImport,
    restore: materializeCourseRestore,
  },
  committers: {
    content: commitContentImport,
    restore: commitCourseRestore,
  },
});
