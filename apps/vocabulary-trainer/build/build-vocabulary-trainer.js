import path from "node:path";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import { createBuildFilePlan } from "./build-file-plan.js";
import { createBuildManifest } from "./build-manifest.js";
import { APP_VERSION } from "../src/runtime/app-version.js";
import { validatePublicationProfile } from "./build-profile-validator.js";
import {
  cleanDirectory,
  copyPlannedFiles,
  escapeHtml,
  listFiles,
  pathExists,
  readText,
  removeBuildBlock,
  removeBuildMarkers,
  writeJson,
} from "./build-utils.js";

const BASE_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

export function createContentSecurityPolicy(mode = "learner") {
  // Product builds no longer ship Book Capture, OCR workers or HEIC blobs.
  // Keep the argument for the stable build API while applying the same least-
  // privilege policy to Author and Learner releases.
  void mode;
  return [
    BASE_CONTENT_SECURITY_POLICY[0],
    "script-src 'self'",
    BASE_CONTENT_SECURITY_POLICY[1],
    "img-src 'self'",
    ...BASE_CONTENT_SECURITY_POLICY.slice(2),
    "worker-src 'none'",
  ].join("; ");
}

export const CONTENT_SECURITY_POLICY = createContentSecurityPolicy("learner");
export const AUTHOR_CONTENT_SECURITY_POLICY = createContentSecurityPolicy("author");

function runtimeProfile(profile, course, buildHash = null, delivery = null) {
  const result = {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    profileId: profile.profileId,
    deploymentId: profile.deploymentId,
    mode: profile.mode,
    app: { ...profile.app },
    features: { ...profile.features },
  };
  if (buildHash) result.buildHash = buildHash;
  result.delivery = delivery
    ? { type: "scorm12", packageId: delivery.packageId, file: "./runtime/delivery-profile.json" }
    : { type: "standalone" };
  if (profile.mode === "learner") {
    const suffix = buildHash ? `?build=${buildHash.slice(0, 16)}` : "";
    result.course = { id: course.id, file: `./data/course.json${suffix}` };
  }
  return result;
}

function transformIndexHtml(source, profile) {
  const appName = profile.app.shortTitle.replace(/^EduTools\s*[–-]\s*/u, "");
  let html = source
    .replace(/<html\b[^>]*>/, `<html lang="${escapeHtml(profile.app.language)}" data-edutools-theme="vocabulary">`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(profile.app.description)}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(profile.app.title)}</title>`)
    .replace(/<span class="brand__name" data-app-title>[\s\S]*?<\/span>/, `<span class="brand__name" data-app-title>${escapeHtml(appName)}</span>`)
    .replaceAll("../../../design-system/css/", "design-system/css/");
  html = html.replace(
    /(<meta charset="utf-8">)/,
    `$1\n    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(createContentSecurityPolicy(profile.mode))}">\n    <meta name="referrer" content="no-referrer">`,
  );
  if (profile.mode !== "author") html = removeBuildBlock(html, "author");
  if (!profile.features.speedChallenge) html = removeBuildBlock(html, "speed");
  if (!profile.features.motivation) html = removeBuildBlock(html, "motivation");
  return removeBuildMarkers(html);
}

function addBuildHashToIndex(source, buildHash) {
  const shortHash = buildHash.slice(0, 16);
  return source
    .replace("<html ", `<html data-build-hash="${shortHash}" `)
    .replace(/\b(src|href)="([^"#]+)"/g, (match, attribute, reference) => {
      if (/^(?:[a-z]+:|\/)/i.test(reference)) return match;
      const clean = reference.split(/[?#]/)[0];
      return `${attribute}="${clean}?build=${shortHash}"`;
    });
}

function transformDashboardCss(source, profile) {
  if (profile.mode === "author") return source;
  return source.replace(/^@import url\("styles\/authoring\.css[^\n]+\n/m, "");
}

function transformAuthoringCss(source) {
  return source.replace(
    /\/\* --------------------------------------------------------------------------\n \* Author-only local image\/OCR import[\s\S]*$/u,
    "",
  );
}

function resolveAsset(fromFile, reference) {
  const clean = reference.split(/[?#]/)[0];
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
}

export async function validateStaticReferences(buildRoot, files) {
  const available = new Set(files);
  const missing = [];
  for (const file of files) {
    if (!/\.(?:html|css|js)$/.test(file)) continue;
    const source = await readText(path.join(buildRoot, file));
    const references = [];
    if (file.endsWith(".html")) {
      references.push(...[...source.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]));
    } else if (file.endsWith(".css")) {
      references.push(...[...source.matchAll(/@import\s+url\("([^"]+)"\)/g)].map((match) => match[1]));
    } else {
      references.push(...[...source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]));
    }
    const localReferences = references.filter((item) => {
      if (/^(?:[a-z]+:|\/|#)/i.test(item)) return false;
      return !file.endsWith(".js") || item.startsWith(".");
    });
    for (const reference of localReferences) {
      const resolved = resolveAsset(file, reference);
      if (!available.has(resolved)) missing.push(`${file} -> ${reference}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Build enthält nicht auflösbare statische Referenzen: ${missing.join(", ")}`);
  }
}

export async function validateBuiltVocabularyTrainer(buildRoot, profile, course = null) {
  const files = (await listFiles(buildRoot)).sort();
  for (const required of ["index.html", "runtime/deployment-profile.json", "build-manifest.json", ".nojekyll"]) {
    if (!files.includes(required)) throw new Error(`Builddatei fehlt: ${required}`);
  }
  if (files.some((file) => /(^|\/)tests?(\/|$)/i.test(file))) {
    throw new Error("Build darf keine Testdateien enthalten.");
  }
  const indexHtml = await readText(path.join(buildRoot, "index.html"));
  if (indexHtml.includes('href="/')) throw new Error("HTML enthält einen absoluten Domainwurzelpfad.");
  const forbiddenProductFiles = files.filter((file) => [
    /(^|\/)ocr(\/|$)/i,
    /(^|\/)author\/image-import(\/|$)/i,
    /(^|\/)(?:speech|speak)(\/|$)/i,
    /(?:speech-recognition|recognition-adapter|book-capture|heic|heif|tesseract|libheif)/i,
  ].some((pattern) => pattern.test(file)));
  if (forbiddenProductFiles.length > 0) {
    throw new Error(`Produkt-Build enthält deaktivierte Capture- oder Speech-Dateien: ${forbiddenProductFiles.join(", ")}`);
  }
  if (profile.mode === "learner") {
    const courseFiles = files.filter((file) => /^data\/.*\.json$/i.test(file));
    if (courseFiles.length !== 1 || courseFiles[0] !== "data/course.json") {
      throw new Error("Learner-Build muss genau data/course.json als Kursdatei enthalten.");
    }
    const forbidden = [
      "course-library/course-editor-controller.js",
      "course-library/course-library-service.js",
      "course-library/course-library-storage.js",
      "course-library/course-runtime.js",
      "ai-import/",
      "import/",
      "views/ai-import-view.js",
      "views/course-builder-view.js",
      "views/course-library-view.js",
      "styles/authoring.css",
      "runtime/authoring-entry.js",
    ];
    for (const name of forbidden) {
      if (files.some((file) => file === name || file.startsWith(name))) {
        throw new Error(`Learner-Build enthält verbotene Autorendatei: ${name}`);
      }
    }
    if (/href="#\/(?:courses|course-builder)/.test(indexHtml)) {
      throw new Error("Learner-Navigation enthält eine Autorenroute.");
    }
    const builtCourse = JSON.parse(await readText(path.join(buildRoot, "data/course.json")));
    if (builtCourse.id !== course.id) throw new Error("Kurs-ID im Learner-Build stimmt nicht überein.");
  } else {
    for (const required of [
      "course-library/course-runtime.js",
      "ai-import/ai-import-controller.js",
      "ai-import/ai-import-runtime.js",
      "views/course-builder-view.js",
      "views/course-library-view.js",
      "views/ai-import-view.js",
      "import/adapters/ai-content-adapter.js",
      "import/adapters/course-json-batch-adapter.js",
      "import/core/import-duplicate-key.js",
      "import/import-pipeline.js",
      "import/course-exporter.js",
      "import/json-course-importer.js",
      "import/import-template.js",
      "prompts/prompt-generator.js",
      "prompts/prompt-loader.js",
      "prompts/prompt-registry.js",
      "prompts/template-engine.js",
      "prompts/vocabulary/import-v1.txt",
      "styles/authoring.css",
      "scorm-export/scorm-browser-export.js",
      "scorm-export/scorm-package-validation.js",
      "scorm-template/build-manifest.json",
      "scorm-template/index.html",
      "scorm-template/data/course.json",
    ]) {
      if (!files.includes(required)) throw new Error(`Author-Builddatei fehlt: ${required}`);
    }
  }

  for (const file of files.filter((item) => /\.(?:html|css|js|json)$/.test(item))) {
    const content = await readText(path.join(buildRoot, file));
    if (/file:\/\/|\/(?:Users|home)\//.test(content)) {
      throw new Error(`Builddatei enthält einen lokalen absoluten Pfad: ${file}`);
    }
    if (/\b(?:SpeechRecognition|webkitSpeechRecognition|MediaRecorder|getUserMedia)\b|data-route-view=["']\/speak["']|\bSprechübung\b|\bBook Capture\b|Buchseite importieren|(?:allow|Permissions-Policy)[^\n]*(?:microphone|camera)/i.test(content)) {
      throw new Error(`Builddatei enthält deaktivierten Capture- oder Speech-Code: ${file}`);
    }
  }
  await validateStaticReferences(buildRoot, files);
  return { files };
}

async function replaceBuildAtomically(tempDirectory, outputDirectory) {
  const backupDirectory = `${outputDirectory}.backup-${process.pid}`;
  await rm(backupDirectory, { recursive: true, force: true });
  const hadPrevious = await pathExists(outputDirectory);
  try {
    if (hadPrevious) await rename(outputDirectory, backupDirectory);
    await rename(tempDirectory, outputDirectory);
    await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (await pathExists(outputDirectory)) await rm(outputDirectory, { recursive: true, force: true });
    if (hadPrevious && await pathExists(backupDirectory)) {
      await rename(backupDirectory, outputDirectory);
    }
    throw error;
  }
}

export async function buildVocabularyTrainer(profilePath, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  let rawProfile;
  try {
    rawProfile = JSON.parse(await readFile(profilePath, "utf8"));
  } catch (error) {
    throw new Error(`Profil „${path.basename(profilePath)}“ konnte nicht geladen werden: ${error.message}`);
  }
  const validated = await validatePublicationProfile(rawProfile, {
    repositoryRoot,
    profilePath,
  });
  const { profile, course, paths } = validated;
  const outputDirectory = options.outputDirectory
    ? path.resolve(options.outputDirectory)
    : paths.outputDirectory;
  const tempDirectory = path.join(
    path.dirname(outputDirectory),
    `.tmp-${path.basename(outputDirectory)}-${process.pid}`,
  );
  await mkdir(path.dirname(outputDirectory), { recursive: true });
  await cleanDirectory(tempDirectory);

  try {
    const plan = await createBuildFilePlan({ repositoryRoot, profile });
    await copyPlannedFiles(plan, tempDirectory);
    const indexPath = path.join(tempDirectory, "index.html");
    await writeFile(indexPath, transformIndexHtml(await readText(indexPath), profile), "utf8");
    const cssPath = path.join(tempDirectory, "dashboard.css");
    await writeFile(cssPath, transformDashboardCss(await readText(cssPath), profile), "utf8");
    if (profile.mode === "author") {
      const authoringCssPath = path.join(tempDirectory, "styles/authoring.css");
      await writeFile(
        authoringCssPath,
        transformAuthoringCss(await readText(authoringCssPath)),
        "utf8",
      );
    }
    if (profile.mode === "learner") {
      await writeJson(path.join(tempDirectory, "data/course.json"), course);
    }
    if (
      profile.mode === "author"
      && profile.features.importExport
      && options.embedScormTemplate !== false
    ) {
      await buildVocabularyTrainer(
        path.join(
          repositoryRoot,
          "apps/vocabulary-trainer/profiles/production/learner.production.json",
        ),
        {
          repositoryRoot,
          outputDirectory: path.join(tempDirectory, "scorm-template"),
          embedScormTemplate: false,
        },
      );
    }
    const runtimePath = path.join(tempDirectory, "runtime/deployment-profile.json");
    if (options.deliveryProfile) {
      await writeJson(path.join(tempDirectory, "runtime/delivery-profile.json"), options.deliveryProfile);
    }
    await writeJson(runtimePath, runtimeProfile(profile, course, null, options.deliveryProfile));
    await writeFile(path.join(tempDirectory, ".nojekyll"), "", "utf8");
    const preliminaryManifest = await createBuildManifest(tempDirectory, profile, course);
    const buildHash = preliminaryManifest.buildHash;
    await writeFile(indexPath, addBuildHashToIndex(await readText(indexPath), buildHash), "utf8");
    await writeJson(runtimePath, runtimeProfile(profile, course, buildHash, options.deliveryProfile));
    await writeJson(path.join(tempDirectory, "runtime/build-info.json"), {
      schemaVersion: 1,
      appVersion: APP_VERSION,
      profileId: profile.profileId,
      deploymentId: profile.deploymentId,
      buildHash,
    });
    const manifest = await createBuildManifest(tempDirectory, profile, course);
    manifest.buildHash = buildHash;
    await writeJson(path.join(tempDirectory, "build-manifest.json"), manifest);
    await validateBuiltVocabularyTrainer(tempDirectory, profile, course);
    await options.beforeReplace?.({ tempDirectory, outputDirectory, profile });
    await replaceBuildAtomically(tempDirectory, outputDirectory);
    return { outputDirectory, profile, courseId: course?.id ?? null, manifest };
  } catch (error) {
    await cleanDirectory(tempDirectory);
    throw error;
  }
}
