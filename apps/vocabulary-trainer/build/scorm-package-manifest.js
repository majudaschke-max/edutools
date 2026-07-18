import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { listFiles } from "./build-utils.js";
import { APP_VERSION } from "../src/runtime/app-version.js";

export async function createScormPackageManifest(root, context) {
  const files = (await listFiles(root))
    .filter((file) => file !== "scorm-package-manifest.json")
    .sort();
  const entries = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    const [content, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
    entries.push({
      path: file,
      size: metadata.size,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  const core = {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    packageType: "scorm12",
    packageId: context.profile.packageId,
    profileId: context.learner.profile.profileId,
    deploymentId: context.learner.profile.deploymentId,
    courseId: context.learner.course.id,
    completionPolicy: context.profile.scorm.completionPolicy,
    buildHash: context.build.manifest.buildHash,
    files: entries,
  };
  return {
    ...core,
    packageHash: createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  };
}
