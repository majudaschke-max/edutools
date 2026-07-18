#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startMoodleScormHarness } from "../build/moodle-scorm-harness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const packageFile = value("--package");
if (!packageFile) {
  console.error("Moodle-SCORM-Harness fehlgeschlagen: --package <paket.scorm.zip> fehlt.");
  process.exitCode = 1;
} else {
  let harness;
  try {
    const port = Number(value("--port", "4175"));
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port ist ungültig.");
    harness = await startMoodleScormHarness(path.resolve(root, packageFile), { port });
    console.log(`Moodle-naher SCORM-Test: ${harness.launchUrl}`);
    console.log("Äußere id-, scoid-, attempt- und display-Parameter bleiben ausschließlich beim simulierten LMS-Player.");
    const stop = async () => { await harness.close(); process.exit(0); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    await harness?.close?.();
    console.error(`Moodle-SCORM-Harness fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  }
}
