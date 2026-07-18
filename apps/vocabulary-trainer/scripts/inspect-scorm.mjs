#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateScormZip } from "../build/scorm-package-validator.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const index = args.indexOf("--file");
if (index < 0 || !args[index + 1]) {
  console.error("SCORM-Inspektion fehlgeschlagen: --file <paket.scorm.zip> fehlt.");
  process.exitCode = 1;
} else {
  try {
    const file = path.resolve(root, args[index + 1]);
    const result = await validateScormZip(file);
    console.log(`SCORM-1.2-Paket valide: ${file}`);
    console.log(`Paket-ID: ${result.manifest.packageId}`);
    console.log(`${result.entries.length} Dateien, ${result.bytes} Bytes.`);
    if (args.includes("--verbose")) result.entries.forEach((entry) => console.log(`${entry.size}\t${entry.path}`));
  } catch (error) {
    console.error(`SCORM-Inspektion fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  }
}

