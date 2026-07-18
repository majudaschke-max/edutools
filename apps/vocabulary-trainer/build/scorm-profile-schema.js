export const SCORM_PROFILE_SCHEMA_VERSION = 1;
export const SCORM_COMPLETION_POLICIES = Object.freeze(["none", "first-completed-session"]);
export const SCORM_PROFILE_KEYS = Object.freeze({
  root: new Set(["schemaVersion", "packageId", "learnerProfile", "distribution", "scorm", "output"]),
  scorm: new Set(["version", "title", "organizationTitle", "completionPolicy"]),
  output: new Set(["file"]),
});

