// @ts-check

import { promptRegistry } from "./prompt-registry.js?v=4.0.5";
import { validatePromptTemplate } from "./template-engine.js";

/**
 * @typedef {object} RegisteredPrompt
 * @property {string} type
 * @property {string} version
 * @property {URL} resource
 * @property {string} integrity
 * @property {readonly string[]} requiredPlaceholders
 * @property {readonly string[]} optionalPlaceholders
 */

/**
 * @typedef {object} PromptLoaderOptions
 * @property {{get(type: string, version?: string): RegisteredPrompt}=} registry
 * @property {(resource: URL) => Promise<string>=} readText
 * @property {(text: string) => Promise<string>=} digest
 * @property {typeof fetch=} fetch
 */

/** @param {ArrayBuffer} buffer */
function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/** @param {string} text @param {Crypto=} cryptoObject */
export async function sha256PromptText(text, cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.subtle?.digest !== "function" || typeof TextEncoder !== "function") {
    throw new Error("SHA-256-Prüfung ist in dieser Umgebung nicht verfügbar.");
  }
  const digest = await cryptoObject.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(digest);
}

/** @param {URL} resource @param {{fetch?: typeof fetch}} dependencies */
async function readPromptResource(resource, dependencies = {}) {
  const fetchFunction = dependencies.fetch ?? globalThis.fetch;
  if (typeof fetchFunction !== "function") throw new Error("Lokale Promptressourcen können nicht geladen werden.");
  if (globalThis.location?.origin && resource.origin !== globalThis.location.origin) {
    throw new Error("Promptressourcen müssen aus derselben EduTools-Auslieferung stammen.");
  }
  const response = await fetchFunction(resource);
  if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "Fehler"}`);
  return response.text();
}

/** @param {string} value */
function normalizeLoadedTemplate(value) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

/** Loads, verifies and caches immutable versioned prompt resources. */
/** @param {PromptLoaderOptions} options */
export function createPromptLoader(options = {}) {
  const registry = options.registry ?? promptRegistry;
  const readText = options.readText ?? ((resource) => readPromptResource(resource, options));
  const digest = options.digest ?? sha256PromptText;
  const cache = new Map();

  /** @param {string} type @param {string=} version */
  async function load(type, version = "") {
    const definition = registry.get(type, version);
    const key = `${definition.type}\u0000${definition.version}`;
    if (cache.has(key)) return cache.get(key);
    const loading = (async () => {
      let rawTemplate;
      try {
        rawTemplate = await readText(definition.resource);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Promptdatei „${definition.type}/${definition.version}“ konnte nicht geladen werden: ${reason}`);
      }
      if (typeof rawTemplate !== "string" || !rawTemplate.trim()) {
        throw new Error(`Promptdatei „${definition.type}/${definition.version}“ ist leer.`);
      }
      const actualIntegrity = `sha256-${await digest(rawTemplate)}`;
      if (actualIntegrity !== definition.integrity) {
        throw new Error(`Integritätsprüfung für Prompt „${definition.type}/${definition.version}“ ist fehlgeschlagen.`);
      }
      const template = normalizeLoadedTemplate(rawTemplate);
      const validation = validatePromptTemplate(template, definition);
      return Object.freeze({
        type: definition.type,
        version: definition.version,
        integrity: definition.integrity,
        resource: definition.resource,
        template,
        requiredPlaceholders: definition.requiredPlaceholders,
        optionalPlaceholders: definition.optionalPlaceholders,
        placeholders: validation.placeholders,
      });
    })();
    cache.set(key, loading);
    try {
      return await loading;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }

  function clear() {
    cache.clear();
  }

  return Object.freeze({ clear, load });
}

export const promptLoader = createPromptLoader();
