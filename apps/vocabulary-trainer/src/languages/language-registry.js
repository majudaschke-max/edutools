const DEFINITIONS = Object.freeze([
  Object.freeze({ code: "en", label: "Englisch", speechLocale: "en-GB", ocrModel: "eng" }),
  Object.freeze({ code: "de", label: "Deutsch", speechLocale: "de-DE", ocrModel: "deu" }),
  Object.freeze({ code: "fr", label: "Französisch", speechLocale: "fr-FR", ocrModel: "fra" }),
  Object.freeze({ code: "la", label: "Latein", speechLocale: "la-VA", ocrModel: "lat" }),
  Object.freeze({ code: "es", label: "Spanisch", speechLocale: "es-ES", ocrModel: "spa" }),
  Object.freeze({ code: "it", label: "Italienisch", speechLocale: "it-IT", ocrModel: "ita" }),
]);

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase("de-DE");
}

export function getLanguageDefinitions() {
  return DEFINITIONS.map((definition) => ({ ...definition }));
}

export function resolveLanguageDefinition(value) {
  const key = normalized(value).split("-")[0];
  return DEFINITIONS.find((definition) => (
    normalized(definition.code) === key
    || normalized(definition.label) === normalized(value)
  )) ?? null;
}

export function createCourseLanguage(value) {
  const definition = resolveLanguageDefinition(value);
  if (!definition) return null;
  return {
    code: definition.code,
    label: definition.label,
    speechLocale: definition.speechLocale,
  };
}

export function resolveLanguageOcrModel(value) {
  return resolveLanguageDefinition(value)?.ocrModel ?? null;
}

export function describeLanguageSettings(value) {
  const definition = resolveLanguageDefinition(value);
  if (!definition) return null;
  return {
    code: definition.code,
    locale: definition.speechLocale,
    ocrModel: definition.ocrModel,
  };
}
