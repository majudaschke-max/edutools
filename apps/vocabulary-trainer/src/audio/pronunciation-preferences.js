import {
  createDeploymentStorageKey,
  loadJson,
  saveJson,
} from "../core/storage.js";

export const PRONUNCIATION_SPEEDS = Object.freeze({
  slow: Object.freeze({ label: "Langsam", rate: 0.8 }),
  normal: Object.freeze({ label: "Normal", rate: 0.9 }),
  fast: Object.freeze({ label: "Schnell", rate: 1.05 }),
});

const SCHEMA_VERSION = 1;
const STORAGE_AREA = "pronunciation-preferences";

function cleanVoiceMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([language, name]) => {
    const cleanLanguage = String(language ?? "").trim().toLowerCase();
    const cleanName = typeof name === "string" ? name.trim() : "";
    return cleanLanguage && cleanName ? [[cleanLanguage, cleanName]] : [];
  }));
}

export function normalizePronunciationPreferences(value = {}) {
  const speed = Object.hasOwn(PRONUNCIATION_SPEEDS, value?.speed)
    ? value.speed
    : "normal";
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    speed,
    voices: Object.freeze(cleanVoiceMap(value?.voices)),
  });
}

export function loadPronunciationPreferences() {
  const stored = loadJson(createDeploymentStorageKey(STORAGE_AREA), null);
  return normalizePronunciationPreferences(
    stored?.schemaVersion === SCHEMA_VERSION ? stored : null,
  );
}

export function savePronunciationPreferences(value) {
  const normalized = normalizePronunciationPreferences(value);
  return saveJson(createDeploymentStorageKey(STORAGE_AREA), normalized);
}

export function getPronunciationLanguageKey(locale) {
  return typeof locale === "string"
    ? locale.trim().toLowerCase().split("-")[0]
    : "";
}

