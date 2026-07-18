// @ts-check

import {
  COURSE_SOURCE_TYPES,
  rebuildCourseData,
} from "../../course-library/course-schema.js";
import { validateCourse } from "../../course-library/course-validator.js";
import { createCourseBackupCandidate } from "../core/import-draft.js";
import { createImportIssue } from "../core/import-issues.js";

export const COURSE_JSON_RESTORE_ADAPTER_ID = "course-json-restore";
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function unsafeKeyIssue(value, path = "Kursdatei") {
  if (!value || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) return createImportIssue({
      code: "import.json.unsafe-key",
      phase: "decode",
      path: `${path}.${key}`,
      message: `${path} enthält den unzulässigen Schlüssel „${key}“.`,
      action: "Verwende ausschließlich eine unveränderte EduTools-Kurssicherung.",
    });
    const nested = unsafeKeyIssue(value[key], `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function stableIdIssues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const issues = [];
  const requireId = (candidate, path, label) => {
    if (typeof candidate?.id === "string" && candidate.id.trim()) return;
    issues.push(createImportIssue({
      code: "canonical.stable-id.required",
      phase: "structure",
      path: `${path}.id`,
      message: `${label}.id fehlt. Die beschädigte Kursdatei kann nicht mit neu erzeugten IDs wiederhergestellt werden.`,
      action: "Verwende eine vollständige, unveränderte EduTools-Kurssicherung.",
    }));
  };
  requireId(value, "course", "Kurs");
  if (!Array.isArray(value.units)) return issues;
  value.units.forEach((unit, unitIndex) => {
    requireId(unit, `course.units[${unitIndex}]`, `Lernpaket ${unitIndex + 1}`);
    if (!Array.isArray(unit?.words)) return;
    unit.words.forEach((word, wordIndex) => {
      requireId(word, `course.units[${unitIndex}].words[${wordIndex}]`, `Vokabeleintrag ${wordIndex + 1}`);
    });
  });
  return issues;
}

/** Keeps canonical JSON backup semantics separate from content imports. */
export function createCourseJsonRestoreAdapter() {
  return Object.freeze({
    id: COURSE_JSON_RESTORE_ADAPTER_ID,
    version: 1,
    acceptedKinds: Object.freeze(["course-json"]),

    canHandle(input) {
      return Boolean(input && typeof input === "object" && input.kind === "course-json");
    },

    decode(input) {
      let value = null;
      try {
        value = JSON.parse(String(input.text));
      } catch {
        return {
          value: null,
          issues: [createImportIssue({
            code: "import.json.syntax",
            phase: "decode",
            path: "input",
            message: "Die ausgewählte Datei enthält kein gültiges JSON.",
            action: "Wähle eine vollständige EduTools-JSON-Kursdatei aus.",
          })],
        };
      }
      const unsafe = unsafeKeyIssue(value);
      return { value: unsafe ? null : value, issues: unsafe ? [unsafe] : [] };
    },

    adapt(decoded) {
      if (decoded.issues.length > 0 || !decoded.value) {
        return { payloadKind: "restore", candidate: null, provenance: null, issues: [] };
      }
      const identifierIssues = stableIdIssues(decoded.value);
      if (identifierIssues.length > 0) {
        return { payloadKind: "restore", candidate: null, provenance: null, issues: identifierIssues };
      }
      const course = rebuildCourseData(decoded.value, {
        sourceType: COURSE_SOURCE_TYPES.IMPORTED,
        editable: true,
      });
      const validation = validateCourse(course);
      const issues = validation.errors.map((message) => createImportIssue({
        code: "canonical.invalid",
        phase: "structure",
        path: "course",
        message,
        action: "Verwende eine gültige EduTools-Kurssicherung.",
      }));
      return {
        payloadKind: "restore",
        candidate: validation.valid ? createCourseBackupCandidate(course) : null,
        provenance: null,
        issues,
      };
    },
  });
}
