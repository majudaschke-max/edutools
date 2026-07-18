const API_NAME = "API";
const DEFAULT_MAX_DEPTH = 10;

function safeReadWindow(candidate, property) {
  try {
    return candidate?.[property] ?? null;
  } catch {
    return null;
  }
}

function findInChain(start, maximumDepth) {
  let current = start;
  const visited = new Set();
  for (let depth = 0; current && depth <= maximumDepth; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const api = safeReadWindow(current, API_NAME);
    if (api) return api;
    const parent = safeReadWindow(current, "parent");
    if (!parent || parent === current) break;
    current = parent;
  }
  return null;
}

/** Finds only the SCORM 1.2 API and never probes the SCORM 2004 API name. */
export function findScorm12Api(startWindow = globalThis.window, options = {}) {
  const maximumDepth = Number.isInteger(options.maxDepth) && options.maxDepth >= 0
    ? options.maxDepth
    : DEFAULT_MAX_DEPTH;
  const direct = findInChain(startWindow, maximumDepth);
  if (direct) return direct;
  const opener = safeReadWindow(startWindow, "opener");
  return opener ? findInChain(opener, maximumDepth) : null;
}

/** Allows a slowly initialized LMS player a short, bounded time to expose API. */
export async function waitForScorm12Api(startWindow = globalThis.window, options = {}) {
  const retries = Number.isInteger(options.retries) && options.retries >= 0
    ? options.retries
    : 4;
  const delayMs = Number.isFinite(options.delayMs) && options.delayMs >= 0
    ? options.delayMs
    : 50;
  const wait = options.wait ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const api = findScorm12Api(startWindow, options);
    if (api) return api;
    if (attempt < retries) await wait(delayMs);
  }
  return null;
}

function isSuccess(value) {
  return String(value).toLowerCase() === "true";
}

export function createScorm12ApiAdapter(api, options = {}) {
  const logger = options.logger ?? console;
  let initialized = false;
  let finished = false;
  let initializeAttempted = false;
  let finishAttempted = false;

  function diagnose(operation) {
    try {
      const code = String(api?.LMSGetLastError?.() ?? "");
      if (!code || code === "0") return;
      const message = String(api?.LMSGetErrorString?.(code) ?? "");
      const diagnostic = String(api?.LMSGetDiagnostic?.(code) ?? "");
      logger.error?.(`SCORM 1.2 ${operation} fehlgeschlagen.`, { code, message, diagnostic });
    } catch (error) {
      logger.error?.(`SCORM 1.2 ${operation} konnte nicht diagnostiziert werden.`, error);
    }
  }

  function booleanCall(name, value = "") {
    try {
      const result = api?.[name]?.(value);
      const ok = isSuccess(result);
      if (!ok) diagnose(name);
      return ok;
    } catch (error) {
      logger.error?.(`SCORM 1.2 ${name} war nicht verfügbar.`, error);
      return false;
    }
  }

  return Object.freeze({
    initialize() {
      if (initialized) return true;
      if (finished || initializeAttempted) return false;
      initializeAttempted = true;
      initialized = booleanCall("LMSInitialize");
      return initialized;
    },
    getValue(element) {
      if (!initialized || finished) return "";
      try {
        const value = String(api?.LMSGetValue?.(String(element)) ?? "");
        diagnose("LMSGetValue");
        return value;
      } catch (error) {
        logger.error?.("SCORM 1.2 LMSGetValue war nicht verfügbar.", error);
        return "";
      }
    },
    setValue(element, value) {
      if (!initialized || finished) return false;
      try {
        const ok = isSuccess(api?.LMSSetValue?.(String(element), String(value)));
        if (!ok) diagnose("LMSSetValue");
        return ok;
      } catch (error) {
        logger.error?.("SCORM 1.2 LMSSetValue war nicht verfügbar.", error);
        return false;
      }
    },
    commit() {
      return initialized && !finished ? booleanCall("LMSCommit") : false;
    },
    finish() {
      if (!initialized || finished) return finished;
      if (finishAttempted) return false;
      finishAttempted = true;
      const ok = booleanCall("LMSFinish");
      if (ok) finished = true;
      return ok;
    },
    isInitialized: () => initialized,
    isFinished: () => finished,
  });
}
