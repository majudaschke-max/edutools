import { loadJsonResource } from "../core/utils.js";
import {
  createDeploymentStorageKey,
  loadJson,
  saveJson,
} from "../core/storage.js";
import { loadPublishedCourseContext } from "./published-course.js";

const PUBLICATION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const CATALOG_KEYS = new Set(["schemaVersion", "deploymentId", "courses"]);
const ENTRY_KEYS = new Set([
  "publicationId",
  "courseId",
  "contentVersion",
  "title",
  "subtitle",
  "languages",
  "file",
]);
const LANGUAGES_KEYS = new Set(["source", "target"]);
const LANGUAGE_KEYS = new Set(["code", "label"]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} muss ein Objekt sein.`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} fehlt.`);
  }
  return value.trim();
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label}.${key} ist nicht unterstützt.`);
  }
}

function languageSummary(value, label) {
  const language = requireObject(value, label);
  rejectUnknownKeys(language, LANGUAGE_KEYS, label);
  return Object.freeze({
    code: requireText(language.code, `${label}.code`),
    label: requireText(language.label, `${label}.label`),
  });
}

function safeCatalogFile(value, label) {
  const file = requireText(value, label);
  if (
    /^(?:[a-z]+:|\/)/i.test(file)
    || file.includes("..")
    || !/^\.\/[a-z0-9][a-z0-9-]*\.json(?:\?build=[a-f0-9]{16})?$/u.test(file)
  ) {
    throw new TypeError(`${label} muss eine sichere relative JSON-Datei sein.`);
  }
  return file;
}

/** Validates the small generated catalog independently from canonical courses. */
export function validatePublishedCourseCatalog(input, expectedDeploymentId) {
  const root = requireObject(input, "Browser-Katalog");
  rejectUnknownKeys(root, CATALOG_KEYS, "Browser-Katalog");
  if (root.schemaVersion !== 1) throw new TypeError("Browser-Katalog.schemaVersion muss 1 sein.");
  const deploymentId = requireText(root.deploymentId, "Browser-Katalog.deploymentId");
  if (deploymentId !== expectedDeploymentId) {
    throw new TypeError("Browser-Katalog gehört nicht zum aktuellen Deployment.");
  }
  if (!Array.isArray(root.courses) || root.courses.length === 0) {
    throw new TypeError("Browser-Katalog benötigt mindestens einen Kurs.");
  }
  const publicationIds = new Set();
  const courseIds = new Set();
  const courses = root.courses.map((rawEntry, index) => {
    const label = `Browser-Katalog.courses[${index}]`;
    const entry = requireObject(rawEntry, label);
    rejectUnknownKeys(entry, ENTRY_KEYS, label);
    const publicationId = requireText(entry.publicationId, `${label}.publicationId`);
    if (!PUBLICATION_ID_PATTERN.test(publicationId)) {
      throw new TypeError(`${label}.publicationId ist ungültig.`);
    }
    if (publicationIds.has(publicationId)) {
      throw new TypeError(`Browser-Katalog enthält publicationId „${publicationId}“ mehrfach.`);
    }
    publicationIds.add(publicationId);
    const courseId = requireText(entry.courseId, `${label}.courseId`);
    if (courseIds.has(courseId)) {
      throw new TypeError(`Browser-Katalog enthält Kurs-ID „${courseId}“ mehrfach.`);
    }
    courseIds.add(courseId);
    if (!Number.isInteger(entry.contentVersion) || entry.contentVersion < 1) {
      throw new TypeError(`${label}.contentVersion muss eine positive ganze Zahl sein.`);
    }
    const languages = requireObject(entry.languages, `${label}.languages`);
    rejectUnknownKeys(languages, LANGUAGES_KEYS, `${label}.languages`);
    return Object.freeze({
      publicationId,
      courseId,
      contentVersion: entry.contentVersion,
      title: requireText(entry.title, `${label}.title`),
      subtitle: typeof entry.subtitle === "string" ? entry.subtitle.trim() : "",
      languages: Object.freeze({
        source: languageSummary(languages.source, `${label}.languages.source`),
        target: languageSummary(languages.target, `${label}.languages.target`),
      }),
      file: safeCatalogFile(entry.file, `${label}.file`),
    });
  });
  return Object.freeze({ schemaVersion: 1, deploymentId, courses: Object.freeze(courses) });
}

export async function loadPublishedCourseCatalog(profile, options = {}) {
  const load = options.loadJson ?? loadJsonResource;
  const baseUrl = options.baseUrl
    ?? globalThis.document?.baseURI
    ?? globalThis.location?.href;
  const catalogUrl = new URL(profile.courseCatalog.file, baseUrl);
  const raw = await load(catalogUrl, "Browser-Kurskatalog");
  return validatePublishedCourseCatalog(raw, profile.deploymentId);
}

export function getRequestedPublicationId(locationObject = globalThis.location) {
  const params = new URLSearchParams(locationObject?.search ?? "");
  if (!params.has("course")) return Object.freeze({ explicit: false, publicationId: null });
  const publicationId = params.get("course")?.trim() ?? "";
  return Object.freeze({ explicit: true, publicationId: publicationId || null });
}

export function createPublishedCourseUrl(baseUrl, publicationId, route = "/dashboard") {
  if (!PUBLICATION_ID_PATTERN.test(publicationId)) throw new TypeError("publicationId ist ungültig.");
  const url = new URL(baseUrl);
  url.searchParams.set("course", publicationId);
  url.hash = `#${route.startsWith("/") ? route : `/${route}`}`;
  return url.href;
}

export function createPublishedCourseSelectionUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.delete("course");
  url.hash = "#/course-select";
  return url.href;
}

export function loadLastPublishedCourseId() {
  const value = loadJson(createDeploymentStorageKey("selected-browser-course"), null);
  return typeof value === "string" && PUBLICATION_ID_PATTERN.test(value) ? value : null;
}

export function saveLastPublishedCourseId(publicationId) {
  if (!PUBLICATION_ID_PATTERN.test(publicationId)) return false;
  return saveJson(createDeploymentStorageKey("selected-browser-course"), publicationId);
}

/** Loads one catalog entry and verifies that catalog metadata cannot drift. */
export async function loadPublishedCatalogCourseContext(profile, catalog, publicationId, options = {}) {
  const entry = catalog.courses.find((candidate) => candidate.publicationId === publicationId);
  if (!entry) return null;
  const pageBaseUrl = options.baseUrl
    ?? globalThis.document?.baseURI
    ?? globalThis.location?.href;
  const catalogBaseUrl = new URL(profile.courseCatalog.file, pageBaseUrl);
  const context = await loadPublishedCourseContext({
    course: { id: entry.courseId, file: entry.file },
  }, { ...options, baseUrl: catalogBaseUrl });
  const { course } = context;
  if (
    course.contentVersion !== entry.contentVersion
    || course.title !== entry.title
    || course.languages.source.code !== entry.languages.source.code
    || course.languages.target.code !== entry.languages.target.code
  ) {
    throw new TypeError(`Browser-Kurs „${entry.publicationId}“ stimmt nicht mit dem Katalog überein.`);
  }
  return Object.freeze({ ...context, publication: entry });
}
