import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import {
  assertValidCourse,
} from "../src/course-library/course-validator.js";
import {
  rebuildCourseData,
} from "../src/course-library/course-schema.js";
import {
  AUTHOR_FEATURES,
  LEARNER_MANAGEMENT_FEATURES,
  PROFILE_KEYS,
  PUBLICATION_FEATURES,
  PUBLICATION_MODES,
  PUBLICATION_PROFILE_SCHEMA_VERSION,
} from "./build-profile-schema.js";

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const PUBLICATION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ROUTE_PATTERN = /^#\/[a-z0-9-]+$/;

export class PublicationProfileError extends Error {
  constructor(profileName, field, message) {
    super(`Profil „${profileName}“, Feld „${field}": ${message}`);
    this.name = "PublicationProfileError";
    this.profileName = profileName;
    this.field = field;
  }
}

function profileError(profileName, field, message) {
  throw new PublicationProfileError(profileName, field, message);
}

function requireObject(value, profileName, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    profileError(profileName, field, "muss ein Objekt sein.");
  }
  return value;
}

function requireText(value, profileName, field) {
  if (typeof value !== "string" || !value.trim()) {
    profileError(profileName, field, "muss als nicht leerer Text angegeben sein.");
  }
  return value.trim();
}

function rejectUnknownKeys(value, allowed, profileName, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      profileError(profileName, `${field}.${key}`, "ist kein unterstütztes Feld.");
    }
  }
}

function safeRepositoryPath(rawPath, options) {
  const value = requireText(rawPath, options.profileName, options.field);
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
    profileError(options.profileName, options.field, "darf weder absolut sein noch das Projektverzeichnis verlassen.");
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolute = path.resolve(options.repositoryRoot, normalized);
  const relative = path.relative(options.repositoryRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    profileError(options.profileName, options.field, "muss auf einen Pfad innerhalb des Projekts zeigen.");
  }
  return { value: `./${normalized}`, absolute, relative: relative.replace(/\\/g, "/") };
}

function normalizeFeatures(raw, mode, profileName) {
  const value = requireObject(raw, profileName, "features");
  rejectUnknownKeys(value, PROFILE_KEYS.features, profileName, "features");
  const features = Object.fromEntries(PUBLICATION_FEATURES.map((feature) => [
    feature,
    value[feature] === true,
  ]));
  for (const [feature, featureValue] of Object.entries(value)) {
    if (typeof featureValue !== "boolean") {
      profileError(profileName, `features.${feature}`, "muss true oder false sein.");
    }
  }
  if (mode === PUBLICATION_MODES.LEARNER) {
    for (const feature of LEARNER_MANAGEMENT_FEATURES) {
      if (features[feature]) {
        profileError(profileName, `features.${feature}`, "darf in einem Learner-Profil nicht aktiviert sein.");
      }
    }
  } else {
    for (const [feature, required] of Object.entries(AUTHOR_FEATURES)) {
      if (required && !features[feature]) {
        profileError(profileName, `features.${feature}`, "muss im vollständigen Author-Profil aktiviert sein.");
      }
    }
  }
  if (features.bookCapture) {
    profileError(profileName, "features.bookCapture", "ist seit Sprint 3.7 in allen Produktprofilen deaktiviert und muss false sein.");
  }
  return Object.freeze(features);
}

async function loadCourse(coursePath, profileName, field = "course.file") {
  let serialized;
  try {
    serialized = await readFile(coursePath, "utf8");
  } catch (error) {
    profileError(profileName, field, `konnte nicht gelesen werden (${error.code ?? "Dateifehler"}).`);
  }
  let raw;
  try {
    raw = JSON.parse(serialized);
  } catch {
    profileError(profileName, field, "enthält kein gültiges JSON.");
  }
  try {
    const course = rebuildCourseData(raw);
    assertValidCourse(course);
    return course;
  } catch (error) {
    profileError(profileName, field, error.message);
  }
}

async function requireCourseFile(rawFile, options) {
  const coursePath = safeRepositoryPath(rawFile, options);
  try {
    const courseStat = await stat(coursePath.absolute);
    if (!courseStat.isFile()) profileError(options.profileName, options.field, "muss eine Datei sein.");
  } catch (error) {
    if (error instanceof PublicationProfileError) throw error;
    profileError(options.profileName, options.field, "existiert nicht.");
  }
  const course = await loadCourse(coursePath.absolute, options.profileName, options.field);
  return Object.freeze({ path: coursePath, course });
}

export async function validatePublicationProfile(rawProfile, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const fallbackName = options.profilePath ? path.basename(options.profilePath) : "unbenannt";
  const root = requireObject(rawProfile, fallbackName, "profile");
  const profileName = typeof root.profileId === "string" && root.profileId.trim()
    ? root.profileId.trim()
    : fallbackName;
  rejectUnknownKeys(root, PROFILE_KEYS.root, profileName, "profile");
  if (root.schemaVersion !== PUBLICATION_PROFILE_SCHEMA_VERSION) {
    profileError(profileName, "schemaVersion", `muss ${PUBLICATION_PROFILE_SCHEMA_VERSION} sein.`);
  }
  const profileId = requireText(root.profileId, profileName, "profileId");
  const deploymentId = requireText(root.deploymentId, profileName, "deploymentId");
  for (const [field, value] of [["profileId", profileId], ["deploymentId", deploymentId]]) {
    if (!IDENTIFIER_PATTERN.test(value)) {
      profileError(profileName, field, "darf nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten.");
    }
  }
  if (!Object.values(PUBLICATION_MODES).includes(root.mode)) {
    profileError(profileName, "mode", "muss „author“ oder „learner“ sein.");
  }

  const rawApp = requireObject(root.app, profileName, "app");
  rejectUnknownKeys(rawApp, PROFILE_KEYS.app, profileName, "app");
  const app = Object.freeze({
    title: requireText(rawApp.title, profileName, "app.title"),
    shortTitle: requireText(rawApp.shortTitle, profileName, "app.shortTitle"),
    description: requireText(rawApp.description, profileName, "app.description"),
    language: requireText(rawApp.language, profileName, "app.language"),
    defaultRoute: requireText(rawApp.defaultRoute, profileName, "app.defaultRoute"),
  });
  if (!ROUTE_PATTERN.test(app.defaultRoute)) {
    profileError(profileName, "app.defaultRoute", "muss eine einfache Hash-Route wie #/dashboard sein.");
  }

  const features = normalizeFeatures(root.features, root.mode, profileName);
  if (app.defaultRoute === "#/speed" && !features.speedChallenge) {
    profileError(profileName, "app.defaultRoute", "verweist auf die deaktivierte Speed Challenge.");
  }

  const rawOutput = requireObject(root.output, profileName, "output");
  rejectUnknownKeys(rawOutput, PROFILE_KEYS.output, profileName, "output");
  const outputPath = safeRepositoryPath(rawOutput.directory, {
    repositoryRoot,
    profileName,
    field: "output.directory",
  });
  if (!outputPath.relative.startsWith("dist/")) {
    profileError(profileName, "output.directory", "muss innerhalb des Buildbereichs dist/ liegen.");
  }
  const basePath = rawOutput.basePath ?? "./";
  if (basePath !== "./") {
    profileError(profileName, "output.basePath", "unterstützt derzeit ausschließlich den robusten relativen Wert ./.");
  }

  let course = null;
  let coursePath = null;
  let catalog = null;
  if (root.mode === PUBLICATION_MODES.LEARNER) {
    const hasCourse = root.course !== undefined;
    const hasCatalog = root.courseCatalog !== undefined;
    if (hasCourse === hasCatalog) {
      profileError(
        profileName,
        hasCourse ? "courseCatalog" : "course",
        hasCourse
          ? "darf nicht gemeinsam mit course angegeben sein."
          : "oder courseCatalog muss für ein Learner-Profil angegeben sein.",
      );
    }
    if (hasCourse) {
      if (Array.isArray(root.course)) {
        profileError(profileName, "course", "muss genau eine Kursquelle als Objekt enthalten, kein Array.");
      }
      const rawCourse = requireObject(root.course, profileName, "course");
      rejectUnknownKeys(rawCourse, PROFILE_KEYS.course, profileName, "course");
      const loaded = await requireCourseFile(rawCourse.file, {
        repositoryRoot,
        profileName,
        field: "course.file",
      });
      coursePath = loaded.path;
      course = loaded.course;
    } else {
      const rawCatalog = requireObject(root.courseCatalog, profileName, "courseCatalog");
      rejectUnknownKeys(rawCatalog, PROFILE_KEYS.courseCatalog, profileName, "courseCatalog");
      if (!Array.isArray(rawCatalog.entries) || rawCatalog.entries.length === 0) {
        profileError(profileName, "courseCatalog.entries", "muss mindestens einen Browser-Kurs enthalten.");
      }
      const publicationIds = new Set();
      const courseIds = new Set();
      const entries = [];
      for (const [index, rawEntry] of rawCatalog.entries.entries()) {
        const field = `courseCatalog.entries[${index}]`;
        const entry = requireObject(rawEntry, profileName, field);
        rejectUnknownKeys(entry, PROFILE_KEYS.courseCatalogEntry, profileName, field);
        const publicationId = requireText(entry.publicationId, profileName, `${field}.publicationId`);
        if (!PUBLICATION_ID_PATTERN.test(publicationId)) {
          profileError(
            profileName,
            `${field}.publicationId`,
            "darf nur Kleinbuchstaben, Ziffern und innere Bindestriche enthalten.",
          );
        }
        if (publicationIds.has(publicationId)) {
          profileError(profileName, `${field}.publicationId`, "kommt im Browser-Katalog mehrfach vor.");
        }
        publicationIds.add(publicationId);
        const loaded = await requireCourseFile(entry.file, {
          repositoryRoot,
          profileName,
          field: `${field}.file`,
        });
        if (courseIds.has(loaded.course.id)) {
          profileError(
            profileName,
            `${field}.file`,
            `verwendet die Kurs-ID „${loaded.course.id}“ mehrfach im Browser-Katalog.`,
          );
        }
        courseIds.add(loaded.course.id);
        entries.push(Object.freeze({
          publicationId,
          file: loaded.path.value,
          absoluteFile: loaded.path.absolute,
          course: loaded.course,
        }));
      }
      catalog = Object.freeze({ entries: Object.freeze(entries) });
    }
  } else if (root.course !== undefined || root.courseCatalog !== undefined) {
    profileError(
      profileName,
      root.course !== undefined ? "course" : "courseCatalog",
      "wird im Author-Profil nicht fest vorgegeben.",
    );
  }

  const profile = Object.freeze({
    schemaVersion: PUBLICATION_PROFILE_SCHEMA_VERSION,
    profileId,
    deploymentId,
    mode: root.mode,
    app,
    course: coursePath ? Object.freeze({ file: coursePath.value }) : null,
    courseCatalog: catalog
      ? Object.freeze({
        entries: Object.freeze(catalog.entries.map((entry) => Object.freeze({
          publicationId: entry.publicationId,
          file: entry.file,
        }))),
      })
      : null,
    features,
    output: Object.freeze({ directory: outputPath.value, basePath }),
  });
  return Object.freeze({ profile, course, catalog, paths: Object.freeze({
    repositoryRoot,
    outputDirectory: outputPath.absolute,
    courseFile: coursePath?.absolute ?? null,
    courseFiles: Object.freeze(catalog?.entries.map((entry) => entry.absoluteFile) ?? []),
  }) });
}

export function validateProfileIdentities(profiles) {
  for (const field of ["profileId", "deploymentId"]) {
    const seen = new Set();
    for (const profile of profiles) {
      if (seen.has(profile[field])) {
        profileError(profile.profileId, field, "kommt in der Profilmenge mehrfach vor.");
      }
      seen.add(profile[field]);
    }
  }
  return true;
}
