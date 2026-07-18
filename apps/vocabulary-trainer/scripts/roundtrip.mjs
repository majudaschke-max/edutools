#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyJsonCourseRoundtrip } from "../build/release-roundtrip.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const argv = process.argv.slice(2);
const courseIndex = argv.indexOf("--course");
const course = courseIndex >= 0 && argv[courseIndex + 1]
  ? path.resolve(repositoryRoot, argv[courseIndex + 1])
  : path.join(repositoryRoot, "apps/vocabulary-trainer/profiles/production/courses/release-roundtrip.production.json");

try {
  const result = await verifyJsonCourseRoundtrip(course, { repositoryRoot });
  console.log(`JSON-Roundtrip bestanden: ${result.filename}, ${result.unitCount} Units, ${result.wordCount} Wörter, Learner ${result.learnerBuildHash.slice(0, 16)}.`);
} catch (error) {
  console.error(`JSON-Roundtrip fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
