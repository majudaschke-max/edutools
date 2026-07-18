#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assemblePagesRelease } from "../build/release-pages.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const argv = process.argv.slice(2);
const deploymentIndex = argv.indexOf("--deployment");
const deployment = path.resolve(repositoryRoot, deploymentIndex >= 0 && argv[deploymentIndex + 1]
  ? argv[deploymentIndex + 1]
  : "apps/vocabulary-trainer/deployments/github-pages.production.json");

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, script)], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} schlug fehl.`))));
  });
}

try {
  if (!argv.includes("--verified")) {
    for (const prerequisite of ["test-all.mjs", "check-syntax.mjs", "validate-json.mjs", "roundtrip.mjs"]) {
      await run(prerequisite);
    }
  }
  const result = await assemblePagesRelease(deployment, { repositoryRoot });
  console.log(`Pages-Release „${result.deployment.deploymentSetId}" erfolgreich: ${result.outputDirectory}`);
  console.log(`Release-Hash: ${result.manifest.releaseHash}`);
} catch (error) {
  console.error(`Pages-Release fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
