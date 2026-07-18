import { cloneCourse, COURSE_SOURCE_TYPES } from "../course-library/course-schema.js";
import { validateCourse } from "../course-library/course-validator.js";
import { APP_VERSION } from "../runtime/app-version.js";
import { createScorm12Manifest } from "./scorm-manifest.js";
import { validateScormPackageEntries } from "./scorm-package-validation.js";
import { createStoredZipBytes } from "./zip-store.js";

const REQUIRED_TEMPLATE_FILES = Object.freeze([
  "index.html",
  "app.js",
  "data/course.json",
  "runtime/app-version.js",
  "runtime/deployment-profile.json",
  "runtime/build-info.json",
]);
const FORBIDDEN_TEMPLATE_PATH = /(^|\/)(?:import|ocr|author|tests?|fixtures?)(\/|$)|(?:heic|heif|book-capture|speech-recognition|recognition-adapter)/iu;
const TEMPLATE_DEPLOYMENT_FILES = new Set([".nojekyll"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const SCORM_EXPORT_ERROR_CODES = Object.freeze({
  COURSE: "SCORM_COURSE_INVALID",
  TEMPLATE: "SCORM_TEMPLATE_LOAD_FAILED",
  GENERATION: "SCORM_PACKAGE_GENERATION_FAILED",
  VALIDATION: "SCORM_PACKAGE_VALIDATION_FAILED",
});

export class ScormExportError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "ScormExportError";
    this.code = code;
    this.details = options.details ?? "";
    this.issues = Object.freeze([...(options.issues ?? [])]);
    if (options.cause) this.cause = options.cause;
  }
}

function scormError(code, message, options = {}) {
  return new ScormExportError(code, message, options);
}

export function getScormExportUserMessage(error) {
  if (error?.code === SCORM_EXPORT_ERROR_CODES.COURSE) {
    if (error.issues?.some((issue) => /Lernpaket/u.test(issue))) {
      return "Der Kurs enthält keine freigegebenen Lernpakete.";
    }
    if (error.issues?.some((issue) => /Wort/u.test(issue))) {
      return "Die freigegebenen Lernpakete enthalten keine aktiven Wörter.";
    }
    return "Der Kurs ist noch nicht bereit für den SCORM-Export.";
  }
  if (error?.code === SCORM_EXPORT_ERROR_CODES.TEMPLATE) {
    return "Die SCORM-Vorlage konnte nicht geladen werden.";
  }
  if (error?.code === SCORM_EXPORT_ERROR_CODES.VALIDATION) {
    return "Das erzeugte SCORM-Paket ist unvollständig.";
  }
  return "Das SCORM-ZIP konnte nicht erstellt werden.";
}

function jsonBytes(value) {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function text(bytes) {
  return decoder.decode(bytes);
}

function slug(value) {
  return String(value).replaceAll("ß", "ss").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kurs";
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function technicalToken(value) {
  return `${slug(value).slice(0, 80)}-${stableHash(value)}`;
}

function requireCrypto(cryptoObject) {
  if (!cryptoObject?.subtle?.digest) {
    throw new Error("Der Browser kann die Prüfsummen für das Lernpaket nicht erzeugen.");
  }
  return cryptoObject;
}

async function sha256(input, cryptoObject) {
  const digest = await requireCrypto(cryptoObject).subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fileMetadata(entries, cryptoObject) {
  const result = [];
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    result.push({
      path: entry.path,
      size: entry.data.byteLength,
      sha256: await sha256(entry.data, cryptoObject),
    });
  }
  return result;
}

export function createScormExportIdentity(course) {
  const token = technicalToken(course?.id);
  return Object.freeze({
    packageId: `edutools-vocabulary-${token}`,
    profileId: `vocabulary-private-${token}`,
    deploymentId: `vocabulary-private-${token}`,
  });
}

export function createScormExportFilename(course) {
  return `edutools-vocabulary-${slug(course?.title)}-scorm.zip`;
}

export function createPublishedScormCourse(course) {
  const published = cloneCourse(course);
  published.archived = false;
  published.units = published.units
    .filter((unit) => unit.released && !unit.archived)
    .map((unit) => ({
      ...unit,
      archived: false,
      words: unit.words.filter((word) => !word.archived).map((word) => ({
        ...word,
        archived: false,
      })),
    }));
  if (!published.units.some((unit) => unit.current) && published.units[0]) {
    published.units[0].current = true;
  }
  return published;
}

export function validateScormExportCourse(course) {
  const validation = validateCourse(course);
  const errors = [...validation.errors];
  if (course?.sourceType === COURSE_SOURCE_TYPES.BUNDLED) {
    errors.push("Mitgelieferte Kurse müssen zuerst als eigener Kurs dupliziert werden.");
  }
  const releasedUnits = Array.isArray(course?.units)
    ? course.units.filter((unit) => unit.released && !unit.archived)
    : [];
  if (releasedUnits.length === 0) {
    errors.push("Gib mindestens ein nicht archiviertes Lernpaket für Lernende frei.");
  }
  if (releasedUnits.flatMap((unit) => unit.words.filter((word) => !word.archived)).length === 0) {
    errors.push("Gib mindestens ein nicht archiviertes Wort für Lernende frei.");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(validation.warnings),
  });
}

function validateTemplate(template) {
  if (!template?.manifest || !Array.isArray(template?.entries)) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage ist nicht verfügbar.", {
      details: "Manifest oder Dateieinträge der SCORM-Vorlage fehlen.",
    });
  }
  if (template.manifest.mode !== "learner" || !/^[a-f0-9]{64}$/u.test(template.manifest.buildHash ?? "")) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage besitzt kein gültiges Learner-Manifest.", {
      details: "mode oder buildHash des Vorlagenmanifests ist ungültig.",
    });
  }
  const entries = template.entries.filter((entry) => !TEMPLATE_DEPLOYMENT_FILES.has(entry.path));
  const paths = new Set(entries.map((entry) => entry.path));
  for (const required of REQUIRED_TEMPLATE_FILES) {
    if (!paths.has(required)) throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage ist unvollständig.", {
      details: `Pflichtdatei fehlt: ${required}`,
      issues: [`Der SCORM-Vorlage fehlt: ${required}`],
    });
  }
  const forbidden = [...paths].find((path) => FORBIDDEN_TEMPLATE_PATH.test(path));
  if (forbidden) throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage enthält eine unzulässige Datei.", {
    details: `Unzulässige Vorlagendatei: ${forbidden}`,
    issues: [`Die SCORM-Vorlage enthält eine unzulässige Datei: ${forbidden}`],
  });
  return Object.freeze({
    manifest: template.manifest,
    entries: Object.freeze(entries),
  });
}

/** Resolves the Author-relative template directory for local and Pages subpaths. */
export function resolveScormTemplateBaseUrl(options = {}) {
  const documentBase = options.document?.baseURI
    ?? globalThis.document?.baseURI
    ?? globalThis.location?.href;
  const configured = options.baseUrl ?? "./scorm-template/";
  try {
    const resolved = documentBase ? new URL(configured, documentBase) : new URL(configured);
    resolved.search = "";
    resolved.hash = "";
    if (!resolved.pathname.endsWith("/")) resolved.pathname = `${resolved.pathname}/`;
    return resolved;
  } catch (cause) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage kann nicht aufgelöst werden.", {
      cause,
      details: `Ungültige Vorlagenbasis: ${String(configured)}`,
    });
  }
}

async function fetchTemplateResource(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (cause) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage konnte nicht geladen werden.", {
      cause,
      details: `Netzwerkfehler beim Laden von ${url.href}`,
    });
  }
  if (!response?.ok) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage konnte nicht geladen werden.", {
      details: `${label}: HTTP ${response?.status ?? "unbekannt"} (${url.href})`,
      issues: [`${label} ist nicht erreichbar.`],
    });
  }
  return response;
}

/** Loads the checked Learner template that is physically embedded in Author builds. */
export async function loadScormTemplate(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw scormError(
    SCORM_EXPORT_ERROR_CODES.TEMPLATE,
    "Die SCORM-Vorlage kann nicht geladen werden.",
    { details: "Fetch API ist nicht verfügbar." },
  );
  const baseUrl = resolveScormTemplateBaseUrl(options);
  const manifestUrl = new URL("build-manifest.json", baseUrl);
  const manifestResponse = await fetchTemplateResource(fetchImpl, manifestUrl, "Vorlagenmanifest");
  let manifest;
  try {
    manifest = await manifestResponse.json();
  } catch (cause) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage besitzt kein lesbares Manifest.", {
      cause,
      details: `Ungültiges JSON: ${manifestUrl.href}`,
    });
  }
  if (!Array.isArray(manifest?.files)) throw scormError(
    SCORM_EXPORT_ERROR_CODES.TEMPLATE,
    "Die SCORM-Vorlage besitzt kein gültiges Dateimanifest.",
    { details: `files fehlt im Vorlagenmanifest: ${manifestUrl.href}` },
  );
  const declaredPaths = manifest.files.map((entry) => entry?.path);
  if (declaredPaths.some((path) => typeof path !== "string" || !path)) throw scormError(
    SCORM_EXPORT_ERROR_CODES.TEMPLATE,
    "Die SCORM-Vorlage besitzt ungültige Dateieinträge.",
    { details: `Ungültiger Dateipfad im Vorlagenmanifest: ${manifestUrl.href}` },
  );
  const paths = declaredPaths
    .filter((path) => !TEMPLATE_DEPLOYMENT_FILES.has(path));
  const entries = await Promise.all(paths.map(async (path) => {
    const fileUrl = new URL(path, baseUrl);
    const response = await fetchTemplateResource(fetchImpl, fileUrl, `Vorlagendatei ${path}`);
    try {
      return Object.freeze({ path, data: new Uint8Array(await response.arrayBuffer()) });
    } catch (cause) {
      throw scormError(SCORM_EXPORT_ERROR_CODES.TEMPLATE, "Die SCORM-Vorlage konnte nicht gelesen werden.", {
        cause,
        details: `Binärdaten konnten nicht gelesen werden: ${fileUrl.href}`,
      });
    }
  }));
  return validateTemplate({ manifest, entries });
}

/** Creates one complete SCORM 1.2 ZIP locally without server or external API. */
export async function createIndividualScormPackage(course, options = {}) {
  const validation = validateScormExportCourse(course);
  if (!validation.valid) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.COURSE, "Der Kurs kann noch nicht als SCORM-Lernpaket exportiert werden.", {
      details: validation.errors.join(" "),
      issues: validation.errors,
    });
  }
  const template = validateTemplate(
    options.template ?? await loadScormTemplate(options),
  );
  try {
  const cryptoObject = options.crypto ?? globalThis.crypto;
  const publishedCourse = createPublishedScormCourse(course);
  const identity = createScormExportIdentity(publishedCourse);
  const entryMap = new Map(template.entries.map((entry) => [
    entry.path,
    { path: entry.path, data: new Uint8Array(entry.data) },
  ]));

  const runtime = JSON.parse(text(entryMap.get("runtime/deployment-profile.json").data));
  runtime.profileId = identity.profileId;
  runtime.deploymentId = identity.deploymentId;
  runtime.app = {
    ...runtime.app,
    title: `EduTools – Vocabulary Trainer – ${publishedCourse.title}`,
    shortTitle: publishedCourse.title,
    description: publishedCourse.description || `Vocabulary Trainer für ${publishedCourse.title}`,
  };
  runtime.delivery = {
    type: "scorm12",
    packageId: identity.packageId,
    file: "./runtime/delivery-profile.json",
  };
  runtime.course = {
    id: publishedCourse.id,
    file: `./data/course.json?build=${template.manifest.buildHash.slice(0, 16)}`,
  };
  entryMap.set("runtime/deployment-profile.json", {
    path: "runtime/deployment-profile.json",
    data: jsonBytes(runtime),
  });
  entryMap.set("runtime/delivery-profile.json", {
    path: "runtime/delivery-profile.json",
    data: jsonBytes({
      schemaVersion: 1,
      appVersion: APP_VERSION,
      deliveryType: "scorm12",
      packageId: identity.packageId,
      completionPolicy: "first-completed-session",
    }),
  });
  entryMap.set("runtime/build-info.json", {
    path: "runtime/build-info.json",
    data: jsonBytes({
      schemaVersion: 1,
      appVersion: APP_VERSION,
      profileId: identity.profileId,
      deploymentId: identity.deploymentId,
      buildHash: template.manifest.buildHash,
    }),
  });
  entryMap.set("data/course.json", {
    path: "data/course.json",
    data: jsonBytes(publishedCourse),
  });
  entryMap.delete("build-manifest.json");

  const buildFiles = (await fileMetadata([...entryMap.values()], cryptoObject)).map((entry) => ({
    path: entry.path,
    bytes: entry.size,
    sha256: entry.sha256,
  }));
  const buildManifest = {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    appType: "vocabulary",
    profileId: identity.profileId,
    deploymentId: identity.deploymentId,
    mode: "learner",
    courseId: publishedCourse.id,
    courseContentVersion: publishedCourse.contentVersion,
    features: { ...template.manifest.features },
    files: buildFiles,
    buildHash: template.manifest.buildHash,
  };
  entryMap.set("build-manifest.json", {
    path: "build-manifest.json",
    data: jsonBytes(buildManifest),
  });

  const manifestFiles = [...entryMap.keys(), "imsmanifest.xml", "scorm-package-manifest.json"];
  entryMap.set("imsmanifest.xml", {
    path: "imsmanifest.xml",
    data: encoder.encode(createScorm12Manifest({
      packageId: identity.packageId,
      title: publishedCourse.title,
      organizationTitle: `EduTools – ${publishedCourse.title}`,
      files: manifestFiles,
    })),
  });

  const packageFiles = await fileMetadata([...entryMap.values()], cryptoObject);
  const packageCore = {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    packageType: "scorm12",
    packageId: identity.packageId,
    profileId: identity.profileId,
    deploymentId: identity.deploymentId,
    courseId: publishedCourse.id,
    completionPolicy: "first-completed-session",
    buildHash: template.manifest.buildHash,
    files: packageFiles,
  };
  const packageManifest = {
    ...packageCore,
    packageHash: await sha256(encoder.encode(JSON.stringify(packageCore)), cryptoObject),
  };
  entryMap.set("scorm-package-manifest.json", {
    path: "scorm-package-manifest.json",
    data: jsonBytes(packageManifest),
  });

  const entries = [...entryMap.values()].sort((left, right) => left.path.localeCompare(right.path));
  try {
    validateScormPackageEntries(entries);
  } catch (error) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.VALIDATION, "Das erzeugte SCORM-Paket ist unvollständig.", {
      cause: error,
      details: error.message,
      issues: [error.message],
    });
  }
  const zip = createStoredZipBytes(entries);
  return Object.freeze({
    filename: createScormExportFilename(publishedCourse),
    zip,
    bytes: zip.byteLength,
    fileCount: entries.length,
    course: publishedCourse,
    identity,
    packageManifest,
  });
  } catch (error) {
    if (error instanceof ScormExportError) throw error;
    throw scormError(SCORM_EXPORT_ERROR_CODES.GENERATION, "Das SCORM-ZIP konnte nicht erstellt werden.", {
      cause: error,
      details: error?.message ?? String(error),
    });
  }
}

export async function downloadIndividualScormPackage(course, options = {}) {
  const documentRoot = options.document ?? globalThis.document;
  const URLObject = options.URL ?? globalThis.URL;
  const BlobClass = options.Blob ?? globalThis.Blob;
  if (!documentRoot || !URLObject?.createObjectURL || !URLObject?.revokeObjectURL || !BlobClass) {
    throw scormError(SCORM_EXPORT_ERROR_CODES.GENERATION, "Das SCORM-ZIP konnte nicht erstellt werden.", {
      details: "Blob-Download wird von diesem Browser nicht vollständig unterstützt.",
    });
  }
  const result = await createIndividualScormPackage(course, options);
  const url = URLObject.createObjectURL(new BlobClass(
    [result.zip],
    { type: "application/zip" },
  ));
  try {
    const link = documentRoot.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.hidden = true;
    documentRoot.body.append(link);
    link.click();
    link.remove();
  } finally {
    URLObject.revokeObjectURL(url);
  }
  return result;
}
