import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { validatePublicationProfile, validateProfileIdentities } from "./build-profile-validator.js";
import { DEPLOYMENT_SET_KEYS, DEPLOYMENT_SET_SCHEMA_VERSION } from "./deployment-set-schema.js";

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const MOUNT_PATTERN = /^(?:[a-z0-9][a-z0-9._-]*)(?:\/[a-z0-9][a-z0-9._-]*)*$/;

export class DeploymentSetError extends Error {
  constructor(deploymentName, field, message) {
    super(`Deployment-Satz „${deploymentName}", Feld „${field}": ${message}`);
    this.name = "DeploymentSetError";
    this.deploymentName = deploymentName;
    this.field = field;
  }
}

function fail(name, field, message) {
  throw new DeploymentSetError(name, field, message);
}

function requireObject(value, name, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(name, field, "muss ein Objekt sein.");
  }
  return value;
}

function requireText(value, name, field) {
  if (typeof value !== "string" || !value.trim()) fail(name, field, "muss als nicht leerer Text angegeben sein.");
  return value.trim();
}

function rejectUnknownKeys(value, allowed, name, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(name, `${field}.${key}`, "ist kein unterstütztes Feld.");
  }
}

function resolveProjectFile(rawPath, options) {
  const value = requireText(rawPath, options.name, options.field);
  if (path.isAbsolute(value) || value.includes("?") || value.includes("#") || value.split(/[\\/]+/).includes("..")) {
    fail(options.name, options.field, "muss ein relativer Projektpfad ohne Path-Traversal, Query oder Hash sein.");
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolute = path.resolve(options.repositoryRoot, normalized);
  const appRoot = path.join(options.repositoryRoot, "apps/vocabulary-trainer");
  const relativeToApp = path.relative(appRoot, absolute);
  if (!relativeToApp || relativeToApp.startsWith("..") || path.isAbsolute(relativeToApp)) {
    fail(options.name, options.field, "muss innerhalb von apps/vocabulary-trainer liegen.");
  }
  return { value: normalized, absolute };
}

export async function loadAndValidateDeploymentSet(deploymentPath, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  let raw;
  try {
    raw = JSON.parse(await readFile(deploymentPath, "utf8"));
  } catch (error) {
    throw new Error(`Deployment-Satz „${path.basename(deploymentPath)}" konnte nicht geladen werden: ${error.message}`);
  }
  return validateDeploymentSet(raw, { ...options, repositoryRoot, deploymentPath });
}

export async function validateDeploymentSet(raw, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const fallbackName = options.deploymentPath ? path.basename(options.deploymentPath) : "unbenannt";
  const root = requireObject(raw, fallbackName, "deployment");
  const name = typeof root.deploymentSetId === "string" && root.deploymentSetId.trim()
    ? root.deploymentSetId.trim()
    : fallbackName;
  rejectUnknownKeys(root, DEPLOYMENT_SET_KEYS.root, name, "deployment");
  if (root.schemaVersion !== DEPLOYMENT_SET_SCHEMA_VERSION) {
    fail(name, "schemaVersion", `muss ${DEPLOYMENT_SET_SCHEMA_VERSION} sein.`);
  }
  const deploymentSetId = requireText(root.deploymentSetId, name, "deploymentSetId");
  if (!IDENTIFIER_PATTERN.test(deploymentSetId)) {
    fail(name, "deploymentSetId", "darf nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten.");
  }
  const rawSite = requireObject(root.site, name, "site");
  rejectUnknownKeys(rawSite, DEPLOYMENT_SET_KEYS.site, name, "site");
  const site = Object.freeze({
    title: requireText(rawSite.title, name, "site.title"),
    language: requireText(rawSite.language, name, "site.language"),
    description: requireText(rawSite.description, name, "site.description"),
  });
  if (!LANGUAGE_PATTERN.test(site.language)) fail(name, "site.language", "ist kein unterstützter Sprachcode.");
  const rootProfileId = requireText(root.rootProfileId, name, "rootProfileId");
  if (!Array.isArray(root.entries) || root.entries.length === 0) {
    fail(name, "entries", "muss mindestens ein Veröffentlichungsprofil enthalten.");
  }

  const seenPaths = new Set();
  const seenMounts = new Set();
  const entries = [];
  for (const [index, rawEntry] of root.entries.entries()) {
    const field = `entries[${index}]`;
    const entry = requireObject(rawEntry, name, field);
    rejectUnknownKeys(entry, DEPLOYMENT_SET_KEYS.entry, name, field);
    const resolvedProfile = resolveProjectFile(entry.profile, {
      repositoryRoot,
      name,
      field: `${field}.profile`,
    });
    if (seenPaths.has(resolvedProfile.value)) fail(name, `${field}.profile`, "kommt mehrfach vor.");
    seenPaths.add(resolvedProfile.value);
    const mountPath = entry.mountPath === "" ? "" : requireText(entry.mountPath, name, `${field}.mountPath`);
    if (mountPath && (!MOUNT_PATTERN.test(mountPath) || mountPath.includes("..") || mountPath.includes("?") || mountPath.includes("#"))) {
      fail(name, `${field}.mountPath`, "muss ein sicherer relativer Mount-Pfad sein.");
    }
    if (seenMounts.has(mountPath)) fail(name, `${field}.mountPath`, "kommt mehrfach vor.");
    seenMounts.add(mountPath);
    try {
      const metadata = await stat(resolvedProfile.absolute);
      if (!metadata.isFile()) fail(name, `${field}.profile`, "muss eine Datei sein.");
    } catch (error) {
      if (error instanceof DeploymentSetError) throw error;
      fail(name, `${field}.profile`, "existiert nicht.");
    }
    let rawProfile;
    try {
      rawProfile = JSON.parse(await readFile(resolvedProfile.absolute, "utf8"));
    } catch (error) {
      fail(name, `${field}.profile`, `konnte nicht geladen werden (${error.message}).`);
    }
    let validated;
    try {
      validated = await validatePublicationProfile(rawProfile, {
        repositoryRoot,
        profilePath: resolvedProfile.absolute,
      });
    } catch (error) {
      fail(name, `${field}.profile`, error.message);
    }
    entries.push(Object.freeze({
      profilePath: resolvedProfile.value,
      profileFile: resolvedProfile.absolute,
      mountPath,
      ...validated,
    }));
  }
  const rootEntries = entries.filter((entry) => entry.mountPath === "");
  if (rootEntries.length !== 1) fail(name, "entries", "muss genau einen leeren Root-Mount enthalten.");
  if (rootEntries[0].profile.profileId !== rootProfileId) {
    fail(name, "rootProfileId", "muss das Profil am leeren Root-Mount bezeichnen.");
  }
  try {
    validateProfileIdentities(entries.map((entry) => entry.profile));
  } catch (error) {
    fail(name, "entries", error.message);
  }
  return Object.freeze({
    schemaVersion: DEPLOYMENT_SET_SCHEMA_VERSION,
    deploymentSetId,
    site,
    rootProfileId,
    entries: Object.freeze(entries),
    repositoryRoot,
    deploymentPath: path.resolve(options.deploymentPath ?? "deployment.json"),
  });
}
