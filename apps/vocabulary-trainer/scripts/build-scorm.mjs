#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildScormPackage } from "../build/scorm-package.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const profile = value("--profile");
if (!profile) {
  console.error("SCORM-Build fehlgeschlagen: --profile <profil.json> fehlt.");
  process.exitCode = 1;
} else {
  try {
    const result = await buildScormPackage(path.resolve(root, profile), {
      repositoryRoot: root,
      output: value("--output"),
      validateOnly: args.includes("--validate-only"),
    });
    if (result.validateOnly) console.log(`SCORM-Profil ist valide: ${result.validated.profile.packageId}`);
    else {
      console.log(`SCORM-1.2-Paket erfolgreich: ${result.outputFile}`);
      console.log(`Paket-Hash: ${result.packageHash}`);
      console.log(`${result.fileCount} Dateien, ${result.bytes} Bytes.`);
    }
  } catch (error) {
    console.error(`SCORM-Build fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  }
}

