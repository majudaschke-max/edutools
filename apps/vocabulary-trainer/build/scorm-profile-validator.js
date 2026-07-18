import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { validatePublicationProfile } from "./build-profile-validator.js";
import {
  SCORM_COMPLETION_POLICIES,
  SCORM_PROFILE_KEYS,
  SCORM_PROFILE_SCHEMA_VERSION,
} from "./scorm-profile-schema.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export class ScormProfileError extends Error {
  constructor(name, field, message) {
    super(`SCORM-Profil „${name}", Feld „${field}": ${message}`);
    this.name = "ScormProfileError";
    this.field = field;
  }
}

function fail(name, field, message) { throw new ScormProfileError(name, field, message); }
function object(value, name, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(name, field, "muss ein Objekt sein.");
  return value;
}
function text(value, name, field) {
  if (typeof value !== "string" || !value.trim()) fail(name, field, "muss als nicht leerer Text angegeben sein.");
  return value.trim();
}
function rejectUnknown(value, allowed, name, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(name, `${field}.${key}`, "ist kein unterstütztes Feld.");
}

function resolveRepositoryFile(value, options) {
  const raw = text(value, options.name, options.field);
  if (path.isAbsolute(raw) || raw.includes("?") || raw.includes("#") || raw.split(/[\\/]+/).includes("..")) {
    fail(options.name, options.field, "muss ein relativer Projektpfad ohne Traversal, Query oder Hash sein.");
  }
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolute = path.resolve(options.repositoryRoot, normalized);
  const relative = path.relative(options.repositoryRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(options.name, options.field, "muss innerhalb des Repositorys liegen.");
  }
  return { value: `./${normalized}`, absolute };
}

export function validatePrivateScormOutput(rawPath, options) {
  const resolved = resolveRepositoryFile(rawPath, options);
  const privateRoot = path.join(options.repositoryRoot, "dist/private-scorm");
  const relative = path.relative(privateRoot, resolved.absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(options.name, options.field, "muss innerhalb von dist/private-scorm liegen.");
  }
  if (!resolved.absolute.endsWith(".scorm.zip")) fail(options.name, options.field, "muss auf .scorm.zip enden.");
  return resolved;
}

export async function loadAndValidateScormProfile(profilePath, options = {}) {
  let raw;
  try { raw = JSON.parse(await readFile(profilePath, "utf8")); }
  catch (error) { throw new Error(`SCORM-Profil „${path.basename(profilePath)}" konnte nicht geladen werden: ${error.message}`); }
  return validateScormProfile(raw, { ...options, profilePath });
}

export async function validateScormProfile(raw, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const fallback = options.profilePath ? path.basename(options.profilePath) : "unbenannt";
  const root = object(raw, fallback, "profile");
  const name = typeof root.packageId === "string" && root.packageId.trim() ? root.packageId.trim() : fallback;
  rejectUnknown(root, SCORM_PROFILE_KEYS.root, name, "profile");
  if (root.schemaVersion !== SCORM_PROFILE_SCHEMA_VERSION) fail(name, "schemaVersion", `muss ${SCORM_PROFILE_SCHEMA_VERSION} sein.`);
  const packageId = text(root.packageId, name, "packageId");
  if (!ID_PATTERN.test(packageId)) fail(name, "packageId", "darf nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten.");
  if (root.distribution !== "private-classroom") fail(name, "distribution", "muss „private-classroom“ sein.");

  const scormRaw = object(root.scorm, name, "scorm");
  rejectUnknown(scormRaw, SCORM_PROFILE_KEYS.scorm, name, "scorm");
  if (scormRaw.version !== "1.2") fail(name, "scorm.version", "unterstützt ausschließlich SCORM 1.2.");
  const completionPolicy = text(scormRaw.completionPolicy, name, "scorm.completionPolicy");
  if (!SCORM_COMPLETION_POLICIES.includes(completionPolicy)) fail(name, "scorm.completionPolicy", "ist nicht unterstützt.");
  const scorm = Object.freeze({
    version: "1.2",
    title: text(scormRaw.title, name, "scorm.title"),
    organizationTitle: text(scormRaw.organizationTitle, name, "scorm.organizationTitle"),
    completionPolicy,
  });

  const learnerProfilePath = resolveRepositoryFile(root.learnerProfile, {
    repositoryRoot, name, field: "learnerProfile",
  });
  try { if (!(await stat(learnerProfilePath.absolute)).isFile()) fail(name, "learnerProfile", "muss eine Datei sein."); }
  catch (error) { if (error instanceof ScormProfileError) throw error; fail(name, "learnerProfile", "existiert nicht."); }
  let learnerRaw;
  try { learnerRaw = JSON.parse(await readFile(learnerProfilePath.absolute, "utf8")); }
  catch (error) { fail(name, "learnerProfile", `konnte nicht geladen werden (${error.message}).`); }
  let learner;
  try {
    learner = await validatePublicationProfile(learnerRaw, {
      repositoryRoot,
      profilePath: learnerProfilePath.absolute,
    });
  } catch (error) { fail(name, "learnerProfile", error.message); }
  if (learner.profile.mode !== "learner") fail(name, "learnerProfile", "muss ein Learner-Profil referenzieren.");
  for (const capability of ["courseBuilder", "courseLibrary", "importExport"]) {
    if (learner.profile.features[capability]) fail(name, `learnerProfile.features.${capability}`, "darf nicht aktiviert sein.");
  }

  const outputRaw = object(root.output, name, "output");
  rejectUnknown(outputRaw, SCORM_PROFILE_KEYS.output, name, "output");
  const output = validatePrivateScormOutput(outputRaw.file, { repositoryRoot, name, field: "output.file" });
  if (output.absolute === learner.paths.courseFile) fail(name, "output.file", "darf die Kursquelldatei nicht überschreiben.");

  return Object.freeze({
    profile: Object.freeze({
      schemaVersion: 1,
      packageId,
      learnerProfile: learnerProfilePath.value,
      distribution: "private-classroom",
      scorm,
      output: Object.freeze({ file: output.value }),
    }),
    learner,
    paths: Object.freeze({
      repositoryRoot,
      profileFile: path.resolve(options.profilePath ?? "scorm-profile.json"),
      learnerProfileFile: learnerProfilePath.absolute,
      outputFile: output.absolute,
    }),
  });
}

