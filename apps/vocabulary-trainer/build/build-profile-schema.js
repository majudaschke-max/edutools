export const PUBLICATION_PROFILE_SCHEMA_VERSION = 1;
export const PUBLICATION_MODES = Object.freeze({
  AUTHOR: "author",
  LEARNER: "learner",
});

export const PUBLICATION_FEATURES = Object.freeze([
  "courseBuilder",
  "courseLibrary",
  "importExport",
  "bookCapture",
  "motivation",
  "pronunciation",
  "speedChallenge",
]);

export const AUTHOR_FEATURES = Object.freeze({
  motivation: true,
  pronunciation: true,
  speedChallenge: true,
  courseLibrary: true,
  courseBuilder: true,
  importExport: true,
  bookCapture: false,
});

export const LEARNER_MANAGEMENT_FEATURES = Object.freeze([
  "courseLibrary",
  "courseBuilder",
  "importExport",
]);

export const PROFILE_KEYS = Object.freeze({
  root: new Set(["schemaVersion", "profileId", "mode", "deploymentId", "app", "course", "courseCatalog", "features", "output"]),
  app: new Set(["title", "shortTitle", "description", "language", "defaultRoute"]),
  course: new Set(["file"]),
  courseCatalog: new Set(["entries"]),
  courseCatalogEntry: new Set(["publicationId", "file"]),
  features: new Set(PUBLICATION_FEATURES),
  output: new Set(["directory", "basePath"]),
});
