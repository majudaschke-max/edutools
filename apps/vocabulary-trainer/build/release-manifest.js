import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { listFiles } from "./build-utils.js";

async function fileEntries(releaseRoot) {
  const files = (await listFiles(releaseRoot))
    .filter((file) => file !== "release-manifest.json")
    .sort();
  const result = [];
  for (const file of files) {
    const absolute = path.join(releaseRoot, file);
    const [content, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
    result.push({
      path: file,
      bytes: metadata.size,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  return result;
}

export async function createReleaseManifest(releaseRoot, deployment, builds) {
  const profiles = builds.map((build) => ({
    profileId: build.profile.profileId,
    deploymentId: build.profile.deploymentId,
    mode: build.profile.mode,
    mountPath: build.mountPath,
    courseId: build.courseId,
    buildHash: build.manifest.buildHash,
  })).sort((left, right) => left.mountPath.localeCompare(right.mountPath));
  const files = await fileEntries(releaseRoot);
  const core = {
    schemaVersion: 1,
    deploymentSetId: deployment.deploymentSetId,
    site: { ...deployment.site },
    profiles,
    files,
  };
  return {
    ...core,
    releaseHash: createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  };
}

export function verifyHash(content, expected) {
  return createHash("sha256").update(content).digest("hex") === expected;
}
