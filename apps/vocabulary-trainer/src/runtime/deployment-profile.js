import { loadJsonResource } from "../core/utils.js";

export const RUNTIME_PROFILE_URL = "./runtime/deployment-profile.json";

function buildVersionedRuntimeProfileUrl() {
  const buildHash = globalThis.document?.documentElement?.dataset?.buildHash;
  return buildHash ? `${RUNTIME_PROFILE_URL}?build=${encodeURIComponent(buildHash)}` : RUNTIME_PROFILE_URL;
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Laufzeitprofil: ${field} fehlt.`);
  }
  return value.trim();
}

/** Performs the small defensive validation needed in the already built app. */
export function validateRuntimeDeploymentProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Laufzeitprofil: Das Profil muss ein Objekt sein.");
  }
  if (input.schemaVersion !== 1) {
    throw new TypeError("Laufzeitprofil: schemaVersion muss 1 sein.");
  }
  if (!new Set(["author", "learner"]).has(input.mode)) {
    throw new TypeError("Laufzeitprofil: mode ist ungültig.");
  }
  const profileId = requireText(input.profileId, "profileId");
  const deploymentId = requireText(input.deploymentId, "deploymentId");
  const buildHash = typeof input.buildHash === "string" && /^[a-f0-9]{64}$/.test(input.buildHash)
    ? input.buildHash
    : null;
  const title = requireText(input.app?.title, "app.title");
  const shortTitle = requireText(input.app?.shortTitle, "app.shortTitle");
  const description = requireText(input.app?.description, "app.description");
  const language = requireText(input.app?.language, "app.language");
  const defaultRoute = requireText(input.app?.defaultRoute, "app.defaultRoute");
  if (!/^#\/[a-z0-9-]+$/i.test(defaultRoute)) {
    throw new TypeError("Laufzeitprofil: app.defaultRoute ist ungültig.");
  }
  let course = null;
  let courseCatalog = null;
  if (input.mode === "learner") {
    const hasCourse = input.course != null;
    const hasCatalog = input.courseCatalog != null;
    if (hasCourse === hasCatalog) {
      throw new TypeError("Laufzeitprofil: Genau course oder courseCatalog muss angegeben sein.");
    }
    if (hasCourse) {
      course = Object.freeze({
        id: requireText(input.course?.id, "course.id"),
        file: requireText(input.course?.file, "course.file"),
      });
    } else {
      courseCatalog = Object.freeze({
        file: requireText(input.courseCatalog?.file, "courseCatalog.file"),
      });
    }
  } else if (input.course != null || input.courseCatalog != null) {
    throw new TypeError("Laufzeitprofil: Author-Profile dürfen keinen veröffentlichten Kurs enthalten.");
  }
  const deliveryType = input.delivery?.type ?? "standalone";
  if (!new Set(["standalone", "scorm12"]).has(deliveryType)) {
    throw new TypeError("Laufzeitprofil: delivery.type ist ungültig.");
  }
  let delivery;
  if (deliveryType === "scorm12") {
    delivery = Object.freeze({
      type: "scorm12",
      packageId: requireText(input.delivery?.packageId, "delivery.packageId"),
      file: requireText(input.delivery?.file, "delivery.file"),
    });
  } else {
    delivery = Object.freeze({ type: "standalone" });
  }

  return Object.freeze({
    schemaVersion: 1,
    profileId,
    deploymentId,
    buildHash,
    mode: input.mode,
    app: Object.freeze({ title, shortTitle, description, language, defaultRoute }),
    course,
    courseCatalog,
    features: Object.freeze({
      motivation: input.features?.motivation === true,
      pronunciation: input.features?.pronunciation === true,
      speedChallenge: input.features?.speedChallenge === true,
      courseLibrary: input.features?.courseLibrary === true,
      courseBuilder: input.features?.courseBuilder === true,
      importExport: input.features?.importExport === true,
      bookCapture: input.features?.bookCapture === true,
    }),
    delivery,
  });
}

export async function loadDeploymentProfile(url = buildVersionedRuntimeProfileUrl()) {
  const raw = await loadJsonResource(url, "Laufzeitprofil");
  return validateRuntimeDeploymentProfile(raw);
}

export function applyDeploymentMetadata(documentRoot, profile) {
  documentRoot.documentElement.lang = profile.app.language;
  const description = documentRoot.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", profile.app.description);
  const appTitle = documentRoot.querySelector("[data-app-title]");
  if (appTitle) appTitle.textContent = profile.app.shortTitle;
}
