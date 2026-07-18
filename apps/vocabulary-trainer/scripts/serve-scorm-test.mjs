#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startScormHarness } from "../build/scorm-harness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const value = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const packageFile = value("--package");
if (!packageFile) {
  console.error("SCORM-Harness fehlgeschlagen: --package <paket.scorm.zip> fehlt.");
  process.exitCode = 1;
} else {
  let harness;
  try {
    const port = Number(value("--port", "4174"));
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port ist ungültig.");
    harness = await startScormHarness(path.resolve(root, packageFile), { port });
    console.log(`SCORM-Test-Harness: ${harness.address.url}`);
    console.log("Fehlende API: ?api=missing · Fehler: ?fail=initialize|set|commit|finish · Status: ?status=completed");
    const stop = async () => { await harness.close(); process.exit(0); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    await harness?.close?.();
    console.error(`SCORM-Harness fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  }
}

