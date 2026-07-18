// @ts-check

import { COURSE_FIELD_LIMITS } from "../../course-library/course-validator.js";
import { resolveLanguageDefinition } from "../../languages/language-registry.js";
import { IMPORT_DRAFT_VERSION, IMPORT_INTENTS } from "./import-draft.js";
import { createImportIssue, hasImportErrors } from "./import-issues.js";
import { normalizeImportComparisonKey } from "./import-normalizer.js";

const TOP_LEVEL_FIELDS = new Set(["draftVersion", "intent", "sourceKind", "course", "units"]);
const COURSE_FIELDS = new Set([
  "title", "subtitle", "description", "schoolType", "gradeLevel",
  "sourceLanguage", "targetLanguage",
]);
const UNIT_FIELDS = new Set(["title", "description", "order", "released", "current", "archived", "words"]);
const WORD_FIELDS = new Set(["source", "targets", "phonetic", "hint", "example", "tags"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function locationFor(path, provenance) {
  const entry = provenance?.entries?.find?.((candidate) => candidate.path === path || path.startsWith(`${candidate.path}.`));
  return entry?.location ?? {};
}

function issue(input, provenance) {
  return createImportIssue({
    ...input,
    location: input.location ?? locationFor(input.path ?? "", provenance),
  });
}

function unknownFieldIssues(value, allowed, path, provenance) {
  if (!isRecord(value)) return [];
  return Object.keys(value).flatMap((field) => (
    allowed.has(field)
      ? []
      : [issue({
        code: "import.field.unknown",
        phase: "structure",
        path: path ? `${path}.${field}` : field,
        message: `Das Feld „${field}“ wird im ImportDraft nicht unterstützt.`,
        action: "Entferne das nicht unterstützte Feld aus der Importquelle.",
      }, provenance)]
  ));
}

function textTypeIssue(value, path, label, provenance) {
  return typeof value === "string" ? [] : [issue({
    code: "word.field.type",
    phase: "structure",
    path,
    message: `${label} muss Text sein.`,
    action: `Trage ${label.toLocaleLowerCase()} als Text ein.`,
  }, provenance)];
}

function lengthIssue(value, maximum, path, label, provenance) {
  return typeof value === "string" && value.length > maximum ? [issue({
    code: "word.field.too-long",
    phase: "content",
    path,
    message: `${label} überschreitet ${maximum} Zeichen.`,
    action: `Kürze ${label.toLocaleLowerCase()} auf höchstens ${maximum} Zeichen.`,
  }, provenance)] : [];
}

function validateStringList(value, options) {
  const { path, label, required, maximum, provenance } = options;
  const issues = [];
  if (!Array.isArray(value)) {
    issues.push(issue({
      code: required ? "word.targets.type" : "word.field.type",
      phase: "structure",
      path,
      message: `${label} muss eine Liste von Texten sein.`,
      action: `Verwende für ${label.toLocaleLowerCase()} eine Textliste.`,
    }, provenance));
    return issues;
  }
  if (required && value.length === 0) {
    issues.push(issue({
      code: "word.targets.required",
      phase: "content",
      path,
      message: "Mindestens eine Übersetzung fehlt.",
      action: "Ergänze mindestens eine Übersetzung.",
    }, provenance));
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isNonEmptyText(entry)) {
      issues.push(issue({
        code: required ? "word.targets.required" : "word.field.type",
        phase: typeof entry === "string" ? "content" : "structure",
        path: entryPath,
        message: `${label} enthält an Position ${index + 1} keinen gültigen Text.`,
        action: "Entferne den leeren Eintrag oder ergänze einen Text.",
      }, provenance));
      return;
    }
    issues.push(...lengthIssue(entry, maximum, entryPath, label, provenance));
    const key = normalizeImportComparisonKey(entry);
    if (seen.has(key)) {
      issues.push(issue({
        code: "word.value.duplicate",
        severity: "warning",
        phase: "content",
        path: entryPath,
        message: `„${entry}“ kommt in ${label.toLocaleLowerCase()} mehrfach vor.`,
        action: "Prüfe, ob der doppelte Eintrag entfernt werden kann.",
      }, provenance));
    }
    seen.add(key);
  });
  return issues;
}

function validateWord(word, unitIndex, wordIndex, provenance) {
  const path = `units[${unitIndex}].words[${wordIndex}]`;
  const issues = [];
  if (!isRecord(word)) {
    return [issue({
      code: "word.type",
      phase: "structure",
      path,
      message: `Eintrag ${wordIndex + 1} im Lernpaket ${unitIndex + 1} muss ein Wortobjekt sein.`,
      action: "Korrigiere die Struktur des Vokabeleintrags.",
    }, provenance)];
  }
  issues.push(...unknownFieldIssues(word, WORD_FIELDS, path, provenance));
  if (!isNonEmptyText(word.source)) {
    issues.push(issue({
      code: "word.source.required",
      phase: typeof word.source === "string" ? "content" : "structure",
      path: `${path}.source`,
      message: `In Lernpaket ${unitIndex + 1}, Eintrag ${wordIndex + 1} fehlt der Ausgangsbegriff.`,
      action: "Ergänze den Ausgangsbegriff oder schließe den Eintrag aus.",
    }, provenance));
  } else issues.push(...lengthIssue(word.source, COURSE_FIELD_LIMITS.source, `${path}.source`, "Der Ausgangsbegriff", provenance));
  issues.push(...validateStringList(word.targets, {
    path: `${path}.targets`, label: "Die Übersetzungen", required: true,
    maximum: COURSE_FIELD_LIMITS.target, provenance,
  }));
  for (const [field, label, maximum] of [
    ["phonetic", "Die Lautschrift", COURSE_FIELD_LIMITS.phonetic],
    ["hint", "Der Hinweis", COURSE_FIELD_LIMITS.hint],
    ["example", "Der Beispielsatz", COURSE_FIELD_LIMITS.example],
  ]) {
    issues.push(...textTypeIssue(word[field], `${path}.${field}`, label, provenance));
    issues.push(...lengthIssue(word[field], maximum, `${path}.${field}`, label, provenance));
  }
  issues.push(...validateStringList(word.tags, {
    path: `${path}.tags`, label: "Die Tags", required: false,
    maximum: COURSE_FIELD_LIMITS.tag, provenance,
  }));
  return issues;
}

/**
 * Validates the content-only intermediate representation. Canonical IDs,
 * timestamps and course metadata are intentionally outside this contract.
 *
 * @param {unknown} draft
 * @param {{provenance?: object}=} options
 */
export function validateImportDraft(draft, options = {}) {
  const issues = [];
  const provenance = options.provenance;
  if (!isRecord(draft)) {
    const resultIssues = [issue({
      code: "import.draft.type",
      phase: "structure",
      path: "",
      message: "Der ImportDraft muss ein Objekt sein.",
      action: "Prüfe den ausgewählten Importadapter.",
    }, provenance)];
    return { valid: false, issues: resultIssues };
  }
  issues.push(...unknownFieldIssues(draft, TOP_LEVEL_FIELDS, "", provenance));
  if (draft.draftVersion !== IMPORT_DRAFT_VERSION) issues.push(issue({
    code: "import.format.version",
    phase: "structure",
    path: "draftVersion",
    message: `ImportDraft-Version ${String(draft.draftVersion)} wird nicht unterstützt.`,
    action: `Verwende ImportDraft-Version ${IMPORT_DRAFT_VERSION}.`,
  }, provenance));
  if (!IMPORT_INTENTS.includes(draft.intent)) issues.push(issue({
    code: "import.intent.invalid",
    phase: "structure",
    path: "intent",
    message: "Die Importabsicht ist ungültig.",
    action: "Wähle einen neuen Kurs oder einen bestehenden Zielkurs.",
  }, provenance));
  if (!isNonEmptyText(draft.sourceKind)) issues.push(issue({
    code: "import.source-kind.required",
    phase: "structure",
    path: "sourceKind",
    message: "Die Importquelle ist nicht eindeutig gekennzeichnet.",
    action: "Verwende einen registrierten Importadapter.",
  }, provenance));

  if (!isRecord(draft.course)) {
    issues.push(issue({
      code: "course.type",
      phase: "structure",
      path: "course",
      message: "Die Kursangaben müssen ein Objekt sein.",
      action: "Ergänze Kursname und Sprachen.",
    }, provenance));
  } else {
    issues.push(...unknownFieldIssues(draft.course, COURSE_FIELDS, "course", provenance));
    if (!isNonEmptyText(draft.course.title)) issues.push(issue({
      code: "course.title.required",
      phase: typeof draft.course.title === "string" ? "content" : "structure",
      path: "course.title",
      message: "Gib vor dem Import einen Kurstitel ein.",
      action: "Trage einen Kurstitel ein.",
    }, provenance));
    for (const [field, label] of [
      ["subtitle", "Der Untertitel"],
      ["description", "Die Kursbeschreibung"],
      ["schoolType", "Die Schulart"],
      ["gradeLevel", "Die Jahrgangsstufe"],
    ]) {
      if (draft.course[field] !== undefined && typeof draft.course[field] !== "string") issues.push(issue({
        code: `course.${field}.type`,
        phase: "structure",
        path: `course.${field}`,
        message: `${label} muss Text sein.`,
        action: `Trage ${label.toLocaleLowerCase()} als Text ein oder lasse das Feld leer.`,
      }, provenance));
    }
    const source = resolveLanguageDefinition(draft.course.sourceLanguage);
    const target = resolveLanguageDefinition(draft.course.targetLanguage);
    if (!source) issues.push(issue({
      code: "language.source.invalid",
      phase: "content",
      path: "course.sourceLanguage",
      message: "Wähle eine unterstützte Ausgangssprache.",
      action: "Wähle die Ausgangssprache aus der EduTools-Sprachliste.",
    }, provenance));
    if (!target) issues.push(issue({
      code: "language.target.invalid",
      phase: "content",
      path: "course.targetLanguage",
      message: "Wähle eine unterstützte Zielsprache.",
      action: "Wähle die Zielsprache aus der EduTools-Sprachliste.",
    }, provenance));
    if (source && target && source.code === target.code) issues.push(issue({
      code: "language.pair.same",
      phase: "content",
      path: "course.targetLanguage",
      message: "Ausgangs- und Zielsprache müssen unterschiedlich sein.",
      action: "Wähle zwei unterschiedliche Sprachen.",
    }, provenance));
  }

  if (!Array.isArray(draft.units)) {
    issues.push(issue({
      code: "course.units.type",
      phase: "structure",
      path: "units",
      message: "Das Lernpakete müssen eine Liste sein.",
      action: "Korrigiere das Lernpaket-Struktur der Importquelle.",
    }, provenance));
  } else {
    const unitTitles = new Set();
    draft.units.forEach((unit, unitIndex) => {
      const path = `units[${unitIndex}]`;
      if (!isRecord(unit)) {
        issues.push(issue({
          code: "unit.type",
          phase: "structure",
          path,
          message: `Lernpaket ${unitIndex + 1} muss ein Objekt sein.`,
          action: "Korrigiere die Struktur des Lernpakets.",
        }, provenance));
        return;
      }
      issues.push(...unknownFieldIssues(unit, UNIT_FIELDS, path, provenance));
      if (!isNonEmptyText(unit.title)) issues.push(issue({
        code: "unit.title.required",
        phase: typeof unit.title === "string" ? "content" : "structure",
        path: `${path}.title`,
        message: `Lernpaket ${unitIndex + 1} besitzt keinen Titel.`,
        action: "Ergänze einen Titel für das Lernpaket.",
      }, provenance));
      else {
        const key = normalizeImportComparisonKey(unit.title);
        if (unitTitles.has(key)) issues.push(issue({
          code: "unit.title.duplicate",
          severity: "warning",
          phase: "content",
          path: `${path}.title`,
          message: `Das Lernpaket „${unit.title}“ kommt mehrfach vor.`,
          action: "Prüfe, ob das Lernpakete zusammengeführt werden sollen.",
        }, provenance));
        unitTitles.add(key);
      }
      if (unit.description !== undefined && typeof unit.description !== "string") issues.push(issue({
        code: "unit.description.type",
        phase: "structure",
        path: `${path}.description`,
        message: `Die Beschreibung von Lernpaket ${unitIndex + 1} muss Text sein.`,
        action: "Trage das Lernpaket-Beschreibung als Text ein oder lasse sie leer.",
      }, provenance));
      if (unit.order !== undefined && (!Number.isInteger(unit.order) || unit.order < 1)) issues.push(issue({
        code: "unit.order.invalid",
        phase: "structure",
        path: `${path}.order`,
        message: `Die Reihenfolge von Lernpaket ${unitIndex + 1} muss eine positive ganze Zahl sein.`,
        action: "Verwende eine fortlaufende Lernpaket-Reihenfolge ab 1.",
      }, provenance));
      for (const field of ["released", "current", "archived"]) {
        if (unit[field] !== undefined && typeof unit[field] !== "boolean") issues.push(issue({
          code: `unit.${field}.type`,
          phase: "structure",
          path: `${path}.${field}`,
          message: `Der Lernpaket-Status „${field}“ muss boolesch sein.`,
          action: `Verwende für „${field}“ true oder false.`,
        }, provenance));
      }
      if (!Array.isArray(unit.words)) issues.push(issue({
        code: "unit.words.type",
        phase: "structure",
        path: `${path}.words`,
        message: `Die Wörter von Lernpaket ${unitIndex + 1} müssen eine Liste sein.`,
        action: "Korrigiere die Wortliste des Lernpakets.",
      }, provenance));
      else {
        const sources = new Set();
        unit.words.forEach((word, wordIndex) => {
          issues.push(...validateWord(word, unitIndex, wordIndex, provenance));
          if (!isRecord(word) || !isNonEmptyText(word.source)) return;
          const key = normalizeImportComparisonKey(word.source);
          if (sources.has(key)) issues.push(issue({
            code: "word.duplicate.same-unit",
            severity: "warning",
            phase: "duplicate",
            path: `${path}.words[${wordIndex}].source`,
            message: `„${word.source}“ kommt im Lernpaket „${unit.title || unitIndex + 1}“ mehrfach vor.`,
            action: "Wähle in der Vorschau eine Duplikatstrategie.",
          }, provenance));
          sources.add(key);
        });
      }
    });
  }
  return { valid: !hasImportErrors(issues), issues };
}
