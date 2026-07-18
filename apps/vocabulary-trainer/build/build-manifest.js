import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { listFiles } from "./build-utils.js";
import { APP_VERSION } from "../src/runtime/app-version.js";

export async function createBuildManifest(buildRoot, profile, course = null) {
  const files = (await listFiles(buildRoot))
    .filter((file) => file !== "build-manifest.json")
    .sort();
  const entries = [];
  for (const file of files) {
    const absolute = path.join(buildRoot, file);
    const [content, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
    entries.push({
      path: file,
      bytes: metadata.size,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  const manifest = {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    appType: "vocabulary",
    profileId: profile.profileId,
    deploymentId: profile.deploymentId,
    mode: profile.mode,
    courseId: course?.id ?? null,
    courseContentVersion: course?.contentVersion ?? null,
    features: {
      motivation: profile.features.motivation,
      pronunciation: profile.features.pronunciation,
      speedChallenge: profile.features.speedChallenge,
    },
    files: entries,
  };
  const buildHash = createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
  return { ...manifest, buildHash };
}
