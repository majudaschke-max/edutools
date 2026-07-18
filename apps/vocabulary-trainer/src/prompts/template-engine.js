// @ts-check

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/**
 * @typedef {object} PromptTemplateContract
 * @property {readonly string[]=} requiredPlaceholders
 * @property {readonly string[]=} optionalPlaceholders
 */

/** @param {unknown} values @param {string} label */
function uniqueNames(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} muss eine Liste sein.`);
  const names = values.map((value) => String(value ?? "").trim());
  if (names.some((name) => !/^[A-Z][A-Z0-9_]*$/.test(name))) {
    throw new TypeError(`${label} enthält einen ungültigen Platzhalternamen.`);
  }
  if (new Set(names).size !== names.length) throw new TypeError(`${label} enthält einen Platzhalter doppelt.`);
  return names;
}

/** @param {PromptTemplateContract} input */
function createContract(input = {}) {
  const required = uniqueNames(input.requiredPlaceholders ?? [], "requiredPlaceholders");
  const optional = uniqueNames(input.optionalPlaceholders ?? [], "optionalPlaceholders");
  const duplicate = optional.find((name) => required.includes(name));
  if (duplicate) throw new TypeError(`Platzhalter „${duplicate}“ ist zugleich erforderlich und optional.`);
  return Object.freeze({
    requiredPlaceholders: Object.freeze(required),
    optionalPlaceholders: Object.freeze(optional),
    allowedPlaceholders: Object.freeze([...required, ...optional]),
  });
}

/** @param {string} template */
export function findPromptPlaceholders(template) {
  if (typeof template !== "string") throw new TypeError("Das Prompt-Template muss Text sein.");
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}

/**
 * Validates syntax and the complete placeholder contract. A placeholder may
 * occur only once, which keeps prompt versions reviewable and deterministic.
 */
/** @param {string} template @param {PromptTemplateContract} contractInput */
export function validatePromptTemplate(template, contractInput = {}) {
  const contract = createContract(contractInput);
  const placeholders = findPromptPlaceholders(template);
  const withoutValidPlaceholders = template.replace(PLACEHOLDER_PATTERN, "");
  if (/\{\{|\}\}/.test(withoutValidPlaceholders)) {
    throw new Error("Das Prompt-Template enthält einen fehlerhaft formatierten Platzhalter.");
  }
  const duplicates = placeholders.filter((name, index) => placeholders.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Das Prompt-Template enthält den Platzhalter „${duplicates[0]}“ mehrfach.`);
  }
  const unknown = placeholders.find((name) => !contract.allowedPlaceholders.includes(name));
  if (unknown) throw new Error(`Das Prompt-Template enthält den unbekannten Platzhalter „${unknown}“.`);
  const missing = contract.requiredPlaceholders.find((name) => !placeholders.includes(name));
  if (missing) throw new Error(`Im Prompt-Template fehlt der erforderliche Platzhalter „${missing}“.`);
  return Object.freeze({
    ...contract,
    placeholders: Object.freeze(placeholders),
  });
}

/** Replaces only placeholders declared by the validated template contract. */
/**
 * @param {string} template
 * @param {Record<string, unknown>} values
 * @param {PromptTemplateContract} contractInput
 */
export function renderPromptTemplate(template, values, contractInput = {}) {
  const validation = validatePromptTemplate(template, contractInput);
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new TypeError("Promptwerte müssen als Objekt übergeben werden.");
  }
  const unknownValue = Object.keys(values).find((name) => !validation.allowedPlaceholders.includes(name));
  if (unknownValue) throw new Error(`Für den unbekannten Platzhalter „${unknownValue}“ wurde ein Wert übergeben.`);
  const missingValue = validation.placeholders.find((name) => !Object.hasOwn(values, name));
  if (missingValue) throw new Error(`Für den Platzhalter „${missingValue}“ fehlt ein Wert.`);
  return template.replace(PLACEHOLDER_PATTERN, (_match, name) => String(values[name]));
}

/** Creates a small immutable engine for one explicit placeholder contract. */
/** @param {PromptTemplateContract} contractInput */
export function createTemplateEngine(contractInput = {}) {
  const contract = createContract(contractInput);
  return Object.freeze({
    render: (template, values) => renderPromptTemplate(template, values, contract),
    validate: (template) => validatePromptTemplate(template, contract),
  });
}
