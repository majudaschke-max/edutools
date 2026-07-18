// @ts-check

import { createCourseLanguage } from "../languages/language-registry.js";
import {
  COURSE_JSON_BATCH_ADAPTER_ID,
  COURSE_JSON_BATCH_INPUT_KIND,
} from "../import/adapters/course-json-batch-adapter.js?v=4.0.3";
import { createImportIssue } from "../import/core/import-issues.js";
import {
  AI_CONTENT_ADAPTER_ID,
  AI_CONTENT_INPUT_KIND,
} from "../import/adapters/ai-content-adapter.js";
import { importOrchestrator } from "../import/import-pipeline.js?v=4.0.3";
import { promptGenerator } from "../prompts/prompt-generator.js?v=4.0.3";
import { VOCABULARY_IMPORT_PROMPT_TYPE } from "../prompts/prompt-registry.js?v=4.0.3";

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

/** @param {ArrayLike<{name?: unknown, type?: unknown}> | Iterable<{name?: unknown, type?: unknown}> | null | undefined} files */
export function validateAiImportJsonFiles(files) {
  const candidates = Array.from(files ?? [], (file) => ({
    name: cleanText(file?.name),
    type: cleanText(file?.type).toLocaleLowerCase("en-US"),
  }));
  const rejected = candidates.filter((file) => !/\.json$/iu.test(file.name));
  return Object.freeze({
    valid: candidates.length > 0 && rejected.length === 0,
    count: candidates.length,
    rejected: Object.freeze(rejected),
    error: candidates.length === 0
      ? "Bitte wähle mindestens eine JSON-Datei aus."
      : rejected.length > 0
        ? `Nicht unterstützte Datei${rejected.length === 1 ? "" : "en"}: ${rejected.map((file) => file.name || "ohne Dateinamen").join(", ")}.`
        : "",
  });
}

const SUPPORTED_IMAGE_EXTENSION = /\.(?:heic|heif|jpe?g|png|webp)$/iu;
const SUPPORTED_IMAGE_TYPE = new Set([
  "image/heic", "image/heif", "image/jpeg", "image/jpg", "image/png", "image/webp",
]);

/** Validates metadata only; image bytes are deliberately never read. */
export function validateAiImportImageFiles(files) {
  const candidates = Array.from(files ?? [], (file, index) => ({
    label: `Bild ${index + 1}`,
    name: cleanText(file?.name),
    type: cleanText(file?.type).toLocaleLowerCase("en-US"),
  }));
  const rejected = candidates.filter((file) => (
    !SUPPORTED_IMAGE_EXTENSION.test(file.name) && !SUPPORTED_IMAGE_TYPE.has(file.type)
  ));
  return Object.freeze({
    valid: candidates.length > 0 && rejected.length === 0,
    files: Object.freeze(candidates),
    rejected: Object.freeze(rejected),
    error: candidates.length === 0
      ? "Bitte wähle mindestens ein Bild aus."
      : rejected.length > 0
        ? "Unterstützt werden HEIC, HEIF, JPG, JPEG, PNG und WEBP."
        : "",
  });
}

/**
 * Owns the transient guided workflow. Image files never enter EduTools; only
 * downloaded JSON files are read locally and passed to the import pipeline.
 * @param {{
 *   generator?: {generate(request: object): Promise<string>},
 *   clipboard?: {writeText(text: string): Promise<void>},
 *   orchestrator?: typeof importOrchestrator,
 *   service?: object,
 *   idGenerator?: Function,
 *   now?: Date | string | number,
 * }=} options
 */
export function createAiImportController(options = {}) {
  const generator = options.generator ?? promptGenerator;
  const clipboard = options.clipboard ?? globalThis.navigator?.clipboard;
  const orchestrator = options.orchestrator ?? importOrchestrator;
  const service = options.service;
  let input = { courseName: "", sourceLanguage: "", targetLanguage: "" };
  /** @type {AiImportErrors} */
  let errors = Object.freeze({});
  let prompt = "";
  let status = "";
  let selectedFiles = Object.freeze([]);
  let importIssues = Object.freeze([]);
  let importStatus = "";
  let preview = null;
  let duplicateChoice = "keep";
  let session = null;
  let committedResult = null;
  let selectedImages = Object.freeze([]);
  let imageStatus = "";
  let responseText = "";
  let responseIssues = Object.freeze([]);
  let responseStatus = "";
  let responseSession = null;
  let responsePreview = null;
  let committedResponse = null;

  function getSnapshot() {
    return Object.freeze({
      ...input,
      errors: Object.freeze({ ...errors }),
      prompt,
      status,
      selectedFiles: Object.freeze(selectedFiles.map((file) => Object.freeze({ ...file }))),
      importIssues: Object.freeze(importIssues.map((issue) => Object.freeze({ ...issue }))),
      importStatus,
      preview: preview ? Object.freeze({ ...preview, unitTitles: Object.freeze([...(preview.unitTitles ?? [])]) }) : null,
      duplicateChoice,
      duplicates: Object.freeze((session?.provenance?.duplicates ?? []).map((entry) => Object.freeze({ ...entry }))),
      canImport: Boolean(session?.valid && !committedResult),
      selectedImages: Object.freeze(selectedImages.map((file) => Object.freeze({ ...file }))),
      imageStatus,
      responseText,
      responseIssues: Object.freeze(responseIssues.map((entry) => Object.freeze({ ...entry }))),
      responseStatus,
      responsePreview: responsePreview ? Object.freeze({ ...responsePreview }) : null,
      canImportResponse: Boolean(responseSession?.valid && !committedResponse),
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
    clearPreparedResponse();
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
      status = "Import-Prompt kopiert";
      return Object.freeze({ ok: true, errors: Object.freeze({}), prompt });
    } catch (error) {
      status = "Der Import-Prompt konnte nicht kopiert werden. Nutze „Prompt anzeigen“ und kopiere den Text dort.";
      return Object.freeze({ ok: false, errors: Object.freeze({}), prompt, error });
    }
  }

  function clearPreparedImport() {
    selectedFiles = Object.freeze([]);
    importIssues = Object.freeze([]);
    importStatus = "";
    preview = null;
    duplicateChoice = "keep";
    session = null;
    committedResult = null;
  }

  function clearPreparedResponse() {
    responseIssues = Object.freeze([]);
    responseStatus = "";
    responseSession = null;
    responsePreview = null;
    committedResponse = null;
  }

  function setImageFiles(files) {
    const result = validateAiImportImageFiles(files);
    selectedImages = result.valid ? result.files : Object.freeze([]);
    imageStatus = result.valid
      ? `${result.files.length} ${result.files.length === 1 ? "Bild ausgewählt" : "Bilder ausgewählt"}`
      : result.error;
    return Object.freeze({ ok: result.valid, ...getSnapshot() });
  }

  function setResponseText(value) {
    responseText = typeof value === "string" ? value : String(value ?? "");
    clearPreparedResponse();
    return getSnapshot();
  }

  function prepareResponse() {
    const validation = validate();
    if (!validation.valid) return Object.freeze({ ok: false, ...getSnapshot() });
    try {
      responseSession = orchestrator.prepareImport({
        adapterId: AI_CONTENT_ADAPTER_ID,
        input: { kind: AI_CONTENT_INPUT_KIND, text: responseText },
        context: {
          courseName: validation.values.courseName,
          sourceLanguage: validation.values.sourceLanguage,
          targetLanguage: validation.values.targetLanguage,
        },
      });
      responseIssues = Object.freeze([...responseSession.issues]);
      const units = responseSession.payload?.units ?? [];
      responsePreview = responseSession.valid ? {
        packageCount: units.length,
        wordCount: units.reduce((sum, unit) => sum + (unit.words?.length ?? 0), 0),
      } : null;
      responseStatus = responseSession.valid
        ? "Die ChatGPT-Antwort wurde geprüft und kann importiert werden."
        : "Die ChatGPT-Antwort enthält noch Fehler.";
      return Object.freeze({ ok: responseSession.valid, ...getSnapshot() });
    } catch (error) {
      responseStatus = "Die ChatGPT-Antwort konnte nicht geprüft werden.";
      return Object.freeze({ ok: false, error, ...getSnapshot() });
    }
  }

  function importResponse() {
    if (committedResponse) return Object.freeze({ ok: true, ...committedResponse, reused: true });
    if (!responseSession?.valid) {
      const prepared = prepareResponse();
      if (!prepared.ok) return prepared;
    }
    try {
      const plan = orchestrator.createImportPlan(responseSession, { strategy: "add", newUnitReleased: true });
      const result = orchestrator.commitImport(plan, {
        service,
        idGenerator: options.idGenerator,
        now: options.now,
      });
      committedResponse = Object.freeze({ course: result.course, imported: result.imported });
      responseStatus = `Kurs „${result.course.title}“ wurde mit ${result.imported} Vokabeln erstellt.`;
      return Object.freeze({ ok: true, ...committedResponse, reused: false });
    } catch (error) {
      responseStatus = "Der Kurs konnte nicht gespeichert werden.";
      return Object.freeze({ ok: false, error, ...getSnapshot() });
    }
  }

  /** @param {ArrayLike<object> | Iterable<object> | null | undefined} files */
  async function setJsonFiles(files) {
    clearPreparedImport();
    const candidates = Array.from(files ?? []);
    const selection = validateAiImportJsonFiles(candidates);
    if (candidates.length === 0) {
      importStatus = selection.error;
      return Object.freeze({ ok: false, ...getSnapshot() });
    }
    const inputs = await Promise.all(candidates.map(async (file, index) => {
      let text = typeof file?.text === "string" ? file.text : "";
      let readError = "";
      if (!text && typeof file?.text === "function") {
        try {
          text = await file.text();
        } catch (error) {
          readError = error instanceof Error ? error.message : "Datei konnte nicht gelesen werden.";
        }
      }
      return {
        name: cleanText(file?.name) || `Datei ${index + 1}.json`,
        type: cleanText(file?.type),
        size: Number(file?.size) || text.length,
        text,
        readError,
      };
    }));
    try {
      session = orchestrator.prepareImport({
        adapterId: COURSE_JSON_BATCH_ADAPTER_ID,
        input: { kind: COURSE_JSON_BATCH_INPUT_KIND, files: inputs },
      });
      selectedFiles = Object.freeze([...(session.provenance?.files ?? [])]);
      importIssues = Object.freeze([...session.issues]);
      preview = session.provenance?.preview ?? null;
      importStatus = session.valid
        ? `${inputs.length} ${inputs.length === 1 ? "Datei wurde" : "Dateien wurden"} geprüft und ${inputs.length === 1 ? "ist" : "sind"} bereit zum Import.`
        : "Der Import ist blockiert. Korrigiere die gemeldeten Dateien und wähle alle zusammengehörigen JSON-Dateien erneut aus.";
      return Object.freeze({ ok: session.valid, session, ...getSnapshot() });
    } catch (error) {
      importIssues = Object.freeze([createImportIssue({
        code: "batch.prepare.failed",
        phase: "decode",
        path: "files",
        message: "Die ausgewählten JSON-Dateien konnten nicht geprüft werden.",
        action: "Wähle die Dateien erneut aus.",
      })]);
      selectedFiles = Object.freeze(inputs.map((file) => ({ name: file.name, size: file.size, status: "error", issueCount: 1 })));
      importStatus = "Der Import ist blockiert.";
      return Object.freeze({ ok: false, error, ...getSnapshot() });
    }
  }

  /** @param {unknown} value */
  function setDuplicateChoice(value) {
    if (!["skip", "keep"].includes(value)) throw new TypeError("Unbekannte Duplikatentscheidung.");
    duplicateChoice = value;
    committedResult = null;
    return getSnapshot();
  }

  function importJsonFiles() {
    if (committedResult) return Object.freeze({ ok: true, ...committedResult, reused: true });
    if (!session?.valid) {
      importStatus = selectedFiles.length === 0
        ? "Wähle zuerst mindestens eine JSON-Datei aus."
        : "Fehlerhafte Dateien können nicht importiert werden.";
      return Object.freeze({ ok: false, issues: importIssues });
    }
    try {
      const plan = orchestrator.createImportPlan(session, {
        strategy: "add",
        exactDuplicateStrategy: duplicateChoice,
      });
      const result = orchestrator.commitImport(plan, {
        service,
        idGenerator: options.idGenerator,
        now: options.now,
      });
      committedResult = Object.freeze({
        course: result.course,
        imported: result.imported,
        skipped: result.skipped,
        issues: importIssues,
      });
      importStatus = `Kurs „${result.course.title}“ wurde aus ${selectedFiles.length} ${selectedFiles.length === 1 ? "Datei" : "Dateien"} mit ${result.imported} Vokabel${result.imported === 1 ? "" : "n"} erstellt.`;
      return Object.freeze({ ok: true, ...committedResult, reused: false });
    } catch (error) {
      const issue = createImportIssue({
        code: "batch.commit.failed",
        phase: "commit",
        path: "course",
        message: "Der Kurs konnte nicht gespeichert werden. Es wurde kein Teilimport angelegt.",
        action: "Versuche den Import erneut. Deine ausgewählten Dateien bleiben fachlich unverändert.",
      });
      importIssues = Object.freeze([...importIssues, issue]);
      importStatus = "Der Import wurde nicht abgeschlossen.";
      return Object.freeze({ ok: false, issues: importIssues, error });
    }
  }

  function reset() {
    input = { courseName: "", sourceLanguage: "", targetLanguage: "" };
    errors = Object.freeze({});
    prompt = "";
    status = "";
    clearPreparedImport();
    selectedImages = Object.freeze([]);
    imageStatus = "";
    responseText = "";
    clearPreparedResponse();
    return getSnapshot();
  }

  return Object.freeze({
    copyPrompt,
    generatePrompt,
    getSnapshot,
    importJsonFiles,
    importResponse,
    prepareResponse,
    reset,
    setDuplicateChoice,
    setField,
    setImageFiles,
    setJsonFiles,
    setResponseText,
    validate,
  });
}
