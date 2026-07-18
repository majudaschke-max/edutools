// @ts-check

/**
 * @typedef {"error" | "warning" | "info"} ImportIssueSeverity
 * @typedef {"decode" | "structure" | "content" | "duplicate" | "commit"} ImportIssuePhase
 * @typedef {object} ImportIssueLocation
 * @property {number=} unitIndex
 * @property {number=} wordIndex
 * @property {number=} line
 * @typedef {object} ImportIssue
 * @property {string} code
 * @property {ImportIssueSeverity} severity
 * @property {ImportIssuePhase} phase
 * @property {string} path
 * @property {ImportIssueLocation} location
 * @property {string} message
 * @property {string} action
 */

const SEVERITIES = new Set(["error", "warning", "info"]);
const PHASES = new Set(["decode", "structure", "content", "duplicate", "commit"]);

/**
 * @param {Partial<ImportIssue> & {code: string, message: string}} input
 * @returns {Readonly<ImportIssue>}
 */
export function createImportIssue(input) {
  const severity = SEVERITIES.has(input.severity) ? input.severity : "error";
  const phase = PHASES.has(input.phase) ? input.phase : "content";
  return Object.freeze({
    code: String(input.code),
    severity: /** @type {ImportIssueSeverity} */ (severity),
    phase: /** @type {ImportIssuePhase} */ (phase),
    path: String(input.path ?? ""),
    location: Object.freeze({ ...(input.location ?? {}) }),
    message: String(input.message),
    action: String(input.action ?? ""),
  });
}

/** @param {readonly ImportIssue[]} issues */
export function hasImportErrors(issues) {
  return issues.some((issue) => issue.severity === "error");
}

/**
 * Converts structured issues at a compatibility boundary into the exception
 * shape used by existing import callers.
 *
 * @param {readonly ImportIssue[]} issues
 * @param {string} fallbackMessage
 * @returns {Error}
 */
export function createImportError(issues, fallbackMessage = "Der Import ist ungültig.") {
  const errors = issues.filter((issue) => issue.severity === "error");
  const message = errors.map((issue) => issue.message).filter(Boolean).join(" ") || fallbackMessage;
  const canonicalOnly = errors.length > 0 && errors.every((issue) => issue.code.startsWith("canonical."));
  const error = canonicalOnly
    ? new TypeError(`Kursdaten sind ungültig: ${message}`)
    : new Error(message);
  error.issues = errors.map((issue) => issue.message);
  return error;
}

