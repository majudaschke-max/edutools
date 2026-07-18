import path from "node:path";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { buildVocabularyTrainer, CONTENT_SECURITY_POLICY } from "./build-vocabulary-trainer.js";
import { loadAndValidateDeploymentSet } from "./deployment-set-validator.js";
import { createReleaseManifest } from "./release-manifest.js";
import { runReleaseSmokeTests } from "./release-smoke.js";
import { validatePagesRelease } from "./release-validator.js";
import { escapeHtml, pathExists, writeJson } from "./build-utils.js";

function errorPage(deployment) {
  const title = escapeHtml(deployment.site.title);
  return `<!doctype html>
<html lang="${escapeHtml(deployment.site.language)}" data-edutools-theme="vocabulary">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(CONTENT_SECURITY_POLICY)}">
    <meta name="referrer" content="no-referrer">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Seite nicht gefunden – ${title}">
    <title>Seite nicht gefunden – ${title}</title>
    <link rel="icon" href="icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="design-system/css/tokens.css">
    <link rel="stylesheet" href="design-system/css/brand-core.css">
    <link rel="stylesheet" href="design-system/css/themes/vocabulary.css">
    <link rel="stylesheet" href="design-system/css/base.css">
    <link rel="stylesheet" href="design-system/css/components.css">
    <link rel="stylesheet" href="dashboard.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Zum Hauptinhalt springen</a>
    <main id="main" class="dashboard-shell app-view">
      <section class="card empty-state" aria-labelledby="not-found-title">
        <p class="section-kicker">${title}</p>
        <h1 id="not-found-title" class="section-title">Seite nicht gefunden</h1>
        <p class="card__description">Die angeforderte Datei ist an dieser Adresse nicht vorhanden.</p>
        <p><a class="button button--primary" href="./index.html#/dashboard">Zum Vocabulary Trainer</a></p>
      </section>
    </main>
  </body>
</html>
`;
}

async function replaceAtomically(tempDirectory, outputDirectory) {
  const backup = `${outputDirectory}.backup-${process.pid}`;
  await rm(backup, { recursive: true, force: true });
  const hadPrevious = await pathExists(outputDirectory);
  try {
    if (hadPrevious) await rename(outputDirectory, backup);
    await rename(tempDirectory, outputDirectory);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (await pathExists(outputDirectory)) await rm(outputDirectory, { recursive: true, force: true });
    if (hadPrevious && await pathExists(backup)) await rename(backup, outputDirectory);
    throw error;
  }
}

export async function assemblePagesRelease(deploymentPath, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const deployment = await loadAndValidateDeploymentSet(deploymentPath, { repositoryRoot });
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(repositoryRoot, "dist/pages"));
  const distRoot = path.join(repositoryRoot, "dist");
  const relativeOutput = path.relative(distRoot, outputDirectory);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("Pages-Ausgabe muss innerhalb von dist/ liegen.");
  }
  const tempRoot = path.join(distRoot, `.tmp-pages-${process.pid}`);
  const siteRoot = path.join(tempRoot, "site");
  const buildRoot = path.join(tempRoot, "profile-builds");
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(buildRoot, { recursive: true });
  const builds = [];
  try {
    const orderedEntries = [...deployment.entries].sort((left, right) => left.mountPath.localeCompare(right.mountPath));
    for (const entry of orderedEntries) {
      const profileBuildRoot = path.join(buildRoot, entry.profile.profileId);
      const build = await buildVocabularyTrainer(entry.profileFile, {
        repositoryRoot,
        outputDirectory: profileBuildRoot,
      });
      const mountRoot = entry.mountPath ? path.join(siteRoot, entry.mountPath) : siteRoot;
      if (entry.mountPath && await pathExists(mountRoot)) {
        throw new Error(`Mount-Kollision: ${entry.mountPath}`);
      }
      await mkdir(path.dirname(mountRoot), { recursive: true });
      await cp(build.outputDirectory, mountRoot, { recursive: true, errorOnExist: true });
      builds.push({ ...build, mountPath: entry.mountPath });
    }
    await writeFile(path.join(siteRoot, "404.html"), errorPage(deployment), "utf8");
    await writeFile(path.join(siteRoot, ".nojekyll"), "", "utf8");
    const releaseManifest = await createReleaseManifest(siteRoot, deployment, builds);
    await writeJson(path.join(siteRoot, "release-manifest.json"), releaseManifest);
    const validation = await validatePagesRelease(siteRoot, deployment);
    const smoke = await runReleaseSmokeTests(siteRoot, deployment);
    await options.beforeReplace?.({ tempRoot, siteRoot, outputDirectory, deployment });
    await mkdir(path.dirname(outputDirectory), { recursive: true });
    await replaceAtomically(siteRoot, outputDirectory);
    await rm(tempRoot, { recursive: true, force: true });
    return Object.freeze({
      outputDirectory,
      deployment,
      builds: Object.freeze(builds),
      manifest: releaseManifest,
      validation,
      smoke,
    });
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function compareCourseJsonFiles(leftFile, rightFile) {
  const [left, right] = await Promise.all([
    readFile(leftFile, "utf8"),
    readFile(rightFile, "utf8"),
  ]);
  return JSON.stringify(JSON.parse(left)) === JSON.stringify(JSON.parse(right));
}
