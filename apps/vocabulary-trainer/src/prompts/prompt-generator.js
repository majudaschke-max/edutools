// @ts-check

import {
  COURSE_APP_TYPE,
  COURSE_SCHEMA_VERSION,
} from "../course-library/course-schema.js?v=4.0.5";
import {
  getLanguageDefinitions,
  resolveLanguageDefinition,
} from "../languages/language-registry.js?v=4.0.5";
import { promptLoader } from "./prompt-loader.js?v=4.0.5";
import {
  DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION,
  VOCABULARY_IMPORT_PROMPT_TYPE,
} from "./prompt-registry.js?v=4.0.5";
import { renderPromptTemplate } from "./template-engine.js";

/**
 * @typedef {object} PromptLanguageInput
 * @property {string=} code
 * @property {string=} label
 */

/**
 * @typedef {object} PromptRequest
 * @property {string=} type
 * @property {string=} promptType
 * @property {string=} version
 * @property {string=} courseName
 * @property {string=} title
 * @property {string | PromptLanguageInput=} sourceLanguage
 * @property {string | PromptLanguageInput=} targetLanguage
 * @property {string=} schoolType
 * @property {string=} gradeLevel
 */

/** @typedef {(request: PromptRequest) => Record<string, unknown> | Promise<Record<string, unknown>>} PromptValueFactory */

/**
 * @typedef {object} LoadedPrompt
 * @property {string} template
 * @property {readonly string[]} requiredPlaceholders
 * @property {readonly string[]} optionalPlaceholders
 */

/** @type {Readonly<Record<string, string>>} */
const DEMO_WORDS = Object.freeze({
  de: "Beispiel",
  en: "example",
  es: "ejemplo",
  fr: "exemple",
  it: "esempio",
  la: "exemplum",
});

/** @param {unknown} value */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** @param {string | PromptLanguageInput | undefined} value */
function promptLanguage(value) {
  const candidate = typeof value === "object" && value
    ? value.code || value.label
    : value;
  return resolveLanguageDefinition(candidate);
}

/** @param {PromptRequest} options */
function createVocabularyContext(options = {}) {
  const definitions = getLanguageDefinitions();
  const defaultSource = definitions.find((item) => item.code === "en") ?? definitions[0];
  const defaultTarget = definitions.find((item) => item.code === "de") ?? definitions[1];
  if (!defaultSource || !defaultTarget) {
    throw new Error("Für den Import-Prompt sind mindestens zwei Sprachen erforderlich.");
  }
  const resolvedSource = promptLanguage(options.sourceLanguage);
  const resolvedTarget = promptLanguage(options.targetLanguage);
  const source = resolvedSource ?? defaultSource;
  const target = resolvedTarget && resolvedTarget.code !== source.code
    ? resolvedTarget
    : definitions.find((item) => item.code !== source.code) ?? defaultTarget;
  return Object.freeze({
    title: cleanText(options.courseName ?? options.title),
    schoolType: cleanText(options.schoolType),
    gradeLevel: cleanText(options.gradeLevel),
    source,
    target,
    sourceProvided: Boolean(resolvedSource),
    targetProvided: Boolean(resolvedTarget && resolvedTarget.code !== source.code),
  });
}

/** @param {{code: string, label: string, speechLocale: string}} definition @param {boolean} provided */
function languageDescription(definition, provided) {
  if (!provided) return "nicht festgelegt – frage vor der Dateierstellung nach";
  return `${definition.label} (Code ${definition.code}, Locale ${definition.speechLocale})`;
}

/** @param {ReturnType<typeof createVocabularyContext>} context */
function importableSchemaExample(context) {
  return {
    schemaVersion: COURSE_SCHEMA_VERSION,
    appType: COURSE_APP_TYPE,
    title: context.title || "Mein Vokabelkurs",
    subtitle: "",
    description: "",
    schoolType: context.schoolType,
    gradeLevel: context.gradeLevel,
    languages: {
      source: {
        code: context.source.code,
        label: context.source.label,
        speechLocale: context.source.speechLocale,
      },
      target: {
        code: context.target.code,
        label: context.target.label,
        speechLocale: context.target.speechLocale,
      },
    },
    units: [
      {
        title: "Beispiel-Lernpaket",
        description: "",
        order: 1,
        released: true,
        current: true,
        archived: false,
        words: [
          {
            source: DEMO_WORDS[context.source.code] ?? "example",
            targets: [DEMO_WORDS[context.target.code] ?? "example"],
            phonetic: "",
            hint: "",
            example: "",
            tags: [],
            archived: false,
          },
        ],
      },
    ],
  };
}

/**
 * Produces the declared values for the versioned vocabulary-import template.
 * @param {PromptRequest} options
 */
export function createVocabularyImportPromptValues(options = {}) {
  const context = createVocabularyContext(options);
  const supportedLanguages = getLanguageDefinitions()
    .map((item) => `${item.label}: ${item.code}, ${item.speechLocale}`)
    .join("; ");
  return Object.freeze({
    COURSE_NAME: context.title || "nicht festgelegt – frage vor der Dateierstellung nach",
    SOURCE_LANGUAGE: languageDescription(context.source, context.sourceProvided),
    TARGET_LANGUAGE: languageDescription(context.target, context.targetProvided),
    SUPPORTED_LANGUAGES: supportedLanguages,
    SCHEMA_VERSION: COURSE_SCHEMA_VERSION,
    APP_TYPE: COURSE_APP_TYPE,
    SCHEMA_EXAMPLE: JSON.stringify(importableSchemaExample(context), null, 2),
    SCHOOL_TYPE: context.schoolType,
    GRADE_LEVEL: context.gradeLevel,
  });
}

/** @type {Readonly<Record<string, PromptValueFactory>>} */
const DEFAULT_VALUE_FACTORIES = Object.freeze({
  [VOCABULARY_IMPORT_PROMPT_TYPE]: createVocabularyImportPromptValues,
});

/**
 * Creates a prompt generator that is independent of concrete prompt files.
 * New prompt types register a resource and provide a value factory; generation
 * and template validation remain unchanged.
 * @param {{
 *   loader?: {load(type: string, version?: string): Promise<LoadedPrompt>},
 *   valueFactories?: Record<string, PromptValueFactory>
 * }} options
 */
export function createPromptGenerator(options = {}) {
  const loader = options.loader ?? promptLoader;
  /** @type {Readonly<Record<string, PromptValueFactory>>} */
  const valueFactories = Object.freeze({
    ...DEFAULT_VALUE_FACTORIES,
    ...(options.valueFactories ?? {}),
  });

  /** @param {PromptRequest} request */
  async function generate(request = {}) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new TypeError("Eine Promptanfrage muss ein Objekt sein.");
    }
    const type = cleanText(request.type ?? request.promptType) || VOCABULARY_IMPORT_PROMPT_TYPE;
    const version = cleanText(request.version)
      || (type === VOCABULARY_IMPORT_PROMPT_TYPE ? DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION : "");
    const valueFactory = valueFactories[type];
    if (typeof valueFactory !== "function") {
      throw new Error(`Für den Prompttyp „${type}“ ist keine Werterzeugung registriert.`);
    }
    const loaded = await loader.load(type, version);
    const values = await valueFactory(request);
    return renderPromptTemplate(loaded.template, values, loaded);
  }

  return Object.freeze({ generate });
}

export const promptGenerator = createPromptGenerator();
