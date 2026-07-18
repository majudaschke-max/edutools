import path from "node:path";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";

import { buildVocabularyTrainer } from "./build-vocabulary-trainer.js";
import { listFiles, pathExists, writeJson } from "./build-utils.js";
import { createScorm12Manifest } from "./scorm-manifest.js";
import { createScormPackageManifest } from "./scorm-package-manifest.js";
import { validateScormPackageTree, validateScormZip } from "./scorm-package-validator.js";
import { loadAndValidateScormProfile, validatePrivateScormOutput } from "./scorm-profile-validator.js";
import { createStoredZip } from "./zip-store.js";

export async function findUnexpectedScormOutputDuplicates(outputFile) {
  const canonicalName = path.basename(outputFile);
  const canonicalLower = canonicalName.toLowerCase();
  const familyPrefix = canonicalLower.endsWith(".scorm.zip")
    ? canonicalLower.slice(0, -".scorm.zip".length)
    : canonicalLower.slice(0, -".zip".length);
  let entries;
  try {
    entries = await readdir(path.dirname(outputFile), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => {
      const name = entry.name.toLowerCase();
      return entry.isFile()
        && name !== canonicalLower
        && name.endsWith(".zip")
        && name.startsWith(familyPrefix);
    })
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function assertCanonicalScormOutputState(outputFile, options = {}) {
  const duplicates = await findUnexpectedScormOutputDuplicates(outputFile);
  if (duplicates.length) {
    throw new Error(
      `Unerwartete SCORM-ZIP-Dublette im Zielordner: ${duplicates.join(", ")}. `
      + `Erwartet wird ausschließlich ${path.basename(outputFile)}; die fremde Datei wurde nicht gelöscht.`,
    );
  }
  if (options.requireCanonical && !await pathExists(outputFile)) {
    throw new Error(`Die kanonische SCORM-ZIP fehlt nach dem Austausch: ${outputFile}`);
  }
}

async function replaceFileAtomically(tempFile, outputFile, options = {}) {
  const backup = options.backupFile;
  await rm(backup, { force: true });
  const hadPrevious = await pathExists(outputFile);
  try {
    if (hadPrevious) await rename(outputFile, backup);
    await rename(tempFile, outputFile);
    await options.afterReplace?.();
    await rm(backup, { force: true });
  } catch (error) {
    await rm(outputFile, { force: true });
    if (hadPrevious && await pathExists(backup)) await rename(backup, outputFile);
    throw error;
  }
}

export async function buildScormPackage(profilePath, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const validated = await loadAndValidateScormProfile(profilePath, { repositoryRoot });
  let outputFile = validated.paths.outputFile;
  if (options.output) {
    outputFile = validatePrivateScormOutput(options.output, {
      repositoryRoot,
      name: validated.profile.packageId,
      field: "--output",
    }).absolute;
  }
  if (options.validateOnly) return Object.freeze({ validated, outputFile, validateOnly: true });

  await assertCanonicalScormOutputState(outputFile);

  const workRoot = path.join(repositoryRoot, `dist/.tmp-scorm-${process.pid}`);
  const packageRoot = path.join(workRoot, "package");
  const tempZip = path.join(workRoot, `${path.basename(outputFile)}.candidate`);
  const backupZip = path.join(workRoot, `${path.basename(outputFile)}.backup`);
  await rm(workRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  try {
    const deliveryProfile = Object.freeze({
      schemaVersion: 1,
      deliveryType: "scorm12",
      packageId: validated.profile.packageId,
      completionPolicy: validated.profile.scorm.completionPolicy,
    });
    const build = await buildVocabularyTrainer(validated.paths.learnerProfileFile, {
      repositoryRoot,
      outputDirectory: packageRoot,
      deliveryProfile,
    });
    const context = Object.freeze({ ...validated, build });
    const preManifestFiles = await listFiles(packageRoot);
    const manifestFiles = [...preManifestFiles, "imsmanifest.xml", "scorm-package-manifest.json"].sort();
    await writeFile(path.join(packageRoot, "imsmanifest.xml"), createScorm12Manifest({
      packageId: validated.profile.packageId,
      title: validated.profile.scorm.title,
      organizationTitle: validated.profile.scorm.organizationTitle,
      files: manifestFiles,
    }), "utf8");
    await writeJson(
      path.join(packageRoot, "scorm-package-manifest.json"),
      await createScormPackageManifest(packageRoot, context),
    );
    const tree = await validateScormPackageTree(packageRoot, context);
    const entries = [];
    for (const file of tree.files) entries.push({ path: file, data: await readFile(path.join(packageRoot, file)) });
    const zip = createStoredZip(entries);
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(tempZip, zip);
    await validateScormZip(tempZip, context);
    await options.beforeReplace?.({ tempZip, outputFile, workRoot, context });
    let inspected;
    await replaceFileAtomically(tempZip, outputFile, {
      backupFile: backupZip,
      afterReplace: async () => {
        await assertCanonicalScormOutputState(outputFile, { requireCanonical: true });
        inspected = await validateScormZip(outputFile, context);
      },
    });
    await rm(workRoot, { recursive: true, force: true });
    return Object.freeze({
      outputFile,
      packageId: validated.profile.packageId,
      profileId: validated.learner.profile.profileId,
      deploymentId: validated.learner.profile.deploymentId,
      courseId: validated.learner.course.id,
      buildHash: build.manifest.buildHash,
      packageHash: tree.manifest.packageHash,
      fileCount: inspected.entries.length,
      bytes: inspected.bytes,
    });
  } catch (error) {
    await rm(tempZip, { force: true });
    await rm(workRoot, { recursive: true, force: true });
    throw error;
  }
}
