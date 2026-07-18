import { cloneCourse, createStableId } from "../course-library/course-schema.js";
import { COURSE_FIELD_LIMITS } from "../course-library/course-validator.js";
import { TABULAR_TEXT_ADAPTER_ID } from "./adapters/tabular-text-adapter.js";
import {
  DUPLICATE_STRATEGIES,
  materializeLegacyImportPreview,
} from "./core/import-materializer.js";
import { normalizeImportComparisonKey } from "./core/import-normalizer.js";
import { importOrchestrator } from "./import-pipeline.js";

export { DUPLICATE_STRATEGIES };
const appliedPreviews = new WeakSet();

export function normalizeImportSource(value) {
  return normalizeImportComparisonKey(value);
}

function normalizeLegacyUnique(values) {
  const seen = new Set();
  return values.flatMap((value) => {
    const text = String(value ?? "").trim();
    const key = text.normalize("NFC").toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function validateMappedWord(word) {
  const errors = [];
  if (!word.source) errors.push("Ausgangsbegriff fehlt.");
  if (word.targets.length === 0) errors.push("Übersetzung fehlt.");
  if (word.source.length > COURSE_FIELD_LIMITS.source) errors.push("Ausgangsbegriff ist länger als 200 Zeichen.");
  word.targets.forEach((target) => {
    if (target.length > COURSE_FIELD_LIMITS.target) errors.push("Eine Übersetzung ist länger als 200 Zeichen.");
  });
  for (const [field, limit] of [["phonetic", 200], ["hint", 500], ["example", 1000]]) {
    if (word[field].length > limit) errors.push(`${field} ist länger als ${limit} Zeichen.`);
  }
  word.tags.forEach((tag) => {
    if (tag.length > COURSE_FIELD_LIMITS.tag) errors.push("Ein Tag ist länger als 100 Zeichen.");
  });
  return errors;
}

export function createImportPreview(options) {
  const { course, parsed, mapping, defaultUnitId, newUnitTitle = "", idGenerator } = options;
  const newUnitReleased = options.newUnitReleased !== false;
  const importSession = importOrchestrator.prepareImport({
    adapterId: TABULAR_TEXT_ADAPTER_ID,
    input: { kind: "tabular-text", parsed },
    context: {
      course,
      mapping,
      defaultUnitId,
      newUnitTitle,
      newUnitReleased,
      intent: options.intent ?? "append",
    },
  });
  const provenance = importSession.provenance;
  const errors = [...provenance.legacyErrors];
  const workingUnits = course.units.map((unit) => ({ id: unit.id, title: unit.title }));
  const newUnits = [];
  const defaultUnit = course.units.find((unit) => unit.id === defaultUnitId);

  function resolveUnit(unitTitle, allowCreate = true) {
    const requestedTitle = unitTitle.trim() || newUnitTitle.trim();
    if (!requestedTitle) return defaultUnit ?? null;
    const key = normalizeImportSource(requestedTitle);
    let unit = workingUnits.find((candidate) => normalizeImportSource(candidate.title) === key);
    if (!unit && allowCreate) {
      unit = { id: createStableId("unit", idGenerator), title: requestedTitle, released: newUnitReleased };
      workingUnits.push(unit);
      newUnits.push(unit);
    }
    return unit;
  }

  const existing = new Map();
  course.units.forEach((unit) => unit.words.forEach((word) => {
    existing.set(`${unit.id}\u0000${normalizeImportSource(word.source)}`, word);
  }));
  const rows = !provenance.fatal
    ? provenance.entries.map((entry) => {
      const cells = entry.cells;
      const pathMatch = /^units\[(\d+)]\.words\[(\d+)]$/.exec(entry.path);
      const draftWord = pathMatch
        ? importSession.payload.units[Number(pathMatch[1])].words[Number(pathMatch[2])]
        : null;
      const mapped = entry.mappedWord ? {
        ...entry.mappedWord,
        targets: normalizeLegacyUnique(entry.mappedWord.targets),
        tags: normalizeLegacyUnique(entry.mappedWord.tags),
      } : null;
      if (!mapped || !draftWord) throw new Error("Der Tabellenadapter lieferte keine passende ImportDraft-Zeile.");
      const rowErrors = validateMappedWord(mapped);
      const warnings = entry.ignoredValues.length > 0
        ? ["Nicht zugeordnete Inhalte dieser Zeile werden nicht gespeichert."]
        : [];
      const unit = resolveUnit(entry.unitTitle, rowErrors.length === 0);
      if (!unit) rowErrors.push("Es wurde keine Import-Lernpaket ausgewählt.");
      const duplicate = unit ? existing.get(`${unit.id}\u0000${normalizeImportSource(mapped.source)}`) ?? null : null;
      const status = rowErrors.length > 0
        ? "Fehler"
        : duplicate
          ? "Duplikat"
          : warnings.length > 0
            ? "Zu prüfen"
            : "Gültig";
      const result = {
        lineNumber: entry.location.line,
        cells: [...cells],
        word: mapped,
        unitId: unit?.id ?? null,
        unitTitle: unit?.title ?? "",
        duplicateWordId: duplicate?.id ?? null,
        isDuplicate: Boolean(duplicate),
        status,
        errors: rowErrors,
        warnings,
      };
      if (!duplicate && rowErrors.length === 0 && unit) {
        existing.set(`${unit.id}\u0000${normalizeImportSource(mapped.source)}`, { id: null });
      }
      return result;
    })
    : [];
  const newUnitSummaries = newUnits.map((unit) => ({
    id: unit.id,
    title: unit.title,
    wordCount: rows.filter((row) => row.unitId === unit.id && row.errors.length === 0).length,
  }));
  return {
    courseId: course.id,
    sourceCourse: cloneCourse(course),
    mapping: [...provenance.mapping],
    importSession,
    rows,
    newUnits,
    newUnitSummaries,
    errors,
    counts: {
      read: parsed.rows.length,
      valid: rows.filter((row) => row.errors.length === 0).length,
      errors: rows.filter((row) => row.errors.length > 0).length,
      warnings: rows.filter((row) => row.warnings.length > 0).length,
      duplicates: rows.filter((row) => row.isDuplicate).length,
      newUnits: newUnits.length,
    },
  };
}

export function applyImportPreview(preview, strategy = "skip", options = {}) {
  if (appliedPreviews.has(preview)) throw new Error("Diese Importvorschau wurde bereits übernommen.");
  return materializeLegacyImportPreview(preview, strategy, options);
}

export function commitImport(options) {
  if (appliedPreviews.has(options.preview)) throw new Error("Diese Importvorschau wurde bereits übernommen.");
  const result = applyImportPreview(options.preview, options.strategy, options);
  const savedCourse = options.service.updateCourse(result.course);
  appliedPreviews.add(options.preview);
  return { ...result, course: savedCourse };
}

export function commitNewCourseImport(options) {
  if (appliedPreviews.has(options.preview)) throw new Error("Diese Importvorschau wurde bereits gespeichert.");
  const result = applyImportPreview(options.preview, options.strategy, options);
  const firstUsableUnit = result.course.units.find((unit) => !unit.archived && unit.released);
  if (firstUsableUnit && !result.course.units.some((unit) => unit.current)) firstUsableUnit.current = true;
  const savedCourse = options.service.addCourse(result.course);
  appliedPreviews.add(options.preview);
  return { ...result, course: savedCourse };
}
