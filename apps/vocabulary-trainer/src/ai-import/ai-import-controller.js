// @ts-check

import { createCourseLanguage } from "../languages/language-registry.js";
import { promptGenerator } from "../prompts/prompt-generator.js?v=4.0.5";
import { VOCABULARY_IMPORT_PROMPT_TYPE } from "../prompts/prompt-registry.js?v=4.0.5";

/** @typedef {{courseName?: string, sourceLanguage?: string, targetLanguage?: string}} AiImportInput */
/** @typedef {{courseName?: string, sourceLanguage?: string, targetLanguage?: string}} AiImportErrors */

/** @param {unknown} value */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** @param {AiImportInput} input */
export function validateAiImportInput(input) {
  /** @type {AiImportErrors} */
  const errors = {};
  const courseName = cleanText(input.courseName);
  const source = createCourseLanguage(input.sourceLanguage);
  const target = createCourseLanguage(input.targetLanguage);
  if (!courseName) errors.courseName = "Bitte gib einen Kursnamen ein.";
  if (!source) errors.sourceLanguage = "Bitte wähle eine Ausgangssprache.";
  if (!target) errors.targetLanguage = "Bitte wähle eine Zielsprache.";
  if (source && target && source.code === target.code) {
    errors.targetLanguage = "Ausgangs- und Zielsprache müssen unterschiedlich sein.";
  }
  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    errors: Object.freeze(errors),
    values: Object.freeze({
      courseName,
      sourceLanguage: source?.code ?? "",
      targetLanguage: target?.code ?? "",
    }),
  });
}

/**
 * Owns only the local prompt preparation. Images and KI responses never enter
 * this controller; the canonical JSON new-import remains a separate workflow.
 * @param {{
 *   generator?: {generate(request: object): Promise<string>},
 *   clipboard?: {writeText(text: string): Promise<void>},
 * }=} options
 */
export function createAiImportController(options = {}) {
  const generator = options.generator ?? promptGenerator;
  const clipboard = options.clipboard ?? globalThis.navigator?.clipboard;
  let input = { courseName: "", sourceLanguage: "", targetLanguage: "" };
  /** @type {AiImportErrors} */
  let errors = Object.freeze({});
  let prompt = "";
  let status = "";

  function getSnapshot() {
    return Object.freeze({
      ...input,
      errors: Object.freeze({ ...errors }),
      prompt,
      status,
    });
  }

  /** @param {keyof typeof input} name @param {unknown} value */
  function setField(name, value) {
    if (!Object.hasOwn(input, name)) throw new TypeError(`Unbekanntes KI-Importfeld: ${String(name)}`);
    input = { ...input, [name]: typeof value === "string" ? value : String(value ?? "") };
    const nextErrors = { ...errors };
    delete nextErrors[name];
    errors = Object.freeze(nextErrors);
    prompt = "";
    status = "";
    return getSnapshot();
  }

  function validate() {
    const result = validateAiImportInput(input);
    errors = result.errors;
    input = { ...input, courseName: result.values.courseName };
    status = result.valid ? "" : "Bitte prüfe die markierten Angaben.";
    return result;
  }

  async function generatePrompt() {
    const validation = validate();
    if (!validation.valid) return Object.freeze({ ok: false, errors, prompt: "" });
    try {
      prompt = await generator.generate({
        type: VOCABULARY_IMPORT_PROMPT_TYPE,
        courseName: validation.values.courseName,
        sourceLanguage: validation.values.sourceLanguage,
        targetLanguage: validation.values.targetLanguage,
      });
      if (!cleanText(prompt)) throw new Error("Die Prompt-Engine hat keinen Inhalt erzeugt.");
      status = "Import-Prompt wurde erzeugt.";
      return Object.freeze({ ok: true, errors: Object.freeze({}), prompt });
    } catch (error) {
      prompt = "";
      status = "Der Import-Prompt konnte nicht erzeugt werden.";
      return Object.freeze({ ok: false, errors: Object.freeze({}), prompt: "", error });
    }
  }

  async function copyPrompt() {
    const generated = await generatePrompt();
    if (!generated.ok) return generated;
    if (typeof clipboard?.writeText !== "function") {
      status = "Die Zwischenablage ist in diesem Browser nicht verfügbar. Nutze „Prompt anzeigen“ und kopiere den Text dort.";
      return Object.freeze({ ok: false, errors: Object.freeze({}), prompt, error: new Error("Clipboard API ist nicht verfügbar.") });
    }
    try {
      await clipboard.writeText(prompt);
      status = "Import-Prompt wurde kopiert.";
      return Object.freeze({ ok: true, errors: Object.freeze({}), prompt });
    } catch (error) {
      status = "Der Import-Prompt konnte nicht kopiert werden. Nutze „Prompt anzeigen“ und kopiere den Text dort.";
      return Object.freeze({ ok: false, errors: Object.freeze({}), prompt, error });
    }
  }

  function reset() {
    input = { courseName: "", sourceLanguage: "", targetLanguage: "" };
    errors = Object.freeze({});
    prompt = "";
    status = "";
    return getSnapshot();
  }

  return Object.freeze({
    copyPrompt,
    generatePrompt,
    getSnapshot,
    reset,
    setField,
    validate,
  });
}
