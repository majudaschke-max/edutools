#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndValidateDeploymentSet } from "../build/deployment-set-validator.js";
import { validatePagesRelease } from "../build/release-validator.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const deploymentFile = path.join(repositoryRoot, "apps/vocabulary-trainer/deployments/github-pages.production.json");

try {
  const deployment = await loadAndValidateDeploymentSet(deploymentFile, { repositoryRoot });
  const result = await validatePagesRelease(path.join(repositoryRoot, "dist/pages"), deployment);
  console.log(`Pages-Release ist valide: ${result.files.length} Dateien.`);
} catch (error) {
  console.error(`Release-Validierung fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
