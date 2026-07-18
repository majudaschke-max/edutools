import {
  getLanguageDefinitions,
  resolveLanguageOcrModel,
} from "../languages/language-registry.js";

const INSTALLED_MODELS = new Set(["deu", "eng", "fra", "lat"]);
const DEFINITIONS = Object.freeze(getLanguageDefinitions()
  .filter(({ ocrModel }) => INSTALLED_MODELS.has(ocrModel))
  .map(({ code, label, ocrModel }) => Object.freeze({
    model: ocrModel,
    label,
    codes: Object.freeze([code, ocrModel]),
  })));

export const INSTALLED_OCR_MODELS = Object.freeze(DEFINITIONS.map(({ model }) => model));

function baseLanguageCode(value) {
  return String(value ?? "")
    .trim()
    .replaceAll("_", "-")
    .toLocaleLowerCase()
    .split("-")[0];
}

export function getOcrLanguageDefinitions() {
  return DEFINITIONS.map((definition) => ({
    model: definition.model,
    label: definition.label,
    codes: [...definition.codes],
    installed: true,
  }));
}

export function resolveOcrModel(languageCode) {
  const normalized = baseLanguageCode(languageCode);
  return DEFINITIONS.find((definition) => definition.codes.includes(normalized))?.model
    ?? resolveLanguageOcrModel(normalized);
}

export function resolveCourseOcrModels(course) {
  const source = resolveOcrModel(course?.languages?.source?.code);
  const target = resolveOcrModel(course?.languages?.target?.code);
  const suggested = [...new Set([source, target].filter((model) => INSTALLED_MODELS.has(model)))];
  return Object.freeze({ source, target, suggested: Object.freeze(suggested) });
}

export function assertInstalledOcrModels(models) {
  const requested = [...new Set((Array.isArray(models) ? models : [models]).filter(Boolean))];
  if (requested.length === 0) throw new TypeError("Wähle mindestens ein installiertes OCR-Sprachmodell aus.");
  const missing = requested.filter((model) => !INSTALLED_OCR_MODELS.includes(model));
  if (missing.length > 0) {
    throw new TypeError(`Das OCR-Sprachmodell „${missing.join(", ")}“ ist in dieser Author-Version nicht installiert.`);
  }
  return requested;
}
