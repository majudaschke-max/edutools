// @ts-check

import { IMPORT_PAYLOAD_KINDS } from "./import-draft.js";
import { createImportAdapterRegistry } from "./import-adapter-registry.js";
import { validateImportDraft } from "./import-draft-validator.js";
import { hasImportErrors } from "./import-issues.js";
import { normalizeImportDraft } from "./import-normalizer.js";

export const IMPORT_SESSION_VERSION = 1;
export const IMPORT_PLAN_VERSION = 1;

function normalizeHandlerMap(value = {}) {
  return Object.freeze({ ...value });
}

function assertPayload(candidate, adapterId) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError(`Importadapter „${adapterId}“ lieferte keinen Payload.`);
  }
  if (!IMPORT_PAYLOAD_KINDS.includes(candidate.payloadKind)) {
    throw new TypeError(`Importadapter „${adapterId}“ lieferte einen unbekannten Payload-Typ.`);
  }
  if (candidate.payloadKind === "content" && !("draft" in candidate)) {
    throw new TypeError(`Importadapter „${adapterId}“ lieferte keinen ImportDraft.`);
  }
  if (candidate.payloadKind === "restore" && !("candidate" in candidate)) {
    throw new TypeError(`Importadapter „${adapterId}“ lieferte keinen Restore-Kandidaten.`);
  }
}

/**
 * @param {{
 *   adapters: readonly object[],
 *   materializers?: Record<string, Function>,
 *   committers?: Record<string, Function>,
 *   normalizeDraft?: (draft: unknown) => unknown,
 *   validateDraft?: (draft: unknown, options?: object) => {valid: boolean, issues: object[]}
 * }} options
 */
export function createImportOrchestrator(options) {
  const registry = createImportAdapterRegistry(options.adapters);
  const materializers = normalizeHandlerMap(options.materializers);
  const committers = normalizeHandlerMap(options.committers);
  const normalizeDraft = options.normalizeDraft ?? normalizeImportDraft;
  const validateDraft = options.validateDraft ?? validateImportDraft;
  const committedPlans = new WeakSet();

  function prepareImport(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new TypeError("Ein ImportRequest muss ein Objekt sein.");
    }
    const adapter = registry.resolve(request.input, request.adapterId);
    const decoded = adapter.decode(request.input, request.limits ?? {});
    const adapted = adapter.adapt(decoded, request.context ?? {});
    assertPayload(adapted, adapter.id);
    const adapterIssues = [
      ...(Array.isArray(decoded?.issues) ? decoded.issues : []),
      ...(Array.isArray(adapted.issues) ? adapted.issues : []),
    ];
    const provenance = adapted.provenance ?? null;
    if (adapted.payloadKind === "content") {
      const draft = normalizeDraft(adapted.draft);
      const validation = validateDraft(draft, { provenance });
      const issues = Object.freeze([...adapterIssues, ...validation.issues]);
      return Object.freeze({
        sessionVersion: IMPORT_SESSION_VERSION,
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        payloadKind: "content",
        valid: !hasImportErrors(issues),
        payload: draft,
        provenance,
        issues,
      });
    }
    const issues = Object.freeze(adapterIssues);
    return Object.freeze({
      sessionVersion: IMPORT_SESSION_VERSION,
      adapterId: adapter.id,
      adapterVersion: adapter.version,
      payloadKind: "restore",
      valid: Boolean(adapted.candidate) && !hasImportErrors(issues),
      payload: adapted.candidate,
      provenance,
      issues,
    });
  }

  function createImportPlan(session, decisions = {}) {
    if (!session || session.sessionVersion !== IMPORT_SESSION_VERSION) {
      throw new TypeError("Die Import-Session ist ungültig.");
    }
    if (!session.valid) throw new Error("Eine fehlerhafte Import-Session kann nicht geplant werden.");
    return Object.freeze({
      planVersion: IMPORT_PLAN_VERSION,
      adapterId: session.adapterId,
      payloadKind: session.payloadKind,
      payload: session.payload,
      provenance: session.provenance,
      decisions: Object.freeze({ ...decisions }),
    });
  }

  function materializeImport(plan, context = {}) {
    if (!plan || plan.planVersion !== IMPORT_PLAN_VERSION) {
      throw new TypeError("Der ImportPlan ist ungültig.");
    }
    const materialize = materializers[plan.payloadKind];
    if (typeof materialize !== "function") {
      throw new Error(`Für den Payload-Typ „${plan.payloadKind}“ fehlt ein Materializer.`);
    }
    return materialize(plan, context);
  }

  function commitImport(plan, context = {}) {
    if (committedPlans.has(plan)) throw new Error("Dieser ImportPlan wurde bereits gespeichert.");
    const materialized = materializeImport(plan, context);
    const commit = committers[plan.payloadKind];
    if (typeof commit !== "function") {
      throw new Error(`Für den Payload-Typ „${plan.payloadKind}“ fehlt eine Speicherstrategie.`);
    }
    const result = commit(materialized, plan, context);
    committedPlans.add(plan);
    return result;
  }

  function getRegisteredAdapters() {
    return registry.list();
  }

  return Object.freeze({
    commitImport,
    createImportPlan,
    getRegisteredAdapters,
    materializeImport,
    prepareImport,
  });
}
