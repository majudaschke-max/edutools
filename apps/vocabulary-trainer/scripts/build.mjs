#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildVocabularyTrainer } from "../build/build-vocabulary-trainer.js";

function readProfileArgument(argv) {
  const index = argv.indexOf("--profile");
  if (index < 0 || !argv[index + 1]) {
    throw new Error("Aufruf: node apps/vocabulary-trainer/scripts/build.mjs --profile <profil.json>");
  }
  if (argv.includes("--all")) {
    throw new Error("--all ist in Sprint 2.2 bewusst nicht implementiert; Profile werden einzeln reproduzierbar gebaut.");
  }
  return argv[index + 1];
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");

try {
  const profileArgument = readProfileArgument(process.argv.slice(2));
  const profilePath = path.resolve(repositoryRoot, profileArgument);
  const result = await buildVocabularyTrainer(profilePath, { repositoryRoot });
  console.log(`Build „${result.profile.profileId}“ erfolgreich: ${result.outputDirectory}`);
} catch (error) {
  console.error(`Build fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}

