#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndValidateDeploymentSet } from "../build/deployment-set-validator.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const argv = process.argv.slice(2);
const index = argv.indexOf("--deployment");
const file = path.resolve(repositoryRoot, index >= 0 && argv[index + 1]
  ? argv[index + 1]
  : "apps/vocabulary-trainer/deployments/github-pages.production.json");

try {
  const deployment = await loadAndValidateDeploymentSet(file, { repositoryRoot });
  console.log(`Deployment-Satz „${deployment.deploymentSetId}" mit ${deployment.entries.length} Profilen ist valide.`);
} catch (error) {
  console.error(`Deployment-Validierung fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
