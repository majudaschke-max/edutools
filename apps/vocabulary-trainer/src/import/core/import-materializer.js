// @ts-check

import {
  COURSE_SOURCE_TYPES,
  cloneCourse,
  createCourse,
  createUnit,
  createWord,
  duplicateCourse,
} from "../../course-library/course-schema.js";
import { assertValidCourse } from "../../course-library/course-validator.js";
import { createCourseLanguage } from "../../languages/language-registry.js";
import { normalizeImportComparisonKey } from "./import-normalizer.js?v=4.0.5";
import { createExactWordKey } from "./import-duplicate-key.js?v=4.0.5";

export const DUPLICATE_STRATEGIES = Object.freeze(["skip", "merge", "replace", "add"]);

function uniqueStrings(values) {
  const seen = new Set();
  return values.flatMap((value) => {
    const text = String(value ?? "").trim().normalize("NFC");
    const key = normalizeImportComparisonKey(text);
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function mergeWord(existing, imported) {
  existing.targets = uniqueStrings([...existing.targets, ...imported.targets]);
  for (const field of ["phonetic", "hint", "example"]) {
    if (!existing[field] && imported[field]) existing[field] = imported[field];
  }
  existing.tags = uniqueStrings([...existing.tags, ...imported.tags]);
}

function mergeLegacyWord(existing, imported) {
  const normalizeLegacyList = (values) => {
    const seen = new Set();
    return values.flatMap((value) => {
      const text = String(value ?? "").trim();
      const key = text.normalize("NFC").toLocaleLowerCase();
      if (!text || seen.has(key)) return [];
      seen.add(key);
      return [text];
    });
  };
  existing.targets = normalizeLegacyList([...existing.targets, ...imported.targets]);
  for (const field of ["phonetic", "hint", "example"]) {
    if (!existing[field] && imported[field]) existing[field] = imported[field];
  }
  existing.tags = normalizeLegacyList([...existing.tags, ...imported.tags]);
}

function resolveStrategy(strategy, context) {
  const resolved = typeof strategy === "function"
    ? strategy(context)
    : strategy && typeof strategy === "object"
      ? strategy[context.lineNumber] ?? strategy[context.source] ?? "skip"
      : strategy;
  if (!DUPLICATE_STRATEGIES.includes(resolved)) {
    const suffix = context.lineNumber ? ` in Zeile ${context.lineNumber}` : "";
    throw new TypeError(`Unbekannte Duplikatstrategie${suffix}.`);
  }
  return resolved;
}

function applyWord(unit, wordInput, strategy, options, context = {}) {
  const existing = context.duplicateWordId
    ? unit.words.find((word) => word.id === context.duplicateWordId)
    : unit.words.find((word) => normalizeImportComparisonKey(word.source) === normalizeImportComparisonKey(wordInput.source));
  const rowStrategy = resolveStrategy(strategy, {
    ...context,
    source: wordInput.source,
    word: wordInput,
    unitTitle: unit.title,
  });
  if (!existing || rowStrategy === "add") {
    unit.words.push(createWord(wordInput, options));
    return { imported: 1, skipped: 0 };
  }
  if (rowStrategy === "skip") return { imported: 0, skipped: 1 };
  if (rowStrategy === "merge") {
    mergeWord(existing, wordInput);
    return { imported: 1, skipped: 0 };
  }
  Object.assign(existing, createWord(wordInput, options), { id: existing.id });
  return { imported: 1, skipped: 0 };
}

/**
 * Materializes a content-only ImportDraft. This is the sole new-pipeline
 * boundary that creates canonical IDs, timestamps and course metadata.
 */
export function materializeContentImport(plan, context = {}) {
  const draft = plan.payload;
  const decisions = plan.decisions ?? {};
  const idGenerator = context.idGenerator ?? decisions.idGenerator;
  const now = context.now ?? decisions.now;
  const strategy = decisions.strategy ?? "skip";
  if (!DUPLICATE_STRATEGIES.includes(strategy) && typeof strategy !== "function" && !(strategy && typeof strategy === "object")) {
    throw new TypeError("Unbekannte Duplikatstrategie.");
  }

  let course;
  let operation;
  if (draft.intent === "append") {
    const target = context.targetCourse ?? decisions.targetCourse;
    if (!target) throw new Error("Für diesen Import wurde kein Zielkurs angegeben.");
    course = cloneCourse(target);
    operation = "update";
  } else {
    course = createCourse({
      title: draft.course.title,
      subtitle: draft.course.subtitle,
      description: draft.course.description,
      schoolType: draft.course.schoolType,
      gradeLevel: draft.course.gradeLevel,
      languages: {
        source: createCourseLanguage(draft.course.sourceLanguage),
        target: createCourseLanguage(draft.course.targetLanguage),
      },
    }, {
      idGenerator,
      now,
      sourceType: COURSE_SOURCE_TYPES.OWN,
      editable: true,
    });
    operation = "add";
  }

  let imported = 0;
  let skipped = 0;
  const isJsonBatch = draft.sourceKind === "course-json-batch";
  const exactDuplicateStrategy = decisions.exactDuplicateStrategy ?? "keep";
  if (isJsonBatch && !["keep", "skip"].includes(exactDuplicateStrategy)) {
    throw new TypeError("Unbekannte Entscheidung für exakte Duplikate.");
  }
  draft.units.forEach((draftUnit, unitIndex) => {
    const unitKey = normalizeImportComparisonKey(draftUnit.title);
    let unit = course.units.find((candidate) => normalizeImportComparisonKey(candidate.title) === unitKey);
    if (!unit) {
      unit = createUnit({
        title: draftUnit.title,
        description: draftUnit.description,
        order: draftUnit.order ?? course.units.length + 1,
        released: typeof draftUnit.released === "boolean"
          ? draftUnit.released
          : decisions.newUnitReleased !== false,
        current: draftUnit.current === true,
        archived: draftUnit.archived === true,
      }, { idGenerator });
      course.units.push(unit);
    }
    const exactKeys = new Set();
    draftUnit.words.forEach((word, wordIndex) => {
      const exactKey = createExactWordKey(draftUnit.title, word);
      if (isJsonBatch && exactKeys.has(exactKey) && exactDuplicateStrategy === "skip") {
        skipped += 1;
        return;
      }
      exactKeys.add(exactKey);
      const path = `units[${unitIndex}].words[${wordIndex}]`;
      const entry = plan.provenance?.entries?.find?.((candidate) => candidate.path === path);
      const result = applyWord(unit, word, isJsonBatch ? "add" : strategy, { idGenerator }, {
        lineNumber: entry?.location?.line,
        path,
      });
      imported += result.imported;
      skipped += result.skipped;
    });
  });
  if (operation === "add") {
    const firstUsableUnit = course.units.find((unit) => !unit.archived && unit.released);
    const currentUnits = course.units.filter((unit) => unit.current && unit.released && !unit.archived);
    const selectedCurrent = currentUnits[0] ?? firstUsableUnit;
    course.units.forEach((unit) => { unit.current = unit === selectedCurrent; });
  }
  course.updatedAt = new Date(now ?? Date.now()).toISOString();
  assertValidCourse(course);
  return { course, imported, skipped, operation };
}

export function commitContentImport(materialized, _plan, context = {}) {
  if (!context.service) throw new Error("Für das Speichern fehlt der CourseLibraryService.");
  return materialized.operation === "update"
    ? { ...materialized, course: context.service.updateCourse(materialized.course) }
    : { ...materialized, course: context.service.addCourse(materialized.course) };
}

export function materializeCourseRestore(plan, context = {}) {
  if (!context.service) throw new Error("Für die Wiederherstellung fehlt der CourseLibraryService.");
  let course = plan.payload.course;
  const existing = context.service.getCourse(course.id);
  const conflict = plan.decisions?.conflict ?? "new";
  if (existing) {
    if (conflict === "new") {
      course = duplicateCourse(course, { idGenerator: context.idGenerator, now: context.now });
      return { course, operation: "add" };
    }
    if (conflict === "replace") {
      if (existing.id !== course.id) throw new Error("Die Kurs-ID stimmt nicht überein.");
      return { course, operation: "update" };
    }
    throw new Error("Für die vorhandene Kurs-ID muss eine Importoption gewählt werden.");
  }
  return { course, operation: "add" };
}

export function commitCourseRestore(materialized, _plan, context = {}) {
  if (!context.service) throw new Error("Für das Speichern fehlt der CourseLibraryService.");
  return materialized.operation === "update"
    ? context.service.updateCourse(materialized.course)
    : context.service.addCourse(materialized.course);
}

/**
 * Compatibility materializer for the unchanged tabular preview contract.
 * New adapters use materializeContentImport(); this function keeps the
 * production UI and historical OCR transaction byte-for-byte compatible.
 */
export function materializeLegacyImportPreview(preview, strategy = "skip", options = {}) {
  if (typeof strategy === "string" && !DUPLICATE_STRATEGIES.includes(strategy)) throw new TypeError("Unbekannte Duplikatstrategie.");
  if (!(typeof strategy === "string" || typeof strategy === "function" || (strategy && typeof strategy === "object"))) {
    throw new TypeError("Unbekannte Duplikatstrategie.");
  }
  const course = cloneCourse(preview.sourceCourse);
  preview.newUnits.forEach((definition) => {
    if (!course.units.some((unit) => unit.id === definition.id)) {
      course.units.push(createUnit({ ...definition, order: course.units.length + 1, released: definition.released !== false }, options));
    }
  });
  let imported = 0;
  let skipped = 0;
  preview.rows.filter((row) => row.errors.length === 0).forEach((row) => {
    const unit = course.units.find((candidate) => candidate.id === row.unitId);
    if (!unit) throw new Error(`Import-Lernpaket „${row.unitId}“ wurde nicht gefunden.`);
    const existing = row.duplicateWordId
      ? unit.words.find((word) => word.id === row.duplicateWordId)
      : unit.words.find((word) => normalizeImportComparisonKey(word.source) === normalizeImportComparisonKey(row.word.source));
    // Preserve the historical ID-generator call order even for skipped rows.
    const importedWord = createWord(row.word, options);
    const rowStrategy = resolveStrategy(strategy, {
      lineNumber: row.lineNumber,
      source: row.word.source,
      word: row.word,
      unitTitle: unit.title,
    });
    if (!existing || rowStrategy === "add") {
      unit.words.push(importedWord);
      imported += 1;
    } else if (rowStrategy === "skip") skipped += 1;
    else if (rowStrategy === "merge") {
      mergeLegacyWord(existing, importedWord);
      imported += 1;
    } else {
      Object.assign(existing, importedWord, { id: existing.id });
      imported += 1;
    }
  });
  course.updatedAt = new Date(options.now ?? Date.now()).toISOString();
  assertValidCourse(course);
  return { course, imported, skipped };
}
