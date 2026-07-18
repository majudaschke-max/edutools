/**
 * Fehlerklasse für verständliche Validierungsfehler in geladenen Fachdaten.
 */
export class DataValidationError extends Error {
  /**
   * @param {string} message Verständliche Zusammenfassung des Fehlers.
   * @param {string[]} [issues] Einzelne Hinweise zu ungültigen Feldern.
   */
  constructor(message, issues = []) {
    super(message);
    this.name = "DataValidationError";
    this.issues = Array.isArray(issues) ? [...issues] : [String(issues)];
  }
}

/**
 * Prüft, ob ein Wert ein einfaches Objekt und kein Array ist.
 *
 * @param {unknown} value Zu prüfender Wert.
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Prüft, ob ein Wert ein nicht leerer String ist.
 *
 * @param {unknown} value Zu prüfender Wert.
 * @returns {value is string}
 */
export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Lädt eine JSON-Ressource und übersetzt technische Fehler in verständliche Meldungen.
 *
 * @param {string} url URL der JSON-Ressource.
 * @param {string} [resourceLabel="JSON-Ressource"] Bezeichnung für Fehlermeldungen.
 * @returns {Promise<unknown>} Geparste JSON-Daten.
 */
export async function loadJsonResource(url, resourceLabel = "JSON-Ressource") {
  let response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error(`${resourceLabel} konnte nicht geladen werden.`);
  }

  if (!response.ok) {
    throw new Error(`${resourceLabel} konnte nicht geladen werden.`);
  }

  try {
    return await response.json();
  } catch {
    throw new DataValidationError(
      `${resourceLabel} enthält kein gültiges JSON.`,
    );
  }
}

/**
 * Liefert einen validierten, getrimmten Bezeichner oder wirft einen klaren Fehler.
 *
 * @param {unknown} value Zu prüfender Bezeichner.
 * @param {string} [label="Wert"] Feldbezeichnung für die Fehlermeldung.
 * @returns {string}
 */
export function assertNonEmptyString(value, label = "Wert") {
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${label} muss ein nicht leerer String sein.`);
  }

  return value.trim();
}

/**
 * Normalisiert einen Zeitpunkt als ISO-8601-String.
 *
 * @param {Date|string|number} [value=new Date()] Zu normalisierender Zeitpunkt.
 * @returns {string}
 */
export function toIsoTimestamp(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Der Zeitpunkt ist ungültig.");
  }

  return date.toISOString();
}

/**
 * Prüft einen gespeicherten Zeitstempel auf ein parsebares Datumsformat.
 *
 * @param {unknown} value Zu prüfender Wert.
 * @returns {value is string}
 */
export function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

