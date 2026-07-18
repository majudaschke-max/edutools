// @ts-check

import {
  COURSE_APP_TYPE,
  COURSE_SCHEMA_VERSION,
} from "../../course-library/course-schema.js";
import { COURSE_FIELD_LIMITS } from "../../course-library/course-validator.js";
import { resolveLanguageDefinition } from "../../languages/language-registry.js";
import { createImportDraft } from "../core/import-draft.js?v=4.0.5";
import { createExactWordKey, normalizeExactDuplicatePart } from "../core/import-duplicate-key.js?v=4.0.5";
import { createImportIssue } from "../core/import-issues.js";
import {
  getSmallLearningPackageWarnings,
  normalizeImportedLearningPackages,
} from "../core/learning-package-normalizer.js";

export const COURSE_JSON_BATCH_ADAPTER_ID = "course-json-batch";
export const COURSE_JSON_BATCH_INPUT_KIND = "course-json-files";

const DEFAULT_MAX_FILE_CHARACTERS = 5_000_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const COURSE_FIELDS = new Set([
  "schemaVersion", "appType", "title", "subtitle", "description", "schoolType",
  "gradeLevel", "languages", "units",
]);
const COURSE_TECHNICAL_FIELDS = new Set([
  "id", "courseId", "contentVersion", "sourceType", "editable", "createdAt",
  "updatedAt", "pronunciation", "archived", "deploymentId", "generatedBy",
]);
const LANGUAGE_FIELDS = new Set(["code", "label", "speechLocale"]);
const UNIT_FIELDS = new Set(["title", "description", "order", "released", "current", "archived", "words"]);
const UNIT_TECHNICAL_FIELDS = new Set(["id", "unitId", "createdAt", "updatedAt", "generatedBy"]);
const WORD_FIELDS = new Set(["source", "targets", "phonetic", "hint", "example", "tags", "archived"]);
const WORD_TECHNICAL_FIELDS = new Set(["id", "wordId", "createdAt", "updatedAt", "generatedBy", "aiGenerated"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().normalize("NFC") : "";
}

function batchIssue(input) {
  return createImportIssue({
    phase: "structure",
    path: input.path ?? "",
    location: { fileIndex: input.fileIndex, ...(input.location ?? {}) },
    action: input.action ?? "Korrigiere die JSON-Datei und wähle anschließend alle zusammengehörigen Dateien erneut aus.",
    ...input,
  });
}

function findUnsafeKey(value) {
  if (!value || typeof value !== "object") return "";
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const key of Object.keys(current)) {
      if (DANGEROUS_KEYS.has(key)) return key;
      const nested = current[key];
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return "";
}

function unknownFieldIssues(value, allowed, path, fileIndex, ignoredTechnicalFields = new Set()) {
  if (!isRecord(value)) return [];
  return Object.keys(value).flatMap((field) => {
    if (allowed.has(field)) return [];
    if (ignoredTechnicalFields.has(field)) return [batchIssue({
      code: "batch.field.technical-ignored",
      severity: "warning",
      phase: "content",
      fileIndex,
      path: path ? `${path}.${field}` : field,
      message: `Das technische Feld „${field}“ wird beim Neuimport verworfen.`,
      action: "EduTools erzeugt die technischen Kursdaten für den neuen Kurs selbst.",
    })];
    return [batchIssue({
      code: "batch.field.unknown",
      fileIndex,
      path: path ? `${path}.${field}` : field,
      message: `Die Datei enthält das nicht unterstützte Feld „${field}“ in ${path || "der obersten Ebene"}.`,
      action: "Entferne technische oder nicht zum EduTools-Importschema gehörende Felder.",
    })];
  });
}

function requireText(value, path, label, fileIndex, maximum = 0, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) return [batchIssue({
    code: "batch.text.required",
    fileIndex,
    path,
    message: `${label} ${allowEmpty ? "muss Text sein" : "fehlt oder ist leer"}.`,
    action: allowEmpty ? `Verwende für ${label.toLocaleLowerCase()} Text.` : `Ergänze ${label.toLocaleLowerCase()}.`,
  })];
  if (maximum > 0 && value.length > maximum) return [batchIssue({
    code: "batch.text.too-long",
    fileIndex,
    path,
    message: `${label} überschreitet ${maximum} Zeichen.`,
    action: `Kürze ${label.toLocaleLowerCase()} auf höchstens ${maximum} Zeichen.`,
  })];
  return [];
}

function validateLanguage(language, role, fileIndex) {
  const path = `languages.${role}`;
  if (!isRecord(language)) return [batchIssue({
    code: `batch.language.${role}.required`, fileIndex, path,
    message: `${role === "source" ? "Ausgangs" : "Ziel"}sprache fehlt.`,
    action: "Erzeuge die Datei erneut mit einer von EduTools unterstützten Sprache.",
  })];
  const issues = unknownFieldIssues(language, LANGUAGE_FIELDS, path, fileIndex);
  for (const field of ["code", "label", "speechLocale"]) {
    issues.push(...requireText(language[field], `${path}.${field}`, `languages.${role}.${field}`, fileIndex));
  }
  const definition = resolveLanguageDefinition(language.code);
  if (!definition) issues.push(batchIssue({
    code: `batch.language.${role}.unsupported`, fileIndex, path: `${path}.code`,
    message: `Der Sprachcode „${String(language.code ?? "")}“ wird nicht unterstützt.`,
    action: "Verwende einen Sprachcode aus der EduTools-Sprachliste.",
  }));
  else {
    if (cleanText(language.speechLocale) !== definition.speechLocale) issues.push(batchIssue({
      code: `batch.language.${role}.locale`, fileIndex, path: `${path}.speechLocale`,
      message: `Die Locale „${String(language.speechLocale ?? "")}“ passt nicht zum Sprachcode „${definition.code}“.`,
      action: `Verwende die Locale „${definition.speechLocale}“.`,
    }));
    if (cleanText(language.label) !== definition.label) issues.push(batchIssue({
      code: `batch.language.${role}.label`, fileIndex, path: `${path}.label`,
      message: `Die Sprachbezeichnung „${String(language.label ?? "")}“ passt nicht zum Sprachcode „${definition.code}“.`,
      action: `Verwende die Bezeichnung „${definition.label}“.`,
    }));
  }
  return issues;
}

function validateStringList(value, path, label, fileIndex, maximum, required) {
  if (!Array.isArray(value)) return [batchIssue({
    code: "batch.list.type", fileIndex, path,
    message: `${label} muss eine Liste sein.`,
    action: `Verwende für ${label.toLocaleLowerCase()} ein JSON-Array.`,
  })];
  const issues = [];
  if (required && value.length === 0) issues.push(batchIssue({
    code: "batch.targets.required", fileIndex, path,
    message: "Mindestens eine Übersetzung fehlt.",
    action: "Ergänze mindestens einen Text im targets-Array.",
  }));
  value.forEach((entry, index) => issues.push(...requireText(
    entry, `${path}[${index}]`, `${label}, Eintrag ${index + 1}`, fileIndex, maximum,
  )));
  return issues;
}

function validateWord(word, fileIndex, unitIndex, wordIndex) {
  const path = `units[${unitIndex}].words[${wordIndex}]`;
  if (!isRecord(word)) return [batchIssue({
    code: "batch.word.type", fileIndex, path,
    message: `Vokabeleintrag ${wordIndex + 1} im Lernpaket ${unitIndex + 1} ist kein Objekt.`,
  })];
  const issues = unknownFieldIssues(word, WORD_FIELDS, path, fileIndex, WORD_TECHNICAL_FIELDS);
  issues.push(...requireText(word.source, `${path}.source`, "Der Ausgangsbegriff", fileIndex, COURSE_FIELD_LIMITS.source));
  issues.push(...validateStringList(word.targets, `${path}.targets`, "Die Übersetzungen", fileIndex, COURSE_FIELD_LIMITS.target, true));
  for (const [field, label, maximum] of [
    ["phonetic", "Die Lautschrift", COURSE_FIELD_LIMITS.phonetic],
    ["hint", "Der Hinweis", COURSE_FIELD_LIMITS.hint],
    ["example", "Der Beispielsatz", COURSE_FIELD_LIMITS.example],
  ]) issues.push(...requireText(word[field], `${path}.${field}`, label, fileIndex, maximum, true));
  issues.push(...validateStringList(word.tags, `${path}.tags`, "Die Tags", fileIndex, COURSE_FIELD_LIMITS.tag, false));
  if (word.archived !== false) issues.push(batchIssue({
    code: "batch.word.archived", fileIndex, path: `${path}.archived`,
    message: "Importierte Vokabeleinträge müssen archived=false verwenden.",
    action: "Setze archived für diesen Eintrag auf false.",
  }));
  return issues;
}

function validateCoursePart(value, fileIndex) {
  if (!isRecord(value)) return [batchIssue({
    code: "batch.course.type", fileIndex, path: "",
    message: "Die JSON-Datei muss genau ein Kursobjekt enthalten.",
  })];
  const issues = unknownFieldIssues(value, COURSE_FIELDS, "", fileIndex, COURSE_TECHNICAL_FIELDS);
  if (value.schemaVersion !== COURSE_SCHEMA_VERSION) issues.push(batchIssue({
    code: "batch.schema-version.conflict", fileIndex, path: "schemaVersion",
    message: `schemaVersion muss ${COURSE_SCHEMA_VERSION} sein.`,
    action: `Erzeuge die Datei mit schemaVersion ${COURSE_SCHEMA_VERSION} neu.`,
  }));
  if (value.appType !== COURSE_APP_TYPE) issues.push(batchIssue({
    code: "batch.app-type.conflict", fileIndex, path: "appType",
    message: `appType muss „${COURSE_APP_TYPE}“ sein.`,
    action: "Importiere ausschließlich Dateien für den EduTools Vocabulary Trainer.",
  }));
  issues.push(...requireText(value.title, "title", "Der Kurstitel", fileIndex));
  for (const [field, label] of [
    ["subtitle", "Der Untertitel"], ["description", "Die Kursbeschreibung"],
    ["schoolType", "Die Schulart"], ["gradeLevel", "Die Jahrgangsstufe"],
  ]) {
    if (value[field] !== undefined) issues.push(...requireText(value[field], field, label, fileIndex, 0, true));
  }
  if (!isRecord(value.languages)) issues.push(batchIssue({
    code: "batch.languages.required", fileIndex, path: "languages",
    message: "Die Sprachkonfiguration fehlt.",
  }));
  else {
    issues.push(...unknownFieldIssues(value.languages, new Set(["source", "target"]), "languages", fileIndex));
    issues.push(...validateLanguage(value.languages.source, "source", fileIndex));
    issues.push(...validateLanguage(value.languages.target, "target", fileIndex));
    if (cleanText(value.languages.source?.code) && cleanText(value.languages.source?.code) === cleanText(value.languages.target?.code)) {
      issues.push(batchIssue({
        code: "batch.language.same", fileIndex, path: "languages.target.code",
        message: "Ausgangs- und Zielsprache müssen unterschiedlich sein.",
      }));
    }
  }
  if (!Array.isArray(value.units) || value.units.length === 0) {
    issues.push(batchIssue({
      code: "batch.units.required", fileIndex, path: "units",
      message: "Die Datei enthält kein Lernpaket.",
      action: "Erzeuge mindestens ein Lernpaket mit mindestens einem Vokabeleintrag.",
    }));
    return issues;
  }
  value.units.forEach((unit, unitIndex) => {
    const path = `units[${unitIndex}]`;
    if (!isRecord(unit)) {
      issues.push(batchIssue({ code: "batch.unit.type", fileIndex, path, message: `Lernpaket ${unitIndex + 1} ist kein Objekt.` }));
      return;
    }
    issues.push(...unknownFieldIssues(unit, UNIT_FIELDS, path, fileIndex, UNIT_TECHNICAL_FIELDS));
    issues.push(...requireText(unit.title, `${path}.title`, `Der Titel von Lernpaket ${unitIndex + 1}`, fileIndex));
    issues.push(...requireText(unit.description, `${path}.description`, `Die Beschreibung von Lernpaket ${unitIndex + 1}`, fileIndex, 0, true));
    if (!Number.isInteger(unit.order) || unit.order < 1) issues.push(batchIssue({
      code: "batch.unit.order", fileIndex, path: `${path}.order`,
      message: `Die Reihenfolge von Lernpaket ${unitIndex + 1} muss eine positive ganze Zahl sein.`,
    }));
    for (const field of ["released", "current", "archived"]) if (typeof unit[field] !== "boolean") issues.push(batchIssue({
      code: `batch.unit.${field}`, fileIndex, path: `${path}.${field}`,
      message: `Der Lernpaket-Status „${field}“ muss true oder false sein.`,
    }));
    if (!Array.isArray(unit.words) || unit.words.length === 0) issues.push(batchIssue({
      code: "batch.words.required", fileIndex, path: `${path}.words`,
      message: `Lernpaket „${String(unit.title ?? unitIndex + 1)}“ enthält keine Vokabeleinträge.`,
    }));
    else unit.words.forEach((word, wordIndex) => issues.push(...validateWord(word, fileIndex, unitIndex, wordIndex)));
  });
  return issues;
}

function decodeFiles(input, maximum) {
  if (!Array.isArray(input.files) || input.files.length === 0) return {
    files: [],
    issues: [batchIssue({
      code: "batch.files.required", fileIndex: -1, path: "files",
      message: "Wähle mindestens eine JSON-Datei aus.",
    })],
  };
  const issues = [];
  const files = input.files.map((file, fileIndex) => {
    const name = cleanText(file?.name) || `Datei ${fileIndex + 1}`;
    let value = null;
    if (!/\.json$/iu.test(name)) {
      issues.push(batchIssue({
        code: "batch.file.type", phase: "decode", fileIndex, path: `files[${fileIndex}]`,
        message: `„${name}“ ist keine JSON-Datei.`,
        action: "Wähle ausschließlich Dateien mit der Endung .json aus.",
      }));
    } else if (file?.readError) {
      issues.push(batchIssue({
        code: "batch.file.read", phase: "decode", fileIndex, path: `files[${fileIndex}]`,
        message: `„${name}“ konnte nicht gelesen werden.`,
        action: "Wähle die Datei erneut aus oder lade sie in ChatGPT noch einmal herunter.",
      }));
    } else if (typeof file?.text !== "string") {
      issues.push(batchIssue({
        code: "batch.file.content", phase: "decode", fileIndex, path: `files[${fileIndex}]`,
        message: `„${name}“ enthält keinen lesbaren Text.`,
      }));
    } else if (file.text.length > maximum) {
      issues.push(batchIssue({
        code: "batch.file.too-large", phase: "decode", fileIndex, path: `files[${fileIndex}]`,
        message: `„${name}“ überschreitet die zulässige Dateigröße.`,
        action: "Lasse ChatGPT den Kurs in mehrere kleinere JSON-Dateien aufteilen.",
      }));
    } else {
      try {
        value = JSON.parse(file.text.replace(/^\uFEFF/u, ""));
        const unsafeKey = findUnsafeKey(value);
        if (unsafeKey) {
          value = null;
          issues.push(batchIssue({
            code: "batch.file.unsafe-key", phase: "decode", fileIndex, path: `files[${fileIndex}]`,
            message: `„${name}“ enthält den unzulässigen Schlüssel „${unsafeKey}“.`,
            action: "Erzeuge die Datei mit dem unveränderten EduTools-Importprompt neu.",
          }));
        }
      } catch {
        issues.push(batchIssue({
          code: "batch.file.invalid-json", phase: "decode", fileIndex, path: `files[${fileIndex}]`,
          message: `„${name}“ enthält kein gültiges JSON.`,
          action: "Lade die vollständige JSON-Datei erneut herunter; Markdown oder Prüfberichte gehören nicht in die Datei.",
        }));
      }
    }
    return { name, type: cleanText(file?.type), size: Number(file?.size) || 0, fileIndex, value };
  });
  return { files, issues };
}

function identity(value) {
  return JSON.stringify([
    value.schemaVersion,
    value.appType,
    cleanText(value.title),
    cleanText(value.languages?.source?.code),
    cleanText(value.languages?.target?.code),
    cleanText(value.languages?.source?.speechLocale),
    cleanText(value.languages?.target?.speechLocale),
  ]);
}

function metadataValue(files, field, issues) {
  const candidates = files.flatMap((file) => {
    const value = cleanText(file.value?.[field]);
    return value ? [{ value, file }] : [];
  });
  if (candidates.length === 0) return "";
  const selected = candidates[0];
  candidates.slice(1).forEach((candidate) => {
    if (candidate.value === selected.value) return;
    issues.push(batchIssue({
      code: "batch.metadata.conflict", severity: "warning", phase: "content",
      fileIndex: candidate.file.fileIndex, path: field,
      message: `Die Angabe „${field}“ unterscheidet sich zwischen den Dateien. Verwendet wird der erste nicht leere Wert „${selected.value}“.`,
      action: "Prüfe den Wert in der Vorschau und passe ihn bei Bedarf später im Course Builder an.",
    }));
  });
  return selected.value;
}

function mapWord(word) {
  return {
    source: word.source,
    targets: word.targets,
    phonetic: word.phonetic,
    hint: word.hint,
    example: word.example,
    tags: word.tags,
  };
}

function mergeFiles(validFiles, issues) {
  const groups = new Map();
  const orderOwners = new Map();
  validFiles.forEach((file) => file.value.units.forEach((unit, unitIndex) => {
    const unitKey = normalizeExactDuplicatePart(unit.title);
    const orderOwner = orderOwners.get(unit.order);
    if (orderOwner && orderOwner !== unitKey) issues.push(batchIssue({
      code: "batch.unit.order.duplicate", severity: "warning", phase: "content",
      fileIndex: file.fileIndex, path: `units[${unitIndex}].order`,
      message: `Die Lernpaket-Reihenfolge ${unit.order} wird von mehreren Lernpaketen verwendet.`,
      action: "EduTools ordnet das Lernpakete stabil nach Quellreihenfolge und nummeriert sie neu.",
    }));
    else orderOwners.set(unit.order, unitKey);
    if (!groups.has(unitKey)) groups.set(unitKey, {
      title: cleanText(unit.title),
      description: cleanText(unit.description),
      sourceOrder: unit.order,
      firstFileIndex: file.fileIndex,
      firstUnitIndex: unitIndex,
      released: unit.released,
      current: unit.current,
      archived: unit.archived,
      parts: [],
    });
    const group = groups.get(unitKey);
    group.sourceOrder = Math.min(group.sourceOrder, unit.order);
    group.parts.push({ file, unit, unitIndex });
  }));

  const merged = [...groups.values()]
    .sort((left, right) => left.sourceOrder - right.sourceOrder
      || left.firstFileIndex - right.firstFileIndex
      || left.firstUnitIndex - right.firstUnitIndex)
    .map((group, finalIndex) => {
      if (group.parts.length > 1) issues.push(batchIssue({
        code: "batch.unit.merged", severity: "warning", phase: "content",
        fileIndex: group.parts[1].file.fileIndex, path: `units[${group.parts[1].unitIndex}]`,
        message: `Das Lernpaket „${group.title}“ ist auf ${group.parts.length} Dateiteile verteilt und wird zusammengeführt.`,
        action: "Die Wörter bleiben in Dateiauswahl- und Quellreihenfolge erhalten.",
      }));
      for (const part of group.parts.slice(1)) {
        const description = cleanText(part.unit.description);
        if (description && group.description && description !== group.description) issues.push(batchIssue({
          code: "batch.unit.description.conflict", severity: "warning", phase: "content",
          fileIndex: part.file.fileIndex, path: `units[${part.unitIndex}].description`,
          message: `Die Beschreibung des Lernpakets „${group.title}“ unterscheidet sich. Verwendet wird der erste nicht leere Wert.`,
        }));
        if (!group.description && description) group.description = description;
        for (const field of ["released", "archived"]) if (part.unit[field] !== group[field]) issues.push(batchIssue({
          code: "batch.unit.status.conflict", severity: "warning", phase: "content",
          fileIndex: part.file.fileIndex, path: `units[${part.unitIndex}].${field}`,
          message: `Der Status „${field}“ des Lernpakets „${group.title}“ unterscheidet sich. Verwendet wird der Wert des zuerst ausgewählten Teils.`,
        }));
      }
      return {
        title: group.title,
        description: group.description,
        order: finalIndex + 1,
        released: group.released,
        current: group.parts.some((part) => part.unit.current),
        archived: group.archived,
        words: group.parts.flatMap((part) => part.unit.words.map(mapWord)),
      };
    });

  const normalized = normalizeImportedLearningPackages(merged);
  normalized.merges.forEach((entry) => issues.push(batchIssue({
    code: "batch.package.technical-fragment-merged",
    severity: "warning",
    phase: "content",
    fileIndex: 0,
    path: "units",
    message: `Das technische Fragment „${entry.from}“ wurde mit „${entry.into}“ zu einem Lernpaket zusammengeführt.`,
    action: "Die ursprüngliche Wortreihenfolge bleibt erhalten.",
  })));
  const packages = normalized.packages;
  getSmallLearningPackageWarnings(packages).forEach((entry) => issues.push(batchIssue({
    code: "batch.package.small",
    severity: "warning",
    phase: "content",
    fileIndex: 0,
    path: `units[${entry.unitIndex}]`,
    message: `Das Lernpaket „${entry.title}“ enthält nur ${entry.wordCount} Wörter.`,
    action: "Prüfe im Course Builder, ob es mit einem anderen Lernpaket zusammengeführt werden sollte.",
  })));

  const requestedCurrent = packages.filter((unit) => unit.current && unit.released && !unit.archived);
  const selectedCurrent = requestedCurrent[0] ?? packages.find((unit) => unit.released && !unit.archived) ?? null;
  if (requestedCurrent.length > 1) issues.push(batchIssue({
    code: "batch.unit.current.multiple", severity: "warning", phase: "content",
    fileIndex: 0, path: "units",
    message: "Mehrere Lernpakete waren als aktuell markiert. EduTools verwendet die erste geeignete Lernpaket in der finalen Reihenfolge.",
  }));
  if (packages.length > 0 && !selectedCurrent) issues.push(batchIssue({
    code: "batch.unit.current.unavailable", fileIndex: 0, path: "units",
    message: "Der Kurs enthält kein freigegebenes, nicht archiviertes Lernpaket, die aktuell gesetzt werden kann.",
    action: "Gib mindestens ein nicht archiviertes Lernpaket frei.",
  }));
  packages.forEach((unit) => { unit.current = unit === selectedCurrent; });
  return packages;
}

function duplicateEntries(units, issues) {
  const result = [];
  units.forEach((unit, unitIndex) => {
    const seen = new Set();
    unit.words.forEach((word, wordIndex) => {
      const key = createExactWordKey(unit.title, word);
      if (seen.has(key)) {
        const duplicate = Object.freeze({ unitTitle: unit.title, source: word.source, unitIndex, wordIndex });
        result.push(duplicate);
        issues.push(batchIssue({
          code: "batch.word.exact-duplicate", severity: "warning", phase: "duplicate",
          fileIndex: 0, path: `units[${unitIndex}].words[${wordIndex}]`,
          message: `„${word.source}“ ist im Lernpaket „${unit.title}“ ein exaktes Duplikat.`,
          action: "Entscheide vor dem Speichern, ob exakte Duplikate übersprungen oder behalten werden sollen.",
        }));
      }
      seen.add(key);
    });
  });
  return result;
}

function fileSummaries(files, issues) {
  return files.map((file) => {
    const own = issues.filter((entry) => entry.location?.fileIndex === file.fileIndex);
    return Object.freeze({
      name: file.name,
      size: file.size,
      status: own.some((entry) => entry.severity === "error")
        ? "error"
        : own.some((entry) => entry.severity === "warning") ? "warning" : "valid",
      issueCount: own.length,
    });
  });
}

export function createCourseJsonBatchAdapter() {
  return Object.freeze({
    id: COURSE_JSON_BATCH_ADAPTER_ID,
    version: 1,
    acceptedKinds: Object.freeze([COURSE_JSON_BATCH_INPUT_KIND]),

    canHandle(input) {
      return Boolean(input && typeof input === "object" && input.kind === COURSE_JSON_BATCH_INPUT_KIND);
    },

    decode(input, limits = {}) {
      const requested = Number(limits.maxFileCharacters);
      const maximum = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_MAX_FILE_CHARACTERS;
      return decodeFiles(input, maximum);
    },

    adapt(decoded) {
      const issues = [...(decoded.issues ?? [])];
      const parsedFiles = decoded.files.filter((file) => isRecord(file.value));
      parsedFiles.forEach((file) => issues.push(...validateCoursePart(file.value, file.fileIndex)));
      const validFiles = parsedFiles.filter((file) => !issues.some((entry) => (
        entry.severity === "error" && entry.location?.fileIndex === file.fileIndex
      )));
      const first = validFiles[0]?.value ?? {};
      const expectedIdentity = validFiles.length > 0 ? identity(first) : "";
      validFiles.slice(1).forEach((file) => {
        if (identity(file.value) === expectedIdentity) return;
        issues.push(batchIssue({
          code: "batch.course.identity-conflict", fileIndex: file.fileIndex, path: "",
          message: `„${file.name}“ gehört nicht zum selben Kurs wie die zuerst ausgewählte gültige Datei.`,
          action: "Wähle nur Dateien mit identischem Kurstitel, appType, schemaVersion und identischer Sprachkonfiguration.",
        }));
      });
      const relatedFiles = validFiles.filter((file) => identity(file.value) === expectedIdentity);
      const units = mergeFiles(relatedFiles, issues);
      const duplicates = duplicateEntries(units, issues);
      const course = {
        title: cleanText(first.title),
        subtitle: metadataValue(relatedFiles, "subtitle", issues),
        description: metadataValue(relatedFiles, "description", issues),
        schoolType: metadataValue(relatedFiles, "schoolType", issues),
        gradeLevel: metadataValue(relatedFiles, "gradeLevel", issues),
        sourceLanguage: cleanText(first.languages?.source?.code),
        targetLanguage: cleanText(first.languages?.target?.code),
      };
      const allIssues = issues;
      const files = fileSummaries(decoded.files, allIssues);
      return {
        payloadKind: "content",
        draft: createImportDraft({
          intent: "create",
          sourceKind: COURSE_JSON_BATCH_ADAPTER_ID,
          course,
          units,
        }),
        provenance: {
          adapterId: COURSE_JSON_BATCH_ADAPTER_ID,
          files,
          duplicates,
          preview: Object.freeze({
            title: course.title,
            fileCount: decoded.files.length,
            unitCount: units.length,
            wordCount: units.reduce((sum, unit) => sum + unit.words.length, 0),
            sourceLanguage: course.sourceLanguage,
            targetLanguage: course.targetLanguage,
            unitTitles: Object.freeze(units.map((unit) => unit.title)),
          }),
        },
        issues: allIssues.filter((entry) => !(decoded.issues ?? []).includes(entry)),
      };
    },
  });
}
