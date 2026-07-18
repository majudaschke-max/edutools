// @ts-check

/**
 * @typedef {object} ImportAdapter
 * @property {string} id
 * @property {number} version
 * @property {readonly string[]} acceptedKinds
 * @property {(input: unknown) => boolean} canHandle
 * @property {(input: unknown, limits?: object) => object} decode
 * @property {(decoded: object, context?: object) => object} adapt
 */

function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw new TypeError("Ein Importadapter muss ein Objekt sein.");
  }
  if (!String(adapter.id ?? "").trim()) throw new TypeError("Ein Importadapter benötigt eine ID.");
  if (!Number.isInteger(adapter.version) || adapter.version < 1) {
    throw new TypeError(`Importadapter „${adapter.id}“ benötigt eine positive Version.`);
  }
  if (!Array.isArray(adapter.acceptedKinds) || adapter.acceptedKinds.length === 0) {
    throw new TypeError(`Importadapter „${adapter.id}“ benötigt mindestens eine Eingabeart.`);
  }
  for (const method of ["canHandle", "decode", "adapt"]) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`Importadapter „${adapter.id}“ benötigt ${method}().`);
    }
  }
}

/**
 * Registry is injected into the orchestrator. Adding a source therefore does
 * not require a switch statement or changes to the orchestrator itself.
 *
 * @param {readonly ImportAdapter[]} adapters
 */
export function createImportAdapterRegistry(adapters) {
  if (!Array.isArray(adapters) || adapters.length === 0) {
    throw new TypeError("Mindestens ein Importadapter ist erforderlich.");
  }
  const byId = new Map();
  adapters.forEach((adapter) => {
    assertAdapter(adapter);
    if (byId.has(adapter.id)) throw new TypeError(`Importadapter-ID „${adapter.id}“ kommt mehrfach vor.`);
    byId.set(adapter.id, adapter);
  });

  function get(adapterId) {
    return byId.get(adapterId) ?? null;
  }

  function resolve(input, adapterId = "") {
    if (adapterId) {
      const adapter = get(adapterId);
      if (!adapter) throw new Error(`Der Importadapter „${adapterId}“ ist nicht registriert.`);
      if (!adapter.canHandle(input)) throw new Error(`Der Importadapter „${adapterId}“ unterstützt diese Eingabe nicht.`);
      return adapter;
    }
    const matches = [...byId.values()].filter((adapter) => adapter.canHandle(input));
    if (matches.length === 0) throw new Error("Für diese Importquelle wurde kein Adapter gefunden.");
    if (matches.length > 1) throw new Error("Die Importquelle ist mehrdeutig. Wähle den Importtyp ausdrücklich aus.");
    return matches[0];
  }

  function list() {
    return [...byId.values()].map((adapter) => Object.freeze({
      id: adapter.id,
      version: adapter.version,
      acceptedKinds: Object.freeze([...adapter.acceptedKinds]),
    }));
  }

  return Object.freeze({ get, list, resolve });
}

