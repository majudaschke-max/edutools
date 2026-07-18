import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { listFiles, readText } from "./build-utils.js";
import { validateBuiltVocabularyTrainer, validateStaticReferences } from "./build-vocabulary-trainer.js";

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} konnte nicht gelesen werden: ${error.message}`);
  }
}

async function assertManifestFileEntries(root, manifest, ignored = new Set()) {
  const paths = manifest.files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length || paths.join("\n") !== [...paths].sort().join("\n")) {
    throw new Error("Manifestdateien müssen eindeutig und sortiert sein.");
  }
  for (const entry of manifest.files) {
    if (ignored.has(entry.path)) continue;
    const absolute = path.join(root, entry.path);
    let content;
    try {
      const metadata = await stat(absolute);
      if (!metadata.isFile() || metadata.size !== entry.bytes) {
        throw new Error(`Dateigröße stimmt nicht: ${entry.path}`);
      }
      content = await readFile(absolute);
    } catch (error) {
      throw new Error(`Manifestdatei fehlt oder ist ungültig: ${entry.path} (${error.message})`);
    }
    const hash = createHash("sha256").update(content).digest("hex");
    if (hash !== entry.sha256) throw new Error(`SHA-256 stimmt nicht: ${entry.path}`);
  }
}

function mountFile(mountPath, file) {
  return mountPath ? `${mountPath}/${file}` : file;
}

export async function validatePagesRelease(releaseRoot, deployment) {
  const root = path.resolve(releaseRoot);
  const files = (await listFiles(root)).sort();
  for (const required of ["index.html", "404.html", ".nojekyll", "release-manifest.json"]) {
    if (!files.includes(required)) throw new Error(`Pages-Release: Pflichtdatei fehlt: ${required}`);
  }
  const forbiddenPath = files.find((file) => (
    /(^|\/)(?:tests?|fixtures?|examples?|exports?|downloads?)(\/|$)/i.test(file)
    || /(^|\/)(?:ocr|speech|speak)(\/|$)/i.test(file)
    || /(^|\/)author\/image-import(\/|$)/i.test(file)
    || /(?:speech-recognition|recognition-adapter|book-capture|heic|heif|tesseract|libheif)/i.test(file)
    || /(?:\.test\.|\.spec\.)/i.test(file)
  ));
  if (forbiddenPath) throw new Error(`Pages-Release enthält eine verbotene Datei: ${forbiddenPath}`);

  const releaseManifest = await readJson(path.join(root, "release-manifest.json"), "Release-Manifest");
  if (releaseManifest.schemaVersion !== 1 || releaseManifest.deploymentSetId !== deployment.deploymentSetId) {
    throw new Error("Release-Manifest gehört nicht zum validierten Deployment-Satz.");
  }
  const actualManifestFiles = files.filter((file) => file !== "release-manifest.json");
  const listedReleaseFiles = releaseManifest.files.map((entry) => entry.path);
  if (listedReleaseFiles.join("\n") !== actualManifestFiles.join("\n")) {
    throw new Error("Release-Manifest bildet den Dateibaum nicht vollständig ab.");
  }
  await assertManifestFileEntries(root, releaseManifest);
  const { releaseHash, ...releaseCore } = releaseManifest;
  const expectedReleaseHash = createHash("sha256").update(JSON.stringify(releaseCore)).digest("hex");
  if (releaseHash !== expectedReleaseHash) throw new Error("Release-Hash stimmt nicht.");

  const expectedProfiles = [...deployment.entries]
    .sort((left, right) => left.mountPath.localeCompare(right.mountPath));
  if (releaseManifest.profiles.length !== expectedProfiles.length) {
    throw new Error("Release-Manifest enthält eine unerwartete Profilanzahl.");
  }
  for (const [index, entry] of expectedProfiles.entries()) {
    const prefix = entry.mountPath ? path.join(root, entry.mountPath) : root;
    for (const required of ["index.html", "runtime/deployment-profile.json", "runtime/build-info.json", "build-manifest.json"]) {
      if (!files.includes(mountFile(entry.mountPath, required))) {
        throw new Error(`Pages-Release: Profil „${entry.profile.profileId}" fehlt ${required}.`);
      }
    }
    await validateBuiltVocabularyTrainer(prefix, entry.profile, entry.course);
    const buildManifest = await readJson(path.join(prefix, "build-manifest.json"), "Build-Manifest");
    await assertManifestFileEntries(prefix, buildManifest);
    const runtime = await readJson(path.join(prefix, "runtime/deployment-profile.json"), "Runtime-Profil");
    const buildInfo = await readJson(path.join(prefix, "runtime/build-info.json"), "Buildinformation");
    if (runtime.buildHash !== buildManifest.buildHash || buildInfo.buildHash !== buildManifest.buildHash) {
      throw new Error(`Pages-Release: Build-Hash von „${entry.profile.profileId}" ist inkonsistent.`);
    }
    const listedProfile = releaseManifest.profiles[index];
    for (const field of ["profileId", "deploymentId", "mode", "mountPath"]) {
      const expected = field === "mountPath" ? entry.mountPath : entry.profile[field];
      if (listedProfile[field] !== expected) throw new Error(`Release-Manifest: Profilfeld ${field} stimmt nicht.`);
    }
    if (listedProfile.courseId !== (entry.course?.id ?? null) || listedProfile.buildHash !== buildManifest.buildHash) {
      throw new Error("Release-Manifest: Kurs-ID oder Build-Hash stimmt nicht.");
    }
  }

  await validateStaticReferences(root, files);
  for (const file of files.filter((item) => /\.(?:html|css|js|json|svg)$/.test(item))) {
    const source = await readText(path.join(root, file));
    if (/file:\/\/|\/(?:Users|home)\//.test(source)) {
      throw new Error(`Pages-Release enthält einen lokalen Maschinenpfad: ${file}`);
    }
    if (/\b(?:127\.0\.0\.1|localhost)(?::\d+)?\b/i.test(source)) {
      throw new Error(`Pages-Release enthält eine Entwicklungs-URL: ${file}`);
    }
    const withoutStandardNamespaces = source
      .replaceAll("http://www.w3.org/2000/svg", "")
      .replaceAll("http://www.w3.org/2001/XMLSchema-instance", "")
      .replaceAll("http://www.imsproject.org/xsd/imscp_rootv1p1p2", "")
      .replaceAll("http://www.adlnet.org/xsd/adlcp_rootv1p2", "");
    const withoutAllowedAuthorLink = /(?:^|\/)views\/ai-import-view\.js$/u.test(file)
      ? withoutStandardNamespaces.replaceAll("https://chatgpt.com/", "")
      : withoutStandardNamespaces;
    if (/https?:\/\//i.test(withoutAllowedAuthorLink)) {
      throw new Error(`Pages-Release enthält eine unerlaubte externe URL: ${file}`);
    }
    if (/\b(?:SpeechRecognition|webkitSpeechRecognition|MediaRecorder|getUserMedia)\b|data-route-view=["']\/speak["']|\bSprechübung\b|\bBook Capture\b|Buchseite importieren|(?:allow|Permissions-Policy)[^\n]*(?:microphone|camera)/i.test(source)) {
      throw new Error(`Pages-Release enthält deaktivierten Capture- oder Speech-Code: ${file}`);
    }
  }

  for (const entry of deployment.entries) {
    const html = await readText(path.join(root, entry.mountPath, "index.html"));
    if (!html.includes(`lang="${entry.profile.app.language}"`)) throw new Error("Profilbezogene Dokumentsprache fehlt.");
    if (!html.includes(`<title>${entry.profile.app.title}</title>`)) throw new Error("Profilbezogener Titel fehlt.");
    if (!html.includes(`content="${entry.profile.app.description}"`)) throw new Error("Profilbezogene Description fehlt.");
    if (!html.includes('http-equiv="Content-Security-Policy"')) throw new Error("Content-Security-Policy fehlt.");
    if (!html.includes('name="referrer" content="no-referrer"')) throw new Error("Referrer-Policy fehlt.");
    if (/rel="canonical"/i.test(html)) throw new Error("Unbekannte Produktions-URL darf keinen Canonical-Link erzeugen.");
  }
  return Object.freeze({ files: Object.freeze(files), manifest: releaseManifest });
}
