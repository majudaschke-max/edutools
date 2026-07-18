export const DEPLOYMENT_SET_SCHEMA_VERSION = 1;

export const DEPLOYMENT_SET_KEYS = Object.freeze({
  root: new Set(["schemaVersion", "deploymentSetId", "site", "rootProfileId", "entries"]),
  site: new Set(["title", "language", "description"]),
  entry: new Set(["profile", "mountPath"]),
});
