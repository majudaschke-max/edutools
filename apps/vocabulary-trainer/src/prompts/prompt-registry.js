// @ts-check

export const VOCABULARY_IMPORT_PROMPT_TYPE = "vocabulary-import";
export const DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION = "import-v1";

/**
 * @typedef {object} PromptDefinition
 * @property {string} type
 * @property {string} version
 * @property {boolean=} default
 * @property {URL} resource
 * @property {string} integrity
 * @property {readonly string[]} requiredPlaceholders
 * @property {readonly string[]=} optionalPlaceholders
 */

const DEFINITIONS = Object.freeze([
  Object.freeze({
    type: VOCABULARY_IMPORT_PROMPT_TYPE,
    version: DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION,
    default: true,
    resource: new URL("./vocabulary/import-v1.txt?v=4.0.5", import.meta.url),
    integrity: "sha256-e5685603a4f02153e2cebdb721b791e54a9b920fbc77e0e6891f85ce07bcc751",
    requiredPlaceholders: Object.freeze([
      "COURSE_NAME",
      "SOURCE_LANGUAGE",
      "TARGET_LANGUAGE",
      "SUPPORTED_LANGUAGES",
      "SCHEMA_VERSION",
      "APP_TYPE",
      "SCHEMA_EXAMPLE",
    ]),
    optionalPlaceholders: Object.freeze(["SCHOOL_TYPE", "GRADE_LEVEL"]),
  }),
]);

/** @param {PromptDefinition} value */
function normalizeDefinition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Eine Promptdefinition muss ein Objekt sein.");
  }
  const type = String(value.type ?? "").trim();
  const version = String(value.version ?? "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(type)) throw new TypeError("Eine Promptdefinition benötigt einen gültigen Typ.");
  if (!/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(version)) {
    throw new TypeError(`Promptversion „${version}“ ist ungültig.`);
  }
  if (!(value.resource instanceof URL)) throw new TypeError(`Prompt „${type}/${version}“ benötigt eine Ressourcen-URL.`);
  if (!/^sha256-[a-f0-9]{64}$/.test(String(value.integrity ?? ""))) {
    throw new TypeError(`Prompt „${type}/${version}“ benötigt eine SHA-256-Integritätsangabe.`);
  }
  return Object.freeze({
    type,
    version,
    default: value.default === true,
    resource: value.resource,
    integrity: String(value.integrity),
    requiredPlaceholders: Object.freeze([...(value.requiredPlaceholders ?? [])]),
    optionalPlaceholders: Object.freeze([...(value.optionalPlaceholders ?? [])]),
  });
}

/**
 * Generic registry for vocabulary, reading, grammar, quiz and future types.
 * @param {readonly PromptDefinition[]} definitions
 */
export function createPromptRegistry(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new TypeError("Mindestens eine Promptdefinition ist erforderlich.");
  }
  const entries = definitions.map(normalizeDefinition);
  const byKey = new Map();
  const defaults = new Map();
  entries.forEach((entry) => {
    const key = `${entry.type}\u0000${entry.version}`;
    if (byKey.has(key)) throw new TypeError(`Prompt „${entry.type}/${entry.version}“ ist doppelt registriert.`);
    byKey.set(key, entry);
    if (entry.default) {
      if (defaults.has(entry.type)) throw new TypeError(`Prompttyp „${entry.type}“ besitzt mehrere Standardversionen.`);
      defaults.set(entry.type, entry.version);
    }
  });

  /** @param {string} type @param {string=} version */
  function get(type, version = "") {
    const normalizedType = String(type ?? "").trim();
    const selectedVersion = String(version ?? "").trim() || defaults.get(normalizedType);
    if (!selectedVersion) throw new Error(`Für den Prompttyp „${normalizedType}“ ist keine Standardversion registriert.`);
    const entry = byKey.get(`${normalizedType}\u0000${selectedVersion}`);
    if (!entry) throw new Error(`Promptversion „${normalizedType}/${selectedVersion}“ ist nicht registriert.`);
    return entry;
  }

  /** @param {string=} type */
  function list(type = "") {
    return entries
      .filter((entry) => !type || entry.type === type)
      .map((entry) => entry);
  }

  return Object.freeze({ get, list });
}

export const promptRegistry = createPromptRegistry(DEFINITIONS);
