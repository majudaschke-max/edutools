import path from "node:path";
import { readdir } from "node:fs/promises";

async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, child));
    else if (entry.isFile()) files.push(child.replace(/\\/g, "/"));
  }
  return files;
}

async function filesInDirectory(sourceRoot, directory) {
  return (await walkFiles(sourceRoot, directory));
}

function copyEntry(sourceRoot, relative) {
  return Object.freeze({
    source: path.join(sourceRoot, relative),
    destination: relative.replace(/\\/g, "/"),
  });
}

const LEARNER_VIEW_FILES = [
  "views/dashboard-view.js",
  "views/learning-scope-view.js",
  "views/learn-view.js",
  "views/marked-view.js",
  "views/progress-view.js",
  "views/quiz-view.js",
  "views/review-view.js",
  "views/session-view.js",
  "views/units-view.js",
  "views/view-elements.js",
  "views/writing-view.js",
];

const LEARNER_RUNTIME_FILES = [
  "runtime/app-version.js",
  "runtime/deployment-capabilities.js",
  "runtime/deployment-profile.js",
  "runtime/published-course.js",
];

function isDisabledBookCaptureFile(file) {
  return file.startsWith("ocr/") || file.startsWith("author/image-import/");
}

/** Positive profile plan. Disabled experimental capture code stays in source only. */
export async function createBuildFilePlan({ repositoryRoot, profile }) {
  const sourceRoot = path.join(repositoryRoot, "apps/vocabulary-trainer/src");
  let relativeFiles;
  if (profile.mode === "author") {
    relativeFiles = (await walkFiles(sourceRoot)).filter((file) => (
      !isDisabledBookCaptureFile(file)
    ));
  } else {
    relativeFiles = [
      "app.js",
      "dashboard.css",
      "icon.svg",
      "index.html",
      ...await filesInDirectory(sourceRoot, "core"),
      ...await filesInDirectory(sourceRoot, "delivery"),
      "languages/language-registry.js",
      ...await filesInDirectory(sourceRoot, "quiz"),
      ...await filesInDirectory(sourceRoot, "session"),
      ...await filesInDirectory(sourceRoot, "writing"),
      ...await filesInDirectory(sourceRoot, "styles").then((files) => (
        files.filter((file) => file !== "styles/authoring.css")
      )),
      "course-library/course-schema.js",
      "course-library/course-validator.js",
      "audio/pronunciation-config.js",
      ...LEARNER_VIEW_FILES,
      ...LEARNER_RUNTIME_FILES,
    ];
    if (profile.features.motivation) {
      relativeFiles.push(
        ...await filesInDirectory(sourceRoot, "motivation"),
        "components/level-up-notice.js",
      );
    }
    if (profile.features.pronunciation) {
      relativeFiles.push(
        ...await filesInDirectory(sourceRoot, "audio"),
        "components/pronunciation-button.js",
      );
    }
    if (profile.features.speedChallenge) {
      relativeFiles.push(
        ...await filesInDirectory(sourceRoot, "speed"),
        "views/speed-view.js",
      );
    }
  }

  const uniqueFiles = [...new Set(relativeFiles)].sort();
  const plan = uniqueFiles.map((file) => copyEntry(sourceRoot, file));
  for (const cssName of ["base.css", "brand-core.css", "components.css", "themes/vocabulary.css", "tokens.css"]) {
    plan.push(Object.freeze({
      source: path.join(repositoryRoot, "design-system/css", cssName),
      destination: `design-system/css/${cssName}`,
    }));
  }
  return Object.freeze(plan.sort((left, right) => (
    left.destination.localeCompare(right.destination)
  )));
}
