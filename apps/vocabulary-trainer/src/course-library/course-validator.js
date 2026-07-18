import { isValidSpeechLocale } from "../audio/pronunciation-config.js";
import {
  COURSE_APP_TYPE,
  COURSE_SCHEMA_VERSION,
  COURSE_SOURCE_TYPES,
} from "./course-schema.js?v=4.0.3";

const COURSE_SOURCE_TYPE_VALUES = new Set(Object.values(COURSE_SOURCE_TYPES));

export const COURSE_FIELD_LIMITS = Object.freeze({
  source: 200,
  target: 200,
  phonetic: 200,
  hint: 500,
  example: 1000,
  tag: 100,
});

function isText(value) {
  return typeof value === "string";
}

function nonEmpty(value) {
  return isText(value) && value.trim().length > 0;
}

function addLengthIssue(errors, value, maximum, path) {
  if (isText(value) && value.length > maximum) {
    errors.push(`${path} darf höchstens ${maximum} Zeichen enthalten.`);
  }
}

function validateWord(word, path, ids, errors) {
  if (!word || typeof word !== "object" || Array.isArray(word)) {
    errors.push(`${path} muss ein Wortobjekt sein.`);
    return;
  }
  if (!nonEmpty(word.id)) errors.push(`${path}.id fehlt.`);
  else if (ids.has(word.id)) errors.push(`Wort-ID „${word.id}“ kommt mehrfach vor.`);
  else ids.add(word.id);
  if (!nonEmpty(word.source)) errors.push(`${path}.source darf nicht leer sein.`);
  addLengthIssue(errors, word.source, COURSE_FIELD_LIMITS.source, `${path}.source`);
  if (!Array.isArray(word.targets) || word.targets.length === 0) {
    errors.push(`${path}.targets benötigt mindestens eine Übersetzung.`);
  } else {
    const targets = new Set();
    word.targets.forEach((target, index) => {
      if (!nonEmpty(target)) errors.push(`${path}.targets[${index}] darf nicht leer sein.`);
      addLengthIssue(errors, target, COURSE_FIELD_LIMITS.target, `${path}.targets[${index}]`);
      const key = isText(target) ? target.trim().normalize("NFC").toLocaleLowerCase() : "";
      if (key && targets.has(key)) errors.push(`${path}.targets enthält „${target}“ mehrfach.`);
      targets.add(key);
    });
  }
  for (const [field, limit] of [["phonetic", 200], ["hint", 500], ["example", 1000]]) {
    if (!isText(word[field])) errors.push(`${path}.${field} muss Text sein.`);
    addLengthIssue(errors, word[field], limit, `${path}.${field}`);
  }
  if (!Array.isArray(word.tags)) errors.push(`${path}.tags muss ein Array sein.`);
  else word.tags.forEach((tag, index) => {
    if (!nonEmpty(tag)) errors.push(`${path}.tags[${index}] darf nicht leer sein.`);
    addLengthIssue(errors, tag, COURSE_FIELD_LIMITS.tag, `${path}.tags[${index}]`);
  });
  if (typeof word.archived !== "boolean") errors.push(`${path}.archived muss boolesch sein.`);
}

export function validateCourse(course) {
  const errors = [];
  const warnings = [];
  if (!course || typeof course !== "object" || Array.isArray(course)) {
    return { valid: false, errors: ["Der Kurs muss ein Objekt sein."], warnings };
  }
  if (course.schemaVersion !== COURSE_SCHEMA_VERSION) errors.push(`schemaVersion muss ${COURSE_SCHEMA_VERSION} sein.`);
  if (course.appType !== COURSE_APP_TYPE) errors.push(`appType muss „${COURSE_APP_TYPE}“ sein.`);
  if (!Number.isInteger(course.contentVersion) || course.contentVersion < 1) errors.push("contentVersion muss eine positive ganze Zahl sein.");
  if (!COURSE_SOURCE_TYPE_VALUES.has(course.sourceType)) errors.push("sourceType ist ungültig.");
  if (typeof course.editable !== "boolean") errors.push("editable muss boolesch sein.");
  if (course.sourceType === COURSE_SOURCE_TYPES.BUNDLED && course.editable !== false) {
    errors.push("Mitgelieferte Kurse dürfen nicht direkt editierbar sein.");
  }
  if (course.sourceType !== COURSE_SOURCE_TYPES.BUNDLED && course.editable !== true) {
    errors.push("Eigene, importierte und duplizierte Kurse müssen editierbar bleiben.");
  }
  if (!nonEmpty(course.id)) errors.push("Kurs-ID fehlt.");
  if (!nonEmpty(course.title)) errors.push("Kurstitel fehlt.");
  for (const role of ["source", "target"]) {
    const language = course.languages?.[role];
    if (!nonEmpty(language?.code)) errors.push(`languages.${role}.code fehlt.`);
    if (!nonEmpty(language?.label)) errors.push(`languages.${role}.label fehlt.`);
    if (!isValidSpeechLocale(language?.speechLocale)) errors.push(`languages.${role}.speechLocale ist ungültig.`);
  }
  if (
    nonEmpty(course.languages?.source?.code)
    && nonEmpty(course.languages?.target?.code)
    && course.languages.source.code.trim().toLocaleLowerCase()
      === course.languages.target.code.trim().toLocaleLowerCase()
  ) {
    errors.push("Ausgangs- und Zielsprache müssen unterschiedlich sein.");
  }
  const pronunciation = course.pronunciation;
  if (typeof pronunciation?.enabled !== "boolean") errors.push("pronunciation.enabled muss boolesch sein.");
  for (const [field, minimum, maximum] of [["rate", 0.5, 1.5], ["pitch", 0.5, 1.5], ["volume", 0, 1]]) {
    const value = pronunciation?.[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
      errors.push(`pronunciation.${field} muss zwischen ${minimum} und ${maximum} liegen.`);
    }
  }
  if (!Array.isArray(course.units)) errors.push("units muss ein Array sein.");
  else {
    const unitIds = new Set();
    const wordIds = new Set();
    let currentCount = 0;
    course.units.forEach((unit, unitIndex) => {
      const path = `units[${unitIndex}]`;
      if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
        errors.push(`${path} muss ein Unitobjekt sein.`);
        return;
      }
      if (!nonEmpty(unit.id)) errors.push(`${path}.id fehlt.`);
      else if (unitIds.has(unit.id)) errors.push(`Lernpaket-ID „${unit.id}“ kommt mehrfach vor.`);
      else unitIds.add(unit.id);
      if (!nonEmpty(unit.title)) errors.push(`${path}.title darf nicht leer sein.`);
      if (!Number.isInteger(unit.order) || unit.order < 0) errors.push(`${path}.order ist ungültig.`);
      for (const field of ["released", "current", "archived"]) {
        if (typeof unit[field] !== "boolean") errors.push(`${path}.${field} muss boolesch sein.`);
      }
      if (unit.current) {
        currentCount += 1;
        if (!unit.released || unit.archived) errors.push(`${path} kann nur freigegeben und nicht archiviert aktuell sein.`);
      }
      if (!Array.isArray(unit.words)) errors.push(`${path}.words muss ein Array sein.`);
      else unit.words.forEach((word, wordIndex) => validateWord(word, `${path}.words[${wordIndex}]`, wordIds, errors));
    });
    if (currentCount > 1) errors.push("Höchstens ein Lernpaket darf aktuell sein.");
    if (course.units.length === 0) warnings.push("Der Kurs enthält noch kein Lernpaket.");
  }
  if (!Number.isFinite(Date.parse(course.createdAt))) errors.push("createdAt ist ungültig.");
  if (!Number.isFinite(Date.parse(course.updatedAt))) errors.push("updatedAt ist ungültig.");
  return { valid: errors.length === 0, errors, warnings };
}

export function assertValidCourse(course) {
  const result = validateCourse(course);
  if (!result.valid) {
    const error = new TypeError(`Kursdaten sind ungültig: ${result.errors.join(" ")}`);
    error.issues = result.errors;
    throw error;
  }
  return course;
}
