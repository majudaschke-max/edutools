#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndValidateDeploymentSet } from "../build/deployment-set-validator.js";
import { runReleaseSmokeTests } from "../build/release-smoke.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");

try {
  const deployment = await loadAndValidateDeploymentSet(
    path.join(repositoryRoot, "apps/vocabulary-trainer/deployments/github-pages.production.json"),
    { repositoryRoot },
  );
  const result = await runReleaseSmokeTests(path.join(repositoryRoot, "dist/pages"), deployment);
  console.log(`${result.checks.length} statische Smoke-Tests bestanden.`);
} catch (error) {
  console.error(`Smoke-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
