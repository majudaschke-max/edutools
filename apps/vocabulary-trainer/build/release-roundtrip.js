import path from "node:path";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";

import { buildVocabularyTrainer } from "./build-vocabulary-trainer.js";
import { writeJson } from "./build-utils.js";
import { createCourseLibraryService } from "../src/course-library/course-library-service.js";
import { createCourseLibraryState } from "../src/course-library/course-library-state.js";
import { COURSE_SOURCE_TYPES, rebuildCourseData } from "../src/course-library/course-schema.js";
import { parseJsonCourse, importJsonCourse } from "../src/import/json-course-importer.js";

const COURSE_KEYS = new Set([
  "schemaVersion", "id", "appType", "contentVersion", "sourceType", "editable",
  "title", "subtitle", "description", "schoolType", "gradeLevel", "createdAt",
  "updatedAt", "languages", "pronunciation", "archived", "units",
]);

function memoryLibraryStorage() {
  let snapshot = null;
  return {
    load() { return snapshot; },
    save(value) { snapshot = structuredClone(value); return true; },
  };
}

export function comparableCourse(course) {
  return {
    schemaVersion: course.schemaVersion,
    id: course.id,
    appType: course.appType,
    contentVersion: course.contentVersion,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    schoolType: course.schoolType,
    gradeLevel: course.gradeLevel,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    languages: course.languages,
    pronunciation: course.pronunciation,
    archived: course.archived,
    units: course.units,
  };
}

export async function verifyJsonCourseRoundtrip(courseFile, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const text = await readFile(courseFile, "utf8");
  const raw = JSON.parse(text);
  for (const key of Object.keys(raw)) {
    if (!COURSE_KEYS.has(key)) throw new Error(`Export enthält ein fachfremdes Feld: ${key}`);
  }
  if (/learning|motivation|localStorage|xp|streak/i.test(JSON.stringify(Object.keys(raw)))) {
    throw new Error("Export enthält Lern- oder Motivationszustand.");
  }
  const validated = parseJsonCourse(text);
  const anchor = rebuildCourseData({
    ...raw,
    id: "release-roundtrip-anchor",
    title: "Release Roundtrip Anchor",
  }, {
    sourceType: COURSE_SOURCE_TYPES.BUNDLED,
    editable: false,
  });
  const storage = memoryLibraryStorage();
  const service = createCourseLibraryService({
    builtInCourse: anchor,
    initialState: createCourseLibraryState(anchor.id, "2026-01-01T00:00:00.000Z"),
    storage,
    idGenerator: () => "not-used",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const reimported = importJsonCourse({ service, text, conflict: "new" });
  if (JSON.stringify(comparableCourse(validated)) !== JSON.stringify(comparableCourse(reimported))) {
    throw new Error("Export und Reimport unterscheiden sich fachlich.");
  }

  const tempRoot = path.join(repositoryRoot, "dist/.release-roundtrip");
  const copiedCourse = path.join(tempRoot, "exported-course.json");
  const profileFile = path.join(tempRoot, "roundtrip-learner.profile.json");
  const outputDirectory = path.join(tempRoot, "learner-build");
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  try {
    await copyFile(courseFile, copiedCourse);
    await writeJson(profileFile, {
      schemaVersion: 1,
      profileId: "release-roundtrip-learner",
      mode: "learner",
      deploymentId: "release-roundtrip-learner",
      app: {
        title: "Release Roundtrip Learner",
        shortTitle: "Roundtrip Learner",
        description: "Automatisierter JSON-Roundtrip-Nachweis",
        language: "de",
        defaultRoute: "#/dashboard",
      },
      course: { file: "./dist/.release-roundtrip/exported-course.json" },
      features: {
        motivation: true,
        pronunciation: true,
        speedChallenge: true,
        courseLibrary: false,
        courseBuilder: false,
        importExport: false,
      },
      output: { directory: "./dist/.release-roundtrip/learner-build", basePath: "./" },
    });
    const build = await buildVocabularyTrainer(profileFile, { repositoryRoot, outputDirectory });
    const builtCourse = JSON.parse(await readFile(path.join(outputDirectory, "data/course.json"), "utf8"));
    if (JSON.stringify(comparableCourse(validated)) !== JSON.stringify(comparableCourse(builtCourse))) {
      throw new Error("Learner-Build verändert die fachlichen Kursdaten.");
    }
    return Object.freeze({
      filename: path.basename(courseFile),
      bytes: Buffer.byteLength(text),
      courseId: validated.id,
      title: validated.title,
      unitCount: validated.units.length,
      wordCount: validated.units.flatMap((unit) => unit.words).length,
      languages: structuredClone(validated.languages),
      importedSourceType: reimported.sourceType,
      learnerBuildHash: build.manifest.buildHash,
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
