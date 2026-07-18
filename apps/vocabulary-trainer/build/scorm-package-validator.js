import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { listFiles, readText } from "./build-utils.js";
import { validateStaticReferences } from "./build-vocabulary-trainer.js";
import { validateScormPackageEntries } from "../src/scorm-export/scorm-package-validation.js";
import { inspectStoredZip, inspectStoredZipFile } from "./zip-store.js";

const FORBIDDEN = [
  /(^|\/)(?:tests?|fixtures?|imports?|exports?|profiles?|deployments?)(\/|$)/i,
  /course-library\/(?!course-(?:schema|validator)\.js$)/i,
  /views\/(?:course-builder|course-library)-view\.js$/i,
  /styles\/authoring\.css$/i,
  /runtime\/authoring-entry\.js$/i,
  /(^|\/)ocr(\/|$)/i,
  /(^|\/)author\/image-import(\/|$)/i,
  /(^|\/)(?:speech|speak)(\/|$)/i,
  /(?:speech-recognition|recognition-adapter|book-capture|heic|heif|tesseract|libheif)/i,
  /(?:\.test\.|\.spec\.)/i,
  /(^|\/)(?:\.DS_Store|Thumbs\.db)$/i,
];

function assertSafeText(file, source) {
  if (/file:\/\/|\/(?:Users|home)\//.test(source)) throw new Error(`SCORM-Paket enthält einen lokalen Maschinenpfad: ${file}`);
  if (/\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(source)) throw new Error(`SCORM-Paket enthält eine Entwicklungs-URL: ${file}`);
  const withoutNamespaces = source
    .replaceAll("http://www.w3.org/2000/svg", "")
    .replaceAll("http://www.w3.org/2001/XMLSchema-instance", "")
    .replaceAll("http://www.imsproject.org/xsd/imscp_rootv1p1p2", "")
    .replaceAll("http://www.adlnet.org/xsd/adlcp_rootv1p2", "");
  if (/https?:\/\//i.test(withoutNamespaces)) throw new Error(`SCORM-Paket enthält eine externe URL: ${file}`);
  if (/\b(?:SpeechRecognition|webkitSpeechRecognition|MediaRecorder|getUserMedia)\b|data-route-view=["']\/speak["']|\bSprechübung\b|\bBook Capture\b|Buchseite importieren|(?:allow|Permissions-Policy)[^\n]*(?:microphone|camera)/i.test(source)) {
    throw new Error(`SCORM-Paket enthält deaktivierten Capture- oder Speech-Code: ${file}`);
  }
}

async function validatePackageManifest(root, manifest, physicalFiles) {
  if (manifest.schemaVersion !== 1 || manifest.packageType !== "scorm12") throw new Error("Technisches SCORM-Paketmanifest ist ungültig.");
  const listed = manifest.files.map((entry) => entry.path);
  const expected = physicalFiles.filter((file) => file !== "scorm-package-manifest.json").sort();
  if (listed.join("\n") !== expected.join("\n")) throw new Error("Technisches Paketmanifest bildet die Dateien nicht vollständig ab.");
  for (const entry of manifest.files) {
    const content = await readFile(path.join(root, entry.path));
    const metadata = await stat(path.join(root, entry.path));
    if (metadata.size !== entry.size || createHash("sha256").update(content).digest("hex") !== entry.sha256) {
      throw new Error(`Technischer Pakethash stimmt nicht: ${entry.path}`);
    }
  }
  const { packageHash, ...core } = manifest;
  if (createHash("sha256").update(JSON.stringify(core)).digest("hex") !== packageHash) throw new Error("SCORM-Pakethash stimmt nicht.");
}

export async function validateScormPackageTree(root, context) {
  const files = (await listFiles(root)).sort();
  for (const required of [
    "imsmanifest.xml", "index.html", "runtime/deployment-profile.json",
    "runtime/delivery-profile.json", "runtime/build-info.json", "build-manifest.json",
    "data/course.json", "scorm-package-manifest.json",
  ]) if (!files.includes(required)) throw new Error(`SCORM-Pflichtdatei fehlt: ${required}`);
  if (files.filter((file) => /^data\/.*\.json$/i.test(file)).join("\n") !== "data/course.json") throw new Error("SCORM-Paket muss genau einen Kurs enthalten.");
  const forbidden = files.find((file) => FORBIDDEN.some((pattern) => pattern.test(file)));
  if (forbidden) throw new Error(`SCORM-Paket enthält eine verbotene Datei: ${forbidden}`);
  const course = JSON.parse(await readFile(path.join(root, "data/course.json"), "utf8"));
  if (course.id !== context.learner.course.id) throw new Error("SCORM-Kurs-ID stimmt nicht.");
  const runtime = JSON.parse(await readFile(path.join(root, "runtime/deployment-profile.json"), "utf8"));
  const delivery = JSON.parse(await readFile(path.join(root, "runtime/delivery-profile.json"), "utf8"));
  if (runtime.mode !== "learner" || runtime.delivery?.type !== "scorm12" || runtime.deploymentId !== context.learner.profile.deploymentId) {
    throw new Error("SCORM-Runtimeprofil ist inkonsistent.");
  }
  if (delivery.packageId !== context.profile.packageId || delivery.completionPolicy !== context.profile.scorm.completionPolicy) {
    throw new Error("SCORM-Delivery-Profil ist inkonsistent.");
  }
  await validateStaticReferences(root, files);
  for (const file of files.filter((item) => /\.(?:html|css|js|json|xml|svg)$/.test(item))) {
    assertSafeText(file, await readText(path.join(root, file)));
  }
  validateScormPackageEntries(await Promise.all(files.map(async (file) => ({
    path: file,
    data: await readFile(path.join(root, file)),
  }))));
  const packageManifest = JSON.parse(await readFile(path.join(root, "scorm-package-manifest.json"), "utf8"));
  await validatePackageManifest(root, packageManifest, files);
  return Object.freeze({ files: Object.freeze(files), manifest: packageManifest });
}

export async function validateScormZip(file, context = null) {
  const zip = await inspectStoredZipFile(file);
  const paths = zip.entries.map((entry) => entry.path);
  if (!paths.includes("imsmanifest.xml") || !paths.includes("index.html")) throw new Error("SCORM-ZIP besitzt Manifest oder Startdatei nicht im Root.");
  if (paths.some((entry) => FORBIDDEN.some((pattern) => pattern.test(entry)))) throw new Error("SCORM-ZIP enthält verbotene Dateien.");
  const byPath = new Map(zip.entries.map((entry) => [entry.path, entry.data]));
  validateScormPackageEntries(zip.entries);
  const packageManifest = JSON.parse(byPath.get("scorm-package-manifest.json").toString("utf8"));
  const listed = packageManifest.files.map((entry) => entry.path);
  const expected = paths.filter((entry) => entry !== "scorm-package-manifest.json").sort();
  if (listed.join("\n") !== expected.join("\n")) throw new Error("ZIP-Paketmanifest ist unvollständig.");
  for (const entry of packageManifest.files) {
    const content = byPath.get(entry.path);
    if (!content || content.length !== entry.size || createHash("sha256").update(content).digest("hex") !== entry.sha256) {
      throw new Error(`ZIP-Pakethash stimmt nicht: ${entry.path}`);
    }
  }
  if (context && (packageManifest.packageId !== context.profile.packageId || packageManifest.deploymentId !== context.learner.profile.deploymentId)) {
    throw new Error("ZIP-Paketidentität stimmt nicht.");
  }
  return Object.freeze({ ...zip, manifest: packageManifest });
}

export function validateScormZipBuffer(buffer) {
  return inspectStoredZip(buffer);
}
