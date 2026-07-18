import { promptGenerator } from "../prompts/prompt-generator.js";
import { VOCABULARY_IMPORT_PROMPT_TYPE } from "../prompts/prompt-registry.js";

export const TABULAR_IMPORT_COLUMNS = Object.freeze([
  "source",
  "target",
  "phonetic",
  "hint",
  "example",
  "tags",
  "unit",
]);

export const MULTIPLE_TARGET_SEPARATOR = "|";

const EXAMPLE_ROWS = Object.freeze([
  Object.freeze(["harbour", "Hafen", "[ˈhɑːbə]", "A protected place where boats can stay.", "The boat returned to the harbour.", "places", "Coast"]),
  Object.freeze(["journey", "Reise|Fahrt", "[ˈdʒɜːni]", "Travelling from one place to another.", "Our journey took two hours.", "travel|noun", "Coast"]),
]);

function quoteCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Creates the neutral UTF-8 template used by the Author UI and tests. */
export function createTabularImportTemplate() {
  const rows = [TABULAR_IMPORT_COLUMNS, ...EXAMPLE_ROWS];
  return `\uFEFF${rows.map((row) => row.map(quoteCsvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * Creates the provider-neutral prompt copied by the Author app.
 * @param {object} options
 * @param {{promptGenerator?: {generate(request: object): Promise<string>}}} dependencies
 */
export async function createImportPrompt(options = {}, dependencies = {}) {
  const generator = dependencies.promptGenerator ?? promptGenerator;
  return generator.generate({
    type: VOCABULARY_IMPORT_PROMPT_TYPE,
    version: options.version,
    courseName: options.courseName ?? options.title,
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    schoolType: options.schoolType,
    gradeLevel: options.gradeLevel,
  });
}

/** Copies locally and deliberately has no network dependency. */
export async function copyImportPromptToClipboard(options = {}, dependencies = {}) {
  const clipboard = dependencies.clipboard ?? globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText !== "function") {
    throw new Error("Clipboard API ist nicht verfügbar.");
  }
  const text = await createImportPrompt(options, dependencies);
  await clipboard.writeText(text);
  return text;
}

export function downloadTabularImportTemplate(options = {}) {
  const documentRoot = options.document ?? globalThis.document;
  const URLObject = options.URL ?? globalThis.URL;
  const BlobClass = options.Blob ?? globalThis.Blob;
  if (!documentRoot || !URLObject?.createObjectURL || !BlobClass) {
    throw new Error("Der Browser kann die CSV-Vorlage nicht erzeugen.");
  }
  const url = URLObject.createObjectURL(new BlobClass(
    [createTabularImportTemplate()],
    { type: "text/csv;charset=utf-8" },
  ));
  try {
    const link = documentRoot.createElement("a");
    link.href = url;
    link.download = "edutools-vokabelvorlage.csv";
    link.hidden = true;
    documentRoot.body.append(link);
    link.click();
    link.remove();
  } finally {
    URLObject.revokeObjectURL(url);
  }
  return { filename: "edutools-vokabelvorlage.csv", text: createTabularImportTemplate() };
}
